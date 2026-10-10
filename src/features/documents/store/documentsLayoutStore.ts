import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** What the documents sidebar shows below its tabs: the file tree, or the favorites. */
export type SidebarView = 'files' | 'favorites';

/**
 * Whether the sidebar is shown at all is the app-wide `uiStore.panelOpen`,
 * shared with every other section's sidebar. This store keeps what is Documents'
 * own: the view the sidebar was left on.
 */
interface DocumentsLayoutState {
  /** The segment the sidebar was left on. */
  sidebarView: SidebarView;
  setSidebarView: (view: SidebarView) => void;
}

export const useDocumentsLayoutStore = create<DocumentsLayoutState>()(
  persist(
    (set) => ({
      sidebarView: 'files',
      setSidebarView: (sidebarView) => set({ sidebarView }),
    }),
    {
      name: 'uni-pilot.documents-layout',
      partialize: ({ sidebarView }) => ({ sidebarView }),
    },
  ),
);
