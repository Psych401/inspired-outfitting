import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export type SessionUser = { sub: string; email?: string; fullName?: string; avatarUrl?: string };

function getSupabaseAuthVerifier() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !anon) throw new Error('Supabase auth verifier is not configured');
  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function bearerFromRequest(request: Request): string | null {
  const auth = request.headers.get('authorization') ?? '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  return token || null;
}

/**
 * Server-only authenticated user from Supabase access token.
 */
export async function requireSessionUser(request: Request): Promise<SessionUser | NextResponse> {
  const token = bearerFromRequest(request);
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }
  const supabase = getSupabaseAuthVerifier();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return NextResponse.json({ error: 'Unauthorized', code: 'SESSION_INVALID' }, { status: 401 });
  }
  return {
    sub: data.user.id,
    email: data.user.email ?? undefined,
    fullName:
      typeof data.user.user_metadata?.full_name === 'string'
        ? data.user.user_metadata.full_name
        : undefined,
    avatarUrl:
      typeof data.user.user_metadata?.avatar_url === 'string'
        ? data.user.user_metadata.avatar_url
        : undefined,
  };
}
