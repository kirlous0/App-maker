import { NextResponse } from 'next/server';
import { computeBuildCommand, sanitizeVersionValue } from '@/lib/android/command-builder';
import { analyzeAndroidProject } from '@/lib/android/detector';
import { classifyBuildFailure } from '@/lib/android/error-classifier';
import { createInitialStagesState } from '@/lib/builds/stages';
import { WORKFLOW_FILE_NAME, WORKFLOW_FILE_PATH } from '@/lib/builds/workflow-template';
import { decryptSecret, encryptSecret, generateNonce, sha256Hex } from '@/lib/crypto';
import { dbStore } from '@/lib/db';
import {
  checkActionsPermissions,
  deleteRepoActionSecret,
  dispatchWorkflow,
  fetchBranchLatestCommit,
  fetchRepoFileContent,
  fetchRepoTree,
  GitHubApiError,
  setRepoActionSecret,
  verifyRepoInInstallation,
} from '@/lib/github/client';
import { getAuthorizedRepoToken } from '@/lib/github/oauth';
import { enforceBuildConcurrencyLimit, enforceRateLimit } from '@/lib/security/rate-limit';
import { getSession } from '@/lib/session';
import type { BuildConfigInput } from '@/lib/types';

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const url = new URL(request.url);
  const status = url.searchParams.get('status') || 'all';
  const repo = url.searchParams.get('repo') || '';
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10) || 50));

  // Opportunistic timeout + cleanup enforcement
  const timeoutMinutes = parseInt(process.env.BUILD_TIMEOUT_MINUTES || '45', 10) || 45;
  await dbStore.cleanupExpiredArtifactsAndStaleBuilds(timeoutMinutes).catch(() => null);

  const [builds, stats] = await Promise.all([
    dbStore.listUserBuilds(session.userId, { status, repo, limit }),
    dbStore.getBuildStats(session.userId),
  ]);

  return NextResponse.json({ builds, stats });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  let body: BuildConfigInput;
  try {
    body = (await request.json()) as BuildConfigInput;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.repoFullName || !body.installationId || !body.branch) {
    return NextResponse.json(
      { error: 'repoFullName, installationId, and branch are required' },
      { status: 400 }
    );
  }

  // Rate limit: max 10 build triggers per 5 minutes
  const rl = await enforceRateLimit(session.userId, 'trigger_build', 10, 300);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'RATE_LIMIT_EXCEEDED', retryAfterSeconds: rl.retryAfterSeconds },
      { status: 429 }
    );
  }

  // Concurrency limit
  const conc = await enforceBuildConcurrencyLimit(session.userId);
  if (!conc.allowed) {
    return NextResponse.json(
      {
        error: 'CONCURRENCY_LIMIT_EXCEEDED',
        activeCount: conc.activeCount,
        maxConcurrent: conc.maxConcurrent,
      },
      { status: 429 }
    );
  }

  try {
    const token = await getAuthorizedRepoToken(session.userId, body.installationId);
    const repoMeta = await verifyRepoInInstallation(token, body.installationId, body.repoFullName);
    if (!repoMeta) {
      return NextResponse.json({ error: 'REPOSITORY_ACCESS_DENIED' }, { status: 403 });
    }

    const [owner, repo] = repoMeta.full_name.split('/');
    const actionsCheck = await checkActionsPermissions(token, owner, repo);
    if (!actionsCheck.enabled) {
      return NextResponse.json(
        { error: 'GITHUB_ACTIONS_DISABLED', message: 'GitHub Actions is disabled on this repository.' },
        { status: 400 }
      );
    }

    // Resolve commit SHA (use requested SHA if valid hex, otherwise fetch latest on branch)
    const latest = await fetchBranchLatestCommit(token, owner, repo, body.branch);
    const targetSha =
      body.commitSha && /^[0-9a-f]{7,40}$/i.test(body.commitSha) ? body.commitSha : latest.sha;

    const treeResp = await fetchRepoTree(token, owner, repo, targetSha);
    const treePaths = treeResp.tree.filter((t) => t.type === 'blob').map((t) => t.path);
    const fileCache = new Map<string, string | null>();
    const fetchFile = async (rel: string) => {
      if (fileCache.has(rel)) return fileCache.get(rel) ?? null;
      const res = await fetchRepoFileContent(token, owner, repo, rel, targetSha);
      const val = res?.content ?? null;
      fileCache.set(rel, val);
      return val;
    };

    const analysis = await analyzeAndroidProject({
      repoFullName: repoMeta.full_name,
      branch: body.branch,
      commitSha: targetSha,
      projectDir: body.projectDir || '.',
      treePaths,
      fetchFile,
    });

    if (!analysis.isAndroidProject || !analysis.isBuildable) {
      return NextResponse.json(
        {
          error: 'NOT_BUILDABLE_ANDROID_PROJECT',
          analysis,
        },
        { status: 400 }
      );
    }

    // Ensure workflow file exists on branch (never bypass explicit approval)
    const workflowExists = await fetchRepoFileContent(
      token,
      owner,
      repo,
      WORKFLOW_FILE_PATH,
      body.branch
    );
    if (!workflowExists) {
      return NextResponse.json(
        {
          error: 'WORKFLOW_NOT_INSTALLED',
          message: `Required workflow ${WORKFLOW_FILE_PATH} must be approved and installed before building.`,
        },
        { status: 409 }
      );
    }

    const buildType = body.buildType === 'release' ? 'release' : 'debug';
    const cmdInfo = computeBuildCommand({
      analysis,
      buildType,
      applicationModule: body.applicationModule,
      buildVariant: body.buildVariant,
      abiMode: body.abiMode,
      buildName: body.buildName,
      buildNumber: body.buildNumber,
    });

    // Resolve signing credentials if release
    let signingConfigId: string | null = null;
    let useRepo2ApkSecrets = false;
    let isUnsigned = false;

    if (buildType === 'release') {
      if (body.signingMode === 'user_keystore') {
        if (body.signingConfigId) {
          const savedCfg = await dbStore.getSigningConfig(session.userId, body.signingConfigId);
          if (!savedCfg) {
            return NextResponse.json({ error: 'SIGNING_CONFIG_NOT_FOUND' }, { status: 404 });
          }
          signingConfigId = savedCfg.id;
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
        } else if (body.ephemeralKeystore) {
          const ek = body.ephemeralKeystore;
          const cleanedB64 = ek.keystoreBase64.replace(/\s+/g, '');
          const decoded = Buffer.from(cleanedB64, 'base64');
          if (decoded.length < 32) {
            return NextResponse.json({ error: 'INVALID_KEYSTORE_FILE' }, { status: 400 });
          }
          if (ek.saveForFuture) {
            const saved = await dbStore.createSigningConfig({
              user_id: session.userId,
              label: ek.label?.trim() || `${repo} release keystore`,
              repo_full_name: repoMeta.full_name,
              key_alias: ek.keyAlias.trim(),
              encrypted_keystore_base64: encryptSecret(cleanedB64),
              encrypted_store_password: encryptSecret(ek.storePassword),
              encrypted_key_password: encryptSecret(ek.keyPassword),
              keystore_sha256: sha256Hex(decoded),
            });
            signingConfigId = saved.id;
          }
          await Promise.all([
            setRepoActionSecret(token, owner, repo, 'REPO2APK_KEYSTORE_BASE64', cleanedB64),
            setRepoActionSecret(token, owner, repo, 'REPO2APK_STORE_PASSWORD', ek.storePassword),
            setRepoActionSecret(token, owner, repo, 'REPO2APK_KEY_ALIAS', ek.keyAlias.trim()),
            setRepoActionSecret(token, owner, repo, 'REPO2APK_KEY_PASSWORD', ek.keyPassword),
          ]);
          useRepo2ApkSecrets = true;
        } else {
          return NextResponse.json({ error: 'MISSING_SIGNING_CREDENTIALS' }, { status: 400 });
        }
      } else if (body.signingMode === 'repo_existing' && analysis.existingSigning.hasReleaseSigningConfig) {
        isUnsigned = false;
      } else {
        isUnsigned = true;
      }
    }

    const projectRow = await dbStore.upsertProject({
      user_id: session.userId,
      repo_full_name: repoMeta.full_name,
      branch: body.branch,
      project_dir: analysis.projectDir,
      framework: analysis.framework,
      application_module: cmdInfo.normalizedModule,
      package_id: analysis.packageId,
      analysis_json: analysis,
      workflow_installed: true,
      last_analyzed_sha: targetSha,
    });

    const runNonce = generateNonce(10);
    const nowIso = new Date().toISOString();

    const job = await dbStore.createBuildJob({
      user_id: session.userId,
      project_id: projectRow.id,
      signing_config_id: signingConfigId,
      run_nonce: runNonce,
      installation_id: body.installationId,
      repo_full_name: repoMeta.full_name,
      branch: body.branch,
      commit_sha: targetSha,
      project_dir: analysis.projectDir,
      framework: analysis.framework,
      build_type: buildType,
      build_variant: cmdInfo.normalizedVariant,
      application_module: cmdInfo.normalizedModule,
      abi_mode: body.abiMode === 'split' ? 'split' : 'universal',
      build_name: sanitizeVersionValue(body.buildName),
      build_number: sanitizeVersionValue(body.buildNumber),
      build_command: cmdInfo.command,
      status: 'queued',
      current_stage: 1,
      stages_state: createInitialStagesState(nowIso),
      is_unsigned: isUnsigned,
      started_at: nowIso,
    });

    await dbStore.appendBuildLog(job.id, session.userId, {
      stage_index: 1,
      step_name: 'Repository Verification',
      level: 'info',
      content: `Verified ${repoMeta.full_name}@${body.branch} (${targetSha.slice(0, 7)}) — ${analysis.frameworkLabel}. Dispatching GitHub Actions runner...`,
    });

    try {
      await dispatchWorkflow(token, owner, repo, WORKFLOW_FILE_NAME, body.branch, {
        build_id: runNonce,
        commit_sha: targetSha,
        project_dir: analysis.projectDir,
        framework: analysis.framework,
        build_mode: buildType,
        application_module: cmdInfo.normalizedModule,
        build_variant: cmdInfo.normalizedVariant,
        abi_mode: body.abiMode === 'split' ? 'split' : 'universal',
        build_name: sanitizeVersionValue(body.buildName) || '',
        build_number: sanitizeVersionValue(body.buildNumber) || '',
        java_version: analysis.recommendedJdk || '17',
        flutter_version: analysis.flutterVersion || 'stable',
        use_repo2apk_secrets: useRepo2ApkSecrets ? 'true' : 'false',
      });
    } catch (dispatchErr) {
      if (useRepo2ApkSecrets) {
        await Promise.all([
          deleteRepoActionSecret(token, owner, repo, 'REPO2APK_KEYSTORE_BASE64'),
          deleteRepoActionSecret(token, owner, repo, 'REPO2APK_STORE_PASSWORD'),
          deleteRepoActionSecret(token, owner, repo, 'REPO2APK_KEY_ALIAS'),
          deleteRepoActionSecret(token, owner, repo, 'REPO2APK_KEY_PASSWORD'),
        ]);
      }

      const errMsg = dispatchErr instanceof Error ? dispatchErr.message : 'Workflow dispatch failed';
      const explicitCode =
        dispatchErr instanceof GitHubApiError && dispatchErr.status === 403
          ? 'ACTIONS_DISABLED'
          : undefined;
      const diag = classifyBuildFailure({
        logText: errMsg,
        framework: analysis.framework,
        explicitErrorCode: explicitCode,
      });

      await dbStore.appendBuildLog(job.id, session.userId, {
        stage_index: 1,
        step_name: 'Workflow Dispatch',
        level: 'error',
        content: errMsg,
      });

      const failedJob = await dbStore.updateBuildJob(job.id, {
        status: 'failed',
        completed_at: new Date().toISOString(),
        duration_ms: 0,
        error_code: diag.code,
        error_summary: diag.titleEn,
        error_details: JSON.stringify(diag),
      });

      return NextResponse.json({ error: diag.titleEn, build: failedJob }, { status: 502 });
    }

    return NextResponse.json({ build: job }, { status: 201 });
  } catch (err) {
    if (err instanceof GitHubApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to start build' },
      { status: 500 }
    );
  }
}
