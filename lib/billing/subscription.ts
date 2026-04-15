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
  if (status === 'payment_action_required' || status === 'invoice_finalization_failed') return false;
  return status === 'active' || status === 'trialing' || status === 'past_due';
}
