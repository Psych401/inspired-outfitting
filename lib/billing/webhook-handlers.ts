import type Stripe from 'stripe';
import { getStripe } from './stripe-client';
import {
  assertCreditPackKey,
  assertSubscriptionPlanKey,
  packCredits,
  subscriptionCreditsForPlan,
  type SubscriptionPlanKey,
} from './products';
import {
  addCredits,
  getUser,
  patchUser,
  setStripeCustomer,
  type SubscriptionStatus,
} from './user-store';
import { auditLog } from './audit';
import { wasStripeEventProcessed, markStripeEventProcessed } from './stripe-events';
import { appendLedger } from './ledger';
import {
  markInvoiceCreditsGranted,
  markPackCheckoutGranted,
  wasInvoiceCreditsGranted,
  wasPackCheckoutGranted,
} from './grant-idempotency';

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

function grantSubscriptionCredits(
  userId: string,
  planKey: SubscriptionPlanKey,
  stripeEventId: string,
  reason: string
): void {
  const n = subscriptionCreditsForPlan(planKey);
  addCredits(userId, n, reason);
  appendLedger({
    userId,
    kind: 'grant',
    amount: n,
    reason,
    ref: stripeEventId,
  });
  auditLog('credits_granted', {
    userId,
    amount: n,
    reason,
    planKey,
  });
}

export async function processStripeEvent(event: Stripe.Event): Promise<void> {
  if (wasStripeEventProcessed(event.id)) {
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
        if (customerId) setStripeCustomer(userId, customerId);

        if (session.mode === 'subscription') {
          const planKeyRaw = session.metadata?.planKey;
          if (!planKeyRaw) break;
          let planKey: SubscriptionPlanKey;
          try {
            planKey = assertSubscriptionPlanKey(planKeyRaw);
          } catch {
            console.warn('[billing][webhook] invalid planKey on subscription checkout');
            break;
          }
          const subId =
            typeof session.subscription === 'string'
              ? session.subscription
              : session.subscription?.id;
          patchUser(userId, {
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
          if (wasPackCheckoutGranted(session.id)) break;
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
          addCredits(userId, n, 'credit_pack_checkout');
          markPackCheckoutGranted(session.id);
          appendLedger({
            userId,
            kind: 'grant',
            amount: n,
            reason: 'credit_pack_checkout',
            ref: event.id,
          });
          auditLog('credits_granted', {
            userId,
            amount: n,
            reason: 'credit_pack',
            packKey,
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

        let planKey: SubscriptionPlanKey;
        try {
          planKey = assertSubscriptionPlanKey(planKeyRaw);
        } catch {
          break;
        }

        const br = invoice.billing_reason;
        if (br === 'subscription_create' || br === 'subscription_cycle' || br === 'subscription_update') {
          if (wasInvoiceCreditsGranted(invoice.id)) break;
          grantSubscriptionCredits(userId, planKey, event.id, `invoice_paid:${br}`);
          markInvoiceCreditsGranted(invoice.id);
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
          try {
            tier = assertSubscriptionPlanKey(planKeyRaw);
          } catch {
            tier = getUser(userId)?.subscriptionTier ?? 'none';
          }
        }
        const st = mapStripeSubStatus(sub.status);
        patchUser(userId, {
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
        patchUser(userId, {
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

    markStripeEventProcessed(event.id);
    auditLog('stripe_event_processed', { stripeEventId: event.id, type: event.type });
  } catch (e) {
    console.error('[billing][webhook] handler_error', { id: event.id, type: event.type, error: e });
    throw e;
  }
}
