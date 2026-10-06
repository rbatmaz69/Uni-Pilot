import type { DocumentPreviewData } from '@/features/documents/lib/files';
import { openPdf } from '@/features/documents/lib/pdf';
import { pdfCoverScale } from '@/features/documents/lib/pdfCover';

/** Backing pixels per CSS pixel, as PdfThumbnail draws at most: Retina at 200% zoom. */
const PIXELS = 4;
/** A picture's longer side after scaling down; a card is at most 230 CSS pixels wide. */
const MAX_SIDE = 1024;
/** Shown as they are: vectors stay sharp, and a GIF may move. */
const AS_IS = new Set(['image/svg+xml', 'image/gif', 'image/x-icon']);
const QUALITY = 0.85;

/** Whether this webview encodes WebP; Safari's older engines answer with PNG. */
let webp: boolean | undefined;

function toBlob(canvas: HTMLCanvasElement, type: string) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, QUALITY));
}

function base64Of(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve(typeof reader.result === 'string' ? (reader.result.split(',')[1] ?? '') : '');
    reader.onerror = () => reject(reader.error ?? new Error('The preview could not be read.'));
    reader.readAsDataURL(blob);
  });
}

async function encode(
  canvas: HTMLCanvasElement,
  fallback: string,
): Promise<DocumentPreviewData | null> {
  let blob: Blob | null = null;
  if (webp !== false) {
    blob = await toBlob(canvas, 'image/webp');
    webp = blob?.type === 'image/webp';
    if (!webp) blob = null;
  }
  blob ??= await toBlob(canvas, fallback);
  return blob ? { mime: blob.type, base64: await base64Of(blob) } : null;
}

/** The first page at the size the card draws it, on white like paper. */
async function drawPdf(base64: string): Promise<HTMLCanvasElement> {
  const task = openPdf(base64);
  try {
    const page = await (await task.promise).getPage(1);
    const unscaled = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({
      scale: pdfCoverScale(unscaled.width, unscaled.height) * PIXELS,
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvas, viewport }).promise;
    return canvas;
  } finally {
    void task.destroy();
  }
}

async function drawPicture(source: DocumentPreviewData): Promise<HTMLCanvasElement | null> {
  if (typeof createImageBitmap !== 'function') return null;
  const bytes = Uint8Array.from(atob(source.base64), (character) => character.charCodeAt(0));
  const bitmap = await createImageBitmap(new Blob([bytes], { type: source.mime }));
  try {
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    bitmap.close();
  }
}

/**
 * The image a document card shows, drawn once from the file's bytes: a PDF's
 * first page, or a picture scaled down. `null` when drawing gains nothing or
 * the webview cannot draw it; the card then shows the file itself.
 */
export async function renderThumbnail(
  source: DocumentPreviewData,
): Promise<DocumentPreviewData | null> {
  if (AS_IS.has(source.mime)) return null;
  if (source.mime === 'application/pdf') return encode(await drawPdf(source.base64), 'image/jpeg');
  const canvas = await drawPicture(source);
  // A picture may be see-through, which JPEG cannot keep.
  return canvas ? encode(canvas, 'image/png') : null;
}
