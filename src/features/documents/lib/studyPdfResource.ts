import { getDocument, GlobalWorkerOptions, type PDFDocumentLoadingTask } from 'pdfjs-dist';
import worker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { loadAttachment } from '@/features/documents/lib/previewCache';
import { decodePreview } from '@/features/documents/lib/studyImport';

GlobalWorkerOptions.workerSrc = worker;
interface PdfResource {
  refs: number;
  task?: PDFDocumentLoadingTask;
  promise: ReturnType<typeof getDocument>['promise'];
}
const resources = new Map<string, PdfResource>();

export function acquireStudyPdf(path: string) {
  let resource = resources.get(path);
  if (!resource) {
    const slot = { refs: 0 } as PdfResource;
    slot.promise = loadAttachment(path).then((data) => {
      const assets = new URL(`${import.meta.env.BASE_URL}pdfjs/`, window.location.href).href;
      slot.task = getDocument({
        data: decodePreview(data),
        cMapUrl: `${assets}cmaps/`,
        cMapPacked: true,
        standardFontDataUrl: `${assets}standard_fonts/`,
        wasmUrl: `${assets}wasm/`,
      });
      // Release can happen while the bytes are still being read.
      if (!slot.refs) {
        void slot.task.destroy();
        throw new Error('PDF-Ansicht geschlossen.');
      }
      return slot.task.promise;
    });
    resources.set(path, slot);
    resource = slot;
  }
  resource.refs++;
  const held = resource;
  let released = false;
  return {
    promise: held.promise,
    release: () => {
      if (released) return;
      released = true;
      if (--held.refs === 0) {
        if (resources.get(path) === held) resources.delete(path);
        void held.task?.destroy();
      }
    },
  };
}
