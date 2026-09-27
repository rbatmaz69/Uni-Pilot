import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import {
  Bookmark,
  BookmarkCheck,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  PanelRight,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { PAPER_KINDS, type PaperKind } from '@/features/documents/store/noteStyleStore';
import { cn } from '@/lib/utils';

type NotebookDockProps = {
  label: string;
  /** Rich notes have pages to turn, an overview and a bookmark. */
  paged: boolean;
  canPrevious: boolean;
  canNext: boolean;
  bookmarked: boolean;
  paper: PaperKind;
  sound: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onOverview: () => void;
  thumbnailsOpen: boolean;
  onToggleThumbnails: () => void;
  onBookmark: () => void;
  onPaper: (paper: PaperKind) => void;
  onSound: () => void;
};

function DockButton({
  label,
  pressed,
  disabled,
  onClick,
  children,
}: {
  label: string;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      disabled={disabled}
      className={cn('notebook-dock-button', pressed && 'is-on')}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/** Quiet controls under the notebook: turning, overview, ribbon, paper, sound. */
export function NotebookDock(props: NotebookDockProps) {
  const [paperOpen, setPaperOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!paperOpen) return;
    const dismiss = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node)) setPaperOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [paperOpen]);

  return (
    <div
      className="notebook-dock"
      role="toolbar"
      aria-label="Notebook controls"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && paperOpen) {
          event.stopPropagation();
          setPaperOpen(false);
          document.getElementById(`${id}-paper`)?.focus();
        }
      }}
    >
      {props.paged ? (
        <>
          <DockButton
            label="Previous page"
            disabled={!props.canPrevious}
            onClick={props.onPrevious}
          >
            <ChevronLeft size={16} />
          </DockButton>
          <span className="notebook-dock-pages" aria-live="polite">
            {props.label}
          </span>
          <DockButton label="Next page" disabled={!props.canNext} onClick={props.onNext}>
            <ChevronRight size={16} />
          </DockButton>
          <span className="notebook-dock-divider" aria-hidden />
          <DockButton label="Page overview" onClick={props.onOverview}>
            <LayoutGrid size={15} />
          </DockButton>
          <DockButton
            label={props.thumbnailsOpen ? 'Hide page thumbnails' : 'Show page thumbnails'}
            pressed={props.thumbnailsOpen}
            onClick={props.onToggleThumbnails}
          >
            <PanelRight size={15} />
          </DockButton>
          <DockButton
            label="Bookmark these pages"
            pressed={props.bookmarked}
            onClick={props.onBookmark}
          >
            {props.bookmarked ? <BookmarkCheck size={15} /> : <Bookmark size={15} />}
          </DockButton>
        </>
      ) : (
        <span className="notebook-dock-pages">{props.label}</span>
      )}
      <div ref={menu} className="notebook-dock-menu">
        <button
          type="button"
          id={`${id}-paper`}
          aria-label="Paper"
          title="Paper"
          aria-expanded={paperOpen}
          className="notebook-dock-button"
          onClick={() => setPaperOpen((open) => !open)}
        >
          <span className={`notebook-swatch is-${props.paper}`} aria-hidden />
        </button>
        {paperOpen ? (
          <div role="radiogroup" aria-label="Paper type" className="notebook-paper-menu">
            {PAPER_KINDS.map((kind) => (
              <button
                key={kind.value}
                type="button"
                role="radio"
                aria-checked={props.paper === kind.value}
                className="notebook-paper-option"
                onClick={() => {
                  props.onPaper(kind.value);
                  setPaperOpen(false);
                }}
              >
                <span className={`notebook-swatch is-${kind.value}`} aria-hidden />
                {kind.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <DockButton label="Sounds" pressed={props.sound} onClick={props.onSound}>
        {props.sound ? <Volume2 size={15} /> : <VolumeX size={15} />}
      </DockButton>
    </div>
  );
}
