/**
 * The camera, for face unlock only.
 *
 * Opened after a click and never otherwise — not at start, not in the
 * background. Frames leave as JPEG for Rust to look at; nothing is kept on
 * the page. `stop()` ends every track, so the camera light goes out; the
 * dialogs call it on success, on cancel, on close and when Uni Pilot loses
 * focus.
 */

export const FRAME_WIDTH = 640;
export const FRAME_HEIGHT = 480;
const JPEG_QUALITY = 0.85;

export interface Camera {
  /** The picture now, as JPEG bytes — not mirrored; only the preview is. */
  grab: () => Promise<Uint8Array>;
  /** Ends every track. Safe to call more than once. */
  stop: () => void;
}

export async function openCamera(video: HTMLVideoElement): Promise<Camera> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: FRAME_WIDTH, height: FRAME_HEIGHT, facingMode: 'user' },
    audio: false,
  });
  let stopped = false;
  const stop = () => {
    stopped = true;
    for (const track of stream.getTracks()) track.stop();
    video.srcObject = null;
  };
  try {
    video.srcObject = stream;
    // `play` resolves once there is a picture, so the first frame has a size.
    await (video.play() as Promise<void> | undefined);
  } catch (failure) {
    stop();
    throw failure;
  }

  const canvas = document.createElement('canvas');
  const grab = () =>
    new Promise<Uint8Array>((resolve, reject) => {
      const context = stopped ? null : canvas.getContext('2d');
      if (!context) {
        reject(new Error('The camera is off.'));
        return;
      }
      canvas.width = video.videoWidth || FRAME_WIDTH;
      canvas.height = video.videoHeight || FRAME_HEIGHT;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('The camera gave no picture.'));
            return;
          }
          blob.arrayBuffer().then((bytes) => resolve(new Uint8Array(bytes)), reject);
        },
        'image/jpeg',
        JPEG_QUALITY,
      );
    });

  return { grab, stop };
}
