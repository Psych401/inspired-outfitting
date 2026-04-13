import { getSupabaseServiceRoleClient } from '@/lib/supabase/server';

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: string }).code;
  return code === '23505';
}

/** Returns false when already processed (duplicate). */
export async function insertStripeEventIfNew(eventId: string, eventType: string): Promise<boolean> {
  const supabase = getSupabaseServiceRoleClient();
  const { error } = await supabase.from('stripe_webhook_events').insert({
    stripe_event_id: eventId,
    event_type: eventType,
    processed_at: new Date().toISOString(),
  });
  if (!error) return true;
  if (isUniqueViolation(error)) return false;
  throw new Error(`stripe_webhook_events insert failed: ${error.message}`);
}
