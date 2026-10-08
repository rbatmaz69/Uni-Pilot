import type { CSSProperties } from 'react';
import type { Editor } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';
import {
  MousePointer2,
  PenLine,
  Highlighter,
  Type,
  Eraser,
  Trash2,
  Plus,
  Undo2,
  Redo2,
} from 'lucide-react';
import { INK_COLORS, type InkColor } from '@/features/documents/lib/pdfInkTypes';
import { insertStudyPages, readInk } from '@/features/documents/lib/studyPages';
import {
  activeStudyPage,
  studyToolsStore,
  useStudyTools,
} from '@/features/documents/store/studyToolsStore';

const tools = [
  ['select', 'Auswählen', MousePointer2],
  ['pen', 'Stift', PenLine],
  ['marker', 'Marker', Highlighter],
  ['text', 'Text', Type],
  ['eraser', 'Radierer', Eraser],
] as const;

export function StudyAnnotationToolbar({
  editor,
  report,
}: {
  editor: Editor;
  report: (notice: { tone: 'error' | 'info'; text: string }) => void;
}) {
  const state = useStudyTools(editor);
  const store = studyToolsStore(editor);
  const status = useEditorState({
    editor,
    selector: ({ editor }) => ({
      ...activeStudyPage(editor, state.active),
      editable: editor.isEditable,
      undo: editor.can().undo(),
      redo: editor.can().redo(),
    }),
  });
  const page = status.page;
  function removeSelected() {
    const selected = store.getState().selected;
    const pos = selected?.page();
    if (!selected || pos === undefined || !editor.isEditable) return;
    const node = editor.state.doc.nodeAt(pos);
    if (!node || !['pdfPage', 'studyPage'].includes(node.type.name)) return;
    const ink = readInk(node.attrs.ink);
    if (!ink) return;
    editor.view.dispatch(
      editor.state.tr.setNodeMarkup(pos, undefined, {
        ...node.attrs,
        ink: JSON.stringify(ink.filter((item) => item.id !== selected.id)),
      }),
    );
    store.setState({ selected: null });
  }
  return (
    <div className="study-annotation-toolbar" role="toolbar" aria-label="Dokument bearbeiten">
      <div className="study-tools-group">
        {tools.map(([tool, label, Icon]) => (
          <button
            key={tool}
            type="button"
            aria-label={label}
            title={label}
            aria-pressed={state.tool === tool}
            disabled={!status.editable}
            onClick={() =>
              store.setState({ tool, ...(tool === 'marker' ? { color: 'yellow' as const } : {}) })
            }
          >
            <Icon size={18} />
          </button>
        ))}
      </div>
      <span className="study-tool-divider" />
      <div className="study-tools-group">
        {(Object.keys(INK_COLORS) as InkColor[]).map((color) => (
          <button
            type="button"
            key={color}
            className="study-ink"
            aria-label={INK_COLORS[color].label}
            title={INK_COLORS[color].label}
            aria-pressed={state.color === color}
            disabled={!status.editable}
            style={{ '--study-ink': INK_COLORS[color].hex } as CSSProperties}
            onClick={() => store.setState({ color })}
          >
            <span />
          </button>
        ))}
        <button
          type="button"
          aria-label="Ausgewählte Markierung löschen"
          title="Markierung löschen"
          disabled={!status.editable || !state.selected}
          onClick={removeSelected}
        >
          <Trash2 size={17} />
        </button>
      </div>
      <span className="study-tool-divider" />
      <div className="study-tools-group">
        <button
          type="button"
          aria-label="Rückgängig"
          title="Rückgängig"
          disabled={!status.editable || !status.undo}
          onClick={() => editor.chain().focus().undo().run()}
        >
          <Undo2 size={18} />
        </button>
        <button
          type="button"
          aria-label="Wiederholen"
          title="Wiederholen"
          disabled={!status.editable || !status.redo}
          onClick={() => editor.chain().focus().redo().run()}
        >
          <Redo2 size={18} />
        </button>
      </div>
      <span className="study-current-page" aria-live="polite">
        {page ? `Seite ${page.number} von ${status.total}` : ''}
      </span>
      <button
        type="button"
        className="study-toolbar-insert"
        disabled={!status.editable || !page}
        onClick={() => {
          try {
            if (page && insertStudyPages(editor, 1, page.pos))
              store.setState({ tool: 'select', selected: null });
          } catch (cause) {
            report({ tone: 'error', text: String(cause) });
          }
        }}
      >
        <Plus size={17} /> Notizseite
      </button>
    </div>
  );
}
