import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { alternateTheme, type ThemeName } from '@/lib/theme';

export type { ThemeName } from '@/lib/theme';

interface UiState {
  studentEventsCollapsed: boolean;
  theme: ThemeName;
  /**
   * A section's own sidebar (the panel beside the icon rail) is shown. One
   * preference for the whole app: hiding the panel on one page hides it on
   * every page that has one.
   */
  panelOpen: boolean;
  /**
   * ILIAS mode: Uni Pilot's webview is only the left column (the icon rail and
   * the ILIAS panel) and ILIAS, a native webview beside it, is the card. The
   * header, the card and the face-unlock bar step aside, and the panel stays
   * open whatever `panelOpen` says. Deliberately not persisted: a crash in
   * ILIAS mode must not start the app again showing only that column.
   */
  iliasMode: boolean;
  /**
   * The widths the student dragged resizable section panels to, by the panel's
   * `resize.id` (`SectionPanel`). A panel without an entry takes its default.
   */
  panelWidths: Record<string, number>;
  togglePanel: () => void;
  /** `null` goes back to the panel's default width. */
  setPanelWidth: (id: string, width: number | null) => void;
  toggleStudentEvents: () => void;
  setTheme: (theme: ThemeName) => void;
  toggleTheme: () => void;
  setIliasMode: (iliasMode: boolean) => void;
}

/**
 * Whether a section's panel is on screen: the student's preference, except in
 * ILIAS mode, where the panel holds the only controls for ILIAS (back, courses,
 * sign out) and the window has no header to bring it back from. The
 * preference itself is left alone and applies again when ILIAS mode ends.
 */
export const selectPanelShown = (state: UiState) => state.panelOpen || state.iliasMode;

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      studentEventsCollapsed: false,
      theme: 'light',
      panelOpen: true,
      iliasMode: false,
      panelWidths: {},
      togglePanel: () => set((state) => ({ panelOpen: !state.panelOpen })),
      setPanelWidth: (id, width) =>
        set((state) => {
          const panelWidths = { ...state.panelWidths };
          if (width === null) delete panelWidths[id];
          else panelWidths[id] = width;
          return { panelWidths };
        }),
      toggleStudentEvents: () =>
        set((state) => ({ studentEventsCollapsed: !state.studentEventsCollapsed })),
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set((state) => ({ theme: alternateTheme(state.theme) })),
      setIliasMode: (iliasMode) => set({ iliasMode }),
    }),
    {
      name: 'uni-pilot.ui',
      partialize: ({ studentEventsCollapsed, theme, panelOpen, panelWidths }) => ({
        studentEventsCollapsed,
        theme,
        panelOpen,
        panelWidths,
      }),
    },
  ),
);
