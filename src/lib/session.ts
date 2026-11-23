import { cookies } from 'next/headers';
import type { NextResponse } from 'next/server';
import { signGenericToken, signSessionToken, verifyGenericToken, verifySessionToken } from '@/lib/crypto';
import type { SupportedLanguage } from '@/lib/types';

export const SESSION_COOKIE_NAME = 'repo2apk_session';
export const OAUTH_STATE_COOKIE_NAME = 'repo2apk_oauth_state';
export const MANIFEST_STATE_COOKIE_NAME = 'repo2apk_manifest_state';
export const LANG_COOKIE_NAME = 'repo2apk_lang';

function isProductionSecure(request?: Request): boolean {
  const url = process.env.NEXT_PUBLIC_APP_URL || '';
  if (url.startsWith('https://')) return true;
  if (request) {
    const fwdProto = request.headers.get('x-forwarded-proto');
    if (fwdProto === 'https') return true;
    if (request.url.startsWith('https://')) return true;
  }
  return false;
}

export function setSessionCookie(
  response: NextResponse,
  userId: string,
  githubLogin: string,
  request?: Request
): void {
  const token = signSessionToken({ userId, githubLogin });
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProductionSecure(request),
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
}

export function clearSessionCookie(response: NextResponse, request?: Request): void {
  response.cookies.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProductionSecure(request),
    path: '/',
    maxAge: 0,
  });
}

export function setOAuthStateCookie(
  response: NextResponse,
  state: string,
  returnTo = '/dashboard',
  request?: Request
): void {
  const signed = signGenericToken({ state, returnTo }, 600);
  response.cookies.set(OAUTH_STATE_COOKIE_NAME, signed, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProductionSecure(request),
    path: '/',
    maxAge: 600,
  });
}

export async function consumeOAuthStateCookie(
  expectedState: string | null
): Promise<{ valid: boolean; returnTo: string }> {
  const store = await cookies();
  const raw = store.get(OAUTH_STATE_COOKIE_NAME)?.value;
  const parsed = verifyGenericToken<{ state: string; returnTo?: string }>(raw);
  if (!parsed || !expectedState || parsed.state !== expectedState) {
    return { valid: false, returnTo: '/dashboard' };
  }
  return { valid: true, returnTo: parsed.returnTo || '/dashboard' };
}

export function setManifestStateCookie(
  response: NextResponse,
  state: string,
  request?: Request
): void {
  const signed = signGenericToken({ state, kind: 'manifest' }, 1800);
  response.cookies.set(MANIFEST_STATE_COOKIE_NAME, signed, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProductionSecure(request),
    path: '/',
    maxAge: 1800,
  });
}

export async function consumeManifestStateCookie(expectedState: string | null): Promise<boolean> {
  const store = await cookies();
  const raw = store.get(MANIFEST_STATE_COOKIE_NAME)?.value;
  const parsed = verifyGenericToken<{ state: string; kind?: string }>(raw);
  return Boolean(
    parsed &&
      parsed.kind === 'manifest' &&
      expectedState &&
      parsed.state === expectedState
  );
}

export async function getSession(): Promise<{ userId: string; githubLogin: string } | null> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE_NAME)?.value;
  const verified = verifySessionToken(raw);
  if (!verified) return null;
  return { userId: verified.userId, githubLogin: verified.githubLogin };
}

export async function getLanguageCookie(): Promise<SupportedLanguage> {
  const store = await cookies();
  const val = store.get(LANG_COOKIE_NAME)?.value;
  return val === 'en' ? 'en' : 'ar';
}

export function setLanguageCookie(
  response: NextResponse,
  lang: SupportedLanguage,
  request?: Request
): void {
  response.cookies.set(LANG_COOKIE_NAME, lang, {
    httpOnly: false,
    sameSite: 'lax',
    secure: isProductionSecure(request),
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
}
