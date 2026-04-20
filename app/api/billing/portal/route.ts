import { NextRequest, NextResponse } from 'next/server';
import { requireSessionUser } from '@/lib/auth/require-user';
import { getStripe } from '@/lib/billing/stripe-client';
import { getUser } from '@/lib/billing/user-store';
import { auditLog } from '@/lib/billing/audit';
import { getCanonicalAppOrigin } from '@/lib/app-url';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ error: 'Stripe is not configured' }, { status: 503 });
  }

  const auth = await requireSessionUser(request);
  if (auth instanceof NextResponse) return auth;

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

  const returnUrl = `${getCanonicalAppOrigin()}/profile?portal=return`;
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
