import { NextResponse } from 'next/server';
import { createInitialStagesState } from '@/lib/builds/stages';
import { getRepo2ApkWorkflowYaml, WORKFLOW_FILE_NAME, WORKFLOW_FILE_PATH } from '@/lib/builds/workflow-template';
import { decryptSecret, generateNonce } from '@/lib/crypto';
import { dbStore } from '@/lib/db';
import {
  dispatchWorkflow,
  fetchBranchLatestCommit,
  fetchRepoFileContent,
  setRepoActionSecret,
} from '@/lib/github/client';
import { getAuthorizedRepoToken } from '@/lib/github/oauth';
import { enforceBuildConcurrencyLimit, enforceRateLimit } from '@/lib/security/rate-limit';
import { getSession } from '@/lib/session';
import type { AndroidProjectAnalysis } from '@/lib/types';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const { id } = await context.params;
  const previous = await dbStore.getBuildJob(session.userId, id);
  if (!previous) {
    return NextResponse.json({ error: 'Build job not found' }, { status: 404 });
  }

  let useLatestCommit = false;
  try {
    const body = (await request.json()) as { useLatestCommit?: boolean };
    useLatestCommit = Boolean(body?.useLatestCommit);
  } catch {
    useLatestCommit = false;
  }

  const rl = await enforceRateLimit(session.userId, 'trigger_build', 10, 300);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'RATE_LIMIT_EXCEEDED' }, { status: 429 });
  }

  const conc = await enforceBuildConcurrencyLimit(session.userId);
  if (!conc.allowed) {
    return NextResponse.json({ error: 'CONCURRENCY_LIMIT_EXCEEDED' }, { status: 429 });
  }

  try {
    const token = await getAuthorizedRepoToken(session.userId, previous.installation_id);
    const [owner, repo] = previous.repo_full_name.split('/');

    const workflowFile = await fetchRepoFileContent(
      token,
      owner,
      repo,
      WORKFLOW_FILE_PATH,
      previous.branch
    );
    if (!workflowFile || workflowFile.content.trim() !== getRepo2ApkWorkflowYaml().trim()) {
      return NextResponse.json(
        {
          error: 'WORKFLOW_UPDATE_REQUIRED',
          repoFullName: previous.repo_full_name,
          installationId: previous.installation_id,
          branch: previous.branch,
        },
        { status: 409 }
      );
    }

    let commitSha = previous.commit_sha;
    if (useLatestCommit) {
      const latest = await fetchBranchLatestCommit(token, owner, repo, previous.branch);
      commitSha = latest.sha;
    }

    const projectRow = previous.project_id
      ? await dbStore.getProjectById(session.userId, previous.project_id).catch(() => null)
      : null;
    const analysis = (projectRow?.analysis_json as AndroidProjectAnalysis | null) || null;

    let useRepo2ApkSecrets = false;
    if (previous.build_type === 'release' && previous.signing_config_id) {
      const savedCfg = await dbStore.getSigningConfig(session.userId, previous.signing_config_id);
      if (savedCfg) {
        await Promise.all([
          setRepoActionSecret(
            token,
            owner,
            repo,
            'REPO2APK_KEYSTORE_BASE64',
            decryptSecret(savedCfg.encrypted_keystore_base64)
          ),
          setRepoActionSecret(
            token,
            owner,
            repo,
            'REPO2APK_STORE_PASSWORD',
            decryptSecret(savedCfg.encrypted_store_password)
          ),
          setRepoActionSecret(token, owner, repo, 'REPO2APK_KEY_ALIAS', savedCfg.key_alias),
          setRepoActionSecret(
            token,
            owner,
            repo,
            'REPO2APK_KEY_PASSWORD',
            decryptSecret(savedCfg.encrypted_key_password)
          ),
        ]);
        useRepo2ApkSecrets = true;
      }
    }

    const runNonce = generateNonce(10);
    const nowIso = new Date().toISOString();
    const newJob = await dbStore.createBuildJob({
      user_id: session.userId,
      project_id: previous.project_id,
      signing_config_id: previous.signing_config_id,
      run_nonce: runNonce,
      installation_id: previous.installation_id,
      repo_full_name: previous.repo_full_name,
      branch: previous.branch,
      commit_sha: commitSha,
      project_dir: previous.project_dir,
      framework: previous.framework,
      build_type: previous.build_type,
      build_variant: previous.build_variant,
      application_module: previous.application_module,
      abi_mode: previous.abi_mode,
      build_name: previous.build_name,
      build_number: previous.build_number,
      build_command: previous.build_command,
      status: 'queued',
      current_stage: 1,
      stages_state: createInitialStagesState(nowIso),
      is_unsigned: previous.is_unsigned,
      started_at: nowIso,
    });

    await dbStore.appendBuildLog(newJob.id, session.userId, {
      stage_index: 1,
      step_name: 'Retry Dispatch',
      level: 'info',
      content: `Retrying build on ${previous.repo_full_name}@${previous.branch} (${commitSha.slice(0, 7)})`,
    });

    await dispatchWorkflow(token, owner, repo, WORKFLOW_FILE_NAME, previous.branch, {
      build_id: runNonce,
      commit_sha: commitSha,
      project_dir: previous.project_dir,
      framework: previous.framework,
      build_mode: previous.build_type,
      application_module: previous.application_module || 'app',
      build_variant: previous.build_variant || previous.build_type,
      abi_mode: previous.abi_mode,
      build_name: previous.build_name || '',
      build_number: previous.build_number || '',
      java_version: analysis?.recommendedJdk || '17',
      flutter_version: analysis?.flutterVersion || 'stable',
      compile_sdk: analysis?.androidSdk?.compileSdk || '',
      use_repo2apk_secrets: useRepo2ApkSecrets ? 'true' : 'false',
    });

    return NextResponse.json({ build: newJob }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Retry failed' },
      { status: 500 }
    );
  }
}
