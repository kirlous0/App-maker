'use client';

import Link from 'next/link';
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  FolderGit2,
  GitBranch,
  Globe,
  Lock,
  RefreshCw,
  Search,
  Settings,
  XCircle,
} from 'lucide-react';
import { GitHubIcon } from '@/components/GitHubIcon';
import { useMemo, useState } from 'react';
import type { Dictionary } from '@/lib/i18n/dictionary';
import type { GitHubAppPublicConfig } from '@/lib/github/config';
import type {
  BuildArtifactRecord,
  BuildJobRecord,
  BuildStats,
  RepositoryRecord,
  SupportedLanguage,
  UserProfile,
} from '@/lib/types';

interface DashboardClientProps {
  lang: SupportedLanguage;
  dict: Dictionary;
  user: UserProfile | null;
  isConnected: boolean;
  githubApp: GitHubAppPublicConfig;
  initialRepos: RepositoryRecord[];
  initialBuilds: Array<BuildJobRecord & { artifact: BuildArtifactRecord | null }>;
  initialStats: BuildStats | null;
  authError?: string | null;
}

function formatDuration(ms: number | null): string {
  if (!ms || ms <= 0) return '—';
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function DashboardClient({
  lang,
  dict,
  user,
  isConnected,
  githubApp,
  initialRepos,
  initialBuilds,
  initialStats,
  authError,
}: DashboardClientProps) {
  const [repos, setRepos] = useState<RepositoryRecord[]>(initialRepos);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [visibilityFilter, setVisibilityFilter] = useState<'all' | 'public' | 'private'>('all');

  const filteredRepos = useMemo(() => {
    const q = query.trim().toLowerCase();
    return repos.filter((r) => {
      if (visibilityFilter === 'public' && r.is_private) return false;
      if (visibilityFilter === 'private' && !r.is_private) return false;
      if (!q) return true;
      return (
        r.full_name.toLowerCase().includes(q) ||
        (r.description || '').toLowerCase().includes(q) ||
        (r.primary_language || '').toLowerCase().includes(q)
      );
    });
  }, [repos, query, visibilityFilter]);

  const handleSyncRepos = async () => {
    setSyncing(true);
    setSyncError(null);
    try {
      const res = await fetch('/api/github/repos?refresh=1');
      const data = (await res.json()) as { repositories?: RepositoryRecord[]; error?: string };
      if (!res.ok) {
        setSyncError(data.error || 'Sync failed');
      } else if (data.repositories) {
        setRepos(data.repositories);
      }
    } catch {
      setSyncError('Network error while syncing repositories.');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#1F2430] pb-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-white">{dict.dashboard.title}</h1>
          <p className="text-sm text-[#8E98AB]">{dict.dashboard.subtitle}</p>
        </div>

        {isConnected && user && (
          <div className="flex items-center gap-3 rounded-lg border border-[#1F2430] bg-[#0E1117] px-3.5 py-2">
            {user.avatar_url && (
              <img
                src={user.avatar_url}
                alt={user.github_login}
                className="h-8 w-8 rounded-full border border-[#2E3648]"
              />
            )}
            <div className="text-xs">
              <div className="text-[#8E98AB]">{dict.nav.connectedAs}</div>
              <div className="font-mono font-semibold text-white">@{user.github_login}</div>
            </div>
            {githubApp.installUrl && (
              <a
                href={githubApp.installUrl}
                target="_blank"
                rel="noreferrer"
                className="ms-2 inline-flex items-center gap-1 rounded border border-[#2E3648] bg-[#131720] px-2.5 py-1 text-[11px] text-[#CBD2E0] hover:border-emerald-500/40"
              >
                <span>{dict.dashboard.manageAccess}</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        )}
      </div>

      {authError && (
        <div className="flex items-center gap-2.5 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="font-mono text-xs">{authError}</span>
        </div>
      )}

      {!githubApp.isConfigured && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-5">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h2 className="text-sm font-semibold text-amber-200">{dict.dashboard.setupBannerTitle}</h2>
              <p className="text-xs text-amber-200/80">{dict.dashboard.setupBannerDesc}</p>
            </div>
          </div>
          <Link
            href="/settings"
            className="shrink-0 inline-flex items-center gap-1.5 rounded-md border border-amber-400/40 bg-amber-500/15 px-3.5 py-2 text-xs font-semibold text-amber-200 hover:bg-amber-500/25"
          >
            <Settings className="h-3.5 w-3.5" />
            <span>{dict.dashboard.goToSettings}</span>
          </Link>
        </div>
      )}

      {!isConnected ? (
        <div className="rounded-lg border border-[#1F2430] bg-[#0E1117] p-8 sm:p-12 text-center space-y-5">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg border border-[#2E3648] bg-[#131720] text-emerald-400">
            <GitHubIcon className="h-6 w-6" />
          </div>
          <div className="space-y-2 max-w-md mx-auto">
            <h2 className="text-lg font-semibold text-white">{dict.nav.notConnected}</h2>
            <p className="text-sm text-[#8E98AB]">
              {lang === 'ar'
                ? 'اربط حسابك عبر GitHub App لعرض المستودعات المصرح بها وتحليل تطبيقات أندرويد.'
                : 'Connect your account via GitHub App OAuth to browse authorized repositories and inspect Android projects.'}
            </p>
          </div>
          {githubApp.isConfigured ? (
            <a
              href="/api/auth/github/login"
              className="inline-flex items-center gap-2 rounded-md bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-[#04140E] hover:bg-emerald-400"
            >
              <GitHubIcon className="h-4 w-4" />
              <span>{dict.nav.connectGithub}</span>
            </a>
          ) : (
            <Link
              href="/settings"
              className="inline-flex items-center gap-2 rounded-md border border-[#2E3648] bg-[#131720] px-5 py-2.5 text-sm font-semibold text-white hover:border-emerald-500/40"
            >
              <Settings className="h-4 w-4" />
              <span>{dict.dashboard.goToSettings}</span>
            </Link>
          )}
        </div>
      ) : (
        <>
          {/* Real Build Statistics */}
          {initialStats && (
            <section className="grid gap-4 grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border border-[#1F2430] bg-[#0E1117] p-4 space-y-1.5">
                <div className="text-xs text-[#8E98AB]">{dict.dashboard.stats.totalBuilds}</div>
                <div className="text-2xl font-bold font-mono tabular-nums text-white">
                  {initialStats.totalBuilds}
                </div>
              </div>
              <div className="rounded-lg border border-[#1F2430] bg-[#0E1117] p-4 space-y-1.5">
                <div className="text-xs text-[#8E98AB]">{dict.dashboard.stats.successRate}</div>
                <div className="text-2xl font-bold font-mono tabular-nums text-emerald-400">
                  {initialStats.successRate}%
                </div>
              </div>
              <div className="rounded-lg border border-[#1F2430] bg-[#0E1117] p-4 space-y-1.5">
                <div className="text-xs text-[#8E98AB]">{dict.dashboard.stats.avgDuration}</div>
                <div className="text-2xl font-bold font-mono tabular-nums text-white">
                  {formatDuration(initialStats.averageDurationMs)}
                </div>
              </div>
              <div className="rounded-lg border border-[#1F2430] bg-[#0E1117] p-4 space-y-1.5">
                <div className="text-xs text-[#8E98AB]">{dict.dashboard.stats.activeBuilds}</div>
                <div className="text-2xl font-bold font-mono tabular-nums text-sky-400">
                  {initialStats.activeBuilds}
                </div>
              </div>
            </section>
          )}

          {/* Repository Browser */}
          <section className="space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="pointer-events-none absolute top-1/2 -translate-y-1/2 start-3 h-4 w-4 text-[#6B7487]" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={dict.dashboard.searchPlaceholder}
                  className="w-full rounded-md border border-[#1F2430] bg-[#0E1117] py-2 ps-9 pe-3 text-sm text-white placeholder-[#6B7487] focus:border-emerald-500/60 focus:outline-none"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-md border border-[#1F2430] bg-[#0E1117] p-0.5 text-xs">
                  {(['all', 'public', 'private'] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setVisibilityFilter(v)}
                      className={`rounded px-2.5 py-1 transition-colors ${
                        visibilityFilter === v
                          ? 'bg-[#1C222E] text-white font-medium'
                          : 'text-[#8E98AB] hover:text-white'
                      }`}
                    >
                      {v === 'all'
                        ? dict.dashboard.allVisibility
                        : v === 'public'
                        ? dict.dashboard.publicOnly
                        : dict.dashboard.privateOnly}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={handleSyncRepos}
                  disabled={syncing}
                  className="inline-flex items-center gap-1.5 rounded-md border border-[#2E3648] bg-[#131720] px-3 py-1.5 text-xs font-medium text-white hover:border-emerald-500/50 disabled:opacity-60"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
                  <span>{dict.dashboard.syncRepos}</span>
                </button>
              </div>
            </div>

            {syncError && (
              <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                {syncError}
              </div>
            )}

            {filteredRepos.length === 0 ? (
              <div className="rounded-lg border border-[#1F2430] bg-[#0E1117] p-8 text-center space-y-3">
                <FolderGit2 className="mx-auto h-8 w-8 text-[#6B7487]" />
                <h3 className="text-sm font-semibold text-white">{dict.dashboard.noReposTitle}</h3>
                <p className="text-xs text-[#8E98AB]">{dict.dashboard.noReposDesc}</p>
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {filteredRepos.map((repo) => (
                  <div
                    key={repo.id}
                    className="flex flex-col justify-between rounded-lg border border-[#1F2430] bg-[#0E1117] p-4 hover:border-[#2E3648] transition-colors"
                  >
                    <div className="space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-mono text-[11px] text-[#8E98AB] truncate">
                            {repo.owner}
                          </div>
                          <div className="font-mono text-sm font-semibold text-white truncate">
                            {repo.name}
                          </div>
                        </div>
                        <span
                          className={`inline-flex shrink-0 items-center gap-1 rounded border px-2 py-0.5 text-[10px] font-mono ${
                            repo.is_private
                              ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                              : 'border-[#2E3648] bg-[#131720] text-[#9AA3B2]'
                          }`}
                        >
                          {repo.is_private ? (
                            <Lock className="h-2.5 w-2.5" />
                          ) : (
                            <Globe className="h-2.5 w-2.5" />
                          )}
                          <span>{repo.visibility}</span>
                        </span>
                      </div>

                      <p className="text-xs text-[#8E98AB] line-clamp-2 min-h-[2rem]">
                        {repo.description || '—'}
                      </p>
                    </div>

                    <div className="mt-4 pt-3 border-t border-[#1A1F2A] flex items-center justify-between gap-2">
                      <div className="flex items-center gap-3 text-[11px] font-mono text-[#8E98AB]">
                        <span>{repo.primary_language || 'Multi'}</span>
                        <span className="inline-flex items-center gap-1">
                          <GitBranch className="h-3 w-3" />
                          {repo.default_branch}
                        </span>
                      </div>

                      <Link
                        href={`/configure?repo=${encodeURIComponent(repo.full_name)}&installationId=${repo.installation_id}`}
                        className="rounded-md border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-500/25 transition-colors"
                      >
                        {dict.dashboard.selectRepo}
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Recent Builds */}
          <section className="space-y-4">
            <div className="flex items-center justify-between border-b border-[#1F2430] pb-3">
              <h2 className="text-lg font-semibold text-white">{dict.dashboard.recentBuilds}</h2>
              <Link
                href="/history"
                className="text-xs font-medium text-emerald-400 hover:text-emerald-300"
              >
                {dict.dashboard.viewAllHistory}
              </Link>
            </div>

            {initialBuilds.length === 0 ? (
              <div className="rounded-lg border border-[#1F2430] bg-[#0E1117] p-6 text-center text-xs text-[#8E98AB]">
                {dict.dashboard.noBuildsYet}
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-[#1F2430] bg-[#0E1117]">
                <table className="w-full text-start text-xs">
                  <thead className="border-b border-[#1F2430] bg-[#131720] text-[#8E98AB]">
                    <tr>
                      <th className="px-4 py-2.5 text-start font-medium">{dict.history.columns.repository}</th>
                      <th className="px-4 py-2.5 text-start font-medium">{dict.history.columns.branchCommit}</th>
                      <th className="px-4 py-2.5 text-start font-medium">{dict.history.columns.frameworkType}</th>
                      <th className="px-4 py-2.5 text-start font-medium">{dict.history.columns.status}</th>
                      <th className="px-4 py-2.5 text-start font-medium">{dict.history.columns.dateDuration}</th>
                      <th className="px-4 py-2.5 text-end font-medium">{dict.history.columns.actions}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1A1F2A]">
                    {initialBuilds.slice(0, 6).map((job) => (
                      <tr key={job.id} className="hover:bg-[#12161F]">
                        <td className="px-4 py-3 font-mono text-white">{job.repo_full_name}</td>
                        <td className="px-4 py-3 font-mono text-[#9AA3B2]">
                          {job.branch} · {job.commit_sha.slice(0, 7)}
                        </td>
                        <td className="px-4 py-3 font-mono text-[#CBD2E0]">
                          {job.framework} / {job.build_type}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={job.status} label={dict.monitor.statusLabels[job.status] || job.status} />
                        </td>
                        <td className="px-4 py-3 font-mono tabular-nums text-[#8E98AB]">
                          {formatDuration(job.duration_ms)}
                        </td>
                        <td className="px-4 py-3 text-end">
                          <div className="inline-flex items-center gap-2">
                            <Link
                              href={`/builds/${job.id}`}
                              className="rounded border border-[#2E3648] bg-[#131720] px-2.5 py-1 text-[11px] text-[#CBD2E0] hover:text-white"
                            >
                              {dict.history.viewLogs}
                            </Link>
                            {job.status === 'succeeded' && job.artifact && (
                              <Link
                                href={`/builds/${job.id}/download`}
                                className="inline-flex items-center gap-1 rounded border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1 text-[11px] text-emerald-300 hover:bg-emerald-500/25"
                              >
                                <Download className="h-3 w-3" />
                                <span>{dict.history.downloadApk}</span>
                              </Link>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

export function StatusBadge({ status, label }: { status: string; label: string }) {
  if (status === 'succeeded') {
    return (
      <span className="inline-flex items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
        <CheckCircle2 className="h-3 w-3" />
        <span>{label}</span>
      </span>
    );
  }
  if (['failed', 'cancelled', 'timed_out'].includes(status)) {
    return (
      <span className="inline-flex items-center gap-1 rounded border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[11px] font-medium text-red-300">
        <XCircle className="h-3 w-3" />
        <span>{label}</span>
      </span>
    );
  }
  if (['running', 'validating', 'storing'].includes(status)) {
    return (
      <span className="inline-flex items-center gap-1 rounded border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium text-sky-300">
        <Activity className="h-3 w-3 animate-pulse" />
        <span>{label}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded border border-[#2E3648] bg-[#131720] px-2 py-0.5 text-[11px] font-medium text-[#CBD2E0]">
      <Clock className="h-3 w-3" />
      <span>{label}</span>
    </span>
  );
}
