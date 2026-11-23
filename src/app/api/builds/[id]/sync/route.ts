import { NextResponse } from 'next/server';
import { syncBuildJobWithGitHub } from '@/lib/builds/sync-engine';
import { getSession } from '@/lib/session';

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const { id } = await context.params;
  try {
    const result = await syncBuildJobWithGitHub(session.userId, id);
    return NextResponse.json({
      build: result.job,
      logs: result.logs,
      artifact: result.artifact,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Sync failed';
    const status = msg === 'BUILD_NOT_FOUND' ? 404 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
