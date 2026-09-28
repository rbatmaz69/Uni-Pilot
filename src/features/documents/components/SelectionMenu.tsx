import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { Editor } from '@tiptap/core';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';
import { useEditorState } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import {
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

interface Tool {
  label: string;
  /** Tiptap's default binding, with `Mod` for ⌘ or Ctrl. */
  keys?: string;
  icon: ReactNode;
  active?: boolean;
  run: () => void;
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
  const [mode, setMode] = useState<'tools' | 'turn' | 'link' | 'table'>('tools');
  const [href, setHref] = useState('');
  const [focused, setFocused] = useState(0);
  const [tablePopover, setTablePopover] = useState<{ side: 'above' | 'below'; height: number }>({
    side: 'below',
    height: 620,
  });
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
      code: current.isActive('code'),
      link: current.isActive('link'),
      linkHref: String(current.getAttributes('link').href ?? ''),
      inTable: current.isActive('table'),
      tableTone: String(current.getAttributes('table').tone ?? 'neutral'),
      textSelected:
        current.state.selection instanceof TextSelection && !current.state.selection.empty,
    }),
  });
  const chain = () => editor.chain().focus();
  const block = BLOCK_TYPES.find((type) => type.id === state.block) ?? BLOCK_TYPES[0];
  const tableContext = state.inTable && !state.textSelected;

  const marks: Tool[] = [
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
      label: 'Highlight',
      keys: 'Mod-Shift-H',
      icon: <Highlighter size={ICON} />,
      active: state.highlight,
      run: () => chain().toggleHighlight().run(),
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
    const closeStaleMode = () => {
      const selection = editor.state.selection;
      const textSelected = selection instanceof TextSelection && !selection.empty;
      const tableContext = editor.isActive('table') && !textSelected;
      setMode((current) => {
        if (current === 'table' && !tableContext) return 'tools';
        if ((current === 'turn' || current === 'link') && !textSelected) return 'tools';
        return current;
      });
    };
    editor.on('selectionUpdate', closeStaleMode);
    return () => {
      editor.off('selectionUpdate', closeStaleMode);
    };
  }, [editor]);

  function applyLink() {
    const target = normaliseHref(href);
    const link = chain().extendMarkRange('link');
    (target ? link.setLink({ href: target }) : link.unsetLink()).run();
    setMode('tools');
  }

  function toggleTableOptions() {
    if (mode === 'table') {
      setMode('tools');
      return;
    }
    const bounds = toolbar.current?.getBoundingClientRect();
    const above = Math.max(0, (bounds?.top ?? 0) - 12);
    const below = Math.max(0, window.innerHeight - (bounds?.bottom ?? 0) - 12);
    const side = below >= 400 || below >= above ? 'below' : 'above';
    setTablePopover({
      side,
      height: Math.max(120, Math.min(620, side === 'below' ? below : above)),
    });
    setMode('table');
  }

  function moveFocus(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      setMode('tools');
      editor.commands.focus();
      return;
    }
    if (mode === 'link' || mode === 'table') return;
    const selector = mode === 'turn' ? '[role="menuitemradio"]' : 'button[data-tool]';
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>(selector));
    const index = buttons.findIndex((button) => button === document.activeElement);
    if (index < 0) return;
    const forward = mode === 'turn' ? 'ArrowDown' : 'ArrowRight';
    const backward = mode === 'turn' ? 'ArrowUp' : 'ArrowLeft';
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
      ref={toolbar}
      className="note-bubble"
      appendTo={() => document.body}
      options={{
        strategy: 'fixed',
        placement: 'top',
        offset: 10,
        scrollTarget: scrollTarget ?? window,
        onHide: () => setMode('tools'),
      }}
      getReferencedVirtualElement={() => selectionAnchor(editor)}
      shouldShow={({ editor: current, element, view, state: editorState, from, to }) => {
        if (!current.isEditable) return false;
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
              onClick={toggleTableOptions}
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
                onClick={() => editor.chain().focus().updateAttributes('table', { tone: id }).run()}
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
                  onClick={() => {
                    setMode(mode === 'turn' ? 'tools' : 'turn');
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
          <div role="menu" aria-label="Turn into" className="note-bubble-menu">
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
