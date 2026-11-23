import { NextResponse } from 'next/server';
import { dbStore } from '@/lib/db';
import { getGitHubAppConfig, resolveRequestOrigin } from '@/lib/github/config';
import { getSession } from '@/lib/session';

export async function GET(request: Request) {
  const origin = resolveRequestOrigin(request);
  const githubApp = getGitHubAppConfig(origin);
  const session = await getSession();

  if (!session) {
    return NextResponse.json({
      authenticated: false,
      user: null,
      installations: [],
      githubApp,
    });
  }

  const user = await dbStore.getUserById(session.userId);
  if (!user) {
    return NextResponse.json({
      authenticated: false,
      user: null,
      installations: [],
      githubApp,
    });
  }

  const installations = await dbStore.getActiveInstallations(user.id);
  // Strip any encrypted token columns before returning to client
  const safeInstallations = installations.map((inst) => ({
    id: inst.id,
    installation_id: inst.installation_id,
    account_login: inst.account_login,
    account_type: inst.account_type,
    repository_selection: inst.repository_selection,
    permissions: inst.permissions,
    suspended_at: inst.suspended_at,
    created_at: inst.created_at,
  }));

  return NextResponse.json({
    authenticated: safeInstallations.length > 0,
    user,
    installations: safeInstallations,
    githubApp,
  });
}
