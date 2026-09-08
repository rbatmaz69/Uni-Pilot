import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeName = 'light';

interface UiState {
  sidebarCollapsed: boolean;
  theme: ThemeName;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setTheme: (theme: ThemeName) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      theme: 'light',
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      setTheme: (theme) => set({ theme }),
    }),
    { name: 'uni-pilot.ui' },
  ),
);
