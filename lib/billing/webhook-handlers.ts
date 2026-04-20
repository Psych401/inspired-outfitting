import type Stripe from 'stripe';
import { getStripe } from './stripe-client';
import {
  assertCreditPackKey,
  comparePlanTier,
  packCredits,
  subscriptionPlanForStripePriceId,
  subscriptionCreditDifference,
  subscriptionCreditsForPlan,
  type SubscriptionPlanKey,
} from './products';
import { normalizeSubscriptionPlanKey } from './plan-keys';
import {
  getUser,
  getUserIdByStripeCustomerId,
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
  sourceKeyForSubscriptionCheckoutGrant,
  sourceKeyForSubscriptionUpgradeGrant,
} from './grant-idempotency';
import { getSupabaseServiceRoleClient } from '@/lib/supabase/server';

const DEBUG_PORTAL_UPGRADE =
  process.env.BILLING_DEBUG_PORTAL_UPGRADES === '1' || process.env.BILLING_DEBUG_PORTAL_UPGRADES === 'true';

function portalUpgradeDebug(message: string, meta: Record<string, unknown>): void {
  if (!DEBUG_PORTAL_UPGRADE) return;
  console.log('[billing][webhook][portal_upgrade]', message, JSON.stringify(meta));
}

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

/** Stripe may return `price` as an expanded object or a price id string. */
function subscriptionItemPriceId(item: Stripe.SubscriptionItem): string | null {
  const p = item.price;
  if (typeof p === 'string') return p;
  if (p && typeof p === 'object' && 'id' in p && typeof (p as Stripe.Price).id === 'string') {
    return (p as Stripe.Price).id;
  }
  return null;
}

function planKeyFromSubscription(sub: Stripe.Subscription): SubscriptionPlanKey | null {
  for (const item of sub.items.data) {
    const parsed = subscriptionPlanForStripePriceId(subscriptionItemPriceId(item));
    if (parsed) return parsed;
  }
  return normalizeSubscriptionPlanKey(sub.metadata?.planKey);
}

/** Price id from an invoice line (Stripe may return price as id string or expanded object). */
function priceIdFromInvoiceLine(line: Stripe.InvoiceLineItem): string | null {
  const p = line.price;
  if (typeof p === 'string') return p;
  if (p && typeof p === 'object' && 'id' in p && typeof (p as Stripe.Price).id === 'string') {
    return (p as Stripe.Price).id;
  }
  const plan = line.plan;
  if (typeof plan === 'string') return plan;
  if (plan && typeof plan === 'object' && 'id' in plan && typeof (plan as Stripe.Plan).id === 'string') {
    return (plan as Stripe.Plan).id;
  }
  return null;
}

/** Collect distinct subscription tiers referenced on invoice lines (portal proration lines). */
function distinctPlansFromInvoiceLines(invoice: Stripe.Invoice): SubscriptionPlanKey[] {
  const tiers = new Set<SubscriptionPlanKey>();
  for (const line of invoice.lines.data) {
    const pid = priceIdFromInvoiceLine(line);
    const plan = subscriptionPlanForStripePriceId(pid);
    if (plan) tiers.add(plan);
  }
  return [...tiers];
}

/**
 * Infer upgrade from/to from invoice lines: lowest tier → highest tier among distinct known plans.
 * Works for portal-driven upgrades where proration lines reference both price IDs.
 */
function inferUpgradePlansFromInvoiceLines(invoice: Stripe.Invoice): {
  fromPlan: SubscriptionPlanKey;
  toPlan: SubscriptionPlanKey;
} | null {
  const distinct = distinctPlansFromInvoiceLines(invoice);
  if (distinct.length < 2) return null;
  distinct.sort((a, b) => comparePlanTier(a, b));
  const fromPlan = distinct[0];
  const toPlan = distinct[distinct.length - 1];
  if (fromPlan === toPlan) return null;
  if (comparePlanTier(toPlan, fromPlan) <= 0) return null;
  return { fromPlan, toPlan };
}

/** Legacy fallback: net amounts per plan (older line shapes). */
/**
 * Portal upgrade invoices often include a negative proration line for the *previous* price.
 * Use that as old plan when two-distinct-plan inference fails.
 */
function inferOldPlanFromNegativeProrationLines(
  invoice: Stripe.Invoice,
  newPlan: SubscriptionPlanKey
): SubscriptionPlanKey | null {
  for (const line of invoice.lines.data) {
    const amount = typeof line.amount === 'number' ? line.amount : 0;
    if (amount >= 0) continue;
    const pid = priceIdFromInvoiceLine(line);
    const plan = subscriptionPlanForStripePriceId(pid);
    if (!plan || plan === newPlan) continue;
    if (comparePlanTier(newPlan, plan) > 0) return plan;
  }
  return null;
}

function highestMappedPlanOnInvoice(invoice: Stripe.Invoice): SubscriptionPlanKey | null {
  const tiers = distinctPlansFromInvoiceLines(invoice);
  if (tiers.length === 0) return null;
  tiers.sort((a, b) => comparePlanTier(a, b));
  return tiers[tiers.length - 1];
}

function inferUpgradePlansFromInvoice(invoice: Stripe.Invoice): {
  fromPlan: SubscriptionPlanKey;
  toPlan: SubscriptionPlanKey;
} | null {
  const scores = new Map<SubscriptionPlanKey, number>();
  for (const line of invoice.lines.data) {
    const plan = subscriptionPlanForStripePriceId(priceIdFromInvoiceLine(line));
    if (!plan) continue;
    const amount = typeof line.amount === 'number' ? line.amount : 0;
    scores.set(plan, (scores.get(plan) ?? 0) + amount);
  }
  const entries = [...scores.entries()];
  if (entries.length < 2) return null;
  entries.sort((a, b) => a[1] - b[1]);
  const fromPlan = entries[0][0];
  const toPlan = entries[entries.length - 1][0];
  if (fromPlan === toPlan) return null;
  if (comparePlanTier(toPlan, fromPlan) <= 0) return null;
  return { fromPlan, toPlan };
}

async function resolveUserIdFromInvoice(stripe: Stripe, invoice: Stripe.Invoice): Promise<string | null> {
  const subRef = invoice.subscription;
  const subId = typeof subRef === 'string' ? subRef : subRef?.id ?? null;
  if (subId) {
    try {
      const sub = await stripe.subscriptions.retrieve(subId);
      if (sub.metadata?.userId) return normalizeUserId(sub.metadata.userId);
    } catch {
      /* ignore */
    }
  }
  const custRef = invoice.customer;
  const customerId = typeof custRef === 'string' ? custRef : custRef?.id ?? null;
  if (customerId) {
    const uid = await getUserIdByStripeCustomerId(customerId);
    if (uid) return normalizeUserId(uid);
  }
  return null;
}

async function resolveUserIdFromSubscription(sub: Stripe.Subscription): Promise<string | null> {
  if (sub.metadata?.userId) return normalizeUserId(sub.metadata.userId);
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id ?? null;
  if (!customerId) return null;
  const uid = await getUserIdByStripeCustomerId(customerId);
  return uid ? normalizeUserId(uid) : null;
}

/**
 * Resolve pre-upgrade tier for portal / subscription_update invoices.
 * Order: subscription metadata (in-app upgrade markers) → invoice line price IDs → DB tier if still stale (invoice before subscription.updated).
 */
async function resolvePortalUpgradeOldPlan(
  stripe: Stripe,
  invoice: Stripe.Invoice,
  sub: Stripe.Subscription,
  userId: string,
  newPlan: SubscriptionPlanKey
): Promise<SubscriptionPlanKey | null> {
  const metaFrom = normalizeSubscriptionPlanKey(sub.metadata?.upgradeFromPlanKey);
  const metaTo = normalizeSubscriptionPlanKey(sub.metadata?.upgradeToPlanKey);
  if (metaFrom && metaTo && metaTo === newPlan && comparePlanTier(newPlan, metaFrom) > 0) {
    portalUpgradeDebug('old_plan_source', { source: 'metadata', metaFrom, metaTo, newPlan });
    return metaFrom;
  }

  let invFull: Stripe.Invoice = invoice;
  try {
    invFull = await stripe.invoices.retrieve(invoice.id, {
      expand: ['lines.data.price'],
    });
  } catch {
    /* embedded invoice object */
  }

  let inferred = inferUpgradePlansFromInvoiceLines(invFull);
  if (!inferred) inferred = inferUpgradePlansFromInvoice(invFull);

  if (inferred && inferred.toPlan === newPlan && inferred.fromPlan !== newPlan) {
    portalUpgradeDebug('old_plan_source', {
      source: 'invoice_lines_two_tier',
      fromPlan: inferred.fromPlan,
      toPlan: inferred.toPlan,
      newPlan,
    });
    return inferred.fromPlan;
  }
  if (inferred && inferred.toPlan !== newPlan) {
    portalUpgradeDebug('old_plan_skip_two_tier_mismatch', {
      inferredFromLines: inferred,
      stripeNewPlan: newPlan,
      reason: 'inferred_to_plan_does_not_match_stripe_subscription_new_plan',
    });
  }

  const fromNegative = inferOldPlanFromNegativeProrationLines(invFull, newPlan);
  if (fromNegative) {
    portalUpgradeDebug('old_plan_source', {
      source: 'negative_proration_line',
      fromPlan: fromNegative,
      newPlan,
    });
    return fromNegative;
  }

  const u = await getUser(userId);
  const stored = u?.subscriptionTier;
  if (
    stored &&
    stored !== 'none' &&
    stored !== newPlan &&
    comparePlanTier(newPlan, stored) > 0
  ) {
    portalUpgradeDebug('old_plan_source', {
      source: 'app_db_subscription_tier',
      stored,
      newPlan,
      note: 'db may be stale vs Stripe if invoice.paid arrived before customer.subscription.updated',
    });
    return stored;
  }

  portalUpgradeDebug('old_plan_unresolved', {
    newPlan,
    twoTierInference: inferred ?? null,
    distinctLineTiers: distinctPlansFromInvoiceLines(invFull),
    invoiceLineHints: invFull.lines.data.map((l) => ({
      amount: l.amount ?? null,
      proration: l.proration ?? null,
      priceId: priceIdFromInvoiceLine(l),
    })),
    appDbTierUsedAsRejection: stored ?? 'none',
    dbCouldNotInferOldTier: !stored || stored === 'none' || stored === newPlan || comparePlanTier(newPlan, stored) <= 0,
  });
  return null;
}

/** Adds credits via `app_grant_credits` (balance += amount); does not replace the balance. */
async function grantSubscriptionCredits(
  userId: string,
  amount: number,
  planKey: SubscriptionPlanKey,
  stripeEventId: string,
  reason: string,
  sourceKey: string
): Promise<boolean> {
  const supabase = getSupabaseServiceRoleClient();
  const uid = normalizeUserId(userId);
  const { error, data } = await supabase.rpc('app_grant_credits', {
    p_user_id: uid,
    p_amount: amount,
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
    amount,
    reason,
    planKey,
    remaining: Number(row?.balance ?? 0),
  });
  return true;
}

async function grantSubscriptionCreditsForPlan(
  userId: string,
  planKey: SubscriptionPlanKey,
  stripeEventId: string,
  reason: string,
  sourceKey: string
): Promise<boolean> {
  return grantSubscriptionCredits(
    userId,
    subscriptionCreditsForPlan(planKey),
    planKey,
    stripeEventId,
    reason,
    sourceKey
  );
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
          const granted = await grantSubscriptionCreditsForPlan(
            userId,
            planKey,
            event.id,
            'subscription_checkout',
            sourceKeyForSubscriptionCheckoutGrant(session.id)
          );
          if (!granted) {
            auditLog('subscription_grant_duplicate_ignored', {
              userId,
              planKey,
              stripeEventId: event.id,
              stripeCheckoutSessionId: session.id,
            });
          } else {
            auditLog('subscription_created', {
              userId,
              planKey,
              stripeEventId: event.id,
              stripeCheckoutSessionId: session.id,
            });
          }
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

        const sub = await stripe.subscriptions.retrieve(subId, {
          expand: ['items.data.price'],
        });
        const userId = await resolveUserIdFromSubscription(sub);
        const planKeyFromSub = planKeyFromSubscription(sub);
        const planKeyRaw = sub.metadata?.planKey;
        const subscriptionItemPriceIds = sub.items.data.map((i) => subscriptionItemPriceId(i) ?? null);

        if (!userId || (!planKeyRaw && !planKeyFromSub)) {
          if (!userId || !planKeyFromSub) {
            console.warn('[billing][webhook] invoice.paid subscription missing userId/planKey metadata');
          }
          break;
        }

        let planKey = planKeyFromSub ?? normalizeSubscriptionPlanKey(planKeyRaw);
        if (!planKey) {
          const invFull = await stripe.invoices.retrieve(invoice.id, { expand: ['lines.data.price'] }).catch(() => null);
          if (invFull) {
            const hi = highestMappedPlanOnInvoice(invFull);
            if (hi) planKey = hi;
          }
        }
        if (!planKey) break;
        const before = await getUser(userId);
        const appTierBefore = before?.subscriptionTier ?? 'none';

        const br = invoice.billing_reason;
        if (br === 'subscription_cycle') {
          portalUpgradeDebug('subscription_cycle_eval', {
            stripeEventType: event.type,
            billingReason: br,
            stripeInvoiceId: invoice.id,
            stripeSubscriptionId: sub.id,
            userId,
            appTierBefore,
            newPlan: planKey,
          });
          const granted = await grantSubscriptionCreditsForPlan(
            userId,
            planKey,
            event.id,
            `invoice_paid:${br}`,
            sourceKeyForInvoiceGrant(invoice.id)
          );
          if (!granted) {
            auditLog('subscription_grant_duplicate_ignored', {
              userId,
              planKey,
              stripeEventId: event.id,
              invoiceId: invoice.id,
              billingReason: br,
            });
          }
          portalUpgradeDebug('subscription_cycle_result', {
            stripeInvoiceId: invoice.id,
            stripeSubscriptionId: sub.id,
            userId,
            granted,
            renewalCredits: subscriptionCreditsForPlan(planKey),
          });
        } else if (br === 'subscription_update') {
          const newPlan = planKey;
          const metaFrom = normalizeSubscriptionPlanKey(sub.metadata?.upgradeFromPlanKey);
          const metaTo = normalizeSubscriptionPlanKey(sub.metadata?.upgradeToPlanKey);
          const appDbTierPossiblyStale =
            appTierBefore !== newPlan &&
            appTierBefore !== 'none' &&
            comparePlanTier(newPlan, appTierBefore) > 0;

          portalUpgradeDebug('subscription_update_entry', {
            stripeInvoiceId: invoice.id,
            stripeSubscriptionId: sub.id,
            billingReason: br,
            resolvedUserId: userId,
            subscriptionItemPriceIds,
            planKeyFromSubscriptionItems: planKeyFromSub,
            subscriptionMetadataPlanKeyRaw: planKeyRaw ?? null,
            resolvedNewPlan: newPlan,
            appDbTierBeforeInvoiceHandler: appTierBefore,
            appDbTierPossiblyStaleVsStripeNewPlan: appDbTierPossiblyStale,
            subscriptionMetadataUpgradeFrom: metaFrom,
            subscriptionMetadataUpgradeTo: metaTo,
          });

          const oldPlan = await resolvePortalUpgradeOldPlan(stripe, invoice, sub, userId, newPlan);
          const diff =
            oldPlan && comparePlanTier(newPlan, oldPlan) > 0
              ? subscriptionCreditDifference(oldPlan, newPlan)
              : 0;

          portalUpgradeDebug('subscription_update_resolved', {
            stripeInvoiceId: invoice.id,
            stripeSubscriptionId: sub.id,
            userId,
            oldPlanResolved: oldPlan ?? null,
            newPlanResolved: newPlan,
            computedCreditDiff: diff,
            grantBranchWouldRun: Boolean(
              oldPlan && comparePlanTier(newPlan, oldPlan) > 0 && diff > 0
            ),
          });

          if (!oldPlan) {
            portalUpgradeDebug('subscription_update_skip', {
              reason: 'no_old_plan',
              stripeInvoiceId: invoice.id,
              grantBranchExecuted: false,
            });
            break;
          }
          if (comparePlanTier(newPlan, oldPlan) <= 0) {
            portalUpgradeDebug('subscription_update_skip', {
              reason: 'downgrade_or_same',
              oldPlan,
              newPlan,
              grantBranchExecuted: false,
            });
            break;
          }
          if (diff <= 0) {
            portalUpgradeDebug('subscription_update_skip', {
              reason: 'diff_non_positive',
              diff,
              oldPlan,
              newPlan,
              grantBranchExecuted: false,
            });
            break;
          }

          const granted = await grantSubscriptionCredits(
            userId,
            diff,
            newPlan,
            event.id,
            'subscription_upgrade',
            sourceKeyForSubscriptionUpgradeGrant(invoice.id)
          );

          if (granted) {
            portalUpgradeDebug('subscription_update_grant_executed', {
              grantBranchExecuted: true,
              oldPlan,
              newPlan,
              diff,
              stripeInvoiceId: invoice.id,
            });
            auditLog('subscription_upgraded', {
              userId,
              fromPlan: oldPlan,
              toPlan: newPlan,
              creditDifference: diff,
              stripeEventId: event.id,
              invoiceId: invoice.id,
            });
          } else {
            portalUpgradeDebug('subscription_update_skip', {
              reason: 'duplicate_or_idempotent',
              stripeInvoiceId: invoice.id,
              grantBranchExecuted: false,
            });
            auditLog('subscription_upgrade_duplicate_ignored', {
              userId,
              fromPlan: oldPlan,
              toPlan: newPlan,
              stripeEventId: event.id,
              invoiceId: invoice.id,
            });
          }
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId =
          typeof invoice.subscription === 'string'
            ? invoice.subscription
            : invoice.subscription?.id ?? null;
        const userId = await resolveUserIdFromInvoice(stripe, invoice);
        auditLog('invoice_payment_failed', {
          ...(userId ? { userId } : {}),
          stripeEventId: event.id,
          stripeInvoiceId: invoice.id,
          ...(subscriptionId ? { subscriptionId } : {}),
          attemptCount: invoice.attempt_count,
        });
        if (userId) {
          await patchUser(userId, { subscriptionStatus: 'past_due' });
        }
        break;
      }

      case 'invoice.payment_action_required': {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId =
          typeof invoice.subscription === 'string'
            ? invoice.subscription
            : invoice.subscription?.id ?? null;
        const userId = await resolveUserIdFromInvoice(stripe, invoice);
        auditLog('invoice_payment_action_required', {
          ...(userId ? { userId } : {}),
          stripeEventId: event.id,
          stripeInvoiceId: invoice.id,
          ...(subscriptionId ? { subscriptionId } : {}),
        });
        if (userId) {
          await patchUser(userId, { subscriptionStatus: 'payment_action_required' });
        }
        break;
      }

      case 'invoice.finalization_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId =
          typeof invoice.subscription === 'string'
            ? invoice.subscription
            : invoice.subscription?.id ?? null;
        const userId = await resolveUserIdFromInvoice(stripe, invoice);
        auditLog('invoice_finalization_failed', {
          ...(userId ? { userId } : {}),
          stripeEventId: event.id,
          stripeInvoiceId: invoice.id,
          ...(subscriptionId ? { subscriptionId } : {}),
        });
        if (userId) {
          await patchUser(userId, { subscriptionStatus: 'invoice_finalization_failed' });
        }
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        const userId = await resolveUserIdFromSubscription(sub);
        if (!userId) break;
        const planKeyRaw = sub.metadata?.planKey;
        const existing = await getUser(userId);
        let tier: SubscriptionPlanKey | 'none' = 'none';
        const parsedFromItems = planKeyFromSubscription(sub);
        if (parsedFromItems) {
          tier = parsedFromItems;
        } else if (planKeyRaw) {
          const parsed = normalizeSubscriptionPlanKey(planKeyRaw);
          if (parsed) tier = parsed;
        }
        if (tier === 'none') {
          tier = existing?.subscriptionTier && existing.subscriptionTier !== 'none' ? existing.subscriptionTier : 'none';
        }
        const st = mapStripeSubStatus(sub.status);
        portalUpgradeDebug('subscription_updated_eval', {
          stripeEventType: event.type,
          stripeSubscriptionId: sub.id,
          userId,
          appTierBefore: existing?.subscriptionTier ?? 'none',
          resolvedStripePlan: tier,
          resolvedStatus: st,
        });

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
