import { useEffect, useRef, useState, type RefObject } from 'react';
import { openCamera, type Camera } from '@/features/auto-sign-in/lib/camera';

/** About six frames a second — fewer when Rust takes longer to look. */
export const FRAME_MS = 166;

export interface FaceSessionSteps<P> {
  /** Rust gets ready: reads the credential store, loads the models. The camera waits for it. */
  start: () => Promise<P>;
  frame: (jpeg: Uint8Array) => Promise<P>;
  finished: (progress: P) => boolean;
  /** Tells Rust the session ended early. Not called once it finished. */
  cancel: () => Promise<void>;
}

export interface FaceSessionEvents<P> {
  /** The last frame's answer; the camera is off already. */
  onFinished: (progress: P) => void;
  /** Rust ended the session, or the camera would not open. The camera is off. */
  onFailed: (failure: unknown) => void;
  /** Uni Pilot went to the background, and the camera off with it. */
  onPaused: () => void;
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * One enrolment or unlock, from Rust's start to the last frame. Mount it after
 * a click; the camera is on only while frames are going, and off again on
 * success, failure, unmount, and when the window loses focus or is hidden.
 *
 * Starting waits a tick, so React's development double mount does not read
 * the credential store twice.
 */
export function useFaceSession<P>(
  steps: FaceSessionSteps<P>,
  events: FaceSessionEvents<P>,
  video: RefObject<HTMLVideoElement | null>,
): { progress: P | null; cameraOn: boolean } {
  const [progress, setProgress] = useState<P | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const stepsRef = useRef(steps);
  const eventsRef = useRef(events);
  useEffect(() => {
    eventsRef.current = events;
  });

  useEffect(() => {
    const { start, frame, finished } = stepsRef.current;
    // Rust may have ended the session already; nothing is left to undo then.
    const cancel = () => {
      stepsRef.current.cancel().catch(() => undefined);
    };
    let alive = true;
    let started = false;
    let done = false;
    let camera: Camera | null = null;

    const turnOff = () => {
      camera?.stop();
      camera = null;
      if (alive) setCameraOn(false);
    };

    const run = async () => {
      started = true;
      try {
        let answer = await start();
        if (!alive) return;
        setProgress(answer);
        if (!video.current) throw new Error('There is no place to show the camera.');
        camera = await openCamera(video.current);
        if (!alive) {
          turnOff();
          return;
        }
        setCameraOn(true);
        while (alive && camera) {
          const began = performance.now();
          const jpeg = await camera.grab();
          if (!alive || !camera) return;
          answer = await frame(jpeg);
          if (!alive || !camera) return;
          setProgress(answer);
          if (finished(answer)) {
            done = true;
            turnOff();
            eventsRef.current.onFinished(answer);
            return;
          }
          await pause(Math.max(0, FRAME_MS - (performance.now() - began)));
        }
      } catch (failure) {
        // Rust ended the session itself, or the camera would not open — or
        // it was turned off a moment ago, and the frame in flight noticed.
        if (done) return;
        done = true;
        turnOff();
        // Harmless when Rust ended it already; needed when the camera failed.
        cancel();
        if (alive) eventsRef.current.onFailed(failure);
      }
    };

    // While Rust reads the credential store, the Keychain's prompt may take
    // the focus: only a running camera is turned off on blur.
    const leave = () => {
      if (done || !camera) return;
      done = true;
      turnOff();
      cancel();
      eventsRef.current.onPaused();
    };
    const hidden = () => {
      if (document.visibilityState === 'hidden') leave();
    };
    window.addEventListener('blur', leave);
    document.addEventListener('visibilitychange', hidden);
    const timer = setTimeout(() => void run(), 0);

    return () => {
      alive = false;
      clearTimeout(timer);
      window.removeEventListener('blur', leave);
      document.removeEventListener('visibilitychange', hidden);
      camera?.stop();
      camera = null;
      if (started && !done) cancel();
    };
  }, [video]);

  return { progress, cameraOn };
}
