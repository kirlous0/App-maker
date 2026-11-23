import { NextResponse } from 'next/server';
import { verifyGitHubWebhookSignature } from '@/lib/crypto';
import { dbStore } from '@/lib/db';
import { syncBuildJobWithGitHub } from '@/lib/builds/sync-engine';

export async function POST(request: Request) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: 'GITHUB_WEBHOOK_SECRET is not configured' }, { status: 503 });
  }

  const rawBody = await request.text();
  const sig = request.headers.get('x-hub-signature-256');
  const event = request.headers.get('x-github-event') || '';

  if (!verifyGitHubWebhookSignature(rawBody, sig, secret)) {
    return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  if (event === 'installation') {
    const action = String(payload.action || '');
    const inst = payload.installation as { id?: number } | undefined;
    if (inst?.id) {
      if (action === 'suspend') {
        await dbStore.suspendInstallationByNumericId(inst.id, new Date().toISOString());
      } else if (action === 'unsuspend') {
        await dbStore.suspendInstallationByNumericId(inst.id, null);
      }
    }
    return NextResponse.json({ ok: true, event, action });
  }

  if (event === 'workflow_run') {
    const run = payload.workflow_run as { id?: number; name?: string } | undefined;
    if (run?.id) {
      let job = await dbStore.getBuildJobByGitHubRunId(run.id);
      if (!job && run.name) {
        const nonceMatch = run.name.match(/\[([a-f0-9]+)\]/i);
        if (nonceMatch?.[1]) {
          job = await dbStore.getBuildJobByNonce(nonceMatch[1]);
          if (job) {
            await dbStore.updateBuildJob(job.id, { github_run_id: run.id });
          }
        }
      }
      if (job) {
        await syncBuildJobWithGitHub(job.user_id, job.id).catch(() => null);
      }
    }
    return NextResponse.json({ ok: true, event });
  }

  if (event === 'workflow_job') {
    const wfJob = payload.workflow_job as { run_id?: number } | undefined;
    if (wfJob?.run_id) {
      const job = await dbStore.getBuildJobByGitHubRunId(wfJob.run_id);
      if (job) {
        await syncBuildJobWithGitHub(job.user_id, job.id).catch(() => null);
      }
    }
    return NextResponse.json({ ok: true, event });
  }

  return NextResponse.json({ ok: true, ignored: event });
}
