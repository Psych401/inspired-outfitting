import { getSupabaseServiceRoleClient } from '@/lib/supabase/server';

export type LedgerKind = 'grant' | 'debit' | 'refund' | 'adjustment';

export async function appendLedger(params: {
  userId: string;
  kind: LedgerKind;
  amount: number;
  reason: string;
  jobId?: string;
  stripeEventId?: string;
  sourceKey?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const supabase = getSupabaseServiceRoleClient();
  const { error } = await supabase.from('credit_ledger').insert({
    user_id: params.userId,
    entry_type: params.kind,
    credits_delta: params.amount,
    reason: params.reason,
    job_id: params.jobId ?? null,
    stripe_event_id: params.stripeEventId ?? null,
    source_key: params.sourceKey ?? null,
    metadata: params.metadata ?? {},
  });
  if (error) {
    throw new Error(`credit_ledger insert failed: ${error.message}`);
  }
}
