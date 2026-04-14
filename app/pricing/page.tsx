'use client';

import React from 'react';
import Button from '@/components/Button';
import { CheckIcon, SparklesIcon } from '@/components/IconComponents';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { canPurchaseCreditPacks } from '@/lib/billing/subscription';
import {
  PACK_LABEL,
  PACK_PRICE_EUR,
  PLAN_LABEL,
  comparePlanTier,
  packCredits,
  subscriptionCreditDifference,
  subscriptionCreditsForPlan,
  type CreditPackKey,
  type SubscriptionPlanKey,
} from '@/lib/billing/products';
import type { SubscriptionStatus } from '@/lib/billing/user-store';

const PricingCard: React.FC<{
  plan: string;
  price: string;
  credits: number;
  costPerCredit: string;
  features: string[];
  isFeatured?: boolean;
  onSubscribe: () => void;
  disabled?: boolean;
}> = ({ plan, price, credits, costPerCredit, features, isFeatured = false, onSubscribe, disabled }) => {
  return (
    <div
      className={`border rounded-xl p-8 flex flex-col transition-all duration-300 relative overflow-hidden ${
        isFeatured ? 'border-dusty-rose bg-white shadow-2xl scale-105 z-10' : 'border-gray-200 bg-white shadow-lg hover:shadow-xl'
      }`}
    >
      {isFeatured && (
        <div className="absolute top-0 right-0 bg-gold-beige text-white text-xs font-bold px-4 py-1 rounded-bl-lg">
          MOST POPULAR
        </div>
      )}
      <h3 className="text-2xl font-heading font-bold text-charcoal-grey">{plan}</h3>

      <div className="mt-6 mb-2">
        <span className="text-5xl font-heading font-extrabold text-charcoal-grey">{price}</span>
        <span className="text-charcoal-grey/60 font-medium">/mo</span>
      </div>

      <div className="bg-soft-blush/30 rounded-lg p-4 mb-6 border border-dusty-rose/20">
        <div className="flex items-baseline justify-between">
          <span className="text-3xl font-bold text-dusty-rose">{credits}</span>
          <span className="text-charcoal-grey font-semibold">Credits</span>
        </div>
        <p className="text-xs text-charcoal-grey/60 mt-1 uppercase tracking-wide font-semibold">
          {costPerCredit} per credit
        </p>
      </div>

      <ul className="space-y-4 mb-8 flex-grow">
        {features.map((feature, index) => (
          <li key={index} className="flex items-start">
            <CheckIcon className="text-gold-beige w-5 h-5 mr-3 mt-1 flex-shrink-0" />
            <span className="text-charcoal-grey/80">{feature}</span>
          </li>
        ))}
        <li className="flex items-start">
          <CheckIcon className="text-gold-beige w-5 h-5 mr-3 mt-1 flex-shrink-0" />
          <span className="text-charcoal-grey/80 font-medium">Credits added to your balance each billing period</span>
        </li>
      </ul>

      <Button onClick={onSubscribe} variant={isFeatured ? 'primary' : 'secondary'} className="w-full mt-auto" disabled={disabled}>
        Subscribe
      </Button>
    </div>
  );
};

const AddOnCard: React.FC<{
  title: string;
  credits: number;
  price: string;
  onPurchase: () => void;
  disabled?: boolean;
}> = ({ title, credits, price, onPurchase, disabled }) => {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow flex flex-col items-center text-center">
      <div className="w-12 h-12 bg-soft-blush rounded-full flex items-center justify-center mb-3 text-dusty-rose">
        <SparklesIcon className="w-6 h-6" />
      </div>
      <h4 className="text-xl font-bold text-charcoal-grey">{title}</h4>
      <p className="text-sm text-charcoal-grey/70 mt-1">{credits} credits</p>
      <p className="text-2xl font-heading font-bold text-dusty-rose my-2">{price}</p>
      <p className="text-xs text-charcoal-grey/50 mb-4">One-time payment</p>
      <Button onClick={onPurchase} variant="secondary" className="w-full text-sm py-2" disabled={disabled}>
        Buy Pack
      </Button>
    </div>
  );
};

export default function PricingPage() {
  const router = useRouter();
  const { user, authHydrated, billing, refreshBilling, ensureSession } = useAuth();
  const [checkoutLoading, setCheckoutLoading] = React.useState<string | null>(null);
  const [upgradeConfirm, setUpgradeConfirm] = React.useState<{
    fromPlan: SubscriptionPlanKey;
    toPlan: SubscriptionPlanKey;
    immediateChargeCents: number;
    creditDifference: number;
  } | null>(null);

  React.useEffect(() => {
    void refreshBilling();
  }, [refreshBilling]);

  const tierForPacks: SubscriptionPlanKey | 'none' =
    billing.subscriptionTier === 'none' ? 'none' : billing.subscriptionTier;

  const packsAllowed =
    !!user &&
    canPurchaseCreditPacks(billing.subscriptionStatus as SubscriptionStatus, tierForPacks);

  const currentActiveTier: SubscriptionPlanKey | null =
    billing.subscriptionTier !== 'none' &&
    (billing.subscriptionStatus === 'active' ||
      billing.subscriptionStatus === 'trialing' ||
      billing.subscriptionStatus === 'past_due')
      ? billing.subscriptionTier
      : null;

  async function startSubscriptionCheckout(planKey: SubscriptionPlanKey) {
    if (!user) {
      const restored = await ensureSession();
      if (!restored) {
        router.push('/auth');
        return;
      }
    }
    setCheckoutLoading(`sub:${planKey}`);
    try {
      const res = await fetch('/api/billing/checkout/subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ planKey }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error('Subscription checkout failed', res.status, body);
        alert((body as { error?: string }).error ?? 'Checkout failed');
        return;
      }
      const needsConfirm = (body as { requiresUpgradeConfirmation?: boolean }).requiresUpgradeConfirmation;
      if (needsConfirm) {
        setUpgradeConfirm({
          fromPlan: (body as { fromPlan: SubscriptionPlanKey }).fromPlan,
          toPlan: (body as { toPlan: SubscriptionPlanKey }).toPlan,
          immediateChargeCents: Number((body as { immediateChargeCents?: number }).immediateChargeCents ?? 0),
          creditDifference: Number((body as { creditDifference?: number }).creditDifference ?? 0),
        });
        return;
      }
      const upgraded = (body as { upgraded?: boolean }).upgraded;
      if (upgraded) {
        await refreshBilling();
        alert((body as { message?: string }).message ?? 'Subscription upgraded successfully.');
        return;
      }
      const url = (body as { url?: string }).url;
      if (url) window.location.href = url;
    } finally {
      setCheckoutLoading(null);
    }
  }

  async function confirmUpgrade() {
    if (!upgradeConfirm) return;
    setCheckoutLoading(`sub:${upgradeConfirm.toPlan}`);
    try {
      const res = await fetch('/api/billing/checkout/subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ planKey: upgradeConfirm.toPlan, confirmUpgrade: true }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert((body as { error?: string }).error ?? 'Upgrade failed');
        return;
      }
      setUpgradeConfirm(null);
      await refreshBilling();
      alert((body as { message?: string }).message ?? 'Subscription upgraded successfully.');
    } finally {
      setCheckoutLoading(null);
    }
  }

  async function startCreditPackCheckout(packKey: CreditPackKey) {
    if (!user) {
      router.push('/auth');
      return;
    }
    setCheckoutLoading(`pack:${packKey}`);
    try {
      const res = await fetch('/api/billing/checkout/credits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ packKey }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error('Credit pack checkout failed', res.status, body);
        alert((body as { error?: string }).error ?? 'Checkout failed');
        return;
      }
      const url = (body as { url?: string }).url;
      if (url) window.location.href = url;
    } finally {
      setCheckoutLoading(null);
    }
  }

  return (
    <div className="bg-warm-cream py-16 md:py-24">
      <div className="container mx-auto px-6">
        <div className="text-center mb-16">
          <div className="inline-block bg-dusty-rose/10 border border-dusty-rose text-dusty-rose px-6 py-2 rounded-full font-semibold mb-6 animate-fade-in-down">
            New accounts include 3 free credits — no payment required.
          </div>
          <h1 className="text-4xl md:text-5xl font-heading font-bold text-charcoal-grey">Simple, Credit-Based Pricing</h1>
          <p className="text-lg text-charcoal-grey/70 mt-4 max-w-2xl mx-auto">
            Choose a monthly plan for recurring credits. Subscribers can top up with one-time packs anytime.
          </p>
        </div>

        <div id="subscription-plans" className="scroll-mt-24 grid lg:grid-cols-3 gap-8 max-w-6xl mx-auto items-start mb-12">
          <PricingCard
            plan={PLAN_LABEL.closet}
            price="€9.99"
            credits={subscriptionCreditsForPlan('closet')}
            costPerCredit="~€0.12"
            features={['Curated generation speed', 'HD quality downloads', 'Access to community styles']}
            onSubscribe={() => startSubscriptionCheckout('closet')}
            disabled={checkoutLoading !== null}
          />
          <PricingCard
            plan={PLAN_LABEL.studio}
            price="€19.99"
            credits={subscriptionCreditsForPlan('studio')}
            costPerCredit="~€0.09"
            features={['Fast generation speed', '4K Ultra-HD downloads', 'Priority support', 'Private gallery']}
            isFeatured
            onSubscribe={() => startSubscriptionCheckout('studio')}
            disabled={checkoutLoading !== null}
          />
          <PricingCard
            plan={PLAN_LABEL.runway}
            price="€39.99"
            credits={subscriptionCreditsForPlan('runway')}
            costPerCredit="~€0.08"
            features={[
              'Turbo generation speed',
              'Highest fidelity outputs',
              'Commercial usage rights',
              'Early access to beta features',
              'Dedicated account support',
            ]}
            onSubscribe={() => startSubscriptionCheckout('runway')}
            disabled={checkoutLoading !== null}
          />
        </div>
        {currentActiveTier && (
          <p className="text-center text-xs text-charcoal-grey/60 -mt-8 mb-8">
            Active plan: {PLAN_LABEL[currentActiveTier]}. Upgrades require explicit confirmation and keep your billing date unchanged.
          </p>
        )}

        <p className="text-center text-charcoal-grey/80 mb-16">
          <Link href="/dress-yourself" className="text-dusty-rose font-semibold underline underline-offset-4 hover:text-dusty-rose/80">
            Try for free first
          </Link>
          <span className="text-charcoal-grey/60"> — use your 3 free credits on the try-on page.</span>
        </p>

        <div id="credit-packs" className="scroll-mt-24 max-w-4xl mx-auto animate-fade-in-up">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-heading font-bold text-charcoal-grey">Need more credits?</h2>
            <p className="text-charcoal-grey/70">One-time credit packs — subscriber-only. Prices are set in Stripe.</p>
          </div>

          {user && packsAllowed ? (
            <div className="grid md:grid-cols-3 gap-6">
              <AddOnCard
                title={PACK_LABEL.small}
                credits={packCredits('small')}
                price={PACK_PRICE_EUR.small}
                onPurchase={() => startCreditPackCheckout('small')}
                disabled={checkoutLoading !== null}
              />
              <AddOnCard
                title={PACK_LABEL.medium}
                credits={packCredits('medium')}
                price={PACK_PRICE_EUR.medium}
                onPurchase={() => startCreditPackCheckout('medium')}
                disabled={checkoutLoading !== null}
              />
              <AddOnCard
                title={PACK_LABEL.large}
                credits={packCredits('large')}
                price={PACK_PRICE_EUR.large}
                onPurchase={() => startCreditPackCheckout('large')}
                disabled={checkoutLoading !== null}
              />
            </div>
          ) : user ? (
            <div className="rounded-xl border border-dusty-rose/30 bg-white/80 p-8 text-center text-charcoal-grey/80">
              <p className="font-medium text-charcoal-grey">Credit packs unlock after you subscribe.</p>
              <p className="mt-2 text-sm text-charcoal-grey/70">
                Pick a Closet, Studio, or Runway plan above — then you can buy packs here.
              </p>
              <Button
                variant="secondary"
                className="mt-6"
                onClick={() => router.push('/pricing#subscription-plans')}
              >
                View plans
              </Button>
            </div>
          ) : authHydrated ? (
            <div className="max-w-3xl mx-auto text-center p-8 border-2 border-dashed border-gray-300 rounded-xl">
              <h3 className="text-xl font-semibold text-charcoal-grey/60">Credit packs</h3>
              <p className="text-charcoal-grey/50 mt-2">Sign in and subscribe to purchase one-time credit packs.</p>
              <Button onClick={() => router.push('/auth')} variant="secondary" className="mt-4">
                Login
              </Button>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto text-center p-8 border-2 border-dashed border-gray-300 rounded-xl">
              <h3 className="text-xl font-semibold text-charcoal-grey/60">Loading account status...</h3>
            </div>
          )}
        </div>
        {upgradeConfirm && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 px-4">
            <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl">
              <h3 className="text-2xl font-heading font-bold text-charcoal-grey">Confirm Upgrade</h3>
              <p className="mt-3 text-sm text-charcoal-grey/80">
                You are moving from <strong>{PLAN_LABEL[upgradeConfirm.fromPlan]}</strong> to{' '}
                <strong>{PLAN_LABEL[upgradeConfirm.toPlan]}</strong>.
              </p>
              <ul className="mt-4 space-y-2 text-sm text-charcoal-grey/80">
                <li>Immediate Stripe proration charge: <strong>€{(upgradeConfirm.immediateChargeCents / 100).toFixed(2)}</strong></li>
                <li>Immediate credit increase: <strong>+{upgradeConfirm.creditDifference}</strong> credits</li>
                <li>Billing date: <strong>unchanged</strong></li>
              </ul>
              <div className="mt-6 flex justify-end gap-3">
                <Button variant="secondary" onClick={() => setUpgradeConfirm(null)} disabled={checkoutLoading !== null}>
                  Cancel
                </Button>
                <Button onClick={confirmUpgrade} disabled={checkoutLoading !== null}>
                  Confirm Upgrade
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
