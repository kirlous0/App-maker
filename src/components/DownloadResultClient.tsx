'use client';

import Link from 'next/link';
import {
  Check,
  CheckCircle2,
  Copy,
  Download,
  PackageCheck,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Terminal,
} from 'lucide-react';
import { useState } from 'react';
import type { Dictionary } from '@/lib/i18n/dictionary';
import type { BuildArtifactRecord, BuildJobRecord, SupportedLanguage } from '@/lib/types';

interface DownloadResultClientProps {
  lang: SupportedLanguage;
  dict: Dictionary;
  job: BuildJobRecord;
  artifact: BuildArtifactRecord;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDuration(ms: number | null): string {
  if (!ms || ms <= 0) return '—';
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function DownloadResultClient({
  lang,
  dict,
  job,
  artifact,
}: DownloadResultClientProps) {
  const [copiedSha, setCopiedSha] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const handleCopySha = async () => {
    await navigator.clipboard.writeText(artifact.sha256);
    setCopiedSha(true);
    setTimeout(() => setCopiedSha(false), 1800);
  };

  const handleDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    setDownloadProgress(null);
    setDownloadError(null);
    try {
      const res = await fetch(`/api/builds/${job.id}/download?format=json`);
      const data = (await res.json()) as {
        chunked?: boolean;
        signedUrl?: string;
        chunkUrls?: string[];
        fileName?: string;
        sizeBytes?: number;
        error?: string;
      };
      if (!res.ok || (!data.signedUrl && !data.chunkUrls?.length)) {
        throw new Error(data.error || 'Failed to prepare APK download.');
      }

      if (!data.chunked || !data.chunkUrls || data.chunkUrls.length <= 1) {
        window.location.assign(data.signedUrl!);
        return;
      }

      const parts: BlobPart[] = [];
      let received = 0;
      const total = data.sizeBytes || artifact.size_bytes || 0;

      for (const chunkUrl of data.chunkUrls) {
        const chunkRes = await fetch(chunkUrl);
        if (!chunkRes.ok) {
          throw new Error(`Chunk download failed with status ${chunkRes.status}`);
        }
        if (chunkRes.body) {
          const reader = chunkRes.body.getReader();
          const chunks: Uint8Array[] = [];
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
              chunks.push(value);
              received += value.byteLength;
              if (total > 0) {
                setDownloadProgress(Math.min(99, Math.round((received / total) * 100)));
              }
            }
          }
          const combined = new Uint8Array(chunks.reduce((acc, c) => acc + c.byteLength, 0));
          let pos = 0;
          for (const c of chunks) {
            combined.set(c, pos);
            pos += c.byteLength;
          }
          parts.push(combined);
        } else {
          const ab = await chunkRes.arrayBuffer();
          received += ab.byteLength;
          if (total > 0) {
            setDownloadProgress(Math.min(99, Math.round((received / total) * 100)));
          }
          parts.push(ab);
        }
      }

      setDownloadProgress(100);
      const blob = new Blob(parts, { type: 'application/vnd.android.package-archive' });
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = data.fileName || artifact.file_name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setDownloading(false);
    }
  };

  const isUnsignedRelease = job.build_type === 'release' && !artifact.is_signed;

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-10 space-y-6">
      {/* Header Banner */}
      <section className="rounded-lg border border-emerald-500/30 bg-[#0E1117] p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-5">
        <div className="flex items-start gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-emerald-500/40 bg-emerald-500/15 text-emerald-400">
            <PackageCheck className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <h1 className="text-xl sm:text-2xl font-bold text-white">{dict.download.title}</h1>
            <p className="text-xs sm:text-sm text-[#9AA3B2]">{dict.download.subtitle}</p>
            <div className="pt-1 flex flex-wrap items-center gap-2">
              {artifact.signing_status === 'signed' ? (
                <span className="inline-flex items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
                  <ShieldCheck className="h-3 w-3" />
                  <span>{dict.download.signedVerifiedBadge}</span>
                </span>
              ) : artifact.signing_status === 'debug_signed' ? (
                <span className="inline-flex items-center gap-1 rounded border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium text-sky-300">
                  <CheckCircle2 className="h-3 w-3" />
                  <span>{dict.download.debugSignedBadge}</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-300">
                  <ShieldAlert className="h-3 w-3" />
                  <span>{dict.download.unsignedAlertTitle}</span>
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="shrink-0 flex flex-col items-end gap-2">
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-emerald-500 px-6 py-3 text-sm font-semibold text-[#04140E] hover:bg-emerald-400 disabled:opacity-70 transition-colors cursor-pointer"
          >
            <Download className="h-4 w-4" />
            <span>
              {downloading
                ? downloadProgress !== null
                  ? `${downloadProgress}%`
                  : '...'
                : dict.download.downloadButton}
            </span>
          </button>
          {downloadError && (
            <p className="text-[11px] text-rose-400 max-w-xs text-end">{downloadError}</p>
          )}
        </div>
      </section>

      {/* Unsigned Warning */}
      {isUnsignedRelease && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-xs sm:text-sm text-amber-200">
          <ShieldAlert className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-semibold">{dict.download.unsignedAlertTitle}</div>
            <p className="text-amber-200/85">{dict.download.unsignedAlertDesc}</p>
          </div>
        </div>
      )}

      {/* APK Metadata Grid */}
      <section className="rounded-lg border border-[#1F2430] bg-[#0E1117] p-6 space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-xs">
          <MetaItem
            label={dict.download.metadataLabels.appName}
            value={artifact.app_name || job.repo_full_name.split('/')[1]}
          />
          <MetaItem label={dict.download.metadataLabels.repository} value={job.repo_full_name} mono />
          <MetaItem label={dict.download.metadataLabels.branch} value={job.branch} mono />
          <MetaItem label={dict.download.metadataLabels.commitSha} value={job.commit_sha} mono />
          <MetaItem label={dict.download.metadataLabels.framework} value={job.framework} mono />
          <MetaItem
            label={dict.download.metadataLabels.buildType}
            value={`${job.build_type}${job.build_variant ? ` (${job.build_variant})` : ''}`}
            mono
          />
          <MetaItem label={dict.download.metadataLabels.fileName} value={artifact.file_name} mono />
          <MetaItem
            label={dict.download.metadataLabels.fileSize}
            value={formatBytes(artifact.size_bytes)}
            mono
          />
          <MetaItem
            label={dict.download.metadataLabels.packageId}
            value={artifact.package_id || '—'}
            mono
          />
          <MetaItem
            label={dict.download.metadataLabels.version}
            value={
              artifact.version_name || artifact.version_code
                ? `${artifact.version_name || '?'} (${artifact.version_code || '?'})`
                : '—'
            }
            mono
          />
          <MetaItem
            label={dict.download.metadataLabels.buildDate}
            value={new Date(job.completed_at || job.created_at).toLocaleString(
              lang === 'ar' ? 'ar-EG' : 'en-US'
            )}
          />
          <MetaItem
            label={dict.download.metadataLabels.duration}
            value={formatDuration(job.duration_ms)}
            mono
          />
        </div>

        {/* SHA-256 Box */}
        <div className="rounded-md border border-[#1F2430] bg-[#131720] p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#8E98AB]">{dict.download.metadataLabels.sha256}</span>
            <button
              type="button"
              onClick={handleCopySha}
              className="inline-flex items-center gap-1 rounded border border-[#2E3648] bg-[#0E1117] px-2.5 py-1 text-[11px] text-[#CBD2E0] hover:text-white"
            >
              {copiedSha ? (
                <Check className="h-3 w-3 text-emerald-400" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
              <span>{copiedSha ? dict.monitor.copied : dict.download.copySha}</span>
            </button>
          </div>
          <div className="font-mono text-xs text-emerald-300 break-all" dir="ltr">
            {artifact.sha256}
          </div>
        </div>

        <div className="text-xs text-[#8E98AB] flex items-center justify-between pt-2 border-t border-[#1A1F2A]">
          <span>
            {dict.download.metadataLabels.expiresAt}:{' '}
            <span className="font-mono text-[#CBD2E0]">
              {new Date(artifact.expires_at).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US')}
            </span>
          </span>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/builds/${job.id}`}
          className="inline-flex items-center gap-2 rounded-md border border-[#2E3648] bg-[#0E1117] px-4 py-2 text-xs font-medium text-[#CBD2E0] hover:text-white"
        >
          <Terminal className="h-3.5 w-3.5" />
          <span>{dict.download.backToMonitor}</span>
        </Link>

        <Link
          href={`/configure?repo=${encodeURIComponent(job.repo_full_name)}&installationId=${job.installation_id}`}
          className="inline-flex items-center gap-2 rounded-md border border-[#2E3648] bg-[#131720] px-4 py-2 text-xs font-medium text-white hover:border-emerald-500/40"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          <span>{dict.download.rebuildAction}</span>
        </Link>
      </div>
    </div>
  );
}

function MetaItem({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-md border border-[#1F2430] bg-[#131720] p-3 space-y-1">
      <div className="text-[11px] text-[#8E98AB]">{label}</div>
      <div
        className={`text-xs text-white truncate ${mono ? 'font-mono' : 'font-medium'}`}
        title={value}
      >
        {value}
      </div>
    </div>
  );
}
