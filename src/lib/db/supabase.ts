import crypto from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  BuildArtifactRecord,
  BuildJobRecord,
  BuildLogRecord,
  BuildStats,
  GitHubInstallationRecord,
  RepositoryRecord,
  SigningConfigRecord,
  SigningConfigSummary,
  UserProfile,
} from '@/lib/types';

export const APK_BUCKET = 'apk-artifacts';
export const APK_CHUNKED_BUCKET = 'apk-artifacts-chunked';
// Supabase Free Tier enforces a 50 MB (52,428,800 byte) per-object upload limit.
// Any APK larger than 15 MB is transparently split into <= 15 MB private chunks
// for fast, reliable uploads and resilient client/proxy downloads.
export const SUPABASE_CHUNK_BYTES = 15 * 1024 * 1024;

export interface ChunkedApkManifest {
  fileName: string;
  totalBytes: number;
  chunkPaths: string[];
  chunkSizes?: number[];
}

async function uploadStorageObjectWithRetry(
  db: SupabaseClient,
  path: string,
  payload: Buffer,
  contentType: string,
  maxAttempts = 3
): Promise<void> {
  let lastMsg = 'Unknown upload error';
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const { error } = await db.storage.from(APK_BUCKET).upload(path, payload, {
        contentType,
        upsert: true,
      });
      if (!error) return;
      lastMsg = error.message;
    } catch (err) {
      lastMsg = err instanceof Error ? err.message : String(err);
    }
    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, attempt * 800));
    }
  }
  throw new Error(lastMsg);
}

async function listFolderObjectSizes(
  db: SupabaseClient,
  folderPrefix: string
): Promise<Map<string, number | null>> {
  const map = new Map<string, number | null>();
  const { data, error } = await db.storage.from(APK_BUCKET).list(folderPrefix, { limit: 500 });
  if (error || !data) return map;
  for (const item of data) {
    if (item.name) {
      const sizeVal =
        typeof (item.metadata as { size?: unknown } | null)?.size === 'number'
          ? (item.metadata as { size: number }).size
          : null;
      map.set(`${folderPrefix}/${item.name}`, sizeVal);
    }
  }
  return map;
}

let cachedAdminClient: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (cachedAdminClient) return cachedAdminClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error('Supabase URL and SUPABASE_SERVICE_ROLE_KEY must be configured.');
  }
  cachedAdminClient = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  return cachedAdminClient;
}

export async function checkSupabaseConnectivity(): Promise<{ ok: boolean; error?: string }> {
  try {
    const db = getSupabaseAdmin();
    const { error } = await db.from('users').select('id').limit(1);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

export const supabaseStore = {
  async upsertUserByGitHub(input: {
    github_user_id: number;
    github_login: string;
    name: string | null;
    email: string | null;
    avatar_url: string | null;
  }): Promise<UserProfile> {
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from('users')
      .upsert(
        {
          github_user_id: input.github_user_id,
          github_login: input.github_login,
          name: input.name,
          email: input.email,
          avatar_url: input.avatar_url,
        },
        { onConflict: 'github_user_id' }
      )
      .select('*')
      .single();
    if (error || !data) throw new Error(error?.message || 'Failed to upsert user');
    return data as UserProfile;
  },

  async getUserById(userId: string): Promise<UserProfile | null> {
    const db = getSupabaseAdmin();
    const { data, error } = await db.from('users').select('*').eq('id', userId).maybeSingle();
    if (error) throw new Error(error.message);
    return (data as UserProfile) || null;
  },

  async updateUserPreferences(
    userId: string,
    patch: Partial<Pick<UserProfile, 'preferred_language' | 'default_build_type' | 'artifact_retention_days'>>
  ): Promise<UserProfile> {
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from('users')
      .update(patch)
      .eq('id', userId)
      .select('*')
      .single();
    if (error || !data) throw new Error(error?.message || 'Failed to update preferences');
    return data as UserProfile;
  },

  async upsertGitHubInstallation(input: {
    user_id: string;
    installation_id: number;
    account_login: string;
    account_type: string;
    repository_selection: string;
    permissions: Record<string, string>;
    encrypted_user_access_token: string | null;
    encrypted_user_refresh_token: string | null;
    token_expires_at: string | null;
  }): Promise<GitHubInstallationRecord> {
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from('github_installations')
      .upsert(
        {
          ...input,
          disconnected_at: null,
          suspended_at: null,
        },
        { onConflict: 'user_id,installation_id' }
      )
      .select('*')
      .single();
    if (error || !data) throw new Error(error?.message || 'Failed to save GitHub installation');
    return data as GitHubInstallationRecord;
  },

  async getActiveInstallations(userId: string): Promise<GitHubInstallationRecord[]> {
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from('github_installations')
      .select('*')
      .eq('user_id', userId)
      .is('disconnected_at', null)
      .order('updated_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data as GitHubInstallationRecord[]) || [];
  },

  async getInstallationByNumericId(
    userId: string,
    installationId: number
  ): Promise<GitHubInstallationRecord | null> {
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from('github_installations')
      .select('*')
      .eq('user_id', userId)
      .eq('installation_id', installationId)
      .is('disconnected_at', null)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as GitHubInstallationRecord) || null;
  },

  async updateInstallationTokens(
    id: string,
    patch: {
      encrypted_user_access_token: string | null;
      encrypted_user_refresh_token: string | null;
      token_expires_at: string | null;
    }
  ): Promise<void> {
    const db = getSupabaseAdmin();
    const { error } = await db.from('github_installations').update(patch).eq('id', id);
    if (error) throw new Error(error.message);
  },

  async disconnectUserGitHub(userId: string): Promise<void> {
    const db = getSupabaseAdmin();
    const now = new Date().toISOString();
    const { error } = await db
      .from('github_installations')
      .update({
        encrypted_user_access_token: null,
        encrypted_user_refresh_token: null,
        token_expires_at: null,
        disconnected_at: now,
      })
      .eq('user_id', userId);
    if (error) throw new Error(error.message);

    await db.from('repositories').delete().eq('user_id', userId);
  },

  async suspendInstallationByNumericId(installationId: number, suspendedAt: string | null): Promise<void> {
    const db = getSupabaseAdmin();
    await db
      .from('github_installations')
      .update({ suspended_at: suspendedAt })
      .eq('installation_id', installationId);
  },

  async replaceUserRepositories(
    userId: string,
    repos: Array<Omit<RepositoryRecord, 'id' | 'synced_at'>>
  ): Promise<RepositoryRecord[]> {
    const db = getSupabaseAdmin();
    await db.from('repositories').delete().eq('user_id', userId);
    if (repos.length === 0) return [];
    const { data, error } = await db.from('repositories').insert(repos).select('*');
    if (error) throw new Error(error.message);
    return (data as RepositoryRecord[]) || [];
  },

  async listUserRepositories(userId: string): Promise<RepositoryRecord[]> {
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from('repositories')
      .select('*')
      .eq('user_id', userId)
      .order('pushed_at', { ascending: false, nullsFirst: false });
    if (error) throw new Error(error.message);
    return (data as RepositoryRecord[]) || [];
  },

  async upsertProject(input: {
    user_id: string;
    repo_full_name: string;
    branch: string;
    project_dir: string;
    framework: string;
    application_module: string | null;
    package_id: string | null;
    analysis_json: unknown;
    workflow_installed: boolean;
    last_analyzed_sha: string;
  }): Promise<{ id: string; workflow_installed: boolean }> {
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from('projects')
      .upsert(input, { onConflict: 'user_id,repo_full_name,branch,project_dir' })
      .select('id, workflow_installed')
      .single();
    if (error || !data) throw new Error(error?.message || 'Failed to save project');
    return data as { id: string; workflow_installed: boolean };
  },

  async markProjectWorkflowInstalled(
    userId: string,
    repoFullName: string,
    branch: string,
    projectDir: string
  ): Promise<void> {
    const db = getSupabaseAdmin();
    await db
      .from('projects')
      .update({ workflow_installed: true })
      .eq('user_id', userId)
      .eq('repo_full_name', repoFullName)
      .eq('branch', branch)
      .eq('project_dir', projectDir);
  },

  async getProjectById(
    userId: string,
    projectId: string
  ): Promise<{ id: string; analysis_json: unknown } | null> {
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from('projects')
      .select('id, analysis_json')
      .eq('user_id', userId)
      .eq('id', projectId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as { id: string; analysis_json: unknown }) || null;
  },

  async listSigningConfigs(userId: string): Promise<SigningConfigSummary[]> {
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from('signing_configurations')
      .select('id, user_id, project_id, label, repo_full_name, key_alias, keystore_sha256, created_at, updated_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data as SigningConfigSummary[]) || [];
  },

  async getSigningConfig(userId: string, id: string): Promise<SigningConfigRecord | null> {
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from('signing_configurations')
      .select('*')
      .eq('user_id', userId)
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as SigningConfigRecord) || null;
  },

  async createSigningConfig(input: {
    user_id: string;
    project_id?: string | null;
    label: string;
    repo_full_name?: string | null;
    key_alias: string;
    encrypted_keystore_base64: string;
    encrypted_store_password: string;
    encrypted_key_password: string;
    keystore_sha256: string;
  }): Promise<SigningConfigSummary> {
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from('signing_configurations')
      .insert(input)
      .select('id, user_id, project_id, label, repo_full_name, key_alias, keystore_sha256, created_at, updated_at')
      .single();
    if (error || !data) throw new Error(error?.message || 'Failed to save signing config');
    return data as SigningConfigSummary;
  },

  async deleteSigningConfig(userId: string, id: string): Promise<boolean> {
    const db = getSupabaseAdmin();
    const { error, count } = await db
      .from('signing_configurations')
      .delete({ count: 'exact' })
      .eq('user_id', userId)
      .eq('id', id);
    if (error) throw new Error(error.message);
    return (count ?? 0) > 0;
  },

  async createBuildJob(
    input: Omit<
      BuildJobRecord,
      'id' | 'created_at' | 'updated_at' | 'completed_at' | 'duration_ms' | 'github_run_id' | 'github_job_id' | 'github_run_url' | 'error_code' | 'error_summary' | 'error_details'
    >
  ): Promise<BuildJobRecord> {
    const db = getSupabaseAdmin();
    const { data, error } = await db.from('build_jobs').insert(input).select('*').single();
    if (error || !data) throw new Error(error?.message || 'Failed to create build job');
    return data as BuildJobRecord;
  },

  async getBuildJob(userId: string, buildId: string): Promise<BuildJobRecord | null> {
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from('build_jobs')
      .select('*')
      .eq('user_id', userId)
      .eq('id', buildId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as BuildJobRecord) || null;
  },

  async getBuildJobByNonce(runNonce: string): Promise<BuildJobRecord | null> {
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from('build_jobs')
      .select('*')
      .eq('run_nonce', runNonce)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as BuildJobRecord) || null;
  },

  async getBuildJobByGitHubRunId(githubRunId: number): Promise<BuildJobRecord | null> {
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from('build_jobs')
      .select('*')
      .eq('github_run_id', githubRunId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as BuildJobRecord) || null;
  },

  async updateBuildJob(
    buildId: string,
    patch: Partial<Omit<BuildJobRecord, 'id' | 'user_id' | 'created_at'>>
  ): Promise<BuildJobRecord> {
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from('build_jobs')
      .update(patch)
      .eq('id', buildId)
      .select('*')
      .single();
    if (error || !data) throw new Error(error?.message || 'Failed to update build job');
    return data as BuildJobRecord;
  },

  async claimBuildStatus(
    buildId: string,
    expectedStatuses: BuildJobRecord['status'][],
    patch: Partial<Omit<BuildJobRecord, 'id' | 'user_id' | 'created_at'>>
  ): Promise<BuildJobRecord | null> {
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from('build_jobs')
      .update(patch)
      .eq('id', buildId)
      .in('status', expectedStatuses)
      .select('*')
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as BuildJobRecord) || null;
  },

  async listUserBuilds(
    userId: string,
    options?: { limit?: number; status?: string; repo?: string }
  ): Promise<Array<BuildJobRecord & { artifact: BuildArtifactRecord | null }>> {
    const db = getSupabaseAdmin();
    let query = db
      .from('build_jobs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(options?.limit ?? 50);

    if (options?.status && options.status !== 'all') {
      query = query.eq('status', options.status);
    }
    if (options?.repo) {
      query = query.ilike('repo_full_name', `%${options.repo}%`);
    }

    const { data: jobs, error } = await query;
    if (error) throw new Error(error.message);
    const jobList = (jobs as BuildJobRecord[]) || [];
    if (jobList.length === 0) return [];

    const jobIds = jobList.map((j) => j.id);
    const { data: artifacts, error: artErr } = await db
      .from('build_artifacts')
      .select('*')
      .eq('user_id', userId)
      .in('build_job_id', jobIds)
      .is('deleted_at', null);

    if (artErr) throw new Error(artErr.message);
    const byJob = new Map<string, BuildArtifactRecord>();
    for (const a of (artifacts as BuildArtifactRecord[]) || []) {
      byJob.set(a.build_job_id, a);
    }

    return jobList.map((job) => ({
      ...job,
      artifact: byJob.get(job.id) ?? null,
    }));
  },

  async getBuildStats(userId: string): Promise<BuildStats> {
    const db = getSupabaseAdmin();
    const { data: jobs, error } = await db
      .from('build_jobs')
      .select('status, duration_ms')
      .eq('user_id', userId);
    if (error) throw new Error(error.message);

    const rows = (jobs as Array<{ status: string; duration_ms: number | null }>) || [];
    const totalBuilds = rows.length;
    const succeededBuilds = rows.filter((r) => r.status === 'succeeded').length;
    const failedBuilds = rows.filter((r) =>
      ['failed', 'cancelled', 'timed_out'].includes(r.status)
    ).length;
    const activeBuilds = rows.filter((r) =>
      ['queued', 'running', 'validating', 'storing'].includes(r.status)
    ).length;
    const completed = succeededBuilds + failedBuilds;
    const successRate = completed > 0 ? Math.round((succeededBuilds / completed) * 100) : 0;
    const durations = rows.map((r) => r.duration_ms).filter((d): d is number => typeof d === 'number' && d > 0);
    const averageDurationMs =
      durations.length > 0
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
        : null;

    const { data: arts } = await db
      .from('build_artifacts')
      .select('size_bytes')
      .eq('user_id', userId)
      .is('deleted_at', null);
    const totalArtifactsBytes = ((arts as Array<{ size_bytes: number }>) || []).reduce(
      (acc, row) => acc + Number(row.size_bytes || 0),
      0
    );

    return {
      totalBuilds,
      succeededBuilds,
      failedBuilds,
      activeBuilds,
      successRate,
      averageDurationMs,
      totalArtifactsBytes,
    };
  },

  async countActiveUserBuilds(userId: string): Promise<number> {
    const db = getSupabaseAdmin();
    const { count, error } = await db
      .from('build_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .in('status', ['queued', 'running', 'validating', 'storing']);
    if (error) throw new Error(error.message);
    return count ?? 0;
  },

  async deleteBuildJob(userId: string, buildId: string): Promise<void> {
    const db = getSupabaseAdmin();
    const { data: arts } = await db
      .from('build_artifacts')
      .select('storage_bucket, storage_path')
      .eq('user_id', userId)
      .eq('build_job_id', buildId);

    const artRows = (arts as Array<{ storage_bucket?: string; storage_path: string }>) || [];
    const pathsToRemove = new Set<string>();
    for (const art of artRows) {
      pathsToRemove.add(art.storage_path);
      if (art.storage_bucket === APK_CHUNKED_BUCKET || art.storage_path.endsWith('.manifest')) {
        try {
          const { data: manifestBlob } = await db.storage.from(APK_BUCKET).download(art.storage_path);
          if (manifestBlob) {
            const manifest = JSON.parse(await manifestBlob.text()) as ChunkedApkManifest;
            for (const p of manifest.chunkPaths || []) pathsToRemove.add(p);
          }
        } catch {
          // ignore unreadable manifest during deletion
        }
      }
    }
    if (pathsToRemove.size > 0) {
      await db.storage.from(APK_BUCKET).remove(Array.from(pathsToRemove));
    }

    const { error } = await db
      .from('build_jobs')
      .delete()
      .eq('user_id', userId)
      .eq('id', buildId);
    if (error) throw new Error(error.message);
  },

  async replaceBuildLogs(
    buildJobId: string,
    userId: string,
    entries: Array<{ stage_index: number; step_name: string | null; level: 'info' | 'warn' | 'error' | 'debug'; content: string }>
  ): Promise<void> {
    const db = getSupabaseAdmin();
    await db.from('build_logs').delete().eq('build_job_id', buildJobId).eq('user_id', userId);
    if (entries.length === 0) return;
    const rows = entries.map((e) => ({
      build_job_id: buildJobId,
      user_id: userId,
      stage_index: e.stage_index,
      step_name: e.step_name,
      level: e.level,
      content: e.content,
    }));
    const { error } = await db.from('build_logs').insert(rows);
    if (error) throw new Error(error.message);
  },

  async appendBuildLog(
    buildJobId: string,
    userId: string,
    entry: { stage_index: number; step_name: string | null; level: 'info' | 'warn' | 'error' | 'debug'; content: string }
  ): Promise<void> {
    const db = getSupabaseAdmin();
    const { error } = await db.from('build_logs').insert({
      build_job_id: buildJobId,
      user_id: userId,
      stage_index: entry.stage_index,
      step_name: entry.step_name,
      level: entry.level,
      content: entry.content,
    });
    if (error) throw new Error(error.message);
  },

  async listBuildLogs(userId: string, buildJobId: string): Promise<BuildLogRecord[]> {
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from('build_logs')
      .select('*')
      .eq('user_id', userId)
      .eq('build_job_id', buildJobId)
      .order('id', { ascending: true });
    if (error) throw new Error(error.message);
    return (data as BuildLogRecord[]) || [];
  },

  async createBuildArtifact(
    input: Omit<BuildArtifactRecord, 'id' | 'download_count' | 'deleted_at' | 'created_at'>
  ): Promise<BuildArtifactRecord> {
    const db = getSupabaseAdmin();
    const { data, error } = await db.from('build_artifacts').insert(input).select('*').single();
    if (error || !data) throw new Error(error?.message || 'Failed to create build artifact record');
    return data as BuildArtifactRecord;
  },

  async getBuildArtifactByJob(userId: string, buildJobId: string): Promise<BuildArtifactRecord | null> {
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from('build_artifacts')
      .select('*')
      .eq('user_id', userId)
      .eq('build_job_id', buildJobId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as BuildArtifactRecord) || null;
  },

  async incrementArtifactDownload(artifactId: string, currentCount: number): Promise<void> {
    const db = getSupabaseAdmin();
    await db
      .from('build_artifacts')
      .update({ download_count: currentCount + 1 })
      .eq('id', artifactId);
  },

  async softDeleteBuildArtifactsForJob(userId: string, buildJobId: string): Promise<void> {
    const db = getSupabaseAdmin();
    await db
      .from('build_artifacts')
      .update({ deleted_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('build_job_id', buildJobId)
      .is('deleted_at', null);
  },

  async uploadApkBinary(
    userId: string,
    buildJobId: string,
    fileName: string,
    buffer: Buffer
  ): Promise<{ storageBucket: string; storagePath: string }> {
    const db = getSupabaseAdmin();
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    // Unique upload folder prevents concurrent sync attempts from overwriting or deleting each other's chunks.
    const uploadId = crypto.randomUUID().slice(0, 8);
    const folderPrefix = `${userId}/${buildJobId}/${uploadId}`;
    const basePath = `${folderPrefix}/${safeName}`;

    if (buffer.byteLength <= SUPABASE_CHUNK_BYTES) {
      await uploadStorageObjectWithRetry(
        db,
        basePath,
        buffer,
        'application/vnd.android.package-archive'
      );
      return { storageBucket: APK_BUCKET, storagePath: basePath };
    }

    const chunkPaths: string[] = [];
    const chunkSizes: number[] = [];
    for (let offset = 0, partIndex = 0; offset < buffer.byteLength; offset += SUPABASE_CHUNK_BYTES, partIndex++) {
      const end = Math.min(offset + SUPABASE_CHUNK_BYTES, buffer.byteLength);
      const slice = buffer.subarray(offset, end);
      const partPath = `${basePath}.part${String(partIndex).padStart(3, '0')}`;
      try {
        await uploadStorageObjectWithRetry(db, partPath, slice, 'application/octet-stream');
      } catch (err) {
        if (chunkPaths.length > 0) {
          await db.storage.from(APK_BUCKET).remove(chunkPaths).catch(() => null);
        }
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`Supabase Storage chunk upload failed (part ${partIndex}): ${msg}`);
      }
      chunkPaths.push(partPath);
      chunkSizes.push(slice.byteLength);
    }

    // Verify all chunks exist in Storage with matching byte lengths before persisting manifest
    const uploadedMap = await listFolderObjectSizes(db, folderPrefix);
    for (let i = 0; i < chunkPaths.length; i++) {
      if (!uploadedMap.has(chunkPaths[i])) {
        await db.storage.from(APK_BUCKET).remove(chunkPaths).catch(() => null);
        throw new Error(`ARTIFACT_STORAGE_VERIFICATION_FAILED: chunk ${i} missing after upload`);
      }
    }

    const manifestPath = `${basePath}.manifest`;
    const manifest: ChunkedApkManifest = {
      fileName: safeName,
      totalBytes: buffer.byteLength,
      chunkPaths,
      chunkSizes,
    };
    try {
      await uploadStorageObjectWithRetry(
        db,
        manifestPath,
        Buffer.from(JSON.stringify(manifest), 'utf8'),
        'application/octet-stream'
      );
    } catch (err) {
      await db.storage.from(APK_BUCKET).remove(chunkPaths).catch(() => null);
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Supabase Storage manifest upload failed: ${msg}`);
    }

    return { storageBucket: APK_CHUNKED_BUCKET, storagePath: manifestPath };
  },

  async createArtifactSignedUrl(
    storagePath: string,
    fileName: string,
    expiresInSeconds = 180
  ): Promise<string> {
    const db = getSupabaseAdmin();
    const folderPrefix = storagePath.slice(0, storagePath.lastIndexOf('/'));
    const existing = await listFolderObjectSizes(db, folderPrefix);
    if (!existing.has(storagePath)) {
      throw new Error('ARTIFACT_OBJECTS_MISSING: APK object not found in storage.');
    }
    const { data, error } = await db.storage
      .from(APK_BUCKET)
      .createSignedUrl(storagePath, expiresInSeconds, { download: fileName });
    if (error || !data?.signedUrl) {
      throw new Error(error?.message || 'Failed to generate signed download URL');
    }
    return data.signedUrl;
  },

  async createChunkedArtifactSignedUrls(
    manifestPath: string,
    _fileName: string,
    expiresInSeconds = 300
  ): Promise<{ totalBytes: number; chunkUrls: string[]; chunkSizes: number[]; chunkPaths: string[] }> {
    const db = getSupabaseAdmin();
    const { data: manifestBlob, error: manifestErr } = await db.storage
      .from(APK_BUCKET)
      .download(manifestPath);
    if (manifestErr || !manifestBlob) {
      throw new Error(`ARTIFACT_OBJECTS_MISSING: ${manifestErr?.message || 'Manifest missing in storage.'}`);
    }
    const manifest = JSON.parse(await manifestBlob.text()) as ChunkedApkManifest;
    const folderPrefix = manifestPath.slice(0, manifestPath.lastIndexOf('/'));
    const existing = await listFolderObjectSizes(db, folderPrefix);

    const chunkUrls: string[] = [];
    const chunkSizes: number[] = [];
    for (let i = 0; i < manifest.chunkPaths.length; i++) {
      const partPath = manifest.chunkPaths[i];
      if (!existing.has(partPath)) {
        throw new Error(`ARTIFACT_OBJECTS_MISSING: Missing APK chunk ${i} (${partPath})`);
      }
      const recordedSize = existing.get(partPath);
      const expectedSize = manifest.chunkSizes?.[i] ?? recordedSize ?? 0;
      if (recordedSize !== null && expectedSize > 0 && recordedSize !== expectedSize) {
        throw new Error(
          `ARTIFACT_OBJECTS_MISSING: Corrupted APK chunk ${i} size (${recordedSize} != ${expectedSize})`
        );
      }
      const { data, error } = await db.storage
        .from(APK_BUCKET)
        .createSignedUrl(partPath, expiresInSeconds);
      if (error || !data?.signedUrl) {
        throw new Error(error?.message || `Failed to sign APK chunk ${partPath}`);
      }
      chunkUrls.push(data.signedUrl);
      chunkSizes.push(expectedSize);
    }
    return {
      totalBytes: manifest.totalBytes,
      chunkUrls,
      chunkSizes,
      chunkPaths: manifest.chunkPaths,
    };
  },

  async readStorageByteRange(
    storagePath: string,
    startByte: number,
    endByteInclusive: number
  ): Promise<Buffer> {
    const db = getSupabaseAdmin();
    const { data, error } = await db.storage.from(APK_BUCKET).createSignedUrl(storagePath, 120);
    if (error || !data?.signedUrl) {
      throw new Error(error?.message || 'Failed to sign APK chunk range URL');
    }
    const res = await fetch(data.signedUrl, {
      headers: {
        Range: `bytes=${startByte}-${endByteInclusive}`,
      },
      cache: 'no-store',
    });
    if (!res.ok && res.status !== 206) {
      throw new Error(`Chunk range fetch failed (${res.status})`);
    }
    return Buffer.from(await res.arrayBuffer());
  },

  async streamChunkedApk(manifestPath: string): Promise<ReadableStream<Uint8Array>> {
    const db = getSupabaseAdmin();
    const { data: manifestBlob, error: manifestErr } = await db.storage
      .from(APK_BUCKET)
      .download(manifestPath);
    if (manifestErr || !manifestBlob) {
      throw new Error(`ARTIFACT_OBJECTS_MISSING: ${manifestErr?.message || 'Failed to read chunked APK manifest.'}`);
    }
    const manifest = JSON.parse(await manifestBlob.text()) as ChunkedApkManifest;
    const folderPrefix = manifestPath.slice(0, manifestPath.lastIndexOf('/'));
    const existing = await listFolderObjectSizes(db, folderPrefix);
    for (const partPath of manifest.chunkPaths) {
      if (!existing.has(partPath)) {
        throw new Error(`ARTIFACT_OBJECTS_MISSING: Missing chunk ${partPath}`);
      }
    }
    const chunkPaths = [...manifest.chunkPaths];

    return new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for (const partPath of chunkPaths) {
            const { data: partBlob, error: partErr } = await db.storage
              .from(APK_BUCKET)
              .download(partPath);
            if (partErr || !partBlob) {
              throw new Error(partErr?.message || `Failed to download chunk ${partPath}`);
            }
            const bytes = new Uint8Array(await partBlob.arrayBuffer());
            controller.enqueue(bytes);
          }
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    });
  },

  async downloadApkBinary(storagePath: string, storageBucket?: string): Promise<Buffer> {
    const db = getSupabaseAdmin();
    if (storageBucket === APK_CHUNKED_BUCKET || storagePath.endsWith('.manifest')) {
      const { data: manifestBlob, error: manifestErr } = await db.storage
        .from(APK_BUCKET)
        .download(storagePath);
      if (manifestErr || !manifestBlob) {
        throw new Error(manifestErr?.message || 'Failed to download APK manifest from storage');
      }
      const manifest = JSON.parse(await manifestBlob.text()) as ChunkedApkManifest;
      const parts: Buffer[] = [];
      for (const partPath of manifest.chunkPaths) {
        const { data: partBlob, error: partErr } = await db.storage
          .from(APK_BUCKET)
          .download(partPath);
        if (partErr || !partBlob) {
          throw new Error(partErr?.message || `Failed to download chunk ${partPath}`);
        }
        parts.push(Buffer.from(await partBlob.arrayBuffer()));
      }
      return Buffer.concat(parts);
    }
    const { data, error } = await db.storage.from(APK_BUCKET).download(storagePath);
    if (error || !data) throw new Error(error?.message || 'Failed to download APK from storage');
    return Buffer.from(await data.arrayBuffer());
  },

  async cleanupExpiredArtifactsAndStaleBuilds(timeoutMinutes: number): Promise<{
    deletedArtifacts: number;
    timedOutBuilds: number;
  }> {
    const db = getSupabaseAdmin();
    const nowIso = new Date().toISOString();

    const { data: expired } = await db
      .from('build_artifacts')
      .select('id, storage_bucket, storage_path')
      .is('deleted_at', null)
      .lt('expires_at', nowIso);

    const expiredRows =
      (expired as Array<{ id: string; storage_bucket?: string; storage_path: string }>) || [];
    if (expiredRows.length > 0) {
      const pathsToRemove = new Set<string>();
      for (const row of expiredRows) {
        pathsToRemove.add(row.storage_path);
        if (row.storage_bucket === APK_CHUNKED_BUCKET || row.storage_path.endsWith('.manifest')) {
          try {
            const { data: manifestBlob } = await db.storage.from(APK_BUCKET).download(row.storage_path);
            if (manifestBlob) {
              const manifest = JSON.parse(await manifestBlob.text()) as ChunkedApkManifest;
              for (const p of manifest.chunkPaths || []) pathsToRemove.add(p);
            }
          } catch {
            // ignore manifest read failure during cleanup
          }
        }
      }
      await db.storage.from(APK_BUCKET).remove(Array.from(pathsToRemove));
      await db
        .from('build_artifacts')
        .update({ deleted_at: nowIso })
        .in(
          'id',
          expiredRows.map((r) => r.id)
        );
    }

    const cutoff = new Date(Date.now() - timeoutMinutes * 60 * 1000).toISOString();
    const { data: stale } = await db
      .from('build_jobs')
      .update({
        status: 'timed_out',
        error_code: 'BUILD_TIMEOUT',
        error_summary: `Build exceeded the ${timeoutMinutes}-minute execution timeout.`,
        completed_at: nowIso,
      })
      .in('status', ['queued', 'running'])
      .lt('started_at', cutoff)
      .select('id');

    return {
      deletedArtifacts: expiredRows.length,
      timedOutBuilds: Array.isArray(stale) ? stale.length : 0,
    };
  },

  async recordRateLimitEvent(userId: string, action: string): Promise<void> {
    const db = getSupabaseAdmin();
    await db.from('rate_limit_events').insert({ user_id: userId, action });
  },

  async countRecentRateLimitEvents(userId: string, action: string, windowSeconds: number): Promise<number> {
    const db = getSupabaseAdmin();
    const since = new Date(Date.now() - windowSeconds * 1000).toISOString();
    const { count, error } = await db
      .from('rate_limit_events')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('action', action)
      .gte('created_at', since);
    if (error) throw new Error(error.message);
    return count ?? 0;
  },
};
