import { NextRequest, NextResponse } from 'next/server';
import { getJobStore } from '@/lib/try-on/job-store';
import { logJobEvent, recordMetrics } from '@/lib/try-on/logger';
import { saveUserImage } from '@/lib/db/images-repo';
import { getSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { auditLog } from '@/lib/billing/audit';

export const runtime = 'nodejs';

interface WebhookBody {
  jobId: string;
  status?: 'succeeded' | 'failed';
  resultBase64?: string;
  mimeType?: string;
  resultUrl?: string;
  error?: string;
  gpuDurationMs?: number;
}

function getExpectedSecret(): string {
  return process.env.MODAL_WEBHOOK_SECRET ?? process.env.TRY_ON_WEBHOOK_SECRET ?? 'dev-secret-change-me';
}

/** GET ping for Modal GPU preflight (tunnel must be up before inference). No auth. */
export async function GET() {
  return NextResponse.json(
    { ok: true, ping: 'try-on-webhook', purpose: 'modal_preflight' },
    { status: 200, headers: { 'Cache-Control': 'no-store' } }
  );
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization') ?? '';
  const xWebhookSecret = request.headers.get('x-webhook-secret') ?? '';
  const bearerSecret = authHeader.replace(/^Bearer\s+/i, '').trim();
  const headerSecret = bearerSecret || xWebhookSecret;
  const expectedSecret = getExpectedSecret();

  let body: WebhookBody;
  try {
    body = (await request.json()) as WebhookBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const webhookJobId = typeof body.jobId === 'string' ? body.jobId : undefined;
  const webhookStatus = body.status;

  console.log('[try-on][webhook] auth_check', {
    hasAuthorizationHeader: Boolean(authHeader),
    hasBearerToken: Boolean(bearerSecret),
    hasXWebhookSecretHeader: Boolean(xWebhookSecret),
    expectedSecretConfigured: Boolean(expectedSecret),
    webhookJobId,
    webhookStatus,
  });

  if (!headerSecret || headerSecret !== expectedSecret) {
    console.warn('[try-on][webhook] auth_failed', {
      hasHeaderSecret: Boolean(headerSecret),
      headerSecretLength: headerSecret.length,
      expectedSecretLength: expectedSecret.length,
      webhookJobId,
    });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  console.log('[try-on][webhook] auth_passed', { webhookJobId, webhookStatus });

  if (!body.jobId || typeof body.jobId !== 'string') {
    return NextResponse.json({ error: 'jobId required' }, { status: 400 });
  }

  const store = getJobStore();
  const job = await store.get(body.jobId);
  if (!job) {
    console.warn('[try-on][webhook] job_missing', {
      webhookJobId: body.jobId,
      webhookStatus,
      hint: 'Different server instance or pruned job; ack 200 to stop provider retries',
    });
    return NextResponse.json(
      {
        ok: true,
        ignored: true,
        reason: 'job_not_found',
        webhookJobId: body.jobId,
        webhookStatus,
      },
      { status: 200 }
    );
  }

  console.log('[try-on][webhook] job_found', { webhookJobId: body.jobId, storeJobId: job.id });

  const t0 = Date.now();

  if (body.status === 'failed' || body.error) {
    if (job.userId) {
      const supabase = getSupabaseServiceRoleClient();
      const { data, error } = await supabase.rpc('app_refund_job_credit_once', {
        p_job_id: body.jobId,
        p_reason: 'gpu_webhook_failed',
        p_source_key: `refund:${body.jobId}:gpu_webhook_failed`,
      });
      if (!error) {
        const row = Array.isArray(data) ? data[0] : data;
        if (row?.refunded) {
          auditLog('credits_restored', { userId: job.userId, jobId: job.id, reason: 'gpu_webhook_failed' });
        }
      }
    }
    await store.update(body.jobId, {
      status: 'failed',
      error: body.error ?? 'GPU reported failure',
      errorCode: 'GPU_FAILED',
      gpuDurationMs: body.gpuDurationMs,
    });
    const updated = await store.get(body.jobId);
    if (updated) {
      await recordMetrics(updated, { success: false, gpuDurationMs: body.gpuDurationMs });
    }
    await logJobEvent(body.jobId, 'error', 'webhook_failed', { error: body.error });
    console.log('[try-on][webhook] status_written', { webhookJobId: body.jobId, status: 'failed' });
    console.log('[try-on][webhook] webhook_completed', {
      webhookJobId: body.jobId,
      receivedMs: Date.now() - t0,
      direct_vton_without_preprocessing: true,
      background_removal_active: false,
    });
    return NextResponse.json({ ok: true, receivedMs: Date.now() - t0 });
  }

  if (body.resultBase64) {
    if (!job.userId) {
      return NextResponse.json({ error: 'Job missing user context' }, { status: 500 });
    }
    const mimeType = body.mimeType ?? 'image/jpeg';
    const resultBuffer = Buffer.from(body.resultBase64, 'base64');
    const generatedImage = await saveUserImage({
      userId: job.userId,
      imageType: 'generated',
      buffer: resultBuffer,
      mimeType,
      jobId: body.jobId,
      sourcePersonImageId: job.sourcePersonImageId,
      sourceGarmentImageId: job.sourceGarmentImageId,
    });
    await store.update(body.jobId, {
      status: 'succeeded',
      generatedImageId: generatedImage.id,
      gpuDurationMs: body.gpuDurationMs,
      completedAt: Date.now(),
    });
    const updated = await store.get(body.jobId);
    if (updated) {
      await recordMetrics(updated, { success: true, gpuDurationMs: body.gpuDurationMs });
    }
    await logJobEvent(body.jobId, 'info', 'webhook_succeeded');
    console.log('[try-on][webhook] status_written', { webhookJobId: body.jobId, status: 'succeeded' });
    console.log('[try-on][webhook] webhook_completed', {
      webhookJobId: body.jobId,
      receivedMs: Date.now() - t0,
      direct_vton_without_preprocessing: true,
      background_removal_active: false,
    });
    return NextResponse.json({ ok: true, receivedMs: Date.now() - t0 });
  }

  if (body.resultUrl) {
    if (job.userId) {
      try {
        const response = await fetch(body.resultUrl);
        if (response.ok) {
          const arr = await response.arrayBuffer();
          const mimeType = response.headers.get('content-type') || 'image/jpeg';
          const generatedImage = await saveUserImage({
            userId: job.userId,
            imageType: 'generated',
            buffer: Buffer.from(arr),
            mimeType,
            jobId: body.jobId,
            sourcePersonImageId: job.sourcePersonImageId,
            sourceGarmentImageId: job.sourceGarmentImageId,
          });
          await store.update(body.jobId, { generatedImageId: generatedImage.id });
        }
      } catch {
        // Keep URL fallback if provider-hosted image cannot be fetched right now.
      }
    }
    await store.update(body.jobId, {
      status: 'succeeded',
      resultUrl: body.resultUrl,
      gpuDurationMs: body.gpuDurationMs,
      completedAt: Date.now(),
    });
    const updated = await store.get(body.jobId);
    if (updated) {
      await recordMetrics(updated, { success: true, gpuDurationMs: body.gpuDurationMs });
    }
    await logJobEvent(body.jobId, 'info', 'webhook_succeeded_url');
    console.log('[try-on][webhook] status_written', { webhookJobId: body.jobId, status: 'succeeded_url' });
    console.log('[try-on][webhook] webhook_completed', {
      webhookJobId: body.jobId,
      receivedMs: Date.now() - t0,
      direct_vton_without_preprocessing: true,
      background_removal_active: false,
    });
    return NextResponse.json({ ok: true, receivedMs: Date.now() - t0 });
  }

  console.warn('[try-on][webhook] no_result_payload', { webhookJobId: body.jobId });
  return NextResponse.json({ error: 'No result in webhook body' }, { status: 400 });
}
