import { DEFAULT_ROUTE, NAV_ITEMS } from '@/lib/navigation';
import type { NavItem } from '@/types';

/**
 * The app's tabs, as in a browser: every tab keeps the places it has shown,
 * and Back and Forward walk them. A place is an address in the app — what the
 * router shows — so going back is going to that address, and every page
 * already knows how to show itself from its address.
 */

/** One place a tab has shown. */
export interface TabPlace {
  /** Path and query, e.g. `/inbox` or `/documents?file=Notes.md`. */
  location: string;
  /** What the page calls this place (a note, a folder); without it, the section's name. */
  title?: string | undefined;
  /** Documents' places show a file or a folder instead of the section's icon. */
  kind?: 'file' | 'folder' | undefined;
}

export interface AppTab {
  id: string;
  /** Oldest first. */
  places: TabPlace[];
  /** Where in `places` the tab is now. */
  index: number;
}

/** Enough to wander through a semester without growing forever. */
export const TAB_HISTORY_LIMIT = 100;

let created = 0;
export function newTabId() {
  created += 1;
  return `tab-${Date.now().toString(36)}-${created}`;
}

export function newTab(place: TabPlace): AppTab {
  return { id: newTabId(), places: [place], index: 0 };
}

export function currentPlace(tab: AppTab): TabPlace {
  return tab.places[tab.index] ?? tab.places[0] ?? { location: DEFAULT_ROUTE };
}

export function canGoBack(tab: AppTab) {
  return tab.index > 0;
}

export function canGoForward(tab: AppTab) {
  return tab.index < tab.places.length - 1;
}

function pathOf(location: string) {
  return location.split(/[?#]/)[0] || '/';
}

/** The section an address belongs to, as navigation.ts has it. */
export function sectionOf(location: string): NavItem | undefined {
  const path = pathOf(location);
  return Object.values(NAV_ITEMS).find(
    (item) => path === item.path || path.startsWith(`${item.path}/`),
  );
}

export function placeTitle(place: TabPlace) {
  return place.title ?? sectionOf(place.location)?.label ?? 'Uni Pilot';
}

/**
 * Shows `place` in the tab. Arriving where the tab already is only takes the
 * page's name for it (the same object comes back when nothing changes);
 * arriving somewhere new drops whatever lay ahead, as in a browser. With
 * `replace` the place takes the current one's spot instead of adding a step.
 */
export function visitPlace(tab: AppTab, place: TabPlace, replace = false): AppTab {
  const current = currentPlace(tab);
  if (replace && current.location !== place.location) {
    const places = [...tab.places];
    places[tab.index] = place;
    return { ...tab, places };
  }
  if (current.location === place.location) {
    const title = place.title ?? current.title;
    const kind = place.kind ?? current.kind;
    if (title === current.title && kind === current.kind) return tab;
    const places = [...tab.places];
    places[tab.index] = { location: current.location, title, kind };
    return { ...tab, places };
  }
  const places = [...tab.places.slice(0, tab.index + 1), place].slice(-TAB_HISTORY_LIMIT);
  return { ...tab, places, index: places.length - 1 };
}

/** One step back or forward; the same object when there is nowhere to go. */
export function stepTab(tab: AppTab, step: -1 | 1): AppTab {
  const index = tab.index + step;
  return index < 0 || index >= tab.places.length ? tab : { ...tab, index };
}

/**
 * A note was renamed or moved: every place that showed it follows it. Without
 * this, Back would try to open a file that is no longer there.
 */
export function relocatePlaces(tab: AppTab, from: string, to: string, title?: string): AppTab {
  if (!tab.places.some((place) => place.location === from)) return tab;
  return {
    ...tab,
    places: tab.places.map((place) =>
      place.location === from ? { ...place, location: to, title: title ?? place.title } : place,
    ),
  };
}

/** A stored tab must still be one: anything else is dropped rather than shown broken. */
export function isTab(value: unknown): value is AppTab {
  if (!value || typeof value !== 'object') return false;
  const tab = value as Partial<AppTab>;
  return (
    typeof tab.id === 'string' &&
    Array.isArray(tab.places) &&
    tab.places.length > 0 &&
    tab.places.every(
      (place) => !!place && typeof place.location === 'string' && place.location.startsWith('/'),
    ) &&
    typeof tab.index === 'number' &&
    Number.isInteger(tab.index) &&
    tab.index >= 0 &&
    tab.index < tab.places.length
  );
}
