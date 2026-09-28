import {
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import type { EditorEvents } from '@tiptap/core';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';
import { NodeViewWrapper, useEditorState, type NodeViewProps } from '@tiptap/react';
import 'katex/dist/katex.min.css';
import {
  blockLatex,
  EDIT_FORMULA,
  inlineLatex,
  renderMath,
} from '@/features/documents/lib/noteMath';
import { cn } from '@/lib/utils';

type Focus = 'after' | 'formula' | null;

/**
 * A formula shows KaTeX's rendering and opens its LaTeX on a click or on Enter
 * while it is selected. The draft previews live and is only written to the
 * note when it is finished; an emptied formula removes itself.
 */
function useFormula(
  { node, editor, getPos, updateAttributes, deleteNode }: NodeViewProps,
  display: boolean,
) {
  const normalise = display ? blockLatex : inlineLatex;
  const latex = normalise(node.attrs.latex);
  const editable = useEditorState({
    editor,
    selector: ({ editor: current }) => current.isEditable,
  });
  // A new, empty formula opens for typing straight away.
  const [draft, setDraft] = useState<string | null>(() =>
    editor.isEditable && !latex ? '' : null,
  );
  // Enter or Escape finish the draft; the blur that follows must not finish it again.
  const finished = useRef(false);
  const source = draft ?? latex;
  const rendering = useMemo(() => renderMath(source, display), [source, display]);

  function open() {
    if (!editor.isEditable) return;
    finished.current = false;
    setDraft(latex);
  }

  // A press and release on the formula open it. No `click`: on the first
  // press ProseMirror makes the node draggable to select it, and Chrome then
  // drops the click. A release after a drag from elsewhere does not count.
  const pressed = useRef(false);
  const pointer = {
    onMouseDown: (event: MouseEvent<HTMLElement>) => {
      pressed.current = event.button === 0;
    },
    onMouseUp: (event: MouseEvent<HTMLElement>) => {
      if (pressed.current && event.button === 0) open();
      pressed.current = false;
    },
  };

  // Not `autoFocus`: inserting a formula focuses the editor one frame later
  // (Tiptap's `focus()`), and that blur would finish the empty formula at once.
  // The field takes the focus in the frame after.
  const field = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const editing = draft !== null;
  useEffect(() => {
    if (!editing) return;
    const frame = requestAnimationFrame(() => field.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [editing]);

  const openOnRequest = useEffectEvent(({ transaction }: EditorEvents['transaction']) => {
    if (transaction.getMeta(EDIT_FORMULA) === getPos()) open();
  });
  useEffect(() => {
    editor.on('transaction', openOnRequest);
    return () => {
      editor.off('transaction', openOnRequest);
    };
  }, [editor]);

  /** Writes `value` (or keeps the formula for `null`) and returns to the text. */
  function finish(value: string | null, focus: Focus) {
    if (finished.current) return;
    finished.current = true;
    setDraft(null);
    const position = getPos();
    if (typeof position !== 'number') return;
    const next = value === null ? latex : normalise(value);
    if (!next) {
      deleteNode();
      if (focus) editor.commands.focus();
      return;
    }
    if (next !== latex) updateAttributes({ latex: next });
    if (!focus) return;
    editor
      .chain()
      .focus()
      .command(({ tr }) => {
        tr.setSelection(
          focus === 'formula'
            ? NodeSelection.create(tr.doc, position)
            : TextSelection.near(tr.doc.resolve(position + node.nodeSize), 1),
        );
        return true;
      })
      .run();
  }

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      finish(null, 'formula');
    } else if (event.key === 'Enter' && (!display || !event.shiftKey)) {
      // In a block, Shift+Enter starts a new line of LaTeX.
      event.preventDefault();
      finish(draft, 'after');
    }
  }

  // Nothing to typeset yet: the view shows a hint instead of an empty rendering.
  const html = source.trim() ? rendering.html : null;
  return { latex, draft, setDraft, rendering, html, editable, field, pointer, finish, onKeyDown };
}

function Rendering({ html, fallback }: { html: string | null; fallback: string }) {
  return html ? (
    <span className="note-math-output" dangerouslySetInnerHTML={{ __html: html }} />
  ) : (
    <span className="note-math-source">{fallback}</span>
  );
}

export function InlineMathView(props: NodeViewProps) {
  const { latex, draft, setDraft, rendering, html, editable, field, pointer, finish, onKeyDown } =
    useFormula(props, false);
  const editing = draft !== null;
  return (
    <NodeViewWrapper
      as="span"
      className={cn(
        'note-math-inline',
        props.selected && 'is-selected',
        editing && 'is-editing',
        rendering.error && !editing && 'has-error',
      )}
    >
      <span
        className="note-math-render"
        contentEditable={false}
        title={editable ? (rendering.error ?? 'Click to edit the formula') : undefined}
        {...pointer}
      >
        <Rendering html={html} fallback={editing ? draft || '…' : latex || 'Empty formula'} />
      </span>
      {editing ? (
        <span className="note-math-popover" contentEditable={false}>
          <input
            ref={field}
            type="text"
            aria-label="Formula in LaTeX"
            placeholder="x^2 + y^2 = r^2"
            value={draft}
            spellCheck={false}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
            onBlur={() => finish(draft, null)}
          />
          <span className={cn('note-math-hint', rendering.error && 'is-error')} aria-live="polite">
            {rendering.error && draft ? rendering.error : 'Enter to finish · Esc to cancel'}
          </span>
        </span>
      ) : null}
    </NodeViewWrapper>
  );
}

export function BlockMathView(props: NodeViewProps) {
  const { latex, draft, setDraft, rendering, html, editable, field, pointer, finish, onKeyDown } =
    useFormula(props, true);
  const editing = draft !== null;
  return (
    <NodeViewWrapper
      className={cn(
        'note-math-block',
        props.selected && 'is-selected',
        editing && 'is-editing',
        rendering.error && !editing && 'has-error',
      )}
      data-type="block-math"
    >
      <div
        className="note-math-render"
        contentEditable={false}
        title={editable ? (rendering.error ?? 'Click to edit the formula') : undefined}
        {...pointer}
      >
        <Rendering
          html={html}
          fallback={editing ? draft || 'The formula appears here' : latex || 'Empty formula'}
        />
      </div>
      {editing ? (
        <div className="note-math-editor" contentEditable={false}>
          <textarea
            ref={field}
            aria-label="Formula in LaTeX"
            placeholder={'\\int_0^1 x^2 \\, dx'}
            value={draft}
            rows={Math.min(8, Math.max(2, draft.split('\n').length))}
            spellCheck={false}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
            onBlur={() => finish(draft, null)}
          />
          <span className={cn('note-math-hint', rendering.error && 'is-error')} aria-live="polite">
            {rendering.error && draft
              ? rendering.error
              : 'Enter to finish · Shift + Enter for a new line · Esc to cancel'}
          </span>
        </div>
      ) : null}
    </NodeViewWrapper>
  );
}
