import { NextRequest, NextResponse } from 'next/server';
import { requireSessionUser } from '@/lib/auth/require-user';
import { getStripe } from '@/lib/billing/stripe-client';
import { ensureUserProfile, getUser } from '@/lib/billing/user-store';
import { auditLog } from '@/lib/billing/audit';

export const runtime = 'nodejs';

function appBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.APP_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, '');
  const v = process.env.VERCEL_URL;
  if (v) return (v.startsWith('http') ? v : `https://${v}`).replace(/\/$/, '');
  return 'http://localhost:3000';
}

export async function POST(request: NextRequest) {
  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ error: 'Stripe is not configured' }, { status: 503 });
  }

  const auth = await requireSessionUser(request);
  if (auth instanceof NextResponse) return auth;
  await ensureUserProfile(auth.sub, { email: auth.email, fullName: auth.fullName, avatarUrl: auth.avatarUrl });

  const billing = await getUser(auth.sub);
  const customerId = billing?.stripeCustomerId;
  if (!customerId) {
    return NextResponse.json(
      {
        error: 'No Stripe customer was found for this account. Subscribe first to use portal management.',
        code: 'STRIPE_CUSTOMER_NOT_FOUND',
      },
      { status: 409 }
    );
  }

  const returnUrl = `${appBaseUrl()}/profile?portal=return`;
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });

  auditLog('checkout_session_created', {
    userId: auth.sub,
    purchaseType: 'subscription_portal',
    stripeCustomerId: customerId,
  });

  return NextResponse.json({ url: session.url });
}
