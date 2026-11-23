import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import YAML from 'yaml';
import { createInitialStagesState } from '@/lib/builds/stages';
import { getRepo2ApkWorkflowYaml } from '@/lib/builds/workflow-template';
import { encryptSecret } from '@/lib/crypto';
import type { dbStore as DbStoreType } from '@/lib/db';
import { fetchInstallationRepositories, verifyRepoInInstallation } from '@/lib/github/client';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repo2apk-test-'));
let sqliteSandboxStore: typeof DbStoreType;

beforeAll(async () => {
  process.env.REPO2APK_SANDBOX_DATA_DIR = tempDir;
  process.env.REPO2APK_STORE_MODE = 'local-sqlite';
  process.env.TOKEN_ENCRYPTION_KEY =
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  process.env.SESSION_SECRET = 'super-secure-test-session-secret-key-32-plus-chars';

  const mod = await import('@/lib/db/sqlite-sandbox');
  sqliteSandboxStore = mod.sqliteSandboxStore;
});

afterAll(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('Database Store, Artifacts, Signing & Workflow Generation', () => {
  it('persists users, encrypted GitHub installations, repos, builds, private artifacts, and cleanup', async () => {
    const user = await sqliteSandboxStore.upsertUserByGitHub({
      github_user_id: 987654,
      github_login: 'android-dev',
      name: 'Android Dev',
      email: 'dev@example.com',
      avatar_url: 'https://avatars.githubusercontent.com/u/987654?v=4',
    });

    expect(user.preferred_language).toBe('ar');

    await sqliteSandboxStore.upsertGitHubInstallation({
      user_id: user.id,
      installation_id: 555001,
      account_login: 'android-dev',
      account_type: 'User',
      repository_selection: 'selected',
      permissions: { contents: 'write', actions: 'write' },
      encrypted_user_access_token: encryptSecret('ghu_secret_access_123'),
      encrypted_user_refresh_token: encryptSecret('ghr_secret_refresh_456'),
      token_expires_at: new Date(Date.now() + 3600_000).toISOString(),
    });

    const repos = await sqliteSandboxStore.replaceUserRepositories(user.id, [
      {
        user_id: user.id,
        installation_id: 555001,
        github_repo_id: 111222,
        owner: 'android-dev',
        name: 'my-wallet-app',
        full_name: 'android-dev/my-wallet-app',
        description: 'Native Kotlin app',
        visibility: 'private',
        is_private: true,
        primary_language: 'Kotlin',
        default_branch: 'main',
        html_url: 'https://github.com/android-dev/my-wallet-app',
        pushed_at: new Date().toISOString(),
      },
    ]);

    expect(repos).toHaveLength(1);
    expect(repos[0]?.is_private).toBe(true);

    // Ensure other users cannot see user's repos
    const otherUser = await sqliteSandboxStore.upsertUserByGitHub({
      github_user_id: 999888,
      github_login: 'other-dev',
      name: 'Other',
      email: null,
      avatar_url: null,
    });
    expect(await sqliteSandboxStore.listUserRepositories(otherUser.id)).toHaveLength(0);

    // Signing config summary strips encrypted secrets
    const signing = await sqliteSandboxStore.createSigningConfig({
      user_id: user.id,
      label: 'Prod Keystore',
      repo_full_name: 'android-dev/my-wallet-app',
      key_alias: 'upload',
      encrypted_keystore_base64: encryptSecret('ZmFrZS1rZXlzdG9yZQ=='),
      encrypted_store_password: encryptSecret('storepass'),
      encrypted_key_password: encryptSecret('keypass'),
      keystore_sha256: 'a'.repeat(64),
    });
    expect('encrypted_store_password' in signing).toBe(false);

    const project = await sqliteSandboxStore.upsertProject({
      user_id: user.id,
      repo_full_name: 'android-dev/my-wallet-app',
      branch: 'main',
      project_dir: '.',
      framework: 'native_android',
      application_module: 'app',
      package_id: 'com.dev.wallet',
      analysis_json: { framework: 'native_android' },
      workflow_installed: true,
      last_analyzed_sha: 'deadbeef',
    });

    const job = await sqliteSandboxStore.createBuildJob({
      user_id: user.id,
      project_id: project.id,
      signing_config_id: null,
      run_nonce: 'nonce-1234',
      installation_id: 555001,
      repo_full_name: 'android-dev/my-wallet-app',
      branch: 'main',
      commit_sha: 'abcdef1234567890',
      project_dir: '.',
      framework: 'native_android',
      build_type: 'debug',
      build_variant: 'debug',
      application_module: 'app',
      abi_mode: 'universal',
      build_name: null,
      build_number: null,
      build_command: './gradlew :app:assembleDebug --no-daemon',
      status: 'running',
      current_stage: 1,
      stages_state: createInitialStagesState(),
      is_unsigned: false,
      started_at: new Date().toISOString(),
    });

    const uploaded = await sqliteSandboxStore.uploadApkBinary(
      user.id,
      job.id,
      'app-debug.apk',
      Buffer.from('APK_BINARY_CONTENT')
    );

    const artifact = await sqliteSandboxStore.createBuildArtifact({
      build_job_id: job.id,
      user_id: user.id,
      app_name: 'Wallet',
      file_name: 'app-debug.apk',
      storage_bucket: uploaded.storageBucket,
      storage_path: uploaded.storagePath,
      size_bytes: 18,
      sha256: 'b'.repeat(64),
      package_id: 'com.dev.wallet',
      version_name: '1.0.0',
      version_code: '1',
      is_signed: true,
      signing_status: 'debug_signed',
      abi: 'universal',
      expires_at: new Date(Date.now() - 1000).toISOString(),
    });

    const downloaded = await sqliteSandboxStore.downloadApkBinary(artifact.storage_path);
    expect(downloaded.toString()).toBe('APK_BINARY_CONTENT');

    const cleanupRes = await sqliteSandboxStore.cleanupExpiredArtifactsAndStaleBuilds(45);
    expect(cleanupRes.deletedArtifacts).toBe(1);
    expect(await sqliteSandboxStore.getBuildArtifactByJob(user.id, job.id)).toBeNull();

    // Disconnect strips installations and repos
    await sqliteSandboxStore.disconnectUserGitHub(user.id);
    expect(await sqliteSandboxStore.getActiveInstallations(user.id)).toHaveLength(0);
    expect(await sqliteSandboxStore.listUserRepositories(user.id)).toHaveLength(0);
  });

  it('generates valid GitHub Actions workflow YAML supporting Native Android, Flutter, and signing secrets', () => {
    const yamlStr = getRepo2ApkWorkflowYaml();
    const parsed = YAML.parse(yamlStr) as {
      name: string;
      on: { workflow_dispatch: { inputs: Record<string, unknown> } };
      jobs: { build_apk: { steps: Array<{ name?: string }> } };
    };

    expect(parsed.name).toBe('Repo2APK Android Build');
    const inputs = Object.keys(parsed.on.workflow_dispatch.inputs);
    expect(inputs).toContain('build_id');
    expect(inputs).toContain('commit_sha');
    expect(inputs).toContain('framework');
    expect(inputs).toContain('build_mode');
    expect(inputs).toContain('use_repo2apk_secrets');

    const stepNames = parsed.jobs.build_apk.steps.map((s) => s.name || '');
    expect(stepNames).toContain('[Stage 3] Setup Java JDK');
    expect(stepNames).toContain('[Stage 3] Setup Android SDK');
    expect(stepNames).toContain('[Stage 3] Setup Flutter SDK');
    expect(stepNames).toContain('[Stage 7] APK validation & metadata');
    expect(stepNames).toContain('[Stage 7] Upload APK artifact');
  });
});

describe('GitHub Token Routing & Installation Repo Verification', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses /installation/repositories for ghs_ installation tokens and /repos/{owner}/{repo} for verification', async () => {
    const calledUrls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL) => {
        const u = String(url);
        calledUrls.push(u);
        if (u.includes('/installation/repositories')) {
          return new Response(
            JSON.stringify({
              total_count: 1,
              repositories: [
                {
                  id: 1,
                  name: 'my-app',
                  full_name: 'kirlous0/my-app',
                  owner: { login: 'kirlous0' },
                  description: null,
                  private: false,
                  language: 'Kotlin',
                  default_branch: 'main',
                  html_url: 'https://github.com/kirlous0/my-app',
                  pushed_at: null,
                },
              ],
            }),
            { status: 200 }
          );
        }
        if (u.endsWith('/repos/kirlous0/my-app')) {
          return new Response(
            JSON.stringify({
              id: 1,
              name: 'my-app',
              full_name: 'kirlous0/my-app',
              owner: { login: 'kirlous0' },
              description: null,
              private: false,
              language: 'Kotlin',
              default_branch: 'main',
              html_url: 'https://github.com/kirlous0/my-app',
              pushed_at: null,
            }),
            { status: 200 }
          );
        }
        return new Response(JSON.stringify({ message: 'Resource not accessible by integration' }), {
          status: 403,
        });
      })
    );

    const list = await fetchInstallationRepositories('ghs_install_token_123', 185106316);
    expect(list).toHaveLength(1);
    expect(calledUrls[0]).toContain('/installation/repositories');
    expect(calledUrls[0]).not.toContain('/user/installations');

    const verified = await verifyRepoInInstallation(
      'ghs_install_token_123',
      185106316,
      'kirlous0/my-app'
    );
    expect(verified?.full_name).toBe('kirlous0/my-app');
    expect(calledUrls[1]).toBe('https://api.github.com/repos/kirlous0/my-app');

    const denied = await verifyRepoInInstallation(
      'ghs_install_token_123',
      185106316,
      'someone/ungranted-repo'
    );
    expect(denied).toBeNull();
  });

  it('uses /user/installations/{id}/repositories for ghu_ user OAuth tokens', async () => {
    const calledUrls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL) => {
        const u = String(url);
        calledUrls.push(u);
        return new Response(
          JSON.stringify({
            total_count: 1,
            repositories: [
              {
                id: 2,
                name: 'App-maker',
                full_name: 'kirlous0/App-maker',
                owner: { login: 'kirlous0' },
                description: null,
                private: false,
                language: 'TypeScript',
                default_branch: 'main',
                html_url: 'https://github.com/kirlous0/App-maker',
                pushed_at: null,
              },
            ],
          }),
          { status: 200 }
        );
      })
    );

    const verified = await verifyRepoInInstallation(
      'ghu_user_token_456',
      185106316,
      'kirlous0/App-maker'
    );
    expect(verified?.full_name).toBe('kirlous0/App-maker');
    expect(calledUrls[0]).toContain('/user/installations/185106316/repositories');
  });
});
