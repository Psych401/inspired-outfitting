/**
 * GPU inference adapter — swap Modal for RunPod by changing env + implementation.
 */

import type { GpuProviderResult, GpuSubmitPayload } from '../types';

export interface GpuProvider {
  readonly name: string;
  submit(payload: GpuSubmitPayload): Promise<GpuProviderResult>;
}
