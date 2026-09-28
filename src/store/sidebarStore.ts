import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { NAV_SECTIONS } from '@/lib/navigation';
import {
  isWithin,
  orderedPaths,
  placeBefore,
  relocate,
  toFavorite,
  type SidebarFavorite,
} from '@/lib/sidebar';

export type { SidebarFavorite } from '@/lib/sidebar';

/** The favorites list folds like a section, under this id. */
export const FAVORITES_SECTION = 'favorites';

interface SidebarState {
  favorites: SidebarFavorite[];
  /** Section id → nav paths in the student's order. Sections they never reordered are absent. */
  order: Record<string, string[]>;
  hidden: string[];
  collapsedSections: string[];
  /** A document being dragged anywhere in the app, so the sidebar can offer itself. */
  documentDrag: SidebarFavorite | null;
  /** Set by pointer-driven drags, which the sidebar cannot hit-test itself. */
  documentDragOver: boolean;
  /** The folder or note the Documents page shows, so a matching favorite can light up. */
  activeDocument: string | null;
  addFavorite: (favorite: SidebarFavorite, before?: string | null) => void;
  removeFavorite: (path: string) => void;
  moveFavorite: (path: string, before: string | null) => void;
  /** Follows a rename or move on disk. */
  relocateFavorites: (from: string, to: string) => void;
  /** Drops a removed entry and, for folders, every favorite inside it. */
  forgetFavorites: (path: string) => void;
  moveNavItem: (sectionId: string, path: string, before: string | null) => void;
  setNavItemHidden: (path: string, hidden: boolean) => void;
  toggleSection: (id: string) => void;
  /** Restores the configured order and visibility. Favorites stay. */
  resetLayout: () => void;
  setDocumentDrag: (favorite: SidebarFavorite | null, over?: boolean) => void;
  setActiveDocument: (path: string | null) => void;
}

export const useSidebarStore = create<SidebarState>()(
  persist(
    (set) => ({
      favorites: [],
      order: {},
      hidden: [],
      collapsedSections: [],
      documentDrag: null,
      documentDragOver: false,
      activeDocument: null,
      addFavorite: (favorite, before = null) =>
        set((state) => {
          const next = toFavorite(favorite);
          const rest = state.favorites.filter((item) => item.path !== next.path);
          const index = before === null ? -1 : rest.findIndex((item) => item.path === before);
          return {
            favorites:
              index === -1
                ? [...rest, next]
                : [...rest.slice(0, index), next, ...rest.slice(index)],
          };
        }),
      removeFavorite: (path) =>
        set((state) => ({ favorites: state.favorites.filter((item) => item.path !== path) })),
      moveFavorite: (path, before) =>
        set((state) => {
          const byPath = new Map(state.favorites.map((item) => [item.path, item]));
          return {
            favorites: placeBefore([...byPath.keys()], path, before).flatMap(
              (key) => byPath.get(key) ?? [],
            ),
          };
        }),
      relocateFavorites: (from, to) =>
        set((state) => ({
          favorites: state.favorites.map((item) =>
            isWithin(item.path, from)
              ? {
                  ...item,
                  path: relocate(item.path, from, to),
                  name: item.path === from ? (to.split('/').at(-1) ?? item.name) : item.name,
                }
              : item,
          ),
        })),
      forgetFavorites: (path) =>
        set((state) => ({
          favorites: state.favorites.filter((item) => !isWithin(item.path, path)),
        })),
      moveNavItem: (sectionId, path, before) =>
        set((state) => {
          const section = NAV_SECTIONS.find((item) => item.id === sectionId);
          if (!section) return state;
          return {
            order: {
              ...state.order,
              [sectionId]: placeBefore(orderedPaths(section, state.order), path, before),
            },
          };
        }),
      setNavItemHidden: (path, hidden) =>
        set((state) => ({
          hidden: hidden
            ? [...new Set([...state.hidden, path])]
            : state.hidden.filter((item) => item !== path),
        })),
      toggleSection: (id) =>
        set((state) => ({
          collapsedSections: state.collapsedSections.includes(id)
            ? state.collapsedSections.filter((item) => item !== id)
            : [...state.collapsedSections, id],
        })),
      resetLayout: () => set({ order: {}, hidden: [], collapsedSections: [] }),
      setDocumentDrag: (favorite, over = false) =>
        set((state) =>
          state.documentDrag?.path === favorite?.path && state.documentDragOver === over
            ? state
            : { documentDrag: favorite, documentDragOver: Boolean(favorite) && over },
        ),
      setActiveDocument: (activeDocument) => set({ activeDocument }),
    }),
    {
      name: 'uni-pilot.sidebar',
      partialize: ({ favorites, order, hidden, collapsedSections }) => ({
        favorites,
        order,
        hidden,
        collapsedSections,
      }),
    },
  ),
);
