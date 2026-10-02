import mediaInfoFactory, { isTrackType } from 'mediainfo.js';
import mediaInfoWasmUrl from 'mediainfo.js/MediaInfoModule.wasm?url';

interface VideoMetadataRequest {
  id: number;
  file: File;
}

const mediaInfoPromise = mediaInfoFactory({
  format: 'object',
  locateFile: () => mediaInfoWasmUrl,
});

self.addEventListener('message', (event: MessageEvent<VideoMetadataRequest>) => {
  const { id, file } = event.data;
  void (async () => {
    const mediaInfo = await mediaInfoPromise;
    try {
      mediaInfo.reset();
      const result = await mediaInfo.analyzeData(file.size, async (size, offset) => {
        const chunk = await file.slice(offset, offset + size).arrayBuffer();
        return new Uint8Array(chunk);
      });
      const hasAudio = result.media?.track.some((track) => isTrackType(track, 'Audio')) ?? false;
      self.postMessage({ id, hasAudio });
    } catch (cause) {
      self.postMessage({
        id,
        error: cause instanceof Error ? cause.message : 'Could not inspect this video.',
      });
    }
  })();
});
