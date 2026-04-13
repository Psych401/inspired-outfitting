/**
 * In-memory billing state per user (userId = normalized email).
 * Replace with Postgres/Redis for multi-instance production.
 */

import type { SubscriptionPlanKey } from './products';

export type SubscriptionStatus = 'none' | 'active' | 'past_due' | 'canceled' | 'trialing' | 'unpaid';

export interface UserBillingRecord {
  userId: string;
  stripeCustomerId?: string;
  subscriptionTier: SubscriptionPlanKey | 'none';
  subscriptionStatus: SubscriptionStatus;
  /** Stripe subscription id when active */
  stripeSubscriptionId?: string;
  credits: number;
  updatedAt: number;
}

const users = new Map<string, UserBillingRecord>();

function defaultCredits(): number {
  const n = Number(process.env.TRY_ON_DEFAULT_USER_CREDITS ?? 0);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

export function normalizeUserId(userId: string): string {
  return userId.trim().toLowerCase();
}

export function getOrCreateUser(userId: string): UserBillingRecord {
  const id = normalizeUserId(userId);
  let u = users.get(id);
  if (!u) {
    u = {
      userId: id,
      subscriptionTier: 'none',
      subscriptionStatus: 'none',
      credits: defaultCredits(),
      updatedAt: Date.now(),
    };
    users.set(id, u);
  }
  return u;
}

export function getUser(userId: string): UserBillingRecord | undefined {
  return users.get(normalizeUserId(userId));
}

export function patchUser(userId: string, patch: Partial<UserBillingRecord>): UserBillingRecord {
  const cur = getOrCreateUser(userId);
  const next: UserBillingRecord = {
    ...cur,
    ...patch,
    userId: cur.userId,
    updatedAt: Date.now(),
  };
  users.set(cur.userId, next);
  return next;
}

export function setStripeCustomer(userId: string, stripeCustomerId: string): void {
  patchUser(userId, { stripeCustomerId });
}

export function addCredits(userId: string, amount: number, _reason: string): number {
  if (amount <= 0) return getOrCreateUser(userId).credits;
  const u = getOrCreateUser(userId);
  const next = u.credits + amount;
  patchUser(userId, { credits: next });
  return next;
}

export function deductCredits(userId: string, amount: number): { ok: boolean; remaining: number } {
  const u = getOrCreateUser(userId);
  if (u.credits < amount) return { ok: false, remaining: u.credits };
  const remaining = u.credits - amount;
  patchUser(userId, { credits: remaining });
  return { ok: true, remaining };
}
