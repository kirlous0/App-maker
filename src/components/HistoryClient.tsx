'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Download,
  GitBranch,
  History,
  RefreshCw,
  RotateCcw,
  Search,
  Terminal,
  Trash2,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { StatusBadge } from '@/components/DashboardClient';
import type { Dictionary } from '@/lib/i18n/dictionary';
import type { BuildArtifactRecord, BuildJobRecord, SupportedLanguage } from '@/lib/types';

interface HistoryClientProps {
  lang: SupportedLanguage;
  dict: Dictionary;
  initialBuilds: Array<BuildJobRecord & { artifact: BuildArtifactRecord | null }>;
}

function formatDuration(ms: number | null): string {
  if (!ms || ms <= 0) return '—';
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function HistoryClient({ lang, dict, initialBuilds }: HistoryClientProps) {
  const router = useRouter();
  const [builds, setBuilds] = useState(initialBuilds);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchRepo, setSearchRepo] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = searchRepo.trim().toLowerCase();
    return builds.filter((b) => {
      if (statusFilter !== 'all' && b.status !== statusFilter) return false;
      if (q && !b.repo_full_name.toLowerCase().includes(q) && !b.branch.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [builds, statusFilter, searchRepo]);

  const handleRebuild = async (buildId: string, useLatestCommit: boolean) => {
    setBusyId(buildId);
    try {
      const res = await fetch(`/api/builds/${buildId}/retry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ useLatestCommit }),
      });
      const data = (await res.json()) as { build?: { id: string } };
      if (res.ok && data.build) {
        router.push(`/builds/${data.build.id}`);
      }
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (buildId: string) => {
    if (!window.confirm(dict.history.confirmDelete)) return;
    setBusyId(buildId);
    try {
      const res = await fetch(`/api/builds/${buildId}`, { method: 'DELETE' });
      if (res.ok) {
        setBuilds((prev) => prev.filter((b) => b.id !== buildId));
      }
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-8 space-y-6">
      <div className="border-b border-[#1F2430] pb-5 space-y-1">
        <h1 className="text-2xl font-bold text-white">{dict.history.title}</h1>
        <p className="text-sm text-[#8E98AB]">{dict.history.subtitle}</p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="pointer-events-none absolute top-1/2 -translate-y-1/2 start-3 h-4 w-4 text-[#6B7487]" />
          <input
            type="text"
            value={searchRepo}
            onChange={(e) => setSearchRepo(e.target.value)}
            placeholder={dict.history.searchRepo}
            className="w-full rounded-md border border-[#1F2430] bg-[#0E1117] py-2 ps-9 pe-3 text-sm text-white placeholder-[#6B7487] focus:border-emerald-500/60 focus:outline-none"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label={dict.history.filterStatus}
          className="rounded-md border border-[#1F2430] bg-[#0E1117] px-3 py-2 text-xs text-white focus:border-emerald-500/60 focus:outline-none"
        >
          <option value="all">{dict.history.filterAll}</option>
          <option value="succeeded">{dict.monitor.statusLabels.succeeded}</option>
          <option value="failed">{dict.monitor.statusLabels.failed}</option>
          <option value="running">{dict.monitor.statusLabels.running}</option>
          <option value="queued">{dict.monitor.statusLabels.queued}</option>
          <option value="timed_out">{dict.monitor.statusLabels.timed_out}</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-[#1F2430] bg-[#0E1117] p-12 text-center space-y-3">
          <History className="mx-auto h-8 w-8 text-[#6B7487]" />
          <h2 className="text-base font-semibold text-white">{dict.history.emptyTitle}</h2>
          <p className="text-xs sm:text-sm text-[#8E98AB]">{dict.history.emptyDesc}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[#1F2430] bg-[#0E1117]">
          <table className="w-full text-start text-xs">
            <thead className="border-b border-[#1F2430] bg-[#131720] text-[#8E98AB]">
              <tr>
                <th className="px-4 py-3 text-start font-medium">{dict.history.columns.repository}</th>
                <th className="px-4 py-3 text-start font-medium">{dict.history.columns.branchCommit}</th>
                <th className="px-4 py-3 text-start font-medium">{dict.history.columns.frameworkType}</th>
                <th className="px-4 py-3 text-start font-medium">{dict.history.columns.status}</th>
                <th className="px-4 py-3 text-start font-medium">{dict.history.columns.dateDuration}</th>
                <th className="px-4 py-3 text-end font-medium">{dict.history.columns.actions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1A1F2A]">
              {filtered.map((job) => (
                <tr key={job.id} className="hover:bg-[#12161F]">
                  <td className="px-4 py-3 font-mono font-medium text-white">
                    {job.repo_full_name}
                  </td>
                  <td className="px-4 py-3 font-mono text-[#9AA3B2]">
                    <div className="inline-flex items-center gap-1">
                      <GitBranch className="h-3 w-3" />
                      <span>{job.branch}</span>
                    </div>
                    <div className="text-[11px] text-[#6B7487]">{job.commit_sha.slice(0, 8)}</div>
                  </td>
                  <td className="px-4 py-3 font-mono text-[#CBD2E0]">
                    <div>{job.framework}</div>
                    <div className="text-[11px] text-[#8E98AB]">
                      {job.build_type}
                      {job.is_unsigned ? ' · unsigned' : ''}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge
                      status={job.status}
                      label={dict.monitor.statusLabels[job.status] || job.status}
                    />
                  </td>
                  <td className="px-4 py-3 text-[#8E98AB]">
                    <div>
                      {new Date(job.created_at).toLocaleDateString(
                        lang === 'ar' ? 'ar-EG' : 'en-US'
                      )}
                    </div>
                    <div className="font-mono text-[11px] tabular-nums">
                      {formatDuration(job.duration_ms)}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-end">
                    <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                      {job.status === 'succeeded' && job.artifact && (
                        <a
                          href={`/api/builds/${job.id}/download`}
                          className="inline-flex items-center gap-1 rounded border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1 text-[11px] font-medium text-emerald-300 hover:bg-emerald-500/25"
                        >
                          <Download className="h-3 w-3" />
                          <span>{dict.history.downloadApk}</span>
                        </a>
                      )}
                      <Link
                        href={`/builds/${job.id}`}
                        className="inline-flex items-center gap-1 rounded border border-[#2E3648] bg-[#131720] px-2.5 py-1 text-[11px] text-[#CBD2E0] hover:text-white"
                      >
                        <Terminal className="h-3 w-3" />
                        <span>{dict.history.viewLogs}</span>
                      </Link>
                      <button
                        type="button"
                        disabled={busyId === job.id}
                        onClick={() => handleRebuild(job.id, false)}
                        title={dict.history.rebuildSame}
                        className="inline-flex items-center gap-1 rounded border border-[#2E3648] bg-[#131720] px-2 py-1 text-[11px] text-[#CBD2E0] hover:border-sky-500/40 hover:text-white disabled:opacity-50"
                      >
                        <RotateCcw className="h-3 w-3" />
                        <span className="hidden xl:inline">{dict.history.rebuildSame}</span>
                      </button>
                      <button
                        type="button"
                        disabled={busyId === job.id}
                        onClick={() => handleRebuild(job.id, true)}
                        title={dict.history.rebuildLatest}
                        className="inline-flex items-center gap-1 rounded border border-[#2E3648] bg-[#131720] px-2 py-1 text-[11px] text-[#CBD2E0] hover:border-emerald-500/40 hover:text-white disabled:opacity-50"
                      >
                        <RefreshCw className="h-3 w-3" />
                        <span className="hidden xl:inline">{dict.history.rebuildLatest}</span>
                      </button>
                      <button
                        type="button"
                        disabled={busyId === job.id}
                        onClick={() => handleDelete(job.id)}
                        title={dict.history.deleteBuild}
                        className="inline-flex items-center rounded border border-[#2E3648] bg-[#131720] p-1 text-[#8E98AB] hover:border-red-500/40 hover:text-red-400 disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
