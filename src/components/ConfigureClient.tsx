'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Code2,
  Cpu,
  FileWarning,
  FolderOpen,
  GitBranch,
  GitCommit,
  KeyRound,
  Loader2,
  Play,
  ShieldAlert,
  Terminal,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { computeBuildCommand } from '@/lib/android/command-builder';
import type { Dictionary } from '@/lib/i18n/dictionary';
import type {
  AbiMode,
  AndroidProjectAnalysis,
  BuildMode,
  GitHubBranchInfo,
  SigningConfigSummary,
  SupportedLanguage,
} from '@/lib/types';

interface ConfigureClientProps {
  lang: SupportedLanguage;
  dict: Dictionary;
  repoFullName: string;
  installationId: number;
  defaultBuildType: BuildMode;
  savedSigningConfigs: SigningConfigSummary[];
}

interface BranchState {
  branches: GitHubBranchInfo[];
  selectedBranch: string;
  latestCommit: { sha: string; message: string | null; author: string | null; date: string | null } | null;
}

interface WorkflowStatusState {
  installed: boolean;
  upToDate: boolean;
  workflowPath: string;
  templateYaml: string;
}

export function ConfigureClient({
  lang,
  dict,
  repoFullName,
  installationId,
  defaultBuildType,
  savedSigningConfigs,
}: ConfigureClientProps) {
  const router = useRouter();
  const BackArrow = lang === 'ar' ? ArrowRight : ArrowLeft;

  const [loadingInit, setLoadingInit] = useState(true);
  const [branchState, setBranchState] = useState<BranchState>({
    branches: [],
    selectedBranch: '',
    latestCommit: null,
  });
  const [projectDir, setProjectDir] = useState('.');
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<AndroidProjectAnalysis | null>(null);
  const [workflowStatus, setWorkflowStatus] = useState<WorkflowStatusState | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Build configuration state
  const [buildType, setBuildType] = useState<BuildMode>(defaultBuildType);
  const [selectedModule, setSelectedModule] = useState('app');
  const [selectedVariant, setSelectedVariant] = useState<string>(defaultBuildType);
  const [abiMode, setAbiMode] = useState<AbiMode>('universal');
  const [buildName, setBuildName] = useState('');
  const [buildNumber, setBuildNumber] = useState('');

  // Signing state
  const [signingMethod, setSigningMethod] = useState<
    'repo_existing' | 'saved_config' | 'upload_new' | 'unsigned_release'
  >('unsigned_release');
  const [selectedSigningId, setSelectedSigningId] = useState(savedSigningConfigs[0]?.id || '');
  const [keystoreBase64, setKeystoreBase64] = useState('');
  const [keystoreFileName, setKeystoreFileName] = useState('');
  const [keyAlias, setKeyAlias] = useState('');
  const [storePassword, setStorePassword] = useState('');
  const [keyPassword, setKeyPassword] = useState('');
  const [saveForFuture, setSaveForFuture] = useState(false);
  const [keystoreLabel, setKeystoreLabel] = useState('');

  // Workflow installation approval
  const [workflowApproved, setWorkflowApproved] = useState(false);
  const [installingWorkflow, setInstallingWorkflow] = useState(false);
  const [startingBuild, setStartingBuild] = useState(false);

  const runAnalysis = useCallback(
    async (branch: string, dir: string) => {
      if (!branch) return;
      setAnalyzing(true);
      setErrorMsg(null);
      try {
        const res = await fetch('/api/github/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            repoFullName,
            installationId,
            branch,
            projectDir: dir,
          }),
        });
        const data = (await res.json()) as {
          analysis?: AndroidProjectAnalysis;
          workflowStatus?: WorkflowStatusState;
          latestCommit?: BranchState['latestCommit'];
          error?: string;
        };
        if (!res.ok || !data.analysis) {
          setErrorMsg(data.error || 'Failed to analyze repository.');
          setAnalysis(null);
          return;
        }
        setAnalysis(data.analysis);
        setWorkflowStatus(data.workflowStatus || null);
        setWorkflowApproved(false);
        if (data.latestCommit) {
          setBranchState((prev) => ({ ...prev, latestCommit: data.latestCommit! }));
        }
        if (data.analysis.selectedModule) {
          setSelectedModule(data.analysis.selectedModule);
        }
        if (data.analysis.existingSigning.hasReleaseSigningConfig) {
          setSigningMethod('repo_existing');
        } else if (savedSigningConfigs.length > 0) {
          setSigningMethod('saved_config');
        } else {
          setSigningMethod('unsigned_release');
        }
      } catch {
        setErrorMsg('Network error while inspecting repository.');
      } finally {
        setAnalyzing(false);
      }
    },
    [repoFullName, installationId, savedSigningConfigs.length]
  );

  // Initial load: fetch branches & auto-analyze default branch
  useEffect(() => {
    let active = true;
    (async () => {
      setLoadingInit(true);
      setErrorMsg(null);
      try {
        const res = await fetch(
          `/api/github/branches?repo=${encodeURIComponent(repoFullName)}&installationId=${installationId}`
        );
        const data = (await res.json()) as {
          branches?: GitHubBranchInfo[];
          selectedBranch?: string;
          latestCommit?: BranchState['latestCommit'];
          error?: string;
        };
        if (!active) return;
        if (!res.ok || !data.branches) {
          setErrorMsg(data.error || 'Failed to load repository branches.');
          return;
        }
        const br = data.selectedBranch || data.branches[0]?.name || 'main';
        setBranchState({
          branches: data.branches,
          selectedBranch: br,
          latestCommit: data.latestCommit || null,
        });
        await runAnalysis(br, '.');
      } catch {
        if (active) setErrorMsg('Failed to connect to GitHub repository.');
      } finally {
        if (active) setLoadingInit(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [repoFullName, installationId, runAnalysis]);

  // Keep variant aligned with buildType when flavor list doesn't contain current variant
  useEffect(() => {
    if (!analysis) return;
    const matching = analysis.availableVariants.filter((v) =>
      v.toLowerCase().endsWith(buildType.toLowerCase())
    );
    if (matching.length > 0 && !matching.includes(selectedVariant)) {
      setSelectedVariant(matching[0]);
    } else if (matching.length === 0) {
      setSelectedVariant(buildType);
    }
  }, [buildType, analysis, selectedVariant]);

  const computedPreview = useMemo(() => {
    if (!analysis || !analysis.isBuildable) return null;
    return computeBuildCommand({
      analysis,
      buildType,
      applicationModule: selectedModule,
      buildVariant: selectedVariant,
      abiMode,
      buildName: buildName || null,
      buildNumber: buildNumber || null,
    });
  }, [analysis, buildType, selectedModule, selectedVariant, abiMode, buildName, buildNumber]);

  const handleBranchChange = async (newBranch: string) => {
    setBranchState((prev) => ({ ...prev, selectedBranch: newBranch }));
    const bRes = await fetch(
      `/api/github/branches?repo=${encodeURIComponent(repoFullName)}&installationId=${installationId}&branch=${encodeURIComponent(newBranch)}`
    );
    if (bRes.ok) {
      const bData = (await bRes.json()) as { latestCommit?: BranchState['latestCommit'] };
      setBranchState((prev) => ({ ...prev, latestCommit: bData.latestCommit || null }));
    }
    await runAnalysis(newBranch, projectDir);
  };

  const handleDirChange = async (newDir: string) => {
    setProjectDir(newDir);
    await runAnalysis(branchState.selectedBranch, newDir);
  };

  const handleKeystoreUpload = (file: File | null) => {
    if (!file) return;
    setKeystoreFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const res = String(reader.result || '');
      const idx = res.indexOf('base64,');
      setKeystoreBase64(idx >= 0 ? res.slice(idx + 7) : res);
    };
    reader.readAsDataURL(file);
  };

  const handleInstallWorkflow = async () => {
    if (!workflowApproved || !branchState.selectedBranch) return;
    setInstallingWorkflow(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/github/workflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoFullName,
          installationId,
          branch: branchState.selectedBranch,
          projectDir,
          approved: true,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) {
        setErrorMsg(data.error || 'Failed to install workflow file.');
      } else {
        setWorkflowStatus((prev) => (prev ? { ...prev, installed: true, upToDate: true } : prev));
      }
    } catch {
      setErrorMsg('Network error installing workflow.');
    } finally {
      setInstallingWorkflow(false);
    }
  };

  const handleStartBuild = async () => {
    if (!analysis?.isBuildable || !branchState.latestCommit?.sha) return;
    setStartingBuild(true);
    setErrorMsg(null);

    let payloadSigningMode: 'debug_default' | 'repo_existing' | 'user_keystore' | 'unsigned_release' =
      'debug_default';
    if (buildType === 'release') {
      if (signingMethod === 'repo_existing') payloadSigningMode = 'repo_existing';
      else if (signingMethod === 'saved_config' || signingMethod === 'upload_new')
        payloadSigningMode = 'user_keystore';
      else payloadSigningMode = 'unsigned_release';
    }

    try {
      const res = await fetch('/api/builds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoFullName,
          installationId,
          branch: branchState.selectedBranch,
          commitSha: branchState.latestCommit.sha,
          projectDir: analysis.projectDir,
          buildType,
          applicationModule: selectedModule,
          buildVariant: selectedVariant,
          abiMode,
          buildName: buildName.trim() || undefined,
          buildNumber: buildNumber.trim() || undefined,
          signingMode: payloadSigningMode,
          signingConfigId:
            buildType === 'release' && signingMethod === 'saved_config'
              ? selectedSigningId
              : undefined,
          ephemeralKeystore:
            buildType === 'release' && signingMethod === 'upload_new'
              ? {
                  keystoreBase64,
                  storePassword,
                  keyAlias,
                  keyPassword,
                  saveForFuture,
                  label: keystoreLabel,
                }
              : undefined,
        }),
      });

      const data = (await res.json()) as { build?: { id: string }; error?: string; message?: string };
      if (!res.ok || !data.build) {
        setErrorMsg(data.message || data.error || 'Failed to start APK build.');
        setStartingBuild(false);
        return;
      }
      router.push(`/builds/${data.build.id}`);
    } catch {
      setErrorMsg('Network error starting build.');
      setStartingBuild(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#1F2430] pb-5">
        <div className="space-y-1">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-xs text-[#8E98AB] hover:text-white mb-1"
          >
            <BackArrow className="h-3.5 w-3.5" />
            <span>{dict.configure.backToDashboard}</span>
          </Link>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2.5">
            <span>{dict.configure.title}</span>
            <span className="font-mono text-sm font-normal text-emerald-400 border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 rounded">
              {repoFullName}
            </span>
          </h1>
          <p className="text-sm text-[#8E98AB]">{dict.configure.subtitle}</p>
        </div>
      </div>

      {errorMsg && (
        <div className="flex items-start gap-2.5 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs sm:text-sm text-red-200">
          <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
          <span className="font-mono">{errorMsg}</span>
        </div>
      )}

      {/* Branch, Commit SHA & Directory Selector */}
      <section className="rounded-lg border border-[#1F2430] bg-[#0E1117] p-5 grid gap-4 md:grid-cols-3">
        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-xs font-medium text-[#9AA3B2]">
            <GitBranch className="h-3.5 w-3.5 text-emerald-400" />
            <span>{dict.configure.branchLabel}</span>
          </label>
          <select
            value={branchState.selectedBranch}
            disabled={loadingInit || analyzing}
            onChange={(e) => handleBranchChange(e.target.value)}
            className="w-full rounded-md border border-[#2E3648] bg-[#131720] px-3 py-2 text-xs font-mono text-white focus:border-emerald-500 focus:outline-none"
          >
            {branchState.branches.map((b) => (
              <option key={b.name} value={b.name}>
                {b.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-xs font-medium text-[#9AA3B2]">
            <FolderOpen className="h-3.5 w-3.5 text-sky-400" />
            <span>{dict.configure.projectDirLabel}</span>
          </label>
          <select
            value={projectDir}
            disabled={loadingInit || analyzing}
            onChange={(e) => handleDirChange(e.target.value)}
            className="w-full rounded-md border border-[#2E3648] bg-[#131720] px-3 py-2 text-xs font-mono text-white focus:border-emerald-500 focus:outline-none"
          >
            {(analysis?.candidateDirectories || ['.']).map((dir) => (
              <option key={dir} value={dir}>
                {dir === '.' ? '. (root)' : dir}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-xs font-medium text-[#9AA3B2]">
            <GitCommit className="h-3.5 w-3.5 text-[#8E98AB]" />
            <span>{dict.configure.latestCommitLabel}</span>
          </label>
          <div className="rounded-md border border-[#1F2430] bg-[#131720] px-3 py-2 text-xs font-mono text-[#E2E8F0] truncate">
            {branchState.latestCommit ? (
              <span title={branchState.latestCommit.message || ''}>
                {branchState.latestCommit.sha.slice(0, 10)}{' '}
                <span className="text-[#8E98AB]">
                  {branchState.latestCommit.message
                    ? `· ${branchState.latestCommit.message.slice(0, 28)}`
                    : ''}
                </span>
              </span>
            ) : (
              '—'
            )}
          </div>
        </div>
      </section>

      {(loadingInit || analyzing) && (
        <div className="rounded-lg border border-[#1F2430] bg-[#0E1117] p-10 text-center space-y-3">
          <Loader2 className="mx-auto h-7 w-7 animate-spin text-emerald-400" />
          <p className="text-sm text-[#9AA3B2]">{dict.configure.analyzing}</p>
        </div>
      )}

      {/* Non-Android Warning & Hard Block */}
      {!analyzing && analysis && (!analysis.isAndroidProject || !analysis.isBuildable) && (
        <section className="rounded-lg border border-red-500/40 bg-red-500/5 p-6 space-y-4">
          <div className="flex items-start gap-3">
            <FileWarning className="h-6 w-6 text-red-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-red-200">{dict.configure.notAndroidTitle}</h2>
              <p className="text-sm text-red-200/80">{dict.configure.notAndroidWarning}</p>
            </div>
          </div>

          <div className="space-y-2">
            {analysis.blockers.map((b) => (
              <div
                key={b.code}
                className="rounded-md border border-red-500/30 bg-[#0E1117] px-3.5 py-2.5 text-xs sm:text-sm text-red-200"
              >
                <span className="font-mono text-[11px] text-red-400 me-2">[{b.code}]</span>
                <span>{lang === 'ar' ? b.messageAr : b.messageEn}</span>
              </div>
            ))}
          </div>

          {analysis.nonAndroidReason && (
            <div className="rounded-md border border-[#1F2430] bg-[#0E1117] p-4 space-y-2 text-xs">
              <p className="text-[#CBD2E0]">
                {lang === 'ar'
                  ? analysis.nonAndroidReason.messageAr
                  : analysis.nonAndroidReason.messageEn}
              </p>
              {analysis.nonAndroidReason.detectedFiles.length > 0 && (
                <div>
                  <span className="text-[#8E98AB] me-2">{dict.configure.detectedFilesLabel}</span>
                  <span className="font-mono text-[#E2E8F0]">
                    {analysis.nonAndroidReason.detectedFiles.join(', ')}
                  </span>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* Valid Android Project Analysis Report */}
      {!analyzing && analysis && analysis.isAndroidProject && analysis.isBuildable && (
        <>
          <section className="rounded-lg border border-[#1F2430] bg-[#0E1117] p-5 space-y-5">
            <div className="flex items-center justify-between border-b border-[#1F2430] pb-3">
              <div className="flex items-center gap-2">
                <Cpu className="h-4 w-4 text-emerald-400" />
                <h2 className="text-base font-semibold text-white">
                  {dict.configure.analysisReportTitle}
                </h2>
              </div>
              <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-mono text-emerald-300">
                {analysis.frameworkLabel}
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-xs">
              <MetricBox label={dict.configure.frameworkLabel} value={analysis.frameworkLabel} />
              <MetricBox label={dict.configure.languageLabel} value={analysis.language} />
              <MetricBox label={dict.configure.buildSystemLabel} value={analysis.buildSystem} mono />
              <MetricBox
                label={dict.configure.packageIdLabel}
                value={analysis.packageId || 'Detected at compile time'}
                mono
              />
              <MetricBox
                label={dict.configure.sdkLabel}
                value={`compile:${analysis.androidSdk.compileSdk || '?'} · min:${analysis.androidSdk.minSdk || '?'} · target:${analysis.androidSdk.targetSdk || '?'}${analysis.androidSdk.ndkVersion ? ` · NDK:${analysis.androidSdk.ndkVersion}` : ''}${analysis.androidSdk.cmakeVersion ? ` · CMake:${analysis.androidSdk.cmakeVersion}` : ''}${analysis.androidSdk.hasNativeCxx ? ' · C++/JNI' : ''}`}
                mono
              />
              <MetricBox
                label={dict.configure.gradleWrapperLabel}
                value={
                  analysis.hasGradleWrapper
                    ? `Gradle ${analysis.gradleWrapperVersion || 'wrapper present'}`
                    : 'Wrapper missing'
                }
                mono
              />
              <MetricBox
                label={dict.configure.javaJdkLabel}
                value={`JDK ${analysis.recommendedJdk}${analysis.javaVersion ? ` (src ${analysis.javaVersion})` : ''}`}
                mono
              />
              <MetricBox
                label={dict.configure.signingDetectedLabel}
                value={
                  analysis.existingSigning.hasReleaseSigningConfig
                    ? 'Release signingConfig found'
                    : 'Debug only (no release keystore)'
                }
              />
            </div>

            {analysis.flutterVersion && (
              <div className="text-xs font-mono text-sky-300">
                {dict.configure.flutterVersionLabel}: {analysis.flutterVersion}
              </div>
            )}

            {analysis.dependencies.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-xs font-medium text-[#8E98AB]">
                  {dict.configure.dependenciesLabel}
                </div>
                <div className="flex flex-wrap gap-1.5" dir="ltr">
                  {analysis.dependencies.map((dep) => (
                    <span
                      key={dep}
                      className="rounded border border-[#1F2430] bg-[#131720] px-2 py-0.5 font-mono text-[11px] text-[#CBD2E0]"
                    >
                      {dep}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {analysis.warnings.map((w) => (
              <div
                key={w.code}
                className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-200"
              >
                <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                <span>{lang === 'ar' ? w.messageAr : w.messageEn}</span>
              </div>
            ))}
          </section>

          {/* Build Configuration */}
          <section className="rounded-lg border border-[#1F2430] bg-[#0E1117] p-5 space-y-5">
            <h2 className="text-base font-semibold text-white border-b border-[#1F2430] pb-3">
              {dict.configure.buildConfigTitle}
            </h2>

            {/* Build Mode: Debug vs Release */}
            <div className="space-y-2">
              <div className="text-xs font-medium text-[#9AA3B2]">{dict.configure.buildModeLabel}</div>
              <div className="grid gap-3 sm:grid-cols-2">
                {(['debug', 'release'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setBuildType(mode)}
                    className={`rounded-lg border p-4 text-start transition-colors ${
                      buildType === mode
                        ? 'border-emerald-500 bg-emerald-500/10'
                        : 'border-[#1F2430] bg-[#131720] hover:border-[#2E3648]'
                    }`}
                  >
                    <div className="font-mono text-sm font-semibold text-white">
                      {mode === 'debug' ? dict.configure.debugModeTitle : dict.configure.releaseModeTitle}
                    </div>
                    <div className="mt-1 text-xs text-[#8E98AB]">
                      {mode === 'debug' ? dict.configure.debugModeDesc : dict.configure.releaseModeDesc}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {/* Module Selector */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[#9AA3B2]">{dict.configure.moduleLabel}</label>
                <select
                  value={selectedModule}
                  onChange={(e) => setSelectedModule(e.target.value)}
                  className="w-full rounded-md border border-[#2E3648] bg-[#131720] px-3 py-2 text-xs font-mono text-white"
                >
                  {(analysis.applicationModules.length > 0
                    ? analysis.applicationModules
                    : ['app']
                  ).map((m) => (
                    <option key={m} value={m}>
                      :{m}
                    </option>
                  ))}
                </select>
              </div>

              {/* Variant / Flavor Selector */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[#9AA3B2]">
                  {dict.configure.variantSelectLabel}
                </label>
                <select
                  value={selectedVariant}
                  onChange={(e) => setSelectedVariant(e.target.value)}
                  className="w-full rounded-md border border-[#2E3648] bg-[#131720] px-3 py-2 text-xs font-mono text-white"
                >
                  {(analysis.availableVariants.length > 0
                    ? analysis.availableVariants
                    : [buildType]
                  ).map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>

              {/* ABI Mode */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[#9AA3B2]">{dict.configure.abiModeLabel}</label>
                <select
                  value={abiMode}
                  disabled={!analysis.supportsAbiSplit}
                  onChange={(e) => setAbiMode(e.target.value as AbiMode)}
                  className="w-full rounded-md border border-[#2E3648] bg-[#131720] px-3 py-2 text-xs font-mono text-white disabled:opacity-60"
                >
                  <option value="universal">{dict.configure.universalApk}</option>
                  {analysis.supportsAbiSplit && (
                    <option value="split">{dict.configure.splitAbiApk}</option>
                  )}
                </select>
              </div>
            </div>

            {analysis.supportsBuildNameNumberOverride && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-[#9AA3B2]">
                    {dict.configure.buildNameLabel}
                  </label>
                  <input
                    type="text"
                    value={buildName}
                    onChange={(e) => setBuildName(e.target.value)}
                    placeholder={analysis.versionName || '1.0.0'}
                    className="w-full rounded-md border border-[#2E3648] bg-[#131720] px-3 py-2 text-xs font-mono text-white"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-[#9AA3B2]">
                    {dict.configure.buildNumberLabel}
                  </label>
                  <input
                    type="text"
                    value={buildNumber}
                    onChange={(e) => setBuildNumber(e.target.value)}
                    placeholder={analysis.versionCode || '1'}
                    className="w-full rounded-md border border-[#2E3648] bg-[#131720] px-3 py-2 text-xs font-mono text-white"
                  />
                </div>
              </div>
            )}

            {/* Release Signing Options */}
            {buildType === 'release' && (
              <div className="rounded-lg border border-[#2E3648] bg-[#131720] p-4 space-y-4">
                <div className="flex items-center gap-2 text-xs font-semibold text-white">
                  <KeyRound className="h-4 w-4 text-emerald-400" />
                  <span>{dict.configure.signingMethodLabel}</span>
                </div>

                <div className="grid gap-2 sm:grid-cols-2 text-xs">
                  {analysis.existingSigning.hasReleaseSigningConfig && (
                    <label className="flex items-center gap-2 rounded border border-[#2E3648] bg-[#0E1117] p-2.5 cursor-pointer">
                      <input
                        type="radio"
                        name="signing"
                        checked={signingMethod === 'repo_existing'}
                        onChange={() => setSigningMethod('repo_existing')}
                      />
                      <span>{dict.configure.signingRepoExisting}</span>
                    </label>
                  )}

                  {savedSigningConfigs.length > 0 && (
                    <label className="flex items-center gap-2 rounded border border-[#2E3648] bg-[#0E1117] p-2.5 cursor-pointer">
                      <input
                        type="radio"
                        name="signing"
                        checked={signingMethod === 'saved_config'}
                        onChange={() => setSigningMethod('saved_config')}
                      />
                      <span>{dict.configure.signingSavedConfig}</span>
                    </label>
                  )}

                  <label className="flex items-center gap-2 rounded border border-[#2E3648] bg-[#0E1117] p-2.5 cursor-pointer">
                    <input
                      type="radio"
                      name="signing"
                      checked={signingMethod === 'upload_new'}
                      onChange={() => setSigningMethod('upload_new')}
                    />
                    <span>{dict.configure.signingUploadNew}</span>
                  </label>

                  <label className="flex items-center gap-2 rounded border border-[#2E3648] bg-[#0E1117] p-2.5 cursor-pointer">
                    <input
                      type="radio"
                      name="signing"
                      checked={signingMethod === 'unsigned_release'}
                      onChange={() => setSigningMethod('unsigned_release')}
                    />
                    <span>{dict.configure.signingUnsigned}</span>
                  </label>
                </div>

                {signingMethod === 'saved_config' && savedSigningConfigs.length > 0 && (
                  <select
                    value={selectedSigningId}
                    onChange={(e) => setSelectedSigningId(e.target.value)}
                    className="w-full rounded-md border border-[#2E3648] bg-[#0E1117] px-3 py-2 text-xs font-mono text-white"
                  >
                    {savedSigningConfigs.map((cfg) => (
                      <option key={cfg.id} value={cfg.id}>
                        {cfg.label} (alias: {cfg.key_alias})
                      </option>
                    ))}
                  </select>
                )}

                {signingMethod === 'upload_new' && (
                  <div className="grid gap-3 sm:grid-cols-2 text-xs">
                    <div className="space-y-1 sm:col-span-2">
                      <label className="text-[#9AA3B2]">{dict.configure.keystoreFileLabel}</label>
                      <input
                        type="file"
                        accept=".jks,.keystore,.p12,.bks"
                        onChange={(e) => handleKeystoreUpload(e.target.files?.[0] || null)}
                        className="block w-full text-xs text-[#9AA3B2] file:me-3 file:rounded file:border file:border-[#2E3648] file:bg-[#0E1117] file:px-3 file:py-1.5 file:text-xs file:text-white"
                      />
                      {keystoreFileName && (
                        <div className="font-mono text-[11px] text-emerald-400">{keystoreFileName}</div>
                      )}
                    </div>

                    <div className="space-y-1">
                      <label className="text-[#9AA3B2]">{dict.configure.keyAliasLabel}</label>
                      <input
                        type="text"
                        value={keyAlias}
                        onChange={(e) => setKeyAlias(e.target.value)}
                        className="w-full rounded border border-[#2E3648] bg-[#0E1117] px-2.5 py-1.5 font-mono text-white"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[#9AA3B2]">{dict.configure.storePasswordLabel}</label>
                      <input
                        type="password"
                        value={storePassword}
                        onChange={(e) => setStorePassword(e.target.value)}
                        className="w-full rounded border border-[#2E3648] bg-[#0E1117] px-2.5 py-1.5 font-mono text-white"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[#9AA3B2]">{dict.configure.keyPasswordLabel}</label>
                      <input
                        type="password"
                        value={keyPassword}
                        onChange={(e) => setKeyPassword(e.target.value)}
                        className="w-full rounded border border-[#2E3648] bg-[#0E1117] px-2.5 py-1.5 font-mono text-white"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[#9AA3B2]">{dict.configure.keystoreLabelInput}</label>
                      <input
                        type="text"
                        value={keystoreLabel}
                        onChange={(e) => setKeystoreLabel(e.target.value)}
                        placeholder="Production Keystore"
                        className="w-full rounded border border-[#2E3648] bg-[#0E1117] px-2.5 py-1.5 text-white"
                      />
                    </div>
                    <label className="sm:col-span-2 flex items-center gap-2 text-[#CBD2E0]">
                      <input
                        type="checkbox"
                        checked={saveForFuture}
                        onChange={(e) => setSaveForFuture(e.target.checked)}
                      />
                      <span>{dict.configure.saveKeystoreLabel}</span>
                    </label>
                  </div>
                )}

                {signingMethod === 'unsigned_release' && (
                  <div className="flex items-start gap-2.5 rounded border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
                    <ShieldAlert className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                    <span>{dict.configure.unsignedWarning}</span>
                  </div>
                )}
              </div>
            )}

            {/* Computed Command Preview */}
            {computedPreview && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs text-[#8E98AB]">
                  <Terminal className="h-3.5 w-3.5 text-emerald-400" />
                  <span>{dict.configure.computedCommandLabel}</span>
                </div>
                <pre
                  dir="ltr"
                  className="overflow-x-auto rounded-md border border-[#1F2430] bg-[#08090C] px-4 py-3 font-mono text-xs text-emerald-300"
                >
                  {computedPreview.command}
                </pre>
              </div>
            )}
          </section>

          {/* Workflow Approval / Installation / Update */}
          {workflowStatus && (!workflowStatus.installed || !workflowStatus.upToDate) ? (
            <section
              className={`rounded-lg border p-5 space-y-4 ${
                workflowStatus.installed
                  ? 'border-amber-500/45 bg-amber-500/5'
                  : 'border-sky-500/40 bg-[#0E1117]'
              }`}
            >
              <div className="space-y-1">
                <h2 className="text-base font-semibold text-white flex items-center gap-2">
                  <Code2
                    className={`h-4 w-4 ${
                      workflowStatus.installed ? 'text-amber-400' : 'text-sky-400'
                    }`}
                  />
                  <span>
                    {workflowStatus.installed
                      ? dict.configure.workflowUpdateTitle
                      : dict.configure.workflowRequiredTitle}
                  </span>
                </h2>
                <p className="text-xs sm:text-sm text-[#9AA3B2]">
                  {workflowStatus.installed
                    ? dict.configure.workflowUpdateDesc
                    : dict.configure.workflowRequiredDesc}
                </p>
                <p
                  className={`font-mono text-[11px] ${
                    workflowStatus.installed ? 'text-amber-300' : 'text-sky-300'
                  }`}
                >
                  {dict.configure.workflowPermissionsNote}
                </p>
              </div>

              <div className="rounded-md border border-[#1F2430] bg-[#08090C] overflow-hidden">
                <div className="border-b border-[#1F2430] bg-[#131720] px-3 py-1.5 font-mono text-[11px] text-[#8E98AB]">
                  {workflowStatus.workflowPath}
                </div>
                <pre
                  dir="ltr"
                  className="max-h-72 overflow-auto p-4 font-mono text-[11px] leading-relaxed text-[#CBD2E0]"
                >
                  {workflowStatus.templateYaml}
                </pre>
              </div>

              <label className="flex items-start gap-2.5 text-xs sm:text-sm text-white cursor-pointer">
                <input
                  type="checkbox"
                  checked={workflowApproved}
                  onChange={(e) => setWorkflowApproved(e.target.checked)}
                  className="mt-0.5"
                />
                <span>{dict.configure.workflowApproveCheckbox}</span>
              </label>

              <button
                type="button"
                disabled={!workflowApproved || installingWorkflow}
                onClick={handleInstallWorkflow}
                className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-xs sm:text-sm font-semibold disabled:opacity-50 ${
                  workflowStatus.installed
                    ? 'bg-amber-400 text-[#1A1204] hover:bg-amber-300'
                    : 'bg-sky-500 text-[#04121A] hover:bg-sky-400'
                }`}
              >
                {installingWorkflow && <Loader2 className="h-4 w-4 animate-spin" />}
                <span>
                  {installingWorkflow
                    ? dict.configure.workflowInstalling
                    : workflowStatus.installed
                    ? dict.configure.workflowUpdateButton
                    : dict.configure.workflowInstallButton}
                </span>
              </button>
            </section>
          ) : (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-lg border border-[#1F2430] bg-[#0E1117] p-5">
              <div className="flex items-center gap-2 text-xs font-mono text-emerald-400">
                <CheckCircle2 className="h-4 w-4" />
                <span>{dict.configure.workflowInstalledBadge}</span>
              </div>

              <button
                type="button"
                disabled={startingBuild}
                onClick={handleStartBuild}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-md bg-emerald-500 px-6 py-2.5 text-sm font-semibold text-[#04140E] hover:bg-emerald-400 disabled:opacity-50 transition-colors"
              >
                {startingBuild ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                <span>
                  {startingBuild ? dict.configure.startingBuild : dict.configure.buildButton}
                </span>
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function MetricBox({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-md border border-[#1F2430] bg-[#131720] p-3 space-y-1">
      <div className="text-[11px] text-[#8E98AB]">{label}</div>
      <div className={`text-xs text-white truncate ${mono ? 'font-mono' : 'font-medium'}`} title={value}>
        {value}
      </div>
    </div>
  );
}
