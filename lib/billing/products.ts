/**
 * Single source of truth for billing: plan/pack keys → Stripe price IDs (env) and credit amounts.
 * Never trust client-supplied prices or credit amounts.
 *
 * Fashion-branded plan keys: closet, studio, runway.
 */

export type SubscriptionPlanKey = 'closet' | 'studio' | 'runway';
export type CreditPackKey = 'small' | 'medium' | 'large';
export type PurchaseType = 'subscription' | 'credit_pack';

const SUB_KEYS = new Set<string>(['closet', 'studio', 'runway']);
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
  closet: { creditsPerPeriod: 80 },
  studio: { creditsPerPeriod: 220 },
  runway: { creditsPerPeriod: 500 },
};

export const CREDIT_PACKS: Record<CreditPackKey, Omit<CreditPackDef, 'key' | 'envPriceId'>> = {
  small: { credits: 30 },
  medium: { credits: 70 },
  large: { credits: 130 },
};

function envPrice(key: string): string | undefined {
  const v = process.env[key]?.trim();
  return v || undefined;
}

export function getSubscriptionStripePriceId(planKey: string): string | null {
  if (!SUB_KEYS.has(planKey)) return null;
  const map: Record<SubscriptionPlanKey, string> = {
    closet: 'STRIPE_PRICE_CLOSET_SUB',
    studio: 'STRIPE_PRICE_STUDIO_SUB',
    runway: 'STRIPE_PRICE_RUNWAY_SUB',
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

const PLAN_ORDER: SubscriptionPlanKey[] = ['closet', 'studio', 'runway'];

export function comparePlanTier(a: SubscriptionPlanKey, b: SubscriptionPlanKey): number {
  return PLAN_ORDER.indexOf(a) - PLAN_ORDER.indexOf(b);
}

export function subscriptionCreditDifference(from: SubscriptionPlanKey, to: SubscriptionPlanKey): number {
  return subscriptionCreditsForPlan(to) - subscriptionCreditsForPlan(from);
}

export function packCredits(packKey: CreditPackKey): number {
  return CREDIT_PACKS[packKey].credits;
}

/** Display labels for UI (match internal keys). */
export const PLAN_LABEL: Record<SubscriptionPlanKey, string> = {
  closet: 'Closet',
  studio: 'Studio',
  runway: 'Runway',
};

/** Display names for credit packs (internal keys remain small | medium | large). */
export const PACK_LABEL: Record<CreditPackKey, string> = {
  small: 'Mini Credit Pack',
  medium: 'Style Credit Pack',
  large: 'Wardrobe Credit Pack',
};

/** Approximate EUR display prices (one-time); billed via Stripe. */
export const PACK_PRICE_EUR: Record<CreditPackKey, string> = {
  small: '€4.99',
  medium: '€9.99',
  large: '€19.99',
};
