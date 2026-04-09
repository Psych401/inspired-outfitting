import { NextRequest, NextResponse } from 'next/server';
import { getJobStore } from '@/lib/try-on/job-store';
import { logJobEvent, recordMetrics } from '@/lib/try-on/logger';

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
    await store.update(body.jobId, {
      status: 'succeeded',
      resultBase64: body.resultBase64,
      resultMimeType: body.mimeType ?? 'image/jpeg',
      resultUrl: body.resultUrl,
      gpuDurationMs: body.gpuDurationMs,
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
    await store.update(body.jobId, {
      status: 'succeeded',
      resultUrl: body.resultUrl,
      gpuDurationMs: body.gpuDurationMs,
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
