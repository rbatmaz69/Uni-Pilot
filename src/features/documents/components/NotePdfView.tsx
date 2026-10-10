import { useEffect, useRef, useState } from 'react';
import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react';
import { invoke } from '@tauri-apps/api/core';
import { ChevronLeft, ChevronRight, Download, FileText } from 'lucide-react';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import { resolveNoteLink } from '@/features/documents/lib/attachments';
import { acquireStudyPdf } from '@/features/documents/lib/studyPdfResource';
import './note-pdf.css';

function PdfPage({ pdf, page }: { pdf: PDFDocumentProxy; page: number }) {
  const host = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState('Rendering page…');
  useEffect(() => {
    const container = host.current;
    if (!container) return;
    let active = true;
    let task: RenderTask | undefined;
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', `PDF page ${page}`);
    container.replaceChildren(canvas);
    setStatus('Rendering page…');
    void pdf
      .getPage(page)
      .then(async (documentPage) => {
        if (!active) return;
        const original = documentPage.getViewport({ scale: 1 });
        const width = Math.min(Math.max(container.clientWidth - 48, 180), 900);
        const scale = Math.min(width / original.width, 500 / original.height);
        const pixels = Math.min(window.devicePixelRatio || 1, 2);
        const viewport = documentPage.getViewport({ scale: scale * pixels });
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        canvas.style.width = `${viewport.width / pixels}px`;
        canvas.style.height = `${viewport.height / pixels}px`;
        task = documentPage.render({ canvas, viewport });
        try {
          await task.promise;
          if (active) setStatus('');
        } finally {
          documentPage.cleanup();
        }
      })
      .catch(() => {
        if (active) setStatus('This PDF page could not be displayed.');
      });
    return () => {
      active = false;
      task?.cancel();
      canvas.remove();
    };
  }, [pdf, page]);
  return (
    <div className="note-pdf-page" aria-busy={status === 'Rendering page…'}>
      <div className="note-pdf-canvas-host" ref={host} />
      {status ? (
        <span className="note-pdf-page-status" role="status">
          {status}
        </span>
      ) : null}
    </div>
  );
}

export function NotePdfView({
  node,
  extension,
  selected,
  updateAttributes,
  editor,
}: ReactNodeViewProps) {
  const src = typeof node.attrs.src === 'string' ? node.attrs.src : '';
  const name =
    typeof node.attrs.name === 'string' && node.attrs.name
      ? node.attrs.name
      : src.split('/').pop() || 'Document.pdf';
  const view = node.attrs.view === 'card' ? 'card' : 'embed';
  const path = resolveNoteLink((extension.options as { notePath: string }).notePath, src);
  const [loaded, setLoaded] = useState<{ path: string; pdf: PDFDocumentProxy } | null>(null);
  const [error, setError] = useState<{ path: string; message: string } | null>(null);
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [feedback, setFeedback] = useState('');
  const pdf = loaded?.path === path ? loaded.pdf : null;
  useEffect(() => {
    if (!path || view !== 'embed') return;
    let active = true;
    const resource = acquireStudyPdf(path);
    resource.promise
      .then((document) => {
        if (active) {
          setLoaded({ path, pdf: document });
          setError(null);
          setPage(1);
        }
      })
      .catch(() => {
        if (active)
          setError({
            path,
            message: 'This PDF could not be loaded. Check that the attachment is still available.',
          });
      });
    return () => {
      active = false;
      setLoaded(null);
      resource.release();
    };
  }, [path, view, retry]);
  async function download() {
    if (!path) return;
    setDownloading(true);
    setFeedback('');
    try {
      const saved = await invoke<string>('download_document', { path });
      setFeedback(`${saved} saved to Downloads`);
    } catch {
      setFeedback('The PDF could not be downloaded.');
    } finally {
      setDownloading(false);
    }
  }
  const message = !path
    ? 'Only PDF attachments in this workspace can be displayed.'
    : error?.path === path
      ? error.message
      : !pdf
        ? 'Loading PDF…'
        : '';
  return (
    <NodeViewWrapper
      className={`note-pdf ${selected ? 'is-selected' : ''}`}
      data-view={view}
      contentEditable={false}
    >
      <div className="note-pdf-toolbar">
        <FileText size={18} aria-hidden="true" />
        <span className="note-pdf-type">PDF</span>
        <select
          aria-label="PDF view"
          value={view}
          disabled={!editor.isEditable}
          onChange={(event) => {
            if (!editor.isEditable) return;
            setError(null);
            updateAttributes({ view: event.target.value });
          }}
        >
          <option value="embed">Embed view</option>
          <option value="card">File card</option>
        </select>
        <button
          type="button"
          aria-label={`Download ${name}`}
          title="Download PDF"
          disabled={!path || downloading}
          onClick={() => void download()}
        >
          <Download size={17} aria-hidden="true" />
        </button>
      </div>
      {view === 'embed' ? (
        pdf ? (
          <PdfPage pdf={pdf} page={page} />
        ) : (
          <div
            className="note-pdf-message"
            role={error?.path === path || !path ? 'alert' : 'status'}
          >
            {message}
            {path && error?.path === path ? (
              <button
                type="button"
                className="note-pdf-retry"
                onClick={() => {
                  setError(null);
                  setRetry((value) => value + 1);
                }}
              >
                Retry
              </button>
            ) : null}
          </div>
        )
      ) : null}
      <div className="note-pdf-footer">
        <FileText size={20} aria-hidden="true" />
        <span className="note-pdf-name" title={name}>
          {name}
        </span>
        {view === 'card' ? (
          <span className="note-pdf-size">
            {Number(node.attrs.size) > 0
              ? `${Math.ceil(Number(node.attrs.size) / 1024)} KB`
              : 'PDF document'}
          </span>
        ) : (
          <div className="note-pdf-pagination">
            <span aria-live="polite">{pdf ? `${page} / ${pdf.numPages}` : '— / —'}</span>
            <button
              type="button"
              aria-label="Previous PDF page"
              disabled={!pdf || page <= 1}
              onClick={() => setPage((value) => value - 1)}
            >
              <ChevronLeft size={17} aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="Next PDF page"
              disabled={!pdf || page >= pdf.numPages}
              onClick={() => setPage((value) => value + 1)}
            >
              <ChevronRight size={17} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
      {feedback ? (
        <p className="note-pdf-feedback" role="status">
          {feedback}
        </p>
      ) : null}
    </NodeViewWrapper>
  );
}
