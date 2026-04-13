/**
 * Idempotent Stripe webhook processing — in-memory store of event IDs.
 * Replace with DB table for horizontal scale.
 */

const MAX_IDS = 50_000;
const processed = new Set<string>();

export function wasStripeEventProcessed(eventId: string): boolean {
  return processed.has(eventId);
}

export function markStripeEventProcessed(eventId: string): void {
  if (processed.size >= MAX_IDS) {
    const toDrop = [...processed].slice(0, Math.floor(MAX_IDS / 10));
    for (const id of toDrop) processed.delete(id);
  }
  processed.add(eventId);
}
