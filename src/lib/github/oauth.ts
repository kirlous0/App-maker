import { createGitHubAppJwt, decryptSecret, encryptSecret } from '@/lib/crypto';
import { dbStore } from '@/lib/db';

interface OAuthTokenResponse {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  token_type?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

export async function exchangeGitHubOAuthCode(
  code: string,
  redirectUri: string
): Promise<{
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
}> {
  const clientId = process.env.GITHUB_CLIENT_ID?.trim();
  const clientSecret = process.env.GITHUB_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error('GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET are not configured.');
  }

  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });

  const data = (await res.json()) as OAuthTokenResponse;
  if (!res.ok || data.error || !data.access_token) {
    throw new Error(data.error_description || data.error || 'GitHub OAuth code exchange failed.');
  }

  const expiresAt = data.expires_in
    ? new Date(Date.now() + data.expires_in * 1000).toISOString()
    : null;

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || null,
    expiresAt,
  };
}

export async function refreshGitHubUserToken(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
}> {
  const clientId = process.env.GITHUB_CLIENT_ID?.trim();
  const clientSecret = process.env.GITHUB_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error('GitHub App client credentials missing.');
  }

  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  const data = (await res.json()) as OAuthTokenResponse;
  if (!res.ok || data.error || !data.access_token) {
    throw new Error(data.error_description || data.error || 'GitHub token refresh failed.');
  }

  const expiresAt = data.expires_in
    ? new Date(Date.now() + data.expires_in * 1000).toISOString()
    : null;

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken,
    expiresAt,
  };
}

export async function createInstallationAccessToken(installationId: number): Promise<{
  token: string;
  expiresAt: string;
}> {
  const appId = process.env.GITHUB_APP_ID?.trim();
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY?.trim();
  if (!appId || !privateKey) {
    throw new Error('GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY are required.');
  }
  const jwt = createGitHubAppJwt(appId, privateKey);
  const res = await fetch(`https://api.github.com/app/installations/${installationId}/access_tokens`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'Repo2APK',
    },
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to mint installation token (${res.status}): ${errText}`);
  }
  const json = (await res.json()) as { token: string; expires_at: string };
  return { token: json.token, expiresAt: json.expires_at };
}

/**
 * Returns a decrypted user-to-server GitHub token for the authenticated user,
 * automatically refreshing if expired. Never exposes token to client.
 */
export async function getValidUserAccessTokenForUser(userId: string): Promise<{
  accessToken: string;
  installationIds: number[];
}> {
  const installations = await dbStore.getActiveInstallations(userId);
  if (installations.length === 0) {
    throw new Error('GITHUB_NOT_CONNECTED');
  }

  const active = installations.find((inst) => inst.encrypted_user_access_token && !inst.suspended_at);
  if (!active || !active.encrypted_user_access_token) {
    throw new Error('GITHUB_TOKEN_UNAVAILABLE');
  }

  const isExpiring =
    active.token_expires_at &&
    new Date(active.token_expires_at).getTime() - Date.now() < 60_000;

  let token = decryptSecret(active.encrypted_user_access_token);
  if (isExpiring && active.encrypted_user_refresh_token) {
    const refreshed = await refreshGitHubUserToken(
      decryptSecret(active.encrypted_user_refresh_token)
    );
    token = refreshed.accessToken;
    const encAccess = encryptSecret(refreshed.accessToken);
    const encRefresh = refreshed.refreshToken ? encryptSecret(refreshed.refreshToken) : null;
    for (const inst of installations) {
      await dbStore.updateInstallationTokens(inst.id, {
        encrypted_user_access_token: encAccess,
        encrypted_user_refresh_token: encRefresh,
        token_expires_at: refreshed.expiresAt,
      });
    }
  }

  return {
    accessToken: token,
    installationIds: installations.filter((i) => !i.suspended_at).map((i) => i.installation_id),
  };
}

/**
 * Gets a repo-scoped token for an installation the user genuinely owns/is authorized for.
 * Prefers the installation access token when App JWT credentials exist (ensuring strict
 * repository authorization boundaries), falling back to the user-to-server token.
 */
export async function getAuthorizedRepoToken(
  userId: string,
  installationId: number
): Promise<string> {
  const record = await dbStore.getInstallationByNumericId(userId, installationId);
  if (!record || record.suspended_at) {
    throw new Error('REPOSITORY_ACCESS_DENIED');
  }

  if (process.env.GITHUB_APP_ID?.trim() && process.env.GITHUB_APP_PRIVATE_KEY?.trim()) {
    try {
      const minted = await createInstallationAccessToken(installationId);
      return minted.token;
    } catch {
      // Fall back to user-to-server token if installation token minting fails
    }
  }

  const { accessToken } = await getValidUserAccessTokenForUser(userId);
  return accessToken;
}
