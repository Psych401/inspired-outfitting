import { NextRequest, NextResponse } from 'next/server';
import { getJobStore, statusForClient } from '@/lib/try-on/job-store';
import { preprocessTryOnImages, ImageValidationError } from '@/lib/try-on/preprocess';
import { getCreditCostPerGeneration, tryDebitCredits, refundCredits } from '@/lib/try-on/credits';
import { checkRateLimit, rateLimitKey } from '@/lib/try-on/rate-limit';
import { runTryOnJob } from '@/lib/try-on/orchestrator';
import { logJobEvent } from '@/lib/try-on/logger';
import type { GarmentType } from '@/lib/try-on/types';

export const runtime = 'nodejs';
export const maxDuration = 120;

const GARMENT_TYPES = new Set<GarmentType>(['top', 'bottom', 'fullBody']);

function clientIp(request: NextRequest): string {
  const xf = request.headers.get('x-forwarded-for');
  if (xf) return xf.split(',')[0].trim();
  return request.headers.get('x-real-ip') ?? 'unknown';
}

export async function POST(request: NextRequest) {
  const wallStart = Date.now();
  const reqTag = `tryon_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  try {
    const contentType = request.headers.get('content-type') ?? '';
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 });
    }

    const form = await request.formData();
    const personFile = form.get('person');
    const outfitFile = form.get('outfit');
    const garmentRaw = form.get('garmentType');
    const userId = (form.get('userId') as string | null) ?? request.headers.get('x-user-id') ?? undefined;
    const requestId = (form.get('requestId') as string | null) ?? undefined;
    console.log('[try-on][api] request_received', {
      reqTag,
      requestId,
      userId,
      providerEnv: process.env.TRY_ON_GPU_PROVIDER ?? 'auto',
      hasModalEndpoint: Boolean(process.env.MODAL_TRY_ON_ENDPOINT),
      hasRunpodEndpoint: Boolean(process.env.RUNPOD_TRY_ON_ENDPOINT),
      direct_vton_without_preprocessing: true,
      background_removal_active: false,
    });

    if (!(personFile instanceof File) || !(outfitFile instanceof File)) {
      return NextResponse.json(
        { error: 'Missing person or outfit file', code: 'MISSING_FILES' },
        { status: 400 }
      );
    }

    const garmentType = typeof garmentRaw === 'string' ? garmentRaw.trim() : '';
    if (!GARMENT_TYPES.has(garmentType as GarmentType)) {
      return NextResponse.json(
        { error: 'garmentType must be top, bottom, or fullBody', code: 'INVALID_GARMENT_TYPE' },
        { status: 400 }
      );
    }

    const ip = clientIp(request);
    const rl = checkRateLimit(rateLimitKey(ip, userId));
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded', code: 'RATE_LIMIT', retryAfterSec: rl.retryAfterSec },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec ?? 60) } }
      );
    }

    const cost = getCreditCostPerGeneration();
    const debit = tryDebitCredits(userId, cost);
    if (!debit.ok) {
      return NextResponse.json(
        { error: 'Insufficient credits', code: 'INSUFFICIENT_CREDITS', remaining: debit.remaining },
        { status: 402 }
      );
    }

    const personBuf = Buffer.from(await personFile.arrayBuffer());
    const outfitBuf = Buffer.from(await outfitFile.arrayBuffer());

    console.log('[try-on][api] direct_vton_without_preprocessing', {
      direct_vton_without_preprocessing: true,
      background_removal_active: false,
      reqTag,
      note: 'No client BG removal/segmentation; server may resize/validate only',
    });

    let processed;
    try {
      processed = await preprocessTryOnImages(
        personBuf,
        outfitBuf,
        personFile.type || 'application/octet-stream',
        outfitFile.type || 'application/octet-stream'
      );
    } catch (e) {
      if (debit.ok) {
        refundCredits(userId, cost);
      }
      if (e instanceof ImageValidationError) {
        return NextResponse.json({ error: e.message, code: e.code }, { status: 400 });
      }
      throw e;
    }

    const store = getJobStore();
    const job = await store.create({
      status: 'queued',
      garmentType: garmentType as GarmentType,
      userId,
      requestId,
      retryCount: 0,
    });

    console.log('[try-on][api] job_created', {
      reqTag,
      jobId: job.id,
      requestId,
      garmentType,
      direct_vton_without_preprocessing: true,
      background_removal_active: false,
    });

    await logJobEvent(job.id, 'info', 'job_created', {
      userId,
      requestId,
      garmentType,
      requestDurationMsSoFar: Date.now() - wallStart,
      direct_vton_without_preprocessing: true,
      background_removal_active: false,
    });

    const jobRecord = await store.get(job.id);
    if (!jobRecord) {
      return NextResponse.json({ error: 'Job creation failed' }, { status: 500 });
    }

    Promise.resolve()
      .then(() =>
        runTryOnJob(jobRecord, {
          person: processed.personBuffer,
          outfit: processed.outfitBuffer,
          personMime: processed.personMime,
          outfitMime: processed.outfitMime,
        })
      )
      .catch((err) => console.error('[try-on][api] pipeline_error', { reqTag, jobId: job.id, err }));

    const body = {
      ...statusForClient(jobRecord),
      status: 'queued' as const,
      estimatedSeconds: 45,
      creditsRemaining: debit.remaining,
    };

    return NextResponse.json(body, {
      status: 202,
      headers: {
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Try-on request failed';
    console.error('[try-on][api] post_error', { reqTag, error: e });
    return NextResponse.json({ error: msg, code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
