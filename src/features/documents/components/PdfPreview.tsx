import { useEffect, useRef, useState } from 'react';
import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentProxy,
  type RenderTask,
} from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { Button } from '@/components/ui';

GlobalWorkerOptions.workerSrc = workerUrl;

export default function PdfPreview({ base64 }: { base64: string }) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState('');
  const [rendering, setRendering] = useState(true);
  const [text, setText] = useState('');
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    const assets = new URL(`${import.meta.env.BASE_URL}pdfjs/`, window.location.href).href;
    const task = getDocument({
      data: Uint8Array.from(atob(base64), (character) => character.charCodeAt(0)),
      cMapUrl: `${assets}cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `${assets}standard_fonts/`,
      wasmUrl: `${assets}wasm/`,
    });
    task.promise
      .then((document) => {
        if (active) setPdf(document);
      })
      .catch((cause: unknown) => {
        if (active)
          setError(
            `This PDF could not be displayed. Try opening it in its default app. ${String(cause)}`,
          );
      });
    return () => {
      active = false;
      void task.destroy();
    };
  }, [base64]);

  useEffect(() => {
    if (!pdf || !host.current) return;
    let active = true;
    let renderTask: RenderTask | undefined;
    const container = host.current;
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.className = 'mx-auto max-w-none';
    container.replaceChildren(canvas);
    const render = async () => {
      setRendering(true);
      setText('');
      setError('');
      const documentPage = await pdf.getPage(page);
      if (!active) return;
      const unscaled = documentPage.getViewport({ scale: 1 });
      const scale = (Math.max(240, container.clientWidth - 24) / unscaled.width) * zoom;
      const viewport = documentPage.getViewport({ scale });
      const pixels = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.ceil(viewport.width * pixels);
      canvas.height = Math.ceil(viewport.height * pixels);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      renderTask = documentPage.render({
        canvas,
        viewport,
        transform: [pixels, 0, 0, pixels, 0, 0],
      });
      await renderTask.promise;
      if (active) setRendering(false);
      const content = await documentPage.getTextContent();
      if (active) setText(content.items.map((item) => ('str' in item ? item.str : '')).join(' '));
    };
    void render().catch((cause: unknown) => {
      if (active) {
        setRendering(false);
        setError(`This page could not be displayed. ${String(cause)}`);
      }
    });
    return () => {
      active = false;
      renderTask?.cancel();
      canvas.remove();
    };
  }, [pdf, page, zoom]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-center gap-3">
        <Button size="sm" disabled={!pdf || page <= 1} onClick={() => setPage(page - 1)}>
          Previous page
        </Button>
        <span className="text-sm" aria-live="polite">
          {pdf ? `Page ${page} of ${pdf.numPages}` : 'Loading PDF…'}
        </span>
        <Button size="sm" disabled={!pdf || page >= pdf.numPages} onClick={() => setPage(page + 1)}>
          Next page
        </Button>
        <label className="flex items-center gap-2 text-sm">
          Zoom
          <select
            aria-label="PDF zoom"
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
            className="rounded-md border border-line bg-surface px-2 py-1"
          >
            <option value={1}>Fit width</option>
            <option value={1.25}>125%</option>
            <option value={1.5}>150%</option>
            <option value={2}>200%</option>
          </select>
        </label>
      </div>
      {error ? (
        <p role="alert" className="mb-3 text-sm text-danger">
          {error}
        </p>
      ) : rendering ? (
        <p role="status" className="mb-3 text-sm text-muted">
          Rendering page…
        </p>
      ) : null}
      <div
        ref={host}
        aria-label={`PDF page ${page}`}
        aria-busy={rendering && !error}
        className="min-h-64 overflow-auto rounded-lg bg-surface-secondary p-3"
      />
      <p className="sr-only">{text}</p>
    </div>
  );
}
