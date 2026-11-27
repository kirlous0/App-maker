import { NextResponse } from 'next/server';
import { analyzeAndroidProject } from '@/lib/android/detector';
import { getRepo2ApkWorkflowYaml, WORKFLOW_FILE_PATH } from '@/lib/builds/workflow-template';
import { dbStore } from '@/lib/db';
import {
  fetchBranchLatestCommit,
  fetchRepoFileContent,
  fetchRepoTree,
  GitHubApiError,
  verifyRepoInInstallation,
} from '@/lib/github/client';
import { getAuthorizedRepoToken } from '@/lib/github/oauth';
import { getSession } from '@/lib/session';

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  let body: {
    repoFullName?: string;
    installationId?: number;
    branch?: string;
    projectDir?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.repoFullName || !body.installationId || !body.branch) {
    return NextResponse.json(
      { error: 'repoFullName, installationId, and branch are required' },
      { status: 400 }
    );
  }

  try {
    const token = await getAuthorizedRepoToken(session.userId, body.installationId);
    const repoMeta = await verifyRepoInInstallation(token, body.installationId, body.repoFullName);
    if (!repoMeta) {
      return NextResponse.json({ error: 'REPOSITORY_ACCESS_DENIED' }, { status: 403 });
    }

    const [owner, repo] = repoMeta.full_name.split('/');
    const latestCommit = await fetchBranchLatestCommit(token, owner, repo, body.branch);
    const treeResp = await fetchRepoTree(token, owner, repo, latestCommit.sha);
    const treePaths = treeResp.tree.filter((t) => t.type === 'blob').map((t) => t.path);

    const fileCache = new Map<string, string | null>();
    const fetchFile = async (relPath: string): Promise<string | null> => {
      if (fileCache.has(relPath)) return fileCache.get(relPath) ?? null;
      const res = await fetchRepoFileContent(token, owner, repo, relPath, latestCommit.sha);
      const val = res?.content ?? null;
      fileCache.set(relPath, val);
      return val;
    };

    const analysis = await analyzeAndroidProject({
      repoFullName: repoMeta.full_name,
      branch: body.branch,
      commitSha: latestCommit.sha,
      projectDir: body.projectDir || '.',
      treePaths,
      fetchFile,
    });

    const existingWorkflow = await fetchRepoFileContent(
      token,
      owner,
      repo,
      WORKFLOW_FILE_PATH,
      body.branch
    );
    const expectedWorkflowYaml = getRepo2ApkWorkflowYaml();
    const workflowInstalled = Boolean(existingWorkflow);
    const workflowUpToDate =
      Boolean(existingWorkflow) &&
      existingWorkflow!.content.trim() === expectedWorkflowYaml.trim();

    const savedProject = await dbStore.upsertProject({
      user_id: session.userId,
      repo_full_name: repoMeta.full_name,
      branch: body.branch,
      project_dir: analysis.projectDir,
      framework: analysis.framework,
      application_module: analysis.selectedModule,
      package_id: analysis.packageId,
      analysis_json: analysis,
      workflow_installed: workflowInstalled,
      last_analyzed_sha: latestCommit.sha,
    });

    return NextResponse.json({
      projectId: savedProject.id,
      latestCommit,
      analysis,
      workflowStatus: {
        installed: workflowInstalled,
        upToDate: workflowUpToDate,
        workflowPath: WORKFLOW_FILE_PATH,
        templateYaml: expectedWorkflowYaml,
        existingSha: existingWorkflow?.sha || null,
      },
    });
  } catch (err) {
    if (err instanceof GitHubApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : 'Project analysis failed';
    return NextResponse.json(
      { error: msg },
      { status: msg === 'REPOSITORY_ACCESS_DENIED' ? 403 : 500 }
    );
  }
}
