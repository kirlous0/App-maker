'use client';

import { useRouter } from 'next/navigation';
import {
  CheckCircle2,
  ExternalLink,
  KeyRound,
  LogOut,
  Plus,
  Settings,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { GitHubIcon } from '@/components/GitHubIcon';
import { useState } from 'react';
import type { Dictionary } from '@/lib/i18n/dictionary';
import type { GitHubAppPublicConfig } from '@/lib/github/config';
import type {
  BuildMode,
  SigningConfigSummary,
  SupportedLanguage,
  UserProfile,
} from '@/lib/types';

interface SettingsClientProps {
  lang: SupportedLanguage;
  dict: Dictionary;
  user: UserProfile | null;
  isConnected: boolean;
  githubApp: GitHubAppPublicConfig;
  initialSigningConfigs: SigningConfigSummary[];
}

export function SettingsClient({
  lang,
  dict,
  user,
  isConnected,
  githubApp,
  initialSigningConfigs,
}: SettingsClientProps) {
  const router = useRouter();

  const [prefLang, setPrefLang] = useState<SupportedLanguage>(
    user?.preferred_language || lang
  );
  const [defaultBuildType, setDefaultBuildType] = useState<BuildMode>(
    user?.default_build_type || 'debug'
  );
  const [retentionDays, setRetentionDays] = useState<number>(
    user?.artifact_retention_days || 7
  );
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [prefsSaved, setPrefsSaved] = useState(false);

  const [signingConfigs, setSigningConfigs] =
    useState<SigningConfigSummary[]>(initialSigningConfigs);
  const [label, setLabel] = useState('');
  const [repoFullName, setRepoFullName] = useState('');
  const [keyAlias, setKeyAlias] = useState('');
  const [storePassword, setStorePassword] = useState('');
  const [keyPassword, setKeyPassword] = useState('');
  const [keystoreBase64, setKeystoreBase64] = useState('');
  const [keystoreName, setKeystoreName] = useState('');
  const [signingErr, setSigningErr] = useState<string | null>(null);
  const [savingKeystore, setSavingKeystore] = useState(false);

  const [manifestAppName, setManifestAppName] = useState('Repo2APK Builder');
  const [manifestSubmitting, setManifestSubmitting] = useState(false);
  const [manifestErr, setManifestErr] = useState<string | null>(null);

  const handleStartManifest = async (e: React.FormEvent) => {
    e.preventDefault();
    setManifestSubmitting(true);
    setManifestErr(null);
    try {
      const res = await fetch('/api/github/manifest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appName: manifestAppName }),
      });
      const data = (await res.json()) as {
        actionUrl?: string;
        manifestJson?: string;
        error?: string;
      };
      if (!res.ok || !data.actionUrl || !data.manifestJson) {
        setManifestErr(data.error || 'Failed to prepare GitHub App manifest.');
        setManifestSubmitting(false);
        return;
      }
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = data.actionUrl;
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = 'manifest';
      input.value = data.manifestJson;
      form.appendChild(input);
      document.body.appendChild(form);
      form.submit();
    } catch {
      setManifestErr('Network error preparing GitHub App manifest.');
      setManifestSubmitting(false);
    }
  };

  const handleSavePrefs = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPrefs(true);
    setPrefsSaved(false);
    try {
      const res = await fetch('/api/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preferred_language: prefLang,
          default_build_type: defaultBuildType,
          artifact_retention_days: retentionDays,
        }),
      });
      if (res.ok) {
        document.documentElement.lang = prefLang;
        document.documentElement.dir = prefLang === 'ar' ? 'rtl' : 'ltr';
        setPrefsSaved(true);
        router.refresh();
      }
    } finally {
      setSavingPrefs(false);
    }
  };

  const handleDisconnect = async () => {
    await fetch('/api/auth/github/disconnect', { method: 'POST' });
    router.push('/');
    router.refresh();
  };

  const handleKeystoreFile = (file: File | null) => {
    if (!file) return;
    setKeystoreName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const res = String(reader.result || '');
      const idx = res.indexOf('base64,');
      setKeystoreBase64(idx >= 0 ? res.slice(idx + 7) : res);
    };
    reader.readAsDataURL(file);
  };

  const handleAddKeystore = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingKeystore(true);
    setSigningErr(null);
    try {
      const res = await fetch('/api/signing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label,
          repoFullName: repoFullName || null,
          keyAlias,
          keystoreBase64,
          storePassword,
          keyPassword,
        }),
      });
      const data = (await res.json()) as {
        signingConfig?: SigningConfigSummary;
        error?: string;
      };
      if (!res.ok || !data.signingConfig) {
        setSigningErr(data.error || 'Failed to save keystore');
        return;
      }
      setSigningConfigs((prev) => [data.signingConfig!, ...prev]);
      setLabel('');
      setRepoFullName('');
      setKeyAlias('');
      setStorePassword('');
      setKeyPassword('');
      setKeystoreBase64('');
      setKeystoreName('');
    } finally {
      setSavingKeystore(false);
    }
  };

  const handleDeleteKeystore = async (id: string) => {
    const res = await fetch(`/api/signing/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setSigningConfigs((prev) => prev.filter((s) => s.id !== id));
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 py-8 space-y-8">
      <div className="border-b border-[#1F2430] pb-5 space-y-1">
        <h1 className="text-2xl font-bold text-white">{dict.settings.title}</h1>
        <p className="text-sm text-[#8E98AB]">{dict.settings.subtitle}</p>
      </div>

      {/* GitHub Connection */}
      <section className="rounded-lg border border-[#1F2430] bg-[#0E1117] p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md border border-[#2E3648] bg-[#131720] text-white">
              <GitHubIcon className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-white">
                {dict.settings.githubSectionTitle}
              </h2>
              <p className="text-xs text-[#8E98AB]">
                {isConnected
                  ? dict.settings.githubConnectedDesc
                  : dict.settings.githubNotConnectedDesc}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isConnected && user ? (
              <>
                {githubApp.installUrl && (
                  <a
                    href={githubApp.installUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-md border border-[#2E3648] bg-[#131720] px-3 py-2 text-xs text-white hover:border-emerald-500/40"
                  >
                    <span>{dict.dashboard.manageAccess}</span>
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
                <button
                  type="button"
                  onClick={handleDisconnect}
                  className="inline-flex items-center gap-1.5 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-300 hover:bg-red-500/20"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span>{dict.nav.disconnectGithub}</span>
                </button>
              </>
            ) : (
              githubApp.isConfigured && (
                <a
                  href="/api/auth/github/login"
                  className="inline-flex items-center gap-2 rounded-md bg-emerald-500 px-4 py-2 text-xs font-semibold text-[#04140E] hover:bg-emerald-400"
                >
                  <GitHubIcon className="h-4 w-4" />
                  <span>{dict.nav.connectGithub}</span>
                </a>
              )
            )}
          </div>
        </div>

        {isConnected && user && (
          <div className="flex items-center gap-3 rounded-md border border-[#1F2430] bg-[#131720] p-3 text-xs">
            {user.avatar_url && (
              <img
                src={user.avatar_url}
                alt={user.github_login}
                className="h-8 w-8 rounded-full border border-[#2E3648]"
              />
            )}
            <div>
              <div className="font-mono font-semibold text-white">@{user.github_login}</div>
              <div className="text-[#8E98AB]">{user.email || user.name || 'GitHub App OAuth'}</div>
            </div>
          </div>
        )}
      </section>

      {/* GitHub App Setup Guide (Always visible for transparent configuration) */}
      <section className="rounded-lg border border-[#1F2430] bg-[#0E1117] p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            <h2 className="text-base font-semibold text-white">{dict.settings.githubSetupTitle}</h2>
          </div>
          <span
            className={`rounded border px-2 py-0.5 font-mono text-[11px] ${
              githubApp.isConfigured
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                : 'border-amber-500/40 bg-amber-500/10 text-amber-300'
            }`}
          >
            {githubApp.isConfigured ? 'CONFIGURED' : 'SETUP_REQUIRED'}
          </span>
        </div>

        <p className="text-xs sm:text-sm text-[#9AA3B2]">{dict.settings.githubSetupDesc}</p>

        {!githubApp.isConfigured && (
          <form
            onSubmit={handleStartManifest}
            className="rounded-md border border-emerald-500/35 bg-emerald-500/5 p-4 space-y-3"
          >
            <div className="space-y-1">
              <div className="text-sm font-semibold text-emerald-300">
                {dict.settings.manifestCardTitle}
              </div>
              <p className="text-xs text-[#CBD2E0]">{dict.settings.manifestCardDesc}</p>
            </div>
            {manifestErr && (
              <div className="rounded border border-red-500/40 bg-red-500/10 p-2 text-xs text-red-300">
                {manifestErr}
              </div>
            )}
            <div className="flex flex-col sm:flex-row sm:items-end gap-3">
              <div className="flex-1 space-y-1 text-xs">
                <label className="text-[#9AA3B2]">{dict.settings.manifestAppNameLabel}</label>
                <input
                  type="text"
                  required
                  value={manifestAppName}
                  onChange={(e) => setManifestAppName(e.target.value)}
                  className="w-full rounded border border-[#2E3648] bg-[#08090C] px-3 py-2 font-mono text-white"
                  dir="ltr"
                />
              </div>
              <button
                type="submit"
                disabled={manifestSubmitting}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-emerald-500 px-4 py-2 text-xs font-semibold text-[#04140E] hover:bg-emerald-400 disabled:opacity-60"
              >
                <GitHubIcon className="h-4 w-4" />
                <span>
                  {manifestSubmitting
                    ? dict.settings.manifestSubmitting
                    : dict.settings.manifestSubmitButton}
                </span>
              </button>
            </div>
          </form>
        )}

        {githubApp.missingVars.length > 0 && (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs space-y-1.5">
            <div className="font-semibold text-amber-200">{dict.settings.missingEnvLabel}</div>
            <div className="flex flex-wrap gap-1.5" dir="ltr">
              {githubApp.missingVars.map((v) => (
                <code
                  key={v}
                  className="rounded border border-amber-500/30 bg-[#08090C] px-2 py-0.5 text-[11px] text-amber-300"
                >
                  {v}
                </code>
              ))}
            </div>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2 text-xs">
          <div className="rounded-md border border-[#1F2430] bg-[#131720] p-3 space-y-1">
            <div className="text-[#8E98AB]">{dict.settings.callbackUrlLabel}</div>
            <div className="font-mono text-emerald-300 break-all" dir="ltr">
              {githubApp.callbackUrl}
            </div>
          </div>
          <div className="rounded-md border border-[#1F2430] bg-[#131720] p-3 space-y-1">
            <div className="text-[#8E98AB]">{dict.settings.webhookUrlLabel}</div>
            <div className="font-mono text-emerald-300 break-all" dir="ltr">
              {githubApp.webhookUrl}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-xs font-medium text-[#CBD2E0]">
            {dict.settings.permissionsTableTitle}
          </div>
          <div className="grid gap-2 sm:grid-cols-2 text-xs">
            {githubApp.requiredPermissions.map((perm) => (
              <div
                key={perm.permission}
                className="rounded border border-[#1F2430] bg-[#131720] p-2.5 space-y-1"
              >
                <div className="flex items-center justify-between font-mono">
                  <span className="text-white">{perm.permission}</span>
                  <span className="text-sky-300">{perm.access}</span>
                </div>
                <p className="text-[11px] text-[#8E98AB]">
                  {lang === 'ar' ? perm.reasonAr : perm.reasonEn}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Account & Build Preferences */}
      <section className="rounded-lg border border-[#1F2430] bg-[#0E1117] p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Settings className="h-4 w-4 text-sky-400" />
          <h2 className="text-base font-semibold text-white">{dict.settings.preferencesTitle}</h2>
        </div>

        <form onSubmit={handleSavePrefs} className="grid gap-4 sm:grid-cols-3 text-xs">
          <div className="space-y-1.5">
            <label className="text-[#9AA3B2]">{dict.settings.languageLabel}</label>
            <select
              value={prefLang}
              onChange={(e) => setPrefLang(e.target.value as SupportedLanguage)}
              className="w-full rounded-md border border-[#2E3648] bg-[#131720] px-3 py-2 text-white"
            >
              <option value="ar">العربية (RTL)</option>
              <option value="en">English (LTR)</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-[#9AA3B2]">{dict.settings.defaultBuildTypeLabel}</label>
            <select
              value={defaultBuildType}
              onChange={(e) => setDefaultBuildType(e.target.value as BuildMode)}
              className="w-full rounded-md border border-[#2E3648] bg-[#131720] px-3 py-2 font-mono text-white"
            >
              <option value="debug">debug</option>
              <option value="release">release</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-[#9AA3B2]">{dict.settings.retentionDaysLabel}</label>
            <input
              type="number"
              min={1}
              max={90}
              value={retentionDays}
              onChange={(e) => setRetentionDays(parseInt(e.target.value || '7', 10))}
              className="w-full rounded-md border border-[#2E3648] bg-[#131720] px-3 py-2 font-mono text-white"
            />
          </div>

          <div className="sm:col-span-3 flex items-center gap-3">
            <button
              type="submit"
              disabled={savingPrefs}
              className="rounded-md bg-emerald-500 px-4 py-2 text-xs font-semibold text-[#04140E] hover:bg-emerald-400 disabled:opacity-60"
            >
              {dict.settings.savePreferences}
            </button>
            {prefsSaved && (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>{dict.settings.savedNotice}</span>
              </span>
            )}
          </div>
        </form>
      </section>

      {/* Per-user Encrypted Keystores */}
      {isConnected && (
        <section className="rounded-lg border border-[#1F2430] bg-[#0E1117] p-6 space-y-5">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-emerald-400" />
              <span>{dict.settings.signingSectionTitle}</span>
            </h2>
            <p className="text-xs text-[#8E98AB]">{dict.settings.signingSectionDesc}</p>
          </div>

          {signingConfigs.length === 0 ? (
            <div className="rounded-md border border-[#1F2430] bg-[#131720] p-4 text-xs text-[#8E98AB]">
              {dict.settings.noSigningConfigs}
            </div>
          ) : (
            <div className="space-y-2">
              {signingConfigs.map((cfg) => (
                <div
                  key={cfg.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-md border border-[#1F2430] bg-[#131720] px-4 py-3 text-xs"
                >
                  <div className="space-y-0.5">
                    <div className="font-semibold text-white">{cfg.label}</div>
                    <div className="font-mono text-[11px] text-[#8E98AB]">
                      alias: {cfg.key_alias} · sha256: {cfg.keystore_sha256.slice(0, 16)}...
                      {cfg.repo_full_name ? ` · ${cfg.repo_full_name}` : ''}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteKeystore(cfg.id)}
                    className="inline-flex items-center gap-1 self-start sm:self-auto rounded border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-[11px] text-red-300 hover:bg-red-500/20"
                  >
                    <Trash2 className="h-3 w-3" />
                    <span>{dict.settings.deleteAction}</span>
                  </button>
                </div>
              ))}
            </div>
          )}

          <form
            onSubmit={handleAddKeystore}
            className="rounded-md border border-[#1F2430] bg-[#131720] p-4 space-y-4 text-xs"
          >
            <div className="font-semibold text-white flex items-center gap-1.5">
              <Plus className="h-3.5 w-3.5 text-emerald-400" />
              <span>{dict.settings.addKeystoreTitle}</span>
            </div>

            {signingErr && (
              <div className="rounded border border-red-500/30 bg-red-500/10 p-2 text-red-300">
                {signingErr}
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <input
                type="text"
                required
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={dict.configure.keystoreLabelInput}
                className="rounded border border-[#2E3648] bg-[#0E1117] px-3 py-2 text-white"
              />
              <input
                type="text"
                value={repoFullName}
                onChange={(e) => setRepoFullName(e.target.value)}
                placeholder="owner/repo (optional)"
                className="rounded border border-[#2E3648] bg-[#0E1117] px-3 py-2 font-mono text-white"
              />
              <input
                type="text"
                required
                value={keyAlias}
                onChange={(e) => setKeyAlias(e.target.value)}
                placeholder={dict.configure.keyAliasLabel}
                className="rounded border border-[#2E3648] bg-[#0E1117] px-3 py-2 font-mono text-white"
              />
              <div>
                <input
                  type="file"
                  required
                  accept=".jks,.keystore,.p12,.bks"
                  onChange={(e) => handleKeystoreFile(e.target.files?.[0] || null)}
                  className="block w-full text-xs text-[#9AA3B2] file:me-2 file:rounded file:border file:border-[#2E3648] file:bg-[#0E1117] file:px-2.5 file:py-1.5 file:text-xs file:text-white"
                />
                {keystoreName && (
                  <span className="font-mono text-[10px] text-emerald-400">{keystoreName}</span>
                )}
              </div>
              <input
                type="password"
                required
                value={storePassword}
                onChange={(e) => setStorePassword(e.target.value)}
                placeholder={dict.configure.storePasswordLabel}
                className="rounded border border-[#2E3648] bg-[#0E1117] px-3 py-2 font-mono text-white"
              />
              <input
                type="password"
                required
                value={keyPassword}
                onChange={(e) => setKeyPassword(e.target.value)}
                placeholder={dict.configure.keyPasswordLabel}
                className="rounded border border-[#2E3648] bg-[#0E1117] px-3 py-2 font-mono text-white"
              />
            </div>

            <button
              type="submit"
              disabled={savingKeystore || !keystoreBase64}
              className="rounded-md bg-emerald-500 px-4 py-2 text-xs font-semibold text-[#04140E] hover:bg-emerald-400 disabled:opacity-50"
            >
              {dict.settings.addKeystoreTitle}
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
