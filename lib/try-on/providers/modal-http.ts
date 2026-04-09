/**
 * Calls a Modal-deployed HTTP endpoint (Python FastAPI or Modal web endpoint).
 * Contract: POST JSON { jobId, personBase64, outfitBase64, category, garment_photo_type, webhookUrl, webhookSecret }
 * Response: { mode: 'async' } | { mode: 'sync', resultBase64, mimeType? }
 */

import type { GpuProvider } from './gpu-provider';
import type { GpuProviderResult, GpuSubmitPayload } from '../types';

/** Fail fast on Modal ingress hang (async jobs return quickly; 20s is plenty for cold start). */
const MODAL_SUBMIT_TIMEOUT_MS = 20_000;
const MAX_RETRIES = 2;
const BASE_DELAY_MS = 300;

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export class ModalHttpGpuProvider implements GpuProvider {
  readonly name = 'modal-http';

  constructor(
    private readonly endpoint: string,
    private readonly apiKey?: string
  ) {}

  async submit(payload: GpuSubmitPayload): Promise<GpuProviderResult> {
    console.log('[try-on][modal-http] submit', {
      endpoint: this.endpoint,
      hasApiKey: Boolean(this.apiKey),
      jobId: payload.jobId,
    });
    const body = JSON.stringify({
      jobId: payload.jobId,
      personBase64: payload.personBase64,
      outfitBase64: payload.outfitBase64,
      personMime: payload.personMime,
      outfitMime: payload.outfitMime,
      category: payload.category,
      garment_photo_type: payload.garment_photo_type,
      webhookUrl: payload.webhookUrl,
      webhookSecret: payload.webhookSecret,
    });

    let lastErr: Error | null = null;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        };
        if (this.apiKey) {
          headers.Authorization = `Bearer ${this.apiKey}`;
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), MODAL_SUBMIT_TIMEOUT_MS);
        const res = await fetch(this.endpoint, {
          method: 'POST',
          headers,
          body,
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (!res.ok) {
          const text = await res.text().catch(() => '');
          if (res.status === 503) {
            let msg = text.slice(0, 800);
            try {
              const j = JSON.parse(text) as { detail?: unknown };
              if (typeof j.detail === 'string') msg = j.detail;
            } catch {
              /* use raw text */
            }
            throw new Error(`webhook_unreachable_preflight (Modal): ${msg}`);
          }
          throw new Error(`Modal HTTP ${res.status}: ${text.slice(0, 500)}`);
        }

        const data = (await res.json()) as Record<string, unknown>;
        if (data.duplicate === true) {
          console.log('[try-on][modal-http] duplicate_job_ignored_by_modal', {
            jobId: payload.jobId,
          });
        }
        if (data.mode === 'sync' && typeof data.resultBase64 === 'string') {
          return {
            mode: 'sync',
            resultBase64: data.resultBase64,
            resultMimeType: typeof data.mimeType === 'string' ? data.mimeType : 'image/jpeg',
          };
        }
        if (data.mode === 'async' || data.accepted === true) {
          // Always correlate with the Next.js job id we sent; never trust a mismatched id from the worker.
          const returned =
            typeof data.providerJobId === 'string' ? data.providerJobId : undefined;
          if (returned && returned !== payload.jobId) {
            console.warn('[try-on][modal-http] providerJobId mismatch; using submit jobId', {
              submitJobId: payload.jobId,
              returnedProviderJobId: returned,
            });
          }
          return {
            mode: 'async',
            providerJobId: payload.jobId,
          };
        }
        // Default: async webhook
        return { mode: 'async', providerJobId: payload.jobId };
      } catch (e) {
        lastErr = e instanceof Error ? e : new Error(String(e));
        if (attempt < MAX_RETRIES - 1) {
          await sleep(BASE_DELAY_MS * Math.pow(2, attempt));
        }
      }
    }

    throw lastErr ?? new Error('Modal submit failed');
  }
}
