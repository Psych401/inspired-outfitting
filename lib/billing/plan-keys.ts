import type { SubscriptionPlanKey } from './products';

const LEGACY: Record<string, SubscriptionPlanKey> = {
  starter: 'closet',
  growth: 'studio',
  pro: 'runway',
};

const CURRENT = new Set<string>(['closet', 'studio', 'runway']);

/**
 * Maps Stripe metadata / DB values to canonical plan keys (closet | studio | runway).
 * Accepts legacy starter/growth/pro for existing Stripe subscriptions and DB rows.
 */
export function normalizeSubscriptionPlanKey(raw: string | null | undefined): SubscriptionPlanKey | null {
  if (raw == null || typeof raw !== 'string') return null;
  const k = raw.trim().toLowerCase();
  if (LEGACY[k]) return LEGACY[k];
  if (CURRENT.has(k)) return k as SubscriptionPlanKey;
  return null;
}
