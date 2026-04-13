import { NextResponse } from 'next/server';
import { requireSessionUser } from '@/lib/auth/require-user';
import { getOrCreateUser } from '@/lib/billing/user-store';

export const runtime = 'nodejs';

/** Non-sensitive billing snapshot for the signed-in user. */
export async function GET() {
  const auth = await requireSessionUser();
  if (auth instanceof NextResponse) return auth;

  const u = getOrCreateUser(auth.sub);
  return NextResponse.json({
    userId: u.userId,
    credits: u.credits,
    subscriptionTier: u.subscriptionTier,
    subscriptionStatus: u.subscriptionStatus,
  });
}
