import { NextResponse } from 'next/server';
import { clearSessionCookie } from '@/lib/session';

export async function POST(request: Request) {
  const res = NextResponse.json({ ok: true });
  clearSessionCookie(res, request);
  return res;
}
