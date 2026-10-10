import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_ROUTE, NAV_ITEMS } from '@/lib/navigation';
import {
  currentPlace,
  isTab,
  newTab,
  relocatePlaces,
  sectionOf,
  stepTab,
  visitPlace,
  type AppTab,
  type TabPlace,
} from '@/lib/tabs';

/**
 * The app's tabs (`TitleBar`). The router stays the one truth about what the
 * window shows; the tabs remember where each of them has been. `TabSync`
 * writes every address the router shows into the open tab, and Documents,
 * which moves between folders and notes without changing the address, reports
 * its places itself (`visit`). The actions that change what is shown (another
 * tab, Back, a new tab) leave the address in `request`, and `TabSync` takes
 * the window there — so they work from anywhere, with or without a router.
 */
interface TabState {
  tabs: AppTab[];
  activeId: string;
  /** Where the window should go next; `id` tells two trips to one place apart. */
  request: { location: string; id: number } | null;
  /** Shows `place` in the open tab; with `replace`, in place of where it is, with no step back. */
  visit: (place: TabPlace, replace?: boolean) => void;
  /** Opens `place` in a new tab beside the open one; returns its address. */
  open: (place: TabPlace) => string;
  /** Opens a tab; returns the address it shows, or `null` when it is already open. */
  select: (id: string) => string | null;
  /** The tab `step` places along from the open one (wrapping), as Ctrl+Tab does. */
  cycle: (step: -1 | 1) => string | null;
  /** Closes a tab; returns the address to show when the open tab was the one closed. */
  close: (id: string) => string | null;
  /** One step back or forward in the open tab; `null` when there is nowhere to go. */
  step: (step: -1 | 1) => string | null;
  /** A place moved (a renamed note): every tab that showed it follows. */
  relocate: (from: string, to: string, title?: string) => void;
}

function startState() {
  const tab = newTab({ location: DEFAULT_ROUTE });
  return { tabs: [tab], activeId: tab.id };
}

let trips = 0;
function trip(location: string) {
  trips += 1;
  return { location, id: trips };
}

function activeOf(state: Pick<TabState, 'tabs' | 'activeId'>) {
  return state.tabs.find((tab) => tab.id === state.activeId) ?? state.tabs[0]!;
}

export const selectActiveTab = (state: TabState) => activeOf(state);

/**
 * Where the app opens: where the open tab was when it closed — except ILIAS,
 * which takes over the window. A crash there must not start the app in it
 * again (see `uiStore.iliasMode`).
 */
export function startLocation() {
  const { location } = currentPlace(activeOf(useTabStore.getState()));
  return sectionOf(location) === NAV_ITEMS.ilias ? DEFAULT_ROUTE : location;
}

export const useTabStore = create<TabState>()(
  persist(
    (set, get) => ({
      ...startState(),
      request: null,
      visit: (place, replace) =>
        set((state) => {
          const tab = activeOf(state);
          const next = visitPlace(tab, place, replace);
          return next === tab
            ? state
            : { tabs: state.tabs.map((item) => (item.id === tab.id ? next : item)) };
        }),
      open: (place) => {
        const tab = newTab(place);
        set((state) => {
          const at = state.tabs.findIndex((item) => item.id === state.activeId);
          const tabs = [...state.tabs];
          tabs.splice(at + 1, 0, tab);
          return { tabs, activeId: tab.id, request: trip(place.location) };
        });
        return place.location;
      },
      select: (id) => {
        const state = get();
        const tab = state.tabs.find((item) => item.id === id);
        if (!tab || id === state.activeId) return null;
        const { location } = currentPlace(tab);
        set({ activeId: id, request: trip(location) });
        return location;
      },
      cycle: (step) => {
        const { tabs, activeId, select } = get();
        if (tabs.length < 2) return null;
        const at = tabs.findIndex((item) => item.id === activeId);
        return select(tabs[(at + step + tabs.length) % tabs.length]!.id);
      },
      close: (id) => {
        const state = get();
        const at = state.tabs.findIndex((item) => item.id === id);
        if (at < 0) return null;
        // The last tab never goes: closing it starts afresh on the start page.
        if (state.tabs.length === 1) {
          set({ ...startState(), request: trip(DEFAULT_ROUTE) });
          return DEFAULT_ROUTE;
        }
        const tabs = state.tabs.filter((item) => item.id !== id);
        if (id !== state.activeId) {
          set({ tabs });
          return null;
        }
        // As in a browser: the tab to the right takes over, or the one to the left.
        const next = tabs[Math.min(at, tabs.length - 1)]!;
        const { location } = currentPlace(next);
        set({ tabs, activeId: next.id, request: trip(location) });
        return location;
      },
      step: (step) => {
        const state = get();
        const tab = activeOf(state);
        const next = stepTab(tab, step);
        if (next === tab) return null;
        const { location } = currentPlace(next);
        set({
          tabs: state.tabs.map((item) => (item.id === tab.id ? next : item)),
          request: trip(location),
        });
        return location;
      },
      relocate: (from, to, title) =>
        set((state) => ({
          tabs: state.tabs.map((tab) => relocatePlaces(tab, from, to, title)),
        })),
    }),
    {
      name: 'uni-pilot.tabs',
      version: 1,
      partialize: ({ tabs, activeId }) => ({ tabs, activeId }),
      // Whatever was stored must still make sense; otherwise the app starts afresh.
      merge: (stored, current) => {
        const saved = stored as Partial<Pick<TabState, 'tabs' | 'activeId'>> | undefined;
        const tabs = Array.isArray(saved?.tabs) ? saved.tabs.filter(isTab) : [];
        if (tabs.length === 0) return current;
        const activeId = tabs.some((tab) => tab.id === saved?.activeId)
          ? saved!.activeId!
          : tabs[0]!.id;
        return { ...current, tabs, activeId };
      },
    },
  ),
);
