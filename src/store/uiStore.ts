import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeName = 'light' | 'dark';

interface UiState {
  sidebarCollapsed: boolean;
  studentEventsCollapsed: boolean;
  theme: ThemeName;
  /**
   * A page has taken over the window — ILIAS mode, where the sidebar and
   * header step aside. Deliberately not persisted: a crash in ILIAS mode must
   * not start the app again without its sidebar.
   */
  immersive: boolean;
  toggleSidebar: () => void;
  toggleStudentEvents: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setTheme: (theme: ThemeName) => void;
  toggleTheme: () => void;
  setImmersive: (immersive: boolean) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      studentEventsCollapsed: false,
      theme: 'light',
      immersive: false,
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      toggleStudentEvents: () =>
        set((state) => ({ studentEventsCollapsed: !state.studentEventsCollapsed })),
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set((state) => ({ theme: state.theme === 'light' ? 'dark' : 'light' })),
      setImmersive: (immersive) => set({ immersive }),
    }),
    {
      name: 'uni-pilot.ui',
      partialize: ({ sidebarCollapsed, studentEventsCollapsed, theme }) => ({
        sidebarCollapsed,
        studentEventsCollapsed,
        theme,
      }),
    },
  ),
);
