import crypto from 'node:crypto';
import sodium from 'libsodium-wrappers';

const AES_PREFIX = 'v1';

function getEncryptionKey(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY?.trim();
  if (!raw) {
    throw new Error('TOKEN_ENCRYPTION_KEY environment variable is not configured.');
  }
  // Accept 64 hex chars (32 bytes) or 44 base64 chars (32 bytes)
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, 'hex');
  }
  const b64 = Buffer.from(raw, 'base64');
  if (b64.length === 32) {
    return b64;
  }
  // Fallback deterministic SHA-256 derivation ONLY if user passed a long passphrase >= 32 chars
  if (raw.length >= 32) {
    return crypto.createHash('sha256').update(raw, 'utf8').digest();
  }
  throw new Error('TOKEN_ENCRYPTION_KEY must be a 64-character hex string (32 bytes).');
}

function getSessionSecret(): Buffer {
  const raw = process.env.SESSION_SECRET?.trim();
  if (!raw || raw.length < 32) {
    throw new Error('SESSION_SECRET environment variable must be configured (>= 32 chars).');
  }
  return Buffer.from(raw, 'utf8');
}

export function encryptSecret(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [
    AES_PREFIX,
    iv.toString('base64url'),
    authTag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join(':');
}

export function decryptSecret(encoded: string): string {
  const parts = encoded.split(':');
  if (parts.length !== 4 || parts[0] !== AES_PREFIX) {
    throw new Error('Invalid encrypted payload format.');
  }
  const [, ivB64, tagB64, ctB64] = parts;
  const key = getEncryptionKey();
  const iv = Buffer.from(ivB64, 'base64url');
  const tag = Buffer.from(tagB64, 'base64url');
  const ciphertext = Buffer.from(ctB64, 'base64url');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}

export interface SessionPayload {
  userId: string;
  githubLogin: string;
  iat: number;
  exp: number;
}

export function signSessionToken(payload: Omit<SessionPayload, 'iat' | 'exp'>, ttlSeconds = 60 * 60 * 24 * 7): string {
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: SessionPayload = {
    ...payload,
    iat: now,
    exp: now + ttlSeconds,
  };
  const body = Buffer.from(JSON.stringify(fullPayload), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(body)
    .digest('base64url');
  return `${body}.${sig}`;
}

export function verifySessionToken(token: string | undefined | null): SessionPayload | null {
  if (!token || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  try {
    const expectedSig = crypto
      .createHmac('sha256', getSessionSecret())
      .update(body)
      .digest('base64url');
    const sigBuf = Buffer.from(sig, 'utf8');
    const expectedBuf = Buffer.from(expectedSig, 'utf8');
    if (sigBuf.length !== expectedBuf.length) return null;
    if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionPayload;
    if (!parsed.userId || !parsed.exp || parsed.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function signGenericToken(data: Record<string, unknown>, ttlSeconds = 600): string {
  const now = Math.floor(Date.now() / 1000);
  const body = Buffer.from(
    JSON.stringify({ ...data, iat: now, exp: now + ttlSeconds }),
    'utf8'
  ).toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(body)
    .digest('base64url');
  return `${body}.${sig}`;
}

export function verifyGenericToken<T extends Record<string, unknown>>(token: string | undefined | null): T | null {
  if (!token || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  try {
    const expected = crypto
      .createHmac('sha256', getSessionSecret())
      .update(body)
      .digest('base64url');
    const a = Buffer.from(sig, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T & { exp?: number };
    if (!parsed.exp || parsed.exp < Math.floor(Date.now() / 1000)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function createGitHubAppJwt(appId: string, privateKeyRaw: string): string {
  const pem = privateKeyRaw.replace(/\\n/g, '\n').trim();
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      iat: now - 60,
      exp: now + 9 * 60,
      iss: appId,
    })
  ).toString('base64url');

  const signingInput = `${header}.${payload}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(pem, 'base64url');
  return `${signingInput}.${signature}`;
}

export function verifyGitHubWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  webhookSecret: string
): boolean {
  if (!signatureHeader || !signatureHeader.startsWith('sha256=') || !webhookSecret) {
    return false;
  }
  const digest = `sha256=${crypto
    .createHmac('sha256', webhookSecret)
    .update(rawBody, 'utf8')
    .digest('hex')}`;
  const a = Buffer.from(signatureHeader, 'utf8');
  const b = Buffer.from(digest, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export async function sealGitHubActionSecret(
  repoPublicKeyBase64: string,
  secretValue: string
): Promise<string> {
  await sodium.ready;
  const binKey = sodium.from_base64(repoPublicKeyBase64, sodium.base64_variants.ORIGINAL);
  const binSec = sodium.from_string(secretValue);
  const encryptedBytes = sodium.crypto_box_seal(binSec, binKey);
  return sodium.to_base64(encryptedBytes, sodium.base64_variants.ORIGINAL);
}

export function sha256Hex(input: Buffer | string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export function generateNonce(bytes = 12): string {
  return crypto.randomBytes(bytes).toString('hex');
}
