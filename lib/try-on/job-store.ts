import type { TryOnJobRecord, TryOnJobStatus, TryOnLogEntry } from './types';
import { randomUUID } from 'crypto';
import { getSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { createPrivateSignedImageUrl } from '@/lib/supabase/storage';

export interface JobStore {
  create(job: Omit<TryOnJobRecord, 'id' | 'createdAt' | 'updatedAt' | 'log'>): Promise<TryOnJobRecord>;
  get(id: string): Promise<TryOnJobRecord | undefined>;
  update(id: string, patch: Partial<TryOnJobRecord>): Promise<TryOnJobRecord | undefined>;
  appendLog(id: string, entry: Omit<TryOnLogEntry, 'at'>): Promise<void>;
}

function newId(): string {
  return randomUUID();
}

function rowToJob(row: Record<string, unknown>, log: TryOnLogEntry[] = []): TryOnJobRecord {
  return {
    id: String(row.id),
    status: row.status as TryOnJobStatus,
    category: row.category as TryOnJobRecord['category'],
    garmentPhotoType: row.garment_photo_type as TryOnJobRecord['garmentPhotoType'],
    createdAt: Date.parse(String(row.created_at)),
    updatedAt: Date.parse(String(row.updated_at)),
    completedAt: row.completed_at ? Date.parse(String(row.completed_at)) : undefined,
    userId: (row.user_id as string) ?? undefined,
    requestId: (row.request_id as string) ?? undefined,
    provider: (row.provider as string) ?? undefined,
    providerJobId: (row.provider_job_id as string) ?? undefined,
    error: (row.error_message as string) ?? undefined,
    errorCode: (row.error_code as string) ?? undefined,
    resultUrl: (row.result_url as string) ?? undefined,
    retryCount: Number(row.retry_count ?? 0),
    requestDurationMs: row.request_duration_ms ? Number(row.request_duration_ms) : undefined,
    gpuDurationMs: row.gpu_duration_ms ? Number(row.gpu_duration_ms) : undefined,
    estimatedCostUsd: row.estimated_cost_usd ? Number(row.estimated_cost_usd) : undefined,
    creditCostDebited: row.credit_cost_debited ? Number(row.credit_cost_debited) : undefined,
    creditRefundIssued: Boolean(row.credit_refund_issued),
    generatedImageId: (row.generated_image_id as string) ?? undefined,
    sourcePersonImageId: (row.source_person_image_id as string) ?? undefined,
    sourceGarmentImageId: (row.source_garment_image_id as string) ?? undefined,
    log,
  };
}

class SupabaseJobStore implements JobStore {
  async create(partial: Omit<TryOnJobRecord, 'id' | 'createdAt' | 'updatedAt' | 'log'>): Promise<TryOnJobRecord> {
    const supabase = getSupabaseServiceRoleClient();
    const id = newId();
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from('try_on_jobs')
      .insert({
        id,
        user_id: partial.userId,
        status: partial.status,
        provider: partial.provider ?? 'modal',
        provider_job_id: partial.providerJobId ?? null,
        category: partial.category,
        garment_photo_type: partial.garmentPhotoType,
        credit_cost_debited: partial.creditCostDebited ?? 0,
        credit_refund_issued: partial.creditRefundIssued ?? false,
        retry_count: partial.retryCount ?? 0,
        request_id: partial.requestId ?? null,
        source_person_image_id: partial.sourcePersonImageId ?? null,
        source_garment_image_id: partial.sourceGarmentImageId ?? null,
        created_at: nowIso,
        updated_at: nowIso,
      })
      .select('*')
      .single();
    if (error) throw new Error(`try_on_jobs create failed: ${error.message}`);
    return rowToJob(data);
  }

  async get(id: string): Promise<TryOnJobRecord | undefined> {
    const supabase = getSupabaseServiceRoleClient();
    const { data, error } = await supabase.from('try_on_jobs').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(`try_on_jobs get failed: ${error.message}`);
    if (!data) return undefined;
    const { data: logs } = await supabase
      .from('try_on_job_logs')
      .select('level,message,meta,created_at')
      .eq('job_id', id)
      .order('created_at', { ascending: true })
      .limit(100);
    const mappedLogs: TryOnLogEntry[] =
      logs?.map((l) => ({
        at: Date.parse(String(l.created_at)),
        level: l.level as TryOnLogEntry['level'],
        message: String(l.message),
        meta: (l.meta as Record<string, unknown>) ?? undefined,
      })) ?? [];
    return rowToJob(data, mappedLogs);
  }

  async update(id: string, patch: Partial<TryOnJobRecord>): Promise<TryOnJobRecord | undefined> {
    const supabase = getSupabaseServiceRoleClient();
    const updateRow: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (patch.status != null) updateRow.status = patch.status;
    if (patch.provider != null) updateRow.provider = patch.provider;
    if (patch.providerJobId !== undefined) updateRow.provider_job_id = patch.providerJobId ?? null;
    if (patch.error !== undefined) updateRow.error_message = patch.error ?? null;
    if (patch.errorCode !== undefined) updateRow.error_code = patch.errorCode ?? null;
    if (patch.resultUrl !== undefined) updateRow.result_url = patch.resultUrl ?? null;
    if (patch.retryCount != null) updateRow.retry_count = patch.retryCount;
    if (patch.requestDurationMs != null) updateRow.request_duration_ms = patch.requestDurationMs;
    if (patch.gpuDurationMs != null) updateRow.gpu_duration_ms = patch.gpuDurationMs;
    if (patch.estimatedCostUsd != null) updateRow.estimated_cost_usd = patch.estimatedCostUsd;
    if (patch.creditCostDebited != null) updateRow.credit_cost_debited = patch.creditCostDebited;
    if (patch.creditRefundIssued != null) updateRow.credit_refund_issued = patch.creditRefundIssued;
    if (patch.generatedImageId !== undefined) updateRow.generated_image_id = patch.generatedImageId ?? null;
    if (patch.completedAt != null) updateRow.completed_at = new Date(patch.completedAt).toISOString();
    const { data, error } = await supabase
      .from('try_on_jobs')
      .update(updateRow)
      .eq('id', id)
      .select('*')
      .maybeSingle();
    if (error) throw new Error(`try_on_jobs update failed: ${error.message}`);
    if (!data) return undefined;
    return rowToJob(data);
  }

  async appendLog(id: string, entry: Omit<TryOnLogEntry, 'at'>): Promise<void> {
    const supabase = getSupabaseServiceRoleClient();
    const { error } = await supabase.from('try_on_job_logs').insert({
      job_id: id,
      level: entry.level,
      message: entry.message,
      meta: entry.meta ?? {},
    });
    if (error) throw new Error(`try_on_job_logs insert failed: ${error.message}`);
  }
}

const singleton: JobStore = new SupabaseJobStore();
export function getJobStore(): JobStore {
  return singleton;
}

export async function statusForClient(job: TryOnJobRecord): Promise<{
  jobId: string;
  status: TryOnJobStatus;
  resultUrl?: string;
  error?: string;
  errorCode?: string;
  retryCount: number;
  gpuDurationMs?: number;
  estimatedCostUsd?: number;
  createdAt: number;
  updatedAt: number;
}> {
  let resultUrl = job.resultUrl;
  if (!resultUrl && job.generatedImageId) {
    const supabase = getSupabaseServiceRoleClient();
    const { data: image } = await supabase
      .from('user_images')
      .select('storage_bucket,storage_path')
      .eq('id', job.generatedImageId)
      .maybeSingle();
    if (image?.storage_bucket && image?.storage_path) {
      resultUrl = (await createPrivateSignedImageUrl(image.storage_bucket, image.storage_path, 300)) ?? undefined;
    }
  }
  return {
    jobId: job.id,
    status: job.status,
    resultUrl,
    error: job.error,
    errorCode: job.errorCode,
    retryCount: job.retryCount,
    gpuDurationMs: job.gpuDurationMs,
    estimatedCostUsd: job.estimatedCostUsd,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}
