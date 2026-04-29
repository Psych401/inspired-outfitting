/**
 * Marks in-flight jobs as failed if they exceed a wall-clock limit (avoids infinite client polling).
 * Default 2m — keeps UX responsive while still allowing normal GPU completion.
 */

import { getJobStore } from './job-store';
import type { TryOnJobRecord } from './types';
import { getSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { auditLog } from '@/lib/billing/audit';

const DEFAULT_STALE_MS = 120_000; // 2 minutes

export function getStaleJobMs(): number {
  const n = Number(process.env.TRY_ON_STALE_JOB_MS ?? DEFAULT_STALE_MS);
  return Number.isFinite(n) && n > 60_000 ? n : DEFAULT_STALE_MS;
}

/**
 * If job is queued/processing too long, persist failure and return updated record.
 */
export async function failIfStale(job: TryOnJobRecord): Promise<TryOnJobRecord> {
  if (job.status !== 'queued' && job.status !== 'processing') {
    return job;
  }
  const maxMs = getStaleJobMs();
  const age = Date.now() - job.updatedAt;
  if (age <= maxMs) {
    return job;
  }
  const store = getJobStore();
  let refundIssued = false;
  if (job.userId && job.creditCostDebited && job.creditCostDebited > 0 && !job.creditRefundIssued) {
    const supabase = getSupabaseServiceRoleClient();
    const { data, error } = await supabase.rpc('app_refund_job_credit_once', {
      p_job_id: job.id,
      p_reason: 'stale_job_timeout',
      p_source_key: `refund:${job.id}:stale_job_timeout`,
    });
    if (!error) {
      const row = Array.isArray(data) ? data[0] : data;
      refundIssued = Boolean(row?.refunded);
      if (refundIssued) {
        console.log('[try-on][lifecycle] credit_refund_terminal_failure', {
          jobId: job.id,
          reason: 'stale_job_timeout',
          amount: job.creditCostDebited,
        });
        auditLog('credits_restored', {
          userId: job.userId,
          amount: job.creditCostDebited,
          reason: 'stale_job_timeout',
          jobId: job.id,
        });
      }
    }
  }
  const updated = await store.update(job.id, {
    status: 'failed',
    error: `Job timed out after ${Math.round(maxMs / 60000)} minute(s) (stale job guard)`,
    errorCode: 'STALE_JOB_TIMEOUT',
    ...(refundIssued ? { creditRefundIssued: true } : {}),
  });
  console.error('[try-on][lifecycle] stale_timeout_terminal_failure', {
    jobId: job.id,
    errorCode: 'STALE_JOB_TIMEOUT',
    refundIssued,
  });
  console.error('[try-on][lifecycle] job_marked_failed_terminal', {
    jobId: job.id,
    errorCode: 'STALE_JOB_TIMEOUT',
    refundIssued,
  });
  return updated ?? job;
}
