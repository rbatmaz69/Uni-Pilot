import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import type { Editor } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';
import { Focus, Highlighter, Info, Plus, Redo2, Undo2 } from 'lucide-react';
import {
  layoutChoice,
  layoutSummary,
  typographySummary,
} from '@/features/documents/lib/noteAppearance';
import type { NoteStats } from '@/features/documents/lib/noteOutline';
import { useNoteStyleStore } from '@/features/documents/store/noteStyleStore';
import { usePlatformModifier } from '@/hooks/usePlatform';
import { cn } from '@/lib/utils';
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
/** Room kept between a popover and the edges of the editor. */
const EDGE = 12;

/**
 * On the notebook desk the notebook's own dock holds the middle of the bottom
 * edge, so this one lines up beside it, or steps up above its end when the
 * desk is too narrow for both. Written straight to the element, like the popover.
 */
function besideNotebookDock(area: HTMLElement, bar: HTMLElement) {
  const frame = area.parentElement;
  const neighbour = frame?.querySelector<HTMLElement>('.notebook-dock');
  if (!frame || !neighbour) return;
  const bounds = area.getBoundingClientRect();
  const other = neighbour.getBoundingClientRect();
  const rail = frame.querySelector<HTMLElement>('.notebook-page-rail');
  const limit = (rail ? rail.getBoundingClientRect().left : bounds.right) - bounds.left - EDGE;
  const beside = other.right - bounds.left + 8;
  const fits = beside + bar.offsetWidth <= limit;
  const start = fits ? beside : other.right - bounds.left - bar.offsetWidth;
  area.style.paddingLeft = `${Math.max(EDGE, start)}px`;
  area.classList.toggle('is-stacked', !fits);
}

function findTrigger(bar: HTMLElement | null, name: Panel) {
  return bar?.querySelector<HTMLElement>(`[data-panel="${name}"]`) ?? null;
}

/**
 * Sets the popover above its button, kept inside the editor, with the arrow
 * still pointing at the button. Written straight to the element: it follows
 * layout, not state, and must land before the popover is painted.
 */
function placePopover(area: HTMLElement, button: HTMLElement, popover: HTMLElement) {
  const bounds = area.getBoundingClientRect();
  const anchor = button.getBoundingClientRect();
  const center = anchor.left + anchor.width / 2 - bounds.left;
  const width = popover.offsetWidth;
  const left = Math.max(EDGE, Math.min(center - width / 2, bounds.width - width - EDGE));
  popover.style.left = `${left}px`;
  popover.style.setProperty('--popover-arrow', `${center - left}px`);
}

interface EditorDockProps {
  editor: Editor | null;
  disabled: boolean;
  onInsertImage: () => void;
  onOpenCanvas: () => void;
  readStats: () => NoteStats;
  fileName: string;
  keepsProperties: boolean;
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
 * The editor's tools in one bar that floats at the bottom of the page, like a
 * design tool's: writing tools first, then how the page looks, then the note
 * itself. Each group opens one popover above the bar at a time; Escape or a
 * click elsewhere closes it and returns focus to its button.
 */
export function EditorDock({
  editor,
  disabled,
  onInsertImage,
  onOpenCanvas,
  readStats,
  fileName,
  keepsProperties,
}: EditorDockProps) {
  const { isMac } = usePlatformModifier();
  const id = useId();
  const [open, setOpen] = useState<Panel | null>(null);
  const [insertTab, setInsertTab] = useState<InsertTab>('blocks');
  const root = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const settings = useNoteStyleStore();
  const layout = layoutChoice(settings.style, settings.layout);
  const notebook = layout === 'notebook';
  // The notebook keeps its own writing toolbar above the pages; the dock
  // does not repeat it there.
  const writing = editor && !notebook ? editor : null;
  const history = useEditorState({
    editor: writing,
    selector: ({ editor: current }) => ({
      undo: Boolean(current?.can().undo()),
      redo: Boolean(current?.can().redo()),
    }),
  });
  const editable = Boolean(writing?.isEditable) && !disabled;
  const stats = open === 'info' ? readStats() : null;
  const layoutText = layoutSummary(layout, settings.width, settings.paper);
  const typeText = typographySummary(settings.font, settings.textSize);
  const shown: Panel | null =
    open &&
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
      if (!root.current?.contains(event.target as Node)) setOpen(null);
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
    if (!shown) return;
    const measure = () => {
      const button = findTrigger(bar.current, shown);
      if (root.current && button && panel.current)
        placePopover(root.current, button, panel.current);
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    for (const element of [root.current, bar.current, panel.current])
      if (element) observer?.observe(element);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [shown]);

  useLayoutEffect(() => {
    const area = root.current;
    const frame = area?.parentElement;
    if (!notebook || !area || !bar.current || !frame) return;
    const place = () => {
      if (bar.current) besideNotebookDock(area, bar.current);
    };
    place();
    // The notebook's dock moves when its page thumbnails open, and the book resizes with it.
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(place);
    for (const element of [
      area,
      bar.current,
      ...frame.querySelectorAll('.notebook-dock, .notebook-book'),
    ])
      observer?.observe(element);
    return () => {
      observer?.disconnect();
      area.style.paddingLeft = '';
      area.classList.remove('is-stacked');
    };
  }, [notebook]);

  /** Arrow keys move between the dock's buttons, as in any toolbar. */
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
  /** `current` names the setting in the tooltip; `valued` makes room for it on the button. */
  function panelButton(
    name: Panel,
    label: string,
    content: ReactNode,
    current?: string,
    valued = current !== undefined,
  ) {
    return (
      <button
        type="button"
        className={cn('editor-dock-button', valued && 'has-value')}
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
  function value(name: string, detail: string) {
    return (
      <span className="editor-dock-value" aria-hidden>
        <span>{name}</span>
        <small>{detail}</small>
      </span>
    );
  }

  return (
    <div ref={root} className="editor-dock-area">
      {shown && (
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
      )}
      <div
        ref={bar}
        className={cn('editor-dock', notebook && 'is-compact')}
        role="toolbar"
        aria-label="Page tools"
        onKeyDown={onBarKeyDown}
      >
        {writing && (
          <>
            {panelButton('insert', 'Insert', <Plus size={19} aria-hidden />)}
            {panelButton(
              'text',
              'Format text',
              <span className="editor-dock-aa" aria-hidden>
                Aa
              </span>,
            )}
            <button
              type="button"
              className="editor-dock-button is-history"
              aria-label="Undo"
              title={`Undo (${isMac ? '⌘Z' : 'Ctrl+Z'})`}
              disabled={!editable || !history?.undo}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => writing.chain().focus().undo().run()}
            >
              <Undo2 size={17} aria-hidden />
            </button>
            <button
              type="button"
              className="editor-dock-button is-history"
              aria-label="Redo"
              title={`Redo (${isMac ? '⇧⌘Z' : 'Ctrl+Shift+Z'})`}
              disabled={!editable || !history?.redo}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => writing.chain().focus().redo().run()}
            >
              <Redo2 size={17} aria-hidden />
            </button>
            <span className="editor-dock-divider" aria-hidden />
          </>
        )}
        {panelButton(
          'layout',
          'Layout',
          <>
            <LayoutGlyph layout={layout} />
            {value(layoutText.name, layoutText.detail)}
          </>,
          `${layoutText.name}, ${layoutText.detail}`,
        )}
        {panelButton(
          'type',
          'Typography',
          <>
            <span className="editor-dock-ag" data-font={settings.font} aria-hidden>
              Ag
            </span>
            {notebook ? null : value(typeText.name, typeText.detail)}
          </>,
          notebook ? undefined : `${typeText.name}, ${typeText.detail}`,
        )}
        {notebook
          ? null
          : panelButton(
              'page',
              'Page appearance',
              <span
                className="editor-dock-page"
                data-backdrop={layout === 'full' ? 'none' : settings.backdrop}
                aria-hidden
              >
                <span className={`note-tone-swatch is-${settings.tone}`}>
                  {settings.cover === 'none' ? null : (
                    <span className={`note-cover-swatch is-${settings.cover}`} />
                  )}
                </span>
              </span>,
            )}
        <span className="editor-dock-divider" aria-hidden />
        {panelButton('info', 'Note details', <Info size={18} aria-hidden />)}
        {editor
          ? panelButton(
              'marker',
              'Textmarker',
              <span className={cn('editor-dock-marker', settings.markers && 'is-on')} aria-hidden>
                <Highlighter size={18} />
              </span>,
              settings.markers ? 'On' : 'Off',
              false,
            )
          : null}
        <button
          type="button"
          className="editor-dock-button"
          aria-label="Focus mode"
          aria-keyshortcuts={isMac ? 'Meta+Shift+F' : 'Control+Shift+F'}
          title={`Focus mode (${isMac ? '⇧⌘F' : 'Ctrl+Shift+F'})`}
          aria-pressed={settings.focus}
          onClick={() => {
            dismiss();
            settings.toggleFocus();
            editor?.commands.focus();
          }}
        >
          <Focus size={18} aria-hidden />
        </button>
      </div>
    </div>
  );
}
