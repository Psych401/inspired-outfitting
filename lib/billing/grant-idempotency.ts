/**
 * Prevents duplicate credit grants when Stripe retries before the event-id store is updated.
 * (Complements stripe-events idempotency on full event processing.)
 */

const invoiceIdsGranted = new Set<string>();
const checkoutSessionPackGranted = new Set<string>();

const MAX = 50_000;

function trimSet(s: Set<string>): void {
  if (s.size <= MAX) return;
  const drop = [...s].slice(0, Math.floor(MAX / 10));
  for (const id of drop) s.delete(id);
}

export function wasInvoiceCreditsGranted(invoiceId: string): boolean {
  return invoiceIdsGranted.has(invoiceId);
}

export function markInvoiceCreditsGranted(invoiceId: string): void {
  trimSet(invoiceIdsGranted);
  invoiceIdsGranted.add(invoiceId);
}

export function wasPackCheckoutGranted(sessionId: string): boolean {
  return checkoutSessionPackGranted.has(sessionId);
}

export function markPackCheckoutGranted(sessionId: string): void {
  trimSet(checkoutSessionPackGranted);
  checkoutSessionPackGranted.add(sessionId);
}
