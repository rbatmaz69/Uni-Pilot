import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { FOLDER_TONES, FOLDER_TONE_COLORS, folderTone } from '../lib/folderTone';

export type FolderIconStyle = 'layered' | 'outline';
export type FolderAppearance = { color: string; style: FolderIconStyle };
// Stable objects keep Zustand selectors from returning a new value on every read.
const defaults = Object.fromEntries(
  FOLDER_TONES.map((tone) => [
    tone,
    { color: FOLDER_TONE_COLORS[tone], style: 'layered' as const },
  ]),
) as Record<(typeof FOLDER_TONES)[number], FolderAppearance>;

export function defaultFolderAppearance(path: string, name = path.split('/').at(-1) ?? path) {
  return defaults[folderTone(name)];
}
export const FOLDER_COLORS = [
  { name: 'Blue', color: '#55a6d7' },
  { name: 'Green', color: '#53ad87' },
  { name: 'Teal', color: '#49a9ae' },
  { name: 'Yellow', color: '#d9b34b' },
  { name: 'Orange', color: '#df9457' },
  { name: 'Rose', color: '#ce7d95' },
  { name: 'Purple', color: '#a28ad0' },
  { name: 'Gray', color: '#8d99a5' },
] as const;

interface FolderAppearanceState {
  appearances: Record<string, FolderAppearance>;
  setAppearance: (path: string, change: Partial<FolderAppearance>) => void;
  reset: (path: string) => void;
  relocate: (from: string, to: string) => void;
  forget: (path: string) => void;
}

const within = (path: string, parent: string) => path === parent || path.startsWith(`${parent}/`);

/** Local display preferences, keyed by workspace-relative folder path. */
export const useFolderAppearanceStore = create<FolderAppearanceState>()(
  persist(
    (set) => ({
      appearances: {},
      setAppearance: (path, change) =>
        set((state) => {
          const next = { ...(state.appearances[path] ?? defaultFolderAppearance(path)), ...change };
          if (!/^#[0-9a-f]{6}$/i.test(next.color)) return state;
          return { appearances: { ...state.appearances, [path]: next } };
        }),
      reset: (path) =>
        set((state) => {
          const appearances = { ...state.appearances };
          delete appearances[path];
          return { appearances };
        }),
      relocate: (from, to) =>
        set((state) => ({
          appearances: Object.fromEntries(
            Object.entries(state.appearances).map(([path, appearance]) => [
              within(path, from) ? `${to}${path.slice(from.length)}` : path,
              appearance,
            ]),
          ),
        })),
      forget: (path) =>
        set((state) => ({
          appearances: Object.fromEntries(
            Object.entries(state.appearances).filter(([key]) => !within(key, path)),
          ),
        })),
    }),
    {
      name: 'uni-pilot.folder-appearance',
      version: 0,
      partialize: (state) => ({ appearances: state.appearances }),
    },
  ),
);

/** One source for the sidebar, Favorites, color picker and canvas artwork. */
export function useFolderAppearance(path: string, name?: string) {
  return useFolderAppearanceStore(
    (state) => state.appearances[path] ?? defaultFolderAppearance(path, name),
  );
}
