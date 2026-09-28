import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DOCUMENTS, type Space } from '@/features/documents/lib/spaces';

interface SpaceState {
  /** The spaces the student added, in dock order. Documents and ILIAS are always there. */
  spaces: Space[];
  /** The space picked in the dock; `null` until one is, then the path decides. */
  picked: string | null;
  pick: (id: string) => void;
  /** Adds a space and picks it. */
  addSpace: (space: Omit<Space, 'id'>) => Space;
  updateSpace: (id: string, change: Partial<Omit<Space, 'id'>>) => void;
  /** Takes a space out of the dock. Its folder and files stay. */
  removeSpace: (id: string) => void;
}

export const useSpaceStore = create<SpaceState>()(
  persist(
    (set) => ({
      spaces: [],
      picked: null,
      pick: (picked) => set({ picked }),
      addSpace: (space) => {
        const added = { ...space, id: crypto.randomUUID() };
        set((state) => ({ spaces: [...state.spaces, added], picked: added.id }));
        return added;
      },
      updateSpace: (id, change) =>
        set((state) => ({
          spaces: state.spaces.map((space) => (space.id === id ? { ...space, ...change } : space)),
        })),
      removeSpace: (id) =>
        set((state) => ({
          spaces: state.spaces.filter((space) => space.id !== id),
          picked: state.picked === id ? DOCUMENTS : state.picked,
        })),
    }),
    {
      name: 'uni-pilot.document-spaces',
      version: 0,
      // Which spaces there are is a setting; which one is open is not.
      partialize: (state) => ({ spaces: state.spaces }),
    },
  ),
);
