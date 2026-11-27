import { redirect } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { ConfigureClient } from '@/components/ConfigureClient';
import { getPageContext } from '@/lib/auth-context';
import { dbStore } from '@/lib/db';

export default async function ConfigurePage({
  searchParams,
}: {
  searchParams: Promise<{ repo?: string; installationId?: string }>;
}) {
  const [ctx, sp] = await Promise.all([getPageContext(), searchParams]);

  if (!ctx.isConnected || !ctx.user) {
    redirect('/dashboard');
  }

  const repoFullName = sp.repo || '';
  const installationId = parseInt(sp.installationId || '', 10);
  if (!repoFullName || Number.isNaN(installationId)) {
    redirect('/dashboard');
  }

  const signingConfigs = await dbStore.listSigningConfigs(ctx.user.id);

  return (
    <AppShell lang={ctx.lang} dict={ctx.dict} user={ctx.user} isConnected={ctx.isConnected}>
      <ConfigureClient
        lang={ctx.lang}
        dict={ctx.dict}
        repoFullName={repoFullName}
        installationId={installationId}
        defaultBuildType={ctx.user.default_build_type}
        savedSigningConfigs={signingConfigs}
      />
    </AppShell>
  );
}
