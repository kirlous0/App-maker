import { NextResponse } from 'next/server';
import { encryptSecret, sha256Hex } from '@/lib/crypto';
import { dbStore } from '@/lib/db';
import { getSession } from '@/lib/session';

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  const configs = await dbStore.listSigningConfigs(session.userId);
  return NextResponse.json({ signingConfigs: configs });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  let body: {
    label?: string;
    repoFullName?: string | null;
    keyAlias?: string;
    keystoreBase64?: string;
    storePassword?: string;
    keyPassword?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (
    !body.label?.trim() ||
    !body.keyAlias?.trim() ||
    !body.keystoreBase64?.trim() ||
    !body.storePassword ||
    !body.keyPassword
  ) {
    return NextResponse.json(
      { error: 'label, keyAlias, keystoreBase64, storePassword, and keyPassword are required' },
      { status: 400 }
    );
  }

  const cleanedB64 = body.keystoreBase64.replace(/\s+/g, '');
  const decoded = Buffer.from(cleanedB64, 'base64');
  if (decoded.length < 32 || decoded.length > 5 * 1024 * 1024) {
    return NextResponse.json(
      { error: 'Keystore file appears invalid or exceeds 5 MB limit.' },
      { status: 400 }
    );
  }

  const keystoreSha = sha256Hex(decoded);
  const created = await dbStore.createSigningConfig({
    user_id: session.userId,
    label: body.label.trim().slice(0, 80),
    repo_full_name: body.repoFullName?.trim() || null,
    key_alias: body.keyAlias.trim(),
    encrypted_keystore_base64: encryptSecret(cleanedB64),
    encrypted_store_password: encryptSecret(body.storePassword),
    encrypted_key_password: encryptSecret(body.keyPassword),
    keystore_sha256: keystoreSha,
  });

  return NextResponse.json({ signingConfig: created }, { status: 201 });
}
