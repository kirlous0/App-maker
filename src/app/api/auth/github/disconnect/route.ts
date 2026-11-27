import { NextResponse } from 'next/server';
import { dbStore } from '@/lib/db';
import { clearSessionCookie, getSession } from '@/lib/session';

export async function POST(request: Request) {
  const session = await getSession();
  if (session) {
    await dbStore.disconnectUserGitHub(session.userId);
  }
  const response = NextResponse.json({ ok: true });
  clearSessionCookie(response, request);
  return response;
}
