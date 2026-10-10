import { describe, expect, it } from 'vitest';
import { DEFAULT_ROUTE } from '@/lib/navigation';
import {
  TAB_HISTORY_LIMIT,
  currentPlace,
  isTab,
  newTab,
  placeTitle,
  relocatePlaces,
  stepTab,
  visitPlace,
} from '@/lib/tabs';
import { selectActiveTab, useTabStore } from './tabStore';

const here = () => currentPlace(selectActiveTab(useTabStore.getState()));
const locations = () => useTabStore.getState().tabs.map((tab) => currentPlace(tab).location);

describe('a tab’s places', () => {
  it('adds a step for somewhere new and drops what lay ahead, as in a browser', () => {
    let tab = newTab({ location: '/dashboard' });
    tab = visitPlace(tab, { location: '/inbox' });
    tab = visitPlace(tab, { location: '/calendar' });
    tab = stepTab(tab, -1);
    expect(currentPlace(tab).location).toBe('/inbox');

    tab = visitPlace(tab, { location: '/tasks' });
    expect(tab.places.map((place) => place.location)).toEqual(['/dashboard', '/inbox', '/tasks']);
    expect(stepTab(tab, 1)).toBe(tab);
  });

  it('only takes the page’s name when it arrives where it already is', () => {
    const tab = newTab({ location: '/documents?path=Biology' });
    expect(visitPlace(tab, { location: '/documents?path=Biology' })).toBe(tab);

    const named = visitPlace(tab, {
      location: '/documents?path=Biology',
      title: 'Biology',
      kind: 'folder',
    });
    expect(named.places).toEqual([
      { location: '/documents?path=Biology', title: 'Biology', kind: 'folder' },
    ]);
    // A later visit without a name keeps the one it has.
    expect(visitPlace(named, { location: '/documents?path=Biology' })).toBe(named);
  });

  it('replaces the current place instead of adding a step when asked to', () => {
    const tab = visitPlace(newTab({ location: '/dashboard' }), { location: '/inbox' }, true);
    expect(tab.places).toEqual([{ location: '/inbox' }]);
  });

  it('keeps a bounded history', () => {
    let tab = newTab({ location: '/page/0' });
    for (let index = 1; index <= TAB_HISTORY_LIMIT + 20; index += 1)
      tab = visitPlace(tab, { location: `/page/${index}` });
    expect(tab.places).toHaveLength(TAB_HISTORY_LIMIT);
    expect(currentPlace(tab).location).toBe(`/page/${TAB_HISTORY_LIMIT + 20}`);
  });

  it('follows a renamed note wherever it was shown', () => {
    const from = '/documents?file=Old.md';
    const tab = visitPlace(newTab({ location: from, title: 'Old', kind: 'file' }), {
      location: '/inbox',
    });
    const moved = relocatePlaces(tab, from, '/documents?file=New.md', 'New');
    expect(moved.places[0]).toEqual({
      location: '/documents?file=New.md',
      title: 'New',
      kind: 'file',
    });
    expect(relocatePlaces(tab, '/elsewhere', '/x')).toBe(tab);
  });

  it('names a place by the page’s name, else by its section', () => {
    expect(placeTitle({ location: '/inbox' })).toBe('Inbox');
    expect(placeTitle({ location: '/settings?section=calendar' })).toBe('Settings');
    expect(placeTitle({ location: '/documents?file=A.md', title: 'A' })).toBe('A');
    expect(placeTitle({ location: '/unknown' })).toBe('Uni Pilot');
  });

  it('recognises only well-formed stored tabs', () => {
    expect(isTab(newTab({ location: '/inbox' }))).toBe(true);
    expect(isTab({ id: 'x', places: [], index: 0 })).toBe(false);
    expect(isTab({ id: 'x', places: [{ location: 'inbox' }], index: 0 })).toBe(false);
    expect(isTab({ id: 'x', places: [{ location: '/inbox' }], index: 1 })).toBe(false);
    expect(isTab(null)).toBe(false);
  });
});

describe('the tab store', () => {
  it('starts with one tab on the start page', () => {
    expect(useTabStore.getState().tabs).toHaveLength(1);
    expect(here().location).toBe(DEFAULT_ROUTE);
    expect(useTabStore.getState().request).toBeNull();
  });

  it('opens a tab beside the open one and asks the window to go there', () => {
    const { open, visit } = useTabStore.getState();
    visit({ location: '/inbox' });
    open({ location: '/calendar' });
    open({ location: '/tasks' });

    expect(locations()).toEqual(['/inbox', '/calendar', '/tasks']);
    expect(here().location).toBe('/tasks');
    expect(useTabStore.getState().request?.location).toBe('/tasks');
  });

  it('switches tabs, and asks for nothing when the tab is already open', () => {
    const { open, select } = useTabStore.getState();
    const first = useTabStore.getState().activeId;
    open({ location: '/calendar' });

    expect(select(first)).toBe(DEFAULT_ROUTE);
    expect(useTabStore.getState().request?.location).toBe(DEFAULT_ROUTE);
    expect(select(first)).toBeNull();
    expect(select('missing')).toBeNull();
  });

  it('tells two trips to the same place apart', () => {
    const { open, cycle } = useTabStore.getState();
    open({ location: DEFAULT_ROUTE });
    const firstTrip = useTabStore.getState().request!;
    cycle(1);
    cycle(1);
    const lastTrip = useTabStore.getState().request!;
    expect(lastTrip.location).toBe(firstTrip.location);
    expect(lastTrip.id).not.toBe(firstTrip.id);
  });

  it('closes tabs: the next one takes over, a background tab just goes, the last starts afresh', () => {
    const { open, close } = useTabStore.getState();
    const first = useTabStore.getState().activeId;
    open({ location: '/calendar' });
    open({ location: '/tasks' });
    const [, calendar, tasks] = useTabStore.getState().tabs;

    // The open tab is the last one: the one to its left takes over.
    expect(close(tasks!.id)).toBe('/calendar');
    // A tab in the background goes without moving the window.
    expect(close(first)).toBeNull();
    expect(locations()).toEqual(['/calendar']);
    // The last tab starts afresh on the start page.
    expect(close(calendar!.id)).toBe(DEFAULT_ROUTE);
    expect(useTabStore.getState().tabs).toHaveLength(1);
    expect(here().location).toBe(DEFAULT_ROUTE);
  });

  it('steps back and forward in the open tab only', () => {
    const { visit, step, open } = useTabStore.getState();
    visit({ location: '/inbox' });
    open({ location: '/calendar' });
    expect(step(-1)).toBeNull();
    useTabStore.getState().cycle(-1);
    expect(step(-1)).toBe(DEFAULT_ROUTE);
    expect(step(1)).toBe('/inbox');
    expect(step(1)).toBeNull();
  });

  it('keeps tabs across restarts, and drops what no longer makes sense', async () => {
    const tab = newTab({ location: '/inbox' });
    localStorage.setItem(
      'uni-pilot.tabs',
      JSON.stringify({
        state: { tabs: [tab, { id: 'broken', places: [] }], activeId: 'gone' },
        version: 1,
      }),
    );
    await useTabStore.persist.rehydrate();
    expect(useTabStore.getState().tabs).toEqual([tab]);
    expect(useTabStore.getState().activeId).toBe(tab.id);

    localStorage.setItem(
      'uni-pilot.tabs',
      JSON.stringify({ state: { tabs: 'nonsense' }, version: 1 }),
    );
    await useTabStore.persist.rehydrate();
    expect(useTabStore.getState().tabs).toEqual([tab]);
  });
});
