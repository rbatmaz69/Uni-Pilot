import { useEffect, useRef, useState } from 'react';
import { getDocument, GlobalWorkerOptions, type RenderTask } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { PreviewSize } from '@/features/documents/lib/folderLayout';
import { pdfCoverScale } from '@/features/documents/lib/pdfCover';

GlobalWorkerOptions.workerSrc = workerUrl;

export function PdfThumbnail({
  base64,
  alt,
  onDimensions,
}: {
  base64: string;
  alt: string;
  onDimensions?: ((size: PreviewSize) => void) | undefined;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    let renderTask: RenderTask | undefined;
    const assets = new URL(`${import.meta.env.BASE_URL}pdfjs/`, window.location.href).href;
    const task = getDocument({
      data: Uint8Array.from(atob(base64), (character) => character.charCodeAt(0)),
      cMapUrl: `${assets}cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `${assets}standard_fonts/`,
      wasmUrl: `${assets}wasm/`,
    });

    task.promise
      .then(async (pdf) => {
        const page = await pdf.getPage(1);
        if (!active || !canvas.current) return;

        const unscaled = page.getViewport({ scale: 1 });
        onDimensions?.({ width: unscaled.width, height: unscaled.height });
        const scale = pdfCoverScale(unscaled.width, unscaled.height);
        const viewport = page.getViewport({ scale });
        const target = canvas.current;
        // Keep enough backing pixels for the canvas's 200% zoom setting.
        const pixels = Math.min(window.devicePixelRatio || 1, 2) * 2;
        target.width = Math.ceil(viewport.width * pixels);
        target.height = Math.ceil(viewport.height * pixels);
        renderTask = page.render({
          canvas: target,
          viewport,
          transform: [pixels, 0, 0, pixels, 0, 0],
        });
        await renderTask.promise;
      })
      .catch(() => {
        if (active) setFailed(true);
      });

    return () => {
      active = false;
      renderTask?.cancel();
      void task.destroy();
    };
  }, [base64, onDimensions]);

  if (failed) {
    return <span className="canvas-thumbnail-fallback">PDF</span>;
  }

  return <canvas ref={canvas} className="canvas-paper-media-pdf" aria-label={alt} />;
}
