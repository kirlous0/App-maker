import type { Metadata } from 'next';
import './globals.css';
import { resolveServerLanguage } from '@/lib/i18n/server';

export const metadata: Metadata = {
  title: 'Repo2APK — Automated Android APK Build Platform',
  description:
    'Compile native Android, Flutter, and React Native GitHub repositories into verified APKs using isolated GitHub Actions.',
};

export const dynamic = 'force-dynamic';

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { lang, dir } = await resolveServerLanguage();

  return (
    <html lang={lang} dir={dir} className="dark">
      <body className="min-h-screen bg-[#08090C] text-[#F3F5F9] antialiased selection:bg-emerald-500/20 selection:text-emerald-300">
        {children}
      </body>
    </html>
  );
}
