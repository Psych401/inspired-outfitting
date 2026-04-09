/**
 * Local stub: completes synchronously with a minimal JPEG (no real VTON).
 * Use when TRY_ON_GPU_PROVIDER=stub or no Modal/RunPod URL is configured.
 */

import sharp from 'sharp';
import type { GpuProvider } from './gpu-provider';
import type { GpuProviderResult, GpuSubmitPayload } from '../types';

export class StubGpuProvider implements GpuProvider {
  readonly name = 'stub';

  async submit(_payload: GpuSubmitPayload): Promise<GpuProviderResult> {
    const buf = await sharp({
      create: {
        width: 64,
        height: 64,
        channels: 3,
        background: { r: 220, g: 210, b: 200 },
      },
    })
      .jpeg({ quality: 80 })
      .toBuffer();

    return {
      mode: 'sync',
      resultBase64: buf.toString('base64'),
      resultMimeType: 'image/jpeg',
    };
  }
}
