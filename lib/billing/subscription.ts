import type { SubscriptionPlanKey } from './products';
import type { SubscriptionStatus } from './user-store';

/**
 * Users with an active Stripe subscription may purchase credit packs (server + UI).
 */
export function canPurchaseCreditPacks(
  status: SubscriptionStatus,
  tier: SubscriptionPlanKey | 'none'
): boolean {
  if (tier === 'none') return false;
  return status === 'active' || status === 'trialing' || status === 'past_due';
}
