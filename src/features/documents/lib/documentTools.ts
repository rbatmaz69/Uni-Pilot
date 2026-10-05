import {
  documentRequest,
  MAX_UPLOAD_BYTES,
  uploadDocument,
  type DirectoryListing,
  type DocumentEntry,
  type DocumentPreviewData,
} from './files';

export type DocumentTool =
  | 'smaller-image'
  | 'jpg'
  | 'png'
  | 'webp'
  | 'image-pdf'
  | 'multi-image-pdf'
  | 'merge-pdf'
  | 'extract-pages'
  | 'reorder-pdf'
  | 'split-pdf'
  | 'pdf-image'
  | 'smaller-pdf'
  | 'note-pdf';

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif']);

export function fileExtension(name: string): string {
  return name.includes('.') ? (name.split('.').at(-1)?.toLowerCase() ?? '') : '';
}

export function availableDocumentTools(
  entry: DocumentEntry,
  siblings: DocumentEntry[],
): DocumentTool[] {
  if (entry.folder || entry.path.startsWith('.trash/')) return [];
  const extension = fileExtension(entry.name);
  if (IMAGE_EXTENSIONS.has(extension)) {
    return [
      'smaller-image',
      ...(['jpg', 'png', 'webp'] as const).filter(
        (format) => format !== extension && !(format === 'jpg' && extension === 'jpeg'),
      ),
      'image-pdf',
      ...(siblings.some(
        (other) =>
          other.path !== entry.path &&
          !other.folder &&
          IMAGE_EXTENSIONS.has(fileExtension(other.name)),
      )
        ? (['multi-image-pdf'] as const)
        : []),
    ];
  }
  if (extension === 'pdf') {
    return [
      ...(siblings.some((other) => other.path !== entry.path && fileExtension(other.name) === 'pdf')
        ? (['merge-pdf'] as const)
        : []),
      'extract-pages',
      'reorder-pdf',
      'split-pdf',
      'pdf-image',
      'smaller-pdf',
    ];
  }
  if (['md', 'markdown', 'txt'].includes(extension)) return ['note-pdf'];
  return [];
}

export function parsePageRange(input: string, pageCount: number): number[] {
  const pages: number[] = [];
  if (!input.trim()) throw new Error('Enter pages, such as 1-3, 5.');
  for (const raw of input.split(',')) {
    const match = /^\s*(\d+)(?:\s*-\s*(\d+))?\s*$/.exec(raw);
    if (!match) throw new Error('Use page numbers like 1-3, 5.');
    const first = Number(match[1]);
    const last = Number(match[2] ?? match[1]);
    if (first < 1 || last < first || last > pageCount) {
      throw new Error(`Choose pages from 1 to ${pageCount}, in ascending ranges.`);
    }
    for (let page = first; page <= last; page++) {
      if (pages.includes(page - 1)) throw new Error('Each page can appear only once.');
      pages.push(page - 1);
      if (pages.length > 100) throw new Error('Extract up to 100 pages at a time.');
    }
  }
  return pages;
}

export function uniqueOutputName(name: string, existing: string[]): string {
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot) : '';
  const taken = new Set(existing.map((item) => item.toLowerCase()));
  if (!taken.has(name.toLowerCase())) return name;
  for (let number = 2; number < 1000; number++) {
    const candidate = `${stem} ${number}${extension}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  throw new Error('Could not find a free name for the converted file.');
}

async function readBytes(entry: DocumentEntry): Promise<Uint8Array> {
  const data = await documentRequest<DocumentPreviewData>({ action: 'preview', path: entry.path });
  return Uint8Array.from(atob(data.base64), (character) => character.charCodeAt(0));
}

async function decodedImage(
  bytes: Uint8Array,
  extension: string,
): Promise<{ source: CanvasImageSource; width: number; height: number; dispose: () => void }> {
  let blob: Blob = new Blob([Uint8Array.from(bytes)], {
    type: extension === 'jpg' || extension === 'jpeg' ? 'image/jpeg' : `image/${extension}`,
  });
  if (extension === 'heic' || extension === 'heif') {
    const { heicTo } = await import('heic-to/csp');
    blob = await heicTo({ blob, type: 'image/png' });
  }
  try {
    if (typeof createImageBitmap === 'function') {
      const bitmap = await createImageBitmap(blob);
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        dispose: () => bitmap.close(),
      };
    }
    const url = URL.createObjectURL(blob);
    try {
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error('Image decode failed.'));
        image.src = url;
      });
      return {
        source: image,
        width: image.naturalWidth,
        height: image.naturalHeight,
        dispose: () => URL.revokeObjectURL(url),
      };
    } catch (cause) {
      URL.revokeObjectURL(url);
      throw cause;
    }
  } catch {
    throw new Error('This image could not be decoded. Try opening it in its default app.');
  }
}

async function canvasBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number,
): Promise<Blob> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
  if (!blob || blob.type !== type) throw new Error(`This device cannot create ${type} images.`);
  return blob;
}

async function imageOutput(
  bytes: Uint8Array,
  extension: string,
  target: 'jpg' | 'png' | 'webp',
  compact = false,
): Promise<Uint8Array> {
  const image = await decodedImage(bytes, extension);
  try {
    const maxSide = compact ? 2000 : 6000;
    const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image conversion is unavailable on this device.');
    if (target === 'jpg') {
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    context.drawImage(image.source, 0, 0, canvas.width, canvas.height);
    const mime = target === 'jpg' ? 'image/jpeg' : `image/${target}`;
    const blob = await canvasBlob(canvas, mime, compact ? 0.76 : 0.92);
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    image.dispose();
  }
}

async function imagesPdf(
  images: Array<{ bytes: Uint8Array; extension: string }>,
): Promise<Uint8Array> {
  const { PDFDocument } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  for (const source of images) {
    const photo = await imageOutput(source.bytes, source.extension, 'jpg');
    const image = await pdf.embedJpg(photo);
    const landscape = image.width > image.height * 1.15;
    const width = landscape ? 842 : 595;
    const height = landscape ? 595 : 842;
    const page = pdf.addPage([width, height]);
    const scale = Math.min((width - 48) / image.width, (height - 48) / image.height);
    const drawnWidth = image.width * scale;
    const drawnHeight = image.height * scale;
    page.drawImage(image, {
      x: (width - drawnWidth) / 2,
      y: (height - drawnHeight) / 2,
      width: drawnWidth,
      height: drawnHeight,
    });
  }
  return new Uint8Array(await pdf.save());
}

async function mergePdf(first: Uint8Array, second: Uint8Array): Promise<Uint8Array> {
  const { PDFDocument } = await import('pdf-lib');
  const output = await PDFDocument.create();
  for (const bytes of [first, second]) {
    const source = await PDFDocument.load(bytes);
    const pages = await output.copyPages(source, source.getPageIndices());
    pages.forEach((page) => output.addPage(page));
  }
  return new Uint8Array(await output.save());
}

async function extractPdf(bytes: Uint8Array, range: string): Promise<Uint8Array> {
  const { PDFDocument } = await import('pdf-lib');
  const source = await PDFDocument.load(bytes);
  const indices = parsePageRange(range, source.getPageCount());
  const output = await PDFDocument.create();
  const pages = await output.copyPages(source, indices);
  pages.forEach((page) => output.addPage(page));
  return new Uint8Array(await output.save());
}

async function reorderPdf(bytes: Uint8Array, range: string): Promise<Uint8Array> {
  const { PDFDocument } = await import('pdf-lib');
  const source = await PDFDocument.load(bytes);
  const indices = parsePageRange(range, source.getPageCount());
  if (indices.length !== source.getPageCount()) {
    throw new Error(`Include all ${source.getPageCount()} pages exactly once.`);
  }
  const output = await PDFDocument.create();
  const pages = await output.copyPages(source, indices);
  pages.forEach((page) => output.addPage(page));
  return new Uint8Array(await output.save());
}

async function splitPdf(
  bytes: Uint8Array,
  afterPage: string,
): Promise<[Uint8Array, Uint8Array, number]> {
  const { PDFDocument } = await import('pdf-lib');
  const source = await PDFDocument.load(bytes);
  const point = Number(afterPage.trim());
  if (!Number.isInteger(point) || point < 1 || point >= source.getPageCount()) {
    throw new Error(`Split after a page from 1 to ${source.getPageCount() - 1}.`);
  }
  const halves: Uint8Array[] = [];
  for (const indices of [
    Array.from({ length: point }, (_, index) => index),
    Array.from({ length: source.getPageCount() - point }, (_, index) => point + index),
  ]) {
    const output = await PDFDocument.create();
    const pages = await output.copyPages(source, indices);
    pages.forEach((page) => output.addPage(page));
    halves.push(new Uint8Array(await output.save()));
  }
  return [halves[0]!, halves[1]!, source.getPageCount()];
}

async function pdfPageImage(bytes: Uint8Array, pageNumber: string): Promise<[Uint8Array, number]> {
  const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  GlobalWorkerOptions.workerSrc = workerUrl;
  const assets = new URL(`${import.meta.env.BASE_URL}pdfjs/`, window.location.href).href;
  const task = getDocument({
    data: Uint8Array.from(bytes),
    cMapUrl: `${assets}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${assets}standard_fonts/`,
    wasmUrl: `${assets}wasm/`,
  });
  try {
    const source = await task.promise;
    const number = Number(pageNumber.trim());
    if (!Number.isInteger(number) || number < 1 || number > source.numPages) {
      throw new Error(`Choose a page from 1 to ${source.numPages}.`);
    }
    const page = await source.getPage(number);
    const original = page.getViewport({ scale: 1 });
    const scale = Math.min(2, 2400 / Math.max(original.width, original.height));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('PDF conversion is unavailable on this device.');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: context, viewport }).promise;
    const result = new Uint8Array(await (await canvasBlob(canvas, 'image/png')).arrayBuffer());
    return [result, number];
  } finally {
    await task.destroy();
  }
}

async function notePdf(content: string): Promise<Uint8Array> {
  const { PDFDocument } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  const canvas = document.createElement('canvas');
  canvas.width = 1190;
  canvas.height = 1684;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('PDF export is unavailable on this device.');
  const margin = 105;
  const maxWidth = canvas.width - margin * 2;
  let y = margin;
  let pageCount = 0;
  function startPage() {
    context!.fillStyle = '#fff';
    context!.fillRect(0, 0, canvas.width, canvas.height);
    context!.fillStyle = '#202923';
    y = margin;
  }
  async function finishPage() {
    if (++pageCount > 50) throw new Error('Export notes up to 50 PDF pages at a time.');
    const jpg = new Uint8Array(await (await canvasBlob(canvas, 'image/jpeg', 0.88)).arrayBuffer());
    const image = await pdf.embedJpg(jpg);
    pdf.addPage([595, 842]).drawImage(image, { x: 0, y: 0, width: 595, height: 842 });
  }
  startPage();
  const markdown = content.split(/\r?\n/);
  let code = false;
  for (const raw of markdown) {
    if (/^\s*```/.test(raw)) {
      code = !code;
      y += 14;
      continue;
    }
    const heading = /^(#{1,6})\s+/.exec(raw);
    const fontSize = heading ? Math.max(25, 42 - heading[1]!.length * 4) : code ? 21 : 24;
    context.font = `${heading ? '700 ' : ''}${fontSize}px ${code ? 'monospace' : 'sans-serif'}`;
    const lineHeight = fontSize * 1.5;
    const text = raw
      .replace(/^#{1,6}\s+/, '')
      .replace(/^\s*[-*+]\s+/, '• ')
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '[Image: $1]')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/\*\*|__|`/g, '')
      .trim();
    if (!text) {
      y += lineHeight * 0.55;
      continue;
    }
    let line = '';
    for (const word of text.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && context.measureText(candidate).width > maxWidth) {
        if (y + lineHeight > canvas.height - margin) {
          await finishPage();
          startPage();
        }
        context.fillText(line, margin, y);
        y += lineHeight;
        line = word;
      } else line = candidate;
    }
    if (line) {
      if (y + lineHeight > canvas.height - margin) {
        await finishPage();
        startPage();
      }
      context.fillText(line, margin, y);
      y += lineHeight;
    }
    if (heading) y += 10;
  }
  await finishPage();
  return new Uint8Array(await pdf.save());
}

async function smallerPdf(bytes: Uint8Array): Promise<Uint8Array> {
  const [{ getDocument, GlobalWorkerOptions }, { PDFDocument }] = await Promise.all([
    import('pdfjs-dist'),
    import('pdf-lib'),
  ]);
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  GlobalWorkerOptions.workerSrc = workerUrl;
  const assets = new URL(`${import.meta.env.BASE_URL}pdfjs/`, window.location.href).href;
  const task = getDocument({
    data: Uint8Array.from(bytes),
    cMapUrl: `${assets}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${assets}standard_fonts/`,
    wasmUrl: `${assets}wasm/`,
  });
  try {
    const source = await task.promise;
    if (source.numPages > 50) throw new Error('Optimize PDFs up to 50 pages at a time.');
    const output = await PDFDocument.create();
    for (let index = 1; index <= source.numPages; index++) {
      const page = await source.getPage(index);
      const original = page.getViewport({ scale: 1 });
      const scale = Math.min(1.65, 1800 / Math.max(original.width, original.height));
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('PDF conversion is unavailable on this device.');
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: context, viewport }).promise;
      const jpg = new Uint8Array(
        await (await canvasBlob(canvas, 'image/jpeg', 0.66)).arrayBuffer(),
      );
      const image = await output.embedJpg(jpg);
      output.addPage([original.width, original.height]).drawImage(image, {
        x: 0,
        y: 0,
        width: original.width,
        height: original.height,
      });
      page.cleanup();
    }
    const result = new Uint8Array(await output.save());
    if (result.length >= bytes.length) {
      throw new Error('This PDF is already compact. No smaller copy was created.');
    }
    return result;
  } finally {
    await task.destroy();
  }
}

export async function runDocumentTool(
  entry: DocumentEntry,
  tool: DocumentTool,
  options: { other?: DocumentEntry; others?: DocumentEntry[]; pages?: string } = {},
): Promise<{ name: string; names: string[]; before: number; after: number }> {
  const folder = entry.path.includes('/') ? entry.path.slice(0, entry.path.lastIndexOf('/')) : '';
  const extension = fileExtension(entry.name);
  const stem = entry.name.slice(0, -(extension.length + 1));
  const bytes =
    tool === 'note-pdf'
      ? new TextEncoder().encode(
          await documentRequest<string>({ action: 'read', path: entry.path }),
        )
      : await readBytes(entry);
  const outputs: Array<{ name: string; bytes: Uint8Array }> = [];
  switch (tool) {
    case 'smaller-image': {
      const output = await imageOutput(bytes, extension, 'jpg', true);
      if (output.length >= bytes.length)
        throw new Error('This image is already compact. No larger copy was created.');
      outputs.push({ name: `${stem} (smaller).jpg`, bytes: output });
      break;
    }
    case 'jpg':
    case 'png':
    case 'webp':
      outputs.push({
        name: `${stem} (${tool.toUpperCase()}).${tool}`,
        bytes: await imageOutput(bytes, extension, tool),
      });
      break;
    case 'image-pdf':
      outputs.push({
        name: `${stem} (submission).pdf`,
        bytes: await imagesPdf([{ bytes, extension }]),
      });
      break;
    case 'multi-image-pdf': {
      const others = options.others ?? [];
      if (!others.length) throw new Error('Choose at least one more image.');
      const images = [{ bytes, extension }];
      for (const other of others) {
        if (other.path === entry.path || !IMAGE_EXTENSIONS.has(fileExtension(other.name))) {
          throw new Error('Choose other image files from this folder.');
        }
        images.push({ bytes: await readBytes(other), extension: fileExtension(other.name) });
      }
      outputs.push({ name: `${stem} (photos).pdf`, bytes: await imagesPdf(images) });
      break;
    }
    case 'merge-pdf':
      if (!options.other || options.other.path === entry.path)
        throw new Error('Choose another PDF.');
      outputs.push({
        name: `${stem} (combined).pdf`,
        bytes: await mergePdf(bytes, await readBytes(options.other)),
      });
      break;
    case 'extract-pages':
      outputs.push({
        name: `${stem} (selected pages).pdf`,
        bytes: await extractPdf(bytes, options.pages ?? ''),
      });
      break;
    case 'reorder-pdf':
      outputs.push({
        name: `${stem} (reordered).pdf`,
        bytes: await reorderPdf(bytes, options.pages ?? ''),
      });
      break;
    case 'split-pdf': {
      const [first, second, count] = await splitPdf(bytes, options.pages ?? '');
      const point = Number(options.pages?.trim());
      outputs.push(
        { name: `${stem} (pages 1-${point}).pdf`, bytes: first },
        { name: `${stem} (pages ${point + 1}-${count}).pdf`, bytes: second },
      );
      break;
    }
    case 'pdf-image': {
      const [image, number] = await pdfPageImage(bytes, options.pages ?? '');
      outputs.push({ name: `${stem} (page ${number}).png`, bytes: image });
      break;
    }
    case 'smaller-pdf':
      outputs.push({ name: `${stem} (smaller).pdf`, bytes: await smallerPdf(bytes) });
      break;
    case 'note-pdf':
      outputs.push({
        name: `${stem} (note text).pdf`,
        bytes: await notePdf(new TextDecoder().decode(bytes)),
      });
      break;
  }
  if (outputs.some((output) => output.bytes.length > MAX_UPLOAD_BYTES)) {
    throw new Error('The result is over 25 MB. Try extracting fewer pages or a smaller image.');
  }
  const listing = await documentRequest<DirectoryListing>({ action: 'list', path: folder });
  const existing = listing.entries.map((item) => item.name);
  const names: string[] = [];
  try {
    for (const output of outputs) {
      const name = uniqueOutputName(output.name, existing);
      await uploadDocument({ kind: 'import', path: folder, name }, output.bytes);
      existing.push(name);
      names.push(name);
    }
  } catch (cause) {
    for (const name of names) {
      const path = folder ? `${folder}/${name}` : name;
      try {
        await documentRequest({ action: 'trash', path });
      } catch {
        // Preserve the original error; cleanup is best effort.
      }
    }
    throw cause;
  }
  return {
    name: names[0]!,
    names,
    before: bytes.length,
    after: outputs.reduce((total, output) => total + output.bytes.length, 0),
  };
}
