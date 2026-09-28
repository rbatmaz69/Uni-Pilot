import { invoke } from '@tauri-apps/api/core';

/** What an entry is to the ILIAS course sync; absent/null for everything else. */
export type IliasMark =
  | 'root' // the managed ILIAS folder itself (holds the sync manifest)
  | 'folder' // a folder inside a managed ILIAS folder (mirrors an ILIAS folder)
  | 'file' // a file downloaded from ILIAS and tracked by the sync
  | 'gone'; // a file downloaded from ILIAS that ILIAS no longer lists (kept locally)

export interface IliasFolderInfo {
  courseRefId: string;
  courseTitle: string;
  /** Workspace-relative path of the managed ILIAS folder, e.g. "Courses/Summer 2026/Datenbanken/ILIAS". */
  root: string;
  /** ISO 8601 of the last completed sync, or null. */
  syncedAt: string | null;
  /** Whether Uni Pilot syncs it automatically. */
  auto: boolean;
}

/** A file the ILIAS sync keeps, as the ILIAS space lists it. */
export interface IliasFile {
  name: string;
  path: string;
  size: number;
  /** When ILIAS last changed it, `YYYY-MM-DDTHH:MM` in local time, if ILIAS said. */
  updatedAt: string | null;
  /** When it arrived on this computer, in milliseconds. */
  arrived: number;
  unseen?: boolean;
  /** ILIAS no longer lists it; the copy here stays. */
  gone?: boolean;
}

/** A course the ILIAS sync keeps, with its files. */
export interface IliasCourse {
  courseRefId: string;
  title: string;
  /** Workspace-relative path of the course's `ILIAS` folder. */
  root: string;
  syncedAt: string | null;
  unseen: number;
  files: IliasFile[];
}

export interface DocumentEntry {
  name: string;
  path: string;
  folder: boolean;
  size: number;
  modified: number;
  ilias?: IliasMark | null;
  /**
   * Files the ILIAS sync brought that were not opened yet: 1 on such a file,
   * on a folder all of them below it. Absent when there are none.
   */
  unseen?: number;
}
export interface DirectoryListing {
  root: string;
  entries: DocumentEntry[];
  /** Set when the listed folder is the managed ILIAS folder, or anywhere inside it. */
  ilias?: IliasFolderInfo | null;
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
  | { action: 'search'; query: string }
  /** Clears the new mark of a file from ILIAS, or of every file below a folder. */
  | { action: 'seen'; path: string }
  | { action: 'ilias' };

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
/** Why an entry cannot be renamed, moved or deleted, or null when it can. */
export function lockedReason(entry: DocumentEntry): string | null {
  if (entry.ilias === 'root')
    return 'This folder is kept in sync with ILIAS. Stop syncing the course in Courses to change it.';
  return null;
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
