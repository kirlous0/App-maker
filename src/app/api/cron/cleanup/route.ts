import { NextResponse } from 'next/server';
import { dbStore } from '@/lib/db';

export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  const auth = request.headers.get('authorization');

  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const timeoutMinutes = parseInt(process.env.BUILD_TIMEOUT_MINUTES || '45', 10) || 45;
  const result = await dbStore.cleanupExpiredArtifactsAndStaleBuilds(timeoutMinutes);

  return NextResponse.json({
    ok: true,
    ...result,
    ranAt: new Date().toISOString(),
  });
}
