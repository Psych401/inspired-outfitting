import { NextRequest, NextResponse } from 'next/server';
import { requireSessionUser } from '@/lib/auth/require-user';
import { getStripe } from '@/lib/billing/stripe-client';
import { assertCreditPackKey, getCreditPackStripePriceId } from '@/lib/billing/products';
import { ensureUserProfile, getOrCreateUser, setStripeCustomer } from '@/lib/billing/user-store';
import { canPurchaseCreditPacks } from '@/lib/billing/subscription';
import { checkBillingCheckoutLimit } from '@/lib/billing/rate-limit';
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
  await ensureUserProfile(auth.sub, { email: auth.email, fullName: auth.fullName, avatarUrl: auth.avatarUrl });

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
  const packKeyRaw =
    typeof body === 'object' && body !== null && 'packKey' in body
      ? (body as { packKey: unknown }).packKey
      : undefined;

  let packKey: ReturnType<typeof assertCreditPackKey>;
  try {
    packKey = assertCreditPackKey(packKeyRaw);
  } catch {
    return NextResponse.json({ error: 'Unknown or invalid pack key', code: 'INVALID_PACK_KEY' }, { status: 400 });
  }

  const billing = await getOrCreateUser(auth.sub);
  if (!canPurchaseCreditPacks(billing.subscriptionStatus, billing.subscriptionTier)) {
    return NextResponse.json(
      {
        error: 'Credit packs are for subscribers only. Subscribe to a plan first, then you can top up credits.',
        code: 'PACKS_SUBSCRIBER_ONLY',
      },
      { status: 403 }
    );
  }

  const priceId = getCreditPackStripePriceId(packKey);
  if (!priceId) {
    return NextResponse.json(
      { error: 'Credit pack price not configured on server', code: 'PRICE_NOT_CONFIGURED' },
      { status: 503 }
    );
  }

  let customerId = billing.stripeCustomerId;
  if (!customerId) {
    const c = await stripe.customers.create({
      email: auth.email,
      metadata: { userId: auth.sub },
    });
    customerId = c.id;
    await setStripeCustomer(auth.sub, customerId);
  }

  const base = getCanonicalAppOrigin();
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${base}/dress-yourself?checkout=success`,
    cancel_url: `${base}/pricing?checkout=cancel`,
    metadata: {
      userId: auth.sub,
      purchaseType: 'credit_pack',
      packKey,
    },
  });

  auditLog('checkout_session_created', {
    userId: auth.sub,
    purchaseType: 'credit_pack',
    packKey,
    stripeCheckoutSessionId: session.id,
  });

  if (!session.url) {
    return NextResponse.json({ error: 'Checkout URL missing' }, { status: 500 });
  }

  return NextResponse.json({ url: session.url });
}
