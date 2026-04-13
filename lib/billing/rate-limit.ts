/**
 * Rate limits for billing checkout (separate buckets from try-on).
 */

const WINDOW_MS = 60_000;
const MAX_CHECKOUT = Number(process.env.BILLING_CHECKOUT_RATE_LIMIT_PER_MINUTE ?? 10);

type Bucket = { count: number; windowStart: number };
const buckets = new Map<string, Bucket>();

export function checkBillingCheckoutLimit(userId: string): { allowed: boolean; retryAfterSec?: number } {
  const key = `billing_checkout:${userId}`;
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || now - b.windowStart >= WINDOW_MS) {
    buckets.set(key, { count: 1, windowStart: now });
    return { allowed: true };
  }
  if (b.count >= MAX_CHECKOUT) {
    const retryAfterSec = Math.ceil((WINDOW_MS - (now - b.windowStart)) / 1000);
    return { allowed: false, retryAfterSec };
  }
  b.count += 1;
  return { allowed: true };
}
