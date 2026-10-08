import { Editor } from '@tiptap/core';
import { PDFDocument } from 'pdf-lib';
import {
  documentRequest,
  uploadDocument,
  type DirectoryListing,
  type DocumentEntry,
  type DocumentPreviewData,
} from '@/features/documents/lib/files';
import { imagesPdf, uniqueOutputName } from '@/features/documents/lib/documentTools';
import { noteExtensions, composeNote } from '@/features/documents/lib/markdown';

export function studyDocument(entry: DocumentEntry) {
  return (
    !entry.folder &&
    !entry.path.startsWith('.trash/') &&
    /\.(pdf|png|jpe?g|gif|webp|bmp|avif)$/i.test(entry.name)
  );
}

export function studySource(content: string): string | null {
  const match = /^---\r?\nuni-pilot-source: ("[^\r\n]+")\r?\n/.exec(content);
  if (!match) return null;
  try {
    const path: unknown = JSON.parse(match[1]!);
    return typeof path === 'string' ? path : null;
  } catch {
    return null;
  }
}

export function decodePreview(data: DocumentPreviewData): Uint8Array {
  return Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));
}

/** Reopen the companion, even when ILIAS has downloaded a newer original. */
export async function openStudyDocument(
  entry: DocumentEntry,
): Promise<{ entry: DocumentEntry; content: string }> {
  const folder = entry.path.split('/').slice(0, -1).join('/');
  const name = `${entry.name.slice(0, 160)} (Aufschriebe).md`;
  const listing = await documentRequest<DirectoryListing>({ action: 'list', path: folder });
  const stem = name.slice(0, -3);
  for (const candidate of listing.entries.filter(
    (item) =>
      !item.folder &&
      (item.name === name || item.name.startsWith(`${stem} `)) &&
      /\.md$/i.test(item.name),
  )) {
    const content = await documentRequest<string>({ action: 'read', path: candidate.path });
    if (studySource(content) === entry.path) return { entry: candidate, content };
  }
  const data = await documentRequest<DocumentPreviewData>({ action: 'preview', path: entry.path });
  let bytes = decodePreview(data);
  if (!/\.pdf$/i.test(entry.name))
    bytes = await imagesPdf([{ bytes, extension: entry.name.split('.').at(-1)!.toLowerCase() }]);
  const pdf = await PDFDocument.load(bytes);
  if (!pdf.getPageCount() || pdf.getPageCount() > 500)
    throw new Error('Bitte ein PDF mit 1 bis 500 Seiten öffnen.');
  const output = uniqueOutputName(
    name,
    listing.entries.map((item) => item.name),
  );
  const path = folder ? `${folder}/${output}` : output;
  await documentRequest({ action: 'create', path: folder, name: output, folder: false });
  try {
    const { src } = await uploadDocument<{ src: string }>(
      { kind: 'attachment', note: path, name: 'original.pdf' },
      bytes,
    );
    const editor = new Editor({ extensions: noteExtensions() });
    let content: string;
    try {
      editor.commands.setContent({
        type: 'doc',
        content: pdf.getPages().map((page, index) => {
          const crop = page.getCropBox();
          const swapped = Math.abs(page.getRotation().angle % 180) === 90;
          return {
            type: 'pdfPage',
            attrs: {
              src,
              page: index + 1,
              width: swapped ? crop.height : crop.width,
              height: swapped ? crop.width : crop.height,
              ink: '[]',
            },
          };
        }),
      });
      content = composeNote(
        `---\nuni-pilot-source: ${JSON.stringify(entry.path)}\n---\n`,
        editor.getMarkdown(),
      );
    } finally {
      editor.destroy();
    }
    const result = await documentRequest<{ status: 'saved' | 'conflict' }>({
      action: 'save',
      path,
      content,
      expected: '',
    });
    if (result.status !== 'saved')
      throw new Error('Die Aufschriebe wurden gleichzeitig geändert. Bitte erneut öffnen.');
    return {
      entry: {
        name: output,
        path,
        folder: false,
        size: new TextEncoder().encode(content).length,
        modified: Date.now(),
      },
      content,
    };
  } catch (cause) {
    // A failed import must not leave an empty companion that would be reopened next time.
    const disk = await documentRequest<string>({ action: 'read', path }).catch(() => null);
    if (disk === '') await documentRequest({ action: 'trash', path }).catch(() => undefined);
    throw cause;
  }
}

export function studyEditorLink(path: string): string {
  return `/documents?${new URLSearchParams({ path: path.split('/').slice(0, -1).join('/'), file: path })}`;
}
