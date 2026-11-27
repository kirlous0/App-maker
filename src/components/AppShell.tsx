'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Cpu,
  History,
  Languages,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  X,
} from 'lucide-react';
import { GitHubIcon } from '@/components/GitHubIcon';
import { useState } from 'react';
import type { Dictionary } from '@/lib/i18n/dictionary';
import type { SupportedLanguage, UserProfile } from '@/lib/types';

interface AppShellProps {
  lang: SupportedLanguage;
  dict: Dictionary;
  user: UserProfile | null;
  isConnected: boolean;
  children: React.ReactNode;
}

export function AppShell({ lang, dict, user, isConnected, children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [switchingLang, setSwitchingLang] = useState(false);

  const toggleLanguage = async () => {
    const nextLang: SupportedLanguage = lang === 'ar' ? 'en' : 'ar';
    setSwitchingLang(true);
    try {
      await fetch('/api/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferred_language: nextLang }),
      });
      document.documentElement.lang = nextLang;
      document.documentElement.dir = nextLang === 'ar' ? 'rtl' : 'ltr';
      router.refresh();
    } finally {
      setSwitchingLang(false);
    }
  };

  const handleDisconnect = async () => {
    await fetch('/api/auth/github/disconnect', { method: 'POST' });
    router.push('/');
    router.refresh();
  };

  const navItems = [
    { href: '/dashboard', label: dict.nav.dashboard, icon: LayoutDashboard },
    { href: '/history', label: dict.nav.history, icon: History },
    { href: '/settings', label: dict.nav.settings, icon: Settings },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-[#08090C] text-[#F3F5F9]">
      <header className="sticky top-0 z-40 border-b border-[#1F2430] bg-[#08090C]/95 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-6">
            <Link
              href="/"
              className="flex items-center gap-2.5 text-sm font-semibold tracking-tight text-white hover:opacity-90"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-md border border-emerald-500/40 bg-emerald-500/10 text-emerald-400">
                <Cpu className="h-4 w-4" />
              </span>
              <span className="font-mono text-base">{dict.brand}</span>
            </Link>

            <nav className="hidden md:flex items-center gap-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors ${
                      active
                        ? 'bg-[#131720] text-white border border-[#2E3648]'
                        : 'text-[#8E98AB] hover:text-white hover:bg-[#0E1117] border border-transparent'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={toggleLanguage}
              disabled={switchingLang}
              aria-label="Toggle Language"
              className="inline-flex items-center gap-1.5 rounded-md border border-[#1F2430] bg-[#0E1117] px-2.5 py-1.5 text-xs font-medium text-[#CBD2E0] hover:border-[#2E3648] hover:text-white transition-colors"
            >
              <Languages className="h-3.5 w-3.5 text-emerald-400" />
              <span className="font-mono">{lang === 'ar' ? 'EN' : 'العربية'}</span>
            </button>

            {isConnected && user ? (
              <div className="hidden sm:flex items-center gap-2">
                <Link
                  href="/settings"
                  className="flex items-center gap-2 rounded-md border border-[#1F2430] bg-[#0E1117] px-2.5 py-1 text-xs hover:border-[#2E3648]"
                >
                  {user.avatar_url ? (
                    <img
                      src={user.avatar_url}
                      alt={user.github_login}
                      className="h-5 w-5 rounded-full border border-[#2E3648]"
                    />
                  ) : (
                    <GitHubIcon className="h-4 w-4 text-[#8E98AB]" />
                  )}
                  <span className="font-mono text-[#E2E8F0]">@{user.github_login}</span>
                </Link>
                <button
                  type="button"
                  onClick={handleDisconnect}
                  title={dict.nav.disconnectGithub}
                  className="inline-flex items-center gap-1.5 rounded-md border border-[#1F2430] bg-[#0E1117] px-2.5 py-1.5 text-xs text-[#8E98AB] hover:border-red-500/40 hover:text-red-400 transition-colors"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span className="hidden lg:inline">{dict.nav.disconnectGithub}</span>
                </button>
              </div>
            ) : (
              <a
                href="/api/auth/github/login"
                className="hidden sm:inline-flex items-center gap-1.5 rounded-md border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/25 transition-colors"
              >
                <GitHubIcon className="h-3.5 w-3.5" />
                <span>{dict.nav.connectGithub}</span>
              </a>
            )}

            <button
              type="button"
              onClick={() => setMobileOpen((prev) => !prev)}
              className="md:hidden inline-flex items-center justify-center rounded-md border border-[#1F2430] bg-[#0E1117] p-1.5 text-[#8E98AB] hover:text-white"
              aria-label="Menu"
            >
              {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {mobileOpen && (
          <div className="md:hidden border-t border-[#1F2430] bg-[#0E1117] px-4 py-3 space-y-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
                    active
                      ? 'bg-[#131720] text-white border border-[#2E3648]'
                      : 'text-[#8E98AB] hover:text-white'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
            <div className="pt-2 border-t border-[#1F2430]">
              {isConnected && user ? (
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-[#E2E8F0]">@{user.github_login}</span>
                  <button
                    type="button"
                    onClick={handleDisconnect}
                    className="text-xs text-red-400 hover:underline"
                  >
                    {dict.nav.disconnectGithub}
                  </button>
                </div>
              ) : (
                <a
                  href="/api/auth/github/login"
                  className="flex w-full items-center justify-center gap-2 rounded-md bg-emerald-500/20 border border-emerald-500/40 px-3 py-2 text-xs font-semibold text-emerald-300"
                >
                  <GitHubIcon className="h-3.5 w-3.5" />
                  <span>{dict.nav.connectGithub}</span>
                </a>
              )}
            </div>
          </div>
        )}
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-[#1F2430] bg-[#08090C] py-5 text-xs text-[#8E98AB]">
        <div className="mx-auto flex max-w-7xl flex-col sm:flex-row items-center justify-between gap-2 px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[#CBD2E0]">Repo2APK</span>
            <span>·</span>
            <span>{dict.tagline}</span>
          </div>
          <div className="font-mono text-[11px] text-[#6B7487]">
            GitHub App OAuth · GitHub Actions Runners · Private Storage
          </div>
        </div>
      </footer>
    </div>
  );
}
