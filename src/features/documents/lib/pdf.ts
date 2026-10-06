import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = workerUrl;

/** Opens a PDF from base64 bytes with the fonts and maps shipped in `public/pdfjs/`. */
export function openPdf(base64: string) {
  const assets = new URL(`${import.meta.env.BASE_URL}pdfjs/`, window.location.href).href;
  return getDocument({
    data: Uint8Array.from(atob(base64), (character) => character.charCodeAt(0)),
    cMapUrl: `${assets}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${assets}standard_fonts/`,
    wasmUrl: `${assets}wasm/`,
  });
}
