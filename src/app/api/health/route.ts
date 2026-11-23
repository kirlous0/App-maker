import { NextResponse } from 'next/server';
import { checkDatabaseHealth } from '@/lib/db';
import { getGitHubAppConfig } from '@/lib/github/config';

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const db = await checkDatabaseHealth();
  const github = getGitHubAppConfig(origin);

  return NextResponse.json(
    {
      status: db.ok ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      database: db,
      githubApp: {
        isConfigured: github.isConfigured,
        appSlug: github.appSlug,
        missingVars: github.missingVars,
      },
    },
    { status: db.ok ? 200 : 503 }
  );
}
