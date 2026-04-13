import { createHmac, timingSafeEqual } from 'crypto';
import { normalizeUserId } from '@/lib/billing/user-store';

const COOKIE_NAME = 'io_session';
const MAX_AGE_SEC = 60 * 60 * 24 * 7;

function getSecret(): Buffer | null {
  const s = process.env.SESSION_SECRET?.trim() || process.env.AUTH_SECRET?.trim();
  if (!s || s.length < 32) return null;
  return Buffer.from(s, 'utf8');
}

export { COOKIE_NAME };

export function isSessionSigningConfigured(): boolean {
  return getSecret() !== null;
}

/**
 * Signed session token: base64url(payloadJson).hmacSha256Base64url
 */
export function signSession(userId: string): string | null {
  const secret = getSecret();
  if (!secret) return null;
  const sub = normalizeUserId(userId);
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE_SEC;
  const payloadJson = JSON.stringify({ sub, exp });
  const payloadB64 = Buffer.from(payloadJson, 'utf8').toString('base64url');
  const sig = createHmac('sha256', secret).update(payloadB64).digest();
  const sigB64 = Buffer.from(sig).toString('base64url');
  return `${payloadB64}.${sigB64}`;
}

export function verifySession(token: string): { sub: string } | null {
  const secret = getSecret();
  if (!secret) return null;
  const i = token.indexOf('.');
  if (i <= 0) return null;
  const payloadB64 = token.slice(0, i);
  const sigB64 = token.slice(i + 1);
  if (!payloadB64 || !sigB64) return null;
  const expectedSig = createHmac('sha256', secret).update(payloadB64).digest();
  let sigBuf: Buffer;
  try {
    sigBuf = Buffer.from(sigB64, 'base64url');
  } catch {
    return null;
  }
  if (sigBuf.length !== expectedSig.length || !timingSafeEqual(sigBuf, expectedSig)) {
    return null;
  }
  let payload: { sub?: string; exp?: number };
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as {
      sub?: string;
      exp?: number;
    };
  } catch {
    return null;
  }
  if (typeof payload.sub !== 'string' || typeof payload.exp !== 'number') return null;
  if (payload.exp < Math.floor(Date.now() / 1000)) return null;
  return { sub: normalizeUserId(payload.sub) };
}
