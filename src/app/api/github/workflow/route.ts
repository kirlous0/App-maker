import { NextResponse } from 'next/server';
import { getRepo2ApkWorkflowYaml, WORKFLOW_FILE_PATH } from '@/lib/builds/workflow-template';
import { dbStore } from '@/lib/db';
import {
  fetchRepoFileContent,
  GitHubApiError,
  putRepoFileContent,
  verifyRepoInInstallation,
} from '@/lib/github/client';
import { getAuthorizedRepoToken } from '@/lib/github/oauth';
import { getSession } from '@/lib/session';

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const url = new URL(request.url);
  const repoFullName = url.searchParams.get('repo');
  const installationIdRaw = url.searchParams.get('installationId');
  const branch = url.searchParams.get('branch');

  if (!repoFullName || !installationIdRaw || !branch) {
    return NextResponse.json(
      { error: 'repo, installationId, and branch are required' },
      { status: 400 }
    );
  }

  try {
    const installationId = parseInt(installationIdRaw, 10);
    const token = await getAuthorizedRepoToken(session.userId, installationId);
    const repoMeta = await verifyRepoInInstallation(token, installationId, repoFullName);
    if (!repoMeta) {
      return NextResponse.json({ error: 'REPOSITORY_ACCESS_DENIED' }, { status: 403 });
    }

    const [owner, repo] = repoMeta.full_name.split('/');
    const existing = await fetchRepoFileContent(token, owner, repo, WORKFLOW_FILE_PATH, branch);
    const templateYaml = getRepo2ApkWorkflowYaml();

    return NextResponse.json({
      workflowPath: WORKFLOW_FILE_PATH,
      installed: Boolean(existing),
      upToDate: Boolean(existing && existing.content.trim() === templateYaml.trim()),
      existingSha: existing?.sha || null,
      templateYaml,
    });
  } catch (err) {
    if (err instanceof GitHubApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to inspect workflow' },
      { status: 500 }
    );
  }
}

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
    approved?: boolean;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (body.approved !== true) {
    return NextResponse.json(
      { error: 'Explicit user approval (approved: true) is required before modifying the repository.' },
      { status: 400 }
    );
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
    // Only touch WORKFLOW_FILE_PATH; never touch any other workflow files
    const existing = await fetchRepoFileContent(
      token,
      owner,
      repo,
      WORKFLOW_FILE_PATH,
      body.branch
    );
    const templateYaml = getRepo2ApkWorkflowYaml();

    const commit = await putRepoFileContent(token, owner, repo, WORKFLOW_FILE_PATH, {
      message: existing
        ? 'chore(ci): update Repo2APK Android build workflow'
        : 'chore(ci): add Repo2APK Android build workflow',
      content: templateYaml,
      branch: body.branch,
      sha: existing?.sha,
    });

    await dbStore.markProjectWorkflowInstalled(
      session.userId,
      repoMeta.full_name,
      body.branch,
      body.projectDir || '.'
    );

    return NextResponse.json({
      ok: true,
      workflowPath: WORKFLOW_FILE_PATH,
      commitSha: commit.commitSha,
    });
  } catch (err) {
    if (err instanceof GitHubApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to install workflow' },
      { status: 500 }
    );
  }
}
