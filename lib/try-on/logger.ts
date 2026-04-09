import type { TryOnJobRecord } from './types';
import { getJobStore } from './job-store';

const COST_PER_GPU_MS = Number(process.env.TRY_ON_ESTIMATED_COST_USD_PER_GPU_MS ?? 0.000_001);

export function estimateCostUsd(gpuDurationMs: number): number {
  return Math.round(gpuDurationMs * COST_PER_GPU_MS * 1_000_000) / 1_000_000;
}

export async function logJobEvent(
  jobId: string,
  level: 'info' | 'warn' | 'error',
  message: string,
  meta?: Record<string, unknown>
): Promise<void> {
  const store = getJobStore();
  await store.appendLog(jobId, { level, message, meta });
  const line = JSON.stringify({ jobId, level, message, ...meta, t: Date.now() });
  if (level === 'error') console.error('[try-on]', line);
  else if (level === 'warn') console.warn('[try-on]', line);
  else console.log('[try-on]', line);
}

export async function recordMetrics(
  job: TryOnJobRecord,
  extra: { requestDurationMs?: number; gpuDurationMs?: number; success: boolean }
): Promise<void> {
  const store = getJobStore();
  const estimatedCostUsd =
    extra.gpuDurationMs != null ? estimateCostUsd(extra.gpuDurationMs) : undefined;

  await store.update(job.id, {
    requestDurationMs: extra.requestDurationMs ?? job.requestDurationMs,
    gpuDurationMs: extra.gpuDurationMs ?? job.gpuDurationMs,
    estimatedCostUsd: estimatedCostUsd ?? job.estimatedCostUsd,
  });

  await logJobEvent(job.id, 'info', 'metrics', {
    success: extra.success,
    requestDurationMs: extra.requestDurationMs,
    gpuDurationMs: extra.gpuDurationMs,
    estimatedCostUsd,
    retryCount: job.retryCount,
  });
}
