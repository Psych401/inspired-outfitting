/**
 * Pluggable job store. Default: in-memory (single Node process).
 * For Vercel multi-instance or horizontal scaling, set TRY_ON_REDIS_URL and implement Redis adapter (same interface).
 */

import type { TryOnJobRecord, TryOnJobStatus, TryOnLogEntry } from './types';
import { randomBytes } from 'crypto';

const TTL_MS = 24 * 60 * 60 * 1000; // 24h
const MAX_JOBS = 5000;

export interface JobStore {
  create(job: Omit<TryOnJobRecord, 'id' | 'createdAt' | 'updatedAt' | 'log'>): Promise<TryOnJobRecord>;
  get(id: string): Promise<TryOnJobRecord | undefined>;
  update(id: string, patch: Partial<TryOnJobRecord>): Promise<TryOnJobRecord | undefined>;
  appendLog(id: string, entry: Omit<TryOnLogEntry, 'at'>): Promise<void>;
}

function newId(): string {
  return `job_${randomBytes(16).toString('hex')}`;
}

class MemoryJobStore implements JobStore {
  private readonly map = new Map<string, TryOnJobRecord>();

  async create(
    partial: Omit<TryOnJobRecord, 'id' | 'createdAt' | 'updatedAt' | 'log'>
  ): Promise<TryOnJobRecord> {
    this.prune();
    if (this.map.size >= MAX_JOBS) {
      throw new Error('Job store capacity exceeded');
    }
    const now = Date.now();
    const record: TryOnJobRecord = {
      ...partial,
      id: newId(),
      createdAt: now,
      updatedAt: now,
      log: [],
    };
    this.map.set(record.id, record);
    return record;
  }

  async get(id: string): Promise<TryOnJobRecord | undefined> {
    return this.map.get(id);
  }

  async update(id: string, patch: Partial<TryOnJobRecord>): Promise<TryOnJobRecord | undefined> {
    const cur = this.map.get(id);
    if (!cur) return undefined;
    const next: TryOnJobRecord = {
      ...cur,
      ...patch,
      id: cur.id,
      createdAt: cur.createdAt,
      log: patch.log ?? cur.log,
      updatedAt: Date.now(),
    };
    this.map.set(id, next);
    return next;
  }

  async appendLog(id: string, entry: Omit<TryOnLogEntry, 'at'>): Promise<void> {
    const cur = this.map.get(id);
    if (!cur) return;
    const line: TryOnLogEntry = { ...entry, at: Date.now() };
    cur.log = [...cur.log, line];
    cur.updatedAt = Date.now();
    this.map.set(id, cur);
  }

  private prune(): void {
    const now = Date.now();
    for (const [id, job] of this.map) {
      if (now - job.updatedAt > TTL_MS) {
        this.map.delete(id);
      }
    }
  }
}

let singleton: JobStore | null = null;

export function getJobStore(): JobStore {
  if (!singleton) {
    singleton = new MemoryJobStore();
  }
  return singleton;
}

export function statusForClient(job: TryOnJobRecord): {
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
} {
  let resultUrl = job.resultUrl;
  if (!resultUrl && job.resultBase64 && job.resultMimeType) {
    resultUrl = `data:${job.resultMimeType};base64,${job.resultBase64}`;
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
