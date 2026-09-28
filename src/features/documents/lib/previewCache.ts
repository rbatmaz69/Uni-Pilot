import {
  documentRequest,
  type DocumentEntry,
  type DocumentPreviewData,
} from '@/features/documents/lib/files';
import { slicePreviewText } from './previewText';

// Base64 characters kept in memory before the least recently used are dropped.
const BUDGET = 160 * 1024 * 1024;

interface Slot<T> {
  promise: Promise<T>;
  weight: number;
}

/**
 * Promise cache with least-recently-used eviction by weight. Failed loads are
 * forgotten so the next request tries again.
 */
function createCache<T>(weigh: (value: T) => number) {
  const slots = new Map<string, Slot<T>>();
  let total = 0;

  function evict() {
    for (const [key, slot] of slots) {
      if (total <= BUDGET) return;
      slots.delete(key);
      total -= slot.weight;
    }
  }

  return {
    get(key: string, load: () => Promise<T>): Promise<T> {
      const cached = slots.get(key);
      if (cached) {
        slots.delete(key);
        slots.set(key, cached);
        return cached.promise;
      }
      const slot: Slot<T> = { promise: load(), weight: 0 };
      slots.set(key, slot);
      slot.promise.then(
        (value) => {
          if (slots.get(key) !== slot) return;
          slot.weight = weigh(value);
          total += slot.weight;
          evict();
        },
        () => {
          if (slots.get(key) === slot) slots.delete(key);
        },
      );
      return slot.promise;
    },
    clear() {
      slots.clear();
      total = 0;
    },
  };
}

const previews = createCache<DocumentPreviewData>((data) => data.base64.length);
const excerpts = createCache<string>((text) => text.length);
const notePreviews = createCache<string>((text) => text.length);

// A changed file has a new modification time or size, and so a new key.
const version = (entry: DocumentEntry) => `${entry.path}\n${entry.modified}\n${entry.size}`;

/** Preview bytes for a file, read again only after the file changes. */
export function loadPreview(entry: DocumentEntry) {
  return previews.get(version(entry), () =>
    documentRequest<DocumentPreviewData>({ action: 'preview', path: entry.path }),
  );
}

/** Pasted images get unique names and are never rewritten, so the path is enough. */
export function loadAttachment(path: string) {
  return previews.get(path, () =>
    documentRequest<DocumentPreviewData>({ action: 'preview', path }),
  );
}

/** The opening text of a note for its canvas card. */
export function loadExcerpt(entry: DocumentEntry) {
  return excerpts.get(version(entry), async () =>
    (await documentRequest<string>({ action: 'read', path: entry.path })).slice(0, 600),
  );
}

/** Enough of a note to render its first visible page, including tables and image links. */
export function loadNotePreview(entry: DocumentEntry) {
  return notePreviews.get(version(entry), async () =>
    slicePreviewText(
      await documentRequest<string>({ action: 'read', path: entry.path }),
      64 * 1024,
    ),
  );
}

export function clearPreviewCache() {
  previews.clear();
  excerpts.clear();
  notePreviews.clear();
}
