/**
 * Marks in-flight jobs as failed if they exceed a wall-clock limit (avoids infinite client polling).
 * Default 2m — keeps UX responsive while still allowing normal GPU completion.
 */

import { getJobStore } from './job-store';
import type { TryOnJobRecord } from './types';

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
  const updated = await store.update(job.id, {
    status: 'failed',
    error: `Job timed out after ${Math.round(maxMs / 60000)} minute(s) (stale job guard)`,
    errorCode: 'STALE_JOB_TIMEOUT',
  });
  return updated ?? job;
}
