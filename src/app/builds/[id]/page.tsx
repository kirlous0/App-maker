import { notFound, redirect } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { BuildMonitorClient } from '@/components/BuildMonitorClient';
import { getPageContext } from '@/lib/auth-context';
import { dbStore } from '@/lib/db';

export default async function BuildMonitorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [ctx, { id }] = await Promise.all([getPageContext(), params]);
  if (!ctx.user || !ctx.isConnected) {
    redirect('/dashboard');
  }

  const job = await dbStore.getBuildJob(ctx.user.id, id);
  if (!job) {
    notFound();
  }

  const [logs, artifact] = await Promise.all([
    dbStore.listBuildLogs(ctx.user.id, job.id),
    dbStore.getBuildArtifactByJob(ctx.user.id, job.id),
  ]);

  return (
    <AppShell lang={ctx.lang} dict={ctx.dict} user={ctx.user} isConnected={ctx.isConnected}>
      <BuildMonitorClient
        lang={ctx.lang}
        dict={ctx.dict}
        initialJob={job}
        initialLogs={logs}
        initialArtifact={artifact}
      />
    </AppShell>
  );
}
