import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { alternateTheme, type ThemeName } from '@/lib/theme';

export type { ThemeName } from '@/lib/theme';

interface UiState {
  sidebarCollapsed: boolean;
  studentEventsCollapsed: boolean;
  theme: ThemeName;
  toggleSidebar: () => void;
  toggleStudentEvents: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setTheme: (theme: ThemeName) => void;
  toggleTheme: () => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      studentEventsCollapsed: false,
      theme: 'light',
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      toggleStudentEvents: () =>
        set((state) => ({ studentEventsCollapsed: !state.studentEventsCollapsed })),
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set((state) => ({ theme: alternateTheme(state.theme) })),
    }),
    { name: 'uni-pilot.ui' },
  ),
);
