import { NextResponse } from 'next/server';
import { dbStore } from '@/lib/db';
import { getSession } from '@/lib/session';

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const { id } = await context.params;
  const job = await dbStore.getBuildJob(session.userId, id);
  if (!job) {
    return NextResponse.json({ error: 'Build job not found' }, { status: 404 });
  }

  const [logs, artifact] = await Promise.all([
    dbStore.listBuildLogs(session.userId, job.id),
    dbStore.getBuildArtifactByJob(session.userId, job.id),
  ]);

  return NextResponse.json({ build: job, logs, artifact });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const { id } = await context.params;
  const job = await dbStore.getBuildJob(session.userId, id);
  if (!job) {
    return NextResponse.json({ error: 'Build job not found' }, { status: 404 });
  }

  await dbStore.deleteBuildJob(session.userId, id);
  return NextResponse.json({ ok: true });
}
