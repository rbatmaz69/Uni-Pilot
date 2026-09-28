import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, LayoutDashboard, Shapes, StickyNote, X, type LucideIcon } from 'lucide-react';
import type { DrawingPresetId } from '@/features/documents/lib/drawingPresets';
import { DrawingPresetPreview } from './DrawingPresetPreview';

type Category = 'stickies' | 'shapes' | 'layouts';
type Choice = { id: DrawingPresetId; label: string; caption: string };

const CATEGORIES: {
  id: Category;
  label: string;
  description: string;
  Icon: LucideIcon;
  choices: Choice[];
}[] = [
  {
    id: 'stickies',
    label: 'Sticky notes',
    description: 'A little space for an idea.',
    Icon: StickyNote,
    choices: [
      { id: 'sticky-yellow', label: 'Yellow sticky note', caption: 'Yellow' },
      { id: 'sticky-peach', label: 'Peach sticky note', caption: 'Peach' },
      { id: 'sticky-mint', label: 'Mint sticky note', caption: 'Mint' },
      { id: 'sticky-blue', label: 'Blue sticky note', caption: 'Blue' },
    ],
  },
  {
    id: 'shapes',
    label: 'Shapes',
    description: 'Give your thoughts a shape.',
    Icon: Shapes,
    choices: [
      { id: 'rectangle', label: 'Rectangle', caption: 'Rectangle' },
      { id: 'ellipse', label: 'Circle', caption: 'Circle' },
      { id: 'diamond', label: 'Diamond', caption: 'Diamond' },
      { id: 'arrow', label: 'Arrow', caption: 'Arrow' },
    ],
  },
  {
    id: 'layouts',
    label: 'Layouts',
    description: 'Start with a ready-made arrangement.',
    Icon: LayoutDashboard,
    choices: [
      { id: 'study-card', label: 'Study card', caption: 'Study card' },
      { id: 'flow', label: 'Flow', caption: 'Flow' },
      { id: 'compare', label: 'Compare', caption: 'Compare' },
      { id: 'cornell', label: 'Cornell notes', caption: 'Cornell notes' },
      { id: 'study-board', label: 'Study board', caption: 'Study board' },
      { id: 'mind-map', label: 'Mind map', caption: 'Mind map' },
    ],
  },
];

export function DrawingInsertPalette({
  disabled,
  onInsert,
  target = 'canvas',
}: {
  disabled: boolean;
  onInsert: (id: DrawingPresetId) => void;
  target?: 'canvas' | 'note';
}) {
  const [open, setOpen] = useState<Category | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const category = disabled ? undefined : CATEGORIES.find(({ id }) => id === open);

  function trigger(id: Category) {
    return root.current?.querySelector<HTMLButtonElement>(`[data-insert-category="${id}"]`);
  }

  // Keep the window anchored to its button, outside the editor's scroll clipping.
  useLayoutEffect(() => {
    if (!category || !panel.current) return;
    const element = panel.current;
    const button = trigger(category.id);
    if (!button) return;
    const position = () => {
      const bounds = button.getBoundingClientRect();
      const margin = 12;
      const { width } = element.getBoundingClientRect();
      const height = element.scrollHeight + 2;
      const below = window.innerHeight - bounds.bottom - margin - 8;
      const above = bounds.top - margin - 8;
      const useAbove = below < height && above > below;
      element.style.maxHeight = `${Math.max(0, useAbove ? above : below)}px`;
      element.style.left = `${Math.max(margin, Math.min(bounds.left, window.innerWidth - width - margin))}px`;
      element.style.top = `${useAbove ? Math.max(margin, bounds.top - Math.min(height, above) - 8) : bounds.bottom + 8}px`;
    };
    position();
    element
      .querySelector<HTMLButtonElement>('.drawing-insert-choice')
      ?.focus({ preventScroll: true });
    window.addEventListener('resize', position);
    document.addEventListener('scroll', position, true);
    return () => {
      window.removeEventListener('resize', position);
      document.removeEventListener('scroll', position, true);
    };
  }, [category]);

  useEffect(() => {
    if (!category) return;
    const dismiss = (event: Event) => {
      if (
        !root.current?.contains(event.target as Node) &&
        !panel.current?.contains(event.target as Node)
      )
        setOpen(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(null);
      trigger(category.id)?.focus({ preventScroll: true });
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('focusin', dismiss);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('focusin', dismiss);
      document.removeEventListener('keydown', escape);
    };
  }, [category]);

  return (
    <>
      <div
        ref={root}
        className={`drawing-insert-palette is-${target}`}
        role="toolbar"
        aria-label={target === 'note' ? 'Add to note' : 'Add to drawing'}
      >
        <span className="drawing-insert-intro">
          {target === 'note' ? 'Add to note' : 'Add to canvas'}
        </span>
        <div className="drawing-insert-categories">
          {CATEGORIES.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              className="drawing-insert-trigger"
              data-insert-category={id}
              aria-expanded={category?.id === id}
              aria-haspopup="dialog"
              aria-controls={category?.id === id ? panelId : undefined}
              disabled={disabled}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setOpen((current) => (current === id ? null : id))}
              onKeyDown={(event) => {
                if (event.key !== 'ArrowDown') return;
                event.preventDefault();
                setOpen(id);
                panel.current?.querySelector<HTMLButtonElement>('.drawing-insert-choice')?.focus();
              }}
            >
              <Icon size={17} aria-hidden />
              <span>{label}</span>
              <ChevronDown size={12} className="drawing-insert-chevron" aria-hidden />
            </button>
          ))}
        </div>
        <span className="drawing-insert-help">
          {target === 'note'
            ? 'Click a card to write · ⌘/Ctrl + Enter to continue below'
            : 'Double-click text to edit · Drag to arrange'}
        </span>
      </div>
      {category &&
        createPortal(
          <div
            ref={panel}
            id={panelId}
            className={`drawing-insert-popover is-${category.id}`}
            role="dialog"
            aria-label={category.label}
            onBlur={(event) => {
              if (
                !event.currentTarget.contains(event.relatedTarget) &&
                !root.current?.contains(event.relatedTarget)
              )
                setOpen(null);
            }}
            onKeyDown={(event) => {
              const offsets: Record<string, number> = {
                ArrowRight: 1,
                ArrowLeft: -1,
                ArrowDown: 2,
                ArrowUp: -2,
              };
              if (!(event.key in offsets) && event.key !== 'Home' && event.key !== 'End') return;
              const choices = Array.from(
                panel.current?.querySelectorAll<HTMLButtonElement>('.drawing-insert-choice') ?? [],
              );
              const index = choices.indexOf(document.activeElement as HTMLButtonElement);
              if (index < 0) return;
              event.preventDefault();
              const next =
                event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? choices.length - 1
                    : (index + offsets[event.key]! + choices.length) % choices.length;
              choices[next]?.focus();
            }}
          >
            <div className="drawing-insert-popover-heading">
              <div>
                <strong>{category.label}</strong>
                <p>{category.description}</p>
              </div>
              <button
                type="button"
                className="drawing-insert-close"
                aria-label="Close component picker"
                onClick={() => {
                  setOpen(null);
                  trigger(category.id)?.focus({ preventScroll: true });
                }}
              >
                <X size={15} aria-hidden />
              </button>
            </div>
            <div className="drawing-insert-choices">
              {category.choices.map(({ id, label, caption }) => (
                <button
                  key={id}
                  type="button"
                  className="drawing-insert-choice"
                  aria-label={label}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    setOpen(null);
                    trigger(category.id)?.focus({ preventScroll: true });
                    onInsert(id);
                  }}
                >
                  <span className="drawing-insert-preview">
                    <DrawingPresetPreview id={id} target={target} />
                  </span>
                  <span className="drawing-insert-choice-caption">{caption}</span>
                </button>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
