/**
 * Simple sliding-window rate limit per key (IP + optional userId).
 * For production multi-instance, use Upstash Redis (@upstash/ratelimit) with same key scheme.
 */

const WINDOW_MS = 60_000;
const MAX_REQUESTS = Number(process.env.TRY_ON_RATE_LIMIT_PER_MINUTE ?? 20);

type Bucket = { count: number; windowStart: number };

const buckets = new Map<string, Bucket>();

export function rateLimitKey(ip: string, userId?: string): string {
  return userId ? `u:${userId}` : `ip:${ip}`;
}

export function checkRateLimit(key: string): { allowed: boolean; retryAfterSec?: number } {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || now - b.windowStart >= WINDOW_MS) {
    buckets.set(key, { count: 1, windowStart: now });
    return { allowed: true };
  }
  if (b.count >= MAX_REQUESTS) {
    const retryAfterSec = Math.ceil((WINDOW_MS - (now - b.windowStart)) / 1000);
    return { allowed: false, retryAfterSec };
  }
  b.count += 1;
  return { allowed: true };
}
