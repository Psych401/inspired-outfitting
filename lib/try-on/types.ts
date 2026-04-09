/**
 * Shared types for the virtual try-on pipeline (Modal / future RunPod).
 */

export type GarmentCategory = 'tops' | 'bottoms' | 'one-pieces';
export type GarmentPhotoType = 'flat-lay' | 'model';

export type TryOnJobStatus = 'queued' | 'processing' | 'succeeded' | 'failed';

export interface TryOnJobRecord {
  id: string;
  status: TryOnJobStatus;
  category: GarmentCategory;
  garmentPhotoType: GarmentPhotoType;
  createdAt: number;
  updatedAt: number;
  userId?: string;
  requestId?: string;
  /** Internal correlation id for GPU provider */
  providerJobId?: string;
  error?: string;
  errorCode?: string;
  /** Result as base64 (no data: prefix) when stored inline */
  resultBase64?: string;
  resultMimeType?: string;
  /** Public URL when result is stored in object storage */
  resultUrl?: string;
  retryCount: number;
  /** Wall-clock time for API request handling (ms) */
  requestDurationMs?: number;
  /** GPU inference time reported by worker (ms) */
  gpuDurationMs?: number;
  estimatedCostUsd?: number;
  /** Structured log lines for ops */
  log: TryOnLogEntry[];
}

export interface TryOnLogEntry {
  at: number;
  level: 'info' | 'warn' | 'error';
  message: string;
  meta?: Record<string, unknown>;
}

export interface CreateJobInput {
  personBuffer: Buffer;
  outfitBuffer: Buffer;
  personMime: string;
  outfitMime: string;
  category: GarmentCategory;
  garmentPhotoType: GarmentPhotoType;
  userId?: string;
  requestId?: string;
}

export interface GpuSubmitPayload {
  jobId: string;
  personBase64: string;
  outfitBase64: string;
  personMime: string;
  outfitMime: string;
  category: GarmentCategory;
  garment_photo_type: GarmentPhotoType;
  webhookUrl: string;
  webhookSecret: string;
}

export interface GpuProviderResult {
  mode: 'async' | 'sync';
  /** When sync, inline result */
  resultBase64?: string;
  resultMimeType?: string;
  providerJobId?: string;
}
