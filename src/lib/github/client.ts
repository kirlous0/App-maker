import { sealGitHubActionSecret } from '@/lib/crypto';
import type { GitHubBranchInfo } from '@/lib/types';

const GH_API = 'https://api.github.com';

export class GitHubApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'GitHubApiError';
  }
}

async function ghFetch<T>(pathOrUrl: string, token: string, init?: RequestInit): Promise<T> {
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${GH_API}${pathOrUrl}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'Repo2APK/1.0',
      ...(init?.headers || {}),
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text();
    let msg = text;
    try {
      const parsed = JSON.parse(text) as { message?: string };
      if (parsed.message) msg = parsed.message;
    } catch {
      // plain text
    }
    throw new GitHubApiError(res.status, msg);
  }

  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

export interface GitHubUserResponse {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
  avatar_url: string;
}

export async function fetchAuthenticatedUser(token: string): Promise<GitHubUserResponse> {
  return ghFetch<GitHubUserResponse>('/user', token);
}

export interface GitHubInstallationApi {
  id: number;
  account: {
    login: string;
    type: string;
    avatar_url?: string;
  };
  repository_selection: 'all' | 'selected';
  permissions: Record<string, string>;
  suspended_at: string | null;
  app_slug?: string;
}

export async function fetchUserInstallations(token: string): Promise<GitHubInstallationApi[]> {
  const data = await ghFetch<{ installations: GitHubInstallationApi[] }>(
    '/user/installations?per_page=100',
    token
  );
  const expectedSlug = process.env.GITHUB_APP_SLUG?.trim();
  const list = data.installations || [];
  if (expectedSlug) {
    const matching = list.filter((i) => !i.app_slug || i.app_slug === expectedSlug);
    if (matching.length > 0) return matching;
  }
  return list;
}

export interface GitHubRepoApi {
  id: number;
  name: string;
  full_name: string;
  owner: { login: string };
  description: string | null;
  private: boolean;
  visibility?: string;
  language: string | null;
  default_branch: string;
  html_url: string;
  pushed_at: string | null;
}

export function isInstallationToken(token: string): boolean {
  return token.startsWith('ghs_');
}

export async function fetchInstallationRepositories(
  token: string,
  installationId: number
): Promise<GitHubRepoApi[]> {
  const repos: GitHubRepoApi[] = [];
  const isAppToken = isInstallationToken(token);
  for (let page = 1; page <= 20; page++) {
    const path = isAppToken
      ? `/installation/repositories?per_page=100&page=${page}`
      : `/user/installations/${installationId}/repositories?per_page=100&page=${page}`;
    const data = await ghFetch<{ repositories: GitHubRepoApi[]; total_count: number }>(
      path,
      token
    );
    const batch = data.repositories || [];
    repos.push(...batch);
    if (batch.length < 100 || repos.length >= data.total_count) break;
  }
  return repos;
}

export async function verifyRepoInInstallation(
  token: string,
  installationId: number,
  fullName: string
): Promise<GitHubRepoApi | null> {
  const parts = fullName.split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return null;
  }
  if (isInstallationToken(token)) {
    const [owner, repo] = parts;
    try {
      const repoMeta = await ghFetch<GitHubRepoApi>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
        token
      );
      return repoMeta.full_name.toLowerCase() === fullName.toLowerCase() ? repoMeta : null;
    } catch (err) {
      if (err instanceof GitHubApiError && (err.status === 403 || err.status === 404)) {
        return null;
      }
      throw err;
    }
  }
  const repos = await fetchInstallationRepositories(token, installationId);
  return repos.find((r) => r.full_name.toLowerCase() === fullName.toLowerCase()) || null;
}

export async function fetchRepoBranches(
  token: string,
  owner: string,
  repo: string
): Promise<GitHubBranchInfo[]> {
  const branches = await ghFetch<
    Array<{
      name: string;
      commit: { sha: string; url: string };
      protected: boolean;
    }>
  >(`/repos/${owner}/${repo}/branches?per_page=100`, token);

  return branches.map((b) => ({
    name: b.name,
    commitSha: b.commit.sha,
    commitMessage: null,
    commitAuthor: null,
    commitDate: null,
    isProtected: Boolean(b.protected),
  }));
}

export async function fetchBranchLatestCommit(
  token: string,
  owner: string,
  repo: string,
  branch: string
): Promise<{ sha: string; message: string | null; author: string | null; date: string | null }> {
  const data = await ghFetch<{
    sha: string;
    commit: {
      message: string;
      author: { name?: string; date?: string } | null;
    };
  }>(`/repos/${owner}/${repo}/commits/${encodeURIComponent(branch)}`, token);
  return {
    sha: data.sha,
    message: data.commit?.message?.split('\n')[0] || null,
    author: data.commit?.author?.name || null,
    date: data.commit?.author?.date || null,
  };
}

export interface GitTreeItem {
  path: string;
  mode: string;
  type: 'blob' | 'tree';
  sha: string;
  size?: number;
}

export async function fetchRepoTree(
  token: string,
  owner: string,
  repo: string,
  treeSha: string
): Promise<{ tree: GitTreeItem[]; truncated: boolean }> {
  return ghFetch<{ tree: GitTreeItem[]; truncated: boolean }>(
    `/repos/${owner}/${repo}/git/trees/${encodeURIComponent(treeSha)}?recursive=1`,
    token
  );
}

export async function fetchRepoFileContent(
  token: string,
  owner: string,
  repo: string,
  filePath: string,
  ref?: string
): Promise<{ content: string; sha: string } | null> {
  const cleanPath = filePath.replace(/^\/+/, '');
  const qs = ref ? `?ref=${encodeURIComponent(ref)}` : '';
  try {
    const data = await ghFetch<{
      type: string;
      encoding?: string;
      content?: string;
      sha: string;
    }>(`/repos/${owner}/${repo}/contents/${cleanPath.split('/').map(encodeURIComponent).join('/')}${qs}`, token);
    if (data.type !== 'file' || !data.content) return null;
    const decoded =
      data.encoding === 'base64'
        ? Buffer.from(data.content.replace(/\n/g, ''), 'base64').toString('utf8')
        : data.content;
    return { content: decoded, sha: data.sha };
  } catch (err) {
    if (err instanceof GitHubApiError && err.status === 404) return null;
    throw err;
  }
}

export async function putRepoFileContent(
  token: string,
  owner: string,
  repo: string,
  filePath: string,
  params: {
    message: string;
    content: string;
    branch: string;
    sha?: string;
  }
): Promise<{ commitSha: string }> {
  const cleanPath = filePath.replace(/^\/+/, '');
  const data = await ghFetch<{ commit: { sha: string } }>(
    `/repos/${owner}/${repo}/contents/${cleanPath.split('/').map(encodeURIComponent).join('/')}`,
    token,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: params.message,
        content: Buffer.from(params.content, 'utf8').toString('base64'),
        branch: params.branch,
        ...(params.sha ? { sha: params.sha } : {}),
      }),
    }
  );
  return { commitSha: data.commit.sha };
}

export async function checkActionsPermissions(
  token: string,
  owner: string,
  repo: string
): Promise<{ enabled: boolean; reason?: string }> {
  try {
    const res = await ghFetch<{ enabled: boolean; allowed_actions?: string }>(
      `/repos/${owner}/${repo}/actions/permissions`,
      token
    );
    return { enabled: Boolean(res.enabled) };
  } catch (err) {
    if (err instanceof GitHubApiError && (err.status === 403 || err.status === 404)) {
      // May simply lack admin permission to read actions/permissions while still allowing workflow_dispatch
      return { enabled: true };
    }
    return { enabled: true };
  }
}

export async function setRepoActionSecret(
  token: string,
  owner: string,
  repo: string,
  secretName: string,
  secretValue: string
): Promise<void> {
  const pubKey = await ghFetch<{ key_id: string; key: string }>(
    `/repos/${owner}/${repo}/actions/secrets/public-key`,
    token
  );
  const encryptedValue = await sealGitHubActionSecret(pubKey.key, secretValue);
  await ghFetch<void>(`/repos/${owner}/${repo}/actions/secrets/${encodeURIComponent(secretName)}`, token, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      encrypted_value: encryptedValue,
      key_id: pubKey.key_id,
    }),
  });
}

export async function deleteRepoActionSecret(
  token: string,
  owner: string,
  repo: string,
  secretName: string
): Promise<void> {
  try {
    await ghFetch<void>(
      `/repos/${owner}/${repo}/actions/secrets/${encodeURIComponent(secretName)}`,
      token,
      { method: 'DELETE' }
    );
  } catch {
    // Ignore 404 during cleanup
  }
}

export async function dispatchWorkflow(
  token: string,
  owner: string,
  repo: string,
  workflowFile: string,
  ref: string,
  inputs: Record<string, string>
): Promise<void> {
  await ghFetch<void>(
    `/repos/${owner}/${repo}/actions/workflows/${encodeURIComponent(workflowFile)}/dispatches`,
    token,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref, inputs }),
    }
  );
}

export interface GitHubWorkflowRunApi {
  id: number;
  name: string;
  status: string; // queued | in_progress | completed | waiting | requested | pending
  conclusion: string | null; // success | failure | cancelled | timed_out | skipped | action_required | null
  html_url: string;
  run_started_at?: string;
  created_at: string;
  updated_at: string;
  head_sha: string;
  head_branch: string;
}

export async function listWorkflowRuns(
  token: string,
  owner: string,
  repo: string,
  workflowFile: string
): Promise<GitHubWorkflowRunApi[]> {
  const data = await ghFetch<{ workflow_runs: GitHubWorkflowRunApi[] }>(
    `/repos/${owner}/${repo}/actions/workflows/${encodeURIComponent(workflowFile)}/runs?event=workflow_dispatch&per_page=20`,
    token
  );
  return data.workflow_runs || [];
}

export async function getWorkflowRun(
  token: string,
  owner: string,
  repo: string,
  runId: number
): Promise<GitHubWorkflowRunApi> {
  return ghFetch<GitHubWorkflowRunApi>(`/repos/${owner}/${repo}/actions/runs/${runId}`, token);
}

export interface GitHubWorkflowStepApi {
  name: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion: string | null;
  number: number;
  started_at: string | null;
  completed_at: string | null;
}

export interface GitHubWorkflowJobApi {
  id: number;
  name: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion: string | null;
  started_at: string | null;
  completed_at: string | null;
  steps?: GitHubWorkflowStepApi[];
}

export async function listWorkflowRunJobs(
  token: string,
  owner: string,
  repo: string,
  runId: number
): Promise<GitHubWorkflowJobApi[]> {
  const data = await ghFetch<{ jobs: GitHubWorkflowJobApi[] }>(
    `/repos/${owner}/${repo}/actions/runs/${runId}/jobs?per_page=30`,
    token
  );
  return data.jobs || [];
}

export async function downloadWorkflowJobLogs(
  token: string,
  owner: string,
  repo: string,
  jobId: number
): Promise<string | null> {
  const res = await fetch(`${GH_API}/repos/${owner}/${repo}/actions/jobs/${jobId}/logs`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'Repo2APK/1.0',
    },
    redirect: 'follow',
    cache: 'no-store',
  });
  if (res.status === 404 || res.status === 410) return null;
  if (!res.ok) return null;
  return await res.text();
}

export interface GitHubArtifactApi {
  id: number;
  name: string;
  size_in_bytes: number;
  archive_download_url: string;
  expired: boolean;
  created_at: string;
}

export async function listWorkflowRunArtifacts(
  token: string,
  owner: string,
  repo: string,
  runId: number
): Promise<GitHubArtifactApi[]> {
  const data = await ghFetch<{ artifacts: GitHubArtifactApi[] }>(
    `/repos/${owner}/${repo}/actions/runs/${runId}/artifacts`,
    token
  );
  return data.artifacts || [];
}

export async function downloadWorkflowArtifactZip(
  token: string,
  owner: string,
  repo: string,
  artifactId: number
): Promise<Buffer> {
  const res = await fetch(`${GH_API}/repos/${owner}/${repo}/actions/artifacts/${artifactId}/zip`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'Repo2APK/1.0',
    },
    redirect: 'follow',
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new GitHubApiError(res.status, `Failed to download GitHub artifact zip (${res.status})`);
  }
  return Buffer.from(await res.arrayBuffer());
}
