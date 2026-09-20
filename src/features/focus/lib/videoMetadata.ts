interface VideoMetadataResponse {
  id: number;
  hasAudio?: boolean;
  error?: string;
}

let worker: Worker | null = null;
let nextRequestId = 0;
const pending = new Map<
  number,
  { resolve: (hasAudio: boolean) => void; reject: (error: Error) => void }
>();

function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('../workers/mediaInfoWorker.ts', import.meta.url), {
    type: 'module',
  });
  worker.addEventListener('message', (event: MessageEvent<VideoMetadataResponse>) => {
    const request = pending.get(event.data.id);
    if (!request) return;
    pending.delete(event.data.id);
    if (event.data.error) request.reject(new Error(event.data.error));
    else request.resolve(event.data.hasAudio ?? true);
  });
  worker.addEventListener('error', () => {
    pending.forEach(({ reject }) => reject(new Error('Could not inspect this video.')));
    pending.clear();
    worker?.terminate();
    worker = null;
  });
  return worker;
}

export function detectVideoHasAudio(file: File): Promise<boolean> {
  const id = ++nextRequestId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ id, file });
  });
}
