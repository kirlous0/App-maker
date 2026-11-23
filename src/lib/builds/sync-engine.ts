import { dbStore } from '@/lib/db';
import { extractApkFromGitHubArtifactZip, validateApkBuffer } from '@/lib/android/apk-validator';
import { classifyBuildFailure } from '@/lib/android/error-classifier';
import {
  deleteRepoActionSecret,
  downloadWorkflowArtifactZip,
  downloadWorkflowJobLogs,
  getWorkflowRun,
  listWorkflowRunArtifacts,
  listWorkflowRunJobs,
  listWorkflowRuns,
  type GitHubWorkflowJobApi,
} from '@/lib/github/client';
import { getAuthorizedRepoToken } from '@/lib/github/oauth';
import { WORKFLOW_FILE_NAME } from '@/lib/builds/workflow-template';
import { BUILD_STAGES, mapGitHubStepNameToStageIndex } from '@/lib/builds/stages';
import type { BuildArtifactRecord, BuildJobRecord, BuildLogRecord, BuildStageState } from '@/lib/types';

const EPHEMERAL_SECRETS = [
  'REPO2APK_KEYSTORE_BASE64',
  'REPO2APK_STORE_PASSWORD',
  'REPO2APK_KEY_ALIAS',
  'REPO2APK_KEY_PASSWORD',
];

function computeStagesFromJob(
  currentStages: BuildStageState[],
  job: GitHubWorkflowJobApi | null
): { stages: BuildStageState[]; currentStage: number } {
  const map = new Map<number, BuildStageState>();
  for (const def of BUILD_STAGES) {
    const prev = currentStages.find((s) => s.index === def.index);
    map.set(def.index, {
      index: def.index,
      key: def.key,
      status: prev?.status || (def.index === 1 ? 'completed' : 'pending'),
      startedAt: prev?.startedAt || null,
      completedAt: prev?.completedAt || null,
      message: prev?.message || null,
    });
  }

  let highestActive = 1;
  if (job?.steps) {
    for (const step of job.steps) {
      const stageIdx = mapGitHubStepNameToStageIndex(step.name);
      if (stageIdx < 1 || stageIdx > 7) continue;
      const st = map.get(stageIdx)!;
      if (step.status === 'in_progress') {
        st.status = 'running';
        st.startedAt = st.startedAt || step.started_at;
        st.message = step.name;
        highestActive = Math.max(highestActive, stageIdx);
      } else if (step.status === 'completed') {
        if (step.conclusion === 'failure' || step.conclusion === 'cancelled' || step.conclusion === 'timed_out') {
          st.status = 'failed';
          st.startedAt = st.startedAt || step.started_at;
          st.completedAt = step.completed_at;
          st.message = step.name;
          highestActive = Math.max(highestActive, stageIdx);
        } else if (step.conclusion === 'skipped') {
          if (st.status === 'pending') {
            st.status = 'skipped';
          }
        } else if (st.status !== 'failed') {
          st.status = 'completed';
          st.startedAt = st.startedAt || step.started_at;
          st.completedAt = step.completed_at;
          highestActive = Math.max(highestActive, stageIdx);
        }
      }
    }
  }

  return {
    stages: Array.from(map.values()).sort((a, b) => a.index - b.index),
    currentStage: highestActive,
  };
}

export function parseGitHubLogsToEntries(
  rawLogs: string
): Array<{ stage_index: number; step_name: string | null; level: 'info' | 'warn' | 'error' | 'debug'; content: string }> {
  const lines = rawLogs.split('\n');
  const entries: Array<{
    stage_index: number;
    step_name: string | null;
    level: 'info' | 'warn' | 'error' | 'debug';
    content: string;
  }> = [];

  let currentStage = 1;
  let currentStep: string | null = null;
  let chunk: string[] = [];

  const flush = () => {
    if (chunk.length === 0) return;
    const text = chunk.join('\n').trim();
    if (!text) {
      chunk = [];
      return;
    }
    const isErr = /\b(ERROR|FAILURE:|Exception|fatal:)/i.test(text);
    const isWarn = !isErr && /\b(WARN|WARNING)\b/i.test(text);
    entries.push({
      stage_index: currentStage,
      step_name: currentStep,
      level: isErr ? 'error' : isWarn ? 'warn' : 'info',
      content: text.slice(0, 12000),
    });
    chunk = [];
  };

  for (const line of lines) {
    const groupMatch = line.match(/##\[group\]Run\s+(.*)|##\[group\](.*)/);
    const isEchoedCommand = /\b(echo|printf)\s+["']?.*\[Stage\s*[1-9]\]/.test(line);
    const stageMatch = !isEchoedCommand ? line.match(/\[Stage\s*([1-9])\]\s*(.*)/) : null;
    if (stageMatch?.[1]) {
      flush();
      currentStage = parseInt(stageMatch[1], 10);
      currentStep = stageMatch[2]?.trim() || currentStep;
    } else if (groupMatch && (groupMatch[1] || groupMatch[2])) {
      const label = (groupMatch[1] || groupMatch[2]).trim();
      if (label.length < 120) {
        const mapped = mapGitHubStepNameToStageIndex(label, currentStage);
        if (mapped >= 1 && mapped <= 7 && mapped !== currentStage) {
          flush();
          currentStage = mapped;
        }
        currentStep = label;
      }
    }
    chunk.push(line);
    if (chunk.length >= 80) flush();
  }
  flush();
  return entries.slice(0, 120);
}

async function cleanupEphemeralSecrets(token: string, owner: string, repo: string) {
  await Promise.all(
    EPHEMERAL_SECRETS.map((name) => deleteRepoActionSecret(token, owner, repo, name))
  );
}

export async function syncBuildJobWithGitHub(
  userId: string,
  buildId: string
): Promise<{
  job: BuildJobRecord;
  logs: BuildLogRecord[];
  artifact: BuildArtifactRecord | null;
}> {
  const initial = await dbStore.getBuildJob(userId, buildId);
  if (!initial) {
    throw new Error('BUILD_NOT_FOUND');
  }
  let job: BuildJobRecord = initial;

  const existingArtifact = await dbStore.getBuildArtifactByJob(userId, job.id);
  if (['succeeded', 'failed', 'cancelled', 'timed_out'].includes(job.status)) {
    const logs = await dbStore.listBuildLogs(userId, job.id);
    return { job, logs, artifact: existingArtifact };
  }

  // If the artifact was already stored in an earlier sync, finalize status cleanly instead of re-uploading
  if (existingArtifact && ['validating', 'storing'].includes(job.status)) {
    const nowIso = new Date().toISOString();
    const finalizedStages = job.stages_state.map((st) =>
      st.index >= 7 ? { ...st, status: 'completed' as const, completedAt: st.completedAt || nowIso } : st
    );
    job = await dbStore.updateBuildJob(job.id, {
      status: 'succeeded',
      current_stage: 9,
      stages_state: finalizedStages,
      is_unsigned: !existingArtifact.is_signed,
      completed_at: job.completed_at || nowIso,
      duration_ms:
        job.duration_ms || Math.max(1000, Date.now() - new Date(job.started_at).getTime()),
    });
    const logs = await dbStore.listBuildLogs(userId, job.id);
    return { job, logs, artifact: existingArtifact };
  }

  // Timeout check (only applies while queued/running on GitHub Actions; never abort completed runs in post-build sync)
  const timeoutMinutes = parseInt(process.env.BUILD_TIMEOUT_MINUTES || '45', 10) || 45;
  if (
    ['queued', 'running'].includes(job.status) &&
    Date.now() - new Date(job.started_at).getTime() > timeoutMinutes * 60 * 1000
  ) {
    const nowIso = new Date().toISOString();
    job = await dbStore.updateBuildJob(job.id, {
      status: 'timed_out',
      completed_at: nowIso,
      duration_ms: Date.now() - new Date(job.started_at).getTime(),
      error_code: 'BUILD_TIMEOUT',
      error_summary: `Build exceeded ${timeoutMinutes} minutes timeout.`,
    });
    const logs = await dbStore.listBuildLogs(userId, job.id);
    return { job, logs, artifact: existingArtifact };
  }

  const [owner, repo] = job.repo_full_name.split('/');
  const token = await getAuthorizedRepoToken(userId, job.installation_id);

  // 1. Discover github_run_id via run_nonce correlation if not yet attached
  if (!job.github_run_id) {
    const runs = await listWorkflowRuns(token, owner, repo, WORKFLOW_FILE_NAME);
    const matched = runs.find(
      (r) => r.name.includes(job.run_nonce) || r.name.includes(`[${job.run_nonce}]`)
    );
    if (matched) {
      job = await dbStore.updateBuildJob(job.id, {
        github_run_id: matched.id,
        github_run_url: matched.html_url,
        status: matched.status === 'in_progress' ? 'running' : job.status,
      });
    } else {
      // Check if queued too long without spawning (> 3 minutes)
      const logs = await dbStore.listBuildLogs(userId, job.id);
      return { job, logs, artifact: existingArtifact };
    }
  }

  if (!job.github_run_id) {
    const logs = await dbStore.listBuildLogs(userId, job.id);
    return { job, logs, artifact: existingArtifact };
  }

  // 2. Fetch live run + jobs + step states
  const run = await getWorkflowRun(token, owner, repo, job.github_run_id);
  const jobs = await listWorkflowRunJobs(token, owner, repo, run.id);
  const primaryJob = jobs[0] || null;
  const { stages, currentStage } = computeStagesFromJob(job.stages_state, primaryJob);

  // While running, capture step progress summary into build_logs if needed
  if (run.status !== 'completed') {
    const stepLines = (primaryJob?.steps || []).map((s) => {
      const tag =
        s.status === 'completed'
          ? s.conclusion === 'success'
            ? 'DONE'
            : String(s.conclusion || 'DONE').toUpperCase()
          : s.status === 'in_progress'
          ? 'RUNNING'
          : 'PENDING';
      return `[${tag}] #${s.number} ${s.name}`;
    });
    if (stepLines.length > 0) {
      await dbStore.replaceBuildLogs(job.id, userId, [
        {
          stage_index: currentStage,
          step_name: primaryJob?.name || 'GitHub Actions',
          level: 'info',
          content: stepLines.join('\n'),
        },
      ]);
    }
    job = await dbStore.updateBuildJob(job.id, {
      status: run.status === 'in_progress' ? 'running' : 'queued',
      github_job_id: primaryJob?.id ?? job.github_job_id,
      github_run_url: run.html_url,
      current_stage: currentStage,
      stages_state: stages,
    });
    const logs = await dbStore.listBuildLogs(userId, job.id);
    return { job, logs, artifact: existingArtifact };
  }

  // 3. Run completed -> fetch full real job logs once (skip re-downloading if already in post-build validating/storing with logs)
  let fullLogText = '';
  const existingLogs = await dbStore.listBuildLogs(userId, job.id);
  const alreadyHasFullLogs = ['validating', 'storing'].includes(job.status) && existingLogs.length >= 3;
  if (primaryJob && !alreadyHasFullLogs) {
    const downloadedLogs = await downloadWorkflowJobLogs(token, owner, repo, primaryJob.id);
    if (downloadedLogs) {
      fullLogText = downloadedLogs;
      const entries = parseGitHubLogsToEntries(downloadedLogs);
      if (entries.length > 0) {
        await dbStore.replaceBuildLogs(job.id, userId, entries);
      }
    }
  } else if (existingLogs.length > 0) {
    fullLogText = existingLogs.map((l) => l.content).join('\n');
  }

  // Clean up any ephemeral secrets used for signing (non-fatal)
  await cleanupEphemeralSecrets(token, owner, repo).catch(() => null);

  const completedAt = run.updated_at || new Date().toISOString();
  const durationMs = Math.max(
    1000,
    new Date(completedAt).getTime() - new Date(run.run_started_at || job.started_at).getTime()
  );

  // Handle non-success conclusions
  if (run.conclusion !== 'success') {
    const diag = classifyBuildFailure({
      logText: fullLogText,
      framework: job.framework,
      explicitErrorCode:
        run.conclusion === 'timed_out' ? 'BUILD_TIMEOUT' : undefined,
    });

    const mappedStatus =
      run.conclusion === 'cancelled'
        ? 'cancelled'
        : run.conclusion === 'timed_out'
        ? 'timed_out'
        : 'failed';

    job = await dbStore.updateBuildJob(job.id, {
      status: mappedStatus,
      github_job_id: primaryJob?.id ?? job.github_job_id,
      github_run_url: run.html_url,
      current_stage: currentStage,
      stages_state: stages,
      completed_at: completedAt,
      duration_ms: durationMs,
      error_code: diag.code,
      error_summary: diag.titleEn,
      error_details: JSON.stringify(diag),
    });
    const logs = await dbStore.listBuildLogs(userId, job.id);
    return { job, logs, artifact: null };
  }

  // 4. GitHub Actions succeeded -> Download artifact, validate real APK, and store in Supabase Private Storage
  // Atomic claim prevents concurrent SSE/polling/webhook sync calls from racing on the 89 MB upload.
  const isStaleStoring =
    job.status === 'storing' && Date.now() - new Date(job.updated_at).getTime() > 90_000;
  const stage7 = stages.find((s) => s.index === 7);
  const stage8 = stages.find((s) => s.index === 8);
  const stage9 = stages.find((s) => s.index === 9);
  if (stage7) {
    stage7.status = 'completed';
    stage7.completedAt = stage7.completedAt || new Date().toISOString();
  }
  if (stage8) {
    stage8.status = 'running';
    stage8.startedAt = stage8.startedAt || new Date().toISOString();
  }

  const claimableStatuses: BuildJobRecord['status'][] = isStaleStoring
    ? ['queued', 'running', 'validating', 'storing']
    : ['queued', 'running', 'validating'];

  const claimed = await dbStore.claimBuildStatus(job.id, claimableStatuses, {
    status: 'storing',
    current_stage: 8,
    stages_state: stages,
  });

  if (!claimed) {
    // Another worker is currently storing the APK — wait briefly and return latest state without duplicating work.
    await new Promise((r) => setTimeout(r, 1500));
    const refreshedJob = (await dbStore.getBuildJob(userId, job.id)) || job;
    const refreshedArtifact = await dbStore.getBuildArtifactByJob(userId, job.id);
    const logs = await dbStore.listBuildLogs(userId, job.id);
    return { job: refreshedJob, logs, artifact: refreshedArtifact };
  }
  job = claimed;

  try {
    const artifacts = await listWorkflowRunArtifacts(token, owner, repo, run.id);
    const matchingArtifact =
      artifacts.find((a) => !a.expired && a.name.includes(job.run_nonce)) ||
      artifacts.find((a) => !a.expired);

    if (!matchingArtifact) {
      if (stage7) stage7.status = 'failed';
      if (stage8) stage8.status = 'failed';
      const diag = classifyBuildFailure({
        logText: fullLogText,
        framework: job.framework,
        explicitErrorCode: 'MISSING_APK_ARTIFACT',
      });
      job = await dbStore.updateBuildJob(job.id, {
        status: 'failed',
        current_stage: 7,
        stages_state: stages,
        completed_at: new Date().toISOString(),
        duration_ms: durationMs,
        error_code: diag.code,
        error_summary: diag.titleEn,
        error_details: JSON.stringify(diag),
      });
      const logs = await dbStore.listBuildLogs(userId, job.id);
      return { job, logs, artifact: null };
    }

    let zipBuffer: Buffer | null = await downloadWorkflowArtifactZip(
      token,
      owner,
      repo,
      matchingArtifact.id
    );
    const extracted = extractApkFromGitHubArtifactZip(zipBuffer);
    zipBuffer = null;

    if (!extracted) {
      if (stage8) stage8.status = 'failed';
      const diag = classifyBuildFailure({
        logText: fullLogText,
        framework: job.framework,
        explicitErrorCode: 'MISSING_APK_ARTIFACT',
      });
      job = await dbStore.updateBuildJob(job.id, {
        status: 'failed',
        current_stage: 8,
        stages_state: stages,
        completed_at: new Date().toISOString(),
        duration_ms: durationMs,
        error_code: diag.code,
        error_summary: 'Artifact archive did not contain a valid .apk binary.',
        error_details: JSON.stringify(diag),
      });
      const logs = await dbStore.listBuildLogs(userId, job.id);
      return { job, logs, artifact: null };
    }

    const validated = validateApkBuffer(
      extracted.apkBuffer,
      extracted.apkFileName,
      extracted.metadata,
      job.build_type === 'debug'
    );

    if (!validated.isValidApk) {
      if (stage7) stage7.status = 'failed';
      if (stage8) stage8.status = 'failed';
      job = await dbStore.updateBuildJob(job.id, {
        status: 'failed',
        current_stage: 7,
        stages_state: stages,
        completed_at: new Date().toISOString(),
        duration_ms: durationMs,
        error_code: 'INVALID_APK_ARTIFACT',
        error_summary: validated.validationErrors.join(' '),
      });
      const logs = await dbStore.listBuildLogs(userId, job.id);
      return { job, logs, artifact: null };
    }

    // Re-check if a concurrent sync request already completed artifact upload
    const concurrentArtifact = await dbStore.getBuildArtifactByJob(userId, job.id);
    if (concurrentArtifact) {
      const doneNow = new Date().toISOString();
      if (stage8) {
        stage8.status = 'completed';
        stage8.completedAt = doneNow;
      }
      if (stage9) {
        stage9.status = 'completed';
        stage9.startedAt = doneNow;
        stage9.completedAt = doneNow;
      }
      job = await dbStore.updateBuildJob(job.id, {
        status: 'succeeded',
        github_job_id: primaryJob?.id ?? job.github_job_id,
        github_run_url: run.html_url,
        current_stage: 9,
        stages_state: stages,
        is_unsigned: !concurrentArtifact.is_signed,
        completed_at: doneNow,
        duration_ms: durationMs,
        error_code: null,
        error_summary: null,
        error_details: null,
      });
      const logs = await dbStore.listBuildLogs(userId, job.id);
      return { job, logs, artifact: concurrentArtifact };
    }

    const uploaded = await dbStore.uploadApkBinary(
      userId,
      job.id,
      validated.fileName,
      extracted.apkBuffer
    );

    const user = await dbStore.getUserById(userId);
    const retentionDays =
      user?.artifact_retention_days || parseInt(process.env.ARTIFACT_RETENTION_DAYS || '7', 10) || 7;
    const expiresAt = new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000).toISOString();

    const savedArtifact = await dbStore.createBuildArtifact({
      build_job_id: job.id,
      user_id: userId,
      app_name: validated.appName || job.repo_full_name.split('/')[1],
      file_name: validated.fileName,
      storage_bucket: uploaded.storageBucket,
      storage_path: uploaded.storagePath,
      size_bytes: validated.sizeBytes,
      sha256: validated.sha256,
      package_id: validated.packageId,
      version_name: validated.versionName || job.build_name,
      version_code: validated.versionCode || job.build_number,
      is_signed: validated.isSigned,
      signing_status: validated.signingStatus,
      abi: validated.abi,
      expires_at: expiresAt,
    });

    const doneNow = new Date().toISOString();
    if (stage8) {
      stage8.status = 'completed';
      stage8.completedAt = doneNow;
    }
    if (stage9) {
      stage9.status = 'completed';
      stage9.startedAt = doneNow;
      stage9.completedAt = doneNow;
    }

    await dbStore.appendBuildLog(job.id, userId, {
      stage_index: 8,
      step_name: 'Artifact Storage',
      level: 'info',
      content: `Stored verified APK "${validated.fileName}" (${validated.sizeBytes} bytes, SHA-256: ${validated.sha256}) in private storage (${uploaded.storageBucket}).`,
    });

    job = await dbStore.updateBuildJob(job.id, {
      status: 'succeeded',
      github_job_id: primaryJob?.id ?? job.github_job_id,
      github_run_url: run.html_url,
      current_stage: 9,
      stages_state: stages,
      is_unsigned: !validated.isSigned,
      completed_at: doneNow,
      duration_ms: durationMs,
      error_code: null,
      error_summary: null,
      error_details: null,
    });

    const logs = await dbStore.listBuildLogs(userId, job.id);
    return { job, logs, artifact: savedArtifact };
  } catch (stageErr) {
    const errMsg = stageErr instanceof Error ? stageErr.message : String(stageErr);
    if (stage8) {
      stage8.status = 'failed';
      stage8.message = errMsg;
    }
    await dbStore
      .appendBuildLog(job.id, userId, {
        stage_index: 8,
        step_name: 'Artifact Validation & Storage',
        level: 'error',
        content: `Post-build APK storage failed: ${errMsg}`,
      })
      .catch(() => null);

    const diag = {
      code: 'ARTIFACT_STORAGE_ERROR',
      titleAr: 'فشل حفظ ملف APK بعد اكتمال البناء',
      titleEn: 'Failed to store APK artifact after build succeeded',
      explanationAr: `اكتمل البناء على GitHub Actions بنجاح، لكن تعذر تنزيل أو حفظ ملف APK في التخزين الخاص: ${errMsg}`,
      explanationEn: `GitHub Actions finished compiling the APK, but downloading or uploading the artifact to private storage failed: ${errMsg}`,
      suggestedFixAr: 'أعد محاولة مزامنة البناء أو ابدأ بناءً جديداً. إذا استمرت المشكلة فتأكد من إعدادات التخزين وصلاحية التطبيق.',
      suggestedFixEn: 'Retry syncing this build or trigger a fresh build. If the issue persists, check storage capacity and repository permissions.',
      matchedExcerpt: errMsg,
      retryable: true,
    };

    job = await dbStore.updateBuildJob(job.id, {
      status: 'failed',
      github_job_id: primaryJob?.id ?? job.github_job_id,
      github_run_url: run.html_url,
      current_stage: 8,
      stages_state: stages,
      completed_at: new Date().toISOString(),
      duration_ms: durationMs,
      error_code: 'ARTIFACT_STORAGE_ERROR',
      error_summary: errMsg,
      error_details: JSON.stringify(diag),
    });
    const logs = await dbStore.listBuildLogs(userId, job.id);
    return { job, logs, artifact: null };
  }
}

export async function recoverBuildArtifactFromGitHub(
  userId: string,
  buildId: string
): Promise<BuildArtifactRecord | null> {
  const job = await dbStore.getBuildJob(userId, buildId);
  if (!job || !job.github_run_id) return null;

  await dbStore.softDeleteBuildArtifactsForJob(userId, job.id).catch(() => null);

  // Re-open job briefly in validating state and re-run sync cleanly from GitHub Actions artifact
  await dbStore.updateBuildJob(job.id, {
    status: 'validating',
    current_stage: 7,
    error_code: null,
    error_summary: null,
    error_details: null,
  });

  const synced = await syncBuildJobWithGitHub(userId, job.id);
  return synced.artifact;
}
