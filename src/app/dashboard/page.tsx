import { AppShell } from '@/components/AppShell';
import { DashboardClient } from '@/components/DashboardClient';
import { getPageContext } from '@/lib/auth-context';
import { dbStore } from '@/lib/db';

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ auth_error?: string }>;
}) {
  const [ctx, sp] = await Promise.all([getPageContext(), searchParams]);

  let repos: Awaited<ReturnType<typeof dbStore.listUserRepositories>> = [];
  let builds: Awaited<ReturnType<typeof dbStore.listUserBuilds>> = [];
  let stats: Awaited<ReturnType<typeof dbStore.getBuildStats>> | null = null;

  if (ctx.isConnected && ctx.user) {
    [repos, builds, stats] = await Promise.all([
      dbStore.listUserRepositories(ctx.user.id),
      dbStore.listUserBuilds(ctx.user.id, { limit: 10 }),
      dbStore.getBuildStats(ctx.user.id),
    ]);
  }

  return (
    <AppShell lang={ctx.lang} dict={ctx.dict} user={ctx.user} isConnected={ctx.isConnected}>
      <DashboardClient
        lang={ctx.lang}
        dict={ctx.dict}
        user={ctx.user}
        isConnected={ctx.isConnected}
        githubApp={ctx.githubApp}
        initialRepos={repos}
        initialBuilds={builds}
        initialStats={stats}
        authError={sp.auth_error || null}
      />
    </AppShell>
  );
}
