import { describe, expect, it } from 'vitest';
import { NAV_ITEMS } from '@/lib/navigation';
import { useSidebarStore } from './sidebarStore';

const biology = { path: 'Biology', name: 'Biology', folder: true };
const cells = { path: 'Biology/Cells.md', name: 'Cells.md', folder: false };
const slides = { path: 'Slides.pdf', name: 'Slides.pdf', folder: false };
const store = () => useSidebarStore.getState();
const paths = () => store().favorites.map((favorite) => favorite.path);

describe('sidebar favorites', () => {
  it('adds at the end or in front of another favorite, never twice', () => {
    store().addFavorite(biology);
    store().addFavorite(slides);
    store().addFavorite(cells, slides.path);
    store().addFavorite(biology);

    expect(paths()).toEqual([cells.path, slides.path, biology.path]);
  });

  it('keeps only the favorite fields of a dropped document entry', () => {
    store().addFavorite({ ...slides, size: 12, modified: 1 } as typeof slides);
    expect(store().favorites).toEqual([slides]);
  });

  it('reorders and removes', () => {
    store().addFavorite(biology);
    store().addFavorite(slides);
    store().moveFavorite(slides.path, biology.path);
    expect(paths()).toEqual([slides.path, biology.path]);

    store().removeFavorite(slides.path);
    expect(paths()).toEqual([biology.path]);
  });

  it('follows a renamed folder, including favorites inside it', () => {
    store().addFavorite(biology);
    store().addFavorite(cells);
    store().relocateFavorites('Biology', 'Science/Bio');

    expect(store().favorites).toEqual([
      { path: 'Science/Bio', name: 'Bio', folder: true },
      { path: 'Science/Bio/Cells.md', name: 'Cells.md', folder: false },
    ]);
  });

  it('forgets a deleted folder together with everything inside it', () => {
    store().addFavorite(biology);
    store().addFavorite(cells);
    store().addFavorite(slides);
    store().forgetFavorites('Biology');

    expect(paths()).toEqual([slides.path]);
  });

  it('remembers favorites and layout, but not what is being dragged right now', () => {
    store().addFavorite(biology);
    store().setDocumentDrag(slides, true);
    store().setActiveDocument('Biology');

    const saved = JSON.parse(localStorage.getItem('uni-pilot.sidebar') ?? '{}') as {
      state: Record<string, unknown>;
    };
    expect(saved.state).toEqual({
      favorites: [biology],
      order: {},
      hidden: [],
    });
  });
});

describe('sidebar layout', () => {
  it('reorders an entry within its section', () => {
    store().moveNavItem('planning', NAV_ITEMS.focus.path, NAV_ITEMS.calendar.path);

    expect(store().order.planning).toEqual([
      NAV_ITEMS.focus.path,
      NAV_ITEMS.calendar.path,
      NAV_ITEMS.tasks.path,
    ]);
  });

  it('ignores sections it does not know', () => {
    store().moveNavItem('nope', NAV_ITEMS.focus.path, null);
    expect(store().order).toEqual({});
  });

  it('hides and shows entries, and restores defaults without losing favorites', () => {
    store().addFavorite(biology);
    store().moveNavItem('planning', NAV_ITEMS.focus.path, NAV_ITEMS.calendar.path);
    store().setNavItemHidden(NAV_ITEMS.grades.path, true);
    store().setNavItemHidden(NAV_ITEMS.grades.path, true);
    expect(store().hidden).toEqual([NAV_ITEMS.grades.path]);

    store().setNavItemHidden(NAV_ITEMS.grades.path, false);
    expect(store().hidden).toEqual([]);

    store().setNavItemHidden(NAV_ITEMS.exams.path, true);
    store().resetLayout();

    expect(store().hidden).toEqual([]);
    expect(store().order).toEqual({});
    expect(store().favorites).toEqual([biology]);
  });
});
