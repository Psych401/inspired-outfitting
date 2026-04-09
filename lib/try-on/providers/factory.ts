import { ModalHttpGpuProvider } from './modal-http';
import { RunPodGpuProvider } from './runpod-adapter';
import { StubGpuProvider } from './stub-provider';
import type { GpuProvider } from './gpu-provider';

export function createGpuProvider(): GpuProvider {
  const kind = (process.env.TRY_ON_GPU_PROVIDER ?? 'auto').toLowerCase();
  const modalEndpoint = process.env.MODAL_TRY_ON_ENDPOINT;
  const runpodEndpoint = process.env.RUNPOD_TRY_ON_ENDPOINT;

  console.log('[try-on][factory] provider selection', {
    requested: kind,
    hasModalEndpoint: Boolean(modalEndpoint),
    hasRunpodEndpoint: Boolean(runpodEndpoint),
  });

  if (kind === 'stub') {
    return new StubGpuProvider();
  }

  if (kind === 'runpod') {
    const url = runpodEndpoint;
    if (!url) {
      throw new Error('TRY_ON_GPU_PROVIDER=runpod but RUNPOD_TRY_ON_ENDPOINT is missing');
    }
    console.log('[try-on][factory] using runpod provider');
    return new RunPodGpuProvider(url, process.env.RUNPOD_API_KEY);
  }

  if (kind === 'modal') {
    const url = modalEndpoint;
    if (!url) {
      throw new Error('TRY_ON_GPU_PROVIDER=modal but MODAL_TRY_ON_ENDPOINT is missing');
    }
    console.log('[try-on][factory] using modal provider');
    return new ModalHttpGpuProvider(url, process.env.MODAL_API_KEY);
  }

  // auto: Modal > RunPod > stub
  if (modalEndpoint) {
    console.log('[try-on][factory] using modal provider (auto)');
    return new ModalHttpGpuProvider(modalEndpoint, process.env.MODAL_API_KEY);
  }
  if (runpodEndpoint) {
    console.log('[try-on][factory] using runpod provider (auto)');
    return new RunPodGpuProvider(runpodEndpoint, process.env.RUNPOD_API_KEY);
  }

  console.warn('[try-on][factory] no GPU provider endpoint configured; using stub provider');
  return new StubGpuProvider();
}
