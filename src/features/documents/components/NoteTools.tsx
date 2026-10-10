import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@tiptap/core';
import { Highlighter, Info, Palette, Plus, Search } from 'lucide-react';
import {
  layoutChoice,
  layoutSummary,
  typographySummary,
} from '@/features/documents/lib/noteAppearance';
import type { NoteStats } from '@/features/documents/lib/noteOutline';
import { useNoteStyleStore } from '@/features/documents/store/noteStyleStore';
import { usePlatformModifier } from '@/hooks/usePlatform';
import { cn } from '@/lib/utils';
import { FocusModeButton } from './FocusModeButton';
import { LayoutGlyph, LayoutPanel, PagePanel, TypographyPanel } from './NoteAppearance';
import { NoteInsertPanel, type InsertTab } from './NoteInsertPanel';
import { NoteTextPanel } from './NoteTextPanel';
import { TextMarkerPanel } from './TextMarkerPanel';

type Panel = 'insert' | 'text' | 'layout' | 'type' | 'page' | 'info' | 'marker';

const TITLES: Record<Panel, string> = {
  insert: 'Insert',
  text: 'Text',
  layout: 'Layout',
  type: 'Typography',
  page: 'Page',
  info: 'Details',
  marker: 'Textmarker',
};
/** Room kept between a popover and the edges of the workspace. */
const EDGE = 12;
/** From the bottom of a button to the popover, with room for its arrow. */
const GAP = 10;

function findTrigger(bar: HTMLElement | null, name: Panel) {
  return bar?.querySelector<HTMLElement>(`[data-panel="${name}"]`) ?? null;
}

/**
 * Sets the popover below its button, kept inside the workspace, with the arrow
 * still pointing at the button. Written straight to the element: it follows
 * layout, not state, and must land before the popover is painted.
 */
function placePopover(host: HTMLElement, button: HTMLElement, popover: HTMLElement) {
  const bounds = host.getBoundingClientRect();
  const anchor = button.getBoundingClientRect();
  const center = anchor.left + anchor.width / 2 - bounds.left;
  const top = anchor.bottom - bounds.top + GAP;
  const width = popover.offsetWidth;
  const left = Math.max(EDGE, Math.min(center - width / 2, bounds.width - width - EDGE));
  popover.style.top = `${top}px`;
  popover.style.left = `${left}px`;
  popover.style.maxHeight = `${Math.max(160, bounds.height - top - EDGE)}px`;
  popover.style.setProperty('--popover-arrow', `${center - left}px`);
}

interface NoteToolsProps {
  editor: Editor | null;
  disabled: boolean;
  onInsertImage: () => void;
  onInsertPdf?: () => void;
  onOpenCanvas: () => void;
  /** Opens the search in the note's overview; absent where there is no overview. */
  onSearch?: (() => void) | undefined;
  readStats: () => NoteStats;
  fileName: string;
  keepsProperties: boolean;
  /**
   * The workspace the popovers open in. They hang below the top bar but are not
   * part of it, so the notebook's desk colours on the bar never reach them.
   */
  host: HTMLElement | null;
}

function Stat({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div>
      <dt>{term}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function DetailsPanel({
  stats,
  fileName,
  keepsProperties,
}: {
  stats: NoteStats;
  fileName: string;
  keepsProperties: boolean;
}) {
  return (
    <div className="note-details-content">
      <dl className="note-details-metrics">
        <Stat term="Words">{stats.words.toLocaleString()}</Stat>
        <Stat term="Reading time">{`${stats.readingMinutes} min`}</Stat>
      </dl>
      <dl className="note-info">
        <Stat term="Characters">{stats.characters.toLocaleString()}</Stat>
        <Stat term="Headings">{stats.headings}</Stat>
        {stats.tasks ? (
          <Stat term="Open tasks">{`${stats.openTasks} of ${stats.tasks}`}</Stat>
        ) : null}
        {stats.images ? <Stat term="Images">{stats.images}</Stat> : null}
        <Stat term="File">
          <span className="note-info-file">{fileName}</span>
        </Stat>
      </dl>
      {keepsProperties && (
        <p className="note-panel-note">The note’s front matter is kept as it is.</p>
      )}
    </div>
  );
}

/**
 * The notes' tools as a quiet row of icons in the top bar: writing first, then
 * how the page looks, then the note itself. Each opens one popover below it at
 * a time; Escape or a click elsewhere closes it and returns focus to its
 * button. Undo and redo keep their shortcuts; the canvas has its own dock.
 */
export function NoteTools({
  editor,
  disabled,
  onInsertImage,
  onInsertPdf,
  onOpenCanvas,
  onSearch,
  readStats,
  fileName,
  keepsProperties,
  host,
}: NoteToolsProps) {
  const { isMac } = usePlatformModifier();
  const id = useId();
  const [open, setOpen] = useState<Panel | null>(null);
  const [insertTab, setInsertTab] = useState<InsertTab>('blocks');
  const bar = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const settings = useNoteStyleStore();
  const layout = layoutChoice(settings.style, settings.layout);
  const notebook = layout === 'notebook';
  // The notebook keeps its own writing toolbar above the pages; the row does
  // not repeat it there.
  const writing = editor && !notebook ? editor : null;
  const stats = open === 'info' ? readStats() : null;
  const layoutText = layoutSummary(layout, settings.width, settings.paper);
  const typeText = typographySummary(settings.font, settings.textSize);
  const shown: Panel | null =
    open &&
    host &&
    ((open !== 'insert' && open !== 'text') || writing) &&
    !(open === 'page' && notebook) &&
    (open !== 'marker' || editor)
      ? open
      : null;

  function dismiss(restoreFocus = false) {
    if (restoreFocus && open) findTrigger(bar.current, open)?.focus();
    setOpen(null);
  }

  useEffect(() => {
    if (!shown) return;
    panel.current?.focus({ preventScroll: true });
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!bar.current?.contains(target) && !panel.current?.contains(target)) setOpen(null);
    };
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      findTrigger(bar.current, shown)?.focus();
      setOpen(null);
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [shown]);

  useLayoutEffect(() => {
    if (!shown || !host) return;
    const measure = () => {
      const button = findTrigger(bar.current, shown);
      if (button && panel.current) placePopover(host, button, panel.current);
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    for (const element of [host, bar.current, panel.current])
      if (element) observer?.observe(element);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [shown, host]);

  /** Arrow keys move between the row's buttons, as in any toolbar. */
  function onBarKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key) || !bar.current) return;
    event.preventDefault();
    const buttons = [...bar.current.querySelectorAll<HTMLElement>('button:not(:disabled)')];
    const index = buttons.indexOf(document.activeElement as HTMLElement);
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? buttons.length - 1
          : (index + (event.key === 'ArrowLeft' ? -1 : 1) + buttons.length) % buttons.length;
    buttons[next]?.focus();
  }

  function toggle(name: Panel) {
    setOpen((current) => (current === name ? null : name));
  }
  /** `current` names the setting in the tooltip, so the row itself stays icons only. */
  function panelButton(name: Panel, label: string, content: ReactNode, current?: string) {
    return (
      <button
        type="button"
        className="note-tool"
        data-panel={name}
        aria-label={label}
        title={current ? `${label}: ${current}` : label}
        aria-expanded={shown === name}
        aria-haspopup="dialog"
        aria-controls={shown === name ? `${id}-panel` : undefined}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => toggle(name)}
      >
        {content}
      </button>
    );
  }

  const popover = shown ? (
    <div
      ref={panel}
      id={`${id}-panel`}
      role="dialog"
      aria-labelledby={`${id}-title`}
      tabIndex={-1}
      className={cn('editor-popover', `is-${shown}`)}
    >
      <header className="editor-popover-heading">
        <h2 id={`${id}-title`}>{TITLES[shown]}</h2>
        {shown === 'insert' && (
          <div
            role="tablist"
            aria-label="Show"
            className="editor-segmented"
            onKeyDown={(event) => {
              if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
              event.preventDefault();
              const next = insertTab === 'blocks' ? 'visuals' : 'blocks';
              setInsertTab(next);
              document.getElementById(`${id}-${next}`)?.focus();
            }}
          >
            {(['blocks', 'visuals'] as const).map((tab) => (
              <button
                key={tab}
                id={`${id}-${tab}`}
                type="button"
                role="tab"
                aria-selected={insertTab === tab}
                aria-controls={`${id}-insert`}
                tabIndex={insertTab === tab ? 0 : -1}
                onClick={() => setInsertTab(tab)}
              >
                {tab === 'blocks' ? 'Blocks' : 'Visuals'}
              </button>
            ))}
          </div>
        )}
      </header>
      <div
        className="editor-popover-content"
        {...(shown === 'insert'
          ? { role: 'tabpanel', id: `${id}-insert`, 'aria-labelledby': `${id}-${insertTab}` }
          : {})}
      >
        {shown === 'insert' && writing && (
          <NoteInsertPanel
            editor={writing}
            disabled={disabled}
            tab={insertTab}
            onImage={onInsertImage}
            onPdf={onInsertPdf}
            onCanvas={onOpenCanvas}
            onClose={() => dismiss()}
          />
        )}
        {shown === 'text' && writing && <NoteTextPanel editor={writing} disabled={disabled} />}
        {shown === 'layout' && <LayoutPanel />}
        {shown === 'type' && <TypographyPanel />}
        {shown === 'page' && <PagePanel />}
        {shown === 'info' && stats && (
          <DetailsPanel stats={stats} fileName={fileName} keepsProperties={keepsProperties} />
        )}
        {shown === 'marker' && <TextMarkerPanel editor={editor} />}
      </div>
    </div>
  ) : null;

  return (
    <>
      <div
        ref={bar}
        className="note-tools"
        role="toolbar"
        aria-label="Page tools"
        onKeyDown={onBarKeyDown}
      >
        {writing && (
          <>
            {panelButton('insert', 'Insert', <Plus size={18} aria-hidden />)}
            {panelButton(
              'text',
              'Format text',
              <span className="note-tool-aa" aria-hidden>
                Aa
              </span>,
            )}
            <span className="note-tools-divider" aria-hidden />
          </>
        )}
        {panelButton(
          'type',
          'Typography',
          <span className="note-tool-ag" data-font={settings.font} aria-hidden>
            Ag
          </span>,
          notebook ? undefined : `${typeText.name}, ${typeText.detail}`,
        )}
        {panelButton(
          'layout',
          'Layout',
          <LayoutGlyph layout={layout} />,
          `${layoutText.name}, ${layoutText.detail}`,
        )}
        {notebook
          ? null
          : panelButton('page', 'Page appearance', <Palette size={17} aria-hidden />)}
        <span className="note-tools-divider" aria-hidden />
        {onSearch ? (
          <button
            type="button"
            className="note-tool"
            aria-label="Search in note"
            aria-keyshortcuts={isMac ? 'Meta+F' : 'Control+F'}
            title={`Search in note (${isMac ? '⌘F' : 'Ctrl+F'})`}
            onClick={() => {
              dismiss();
              onSearch();
            }}
          >
            <Search size={17} aria-hidden />
          </button>
        ) : null}
        {panelButton('info', 'Note details', <Info size={17} aria-hidden />)}
        {editor
          ? panelButton(
              'marker',
              'Textmarker',
              <span className={cn('note-tool-marker', settings.markers && 'is-on')} aria-hidden>
                <Highlighter size={17} />
              </span>,
              settings.markers ? 'On' : 'Off',
            )
          : null}
        <FocusModeButton
          className="note-tool"
          onToggle={() => {
            dismiss();
            editor?.commands.focus();
          }}
        />
      </div>
      {popover && host ? createPortal(popover, host) : null}
    </>
  );
}
