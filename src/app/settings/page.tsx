import { AppShell } from '@/components/AppShell';
import { SettingsClient } from '@/components/SettingsClient';
import { getPageContext } from '@/lib/auth-context';
import { dbStore } from '@/lib/db';

export default async function SettingsPage() {
  const ctx = await getPageContext();
  const signingConfigs =
    ctx.isConnected && ctx.user ? await dbStore.listSigningConfigs(ctx.user.id) : [];

  return (
    <AppShell lang={ctx.lang} dict={ctx.dict} user={ctx.user} isConnected={ctx.isConnected}>
      <SettingsClient
        lang={ctx.lang}
        dict={ctx.dict}
        user={ctx.user}
        isConnected={ctx.isConnected}
        githubApp={ctx.githubApp}
        initialSigningConfigs={signingConfigs}
      />
    </AppShell>
  );
}
