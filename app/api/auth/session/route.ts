import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { COOKIE_NAME, isSessionSigningConfigured, signSession, verifySession } from '@/lib/auth/session';

export const runtime = 'nodejs';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function sessionCookieOptions(maxAgeSec: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeSec,
  };
}

/** Current session user (for client hydration). */
export async function GET() {
  if (!isSessionSigningConfigured()) {
    return NextResponse.json({ error: 'Session not configured' }, { status: 503 });
  }
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ authenticated: false });
  }
  const v = verifySession(token);
  if (!v) {
    return NextResponse.json({ authenticated: false });
  }
  return NextResponse.json({ authenticated: true, userId: v.sub });
}

/** Create session after client-side login (replace with OAuth callback in production). */
export async function POST(request: NextRequest) {
  if (!isSessionSigningConfigured()) {
    return NextResponse.json({ error: 'SESSION_SECRET (or AUTH_SECRET) must be set (min 32 chars)' }, { status: 503 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const email =
    typeof body === 'object' && body !== null && 'email' in body
      ? String((body as { email: unknown }).email ?? '').trim()
      : '';
  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
  }

  const token = signSession(email);
  if (!token) {
    return NextResponse.json({ error: 'Could not sign session' }, { status: 500 });
  }

  const res = NextResponse.json({ ok: true, userId: email.toLowerCase() });
  res.cookies.set(COOKIE_NAME, token, sessionCookieOptions(60 * 60 * 24 * 7));
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, '', { ...sessionCookieOptions(0), maxAge: 0 });
  return res;
}
