import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import type { Editor } from '@tiptap/core';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';
import { useEditorState } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import {
  Table2,
  RemoveFormatting,
  Quote,
  ListCollapse,
  Minus,
  Bold,
  Check,
  ChevronDown,
  Code,
  Highlighter,
  Italic,
  Link2,
  Link2Off,
  Strikethrough,
  Underline,
} from 'lucide-react';
import { activeBlockType, BLOCK_TYPES, turnInto } from '@/features/documents/lib/blockTypes';
import { normaliseHref } from '@/features/documents/lib/links';
import { usePlatformModifier } from '@/hooks/usePlatform';
import { cn } from '@/lib/utils';
import { TableTools } from './TableTools';
import { TableSizePicker } from './TableSizePicker';
import { NOTE_COLORS } from '@/features/documents/lib/noteColors';
import {
  insertAfterSelection,
  insertSelectionTable,
  wrapSelection,
} from '@/features/documents/lib/selectionActions';

interface Tool {
  label: string;
  /** Tiptap's default binding, with `Mod` for ⌘ or Ctrl. */
  keys?: string;
  icon: ReactNode;
  active?: boolean;
  run: (event: MouseEvent<HTMLButtonElement>) => void;
  popup?: 'menu' | 'dialog';
  expanded?: boolean;
  controls?: string;
}

function shortcutHint(keys: string, isMac: boolean) {
  const names: Record<string, string> = isMac
    ? { Mod: '⌘', Alt: '⌥', Shift: '⇧' }
    : { Mod: 'Ctrl', Alt: 'Alt', Shift: 'Shift' };
  return keys
    .split('-')
    .map((key) => names[key] ?? key.toUpperCase())
    .join(isMac ? '' : '+');
}

function ariaShortcut(keys: string, isMac: boolean) {
  return keys
    .split('-')
    .map((key) => (key === 'Mod' ? (isMac ? 'Meta' : 'Control') : key.toUpperCase()))
    .join('+');
}

const ICON = 15;
const TABLE_QUICK_COLORS = [
  { id: 'neutral', label: 'No accent' },
  { id: 'blue', label: 'Blue' },
  { id: 'green', label: 'Green' },
  { id: 'yellow', label: 'Yellow' },
  { id: 'pink', label: 'Pink' },
] as const;

/** The table the cursor is in, so its tools float above the table, not over the row being typed. */
function tableAnchor(editor: Editor) {
  const { selection } = editor.state;
  const { $from } = selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type.name !== 'table') continue;
    const element = editor.view.nodeDOM($from.before(depth));
    const table =
      element instanceof HTMLElement ? (element.closest('.tableWrapper') ?? element) : null;
    if (!table) return null;
    return {
      getBoundingClientRect: () => table.getBoundingClientRect(),
      getClientRects: () => [table.getBoundingClientRect()],
    };
  }
  return null;
}

/** Keep the table-level menu above the table, but let text selections use their native range. */
function selectionAnchor(editor: Editor) {
  const { selection } = editor.state;
  if (selection instanceof TextSelection && !selection.empty) return null;
  return tableAnchor(editor);
}

interface SelectionMenuProps {
  editor: Editor;
  /** The element the page scrolls in, so the menu follows the text. */
  scrollTarget: HTMLElement | null;
}

/**
 * Formatting that appears where you select text, like Craft's and Notion's
 * selection toolbar. It keeps the WAI-ARIA toolbar pattern of the fixed
 * toolbar it replaces — one Tab stop, arrow keys between tools — and is
 * reachable from the keyboard with Alt+F10.
 */
export function SelectionMenu({ editor, scrollTarget }: SelectionMenuProps) {
  const { isMac } = usePlatformModifier();
  const [mode, setMode] = useState<'tools' | 'turn' | 'link' | 'table' | 'insertTable' | 'color'>(
    'tools',
  );
  const colorPaletteId = useId();
  const [href, setHref] = useState('');
  const [focused, setFocused] = useState(0);
  const [tablePopover, setTablePopover] = useState<{
    side: 'above' | 'below';
    height: number;
    left: number;
  }>({ side: 'below', height: 620, left: 0 });
  const toolbar = useRef<HTMLDivElement>(null);
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      block: activeBlockType(current).id,
      bold: current.isActive('bold'),
      italic: current.isActive('italic'),
      underline: current.isActive('underline'),
      strike: current.isActive('strike'),
      highlight: current.isActive('highlight'),
      color: String(current.getAttributes('textColor').color ?? ''),
      highlightColor: String(current.getAttributes('highlight').color ?? 'yellow'),
      code: current.isActive('code'),
      link: current.isActive('link'),
      linkHref: String(current.getAttributes('link').href ?? ''),
      inTable: current.isActive('table'),
      tableTone: String(current.getAttributes('table').tone ?? 'neutral'),
      textSelected:
        current.state.selection instanceof TextSelection && !current.state.selection.empty,
    }),
  });
  const chain = () => editor.chain().focus(undefined, { scrollIntoView: false });
  const block = BLOCK_TYPES.find((type) => type.id === state.block) ?? BLOCK_TYPES[0];
  const tableContext = state.inTable && !state.textSelected;

  const marks: Tool[] = [
    {
      label: 'Insert table',
      icon: <Table2 size={ICON} />,
      run: (event) => openPanel('insertTable', event.currentTarget),
    },
    {
      label: 'Bold',
      keys: 'Mod-B',
      icon: <Bold size={ICON} />,
      active: state.bold,
      run: () => chain().toggleBold().run(),
    },
    {
      label: 'Italic',
      keys: 'Mod-I',
      icon: <Italic size={ICON} />,
      active: state.italic,
      run: () => chain().toggleItalic().run(),
    },
    {
      label: 'Underline',
      keys: 'Mod-U',
      icon: <Underline size={ICON} />,
      active: state.underline,
      run: () => chain().toggleUnderline().run(),
    },
    {
      label: 'Strikethrough',
      keys: 'Mod-Shift-S',
      icon: <Strikethrough size={ICON} />,
      active: state.strike,
      run: () => chain().toggleStrike().run(),
    },
    {
      label: 'Inline code',
      keys: 'Mod-E',
      icon: <Code size={ICON} />,
      active: state.code,
      run: () => chain().toggleCode().run(),
    },
    {
      label: state.link ? 'Edit link' : 'Link',
      keys: 'Mod-K',
      icon: <Link2 size={ICON} />,
      active: state.link,
      run: () => {
        setHref(state.linkHref);
        setMode('link');
      },
    },
    {
      label: 'Text and background color',
      icon: (
        <span className="note-bubble-color-trigger-icon" aria-hidden="true">
          <Highlighter size={ICON} />
          <ChevronDown size={10} />
        </span>
      ),
      active: Boolean(state.color) || state.highlight,
      popup: 'menu',
      expanded: mode === 'color',
      controls: colorPaletteId,
      run: (event) => openPanel('color', event.currentTarget),
    },
    {
      label: 'Clear formatting',
      icon: <RemoveFormatting size={ICON} />,
      run: () => chain().unsetAllMarks().run(),
    },
  ];
  const tools: Tool[] = state.textSelected ? marks : [];
  const hasTurn = state.textSelected;
  const toolCount = tableContext ? TABLE_QUICK_COLORS.length + 1 : tools.length + Number(hasTurn);
  const tabStop = focused < toolCount ? focused : 0;

  // ⌘K / Ctrl+K on selected text opens the link field, as in most editors.
  useEffect(() => {
    const dom = editor.view.dom;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k') return;
      if (editor.state.selection.empty || !editor.isEditable) return;
      event.preventDefault();
      setHref(String(editor.getAttributes('link').href ?? ''));
      setMode('link');
    };
    dom.addEventListener('keydown', onKey);
    return () => dom.removeEventListener('keydown', onKey);
  }, [editor]);

  useEffect(() => {
    let previous = editor.state.selection;
    const closeStaleMode = () => {
      const selection = editor.state.selection;
      if (!selection.eq(previous)) setMode('tools');
      previous = selection;
      const textSelected = selection instanceof TextSelection && !selection.empty;
      const tableContext = editor.isActive('table') && !textSelected;
      setMode((current) => {
        if (current === 'table' && !tableContext) return 'tools';
        if (
          (current === 'turn' ||
            current === 'link' ||
            current === 'color' ||
            current === 'insertTable') &&
          !textSelected
        )
          return 'tools';
        return current;
      });
    };
    editor.on('selectionUpdate', closeStaleMode);
    return () => {
      editor.off('selectionUpdate', closeStaleMode);
    };
  }, [editor]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (editor.isDestroyed) return;
      editor.commands.setMeta('bubbleMenu', 'updatePosition');
      if (mode === 'insertTable')
        toolbar.current?.querySelector<HTMLElement>('[role="gridcell"][tabindex="0"]')?.focus();
      else if (mode === 'color')
        toolbar.current
          ?.querySelector<HTMLElement>('.note-color-popover [aria-checked="true"]')
          ?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [editor, mode]);

  function applyLink() {
    const target = normaliseHref(href);
    const link = chain().extendMarkRange('link');
    (target ? link.setLink({ href: target }) : link.unsetLink()).run();
    setMode('tools');
  }

  function openPanel(next: 'table' | 'insertTable' | 'turn' | 'color', trigger: HTMLElement) {
    if (mode === next) {
      setMode('tools');
      return;
    }
    const bounds = trigger.closest('.note-bubble-bar')?.getBoundingClientRect();
    const triggerBounds = trigger.getBoundingClientRect();
    const above = Math.max(0, (bounds?.top ?? 0) - 12);
    const below = Math.max(0, window.innerHeight - (bounds?.bottom ?? 0) - 12);
    const side =
      next === 'color'
        ? below >= 360 || below >= above
          ? 'below'
          : 'above'
        : below >= 400 || below >= above
          ? 'below'
          : 'above';
    const left =
      next === 'color'
        ? Math.max(
            0,
            Math.min(
              triggerBounds.left - (bounds?.left ?? 0),
              window.innerWidth - (bounds?.left ?? 0) - 248,
            ),
          )
        : 0;
    setTablePopover({
      side,
      height: Math.max(120, Math.min(620, side === 'below' ? below : above)),
      left,
    });
    setMode(next);
  }

  function moveFocus(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      setMode('tools');
      editor.commands.focus(undefined, { scrollIntoView: false });
      if (mode === 'tools') editor.commands.setMeta('bubbleMenu', 'hide');
      return;
    }
    if (mode === 'link' || mode === 'table' || mode === 'insertTable') return;
    const verticalMenu = mode === 'turn' || mode === 'color';
    const selector = verticalMenu ? '[role="menuitemradio"]' : 'button[data-tool]';
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>(selector));
    const index = buttons.findIndex((button) => button === document.activeElement);
    if (index < 0) return;
    const forward = verticalMenu ? 'ArrowDown' : 'ArrowRight';
    const backward = verticalMenu ? 'ArrowUp' : 'ArrowLeft';
    const target =
      event.key === forward
        ? buttons[(index + 1) % buttons.length]
        : event.key === backward
          ? buttons[(index - 1 + buttons.length) % buttons.length]
          : event.key === 'Home'
            ? buttons[0]
            : event.key === 'End'
              ? buttons.at(-1)
              : undefined;
    if (!target) return;
    event.preventDefault();
    target.focus();
  }

  return (
    <BubbleMenu
      editor={editor}
      updateDelay={60}
      ref={toolbar}
      className="note-bubble"
      appendTo={() => document.body}
      options={{
        strategy: 'fixed',
        placement: 'bottom-start',
        flip: { padding: 10, boundary: scrollTarget ?? undefined },
        shift: { padding: 10 },
        hide: scrollTarget ? { boundary: scrollTarget } : false,
        offset: 10,
        scrollTarget: scrollTarget ?? window,
        onHide: () => setMode('tools'),
      }}
      getReferencedVirtualElement={() => selectionAnchor(editor)}
      shouldShow={({ editor: current, element, view, state: editorState, from, to }) => {
        if (!current.isEditable) return false;
        const anchor = document.getSelection()?.anchorNode;
        if (anchor?.parentElement?.closest('.study-pdf-text')) return false;
        if (!view.hasFocus() && !element.contains(document.activeElement)) return false;
        const textSelected =
          editorState.selection instanceof TextSelection && !editorState.selection.empty;
        if (current.isActive('table') && !textSelected) return true;
        if (!textSelected || editorState.selection instanceof NodeSelection) return false;
        if (current.isActive('codeBlock')) return false;
        return editorState.doc.textBetween(from, to, ' ').trim().length > 0;
      }}
    >
      <div
        role="toolbar"
        aria-label="Formatting"
        aria-orientation="horizontal"
        className="note-bubble-bar"
        onKeyDown={moveFocus}
        // Keep the text selection the commands apply to.
        onMouseDown={(event) => {
          if (!(event.target instanceof HTMLInputElement)) event.preventDefault();
        }}
      >
        {mode === 'link' ? (
          <form
            className="note-bubble-link"
            onSubmit={(event) => {
              event.preventDefault();
              applyLink();
            }}
          >
            <input
              // The field replaces the button just pressed, so focus moves into it.
              autoFocus
              aria-label="Link address"
              placeholder="Paste or type a link"
              value={href}
              onChange={(event) => setHref(event.target.value)}
            />
            <button
              type="submit"
              className="note-bubble-tool"
              aria-label="Apply link"
              title="Apply link (↩)"
            >
              <Check size={ICON} />
            </button>
            {state.link ? (
              <button
                type="button"
                className="note-bubble-tool"
                aria-label="Remove link"
                title="Remove link"
                onClick={() => {
                  chain().extendMarkRange('link').unsetLink().run();
                  setMode('tools');
                }}
              >
                <Link2Off size={ICON} />
              </button>
            ) : null}
          </form>
        ) : tableContext ? (
          <div className="note-bubble-table-controls" role="group" aria-label="Table controls">
            <button
              type="button"
              data-tool
              className="note-bubble-table-trigger"
              aria-label="Table options"
              aria-haspopup="dialog"
              aria-expanded={mode === 'table'}
              tabIndex={tabStop === 0 ? 0 : -1}
              onFocus={() => setFocused(0)}
              onClick={(event) => openPanel('table', event.currentTarget)}
            >
              <span className="note-bubble-table-preview" aria-hidden>
                <i />
                <i />
                <i />
                <i />
              </span>
              Table options
              <ChevronDown size={13} aria-hidden />
            </button>
            <span className="note-bubble-divider" aria-hidden />
            <span className="note-bubble-table-label">Accent</span>
            {TABLE_QUICK_COLORS.map(({ id, label }, index) => (
              <button
                type="button"
                key={id}
                data-tool
                className={cn(
                  'note-bubble-table-swatch',
                  `is-${id}`,
                  state.tableTone === id && 'is-active',
                )}
                aria-label={`Quick ${label.toLowerCase()} table accent`}
                aria-pressed={state.tableTone === id}
                title={label}
                tabIndex={tabStop === index + 1 ? 0 : -1}
                onFocus={() => setFocused(index + 1)}
                onClick={() => chain().updateAttributes('table', { tone: id }).run()}
              />
            ))}
          </div>
        ) : (
          <>
            {hasTurn ? (
              <>
                <button
                  type="button"
                  data-tool
                  className="note-bubble-turn"
                  aria-haspopup="menu"
                  aria-expanded={mode === 'turn'}
                  aria-label={`Turn into, currently ${block?.label}`}
                  title="Turn into"
                  tabIndex={tabStop === 0 ? 0 : -1}
                  onFocus={() => setFocused(0)}
                  onClick={(event) => {
                    openPanel('turn', event.currentTarget);
                    requestAnimationFrame(() =>
                      toolbar.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus(),
                    );
                  }}
                >
                  {block?.label}
                  <ChevronDown size={13} />
                </button>
                <span className="note-bubble-divider" aria-hidden />
              </>
            ) : null}
            {tools.map((tool, index) => {
              const position = index + Number(hasTurn);
              return (
                <button
                  key={tool.label}
                  type="button"
                  data-tool
                  aria-label={tool.label}
                  aria-pressed={tool.active}
                  aria-haspopup={tool.popup}
                  aria-expanded={tool.expanded}
                  aria-controls={tool.controls}
                  aria-keyshortcuts={tool.keys ? ariaShortcut(tool.keys, isMac) : undefined}
                  title={
                    tool.keys ? `${tool.label} (${shortcutHint(tool.keys, isMac)})` : tool.label
                  }
                  tabIndex={position === tabStop ? 0 : -1}
                  className={cn('note-bubble-tool', tool.active && 'is-active')}
                  onFocus={() => setFocused(position)}
                  onClick={tool.run}
                >
                  {tool.icon}
                </button>
              );
            })}
          </>
        )}
        {mode === 'turn' ? (
          <div
            role="menu"
            aria-label="Turn into"
            className={cn('note-bubble-menu', tablePopover.side === 'above' && 'is-above')}
            style={{ maxHeight: tablePopover.height }}
          >
            {BLOCK_TYPES.map((type) => (
              <button
                key={type.id}
                type="button"
                role="menuitemradio"
                aria-checked={type.id === state.block}
                tabIndex={-1}
                onClick={() => {
                  turnInto(editor, type);
                  setMode('tools');
                }}
              >
                <span>{type.label}</span>
                <kbd>{type.hint}</kbd>
              </button>
            ))}
            <button
              type="button"
              role="menuitemradio"
              aria-checked={editor.isActive('details')}
              tabIndex={-1}
              onClick={() => {
                wrapSelection(editor, 'toggle');
                setMode('tools');
              }}
            >
              <span>
                <ListCollapse size={ICON} /> Toggle list
              </span>
            </button>
            <button
              type="button"
              role="menuitemradio"
              aria-checked={editor.isActive('noteCard')}
              tabIndex={-1}
              onClick={() => {
                wrapSelection(editor, 'callout');
                setMode('tools');
              }}
            >
              <span>
                <Quote size={ICON} /> Callout
              </span>
            </button>
            <button
              type="button"
              role="menuitemradio"
              aria-checked={false}
              tabIndex={-1}
              onClick={() => {
                insertAfterSelection(editor, { type: 'horizontalRule' });
                setMode('tools');
              }}
            >
              <span>
                <Minus size={ICON} /> Divider
              </span>
            </button>
          </div>
        ) : null}
        {mode === 'color' && state.textSelected ? (
          <div
            id={colorPaletteId}
            role="menu"
            aria-label="Text and background colors"
            className={cn('note-color-popover', tablePopover.side === 'above' && 'is-above')}
            style={{ maxHeight: tablePopover.height, left: tablePopover.left }}
          >
            <section className="note-color-section" aria-label="Color">
              <h3 className="note-color-section-title">Color</h3>
              <button
                type="button"
                role="menuitemradio"
                data-tool
                aria-label="Default text color"
                aria-checked={!state.color}
                tabIndex={-1}
                onClick={() => chain().unsetMark('textColor').run()}
              >
                <span className="note-color-chip is-default-text" aria-hidden="true">
                  A
                </span>
                <span>Default Color</span>
                {!state.color ? <Check size={ICON} aria-hidden="true" /> : null}
              </button>
              {NOTE_COLORS.map((color) => (
                <button
                  key={'text-' + color.id}
                  type="button"
                  role="menuitemradio"
                  data-tool
                  aria-label={color.label + ' text color'}
                  aria-checked={state.color === color.id}
                  tabIndex={-1}
                  onClick={() => chain().setMark('textColor', { color: color.id }).run()}
                >
                  <span className="note-color-chip" style={{ color: color.ink }} aria-hidden="true">
                    A
                  </span>
                  <span>{color.label}</span>
                  {state.color === color.id ? <Check size={ICON} aria-hidden="true" /> : null}
                </button>
              ))}
            </section>
            <section className="note-color-section" aria-label="Background">
              <h3 className="note-color-section-title">Background</h3>
              <button
                type="button"
                role="menuitemradio"
                data-tool
                aria-label="Default background"
                aria-checked={!state.highlight}
                tabIndex={-1}
                onClick={() => chain().unsetHighlight().run()}
              >
                <span className="note-color-chip is-default-background" aria-hidden="true">
                  A
                </span>
                <span>Default Background</span>
                {!state.highlight ? <Check size={ICON} aria-hidden="true" /> : null}
              </button>
              {NOTE_COLORS.map((color) => (
                <button
                  key={'background-' + color.id}
                  type="button"
                  role="menuitemradio"
                  data-tool
                  aria-label={color.label + ' background'}
                  aria-checked={state.highlight && state.highlightColor === color.id}
                  tabIndex={-1}
                  onClick={() => chain().setHighlight({ color: color.id }).run()}
                >
                  <span
                    className="note-color-chip"
                    style={{ color: color.ink, backgroundColor: color.fill }}
                    aria-hidden="true"
                  >
                    A
                  </span>
                  <span>{color.label}</span>
                  {state.highlight && state.highlightColor === color.id ? (
                    <Check size={ICON} aria-hidden="true" />
                  ) : null}
                </button>
              ))}
            </section>
          </div>
        ) : null}
        {mode === 'insertTable' ? (
          <div
            role="dialog"
            aria-label="Insert table"
            className={cn(
              'note-bubble-menu note-table-size-popover',
              tablePopover.side === 'above' && 'is-above',
            )}
            style={{ maxHeight: tablePopover.height }}
          >
            <TableSizePicker
              onInsert={(rows, cols) => {
                insertSelectionTable(editor, rows, cols);
                setMode('tools');
              }}
            />
          </div>
        ) : null}
        {mode === 'table' && tableContext ? (
          <div
            role="dialog"
            aria-label="Table options"
            className={cn('note-table-popover', tablePopover.side === 'above' && 'is-above')}
            style={{ maxHeight: tablePopover.height }}
          >
            <TableTools editor={editor} />
          </div>
        ) : null}
      </div>
    </BubbleMenu>
  );
}
