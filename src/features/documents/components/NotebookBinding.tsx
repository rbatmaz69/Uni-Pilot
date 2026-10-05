import { useId } from 'react';

/** Vertical ring positions in percent; slightly irregular like a real binder. */
const RING_POSITIONS = [12, 26, 40, 60, 74, 88];

/** The punched holes along the spine edge of one page. */
export function PunchedHoles({ side }: { side: 'left' | 'right' }) {
  return (
    <div className={`notebook-holes is-${side}`} aria-hidden>
      {RING_POSITIONS.map((top) => (
        <span key={top} style={{ top: `${top}%` }} />
      ))}
    </div>
  );
}

/** Spine over the seam and the metal rings reaching from hole to hole. */
export function NotebookBinding() {
  const id = useId();
  return (
    <div className="notebook-binding" aria-hidden>
      <span className="notebook-spine" />
      {RING_POSITIONS.map((top, index) => {
        const gradient = `${id}-ring-${index}`;
        return (
          <svg
            key={top}
            className="notebook-ring"
            style={{ top: `${top}%` }}
            width="40"
            height="40"
            viewBox="0 0 40 40"
          >
            <defs>
              <linearGradient id={gradient} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style={{ stopColor: 'var(--notebook-ring-light)' }} />
                <stop offset="35%" style={{ stopColor: 'var(--notebook-ring)' }} />
                <stop offset="100%" style={{ stopColor: 'var(--notebook-ring-dark)' }} />
              </linearGradient>
            </defs>
            <ellipse className="notebook-ring-contact" cx="20" cy="21" rx="17" ry="3.5" />
            <path
              className="notebook-ring-wire"
              d="M 5 20 A 15 15 0 0 1 35 20"
              fill="none"
              stroke={`url(#${gradient})`}
              strokeWidth="4.2"
              strokeLinecap="round"
            />
            <path
              className="notebook-ring-shine"
              d="M 7 21 A 13 13 0 0 1 33 21"
              fill="none"
              strokeWidth="1.1"
              strokeLinecap="round"
            />
          </svg>
        );
      })}
    </div>
  );
}
