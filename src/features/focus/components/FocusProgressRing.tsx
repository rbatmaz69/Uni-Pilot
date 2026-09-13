import { memo, useLayoutEffect, useRef } from 'react';

type FocusStatus = 'idle' | 'running' | 'paused' | 'completed';

interface FocusProgressRingProps {
  status: FocusStatus;
  deadline: number | null;
  remainingMs: number;
  durationMs: number;
}

function progressAt(
  status: FocusStatus,
  deadline: number | null,
  remainingMs: number,
  durationMs: number,
  now: number,
) {
  const remaining =
    status === 'running' && deadline !== null
      ? Math.min(remainingMs, Math.max(0, deadline - now))
      : status === 'running' || status === 'paused'
        ? remainingMs
        : status === 'completed'
          ? 0
          : durationMs;
  return Math.min(1, Math.max(0, remaining / durationMs));
}

export const FocusProgressRing = memo(function FocusProgressRing({
  status,
  deadline,
  remainingMs,
  durationMs,
}: FocusProgressRingProps) {
  const ringRef = useRef<SVGCircleElement>(null);
  const initialProgress =
    status === 'completed'
      ? 0
      : status === 'idle'
        ? 1
        : Math.min(1, Math.max(0, remainingMs / durationMs));

  useLayoutEffect(() => {
    const paint = () => {
      const progress = progressAt(status, deadline, remainingMs, durationMs, Date.now());
      ringRef.current?.setAttribute('stroke-dashoffset', String(1 - progress));
    };

    paint();
    if (status !== 'running' || deadline === null) return;

    window.addEventListener('focus', paint);
    document.addEventListener('visibilitychange', paint);
    let stop: () => void;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      const timer = window.setInterval(paint, 1000);
      stop = () => window.clearInterval(timer);
    } else {
      let frame: number;
      const tick = () => {
        paint();
        frame = window.requestAnimationFrame(tick);
      };
      frame = window.requestAnimationFrame(tick);
      stop = () => window.cancelAnimationFrame(frame);
    }
    return () => {
      stop();
      window.removeEventListener('focus', paint);
      document.removeEventListener('visibilitychange', paint);
    };
  }, [status, deadline, remainingMs, durationMs]);

  return (
    <svg
      viewBox="0 0 360 360"
      className="pointer-events-none absolute inset-0 h-full w-full -rotate-90"
      aria-hidden
    >
      <circle
        cx="180"
        cy="180"
        r="172"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        opacity="0.2"
      />
      <circle
        ref={ringRef}
        cx="180"
        cy="180"
        r="172"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        pathLength="1"
        strokeDasharray="1"
        strokeDashoffset={1 - initialProgress}
        strokeLinecap="round"
      />
    </svg>
  );
});
