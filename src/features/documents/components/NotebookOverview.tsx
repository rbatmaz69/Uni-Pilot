import { useEffect, useRef, type CSSProperties, type RefObject } from 'react';
import { Bookmark, X } from 'lucide-react';
import type { NotebookSection } from '@/features/documents/lib/notebook';
import { cn } from '@/lib/utils';
import { PageClone } from './NotebookPage';

/** Spreads beyond this are still reachable by turning, just not shown here. */
const MAX_THUMBNAILS = 40;
const THUMB_WIDTH = 216;

type NotebookOverviewProps = {
  source: RefObject<HTMLDivElement | null>;
  spreads: number;
  current: number;
  sections: NotebookSection[];
  bookmark: number | null;
  size: { width: number; height: number };
  words: number;
  onPick: (spread: number) => void;
  onClose: () => void;
};

/** Every spread of the notebook laid out on the desk, to jump anywhere at once. */
export function NotebookOverview({
  source,
  spreads,
  current,
  sections,
  bookmark,
  size,
  words,
  onPick,
  onClose,
}: NotebookOverviewProps) {
  const currentThumb = useRef<HTMLButtonElement>(null);
  useEffect(() => currentThumb.current?.focus(), []);

  const scale = size.width > 0 ? THUMB_WIDTH / size.width : 0;
  const shown = Math.min(spreads, MAX_THUMBNAILS);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Page overview"
      className="notebook-overview"
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.stopPropagation();
        onClose();
      }}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <header className="notebook-overview-header">
        <div>
          <h2>All pages</h2>
          <p>
            {spreads * 2} pages · {words} {words === 1 ? 'word' : 'words'}
          </p>
        </div>
        <button
          type="button"
          aria-label="Close overview"
          className="notebook-dock-button"
          onClick={onClose}
        >
          <X size={16} />
        </button>
      </header>
      <div className="notebook-overview-grid">
        {Array.from({ length: shown }, (_, spread) => {
          const opens = sections.find((section) => section.spread === spread);
          const label = `Pages ${spread * 2 + 1}–${spread * 2 + 2}`;
          return (
            <button
              key={spread}
              ref={spread === current ? currentThumb : undefined}
              type="button"
              aria-label={opens ? `${label}, ${opens.label}` : label}
              aria-current={spread === current ? 'page' : undefined}
              className={cn('notebook-thumb', spread === current && 'is-current')}
              style={{ '--i': spread } as CSSProperties}
              onClick={() => onPick(spread)}
            >
              <span
                className="notebook-thumb-paper"
                style={{ aspectRatio: `${size.width} / ${size.height}` }}
              >
                <span
                  className="notebook-thumb-book notebook-ink"
                  style={{
                    width: size.width,
                    height: size.height,
                    transform: `scale(${scale})`,
                  }}
                >
                  <PageClone
                    source={source}
                    page={spread * 2}
                    pageWidth={size.width / 2}
                    side="left"
                  />
                  <PageClone
                    source={source}
                    page={spread * 2 + 1}
                    pageWidth={size.width / 2}
                    side="right"
                  />
                </span>
                {bookmark === spread ? (
                  <Bookmark className="notebook-thumb-ribbon" size={16} aria-hidden />
                ) : null}
              </span>
              <span className="notebook-thumb-caption">
                <span>{opens?.label ?? ' '}</span>
                <span>{spread * 2 + 1}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
