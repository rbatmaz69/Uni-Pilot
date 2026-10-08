import { useEffect, useRef, useState } from 'react';
import { TextLayer, type PDFDocumentProxy } from 'pdfjs-dist';
import { PdfTextSelectionMenu } from './PdfTextSelectionMenu';
import type { HighlightRect, InkColor } from '@/features/documents/lib/pdfInkTypes';

export function StudyPdfCanvas({
  pdf,
  index,
  width,
  pageWidth,
  pageHeight,
  selectable,
  editable,
  onHighlight,
}: {
  pdf: PDFDocumentProxy;
  index: number;
  width: number;
  pageWidth: number;
  pageHeight: number;
  selectable: boolean;
  editable: boolean;
  onHighlight: (rects: HighlightRect[], color: InkColor) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let disposed = false;
    let cancel: (() => void) | undefined;
    let textLayer: TextLayer | undefined;
    void pdf
      .getPage(index + 1)
      .then(async (page) => {
        if (disposed || !ref.current) return;
        const canvas = ref.current;
        const original = page.getViewport({ scale: 1 });
        const scale = Math.min(
          (Math.min(window.devicePixelRatio || 1, 2) * width) / original.width,
          4096 / Math.max(original.width, original.height),
        );
        const viewport = page.getViewport({ scale });
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const task = page.render({ canvas, viewport });
        cancel = () => task.cancel();
        const text = textRef.current;
        let textRendered: Promise<unknown> = Promise.resolve();
        if (text) {
          text.replaceChildren();
          const textViewport = page.getViewport({ scale: width / original.width });
          text.style.setProperty(
            '--total-scale-factor',
            String(textViewport.scale * textViewport.userUnit),
          );
          textLayer = new TextLayer({
            container: text,
            viewport: textViewport,
            textContentSource: page.streamTextContent(),
          });
          textRendered = textLayer.render();
        }
        await Promise.all([task.promise, textRendered]);
        page.cleanup();
      })
      .catch((cause: unknown) => {
        if (!disposed)
          setError(cause instanceof Error ? cause.message : 'Seite konnte nicht angezeigt werden.');
      });
    return () => {
      disposed = true;
      cancel?.();
      textLayer?.cancel();
    };
  }, [pdf, index, width]);
  return (
    <>
      {error ? (
        <p role="alert" className="document-render-error">
          {error}
        </p>
      ) : null}
      <canvas ref={ref} className="document-pdf-canvas" aria-label={`Originalseite ${index + 1}`} />
      <div
        ref={textRef}
        className="study-pdf-text"
        data-selectable={selectable ? '' : undefined}
        aria-label={`Text der Originalseite ${index + 1}`}
      />
      <PdfTextSelectionMenu
        layer={textRef}
        width={pageWidth}
        height={pageHeight}
        enabled={selectable}
        editable={editable}
        onHighlight={onHighlight}
      />
    </>
  );
}
