import { NextRequest, NextResponse } from 'next/server';
import { getJobStore, statusForClient } from '@/lib/try-on/job-store';
import { preprocessTryOnImages, ImageValidationError } from '@/lib/try-on/preprocess';
import { getCreditCostPerGeneration, tryDebitCredits, refundCredits } from '@/lib/try-on/credits';
import { checkRateLimit, rateLimitKey } from '@/lib/try-on/rate-limit';
import { runTryOnJob } from '@/lib/try-on/orchestrator';
import { logJobEvent } from '@/lib/try-on/logger';
import { requireSessionUser } from '@/lib/auth/require-user';
import { shouldForceTryOnFailAfterDebit } from '@/lib/billing/default-free-credits';
import { ensureUserProfile } from '@/lib/billing/user-store';
import { saveUserImage } from '@/lib/db/images-repo';
import {
  isInvalidOnePiecePhotoType,
  type GarmentCategory,
  type GarmentPhotoType,
} from '@/lib/try-on/types';

export const runtime = 'nodejs';
export const maxDuration = 120;

const GARMENT_CATEGORIES = new Set<GarmentCategory>(['tops', 'bottoms', 'one-pieces']);
const GARMENT_PHOTO_TYPES = new Set<GarmentPhotoType>(['flat-lay', 'model']);

function clientIp(request: NextRequest): string {
  const xf = request.headers.get('x-forwarded-for');
  if (xf) return xf.split(',')[0].trim();
  return request.headers.get('x-real-ip') ?? 'unknown';
}

export async function POST(request: NextRequest) {
  const wallStart = Date.now();
  const reqTag = `tryon_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  let debitedUserId: string | null = null;
  let debitedAmount = 0;
  let jobCreated = false;

  try {
    const contentType = request.headers.get('content-type') ?? '';
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 });
    }

    const form = await request.formData();
    const personFile = form.get('person');
    const outfitFile = form.get('outfit');
    const categoryRaw = form.get('category');
    const garmentPhotoTypeRaw = form.get('garment_photo_type');
    const requestId = (form.get('requestId') as string | null) ?? undefined;

    const auth = await requireSessionUser(request);
    if (auth instanceof NextResponse) return auth;
    const userId = auth.sub;
    await ensureUserProfile(userId, { email: auth.email, fullName: auth.fullName, avatarUrl: auth.avatarUrl });

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

    const category = typeof categoryRaw === 'string' ? categoryRaw.trim() : '';
    if (!GARMENT_CATEGORIES.has(category as GarmentCategory)) {
      return NextResponse.json(
        { error: 'category must be tops, bottoms, or one-pieces', code: 'INVALID_CATEGORY' },
        { status: 400 }
      );
    }

    const garmentPhotoType =
      typeof garmentPhotoTypeRaw === 'string' ? garmentPhotoTypeRaw.trim() : '';
    if (!GARMENT_PHOTO_TYPES.has(garmentPhotoType as GarmentPhotoType)) {
      return NextResponse.json(
        { error: 'garment_photo_type must be flat-lay or model', code: 'INVALID_GARMENT_PHOTO_TYPE' },
        { status: 400 }
      );
    }
    if (isInvalidOnePiecePhotoType(category as GarmentCategory, garmentPhotoType as GarmentPhotoType)) {
      return NextResponse.json(
        { error: 'One-piece garments must use a model-worn garment image.', code: 'INVALID_CATEGORY_PHOTO_TYPE_COMBINATION' },
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
    const debit = await tryDebitCredits(userId, cost);
    if (!debit.ok) {
      return NextResponse.json(
        { error: 'Insufficient credits', code: 'INSUFFICIENT_CREDITS', remaining: debit.remaining },
        { status: 402 }
      );
    }
    debitedUserId = userId;
    debitedAmount = cost;

    if (shouldForceTryOnFailAfterDebit()) {
      throw new Error('TRY_ON_FORCE_FAIL_AFTER_DEBIT (dev-only)');
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
        await refundCredits(userId, cost, {
          reason: 'preprocess_failed',
          sourceKey: `refund:preprocess:${requestId ?? reqTag}`,
        });
        debitedUserId = null;
        debitedAmount = 0;
      }
      if (e instanceof ImageValidationError) {
        return NextResponse.json({ error: e.message, code: e.code }, { status: 400 });
      }
      throw e;
    }

    const personSaved = await saveUserImage({
      userId,
      imageType: 'person',
      buffer: personBuf,
      mimeType: personFile.type || 'application/octet-stream',
    });
    const garmentSaved = await saveUserImage({
      userId,
      imageType: 'garment',
      buffer: outfitBuf,
      mimeType: outfitFile.type || 'application/octet-stream',
    });

    const store = getJobStore();
    const job = await store.create({
      status: 'queued',
      provider: process.env.TRY_ON_GPU_PROVIDER ?? 'auto',
      category: category as GarmentCategory,
      garmentPhotoType: garmentPhotoType as GarmentPhotoType,
      userId,
      requestId,
      retryCount: 0,
      creditCostDebited: cost,
      creditRefundIssued: false,
      sourcePersonImageId: personSaved.id,
      sourceGarmentImageId: garmentSaved.id,
    });
    jobCreated = true;

    console.log('[try-on][api] job_created', {
      reqTag,
      jobId: job.id,
      requestId,
      category,
      garmentPhotoType,
      direct_vton_without_preprocessing: true,
      background_removal_active: false,
    });

    await logJobEvent(job.id, 'info', 'job_created', {
      userId,
      requestId,
      category,
      garmentPhotoType,
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
      ...(await statusForClient(jobRecord)),
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
    if (debitedUserId && debitedAmount > 0 && !jobCreated) {
      try {
        await refundCredits(debitedUserId, debitedAmount, {
          reason: 'try_on_request_failure',
          sourceKey: `refund:request_failure:${reqTag}`,
        });
      } catch {
        // Keep original failure response; refund retries can be handled operationally.
      }
    }
    const msg = e instanceof Error ? e.message : 'Try-on request failed';
    console.error('[try-on][api] post_error', { reqTag, error: e });
    return NextResponse.json({ error: msg, code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
