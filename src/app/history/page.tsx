import { redirect } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { HistoryClient } from '@/components/HistoryClient';
import { getPageContext } from '@/lib/auth-context';
import { dbStore } from '@/lib/db';

export default async function HistoryPage() {
  const ctx = await getPageContext();
  if (!ctx.user || !ctx.isConnected) {
    redirect('/dashboard');
  }

  const builds = await dbStore.listUserBuilds(ctx.user.id, { limit: 100 });

  return (
    <AppShell lang={ctx.lang} dict={ctx.dict} user={ctx.user} isConnected={ctx.isConnected}>
      <HistoryClient lang={ctx.lang} dict={ctx.dict} initialBuilds={builds} />
    </AppShell>
  );
}
