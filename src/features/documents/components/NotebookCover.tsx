import { useEffect } from 'react';

const COVER_FALLBACK_MS = 1800;

/**
 * The front cover, closed over the right page when the notebook appears and
 * swinging open around the rings. It is decoration: clicks pass through it.
 */
export function NotebookCover({ title, onOpen }: { title: string; onOpen: () => void }) {
  // Animations can be skipped by the browser, e.g. in a hidden window.
  useEffect(() => {
    const timer = window.setTimeout(onOpen, COVER_FALLBACK_MS);
    return () => window.clearTimeout(timer);
  }, [onOpen]);

  return (
    <div
      className="notebook-cover"
      aria-hidden
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget) onOpen();
      }}
    >
      <div className="notebook-cover-front">
        <span className="notebook-cover-band" />
        <span className="notebook-cover-label">
          <span className="notebook-cover-title">{title}</span>
          <span className="notebook-cover-rule" />
          <span className="notebook-cover-brand">Uni Pilot</span>
        </span>
      </div>
      <div className="notebook-cover-inside" />
    </div>
  );
}
