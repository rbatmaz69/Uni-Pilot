import { createContext, useContext } from 'react';
import type { FocusMediaKind, StoredFocusMedia } from '@/features/focus/lib/media';

export interface FocusMediaItem extends StoredFocusMedia {
  url: string;
}

export interface FocusMediaContextValue {
  images: FocusMediaItem[];
  videos: FocusMediaItem[];
  music: FocusMediaItem[];
  loading: boolean;
  error: string | null;
  addFiles: (kind: FocusMediaKind, files: File[]) => Promise<FocusMediaItem[]>;
  remove: (item: FocusMediaItem) => Promise<void>;
  setVideoHasAudio: (id: string, hasAudio: boolean) => Promise<void>;
}

export const FocusMediaContext = createContext<FocusMediaContextValue | null>(null);

export function useFocusMedia() {
  const context = useContext(FocusMediaContext);
  if (!context) throw new Error('useFocusMedia must be used inside FocusMediaProvider.');
  return context;
}
