import { AppShell } from '@/components/AppShell';
import { LandingClient } from '@/components/LandingClient';
import { getPageContext } from '@/lib/auth-context';

export default async function HomePage() {
  const ctx = await getPageContext();

  return (
    <AppShell lang={ctx.lang} dict={ctx.dict} user={ctx.user} isConnected={ctx.isConnected}>
      <LandingClient
        lang={ctx.lang}
        dict={ctx.dict}
        isConnected={ctx.isConnected}
        githubApp={ctx.githubApp}
      />
    </AppShell>
  );
}
