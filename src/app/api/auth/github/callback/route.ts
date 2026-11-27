import { NextResponse } from 'next/server';
import { encryptSecret } from '@/lib/crypto';
import { dbStore } from '@/lib/db';
import {
  fetchAuthenticatedUser,
  fetchInstallationRepositories,
  fetchUserInstallations,
} from '@/lib/github/client';
import { getGitHubAppConfig, resolveRequestOrigin } from '@/lib/github/config';
import { exchangeGitHubOAuthCode } from '@/lib/github/oauth';
import { consumeOAuthStateCookie, OAUTH_STATE_COOKIE_NAME, setSessionCookie } from '@/lib/session';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const installationIdParam = url.searchParams.get('installation_id');
  const errorParam = url.searchParams.get('error');
  const cfg = getGitHubAppConfig(resolveRequestOrigin(request));

  if (errorParam) {
    const failUrl = new URL('/dashboard', cfg.appBaseUrl);
    failUrl.searchParams.set('auth_error', errorParam);
    return NextResponse.redirect(failUrl);
  }

  if (!cfg.isConfigured) {
    const setupUrl = new URL('/settings', cfg.appBaseUrl);
    setupUrl.searchParams.set('setup', 'github-app-required');
    return NextResponse.redirect(setupUrl);
  }

  // Note: If user starts from GitHub App "Install" directly without OAuth code, redirect to OAuth login
  if (!code && installationIdParam) {
    const loginUrl = new URL('/api/auth/github/login', cfg.appBaseUrl);
    return NextResponse.redirect(loginUrl);
  }

  if (!code) {
    return NextResponse.redirect(new URL('/dashboard?auth_error=missing_code', cfg.appBaseUrl));
  }

  const stateCheck = await consumeOAuthStateCookie(state);
  if (!stateCheck.valid) {
    return NextResponse.redirect(new URL('/dashboard?auth_error=invalid_state', cfg.appBaseUrl));
  }

  try {
    const tokens = await exchangeGitHubOAuthCode(code, cfg.callbackUrl);
    const ghUser = await fetchAuthenticatedUser(tokens.accessToken);
    const installations = await fetchUserInstallations(tokens.accessToken);

    // If user authenticated via OAuth but hasn't installed the GitHub App yet, send them to install it
    if (installations.length === 0 && cfg.installUrl) {
      const user = await dbStore.upsertUserByGitHub({
        github_user_id: ghUser.id,
        github_login: ghUser.login,
        name: ghUser.name,
        email: ghUser.email,
        avatar_url: ghUser.avatar_url,
      });
      const res = NextResponse.redirect(cfg.installUrl);
      res.cookies.delete(OAUTH_STATE_COOKIE_NAME);
      setSessionCookie(res, user.id, user.github_login, request);
      return res;
    }

    const user = await dbStore.upsertUserByGitHub({
      github_user_id: ghUser.id,
      github_login: ghUser.login,
      name: ghUser.name,
      email: ghUser.email,
      avatar_url: ghUser.avatar_url,
    });

    const encAccess = encryptSecret(tokens.accessToken);
    const encRefresh = tokens.refreshToken ? encryptSecret(tokens.refreshToken) : null;

    const authorizedRepos: Parameters<typeof dbStore.replaceUserRepositories>[1] = [];
    for (const inst of installations) {
      await dbStore.upsertGitHubInstallation({
        user_id: user.id,
        installation_id: inst.id,
        account_login: inst.account.login,
        account_type: inst.account.type,
        repository_selection: inst.repository_selection,
        permissions: inst.permissions || {},
        encrypted_user_access_token: encAccess,
        encrypted_user_refresh_token: encRefresh,
        token_expires_at: tokens.expiresAt,
      });

      const repos = await fetchInstallationRepositories(tokens.accessToken, inst.id);
      for (const r of repos) {
        authorizedRepos.push({
          user_id: user.id,
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

    await dbStore.replaceUserRepositories(user.id, authorizedRepos);

    const dest = new URL(stateCheck.returnTo, cfg.appBaseUrl);
    const response = NextResponse.redirect(dest);
    response.cookies.delete(OAUTH_STATE_COOKIE_NAME);
    setSessionCookie(response, user.id, user.github_login, request);
    return response;
  } catch (err) {
    const failUrl = new URL('/dashboard', cfg.appBaseUrl);
    failUrl.searchParams.set(
      'auth_error',
      err instanceof Error ? err.message.slice(0, 140) : 'oauth_failed'
    );
    return NextResponse.redirect(failUrl);
  }
}
