/**
 * Credit checks for try-on generation — Supabase-backed, server-side enforced.
 */

import { getOrCreateUser, normalizeUserId } from '@/lib/billing/user-store';
import { defaultCreditsForNewUser } from '@/lib/billing/default-free-credits';
import { auditLog } from '@/lib/billing/audit';
import { getSupabaseServiceRoleClient } from '@/lib/supabase/server';

const DEFAULT_CREDIT_COST = 1;

export function getCreditCostPerGeneration(): number {
  const n = Number(process.env.TRY_ON_CREDIT_COST ?? DEFAULT_CREDIT_COST);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_CREDIT_COST;
}

function getUnlimitedUsers(): Set<string> {
  const out = new Set<string>();
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

export async function getBalance(userId: string): Promise<number> {
  if (isUnlimitedUser(userId)) return Number.MAX_SAFE_INTEGER;
  return (await getOrCreateUser(userId)).credits;
}

/**
 * Atomically debit if sufficient balance (server-side store).
 */
export async function tryDebitCredits(
  userId: string | undefined,
  cost: number
): Promise<{ ok: true; remaining: number } | { ok: false; remaining: number }> {
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
  const supabase = getSupabaseServiceRoleClient();
  const defaultCredits = defaultCreditsForNewUser();
  const { data, error } = await supabase.rpc('app_debit_credits', {
    p_user_id: uid,
    p_amount: cost,
    p_reason: 'try_on_job',
    p_source_key: `debit:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`,
    p_default_credits: defaultCredits,
  });
  if (error) {
    throw new Error(`Debit credits failed: ${error.message}`);
  }
  const row = Array.isArray(data) ? data[0] : data;
  const ok = Boolean(row?.ok);
  const remaining = Number(row?.balance ?? 0);
  if (ok) {
    auditLog('credits_deducted', { userId: uid, amount: cost, remaining });
    return { ok: true, remaining };
  }
  return { ok: false, remaining };
}

export async function hasMinimumCredits(userId: string | undefined, cost: number): Promise<boolean> {
  if (process.env.TRY_ON_SKIP_CREDIT_CHECK === 'true') return true;
  if (isUnlimitedUser(userId)) return true;
  if (!userId) return false;
  return (await getBalance(userId)) >= cost;
}

/** Refund after a failed step when debit already occurred (idempotent per caller). */
export async function refundCredits(
  userId: string | undefined,
  amount: number,
  opts?: { reason?: string; sourceKey?: string; jobId?: string }
): Promise<void> {
  if (process.env.TRY_ON_SKIP_CREDIT_CHECK === 'true' || isUnlimitedUser(userId) || !userId) return;
  const uid = normalizeUserId(userId);
  const supabase = getSupabaseServiceRoleClient();
  const defaultCredits = defaultCreditsForNewUser();
  const { error, data } = await supabase.rpc('app_grant_credits', {
    p_user_id: uid,
    p_amount: amount,
    p_reason: opts?.reason ?? 'try_on_refund',
    p_source_key: opts?.sourceKey ?? null,
    p_job_id: opts?.jobId ?? null,
    p_default_credits: defaultCredits,
  });
  if (error) throw new Error(`Refund credits failed: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  auditLog('credits_restored', { userId: uid, amount, remaining: Number(row?.balance ?? 0) });
}
