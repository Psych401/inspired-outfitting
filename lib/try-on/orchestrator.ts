/**
 * Runs the try-on pipeline after a job is created: GPU submit + sync completion or webhook.
 */

import { getJobStore } from './job-store';
import type { TryOnJobRecord } from './types';
import { createGpuProvider } from './providers/factory';
import { logJobEvent, recordMetrics } from './logger';

function getPublicBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL;
  if (explicit) return explicit.replace(/\/$/, '');
  const v = process.env.VERCEL_URL;
  if (v) return v.startsWith('http') ? v.replace(/\/$/, '') : `https://${v.replace(/\/$/, '')}`;
  return 'http://localhost:3000';
}

export async function runTryOnJob(
  job: TryOnJobRecord,
  buffers: { person: Buffer; outfit: Buffer; personMime: string; outfitMime: string }
): Promise<void> {
  const store = getJobStore();
  const started = Date.now();

  await store.update(job.id, { status: 'processing' });
  await logJobEvent(job.id, 'info', 'processing_started');

  const webhookSecret = process.env.MODAL_WEBHOOK_SECRET ?? process.env.TRY_ON_WEBHOOK_SECRET ?? 'dev-secret-change-me';
  const webhookUrl = `${getPublicBaseUrl()}/api/try-on/webhook`;

  const provider = createGpuProvider();
  await logJobEvent(job.id, 'info', 'provider_selected', {
    provider: provider.name,
    requestedProviderEnv: process.env.TRY_ON_GPU_PROVIDER ?? 'auto',
    hasModalEndpoint: Boolean(process.env.MODAL_TRY_ON_ENDPOINT),
    hasRunpodEndpoint: Boolean(process.env.RUNPOD_TRY_ON_ENDPOINT),
    webhookUrl,
  });

  console.log('[try-on][orchestrator] submit_to_provider', {
    jobId: job.id,
    provider: provider.name,
    webhookUrl,
    direct_vton_without_preprocessing: true,
    background_removal_active: false,
  });

  try {
    const result = await provider.submit({
      jobId: job.id,
      personBase64: buffers.person.toString('base64'),
      outfitBase64: buffers.outfit.toString('base64'),
      personMime: buffers.personMime,
      outfitMime: buffers.outfitMime,
      garmentType: job.garmentType,
      webhookUrl,
      webhookSecret,
    });

    if (result.mode === 'sync' && result.resultBase64) {
      const gpuMs = Date.now() - started;
      await store.update(job.id, {
        status: 'succeeded',
        resultBase64: result.resultBase64,
        resultMimeType: result.resultMimeType ?? 'image/jpeg',
        gpuDurationMs: gpuMs,
        providerJobId: result.providerJobId,
      });
      const updated = await store.get(job.id);
      if (updated) {
        await recordMetrics(updated, { success: true, requestDurationMs: Date.now() - started, gpuDurationMs: gpuMs });
      }
      await logJobEvent(job.id, 'info', 'job_succeeded_sync', { provider: provider.name });
      return;
    }

    await store.update(job.id, {
      providerJobId: result.providerJobId ?? job.id,
    });
    console.log('[try-on][orchestrator] async_dispatched', {
      jobId: job.id,
      providerJobId: result.providerJobId ?? job.id,
    });
    await logJobEvent(job.id, 'info', 'job_dispatched_async', {
      provider: provider.name,
      providerJobId: result.providerJobId ?? job.id,
    });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    await store.update(job.id, {
      status: 'failed',
      error: err.message,
      errorCode: 'GPU_SUBMIT_FAILED',
    });
    const updated = await store.get(job.id);
    if (updated) {
      await recordMetrics(updated, { success: false, requestDurationMs: Date.now() - started });
    }
    await logJobEvent(job.id, 'error', 'processing_failed', { message: err.message });
  }
}
