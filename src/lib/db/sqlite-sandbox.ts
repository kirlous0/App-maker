import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
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

const DATA_DIR = process.env.REPO2APK_SANDBOX_DATA_DIR || path.join(process.cwd(), '.data');
const DB_PATH = path.join(DATA_DIR, 'repo2apk-sandbox.db');
const ARTIFACTS_DIR = path.join(DATA_DIR, 'artifacts');

let dbInstance: DatabaseSync | null = null;

function getDb(): DatabaseSync {
  if (dbInstance) return dbInstance;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      github_user_id INTEGER UNIQUE NOT NULL,
      github_login TEXT NOT NULL,
      name TEXT,
      email TEXT,
      avatar_url TEXT,
      preferred_language TEXT NOT NULL DEFAULT 'ar',
      default_build_type TEXT NOT NULL DEFAULT 'debug',
      artifact_retention_days INTEGER NOT NULL DEFAULT 7,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS github_installations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      installation_id INTEGER NOT NULL,
      account_login TEXT NOT NULL,
      account_type TEXT NOT NULL DEFAULT 'User',
      repository_selection TEXT NOT NULL DEFAULT 'selected',
      permissions TEXT NOT NULL DEFAULT '{}',
      encrypted_user_access_token TEXT,
      encrypted_user_refresh_token TEXT,
      token_expires_at TEXT,
      suspended_at TEXT,
      disconnected_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (user_id, installation_id)
    );

    CREATE TABLE IF NOT EXISTS repositories (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      installation_id INTEGER NOT NULL,
      github_repo_id INTEGER NOT NULL,
      owner TEXT NOT NULL,
      name TEXT NOT NULL,
      full_name TEXT NOT NULL,
      description TEXT,
      visibility TEXT NOT NULL DEFAULT 'public',
      is_private INTEGER NOT NULL DEFAULT 0,
      primary_language TEXT,
      default_branch TEXT NOT NULL DEFAULT 'main',
      html_url TEXT,
      pushed_at TEXT,
      synced_at TEXT NOT NULL,
      UNIQUE (user_id, github_repo_id)
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      repo_full_name TEXT NOT NULL,
      branch TEXT NOT NULL,
      project_dir TEXT NOT NULL DEFAULT '.',
      framework TEXT NOT NULL DEFAULT 'unknown',
      application_module TEXT,
      package_id TEXT,
      analysis_json TEXT NOT NULL DEFAULT '{}',
      workflow_installed INTEGER NOT NULL DEFAULT 0,
      last_analyzed_sha TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (user_id, repo_full_name, branch, project_dir)
    );

    CREATE TABLE IF NOT EXISTS signing_configurations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      project_id TEXT,
      label TEXT NOT NULL,
      repo_full_name TEXT,
      key_alias TEXT NOT NULL,
      encrypted_keystore_base64 TEXT NOT NULL,
      encrypted_store_password TEXT NOT NULL,
      encrypted_key_password TEXT NOT NULL,
      keystore_sha256 TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS build_jobs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      project_id TEXT,
      signing_config_id TEXT,
      run_nonce TEXT NOT NULL UNIQUE,
      installation_id INTEGER NOT NULL,
      repo_full_name TEXT NOT NULL,
      branch TEXT NOT NULL,
      commit_sha TEXT NOT NULL,
      project_dir TEXT NOT NULL DEFAULT '.',
      framework TEXT NOT NULL,
      build_type TEXT NOT NULL,
      build_variant TEXT,
      application_module TEXT,
      abi_mode TEXT NOT NULL DEFAULT 'universal',
      build_name TEXT,
      build_number TEXT,
      build_command TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      current_stage INTEGER NOT NULL DEFAULT 1,
      stages_state TEXT NOT NULL DEFAULT '[]',
      github_run_id INTEGER,
      github_job_id INTEGER,
      github_run_url TEXT,
      is_unsigned INTEGER NOT NULL DEFAULT 0,
      error_code TEXT,
      error_summary TEXT,
      error_details TEXT,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      duration_ms INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS build_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      build_job_id TEXT NOT NULL REFERENCES build_jobs(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      stage_index INTEGER NOT NULL DEFAULT 1,
      step_name TEXT,
      level TEXT NOT NULL DEFAULT 'info',
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS build_artifacts (
      id TEXT PRIMARY KEY,
      build_job_id TEXT NOT NULL REFERENCES build_jobs(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      app_name TEXT,
      file_name TEXT NOT NULL,
      storage_bucket TEXT NOT NULL DEFAULT 'apk-artifacts',
      storage_path TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      sha256 TEXT NOT NULL,
      package_id TEXT,
      version_name TEXT,
      version_code TEXT,
      is_signed INTEGER NOT NULL DEFAULT 0,
      signing_status TEXT NOT NULL DEFAULT 'unsigned',
      abi TEXT NOT NULL DEFAULT 'universal',
      download_count INTEGER NOT NULL DEFAULT 0,
      expires_at TEXT NOT NULL,
      deleted_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rate_limit_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      action TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  dbInstance = db;
  return db;
}

function mapInstallation(row: Record<string, unknown>): GitHubInstallationRecord {
  return {
    ...(row as unknown as GitHubInstallationRecord),
    permissions: JSON.parse(String(row.permissions || '{}')),
  };
}

function mapRepo(row: Record<string, unknown>): RepositoryRecord {
  return {
    ...(row as unknown as RepositoryRecord),
    is_private: Boolean(row.is_private),
  };
}

function mapBuildJob(row: Record<string, unknown>): BuildJobRecord {
  return {
    ...(row as unknown as BuildJobRecord),
    stages_state: JSON.parse(String(row.stages_state || '[]')),
    is_unsigned: Boolean(row.is_unsigned),
  };
}

function mapArtifact(row: Record<string, unknown>): BuildArtifactRecord {
  return {
    ...(row as unknown as BuildArtifactRecord),
    is_signed: Boolean(row.is_signed),
  };
}

export const sqliteSandboxStore = {
  async upsertUserByGitHub(input: {
    github_user_id: number;
    github_login: string;
    name: string | null;
    email: string | null;
    avatar_url: string | null;
  }): Promise<UserProfile> {
    const db = getDb();
    const now = new Date().toISOString();
    const existing = db
      .prepare('SELECT * FROM users WHERE github_user_id = ?')
      .get(input.github_user_id) as UserProfile | undefined;
    if (existing) {
      db.prepare(
        'UPDATE users SET github_login = ?, name = ?, email = ?, avatar_url = ?, updated_at = ? WHERE id = ?'
      ).run(input.github_login, input.name, input.email, input.avatar_url, now, existing.id);
      return db.prepare('SELECT * FROM users WHERE id = ?').get(existing.id) as unknown as UserProfile;
    }
    const id = crypto.randomUUID();
    db.prepare(
      `INSERT INTO users (id, github_user_id, github_login, name, email, avatar_url, preferred_language, default_build_type, artifact_retention_days, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'ar', 'debug', 7, ?, ?)`
    ).run(id, input.github_user_id, input.github_login, input.name, input.email, input.avatar_url, now, now);
    return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as unknown as UserProfile;
  },

  async getUserById(userId: string): Promise<UserProfile | null> {
    const db = getDb();
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    return (row as unknown as UserProfile) || null;
  },

  async updateUserPreferences(
    userId: string,
    patch: Partial<Pick<UserProfile, 'preferred_language' | 'default_build_type' | 'artifact_retention_days'>>
  ): Promise<UserProfile> {
    const db = getDb();
    const current = await this.getUserById(userId);
    if (!current) throw new Error('User not found');
    const now = new Date().toISOString();
    db.prepare(
      'UPDATE users SET preferred_language = ?, default_build_type = ?, artifact_retention_days = ?, updated_at = ? WHERE id = ?'
    ).run(
      patch.preferred_language ?? current.preferred_language,
      patch.default_build_type ?? current.default_build_type,
      patch.artifact_retention_days ?? current.artifact_retention_days,
      now,
      userId
    );
    return (await this.getUserById(userId))!;
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
    const db = getDb();
    const now = new Date().toISOString();
    const existing = db
      .prepare('SELECT id FROM github_installations WHERE user_id = ? AND installation_id = ?')
      .get(input.user_id, input.installation_id) as { id: string } | undefined;

    if (existing) {
      db.prepare(
        `UPDATE github_installations SET account_login = ?, account_type = ?, repository_selection = ?, permissions = ?,
         encrypted_user_access_token = ?, encrypted_user_refresh_token = ?, token_expires_at = ?,
         suspended_at = NULL, disconnected_at = NULL, updated_at = ? WHERE id = ?`
      ).run(
        input.account_login,
        input.account_type,
        input.repository_selection,
        JSON.stringify(input.permissions),
        input.encrypted_user_access_token,
        input.encrypted_user_refresh_token,
        input.token_expires_at,
        now,
        existing.id
      );
      const row = db.prepare('SELECT * FROM github_installations WHERE id = ?').get(existing.id) as Record<string, unknown>;
      return mapInstallation(row);
    }

    const id = crypto.randomUUID();
    db.prepare(
      `INSERT INTO github_installations (id, user_id, installation_id, account_login, account_type, repository_selection, permissions, encrypted_user_access_token, encrypted_user_refresh_token, token_expires_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      input.user_id,
      input.installation_id,
      input.account_login,
      input.account_type,
      input.repository_selection,
      JSON.stringify(input.permissions),
      input.encrypted_user_access_token,
      input.encrypted_user_refresh_token,
      input.token_expires_at,
      now,
      now
    );
    const row = db.prepare('SELECT * FROM github_installations WHERE id = ?').get(id) as Record<string, unknown>;
    return mapInstallation(row);
  },

  async getActiveInstallations(userId: string): Promise<GitHubInstallationRecord[]> {
    const db = getDb();
    const rows = db
      .prepare(
        'SELECT * FROM github_installations WHERE user_id = ? AND disconnected_at IS NULL ORDER BY updated_at DESC'
      )
      .all(userId) as Array<Record<string, unknown>>;
    return rows.map(mapInstallation);
  },

  async getInstallationByNumericId(
    userId: string,
    installationId: number
  ): Promise<GitHubInstallationRecord | null> {
    const db = getDb();
    const row = db
      .prepare(
        'SELECT * FROM github_installations WHERE user_id = ? AND installation_id = ? AND disconnected_at IS NULL'
      )
      .get(userId, installationId) as Record<string, unknown> | undefined;
    return row ? mapInstallation(row) : null;
  },

  async updateInstallationTokens(
    id: string,
    patch: {
      encrypted_user_access_token: string | null;
      encrypted_user_refresh_token: string | null;
      token_expires_at: string | null;
    }
  ): Promise<void> {
    const db = getDb();
    db.prepare(
      'UPDATE github_installations SET encrypted_user_access_token = ?, encrypted_user_refresh_token = ?, token_expires_at = ?, updated_at = ? WHERE id = ?'
    ).run(
      patch.encrypted_user_access_token,
      patch.encrypted_user_refresh_token,
      patch.token_expires_at,
      new Date().toISOString(),
      id
    );
  },

  async disconnectUserGitHub(userId: string): Promise<void> {
    const db = getDb();
    const now = new Date().toISOString();
    db.prepare(
      'UPDATE github_installations SET encrypted_user_access_token = NULL, encrypted_user_refresh_token = NULL, token_expires_at = NULL, disconnected_at = ?, updated_at = ? WHERE user_id = ?'
    ).run(now, now, userId);
    db.prepare('DELETE FROM repositories WHERE user_id = ?').run(userId);
  },

  async suspendInstallationByNumericId(installationId: number, suspendedAt: string | null): Promise<void> {
    const db = getDb();
    db.prepare('UPDATE github_installations SET suspended_at = ?, updated_at = ? WHERE installation_id = ?').run(
      suspendedAt,
      new Date().toISOString(),
      installationId
    );
  },

  async replaceUserRepositories(
    userId: string,
    repos: Array<Omit<RepositoryRecord, 'id' | 'synced_at'>>
  ): Promise<RepositoryRecord[]> {
    const db = getDb();
    db.prepare('DELETE FROM repositories WHERE user_id = ?').run(userId);
    const now = new Date().toISOString();
    const stmt = db.prepare(
      `INSERT INTO repositories (id, user_id, installation_id, github_repo_id, owner, name, full_name, description, visibility, is_private, primary_language, default_branch, html_url, pushed_at, synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const r of repos) {
      stmt.run(
        crypto.randomUUID(),
        userId,
        r.installation_id,
        r.github_repo_id,
        r.owner,
        r.name,
        r.full_name,
        r.description,
        r.visibility,
        r.is_private ? 1 : 0,
        r.primary_language,
        r.default_branch,
        r.html_url,
        r.pushed_at,
        now
      );
    }
    return this.listUserRepositories(userId);
  },

  async listUserRepositories(userId: string): Promise<RepositoryRecord[]> {
    const db = getDb();
    const rows = db
      .prepare('SELECT * FROM repositories WHERE user_id = ? ORDER BY pushed_at DESC')
      .all(userId) as Array<Record<string, unknown>>;
    return rows.map(mapRepo);
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
    const db = getDb();
    const now = new Date().toISOString();
    const existing = db
      .prepare(
        'SELECT id, workflow_installed FROM projects WHERE user_id = ? AND repo_full_name = ? AND branch = ? AND project_dir = ?'
      )
      .get(input.user_id, input.repo_full_name, input.branch, input.project_dir) as
      | { id: string; workflow_installed: number }
      | undefined;

    if (existing) {
      db.prepare(
        `UPDATE projects SET framework = ?, application_module = ?, package_id = ?, analysis_json = ?, workflow_installed = ?, last_analyzed_sha = ?, updated_at = ?
         WHERE id = ?`
      ).run(
        input.framework,
        input.application_module,
        input.package_id,
        JSON.stringify(input.analysis_json),
        input.workflow_installed ? 1 : 0,
        input.last_analyzed_sha,
        now,
        existing.id
      );
      return { id: existing.id, workflow_installed: input.workflow_installed };
    }
    const id = crypto.randomUUID();
    db.prepare(
      `INSERT INTO projects (id, user_id, repo_full_name, branch, project_dir, framework, application_module, package_id, analysis_json, workflow_installed, last_analyzed_sha, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      input.user_id,
      input.repo_full_name,
      input.branch,
      input.project_dir,
      input.framework,
      input.application_module,
      input.package_id,
      JSON.stringify(input.analysis_json),
      input.workflow_installed ? 1 : 0,
      input.last_analyzed_sha,
      now,
      now
    );
    return { id, workflow_installed: input.workflow_installed };
  },

  async markProjectWorkflowInstalled(
    userId: string,
    repoFullName: string,
    branch: string,
    projectDir: string
  ): Promise<void> {
    const db = getDb();
    db.prepare(
      'UPDATE projects SET workflow_installed = 1, updated_at = ? WHERE user_id = ? AND repo_full_name = ? AND branch = ? AND project_dir = ?'
    ).run(new Date().toISOString(), userId, repoFullName, branch, projectDir);
  },

  async getProjectById(
    userId: string,
    projectId: string
  ): Promise<{ id: string; analysis_json: unknown } | null> {
    const db = getDb();
    const row = db
      .prepare('SELECT id, analysis_json FROM projects WHERE user_id = ? AND id = ?')
      .get(userId, projectId) as { id: string; analysis_json: string } | undefined;
    if (!row) return null;
    try {
      return { id: row.id, analysis_json: JSON.parse(row.analysis_json) };
    } catch {
      return { id: row.id, analysis_json: null };
    }
  },

  async listSigningConfigs(userId: string): Promise<SigningConfigSummary[]> {
    const db = getDb();
    return db
      .prepare(
        'SELECT id, user_id, project_id, label, repo_full_name, key_alias, keystore_sha256, created_at, updated_at FROM signing_configurations WHERE user_id = ? ORDER BY created_at DESC'
      )
      .all(userId) as unknown as SigningConfigSummary[];
  },

  async getSigningConfig(userId: string, id: string): Promise<SigningConfigRecord | null> {
    const db = getDb();
    const row = db
      .prepare('SELECT * FROM signing_configurations WHERE user_id = ? AND id = ?')
      .get(userId, id);
    return (row as unknown as SigningConfigRecord) || null;
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
    const db = getDb();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO signing_configurations (id, user_id, project_id, label, repo_full_name, key_alias, encrypted_keystore_base64, encrypted_store_password, encrypted_key_password, keystore_sha256, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      input.user_id,
      input.project_id ?? null,
      input.label,
      input.repo_full_name ?? null,
      input.key_alias,
      input.encrypted_keystore_base64,
      input.encrypted_store_password,
      input.encrypted_key_password,
      input.keystore_sha256,
      now,
      now
    );
    return db
      .prepare(
        'SELECT id, user_id, project_id, label, repo_full_name, key_alias, keystore_sha256, created_at, updated_at FROM signing_configurations WHERE id = ?'
      )
      .get(id) as unknown as SigningConfigSummary;
  },

  async deleteSigningConfig(userId: string, id: string): Promise<boolean> {
    const db = getDb();
    const res = db
      .prepare('DELETE FROM signing_configurations WHERE user_id = ? AND id = ?')
      .run(userId, id);
    return Number(res.changes) > 0;
  },

  async createBuildJob(
    input: Omit<
      BuildJobRecord,
      'id' | 'created_at' | 'updated_at' | 'completed_at' | 'duration_ms' | 'github_run_id' | 'github_job_id' | 'github_run_url' | 'error_code' | 'error_summary' | 'error_details'
    >
  ): Promise<BuildJobRecord> {
    const db = getDb();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO build_jobs (id, user_id, project_id, signing_config_id, run_nonce, installation_id, repo_full_name, branch, commit_sha, project_dir, framework, build_type, build_variant, application_module, abi_mode, build_name, build_number, build_command, status, current_stage, stages_state, is_unsigned, started_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      input.user_id,
      input.project_id,
      input.signing_config_id,
      input.run_nonce,
      input.installation_id,
      input.repo_full_name,
      input.branch,
      input.commit_sha,
      input.project_dir,
      input.framework,
      input.build_type,
      input.build_variant,
      input.application_module,
      input.abi_mode,
      input.build_name,
      input.build_number,
      input.build_command,
      input.status,
      input.current_stage,
      JSON.stringify(input.stages_state),
      input.is_unsigned ? 1 : 0,
      input.started_at,
      now,
      now
    );
    const row = db.prepare('SELECT * FROM build_jobs WHERE id = ?').get(id) as Record<string, unknown>;
    return mapBuildJob(row);
  },

  async getBuildJob(userId: string, buildId: string): Promise<BuildJobRecord | null> {
    const db = getDb();
    const row = db
      .prepare('SELECT * FROM build_jobs WHERE user_id = ? AND id = ?')
      .get(userId, buildId) as Record<string, unknown> | undefined;
    return row ? mapBuildJob(row) : null;
  },

  async getBuildJobByNonce(runNonce: string): Promise<BuildJobRecord | null> {
    const db = getDb();
    const row = db.prepare('SELECT * FROM build_jobs WHERE run_nonce = ?').get(runNonce) as
      | Record<string, unknown>
      | undefined;
    return row ? mapBuildJob(row) : null;
  },

  async getBuildJobByGitHubRunId(githubRunId: number): Promise<BuildJobRecord | null> {
    const db = getDb();
    const row = db
      .prepare('SELECT * FROM build_jobs WHERE github_run_id = ?')
      .get(githubRunId) as Record<string, unknown> | undefined;
    return row ? mapBuildJob(row) : null;
  },

  async updateBuildJob(
    buildId: string,
    patch: Partial<Omit<BuildJobRecord, 'id' | 'user_id' | 'created_at'>>
  ): Promise<BuildJobRecord> {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM build_jobs WHERE id = ?').get(buildId) as
      | Record<string, unknown>
      | undefined;
    if (!existing) throw new Error('Build job not found');
    const merged = {
      ...mapBuildJob(existing),
      ...patch,
      updated_at: new Date().toISOString(),
    };
    db.prepare(
      `UPDATE build_jobs SET status = ?, current_stage = ?, stages_state = ?, github_run_id = ?, github_job_id = ?,
       github_run_url = ?, error_code = ?, error_summary = ?, error_details = ?, completed_at = ?, duration_ms = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      merged.status,
      merged.current_stage,
      JSON.stringify(merged.stages_state),
      merged.github_run_id,
      merged.github_job_id,
      merged.github_run_url,
      merged.error_code,
      merged.error_summary,
      merged.error_details,
      merged.completed_at,
      merged.duration_ms,
      merged.updated_at,
      buildId
    );
    const updated = db.prepare('SELECT * FROM build_jobs WHERE id = ?').get(buildId) as Record<string, unknown>;
    return mapBuildJob(updated);
  },

  async listUserBuilds(
    userId: string,
    options?: { limit?: number; status?: string; repo?: string }
  ): Promise<Array<BuildJobRecord & { artifact: BuildArtifactRecord | null }>> {
    const db = getDb();
    let sql = 'SELECT * FROM build_jobs WHERE user_id = ?';
    const params: Array<string | number> = [userId];
    if (options?.status && options.status !== 'all') {
      sql += ' AND status = ?';
      params.push(options.status);
    }
    if (options?.repo) {
      sql += ' AND repo_full_name LIKE ?';
      params.push(`%${options.repo}%`);
    }
    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(options?.limit ?? 50);

    const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
    return rows.map((r) => {
      const job = mapBuildJob(r);
      const art = db
        .prepare(
          'SELECT * FROM build_artifacts WHERE user_id = ? AND build_job_id = ? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1'
        )
        .get(userId, job.id) as Record<string, unknown> | undefined;
      return {
        ...job,
        artifact: art ? mapArtifact(art) : null,
      };
    });
  },

  async getBuildStats(userId: string): Promise<BuildStats> {
    const db = getDb();
    const rows = db
      .prepare('SELECT status, duration_ms FROM build_jobs WHERE user_id = ?')
      .all(userId) as Array<{ status: string; duration_ms: number | null }>;
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

    const artRow = db
      .prepare(
        'SELECT COALESCE(SUM(size_bytes), 0) AS total_bytes FROM build_artifacts WHERE user_id = ? AND deleted_at IS NULL'
      )
      .get(userId) as { total_bytes: number };
    return {
      totalBuilds,
      succeededBuilds,
      failedBuilds,
      activeBuilds,
      successRate,
      averageDurationMs,
      totalArtifactsBytes: Number(artRow?.total_bytes ?? 0),
    };
  },

  async countActiveUserBuilds(userId: string): Promise<number> {
    const db = getDb();
    const row = db
      .prepare(
        "SELECT COUNT(*) AS cnt FROM build_jobs WHERE user_id = ? AND status IN ('queued', 'running', 'validating', 'storing')"
      )
      .get(userId) as { cnt: number };
    return Number(row?.cnt ?? 0);
  },

  async deleteBuildJob(userId: string, buildId: string): Promise<void> {
    const db = getDb();
    const arts = db
      .prepare('SELECT storage_path FROM build_artifacts WHERE user_id = ? AND build_job_id = ?')
      .all(userId, buildId) as Array<{ storage_path: string }>;
    for (const a of arts) {
      const fullPath = path.join(ARTIFACTS_DIR, a.storage_path);
      if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    }
    db.prepare('DELETE FROM build_jobs WHERE user_id = ? AND id = ?').run(userId, buildId);
  },

  async replaceBuildLogs(
    buildJobId: string,
    userId: string,
    entries: Array<{ stage_index: number; step_name: string | null; level: 'info' | 'warn' | 'error' | 'debug'; content: string }>
  ): Promise<void> {
    const db = getDb();
    db.prepare('DELETE FROM build_logs WHERE build_job_id = ? AND user_id = ?').run(buildJobId, userId);
    const now = new Date().toISOString();
    const stmt = db.prepare(
      'INSERT INTO build_logs (build_job_id, user_id, stage_index, step_name, level, content, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    for (const e of entries) {
      stmt.run(buildJobId, userId, e.stage_index, e.step_name, e.level, e.content, now);
    }
  },

  async appendBuildLog(
    buildJobId: string,
    userId: string,
    entry: { stage_index: number; step_name: string | null; level: 'info' | 'warn' | 'error' | 'debug'; content: string }
  ): Promise<void> {
    const db = getDb();
    db.prepare(
      'INSERT INTO build_logs (build_job_id, user_id, stage_index, step_name, level, content, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(buildJobId, userId, entry.stage_index, entry.step_name, entry.level, entry.content, new Date().toISOString());
  },

  async listBuildLogs(userId: string, buildJobId: string): Promise<BuildLogRecord[]> {
    const db = getDb();
    return db
      .prepare('SELECT * FROM build_logs WHERE user_id = ? AND build_job_id = ? ORDER BY id ASC')
      .all(userId, buildJobId) as unknown as BuildLogRecord[];
  },

  async createBuildArtifact(
    input: Omit<BuildArtifactRecord, 'id' | 'download_count' | 'deleted_at' | 'created_at'>
  ): Promise<BuildArtifactRecord> {
    const db = getDb();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO build_artifacts (id, build_job_id, user_id, app_name, file_name, storage_bucket, storage_path, size_bytes, sha256, package_id, version_name, version_code, is_signed, signing_status, abi, download_count, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
    ).run(
      id,
      input.build_job_id,
      input.user_id,
      input.app_name,
      input.file_name,
      input.storage_bucket,
      input.storage_path,
      input.size_bytes,
      input.sha256,
      input.package_id,
      input.version_name,
      input.version_code,
      input.is_signed ? 1 : 0,
      input.signing_status,
      input.abi,
      input.expires_at,
      now
    );
    const row = db.prepare('SELECT * FROM build_artifacts WHERE id = ?').get(id) as Record<string, unknown>;
    return mapArtifact(row);
  },

  async getBuildArtifactByJob(userId: string, buildJobId: string): Promise<BuildArtifactRecord | null> {
    const db = getDb();
    const row = db
      .prepare(
        'SELECT * FROM build_artifacts WHERE user_id = ? AND build_job_id = ? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1'
      )
      .get(userId, buildJobId) as Record<string, unknown> | undefined;
    return row ? mapArtifact(row) : null;
  },

  async incrementArtifactDownload(artifactId: string, currentCount: number): Promise<void> {
    const db = getDb();
    db.prepare('UPDATE build_artifacts SET download_count = ? WHERE id = ?').run(currentCount + 1, artifactId);
  },

  async uploadApkBinary(
    userId: string,
    buildJobId: string,
    fileName: string,
    buffer: Buffer
  ): Promise<{ storageBucket: string; storagePath: string }> {
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `${userId}/${buildJobId}/${safeName}`;
    const fullPath = path.join(ARTIFACTS_DIR, storagePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, buffer);
    return { storageBucket: 'apk-artifacts', storagePath };
  },

  async createArtifactSignedUrl(_storagePath: string, _fileName: string, _expiresInSeconds = 120): Promise<string> {
    // In sandbox SQLite fallback, downloads stream directly via authenticated /api/builds/[id]/download?stream=1
    return '';
  },

  async downloadApkBinary(storagePath: string): Promise<Buffer> {
    const fullPath = path.join(ARTIFACTS_DIR, storagePath);
    if (!fs.existsSync(fullPath)) throw new Error('Artifact file not found in local sandbox storage.');
    return fs.readFileSync(fullPath);
  },

  async cleanupExpiredArtifactsAndStaleBuilds(timeoutMinutes: number): Promise<{
    deletedArtifacts: number;
    timedOutBuilds: number;
  }> {
    const db = getDb();
    const nowIso = new Date().toISOString();
    const expired = db
      .prepare('SELECT id, storage_path FROM build_artifacts WHERE deleted_at IS NULL AND expires_at < ?')
      .all(nowIso) as Array<{ id: string; storage_path: string }>;
    for (const row of expired) {
      const fullPath = path.join(ARTIFACTS_DIR, row.storage_path);
      if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
      db.prepare('UPDATE build_artifacts SET deleted_at = ? WHERE id = ?').run(nowIso, row.id);
    }
    const cutoff = new Date(Date.now() - timeoutMinutes * 60 * 1000).toISOString();
    const res = db
      .prepare(
        `UPDATE build_jobs SET status = 'timed_out', error_code = 'BUILD_TIMEOUT',
         error_summary = ?, completed_at = ?, updated_at = ?
         WHERE status IN ('queued', 'running', 'validating', 'storing') AND started_at < ?`
      )
      .run(`Build exceeded ${timeoutMinutes}-minute timeout.`, nowIso, nowIso, cutoff);

    return {
      deletedArtifacts: expired.length,
      timedOutBuilds: Number(res.changes),
    };
  },

  async recordRateLimitEvent(userId: string, action: string): Promise<void> {
    const db = getDb();
    db.prepare('INSERT INTO rate_limit_events (user_id, action, created_at) VALUES (?, ?, ?)').run(
      userId,
      action,
      new Date().toISOString()
    );
  },

  async countRecentRateLimitEvents(userId: string, action: string, windowSeconds: number): Promise<number> {
    const db = getDb();
    const since = new Date(Date.now() - windowSeconds * 1000).toISOString();
    const row = db
      .prepare('SELECT COUNT(*) AS cnt FROM rate_limit_events WHERE user_id = ? AND action = ? AND created_at >= ?')
      .get(userId, action, since) as { cnt: number };
    return Number(row?.cnt ?? 0);
  },
};
