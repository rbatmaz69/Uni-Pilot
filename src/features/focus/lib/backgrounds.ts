/** User-supplied images live in IndexedDB so large photos do not fill localStorage. */
export interface FocusBackground {
  id: string;
  name: string;
  image: Blob;
  addedAt: number;
}

const DATABASE = 'uni-pilot.focus-backgrounds';
const STORE = 'images';

export const ACCEPTED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/gif',
];
export const MAX_IMAGE_BYTES = 50 * 1024 * 1024;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error('Could not open background storage.'));
  });
}

async function transact<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    let result: T;
    try {
      const transaction = db.transaction(STORE, mode);
      const request = run(transaction.objectStore(STORE));
      request.onsuccess = () => {
        result = request.result;
      };
      transaction.oncomplete = () => {
        db.close();
        resolve(result);
      };
      transaction.onerror = () => {
        db.close();
        reject(transaction.error ?? new Error('Could not save the background.'));
      };
      transaction.onabort = () => {
        db.close();
        reject(transaction.error ?? new Error('Background storage was interrupted.'));
      };
    } catch (error) {
      db.close();
      reject(error instanceof Error ? error : new Error('Background storage failed.'));
    }
  });
}

export function listFocusBackgrounds() {
  return transact<FocusBackground[]>(
    'readonly',
    (store) => store.getAll() as IDBRequest<FocusBackground[]>,
  );
}

export async function addFocusBackground(file: File): Promise<string> {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type) || file.size > MAX_IMAGE_BYTES || file.size === 0) {
    throw new Error('Use a JPEG, PNG, WebP, AVIF or GIF image up to 50 MB.');
  }
  const id = crypto.randomUUID();
  const image: FocusBackground = { id, name: file.name, image: file, addedAt: Date.now() };
  await transact<IDBValidKey>('readwrite', (store) => store.put(image));
  return id;
}

export async function removeFocusBackground(id: string): Promise<void> {
  await transact<undefined>('readwrite', (store) => store.delete(id));
}
