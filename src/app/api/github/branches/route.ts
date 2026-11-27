import { NextResponse } from 'next/server';
import {
  fetchBranchLatestCommit,
  fetchRepoBranches,
  GitHubApiError,
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
  const selectedBranch = url.searchParams.get('branch');

  if (!repoFullName || !repoFullName.includes('/') || !installationIdRaw) {
    return NextResponse.json({ error: 'repo and installationId are required' }, { status: 400 });
  }

  const installationId = parseInt(installationIdRaw, 10);
  if (Number.isNaN(installationId)) {
    return NextResponse.json({ error: 'Invalid installationId' }, { status: 400 });
  }

  try {
    const token = await getAuthorizedRepoToken(session.userId, installationId);
    const repoMeta = await verifyRepoInInstallation(token, installationId, repoFullName);
    if (!repoMeta) {
      return NextResponse.json({ error: 'REPOSITORY_ACCESS_DENIED' }, { status: 403 });
    }

    const [owner, repo] = repoMeta.full_name.split('/');
    const branches = await fetchRepoBranches(token, owner, repo);
    const activeBranch = selectedBranch || repoMeta.default_branch;

    let latestCommit: Awaited<ReturnType<typeof fetchBranchLatestCommit>> | null = null;
    if (branches.some((b) => b.name === activeBranch)) {
      latestCommit = await fetchBranchLatestCommit(token, owner, repo, activeBranch);
    }

    return NextResponse.json({
      repository: {
        full_name: repoMeta.full_name,
        owner: repoMeta.owner.login,
        name: repoMeta.name,
        description: repoMeta.description,
        visibility: repoMeta.visibility || (repoMeta.private ? 'private' : 'public'),
        is_private: repoMeta.private,
        primary_language: repoMeta.language,
        default_branch: repoMeta.default_branch,
        html_url: repoMeta.html_url,
      },
      branches,
      selectedBranch: activeBranch,
      latestCommit,
    });
  } catch (err) {
    if (err instanceof GitHubApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : 'Failed to fetch branches';
    return NextResponse.json(
      { error: msg },
      { status: msg === 'REPOSITORY_ACCESS_DENIED' ? 403 : 500 }
    );
  }
}
