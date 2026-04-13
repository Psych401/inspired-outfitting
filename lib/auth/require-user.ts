import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { COOKIE_NAME, verifySession } from './session';

export type SessionUser = { sub: string };

/**
 * Server-only authenticated user from httpOnly session cookie (cannot be spoofed by form fields).
 */
export async function requireSessionUser(): Promise<SessionUser | NextResponse> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }
  const v = verifySession(token);
  if (!v) {
    return NextResponse.json({ error: 'Unauthorized', code: 'SESSION_INVALID' }, { status: 401 });
  }
  return { sub: v.sub };
}
