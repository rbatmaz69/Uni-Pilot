import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/core';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';
import {
  NodeViewContent,
  NodeViewWrapper,
  useEditorState,
  type NodeViewProps,
} from '@tiptap/react';
import { Check, Code2, Copy, Network } from 'lucide-react';
import { continueAfterCode } from '@/features/documents/lib/noteCodeBlock';
import { isMermaidLanguage, NOTE_LAYOUT_EVENT } from '@/features/documents/lib/mermaid';
import { useNoteStyleStore } from '@/features/documents/store/noteStyleStore';
import { useUiStore } from '@/store/uiStore';
import { isDarkTheme } from '@/lib/theme';
import { MermaidDiagram } from './MermaidDiagram';

const editorsWithPositionedMermaidSelection = new WeakSet<Editor>();

export function NoteCodeBlockView({ node, editor, getPos }: NodeViewProps) {
  const root = useRef<HTMLDivElement>(null);
  const [copyStatus, setCopyStatus] = useState('');
  const [editing, setEditing] = useState(false);
  const theme = useUiStore((state) => state.theme);
  const tone = useNoteStyleStore((state) => state.tone);
  const style = useNoteStyleStore((state) => state.style);
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      const { $from } = current.state.selection;
      return {
        editable: current.isEditable,
        inside:
          $from.parent.type.name === 'codeBlock' && $from.depth > 0 && $from.before() === getPos(),
      };
    },
  });
  const mermaid = isMermaidLanguage(node.attrs.language);
  const showCode = !mermaid || Boolean(editing && state?.editable && state.inside);
  const diagramTheme =
    isDarkTheme(theme) && tone === 'default' && style === 'standard' ? 'dark' : 'neutral';

  useEffect(() => {
    if (!copyStatus) return;
    const timer = window.setTimeout(() => setCopyStatus(''), 2500);
    return () => window.clearTimeout(timer);
  }, [copyStatus]);

  useLayoutEffect(() => {
    if (
      !mermaid ||
      !state?.editable ||
      !state.inside ||
      editorsWithPositionedMermaidSelection.has(editor)
    )
      return;
    editorsWithPositionedMermaidSelection.add(editor);
    const position = getPos();
    if (position === undefined) return;
    const code = editor.state.doc.nodeAt(position);
    if (code?.type.name !== 'codeBlock') return;
    const after = position + code.nodeSize;
    const next = editor.state.doc.resolve(after).nodeAfter;
    const transaction = editor.state.tr;
    transaction.setSelection(
      next?.isTextblock && !next.type.spec.code
        ? TextSelection.near(transaction.doc.resolve(after + 1))
        : NodeSelection.create(transaction.doc, position),
    );
    editor.view.dispatch(transaction);
  }, [editor, getPos, mermaid, state?.editable, state?.inside]);

  useLayoutEffect(() => {
    root.current?.dispatchEvent(new Event(NOTE_LAYOUT_EVENT, { bubbles: true }));
  }, [showCode]);

  function edit() {
    const position = getPos();
    if (!state?.editable || position === undefined) return;
    setEditing(true);
    editor
      .chain()
      .setTextSelection(position + 1)
      .focus()
      .run();
  }
  function done() {
    const position = getPos();
    if (position !== undefined) continueAfterCode(editor, position);
    setEditing(false);
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(node.textContent);
      setCopyStatus('Code copied');
    } catch {
      setCopyStatus('Could not copy. Select the code to copy it.');
    }
  }

  return (
    <NodeViewWrapper
      ref={root}
      className={mermaid ? 'note-mermaid' : 'note-code-block'}
      data-mermaid={mermaid ? '' : undefined}
      data-editing={mermaid && showCode ? 'true' : undefined}
      data-diagram-theme={mermaid ? diagramTheme : undefined}
      onKeyDownCapture={(event: React.KeyboardEvent) => {
        if (
          mermaid &&
          state?.editable &&
          (event.metaKey || event.ctrlKey) &&
          event.key === 'Enter'
        ) {
          event.preventDefault();
          event.stopPropagation();
          done();
        }
      }}
    >
      {mermaid && (
        <div className="note-mermaid-toolbar" contentEditable={false}>
          <span className="note-mermaid-label">
            <Network size={15} />
            Mermaid diagram
          </span>
          <div className="note-mermaid-actions">
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => void copy()}
              aria-label="Copy Mermaid code"
              title="Copy code"
            >
              {copyStatus === 'Code copied' ? <Check size={14} /> : <Copy size={14} />}
              <span>{copyStatus === 'Code copied' ? 'Copied' : 'Copy code'}</span>
            </button>
            {state?.editable && (
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={showCode ? done : edit}
                aria-label={showCode ? 'Done editing Mermaid code' : 'Edit Mermaid code'}
              >
                {showCode ? <Check size={14} /> : <Code2 size={14} />}
                <span>{showCode ? 'Done' : 'Edit code'}</span>
              </button>
            )}
          </div>
        </div>
      )}
      <div className={mermaid ? 'note-mermaid-workspace' : undefined}>
        <div className={mermaid ? 'note-mermaid-source' : undefined} hidden={!showCode}>
          <pre className={mermaid ? 'note-mermaid-code' : undefined} hidden={!showCode}>
            <NodeViewContent<'code'> as="code" aria-label={mermaid ? 'Mermaid code' : undefined} />
          </pre>
          {mermaid && showCode && (
            <div className="note-mermaid-help" contentEditable={false}>
              <span>Changes preview automatically</span>
              <span>⌘ / Ctrl + Enter to finish</span>
            </div>
          )}
        </div>
        {mermaid && <MermaidDiagram source={node.textContent} theme={diagramTheme} />}
      </div>
      {mermaid && (
        <span className="note-mermaid-copy-status" role="status" contentEditable={false}>
          {copyStatus}
        </span>
      )}
    </NodeViewWrapper>
  );
}
