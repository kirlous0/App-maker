import { notFound, redirect } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { DownloadResultClient } from '@/components/DownloadResultClient';
import { getPageContext } from '@/lib/auth-context';
import { dbStore } from '@/lib/db';

export default async function DownloadPage({
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

  if (job.status !== 'succeeded') {
    redirect(`/builds/${job.id}`);
  }

  const artifact = await dbStore.getBuildArtifactByJob(ctx.user.id, job.id);
  if (!artifact) {
    redirect(`/builds/${job.id}`);
  }

  return (
    <AppShell lang={ctx.lang} dict={ctx.dict} user={ctx.user} isConnected={ctx.isConnected}>
      <DownloadResultClient
        lang={ctx.lang}
        dict={ctx.dict}
        job={job}
        artifact={artifact}
      />
    </AppShell>
  );
}
