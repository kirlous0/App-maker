'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  ExternalLink,
  Loader2,
  Maximize2,
  Minimize2,
  RefreshCw,
  RotateCcw,
  Terminal,
  XCircle,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { StatusBadge } from '@/components/DashboardClient';
import { BUILD_STAGES } from '@/lib/builds/stages';
import type { Dictionary } from '@/lib/i18n/dictionary';
import type {
  BuildArtifactRecord,
  BuildJobRecord,
  BuildLogRecord,
  ErrorDiagnostic,
  SupportedLanguage,
} from '@/lib/types';

interface BuildMonitorClientProps {
  lang: SupportedLanguage;
  dict: Dictionary;
  initialJob: BuildJobRecord;
  initialLogs: BuildLogRecord[];
  initialArtifact: BuildArtifactRecord | null;
}

function formatDurationMs(ms: number): string {
  const sec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

export function BuildMonitorClient({
  lang,
  dict,
  initialJob,
  initialLogs,
  initialArtifact,
}: BuildMonitorClientProps) {
  const router = useRouter();
  const [job, setJob] = useState<BuildJobRecord>(initialJob);
  const [logs, setLogs] = useState<BuildLogRecord[]>(initialLogs);
  const [artifact, setArtifact] = useState<BuildArtifactRecord | null>(initialArtifact);
  const [expandedTerminal, setExpandedTerminal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<{ message: string; needsWorkflowUpdate: boolean } | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());

  const isActive = ['queued', 'running', 'validating', 'storing'].includes(job.status);

  // Live duration clock while active
  useEffect(() => {
    if (!isActive) return;
    const timer = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [isActive]);

  // Real-time SSE connection to GitHub Actions sync stream with automatic polling fallback
  useEffect(() => {
    if (!isActive) return;
    let cancelled = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let es: EventSource | null = null;

    const startPollingFallback = () => {
      if (cancelled || pollTimer) return;
      const pollOnce = async () => {
        if (cancelled) return;
        try {
          const res = await fetch(`/api/builds/${job.id}/sync`, { method: 'POST' });
          if (!res.ok) return;
          const payload = (await res.json()) as {
            build?: BuildJobRecord;
            logs?: BuildLogRecord[];
            artifact?: BuildArtifactRecord | null;
          };
          if (payload.build) setJob(payload.build);
          if (payload.logs) setLogs(payload.logs);
          if (payload.artifact !== undefined) setArtifact(payload.artifact);
        } catch {
          // ignore transient poll errors
        }
      };
      void pollOnce();
      pollTimer = setInterval(() => {
        void pollOnce();
      }, 6000);
    };

    const connectSse = () => {
      if (cancelled) return;
      es = new EventSource(`/api/builds/${job.id}/stream`);
      es.addEventListener('update', (event) => {
        try {
          const payload = JSON.parse((event as MessageEvent).data) as {
            build?: BuildJobRecord;
            logs?: BuildLogRecord[];
            artifact?: BuildArtifactRecord | null;
          };
          if (payload.build) setJob(payload.build);
          if (payload.logs) setLogs(payload.logs);
          if (payload.artifact !== undefined) setArtifact(payload.artifact);
        } catch {
          // ignore parse errors
        }
      });
      es.addEventListener('done', () => {
        es?.close();
      });
      es.addEventListener('reconnect', () => {
        es?.close();
        if (!cancelled) setTimeout(connectSse, 1000);
      });
      es.onerror = () => {
        es?.close();
        startPollingFallback();
      };
    };

    connectSse();

    return () => {
      cancelled = true;
      es?.close();
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [job.id, isActive]);

  const elapsedMs = useMemo(() => {
    if (job.duration_ms && !isActive) return job.duration_ms;
    const start = new Date(job.started_at).getTime();
    const end = job.completed_at ? new Date(job.completed_at).getTime() : nowTick;
    return Math.max(0, end - start);
  }, [job.started_at, job.completed_at, job.duration_ms, isActive, nowTick]);

  const errorDiagnostic: ErrorDiagnostic | null = useMemo(() => {
    if (!job.error_details) return null;
    try {
      return JSON.parse(job.error_details) as ErrorDiagnostic;
    } catch {
      return null;
    }
  }, [job.error_details]);

  const combinedLogsText = useMemo(
    () => logs.map((l) => l.content).join('\n\n'),
    [logs]
  );

  const handleManualSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch(`/api/builds/${job.id}/sync`, { method: 'POST' });
      const data = (await res.json()) as {
        build?: BuildJobRecord;
        logs?: BuildLogRecord[];
        artifact?: BuildArtifactRecord | null;
      };
      if (data.build) setJob(data.build);
      if (data.logs) setLogs(data.logs);
      if (data.artifact !== undefined) setArtifact(data.artifact);
    } finally {
      setSyncing(false);
    }
  };

  const handleCopyLogs = async () => {
    await navigator.clipboard.writeText(combinedLogsText || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleRetry = async (useLatestCommit: boolean) => {
    setRetrying(true);
    setRetryError(null);
    try {
      const res = await fetch(`/api/builds/${job.id}/retry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ useLatestCommit }),
      });
      const data = (await res.json()) as { build?: { id: string }; error?: string };
      if (res.ok && data.build) {
        router.push(`/builds/${data.build.id}`);
      } else if (data.error === 'WORKFLOW_UPDATE_REQUIRED') {
        setRetryError({
          message: dict.monitor.workflowUpdateRequiredError,
          needsWorkflowUpdate: true,
        });
      } else {
        setRetryError({
          message: data.error || 'Retry failed.',
          needsWorkflowUpdate: false,
        });
      }
    } finally {
      setRetrying(false);
    }
  };

  const currentStageDef =
    BUILD_STAGES.find((s) => s.index === job.current_stage) || BUILD_STAGES[0];

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8 space-y-6">
      {/* Top Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#1F2430] pb-5">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-bold text-white">{dict.monitor.title}</h1>
            <StatusBadge
              status={job.status}
              label={dict.monitor.statusLabels[job.status] || job.status}
            />
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs font-mono text-[#8E98AB]">
            <span className="text-white">{job.repo_full_name}</span>
            <span>·</span>
            <span>{job.branch}</span>
            <span>·</span>
            <span>{job.commit_sha.slice(0, 8)}</span>
            <span>·</span>
            <span>
              {job.framework} ({job.build_type})
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {job.github_run_url && (
            <a
              href={job.github_run_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border border-[#2E3648] bg-[#0E1117] px-3 py-1.5 text-xs text-[#CBD2E0] hover:text-white"
            >
              <span>{dict.monitor.githubRunLink}</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}

          {isActive && (
            <button
              type="button"
              onClick={handleManualSync}
              disabled={syncing}
              className="inline-flex items-center gap-1.5 rounded-md border border-[#2E3648] bg-[#131720] px-3 py-1.5 text-xs font-medium text-white hover:border-emerald-500/50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
              <span>{dict.monitor.refreshNow}</span>
            </button>
          )}

          {job.status === 'succeeded' && artifact && (
            <Link
              href={`/builds/${job.id}/download`}
              className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500 px-4 py-2 text-xs sm:text-sm font-semibold text-[#04140E] hover:bg-emerald-400"
            >
              <Download className="h-4 w-4" />
              <span>{dict.monitor.viewDownloadPage}</span>
            </Link>
          )}
        </div>
      </div>

      {/* Telemetry Summary Cards */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-[#1F2430] bg-[#0E1117] p-4 space-y-1">
          <div className="text-xs text-[#8E98AB]">{dict.monitor.currentStageLabel}</div>
          <div className="text-sm font-semibold text-white">
            {dict.monitor.stages[currentStageDef.key] || currentStageDef.labelEn}
          </div>
        </div>
        <div className="rounded-lg border border-[#1F2430] bg-[#0E1117] p-4 space-y-1">
          <div className="text-xs text-[#8E98AB]">{dict.monitor.elapsedLabel}</div>
          <div className="text-sm font-mono font-semibold tabular-nums text-white">
            {formatDurationMs(elapsedMs)}
          </div>
        </div>
        <div className="rounded-lg border border-[#1F2430] bg-[#0E1117] p-4 space-y-1">
          <div className="text-xs text-[#8E98AB]">{dict.configure.computedCommandLabel}</div>
          <div className="text-xs font-mono text-emerald-300 truncate" dir="ltr" title={job.build_command}>
            {job.build_command}
          </div>
        </div>
      </div>

      {/* Error Diagnosis Banner */}
      {['failed', 'cancelled', 'timed_out'].includes(job.status) && (
        <section className="rounded-lg border border-red-500/40 bg-red-500/5 p-5 space-y-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="text-xs font-mono text-red-400">{job.error_code || 'BUILD_FAILED'}</div>
              <h2 className="text-base font-semibold text-red-200">
                {errorDiagnostic
                  ? lang === 'ar'
                    ? errorDiagnostic.titleAr
                    : errorDiagnostic.titleEn
                  : job.error_summary || dict.monitor.errorReportTitle}
              </h2>
              {errorDiagnostic && (
                <p className="text-xs sm:text-sm text-red-200/85">
                  {lang === 'ar' ? errorDiagnostic.explanationAr : errorDiagnostic.explanationEn}
                </p>
              )}
            </div>
          </div>

          {errorDiagnostic && (
            <div className="rounded-md border border-[#1F2430] bg-[#0E1117] p-3.5 text-xs space-y-2">
              <div className="text-[#8E98AB]">
                <span className="font-semibold text-white me-1.5">
                  {dict.monitor.remediationLabel}
                </span>
                <span>
                  {lang === 'ar' ? errorDiagnostic.remediationAr : errorDiagnostic.remediationEn}
                </span>
              </div>
              {errorDiagnostic.matchedLogExcerpt && (
                <pre
                  dir="ltr"
                  className="overflow-x-auto rounded bg-[#08090C] p-3 font-mono text-[11px] text-red-300 border border-[#1F2430]"
                >
                  {errorDiagnostic.matchedLogExcerpt}
                </pre>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              disabled={retrying}
              onClick={() => handleRetry(false)}
              className="inline-flex items-center gap-1.5 rounded-md border border-red-400/40 bg-red-500/15 px-3.5 py-2 text-xs font-semibold text-red-200 hover:bg-red-500/25"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>{dict.monitor.retrySameCommit}</span>
            </button>
            <button
              type="button"
              disabled={retrying}
              onClick={() => handleRetry(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-[#2E3648] bg-[#131720] px-3.5 py-2 text-xs font-medium text-white hover:border-emerald-500/40"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>{dict.monitor.retryLatestCommit}</span>
            </button>
            <Link
              href={`/configure?repo=${encodeURIComponent(job.repo_full_name)}&installationId=${job.installation_id}`}
              className="inline-flex items-center gap-1.5 rounded-md border border-sky-500/40 bg-sky-500/10 px-3.5 py-2 text-xs font-medium text-sky-200 hover:bg-sky-500/20"
            >
              <span>{dict.monitor.openConfigureToUpdate}</span>
            </Link>
          </div>
          {retryError && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200 flex flex-wrap items-center justify-between gap-2">
              <span>{retryError.message}</span>
              {retryError.needsWorkflowUpdate && (
                <Link
                  href={`/configure?repo=${encodeURIComponent(job.repo_full_name)}&installationId=${job.installation_id}`}
                  className="rounded bg-amber-400 px-3 py-1 font-semibold text-[#1A1204] hover:bg-amber-300"
                >
                  {dict.monitor.openConfigureToUpdate}
                </Link>
              )}
            </div>
          )}
        </section>
      )}

      {/* 9-Stage Pipeline + Live Terminal */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* 9 Stages */}
        <section className="lg:col-span-4 rounded-lg border border-[#1F2430] bg-[#0E1117] p-4 space-y-3 h-fit">
          <h2 className="text-sm font-semibold text-white border-b border-[#1F2430] pb-2.5">
            {dict.monitor.stagesTitle}
          </h2>
          <ol className="space-y-2">
            {BUILD_STAGES.map((def) => {
              const st = job.stages_state.find((s) => s.index === def.index);
              const status = st?.status || 'pending';
              return (
                <li
                  key={def.key}
                  className={`flex items-center justify-between rounded-md border px-3 py-2 text-xs ${
                    status === 'running'
                      ? 'border-sky-500/40 bg-sky-500/10 text-sky-200'
                      : status === 'completed'
                      ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-200'
                      : status === 'failed'
                      ? 'border-red-500/40 bg-red-500/10 text-red-200'
                      : 'border-[#1A1F2A] bg-[#131720]/60 text-[#8E98AB]'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {status === 'completed' && (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                    )}
                    {status === 'running' && (
                      <Loader2 className="h-3.5 w-3.5 text-sky-400 animate-spin shrink-0" />
                    )}
                    {status === 'failed' && (
                      <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />
                    )}
                    {(status === 'pending' || status === 'skipped') && (
                      <Clock className="h-3.5 w-3.5 text-[#6B7487] shrink-0" />
                    )}
                    <span className="truncate">{dict.monitor.stages[def.key]}</span>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        {/* Expandable Real Terminal Output */}
        <section
          className={`${
            expandedTerminal ? 'lg:col-span-12' : 'lg:col-span-8'
          } rounded-lg border border-[#1F2430] bg-[#0E1117] overflow-hidden flex flex-col`}
        >
          <div className="flex items-center justify-between border-b border-[#1F2430] bg-[#131720] px-4 py-2.5">
            <div className="flex items-center gap-2 text-xs font-mono text-[#CBD2E0]">
              <Terminal className="h-3.5 w-3.5 text-emerald-400" />
              <span>{dict.monitor.logsTitle}</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopyLogs}
                className="inline-flex items-center gap-1 rounded border border-[#2E3648] bg-[#0E1117] px-2 py-1 text-[11px] text-[#CBD2E0] hover:text-white"
              >
                {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                <span>{copied ? dict.monitor.copied : dict.monitor.copyLogs}</span>
              </button>
              <button
                type="button"
                onClick={() => setExpandedTerminal((p) => !p)}
                className="inline-flex items-center gap-1 rounded border border-[#2E3648] bg-[#0E1117] px-2 py-1 text-[11px] text-[#CBD2E0] hover:text-white"
              >
                {expandedTerminal ? (
                  <>
                    <Minimize2 className="h-3 w-3" />
                    <span>{dict.monitor.collapseLogs}</span>
                  </>
                ) : (
                  <>
                    <Maximize2 className="h-3 w-3" />
                    <span>{dict.monitor.expandLogs}</span>
                  </>
                )}
              </button>
            </div>
          </div>

          <div
            dir="ltr"
            className={`overflow-auto bg-[#08090C] p-4 font-mono text-[11px] leading-relaxed text-[#CBD2E0] ${
              expandedTerminal ? 'h-[640px]' : 'h-[430px]'
            }`}
          >
            {logs.length === 0 ? (
              <div className="text-[#6B7487]">{dict.monitor.queuedHint}</div>
            ) : (
              logs.map((entry) => (
                <div key={entry.id} className="mb-3 border-b border-[#141821] pb-2 last:border-0">
                  {entry.step_name && (
                    <div className="text-[10px] text-sky-400 mb-1">
                      === Stage {entry.stage_index}: {entry.step_name} ===
                    </div>
                  )}
                  <pre
                    className={`whitespace-pre-wrap break-words ${
                      entry.level === 'error'
                        ? 'text-red-300'
                        : entry.level === 'warn'
                        ? 'text-amber-300'
                        : 'text-[#CBD2E0]'
                    }`}
                  >
                    {entry.content}
                  </pre>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
