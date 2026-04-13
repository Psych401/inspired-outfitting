/** Canonical free credits for new accounts (product rule). */
export const NEW_USER_FREE_CREDITS = 3;

/**
 * Credits seeded when a `user_billing_state` row is first created (JS + RPC `p_default_credits`).
 * Production is always {@link NEW_USER_FREE_CREDITS}. Non-production may override via
 * `TRY_ON_DEFAULT_USER_CREDITS` for local testing.
 */
export function defaultCreditsForNewUser(): number {
  if (process.env.NODE_ENV === 'production') {
    return NEW_USER_FREE_CREDITS;
  }
  const raw = process.env.TRY_ON_DEFAULT_USER_CREDITS;
  if (raw == null || String(raw).trim() === '') return NEW_USER_FREE_CREDITS;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : NEW_USER_FREE_CREDITS;
}

/**
 * Dev-only: force try-on to error after a successful debit (see `app/api/try-on/route.ts`).
 * Refund runs via the route's catch path when the job is not created.
 */
export function shouldForceTryOnFailAfterDebit(): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  return process.env.TRY_ON_FORCE_FAIL_AFTER_DEBIT === 'true';
}
