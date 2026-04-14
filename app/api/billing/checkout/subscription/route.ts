import { NextRequest, NextResponse } from 'next/server';
import { requireSessionUser } from '@/lib/auth/require-user';
import { getStripe } from '@/lib/billing/stripe-client';
import {
  assertSubscriptionPlanKey,
  comparePlanTier,
  getSubscriptionStripePriceId,
  subscriptionCreditsForPlan,
  subscriptionCreditDifference,
} from '@/lib/billing/products';
import { getUser, patchUser, setStripeCustomer } from '@/lib/billing/user-store';
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
  const confirmUpgrade =
    typeof body === 'object' && body !== null && 'confirmUpgrade' in body
      ? Boolean((body as { confirmUpgrade?: unknown }).confirmUpgrade)
      : false;

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

  const hasActiveSubscription =
    !!existingUser?.stripeSubscriptionId &&
    (existingUser.subscriptionStatus === 'active' ||
      existingUser.subscriptionStatus === 'trialing' ||
      existingUser.subscriptionStatus === 'past_due') &&
    existingUser.subscriptionTier !== 'none';

  if (hasActiveSubscription) {
    const currentTier = existingUser.subscriptionTier;
    const currentSubscriptionId = existingUser.stripeSubscriptionId;
    if (!currentSubscriptionId || currentTier === 'none') {
      return NextResponse.json(
        { error: 'Active subscription metadata is incomplete.', code: 'SUBSCRIPTION_STATE_INVALID' },
        { status: 409 }
      );
    }
    const cmp = comparePlanTier(currentTier, planKey);
    if (cmp === 0) {
      return NextResponse.json(
        {
          error: `You are already on the ${planKey} plan.`,
          code: 'SUBSCRIPTION_SAME_TIER',
        },
        { status: 409 }
      );
    }
    if (cmp > 0) {
      return NextResponse.json(
        {
          error: 'Downgrades are not supported yet. Please contact support.',
          code: 'SUBSCRIPTION_DOWNGRADE_UNSUPPORTED',
        },
        { status: 400 }
      );
    }

    const sub = await stripe.subscriptions.retrieve(currentSubscriptionId);
    const item = sub.items.data[0];
    if (!item) {
      return NextResponse.json(
        { error: 'Subscription item missing; cannot upgrade safely.', code: 'SUBSCRIPTION_ITEM_MISSING' },
        { status: 409 }
      );
    }

    const upcoming = await stripe.invoices.retrieveUpcoming({
      customer: customerId,
      subscription: currentSubscriptionId,
      subscription_items: [{ id: item.id, price: priceId }],
    });
    const immediateChargeCents = Math.max(0, upcoming.amount_due ?? 0);
    const creditDifference = subscriptionCreditDifference(currentTier, planKey);

    if (!confirmUpgrade) {
      return NextResponse.json({
        requiresUpgradeConfirmation: true,
        fromPlan: currentTier,
        toPlan: planKey,
        immediateChargeCents,
        creditDifference,
        billingDateUnchanged: true,
      });
    }

    auditLog('subscription_upgrade_confirmed', {
      userId: auth.sub,
      fromPlan: currentTier,
      toPlan: planKey,
      immediateChargeCents,
      creditDifference,
    });

    const upgraded = await stripe.subscriptions.update(currentSubscriptionId, {
      items: [{ id: item.id, price: priceId }],
      proration_behavior: 'always_invoice',
      payment_behavior: 'error_if_incomplete',
      metadata: {
        ...sub.metadata,
        userId: auth.sub,
        planKey,
        upgradeFromPlanKey: currentTier,
        upgradeToPlanKey: planKey,
      },
      expand: ['latest_invoice'],
    });

    const latestInvoiceId =
      typeof upgraded.latest_invoice === 'string'
        ? upgraded.latest_invoice
        : upgraded.latest_invoice?.id ?? '';

    if (latestInvoiceId) {
      await stripe.subscriptions.update(upgraded.id, {
        metadata: {
          ...upgraded.metadata,
          upgradeInvoiceId: latestInvoiceId,
        },
      });
    }
    await patchUser(auth.sub, {
      subscriptionTier: planKey,
      subscriptionStatus: 'active',
      stripeSubscriptionId: upgraded.id,
      stripeCustomerId: customerId,
    });

    auditLog('subscription_upgraded', {
      userId: auth.sub,
      fromPlan: currentTier,
      toPlan: planKey,
      creditDifference,
      stripeSubscriptionId: upgraded.id,
      stripeInvoiceId: latestInvoiceId || undefined,
    });

    return NextResponse.json({
      upgraded: true,
      fromPlan: currentTier,
      toPlan: planKey,
      creditDifference,
      message: 'Upgrade successful. Stripe proration was applied and your billing date is unchanged.',
    });
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
