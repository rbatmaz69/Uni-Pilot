export type FocusMediaKind = 'image' | 'video' | 'music';
export type VideoAudioSource = 'detected' | 'fallback' | 'manual';

export interface StoredFocusMedia {
  id: string;
  kind: FocusMediaKind;
  name: string;
  file: Blob;
  addedAt: number;
  hasAudio?: boolean;
  audioSource?: VideoAudioSource;
}

interface LegacyFocusBackground {
  id: string;
  name: string;
  image: Blob;
  addedAt: number;
}

const DATABASE = 'uni-pilot.focus-backgrounds';
const DATABASE_VERSION = 2;
const STORES: Record<FocusMediaKind, string> = {
  image: 'images',
  video: 'videos',
  music: 'music',
};

export const FOCUS_MEDIA_RULES = {
  image: {
    accept: ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif'],
    extensions: ['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif'],
    maxBytes: 50 * 1024 * 1024,
    error: 'Use a JPEG, PNG, WebP, AVIF or GIF image up to 50 MB.',
  },
  video: {
    accept: ['video/mp4', 'video/webm', 'video/quicktime'],
    extensions: ['mp4', 'webm', 'mov'],
    maxBytes: 200 * 1024 * 1024,
    error: 'Use an MP4, WebM or MOV video up to 200 MB.',
  },
  music: {
    accept: ['audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/x-wav', 'audio/flac', 'audio/x-flac'],
    extensions: ['mp3', 'ogg', 'wav', 'flac'],
    maxBytes: 50 * 1024 * 1024,
    error: 'Use an MP3, OGG, WAV or FLAC audio file up to 50 MB.',
  },
} as const;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      Object.values(STORES).forEach((storeName) => {
        if (!request.result.objectStoreNames.contains(storeName)) {
          request.result.createObjectStore(storeName, { keyPath: 'id' });
        }
      });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error('Could not open focus media storage.'));
  });
}

async function transact<T>(
  kind: FocusMediaKind,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    let result: T;
    try {
      const transaction = db.transaction(STORES[kind], mode);
      const request = run(transaction.objectStore(STORES[kind]));
      request.onsuccess = () => {
        result = request.result;
      };
      transaction.oncomplete = () => {
        db.close();
        resolve(result);
      };
      transaction.onerror = () => {
        db.close();
        reject(transaction.error ?? new Error('Could not update focus media.'));
      };
      transaction.onabort = () => {
        db.close();
        reject(transaction.error ?? new Error('Focus media storage was interrupted.'));
      };
    } catch (error) {
      db.close();
      reject(error instanceof Error ? error : new Error('Focus media storage failed.'));
    }
  });
}

function fileExtension(name: string) {
  return name.split('.').pop()?.toLowerCase() ?? '';
}

export function validateFocusMediaFile(kind: FocusMediaKind, file: File) {
  const rules = FOCUS_MEDIA_RULES[kind];
  const acceptedType = (rules.accept as readonly string[]).includes(file.type);
  const acceptedExtension = (rules.extensions as readonly string[]).includes(
    fileExtension(file.name),
  );
  if (
    file.size === 0 ||
    file.size > rules.maxBytes ||
    (!acceptedType && !(file.type === '' && acceptedExtension))
  ) {
    throw new Error(rules.error);
  }
}

function normalizeImage(row: StoredFocusMedia | LegacyFocusBackground): StoredFocusMedia {
  if ('file' in row) return { ...row, kind: 'image' };
  return {
    id: row.id,
    kind: 'image',
    name: row.name,
    file: row.image,
    addedAt: row.addedAt,
  };
}

export async function listFocusMedia(kind: FocusMediaKind): Promise<StoredFocusMedia[]> {
  const rows = await transact<Array<StoredFocusMedia | LegacyFocusBackground>>(
    kind,
    'readonly',
    (store) => store.getAll() as IDBRequest<Array<StoredFocusMedia | LegacyFocusBackground>>,
  );
  return rows.map((row) => (kind === 'image' ? normalizeImage(row) : (row as StoredFocusMedia)));
}

interface AddFocusMediaOptions {
  hasAudio?: boolean | undefined;
  audioSource?: VideoAudioSource | undefined;
}

export async function addFocusMedia(
  kind: FocusMediaKind,
  file: File,
  options: AddFocusMediaOptions = {},
): Promise<StoredFocusMedia> {
  validateFocusMediaFile(kind, file);
  const id = `${kind}:${crypto.randomUUID()}`;
  const media: StoredFocusMedia = {
    id,
    kind,
    name: file.name,
    file,
    addedAt: Date.now(),
    ...(kind === 'video'
      ? {
          hasAudio: options.hasAudio ?? true,
          audioSource: options.audioSource ?? 'fallback',
        }
      : {}),
  };
  await transact<IDBValidKey>(kind, 'readwrite', (store) => store.put(media));
  return media;
}

export async function removeFocusMedia(kind: FocusMediaKind, id: string): Promise<void> {
  await transact<undefined>(kind, 'readwrite', (store) => store.delete(id));
}

export async function updateFocusVideoAudio(
  id: string,
  hasAudio: boolean,
): Promise<StoredFocusMedia> {
  const video = await transact<StoredFocusMedia | undefined>(
    'video',
    'readonly',
    (store) => store.get(id) as IDBRequest<StoredFocusMedia | undefined>,
  );
  if (!video) throw new Error('This video is no longer stored on this device.');
  const updated: StoredFocusMedia = { ...video, hasAudio, audioSource: 'manual' };
  await transact<IDBValidKey>('video', 'readwrite', (store) => store.put(updated));
  return updated;
}
