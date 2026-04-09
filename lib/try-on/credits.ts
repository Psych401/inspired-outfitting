/**
 * Credit checks for try-on generation.
 * Replace with DB-backed ledger (Stripe, internal balance) in production.
 */

const DEFAULT_CREDIT_COST = 1;
const DEFAULT_UNLIMITED_TEST_USERS = new Set<string>(['isaac.cronin@example.com']);

let balanceCache: Map<string, number> | null = null;

function getBalances(): Map<string, number> {
  if (balanceCache) return balanceCache;
  balanceCache = new Map();
  const raw = process.env.TRY_ON_USER_CREDITS_JSON;
  if (raw) {
    try {
      const obj = JSON.parse(raw) as Record<string, number>;
      for (const [k, v] of Object.entries(obj)) {
        balanceCache.set(k, Number(v));
      }
    } catch {
      /* ignore */
    }
  }
  const def = Number(process.env.TRY_ON_DEFAULT_USER_CREDITS ?? 0);
  if (!Number.isNaN(def) && def > 0 && balanceCache.size === 0) {
    /* optional: seed anonymous — not used without userId */
  }
  return balanceCache;
}

export function getCreditCostPerGeneration(): number {
  const n = Number(process.env.TRY_ON_CREDIT_COST ?? DEFAULT_CREDIT_COST);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_CREDIT_COST;
}

export function getBalance(userId: string): number {
  if (isUnlimitedUser(userId)) return Number.MAX_SAFE_INTEGER;
  const b = getBalances().get(userId);
  if (b !== undefined) return b;
  return Number(process.env.TRY_ON_DEFAULT_USER_CREDITS ?? 0);
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

/**
 * Atomically debit if sufficient balance. In-memory only; use DB in production.
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

  const map = getBalances();
  const current = map.has(userId) ? map.get(userId)! : Number(process.env.TRY_ON_DEFAULT_USER_CREDITS ?? 0);

  if (current < cost) {
    return { ok: false, remaining: current };
  }

  const next = current - cost;
  map.set(userId, next);
  return { ok: true, remaining: next };
}

export function hasMinimumCredits(userId: string | undefined, cost: number): boolean {
  if (process.env.TRY_ON_SKIP_CREDIT_CHECK === 'true') return true;
  if (isUnlimitedUser(userId)) return true;
  if (!userId) return false;
  return getBalance(userId) >= cost;
}

/** Refund after a failed validation step (e.g. preprocess) when debit already occurred. */
export function refundCredits(userId: string | undefined, amount: number): void {
  if (process.env.TRY_ON_SKIP_CREDIT_CHECK === 'true' || isUnlimitedUser(userId) || !userId) return;
  const map = getBalances();
  const current = map.has(userId) ? map.get(userId)! : Number(process.env.TRY_ON_DEFAULT_USER_CREDITS ?? 0);
  map.set(userId, current + amount);
}
