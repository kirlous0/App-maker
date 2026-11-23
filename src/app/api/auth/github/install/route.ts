import { NextResponse } from 'next/server';
import { generateNonce } from '@/lib/crypto';
import { getGitHubAppConfig, resolveRequestOrigin } from '@/lib/github/config';
import { setOAuthStateCookie } from '@/lib/session';

export async function GET(request: Request) {
  const cfg = getGitHubAppConfig(resolveRequestOrigin(request));

  if (!cfg.isConfigured || !cfg.installUrl) {
    const setupUrl = new URL('/settings', cfg.appBaseUrl);
    setupUrl.searchParams.set('setup', 'github-app-required');
    return NextResponse.redirect(setupUrl);
  }

  const state = generateNonce(24);
  const installUrl = new URL(cfg.installUrl);
  installUrl.searchParams.set('state', state);

  const res = NextResponse.redirect(installUrl.toString());
  setOAuthStateCookie(res, state, '/dashboard', request);
  return res;
}
