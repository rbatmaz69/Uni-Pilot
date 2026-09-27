import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { Editor } from '@tiptap/core';
import { BookOpen, Focus, Info, Paintbrush, Plus, X } from 'lucide-react';
import { NOTE_FONTS, type PageFont } from '@/features/documents/lib/noteFonts';
import type { NoteStats } from '@/features/documents/lib/noteOutline';
import {
  useNoteStyleStore,
  type BoldTextColor,
  type LineSpacing,
  type PageBackdrop,
  type PageCover,
  type PageTone,
  type PageWidth,
  type TextSize,
} from '@/features/documents/store/noteStyleStore';
import { usePlatformModifier } from '@/hooks/usePlatform';
import { cn } from '@/lib/utils';
import { NoteInsertPanel } from './NoteInsertPanel';
import { NoteToolbar } from './NoteToolbar';
import { OptionGroup, type Option } from './OptionGroup';

type Panel = 'insert' | 'format' | 'style' | 'info';
type PageLayoutChoice = 'pages' | 'card' | 'full' | 'notebook';
const FONTS: Option<PageFont>[] = NOTE_FONTS.map(({ value, label }) => ({
  value,
  label,
  preview: (
    <span className="note-font-preview" data-font={value}>
      Ag
    </span>
  ),
}));
const TEXT_SIZES: Option<TextSize>[] = (
  [
    ['s', 'Small'],
    ['m', 'Medium'],
    ['l', 'Large'],
    ['xl', 'X-Large'],
  ] as const
).map(([value, label]) => ({
  value,
  label,
  preview: <span className={`note-size-preview is-${value}`}>A</span>,
}));
const LINE_SPACINGS: Option<LineSpacing>[] = (['compact', 'normal', 'relaxed'] as const).map(
  (value) => ({
    value,
    label: value.charAt(0).toUpperCase() + value.slice(1),
    preview: <span className={`note-spacing-preview is-${value}`} />,
  }),
);
const WIDTHS: Option<PageWidth>[] = [
  { value: 'narrow', label: 'Narrow' },
  { value: 'normal', label: 'Normal' },
  { value: 'wide', label: 'Wide' },
];
const BACKDROPS: Option<PageBackdrop>[] = (['none', 'paper', 'dots', 'calm'] as const).map(
  (value) => ({
    value,
    label: value === 'none' ? 'None' : value.charAt(0).toUpperCase() + value.slice(1),
    preview: <span className={`note-swatch is-${value}`} />,
  }),
);
const LAYOUTS: Option<PageLayoutChoice>[] = [
  { value: 'pages', label: 'Pages', preview: <span className="note-layout-preview is-pages" /> },
  { value: 'card', label: 'Pageless', preview: <span className="note-layout-preview is-card" /> },
  { value: 'full', label: 'Full width', preview: <span className="note-layout-preview is-full" /> },
  { value: 'notebook', label: 'Notebook', preview: <BookOpen size={22} /> },
];
const TONES: Option<PageTone>[] = [
  { value: 'default', label: 'Theme', preview: <span className="note-tone-swatch is-default" /> },
  { value: 'warm', label: 'Ivory', preview: <span className="note-tone-swatch is-warm" /> },
  { value: 'contrast', label: 'Slate', preview: <span className="note-tone-swatch is-contrast" /> },
];
const COVERS: Option<PageCover>[] = (['none', 'sage', 'dune', 'blue'] as const).map((value) => ({
  value,
  label: value === 'none' ? 'None' : value.charAt(0).toUpperCase() + value.slice(1),
  preview: <span className={`note-cover-swatch is-${value}`} />,
}));
const BOLD_COLORS: Option<BoldTextColor>[] = (['default', 'blue', 'teal', 'rose'] as const).map(
  (value) => ({
    value,
    label: value.charAt(0).toUpperCase() + value.slice(1),
    preview: <span className={`note-bold-preview is-${value}`}>B</span>,
  }),
);
const PANELS: Record<Panel, { title: string; label: string; description: string }> = {
  insert: {
    title: 'Insert',
    label: 'Insert content',
    description: 'Build a note that works for you.',
  },
  format: {
    title: 'Format',
    label: 'Format text',
    description: 'Format your text and organise ideas.',
  },
  style: {
    title: 'Page style',
    label: 'Page style',
    description: 'Make space for your best thinking.',
  },
  info: { title: 'Note details', label: 'Note info', description: 'Your writing, at a glance.' },
};
interface PageRailProps {
  editor: Editor | null;
  disabled: boolean;
  onInsertImage: () => void;
  onOpenCanvas: () => void;
  readStats: () => NoteStats;
  fileName: string;
  keepsProperties: boolean;
}
function Row({ term, children }: { term: string; children: ReactNode }) {
  return (
    <>
      <dt>{term}</dt>
      <dd>{children}</dd>
    </>
  );
}

/** One quiet rail keeps the writing surface clear, with a single panel open at a time. */
export function PageRail({
  editor,
  disabled,
  onInsertImage,
  onOpenCanvas,
  readStats,
  fileName,
  keepsProperties,
}: PageRailProps) {
  const { isMac } = usePlatformModifier();
  const id = useId();
  const [open, setOpen] = useState<Panel | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const settings = useNoteStyleStore();
  const layout: PageLayoutChoice = settings.style === 'notebook' ? 'notebook' : settings.layout;
  const stats = open === 'info' ? readStats() : null;

  function dismiss(restoreFocus = false) {
    if (restoreFocus && open)
      root.current?.querySelector<HTMLElement>(`[data-panel="${open}"]`)?.focus();
    setOpen(null);
  }
  useEffect(() => {
    if (!open) return;
    panel.current?.focus({ preventScroll: true });
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      root.current?.querySelector<HTMLElement>(`[data-panel="${open}"]`)?.focus();
      setOpen(null);
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  function chooseLayout(choice: PageLayoutChoice) {
    if (choice === 'notebook') settings.setStyle('notebook');
    else {
      settings.setStyle('standard');
      settings.setLayout(choice);
    }
  }
  function railButton(name: Panel, label: string, icon: ReactNode) {
    return (
      <button
        type="button"
        className="note-rail-button"
        data-panel={name}
        aria-label={label}
        title={label}
        aria-expanded={open === name}
        aria-haspopup="dialog"
        aria-controls={open === name ? `${id}-panel` : undefined}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setOpen((current) => (current === name ? null : name))}
      >
        {icon}
        <span className="note-rail-caption" aria-hidden>
          {name === 'info' ? 'Details' : name.charAt(0).toUpperCase() + name.slice(1)}
        </span>
      </button>
    );
  }
  return (
    <div ref={root} className="note-rail-area">
      <nav className="note-rail" aria-label="Page tools">
        {editor && (
          <>
            {railButton('insert', 'Insert block', <Plus size={18} aria-hidden />)}
            {railButton(
              'format',
              'Format text',
              <span className="note-rail-aa" aria-hidden>
                Aa
              </span>,
            )}
          </>
        )}
        {railButton('style', 'Page style', <Paintbrush size={17} aria-hidden />)}
        {railButton('info', 'Note info', <Info size={17} aria-hidden />)}
        <span className="note-rail-divider" aria-hidden />
        <button
          type="button"
          className="note-rail-button"
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
          <Focus size={17} aria-hidden />
          <span className="note-rail-caption" aria-hidden>
            Focus
          </span>
        </button>
      </nav>
      {open && (
        <div
          ref={panel}
          id={`${id}-panel`}
          role="dialog"
          aria-label={PANELS[open].label}
          tabIndex={-1}
          className={cn('note-panel', `is-${open}`)}
        >
          <div className="note-panel-heading">
            <div>
              <h2>{PANELS[open].title}</h2>
              <p>{PANELS[open].description}</p>
            </div>
            <button
              type="button"
              aria-label="Close panel"
              title="Close (Esc)"
              onClick={() => dismiss(true)}
            >
              <X size={16} aria-hidden />
            </button>
          </div>
          <div className="note-panel-content">
            {open === 'insert' && editor && (
              <NoteInsertPanel
                editor={editor}
                disabled={disabled}
                onImage={onInsertImage}
                onCanvas={onOpenCanvas}
                onClose={() => dismiss()}
              />
            )}
            {open === 'format' && editor && (
              <NoteToolbar editor={editor} disabled={disabled} presentation="panel" />
            )}
            {open === 'style' && (
              <div className="note-style-content">
                <div
                  className="note-style-preview"
                  data-backdrop={settings.backdrop}
                  data-tone={layout === 'notebook' ? 'default' : settings.tone}
                  data-font={settings.font}
                  data-layout={layout}
                  data-bold-color={settings.boldColor}
                  aria-hidden="true"
                >
                  <div className="note-style-preview-sheet">
                    {settings.cover !== 'none' && (
                      <div className={`note-cover-swatch is-${settings.cover}`} />
                    )}
                    <div className="note-style-preview-title">A fresh perspective</div>
                    <p className="note-style-preview-copy">
                      Keep the context. <strong>Bold the insight.</strong>{' '}
                      <mark>Highlight the essential.</mark>
                    </p>
                    <span />
                  </div>
                </div>
                <OptionGroup
                  label="Page layout"
                  options={LAYOUTS}
                  value={layout}
                  onChange={chooseLayout}
                />
                {layout !== 'notebook' && (
                  <>
                    <OptionGroup
                      label="Font"
                      options={FONTS}
                      value={settings.font}
                      onChange={settings.setFont}
                      columns={4}
                    />
                    <p className="note-panel-note">
                      {NOTE_FONTS.find((font) => font.value === settings.font)?.description}
                    </p>
                    <OptionGroup
                      label="Text size"
                      options={TEXT_SIZES}
                      value={settings.textSize}
                      onChange={settings.setTextSize}
                    />
                    <OptionGroup
                      label="Line spacing"
                      options={LINE_SPACINGS}
                      value={settings.lineSpacing}
                      onChange={settings.setLineSpacing}
                    />
                    <OptionGroup
                      label="Width"
                      options={WIDTHS}
                      value={settings.width}
                      onChange={settings.setWidth}
                    />
                  </>
                )}
                <OptionGroup
                  label="Bold text color"
                  options={BOLD_COLORS}
                  value={settings.boldColor}
                  onChange={settings.setBoldColor}
                />
                <p className="note-panel-note">
                  Make bold passages stand out. Applies to all notes without changing their content.
                </p>
                {layout === 'notebook' ? (
                  <p className="note-panel-note">
                    The notebook has its own paper, pages and sounds in the dock below it.
                  </p>
                ) : (
                  <>
                    <OptionGroup
                      label="Page colour"
                      options={TONES}
                      value={settings.tone}
                      onChange={settings.setTone}
                    />
                    <OptionGroup
                      label="Cover"
                      options={COVERS}
                      value={settings.cover}
                      onChange={settings.setCover}
                    />
                    <OptionGroup
                      label="Backdrop"
                      options={BACKDROPS}
                      value={settings.backdrop}
                      onChange={settings.setBackdrop}
                    />
                    <p className="note-panel-note">Your appearance settings apply to all notes.</p>
                  </>
                )}
              </div>
            )}
            {open === 'info' && stats && (
              <div className="note-details-content">
                <div className="note-details-metrics">
                  <div>
                    <strong>{stats.words.toLocaleString()}</strong>
                    <span>words written</span>
                  </div>
                  <div>
                    <strong>
                      {stats.readingMinutes}
                      <small> min</small>
                    </strong>
                    <span>to read</span>
                  </div>
                </div>
                <dl className="note-info">
                  <Row term="Words">{stats.words.toLocaleString()}</Row>
                  <Row term="Characters">{stats.characters.toLocaleString()}</Row>
                  <Row term="Reading time">{`${stats.readingMinutes} min`}</Row>
                  <Row term="Headings">{stats.headings}</Row>
                  {stats.tasks ? (
                    <Row term="Open tasks">{`${stats.openTasks} of ${stats.tasks}`}</Row>
                  ) : null}
                  {stats.images ? <Row term="Images">{stats.images}</Row> : null}
                  <Row term="File">
                    <span className="note-info-file">{fileName}</span>
                  </Row>
                </dl>
                {keepsProperties && (
                  <p className="note-panel-note">Your document properties are preserved.</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
