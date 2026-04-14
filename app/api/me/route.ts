import { NextRequest, NextResponse } from 'next/server';
import { requireSessionUser } from '@/lib/auth/require-user';
import { ensureUserProfile, getOrCreateUser, getProfile } from '@/lib/billing/user-store';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const auth = await requireSessionUser(request);
  if (auth instanceof NextResponse) return auth;

  await ensureUserProfile(auth.sub, {
    email: auth.email,
    fullName: auth.fullName,
    avatarUrl: auth.avatarUrl,
  });
  const profile = await getProfile(auth.sub);
  const billing = await getOrCreateUser(auth.sub);

  return NextResponse.json({
    user: {
      id: auth.sub,
      email: profile?.email ?? auth.email ?? null,
      fullName: profile?.fullName ?? auth.fullName ?? null,
      avatarUrl: profile?.avatarUrl ?? auth.avatarUrl ?? null,
    },
    billing: {
      userId: billing.userId,
      credits: billing.credits,
      subscriptionTier: billing.subscriptionTier,
      subscriptionStatus: billing.subscriptionStatus,
    },
  });
}
