import { useEffect, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import {
  MAX_ZOOM,
  MIN_ZOOM,
  sheetAt,
  stepZoom,
  type SheetLayout,
} from '@/features/documents/lib/pageSheets';

type PageZoomProps = {
  /** The scroll container of the sheets. */
  stage: HTMLElement | null;
  layout: SheetLayout;
  zoom: number;
  onZoom: (zoom: number) => void;
};

/** Where you are and how large the sheets are, like a word processor's status bar. */
export function PageZoom({ stage, layout, zoom, onZoom }: PageZoomProps) {
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!stage) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const stack = stage.querySelector<HTMLElement>('.note-zoom');
      if (!stack) return;
      // The sheet in the middle of the window is the one being read.
      setPage(sheetAt(stage.scrollTop + stage.clientHeight / 2 - stack.offsetTop, layout, zoom));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    stage.addEventListener('scroll', schedule, { passive: true });
    return () => {
      stage.removeEventListener('scroll', schedule);
      cancelAnimationFrame(frame);
    };
  }, [stage, layout, zoom]);

  const percent = `${Math.round(zoom * 100)}%`;
  return (
    <div className="note-zoom-bar" role="group" aria-label="Pages and zoom">
      <span className="note-zoom-page">{`Page ${Math.min(page, layout.count)} of ${layout.count}`}</span>
      <span className="note-zoom-divider" aria-hidden />
      <button
        type="button"
        className="note-zoom-button"
        aria-label="Zoom out"
        title="Zoom out (⌘−)"
        disabled={zoom <= MIN_ZOOM}
        onClick={() => onZoom(stepZoom(zoom, -1))}
      >
        <Minus size={14} aria-hidden />
      </button>
      <button
        type="button"
        className="note-zoom-value"
        aria-label={`Zoom ${percent}, reset to 100%`}
        title="Actual size (⌘0)"
        onClick={() => onZoom(1)}
      >
        {percent}
      </button>
      <button
        type="button"
        className="note-zoom-button"
        aria-label="Zoom in"
        title="Zoom in (⌘+)"
        disabled={zoom >= MAX_ZOOM}
        onClick={() => onZoom(stepZoom(zoom, 1))}
      >
        <Plus size={14} aria-hidden />
      </button>
    </div>
  );
}
