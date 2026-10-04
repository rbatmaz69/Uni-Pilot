import type { RefObject } from 'react';

interface CameraViewProps {
  video: RefObject<HTMLVideoElement | null>;
  cameraOn: boolean;
  /** One instruction at a time, read out as it changes. */
  prompt: string | null;
}

/**
 * The camera's picture, mirrored like a mirror, with an oval to put the face
 * in and a mark that says the camera is on. "Turn your head to the left"
 * means the student's left, which is left in this preview too; Rust's yaw is
 * signed to match (`src-tauri/src/face_unlock/liveness.rs`).
 */
export function CameraView({ video, cameraOn, prompt }: CameraViewProps) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative aspect-[4/3] w-full max-w-[400px] overflow-hidden rounded-2xl border border-line-soft bg-surface-secondary">
        <video
          ref={video}
          muted
          playsInline
          aria-label="Camera preview"
          className="h-full w-full -scale-x-100 object-cover"
        />
        <svg
          aria-hidden
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-0 h-full w-full"
        >
          <ellipse
            cx="50"
            cy="48"
            rx="22"
            ry="36"
            className="fill-none stroke-accent"
            strokeWidth="2"
            strokeDasharray="4 3"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        {cameraOn ? (
          <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 text-[11px] font-medium text-primary">
            <span aria-hidden className="h-2 w-2 rounded-full bg-coral" />
            Camera on
          </span>
        ) : null}
      </div>
      <p aria-live="polite" className="min-h-5 text-center text-sm font-medium text-primary">
        {prompt}
      </p>
    </div>
  );
}
