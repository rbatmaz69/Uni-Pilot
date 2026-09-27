import { invoke } from '@tauri-apps/api/core';

export interface DocumentEntry {
  name: string;
  path: string;
  folder: boolean;
  size: number;
  modified: number;
}
export interface DirectoryListing {
  root: string;
  entries: DocumentEntry[];
}
export interface DocumentPreviewData {
  mime: string;
  base64: string;
}
export interface SearchHit extends DocumentEntry {
  /** The first line of a note that contains the query. */
  snippet: string | null;
  matches: number;
  nameMatch: boolean;
}
export type DocumentRequest =
  | {
      action: 'list' | 'read' | 'readDrawing' | 'preview' | 'trash' | 'open' | 'reveal';
      path: string;
    }
  | { action: 'create'; path: string; name: string; folder: boolean }
  | { action: 'save'; path: string; content: string; expected: string }
  | { action: 'saveDrawing'; path: string; content: string }
  | { action: 'move'; path: string; destination: string; name: string }
  | { action: 'search'; query: string };

export type DocumentUpload =
  | { kind: 'import'; path: string; name: string }
  | { kind: 'attachment'; note: string; name: string };

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export function documentRequest<T = void>(request: DocumentRequest): Promise<T> {
  return invoke<T>('document_request', { request });
}

function base64Utf8(text: string) {
  let binary = '';
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/**
 * Sends file bytes as a raw IPC body. A JSON array of numbers — what passing
 * `Array.from(bytes)` produces — costs several bytes of JSON per byte of file.
 */
export function uploadDocument<T = void>(upload: DocumentUpload, bytes: Uint8Array): Promise<T> {
  return invoke<T>('document_upload', bytes, {
    headers: { 'x-uni-pilot-upload': base64Utf8(JSON.stringify(upload)) },
  });
}

export function editable(entry: DocumentEntry) {
  return !entry.folder && /\.(md|markdown|txt)$/i.test(entry.name);
}
export function previewable(entry: DocumentEntry) {
  return !entry.folder && /\.(pdf|png|jpe?g|gif|webp|bmp|svg|ico|avif)$/i.test(entry.name);
}
export function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
export function fileKind(entry: DocumentEntry) {
  if (entry.folder) return 'Folder';
  if (editable(entry)) return /\.txt$/i.test(entry.name) ? 'Plain text' : 'Markdown';
  return `${entry.name.includes('.') ? entry.name.split('.').at(-1)?.toUpperCase() : 'Document'} file`;
}
export function sortEntries(entries: DocumentEntry[], query: string, sort: string) {
  return entries
    .filter((entry) => entry.name.toLowerCase().includes(query.toLowerCase()))
    .sort(
      (a, b) =>
        Number(b.folder) - Number(a.folder) ||
        (sort === 'modified'
          ? b.modified - a.modified
          : a.name.localeCompare(b.name, undefined, { numeric: true })),
    );
}
