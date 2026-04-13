/**
 * Credit checks for try-on generation — server-side balance in user-store (billing).
 */

import { addCredits, deductCredits, getOrCreateUser, normalizeUserId } from '@/lib/billing/user-store';
import { auditLog } from '@/lib/billing/audit';
import { appendLedger } from '@/lib/billing/ledger';

const DEFAULT_CREDIT_COST = 1;
const DEFAULT_UNLIMITED_TEST_USERS = new Set<string>(['isaac.cronin@example.com']);

export function getCreditCostPerGeneration(): number {
  const n = Number(process.env.TRY_ON_CREDIT_COST ?? DEFAULT_CREDIT_COST);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_CREDIT_COST;
}

function getUnlimitedUsers(): Set<string> {
  const out = new Set<string>(DEFAULT_UNLIMITED_TEST_USERS);
  const raw = process.env.TRY_ON_UNLIMITED_USERS ?? '';
  for (const part of raw.split(',')) {
    const v = part.trim().toLowerCase();
    if (v) out.add(v);
  }
  return out;
}

function isUnlimitedUser(userId: string | undefined): boolean {
  if (!userId) return false;
  return getUnlimitedUsers().has(userId.trim().toLowerCase());
}

export function getBalance(userId: string): number {
  if (isUnlimitedUser(userId)) return Number.MAX_SAFE_INTEGER;
  return getOrCreateUser(userId).credits;
}

/**
 * Atomically debit if sufficient balance (server-side store).
 */
export function tryDebitCredits(
  userId: string | undefined,
  cost: number
): { ok: true; remaining: number } | { ok: false; remaining: number } {
  if (process.env.TRY_ON_SKIP_CREDIT_CHECK === 'true') {
    return { ok: true, remaining: 999999 };
  }
  if (isUnlimitedUser(userId)) {
    return { ok: true, remaining: Number.MAX_SAFE_INTEGER };
  }
  if (!userId) {
    return { ok: false, remaining: 0 };
  }

  const uid = normalizeUserId(userId);
  const r = deductCredits(uid, cost);
  if (r.ok) {
    appendLedger({ userId: uid, kind: 'debit', amount: cost, reason: 'try_on_job' });
    auditLog('credits_deducted', { userId: uid, amount: cost, remaining: r.remaining });
  }
  return r.ok ? { ok: true, remaining: r.remaining } : { ok: false, remaining: r.remaining };
}

export function hasMinimumCredits(userId: string | undefined, cost: number): boolean {
  if (process.env.TRY_ON_SKIP_CREDIT_CHECK === 'true') return true;
  if (isUnlimitedUser(userId)) return true;
  if (!userId) return false;
  return getBalance(userId) >= cost;
}

/** Refund after a failed step when debit already occurred (idempotent per caller). */
export function refundCredits(userId: string | undefined, amount: number): void {
  if (process.env.TRY_ON_SKIP_CREDIT_CHECK === 'true' || isUnlimitedUser(userId) || !userId) return;
  const uid = normalizeUserId(userId);
  addCredits(uid, amount, 'refund');
  appendLedger({ userId: uid, kind: 'restore', amount, reason: 'try_on_refund' });
  auditLog('credits_restored', { userId: uid, amount });
}
