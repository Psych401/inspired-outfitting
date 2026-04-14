/**
 * Persistent idempotency is now DB-backed via unique `credit_ledger.source_key`.
 * Keep helpers for stable source keys.
 */

export function sourceKeyForInvoiceGrant(invoiceId: string): string {
  return `invoice:${invoiceId}:subscription_grant`;
}

export function sourceKeyForPackCheckoutGrant(sessionId: string): string {
  return `checkout:${sessionId}:credit_pack_grant`;
}

export function sourceKeyForSubscriptionCheckoutGrant(sessionId: string): string {
  return `checkout:${sessionId}:subscription_initial_grant`;
}

export function sourceKeyForSubscriptionUpgradeGrant(invoiceId: string): string {
  return `invoice:${invoiceId}:subscription_upgrade_diff_grant`;
}
