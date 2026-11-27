import { NextResponse } from 'next/server';
import { dbStore } from '@/lib/db';
import { getLanguageCookie, getSession, setLanguageCookie } from '@/lib/session';
import type { BuildMode, SupportedLanguage } from '@/lib/types';

export async function GET() {
  const session = await getSession();
  const cookieLang = await getLanguageCookie();
  if (!session) {
    return NextResponse.json({
      preferred_language: cookieLang,
      default_build_type: 'debug',
      artifact_retention_days: 7,
    });
  }
  const user = await dbStore.getUserById(session.userId);
  return NextResponse.json({
    preferred_language: user?.preferred_language || cookieLang,
    default_build_type: user?.default_build_type || 'debug',
    artifact_retention_days: user?.artifact_retention_days || 7,
  });
}

export async function PATCH(request: Request) {
  let body: {
    language?: SupportedLanguage;
    preferred_language?: SupportedLanguage;
    default_build_type?: BuildMode;
    artifact_retention_days?: number;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const requestedLang = body.preferred_language ?? body.language;
  const lang: SupportedLanguage | undefined =
    requestedLang === 'ar' || requestedLang === 'en' ? requestedLang : undefined;
  const buildType: BuildMode | undefined =
    body.default_build_type === 'debug' || body.default_build_type === 'release'
      ? body.default_build_type
      : undefined;
  const retention =
    typeof body.artifact_retention_days === 'number' &&
    body.artifact_retention_days >= 1 &&
    body.artifact_retention_days <= 90
      ? Math.round(body.artifact_retention_days)
      : undefined;

  const session = await getSession();
  let updated = null;
  if (session) {
    updated = await dbStore.updateUserPreferences(session.userId, {
      ...(lang ? { preferred_language: lang } : {}),
      ...(buildType ? { default_build_type: buildType } : {}),
      ...(retention ? { artifact_retention_days: retention } : {}),
    });
  }

  const res = NextResponse.json({
    ok: true,
    preferred_language: updated?.preferred_language || lang || (await getLanguageCookie()),
    default_build_type: updated?.default_build_type || buildType || 'debug',
    artifact_retention_days: updated?.artifact_retention_days || retention || 7,
  });

  if (lang) {
    setLanguageCookie(res, lang, request);
  }
  return res;
}
