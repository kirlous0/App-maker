import { NextResponse } from 'next/server';
import { generateNonce } from '@/lib/crypto';
import { getGitHubAppConfig, resolveRequestOrigin } from '@/lib/github/config';
import { setOAuthStateCookie } from '@/lib/session';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const returnTo = url.searchParams.get('returnTo') || '/dashboard';
  const safeReturnTo = returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/dashboard';
  const cfg = getGitHubAppConfig(resolveRequestOrigin(request));

  if (!cfg.isConfigured || !process.env.GITHUB_CLIENT_ID) {
    const setupUrl = new URL('/settings', cfg.appBaseUrl);
    setupUrl.searchParams.set('setup', 'github-app-required');
    return NextResponse.redirect(setupUrl);
  }

  const state = generateNonce(24);
  const authUrl = new URL('https://github.com/login/oauth/authorize');
  authUrl.searchParams.set('client_id', process.env.GITHUB_CLIENT_ID.trim());
  authUrl.searchParams.set('redirect_uri', cfg.callbackUrl);
  authUrl.searchParams.set('state', state);

  const response = NextResponse.redirect(authUrl.toString());
  setOAuthStateCookie(response, state, safeReturnTo, request);
  return response;
}
