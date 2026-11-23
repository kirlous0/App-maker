'use client';

import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Cpu,
  KeyRound,
  Lock,
  ShieldCheck,
  Terminal,
} from 'lucide-react';
import { GitHubIcon } from '@/components/GitHubIcon';
import type { Dictionary } from '@/lib/i18n/dictionary';
import type { GitHubAppPublicConfig } from '@/lib/github/config';
import type { SupportedLanguage } from '@/lib/types';

interface LandingClientProps {
  lang: SupportedLanguage;
  dict: Dictionary;
  isConnected: boolean;
  githubApp: GitHubAppPublicConfig;
}

export function LandingClient({ lang, dict, isConnected, githubApp }: LandingClientProps) {
  const ArrowIcon = lang === 'ar' ? ArrowLeft : ArrowRight;

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12 sm:py-16 space-y-20">
      {/* Hero */}
      <section className="grid gap-10 lg:grid-cols-12 lg:items-center">
        <div className="lg:col-span-7 space-y-6">
          <div className="inline-flex items-center gap-2 rounded-md border border-[#1F2430] bg-[#0E1117] px-3 py-1 text-xs font-medium text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            <span>{dict.landing.badge}</span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-white leading-[1.2]">
            {dict.landing.heroTitle}
          </h1>

          <p className="text-base sm:text-lg text-[#9AA3B2] leading-relaxed max-w-2xl">
            {dict.landing.heroSubtitle}
          </p>

          <div className="flex items-start gap-2.5 rounded-md border border-amber-500/30 bg-amber-500/5 px-3.5 py-2.5 text-xs sm:text-sm text-amber-200/90 max-w-2xl">
            <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
            <span>{dict.landing.heroNotice}</span>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            {isConnected ? (
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 rounded-md bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-[#04140E] hover:bg-emerald-400 transition-colors"
              >
                <span>{dict.landing.ctaDashboard}</span>
                <ArrowIcon className="h-4 w-4" />
              </Link>
            ) : githubApp.isConfigured ? (
              <a
                href="/api/auth/github/login"
                className="inline-flex items-center gap-2 rounded-md bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-[#04140E] hover:bg-emerald-400 transition-colors"
              >
                <GitHubIcon className="h-4 w-4" />
                <span>{dict.landing.ctaConnect}</span>
              </a>
            ) : (
              <Link
                href="/settings"
                className="inline-flex items-center gap-2 rounded-md bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-[#04140E] hover:bg-emerald-400 transition-colors"
              >
                <GitHubIcon className="h-4 w-4" />
                <span>{dict.landing.ctaConnect}</span>
              </Link>
            )}

            <a
              href="#security"
              className="inline-flex items-center gap-2 rounded-md border border-[#2E3648] bg-[#0E1117] px-4 py-2.5 text-sm font-medium text-[#E2E8F0] hover:border-[#414D66] hover:bg-[#131720] transition-colors"
            >
              <ShieldCheck className="h-4 w-4 text-[#8E98AB]" />
              <span>{dict.landing.ctaDocs}</span>
            </a>
          </div>
        </div>

        {/* Technical Pipeline Blueprint Card */}
        <div className="lg:col-span-5">
          <div className="rounded-lg border border-[#1F2430] bg-[#0E1117] overflow-hidden">
            <div className="flex items-center justify-between border-b border-[#1F2430] bg-[#131720] px-4 py-2.5">
              <div className="flex items-center gap-2 text-xs font-mono text-[#9AA3B2]">
                <Terminal className="h-3.5 w-3.5 text-emerald-400" />
                <span>repo2apk-pipeline.spec</span>
              </div>
              <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] text-emerald-300">
                GITHUB_ACTIONS
              </span>
            </div>
            <div className="p-4 font-mono text-xs space-y-3 text-[#CBD2E0]" dir="ltr">
              <div className="flex items-center justify-between border-b border-[#1A1F2A] pb-2">
                <span className="text-[#8E98AB]">01 · auth</span>
                <span className="text-emerald-400">GitHub App OAuth (AES-256-GCM)</span>
              </div>
              <div className="flex items-center justify-between border-b border-[#1A1F2A] pb-2">
                <span className="text-[#8E98AB]">02 · detect</span>
                <span className="text-sky-300">Gradle .kts / Groovy / Flutter / RN</span>
              </div>
              <div className="flex items-center justify-between border-b border-[#1A1F2A] pb-2">
                <span className="text-[#8E98AB]">03 · runner</span>
                <span className="text-[#E2E8F0]">workflow_dispatch -&gt; ubuntu-latest</span>
              </div>
              <div className="flex items-center justify-between border-b border-[#1A1F2A] pb-2">
                <span className="text-[#8E98AB]">04 · verify</span>
                <span className="text-[#E2E8F0]">AndroidManifest + DEX + SHA-256</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#8E98AB]">05 · storage</span>
                <span className="text-emerald-400">Private Bucket + Signed URL</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="space-y-6">
        <div className="border-b border-[#1F2430] pb-4">
          <h2 className="text-xl sm:text-2xl font-semibold text-white">
            {dict.landing.howItWorksTitle}
          </h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {dict.landing.howItWorksSteps.map((item) => (
            <div
              key={item.step}
              className="rounded-lg border border-[#1F2430] bg-[#0E1117] p-5 space-y-3 hover:border-[#2E3648] transition-colors"
            >
              <span className="inline-block font-mono text-xs font-semibold text-emerald-400 border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 rounded">
                {item.step}
              </span>
              <h3 className="text-sm font-semibold text-white">{item.title}</h3>
              <p className="text-xs sm:text-sm text-[#8E98AB] leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Supported Frameworks */}
      <section className="space-y-6">
        <div className="border-b border-[#1F2430] pb-4 space-y-1">
          <h2 className="text-xl sm:text-2xl font-semibold text-white">
            {dict.landing.frameworksTitle}
          </h2>
          <p className="text-sm text-[#8E98AB]">{dict.landing.frameworksSubtitle}</p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {dict.landing.frameworks.map((fw) => (
            <div
              key={fw.name}
              className="rounded-lg border border-[#1F2430] bg-[#0E1117] p-5 space-y-3"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-white">{fw.name}</h3>
                <Cpu className="h-4 w-4 text-emerald-400" />
              </div>
              <p className="font-mono text-xs text-sky-300" dir="ltr">
                {fw.stack}
              </p>
              <p className="text-xs sm:text-sm text-[#8E98AB] leading-relaxed">{fw.details}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Security Section */}
      <section id="security" className="space-y-6">
        <div className="border-b border-[#1F2430] pb-4 space-y-1">
          <h2 className="text-xl sm:text-2xl font-semibold text-white">
            {dict.landing.securityTitle}
          </h2>
          <p className="text-sm text-[#8E98AB]">{dict.landing.securitySubtitle}</p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {dict.landing.securityItems.map((sec, idx) => {
            const Icon = idx === 0 ? Lock : idx === 1 ? ShieldCheck : KeyRound;
            return (
              <div
                key={sec.title}
                className="rounded-lg border border-[#1F2430] bg-[#0E1117] p-5 space-y-3"
              >
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-md border border-[#2E3648] bg-[#131720] text-emerald-400">
                    <Icon className="h-4 w-4" />
                  </span>
                  <h3 className="text-sm font-semibold text-white">{sec.title}</h3>
                </div>
                <p className="text-xs sm:text-sm text-[#8E98AB] leading-relaxed">{sec.desc}</p>
              </div>
            );
          })}
        </div>

        <div className="rounded-lg border border-[#1F2430] bg-[#0E1117] p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-white">
                {lang === 'ar'
                  ? 'لا يتم تخزين رموز الوصول في المتصفح ولا تمرير أي كلمات مرور في السجلات'
                  : 'Zero browser token storage & masked ephemeral signing secrets'}
              </p>
              <p className="text-xs text-[#8E98AB]">
                {lang === 'ar'
                  ? 'كل مستخدم يرى مستودعاته المصرح بها وسجلاته وملفات APK الخاصة به فقط.'
                  : 'Row-Level Security ensures every user accesses only their own build jobs and APK artifacts.'}
              </p>
            </div>
          </div>
          <Link
            href={isConnected ? '/dashboard' : '/settings'}
            className="shrink-0 rounded-md border border-[#2E3648] bg-[#131720] px-4 py-2 text-xs font-medium text-white hover:border-emerald-500/50 transition-colors"
          >
            {isConnected ? dict.landing.ctaDashboard : dict.dashboard.goToSettings}
          </Link>
        </div>
      </section>
    </div>
  );
}
