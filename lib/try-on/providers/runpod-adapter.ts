/**
 * Placeholder RunPod adapter — same GpuProvider interface as Modal.
 * Implement fetch to your RunPod serverless URL when migrating.
 */

import type { GpuProvider } from './gpu-provider';
import type { GpuProviderResult, GpuSubmitPayload } from '../types';

export class RunPodGpuProvider implements GpuProvider {
  readonly name = 'runpod';

  constructor(
    private readonly endpoint: string,
    private readonly apiKey?: string
  ) {}

  async submit(payload: GpuSubmitPayload): Promise<GpuProviderResult> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers.Authorization = `Bearer ${this.apiKey}`;
    }

    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jobId: payload.jobId,
        personBase64: payload.personBase64,
        outfitBase64: payload.outfitBase64,
        personMime: payload.personMime,
        outfitMime: payload.outfitMime,
        garmentType: payload.garmentType,
        webhookUrl: payload.webhookUrl,
        webhookSecret: payload.webhookSecret,
      }),
      signal: AbortSignal.timeout(120_000),
    });

    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`RunPod ${res.status}: ${t.slice(0, 500)}`);
    }

    const data = (await res.json()) as Record<string, unknown>;
    if (data.mode === 'sync' && typeof data.resultBase64 === 'string') {
      return {
        mode: 'sync',
        resultBase64: data.resultBase64,
        resultMimeType: typeof data.mimeType === 'string' ? data.mimeType : 'image/jpeg',
      };
    }
    return { mode: 'async', providerJobId: typeof data.id === 'string' ? data.id : payload.jobId };
  }
}
