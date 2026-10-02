import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addFocusMedia,
  listFocusMedia,
  removeFocusMedia,
  updateFocusVideoAudio,
  validateFocusMediaFile,
} from '@/features/focus/lib/media';

const DATABASE = 'uni-pilot.focus-backgrounds';

function openLegacyDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('images', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open legacy database.'));
  });
}

function complete(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('Could not complete database transaction.'));
  });
}

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'media-id') });
});

describe('focus media storage', () => {
  it('upgrades legacy image storage without losing existing images', async () => {
    const db = await openLegacyDatabase();
    const transaction = db.transaction('images', 'readwrite');
    transaction.objectStore('images').put({
      id: 'legacy-image',
      name: 'forest.png',
      image: new File(['forest'], 'forest.png', { type: 'image/png' }),
      addedAt: 10,
    });
    await complete(transaction);
    db.close();

    const images = await listFocusMedia('image');
    expect(images).toHaveLength(1);
    expect(images[0]).toMatchObject({
      id: 'legacy-image',
      kind: 'image',
      name: 'forest.png',
      addedAt: 10,
    });
    expect(images[0]).toHaveProperty('file');

    const upgraded = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DATABASE, 2);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(request.error ?? new Error('Could not open upgraded database.'));
    });
    expect(Array.from(upgraded.objectStoreNames)).toEqual(['images', 'music', 'videos']);
    upgraded.close();
  });

  it('stores, updates and removes custom video and music records', async () => {
    const video = await addFocusMedia(
      'video',
      new File(['video'], 'rain.mp4', { type: 'video/mp4' }),
      { hasAudio: false, audioSource: 'detected' },
    );
    const music = await addFocusMedia(
      'music',
      new File(['music'], 'waves.mp3', { type: 'audio/mpeg' }),
    );

    expect(await listFocusMedia('video')).toEqual([
      expect.objectContaining({
        id: video.id,
        kind: 'video',
        name: 'rain.mp4',
        hasAudio: false,
        audioSource: 'detected',
      }),
    ]);
    expect(await listFocusMedia('music')).toEqual([
      expect.objectContaining({ id: music.id, kind: 'music', name: 'waves.mp3' }),
    ]);

    const updated = await updateFocusVideoAudio(video.id, true);
    expect(updated).toMatchObject({ hasAudio: true, audioSource: 'manual' });

    await removeFocusMedia('music', music.id);
    expect(await listFocusMedia('music')).toEqual([]);
  });

  it('validates each media kind before opening IndexedDB', () => {
    expect(() =>
      validateFocusMediaFile('image', new File(['x'], 'notes.txt', { type: 'text/plain' })),
    ).toThrow('Use a JPEG, PNG, WebP, AVIF or GIF image up to 50 MB.');
    expect(() =>
      validateFocusMediaFile('video', new File(['x'], 'movie.avi', { type: 'video/x-msvideo' })),
    ).toThrow('Use an MP4, WebM or MOV video up to 200 MB.');
    expect(() =>
      validateFocusMediaFile('music', new File(['x'], 'track.aac', { type: 'audio/aac' })),
    ).toThrow('Use an MP3, OGG, WAV or FLAC audio file up to 50 MB.');

    const oversized = new File(['x'], 'large.mp4', { type: 'video/mp4' });
    Object.defineProperty(oversized, 'size', { value: 200 * 1024 * 1024 + 1 });
    expect(() => validateFocusMediaFile('video', oversized)).toThrow('up to 200 MB');

    expect(() =>
      validateFocusMediaFile('music', new File(['x'], 'track.flac', { type: '' })),
    ).not.toThrow();
  });
});
