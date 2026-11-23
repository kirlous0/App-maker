import { NextResponse } from 'next/server';
import { dbStore } from '@/lib/db';
import { getSession } from '@/lib/session';

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  const { id } = await context.params;
  const deleted = await dbStore.deleteSigningConfig(session.userId, id);
  if (!deleted) {
    return NextResponse.json({ error: 'Signing configuration not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
