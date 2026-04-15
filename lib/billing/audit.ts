/**
 * Security/billing audit logs — no secrets, no tokens, no PII beyond userId.
 */

type AuditEvent =
  | 'checkout_session_created'
  | 'subscription_created'
  | 'subscription_upgraded'
  | 'subscription_upgrade_confirmed'
  | 'subscription_upgrade_duplicate_ignored'
  | 'subscription_grant_duplicate_ignored'
  | 'post_checkout_session_restored'
  | 'stripe_webhook_received'
  | 'stripe_event_processed'
  | 'stripe_event_duplicate_ignored'
  | 'credits_granted'
  | 'credits_deducted'
  | 'credits_restored'
  | 'subscription_status_changed'
  | 'invoice_payment_failed'
  | 'invoice_payment_action_required'
  | 'invoice_finalization_failed';

export function auditLog(
  event: AuditEvent,
  meta: Record<string, unknown> & { userId?: string }
): void {
  console.log('[billing][audit]', JSON.stringify({ event, ...meta, at: Date.now() }));
}
