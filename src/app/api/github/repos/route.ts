import { NextResponse } from 'next/server';
import { dbStore } from '@/lib/db';
import { fetchInstallationRepositories, fetchUserInstallations } from '@/lib/github/client';
import { getValidUserAccessTokenForUser } from '@/lib/github/oauth';
import { getSession } from '@/lib/session';

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const url = new URL(request.url);
  const refresh = url.searchParams.get('refresh') === '1';
  const query = (url.searchParams.get('q') || '').trim().toLowerCase();

  try {
    let repos = await dbStore.listUserRepositories(session.userId);
    if (refresh || repos.length === 0) {
      const { accessToken } = await getValidUserAccessTokenForUser(session.userId);
      const installations = await fetchUserInstallations(accessToken);
      const synced: Parameters<typeof dbStore.replaceUserRepositories>[1] = [];

      for (const inst of installations) {
        if (inst.suspended_at) continue;
        const instRepos = await fetchInstallationRepositories(accessToken, inst.id);
        for (const r of instRepos) {
          synced.push({
            user_id: session.userId,
            installation_id: inst.id,
            github_repo_id: r.id,
            owner: r.owner.login,
            name: r.name,
            full_name: r.full_name,
            description: r.description,
            visibility: r.visibility || (r.private ? 'private' : 'public'),
            is_private: Boolean(r.private),
            primary_language: r.language,
            default_branch: r.default_branch,
            html_url: r.html_url,
            pushed_at: r.pushed_at,
          });
        }
      }
      repos = await dbStore.replaceUserRepositories(session.userId, synced);
    }

    const filtered = query
      ? repos.filter(
          (r) =>
            r.full_name.toLowerCase().includes(query) ||
            (r.description || '').toLowerCase().includes(query) ||
            (r.primary_language || '').toLowerCase().includes(query)
        )
      : repos;

    return NextResponse.json({ repositories: filtered, total: repos.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to list repositories';
    const status = msg === 'GITHUB_NOT_CONNECTED' || msg === 'GITHUB_TOKEN_UNAVAILABLE' ? 401 : 502;
    return NextResponse.json({ error: msg }, { status });
  }
}
