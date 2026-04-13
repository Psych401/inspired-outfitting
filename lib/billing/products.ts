/**
 * Single source of truth for billing: plan/pack keys → Stripe price IDs (env) and credit amounts.
 * Never trust client-supplied prices or credit amounts.
 */

export type SubscriptionPlanKey = 'starter' | 'growth' | 'pro';
export type CreditPackKey = 'small' | 'medium' | 'large';
export type PurchaseType = 'subscription' | 'credit_pack';

const SUB_KEYS = new Set<string>(['starter', 'growth', 'pro']);
const PACK_KEYS = new Set<string>(['small', 'medium', 'large']);

export interface SubscriptionPlanDef {
  key: SubscriptionPlanKey;
  /** Credits granted each billing period (invoice.paid / first checkout). */
  creditsPerPeriod: number;
  envPriceId: string;
}

export interface CreditPackDef {
  key: CreditPackKey;
  credits: number;
  envPriceId: string;
}

/** Internal metadata; not shown to clients as pricing authority. */
export const SUBSCRIPTION_PLANS: Record<SubscriptionPlanKey, Omit<SubscriptionPlanDef, 'key' | 'envPriceId'>> = {
  starter: { creditsPerPeriod: 50 },
  growth: { creditsPerPeriod: 150 },
  pro: { creditsPerPeriod: 500 },
};

export const CREDIT_PACKS: Record<CreditPackKey, Omit<CreditPackDef, 'key' | 'envPriceId'>> = {
  small: { credits: 10 },
  medium: { credits: 50 },
  large: { credits: 150 },
};

function envPrice(key: string): string | undefined {
  const v = process.env[key]?.trim();
  return v || undefined;
}

export function getSubscriptionStripePriceId(planKey: string): string | null {
  if (!SUB_KEYS.has(planKey)) return null;
  const map: Record<SubscriptionPlanKey, string> = {
    starter: 'STRIPE_PRICE_STARTER_SUB',
    growth: 'STRIPE_PRICE_GROWTH_SUB',
    pro: 'STRIPE_PRICE_PRO_SUB',
  };
  return envPrice(map[planKey as SubscriptionPlanKey]) ?? null;
}

export function getCreditPackStripePriceId(packKey: string): string | null {
  if (!PACK_KEYS.has(packKey)) return null;
  const map: Record<CreditPackKey, string> = {
    small: 'STRIPE_PRICE_CREDITS_SMALL',
    medium: 'STRIPE_PRICE_CREDITS_MEDIUM',
    large: 'STRIPE_PRICE_CREDITS_LARGE',
  };
  return envPrice(map[packKey as CreditPackKey]) ?? null;
}

export function assertSubscriptionPlanKey(k: unknown): SubscriptionPlanKey {
  if (typeof k !== 'string' || !SUB_KEYS.has(k)) {
    throw new Error('INVALID_PLAN_KEY');
  }
  return k as SubscriptionPlanKey;
}

export function assertCreditPackKey(k: unknown): CreditPackKey {
  if (typeof k !== 'string' || !PACK_KEYS.has(k)) {
    throw new Error('INVALID_PACK_KEY');
  }
  return k as CreditPackKey;
}

export function subscriptionCreditsForPlan(planKey: SubscriptionPlanKey): number {
  return SUBSCRIPTION_PLANS[planKey].creditsPerPeriod;
}

export function packCredits(packKey: CreditPackKey): number {
  return CREDIT_PACKS[packKey].credits;
}
