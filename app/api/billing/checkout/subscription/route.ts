import { NextRequest, NextResponse } from 'next/server';
import { requireSessionUser } from '@/lib/auth/require-user';
import { getStripe } from '@/lib/billing/stripe-client';
import { assertSubscriptionPlanKey, getSubscriptionStripePriceId } from '@/lib/billing/products';
import { getUser, setStripeCustomer } from '@/lib/billing/user-store';
import { checkBillingCheckoutLimit } from '@/lib/billing/rate-limit';
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

  const auth = await requireSessionUser();
  if (auth instanceof NextResponse) return auth;

  const rl = checkBillingCheckoutLimit(auth.sub);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded', code: 'RATE_LIMIT', retryAfterSec: rl.retryAfterSec },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec ?? 60) } }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const planKeyRaw =
    typeof body === 'object' && body !== null && 'planKey' in body
      ? (body as { planKey: unknown }).planKey
      : undefined;

  let planKey: ReturnType<typeof assertSubscriptionPlanKey>;
  try {
    planKey = assertSubscriptionPlanKey(planKeyRaw);
  } catch {
    return NextResponse.json({ error: 'Unknown or invalid plan key', code: 'INVALID_PLAN_KEY' }, { status: 400 });
  }

  const priceId = getSubscriptionStripePriceId(planKey);
  if (!priceId) {
    return NextResponse.json(
      { error: 'Subscription price not configured on server', code: 'PRICE_NOT_CONFIGURED' },
      { status: 503 }
    );
  }

  const existingUser = await getUser(auth.sub);
  let customerId = existingUser?.stripeCustomerId;
  if (!customerId) {
    const c = await stripe.customers.create({
      email: auth.sub,
      metadata: { userId: auth.sub },
    });
    customerId = c.id;
    await setStripeCustomer(auth.sub, customerId);
  }

  const base = appBaseUrl();
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${base}/dress-yourself?checkout=success`,
    cancel_url: `${base}/pricing?checkout=cancel`,
    metadata: {
      userId: auth.sub,
      purchaseType: 'subscription',
      planKey,
    },
    subscription_data: {
      metadata: {
        userId: auth.sub,
        planKey,
      },
    },
  });

  auditLog('checkout_session_created', {
    userId: auth.sub,
    purchaseType: 'subscription',
    planKey,
    stripeCheckoutSessionId: session.id,
  });

  if (!session.url) {
    return NextResponse.json({ error: 'Checkout URL missing' }, { status: 500 });
  }

  return NextResponse.json({ url: session.url });
}
