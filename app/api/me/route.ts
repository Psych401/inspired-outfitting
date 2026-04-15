import { NextRequest, NextResponse } from 'next/server';
import { requireSessionUser } from '@/lib/auth/require-user';
import { ensureUserProfile, getOrCreateUser, getProfile } from '@/lib/billing/user-store';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const auth = await requireSessionUser(request);
  if (auth instanceof NextResponse) return auth;

  try {
    await ensureUserProfile(auth.sub, {
      email: auth.email,
      fullName: auth.fullName,
      avatarUrl: auth.avatarUrl,
    });
  } catch (error) {
    console.error('[api/me] ensureUserProfile failed, continuing with auth user fallback', error);
  }

  const profile = await getProfile(auth.sub).catch((error) => {
    console.error('[api/me] getProfile failed, using auth metadata fallback', error);
    return null;
  });

  const billing = await getOrCreateUser(auth.sub).catch((error) => {
    console.error('[api/me] getOrCreateUser failed', error);
    return null;
  });

  return NextResponse.json({
    user: {
      id: auth.sub,
      email: profile?.email ?? auth.email ?? null,
      fullName: profile?.fullName ?? auth.fullName ?? null,
      avatarUrl: profile?.avatarUrl ?? auth.avatarUrl ?? null,
    },
    billing: {
      userId: billing?.userId ?? auth.sub,
      credits: billing?.credits ?? null,
      subscriptionTier: billing?.subscriptionTier ?? 'none',
      subscriptionStatus: billing?.subscriptionStatus ?? 'none',
    },
  });
}
