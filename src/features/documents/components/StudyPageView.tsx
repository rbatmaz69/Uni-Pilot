import { useEffect, useRef, useState, type RefObject } from 'react';
import { NodeViewWrapper, NodeViewContent, type NodeViewProps } from '@tiptap/react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { Plus } from 'lucide-react';
import { insertStudyPages, readInk, pdfPageAttributes } from '@/features/documents/lib/studyPages';
import { resolveNoteLink } from '@/features/documents/lib/attachments';
import { type TextAnnotation } from '@/features/documents/lib/pdfInkTypes';
import { PdfInkLayer, TextEditor } from '@/features/documents/components/PdfInkLayer';
import { StudyPdfCanvas } from '@/features/documents/components/StudyPdfCanvas';
import { studyToolsStore, useStudyTools } from '@/features/documents/store/studyToolsStore';

function useActiveSheet(
  editor: NodeViewProps['editor'],
  getPos: NodeViewProps['getPos'],
  element: RefObject<HTMLElement | null>,
) {
  const initialized = useRef(false);
  useEffect(() => {
    const sheet = element.current;
    if (!sheet) return;
    const store = studyToolsStore(editor);
    const activate = () => {
      const pos = getPos();
      if (pos !== undefined && store.getState().active?.() !== pos)
        store.setState({ active: getPos });
    };
    if (!initialized.current) {
      initialized.current = true;
      const pos = getPos();
      const node = pos !== undefined ? editor.state.doc.nodeAt(pos) : null;
      if (
        node &&
        pos !== undefined &&
        editor.state.selection.from > pos &&
        editor.state.selection.from < pos + node.nodeSize
      )
        activate();
    }
    if (!window.IntersectionObserver) return;
    const root = sheet.closest('.note-stage');
    const inset = Math.round((root?.clientHeight ?? window.innerHeight) * 0.35);
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) activate();
      },
      { root, rootMargin: `-${inset}px 0px -${inset}px 0px` },
    );
    observer.observe(sheet);
    return () => observer.disconnect();
  }, [editor, getPos, element]);
}

function SheetInsert({ editor, getPos }: Pick<NodeViewProps, 'editor' | 'getPos'>) {
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="study-page-insert" contentEditable={false}>
      <button
        type="button"
        disabled={!editor.isEditable}
        onClick={() => {
          try {
            const pos = getPos();
            if (typeof pos === 'number' && insertStudyPages(editor, 1, pos))
              studyToolsStore(editor).setState({ tool: 'select', selected: null });
          } catch (cause) {
            setError(String(cause));
          }
        }}
      >
        <Plus size={15} /> Notizseite hier einfügen
      </button>
      {error ? <span role="alert">{error}</span> : null}
    </div>
  );
}

export function StudySourceView({
  node,
  editor,
  extension,
  updateAttributes,
  getPos,
}: NodeViewProps) {
  const attrs = pdfPageAttributes(node.attrs);
  const container = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [near, setNear] = useState(() => !window.IntersectionObserver);
  const [width, setWidth] = useState(595);
  const state = useStudyTools(editor);
  const store = studyToolsStore(editor);
  const { tool, color } = state;
  const selected = state.selected && state.selected.page() === getPos() ? state.selected.id : null;
  useActiveSheet(editor, getPos, container);
  const [editing, setEditing] = useState<TextAnnotation | null>(null);
  const path = attrs
    ? resolveNoteLink(String((extension.options as { notePath: string }).notePath), attrs.src)
    : null;
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    if (!window.IntersectionObserver) return;
    const observer = new IntersectionObserver(
      (entries) => {
        setNear(entries.some((e) => e.isIntersecting));
      },
      { rootMargin: '800px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const resize = () => setWidth(element.clientWidth || 595);
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!path) return;
    let disposed = false;
    let release: (() => void) | undefined;
    void import('@/features/documents/lib/studyPdfResource')
      .then(({ acquireStudyPdf }) => {
        if (disposed) return;
        const resource = acquireStudyPdf(path);
        release = () => resource.release();
        return resource.promise;
      })
      .then((value) => {
        if (!disposed && value) setPdf(value);
      })
      .catch((cause: unknown) => {
        if (!disposed) setError(String(cause));
      });
    return () => {
      disposed = true;
      release?.();
    };
  }, [path]);
  if (!attrs)
    return (
      <NodeViewWrapper>
        <p role="alert">Diese PDF-Seite enthält ungültige Daten.</p>
      </NodeViewWrapper>
    );
  const annotations = readInk(attrs.ink)!;
  const sheet = {
    id: `${attrs.src}-${attrs.page}`,
    kind: 'source' as const,
    sourceIndex: attrs.page - 1,
    width: attrs.width,
    height: attrs.height,
    paper: 'blank' as const,
    annotations: annotations.filter((item) => item.id !== editing?.id),
  };
  return (
    <NodeViewWrapper
      className="study-source-block"
      data-readonly={!editor.isEditable ? '' : undefined}
      contentEditable={false}
      onPointerDownCapture={() => store.setState({ active: getPos })}
      onMouseDownCapture={() => {
        if (!window.PointerEvent) store.setState({ active: getPos });
      }}
    >
      <div className="study-page-caption">Original · {attrs.page}</div>
      <div
        ref={container}
        className="study-source-sheet"
        style={{ aspectRatio: `${attrs.width} / ${attrs.height}` }}
      >
        {near && pdf ? (
          <StudyPdfCanvas
            pdf={pdf}
            index={attrs.page - 1}
            width={width}
            pageWidth={attrs.width}
            pageHeight={attrs.height}
            selectable={tool === 'select'}
            editable={editor.isEditable}
            onHighlight={(rects, color) => {
              if (!editor.isEditable || !rects.length) return;
              const id = crypto.randomUUID();
              updateAttributes({
                ink: JSON.stringify([...annotations, { id, type: 'highlight', color, rects }]),
              });
              store.setState({ selected: { page: getPos, id } });
            }}
          />
        ) : (
          <p className="study-page-loading" role={error ? 'alert' : 'status'}>
            {error ?? 'PDF-Seite wird geladen…'}
          </p>
        )}
        {near && pdf ? (
          <PdfInkLayer
            page={sheet}
            tool={tool}
            color={color}
            penWidth={2}
            textSize={16}
            selected={selected}
            onSelect={(id) => store.setState({ selected: id ? { page: getPos, id } : null })}
            onChange={(ink) => {
              if (editor.isEditable) updateAttributes({ ink: JSON.stringify(ink) });
            }}
            onText={(annotation) => {
              if (editor.isEditable) setEditing(annotation);
            }}
          />
        ) : null}
        {editing ? (
          <TextEditor
            key={editing.id}
            annotation={editing}
            scale={width / attrs.width}
            onCancel={() => setEditing(null)}
            onCommit={(text) => {
              const ink = annotations.filter((a) => a.id !== editing.id);
              if (text.trim()) ink.push({ ...editing, text });
              if (editor.isEditable) updateAttributes({ ink: JSON.stringify(ink) });
              setEditing(null);
            }}
          />
        ) : null}
      </div>
      <SheetInsert editor={editor} getPos={getPos} />
    </NodeViewWrapper>
  );
}

export function StudyNoteView({ node, editor, getPos, updateAttributes }: NodeViewProps) {
  const sheetRef = useRef<HTMLElement>(null);
  const state = useStudyTools(editor);
  const store = studyToolsStore(editor);
  const { tool, color } = state;
  const drawing = tool !== 'select';
  const selected = state.selected && state.selected.page() === getPos() ? state.selected.id : null;
  useActiveSheet(editor, getPos, sheetRef);
  const [editing, setEditing] = useState<TextAnnotation | null>(null);
  const [size, setSize] = useState({ width: 595, height: 842 });
  useEffect(() => {
    const element = sheetRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() =>
      setSize({ width: element.clientWidth || 595, height: element.clientHeight || 842 }),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const annotations = readInk(node.attrs.ink) ?? [];
  const sheet = {
    id: 'note',
    kind: 'note' as const,
    sourceIndex: null,
    width: 595,
    height: (size.height * 595) / size.width,
    paper: 'blank' as const,
    annotations: annotations.filter((item) => item.id !== editing?.id),
  };
  return (
    <NodeViewWrapper
      className="study-note-block"
      onPointerDownCapture={() => store.setState({ active: getPos })}
      onMouseDownCapture={() => {
        if (!window.PointerEvent) store.setState({ active: getPos });
      }}
    >
      <div className="study-page-caption" contentEditable={false}>
        Aufschriebe
      </div>
      <section ref={sheetRef} className="study-note-sheet" data-study-page="">
        <NodeViewContent
          className="study-note-body"
          contentEditable={drawing ? false : undefined}
        />
        <div
          className="study-note-ink"
          contentEditable={false}
          data-writing={!drawing ? '' : undefined}
          style={{ pointerEvents: drawing && editor.isEditable ? 'auto' : 'none' }}
        >
          <PdfInkLayer
            page={sheet}
            tool={tool}
            color={color}
            penWidth={2}
            textSize={16}
            selected={selected}
            onSelect={(id) => store.setState({ selected: id ? { page: getPos, id } : null })}
            onChange={(ink) => {
              if (editor.isEditable) updateAttributes({ ink: JSON.stringify(ink) });
            }}
            onText={(annotation) => {
              if (editor.isEditable) setEditing(annotation);
            }}
          />
          {editing ? (
            <TextEditor
              key={editing.id}
              annotation={editing}
              scale={size.width / 595}
              onCancel={() => setEditing(null)}
              onCommit={(text) => {
                const ink = annotations.filter((a) => a.id !== editing.id);
                if (text.trim()) ink.push({ ...editing, text });
                if (editor.isEditable) updateAttributes({ ink: JSON.stringify(ink) });
                setEditing(null);
              }}
            />
          ) : null}
        </div>
      </section>
      <SheetInsert editor={editor} getPos={getPos} />
    </NodeViewWrapper>
  );
}
