import { headers } from 'next/headers';
import { dbStore } from '@/lib/db';
import { getGitHubAppConfig, type GitHubAppPublicConfig } from '@/lib/github/config';
import { resolveServerLanguage } from '@/lib/i18n/server';
import { getSession } from '@/lib/session';
import type { UserProfile } from '@/lib/types';

export async function getPageContext() {
  const [{ lang, dir, dict }, session, hdrs] = await Promise.all([
    resolveServerLanguage(),
    getSession(),
    headers(),
  ]);

  const host = hdrs.get('x-forwarded-host') || hdrs.get('host');
  const proto = hdrs.get('x-forwarded-proto') || 'https';
  const origin = host ? `${proto}://${host}` : undefined;
  const githubApp: GitHubAppPublicConfig = getGitHubAppConfig(origin);

  let user: UserProfile | null = null;
  let isConnected = false;

  if (session) {
    try {
      user = await dbStore.getUserById(session.userId);
      if (user) {
        const installs = await dbStore.getActiveInstallations(user.id);
        isConnected = installs.length > 0;
      }
    } catch {
      user = null;
      isConnected = false;
    }
  }

  return {
    lang,
    dir,
    dict,
    user,
    isConnected,
    githubApp,
  };
}
