import { NextRequest, NextResponse } from 'next/server';
import { requireSessionUser } from '@/lib/auth/require-user';
import { ensureUserProfile, getOrCreateUser } from '@/lib/billing/user-store';

export const runtime = 'nodejs';

/** Non-sensitive billing snapshot for the signed-in user. */
export async function GET(request: NextRequest) {
  const auth = await requireSessionUser(request);
  if (auth instanceof NextResponse) return auth;
  await ensureUserProfile(auth.sub, { email: auth.email, fullName: auth.fullName, avatarUrl: auth.avatarUrl });

  const u = await getOrCreateUser(auth.sub);
  return NextResponse.json({
    userId: u.userId,
    credits: u.credits,
    subscriptionTier: u.subscriptionTier,
    subscriptionStatus: u.subscriptionStatus,
  });
}
