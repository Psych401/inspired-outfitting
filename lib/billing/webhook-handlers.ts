import type Stripe from 'stripe';
import { getStripe } from './stripe-client';
import { assertCreditPackKey, packCredits, subscriptionCreditsForPlan, type SubscriptionPlanKey } from './products';
import { normalizeSubscriptionPlanKey } from './plan-keys';
import {
  getUser,
  patchUser,
  setStripeCustomer,
  normalizeUserId,
  type SubscriptionStatus,
} from './user-store';
import { auditLog } from './audit';
import { insertStripeEventIfNew } from './stripe-events';
import {
  sourceKeyForInvoiceGrant,
  sourceKeyForPackCheckoutGrant,
} from './grant-idempotency';
import { getSupabaseServiceRoleClient } from '@/lib/supabase/server';

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  return (error as { code?: string }).code === '23505';
}

function mapStripeSubStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
  switch (status) {
    case 'active':
      return 'active';
    case 'trialing':
      return 'trialing';
    case 'past_due':
      return 'past_due';
    case 'canceled':
    case 'unpaid':
      return 'canceled';
    case 'incomplete':
    case 'incomplete_expired':
      return 'unpaid';
    default:
      return 'none';
  }
}

/** Adds credits via `app_grant_credits` (balance += amount); does not replace the balance. */
async function grantSubscriptionCredits(
  userId: string,
  planKey: SubscriptionPlanKey,
  stripeEventId: string,
  reason: string,
  sourceKey: string
): Promise<boolean> {
  const n = subscriptionCreditsForPlan(planKey);
  const supabase = getSupabaseServiceRoleClient();
  const uid = normalizeUserId(userId);
  const { error, data } = await supabase.rpc('app_grant_credits', {
    p_user_id: uid,
    p_amount: n,
    p_reason: reason,
    p_source_key: sourceKey,
    p_stripe_event_id: stripeEventId,
  });
  if (error) {
    if (isUniqueViolation(error)) return false;
    throw new Error(`Subscription grant failed: ${error.message}`);
  }
  const row = Array.isArray(data) ? data[0] : data;
  auditLog('credits_granted', {
    userId: uid,
    amount: n,
    reason,
    planKey,
    remaining: Number(row?.balance ?? 0),
  });
  return true;
}

export async function processStripeEvent(event: Stripe.Event): Promise<void> {
  const inserted = await insertStripeEventIfNew(event.id, event.type);
  if (!inserted) {
    auditLog('stripe_event_duplicate_ignored', { stripeEventId: event.id, type: event.type });
    return;
  }

  auditLog('stripe_webhook_received', { stripeEventId: event.id, type: event.type });

  const stripe = getStripe();
  if (!stripe) throw new Error('STRIPE_NOT_CONFIGURED');

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.userId;
        const purchaseType = session.metadata?.purchaseType;
        if (!userId || !purchaseType) {
          console.warn('[billing][webhook] checkout.session.completed missing metadata');
          break;
        }

        const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
        if (customerId) await setStripeCustomer(userId, customerId);

        if (session.mode === 'subscription') {
          const planKeyRaw = session.metadata?.planKey;
          if (!planKeyRaw) break;
          const planKey = normalizeSubscriptionPlanKey(planKeyRaw);
          if (!planKey) {
            console.warn('[billing][webhook] invalid planKey on subscription checkout');
            break;
          }
          const subId =
            typeof session.subscription === 'string'
              ? session.subscription
              : session.subscription?.id;
          await patchUser(userId, {
            subscriptionTier: planKey,
            subscriptionStatus: 'active',
            stripeSubscriptionId: subId,
            stripeCustomerId: customerId,
          });
          auditLog('subscription_status_changed', {
            userId,
            status: 'active',
            tier: planKey,
            stripeEventId: event.id,
          });
        }

        if (session.mode === 'payment' && purchaseType === 'credit_pack') {
          const packKeyRaw = session.metadata?.packKey;
          if (!packKeyRaw) break;
          let packKey: ReturnType<typeof assertCreditPackKey>;
          try {
            packKey = assertCreditPackKey(packKeyRaw);
          } catch {
            console.warn('[billing][webhook] invalid packKey on pack checkout');
            break;
          }
          const n = packCredits(packKey);
          const sourceKey = sourceKeyForPackCheckoutGrant(session.id);
          const uid = normalizeUserId(userId);
          const supabase = getSupabaseServiceRoleClient();
          const { error, data } = await supabase.rpc('app_grant_credits', {
            p_user_id: uid,
            p_amount: n,
            p_reason: 'credit_pack_checkout',
            p_source_key: sourceKey,
            p_stripe_event_id: event.id,
          });
          if (error && !isUniqueViolation(error)) {
            throw new Error(`Pack credit grant failed: ${error.message}`);
          }
          if (error && isUniqueViolation(error)) break;
          const row = Array.isArray(data) ? data[0] : data;
          auditLog('credits_granted', {
            userId: uid,
            amount: n,
            reason: 'credit_pack',
            packKey,
            remaining: Number(row?.balance ?? 0),
          });
        }
        break;
      }

      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        const subId =
          typeof invoice.subscription === 'string'
            ? invoice.subscription
            : invoice.subscription?.id ?? null;
        if (!subId) break;

        const sub = await stripe.subscriptions.retrieve(subId);
        const userId = sub.metadata?.userId;
        const planKeyRaw = sub.metadata?.planKey;
        if (!userId || !planKeyRaw) {
          console.warn('[billing][webhook] invoice.paid subscription missing userId/planKey metadata');
          break;
        }

        const planKey = normalizeSubscriptionPlanKey(planKeyRaw);
        if (!planKey) break;

        const br = invoice.billing_reason;
        if (br === 'subscription_create' || br === 'subscription_cycle' || br === 'subscription_update') {
          await grantSubscriptionCredits(
            userId,
            planKey,
            event.id,
            `invoice_paid:${br}`,
            sourceKeyForInvoiceGrant(invoice.id)
          );
        }
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        const userId = sub.metadata?.userId;
        if (!userId) break;
        const planKeyRaw = sub.metadata?.planKey;
        let tier: SubscriptionPlanKey | 'none' = 'none';
        if (planKeyRaw) {
          const parsed = normalizeSubscriptionPlanKey(planKeyRaw);
          if (parsed) {
            tier = parsed;
          } else {
            const existing = await getUser(userId);
            tier = existing?.subscriptionTier && existing.subscriptionTier !== 'none' ? existing.subscriptionTier : 'none';
          }
        }
        const st = mapStripeSubStatus(sub.status);
        await patchUser(userId, {
          subscriptionStatus: st,
          subscriptionTier: st === 'canceled' || st === 'none' ? 'none' : tier,
          stripeSubscriptionId: sub.id,
        });
        auditLog('subscription_status_changed', {
          userId,
          status: st,
          tier,
          stripeEventId: event.id,
        });
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const userId = sub.metadata?.userId;
        if (!userId) break;
        await patchUser(userId, {
          subscriptionStatus: 'canceled',
          subscriptionTier: 'none',
          stripeSubscriptionId: undefined,
        });
        auditLog('subscription_status_changed', {
          userId,
          status: 'canceled',
          tier: 'none',
          stripeEventId: event.id,
        });
        break;
      }

      default:
        break;
    }

    auditLog('stripe_event_processed', { stripeEventId: event.id, type: event.type });
  } catch (e) {
    console.error('[billing][webhook] handler_error', { id: event.id, type: event.type, error: e });
    throw e;
  }
}
