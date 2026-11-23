import { NextResponse } from 'next/server';
import { generateNonce } from '@/lib/crypto';
import { getGitHubAppConfig, resolveRequestOrigin } from '@/lib/github/config';
import { buildGitHubAppManifest } from '@/lib/github/manifest';
import { setManifestStateCookie } from '@/lib/session';

export async function POST(request: Request) {
  const origin = resolveRequestOrigin(request);
  const cfg = getGitHubAppConfig(origin);

  if (cfg.isConfigured) {
    return NextResponse.json(
      { error: 'GitHub App is already configured on this deployment.' },
      { status: 409 }
    );
  }

  let body: { appName?: string; organization?: string } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  const state = generateNonce(24);
  const manifest = buildGitHubAppManifest(cfg.appBaseUrl, body.appName);
  const org = (body.organization || '').trim().replace(/[^A-Za-z0-9-]/g, '');
  const baseGithubUrl = org
    ? `https://github.com/organizations/${encodeURIComponent(org)}/settings/apps/new`
    : 'https://github.com/settings/apps/new';
  const actionUrl = `${baseGithubUrl}?state=${encodeURIComponent(state)}`;

  const response = NextResponse.json({
    actionUrl,
    manifestJson: JSON.stringify(manifest),
  });
  setManifestStateCookie(response, state, request);
  return response;
}
