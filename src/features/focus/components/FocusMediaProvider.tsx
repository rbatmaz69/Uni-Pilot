import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  addFocusMedia,
  listFocusMedia,
  removeFocusMedia,
  updateFocusVideoAudio,
  type FocusMediaKind,
  type StoredFocusMedia,
} from '@/features/focus/lib/media';
import { detectVideoHasAudio } from '@/features/focus/lib/videoMetadata';
import {
  FocusMediaContext,
  type FocusMediaContextValue,
  type FocusMediaItem,
} from '@/features/focus/components/FocusMediaContext';

function newestFirst(items: FocusMediaItem[]) {
  return [...items].sort((a, b) => b.addedAt - a.addedAt);
}

export function FocusMediaProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<FocusMediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const urlsRef = useRef(new Map<string, string>());

  const withUrl = useCallback((item: StoredFocusMedia): FocusMediaItem => {
    const previous = urlsRef.current.get(item.id);
    const url = previous ?? URL.createObjectURL(item.file);
    urlsRef.current.set(item.id, url);
    return { ...item, url };
  }, []);

  useEffect(() => {
    let alive = true;
    const objectUrls = urlsRef.current;
    Promise.all([listFocusMedia('image'), listFocusMedia('video'), listFocusMedia('music')])
      .then((groups) => {
        if (!alive) return;
        setItems(groups.flat().map(withUrl));
        setError(null);
      })
      .catch(() => {
        if (alive) setError('Could not load media stored on this device.');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
      objectUrls.clear();
    };
  }, [withUrl]);

  const addFiles = useCallback(
    async (kind: FocusMediaKind, files: File[]) => {
      const added: FocusMediaItem[] = [];
      for (const file of files) {
        let hasAudio: boolean | undefined;
        let audioSource: 'detected' | 'fallback' | undefined;
        if (kind === 'video') {
          try {
            hasAudio = await detectVideoHasAudio(file);
            audioSource = 'detected';
          } catch {
            hasAudio = true;
            audioSource = 'fallback';
          }
        }
        const stored = await addFocusMedia(
          kind,
          file,
          kind === 'video' ? { hasAudio, audioSource } : {},
        );
        const item = withUrl(stored);
        added.push(item);
        setItems((current) => [item, ...current]);
      }
      return added;
    },
    [withUrl],
  );

  const remove = useCallback(async (item: FocusMediaItem) => {
    await removeFocusMedia(item.kind, item.id);
    const url = urlsRef.current.get(item.id);
    if (url) URL.revokeObjectURL(url);
    urlsRef.current.delete(item.id);
    setItems((current) => current.filter((candidate) => candidate.id !== item.id));
  }, []);

  const setVideoHasAudio = useCallback(async (id: string, hasAudio: boolean) => {
    const updated = await updateFocusVideoAudio(id, hasAudio);
    setItems((current) =>
      current.map((item) =>
        item.id === id
          ? {
              ...item,
              hasAudio: updated.hasAudio ?? true,
              audioSource: updated.audioSource ?? 'manual',
            }
          : item,
      ),
    );
  }, []);

  const value = useMemo<FocusMediaContextValue>(() => {
    const byKind = (kind: FocusMediaKind) =>
      newestFirst(items.filter((item) => item.kind === kind));
    return {
      images: byKind('image'),
      videos: byKind('video'),
      music: byKind('music'),
      loading,
      error,
      addFiles,
      remove,
      setVideoHasAudio,
    };
  }, [addFiles, error, items, loading, remove, setVideoHasAudio]);

  return <FocusMediaContext.Provider value={value}>{children}</FocusMediaContext.Provider>;
}
