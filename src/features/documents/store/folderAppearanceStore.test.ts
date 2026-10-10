import { beforeEach, expect, it } from 'vitest';
import { useFolderAppearanceStore as store } from './folderAppearanceStore';

beforeEach(() => store.setState({ appearances: {} }));

it('persists a folder appearance across reloads and resets just that folder', async () => {
  store.getState().setAppearance('Personal', { color: '#53ad87', style: 'outline' });
  store.getState().setAppearance('Courses', { color: '#a28ad0' });
  const saved = localStorage.getItem('uni-pilot.folder-appearance')!;
  store.setState({ appearances: {} });
  localStorage.setItem('uni-pilot.folder-appearance', saved);
  await store.persist.rehydrate();
  expect(store.getState().appearances.Personal).toEqual({ color: '#53ad87', style: 'outline' });
  store.getState().reset('Personal');
  expect(store.getState().appearances.Personal).toBeUndefined();
  expect(store.getState().appearances.Courses?.color).toBe('#a28ad0');
});

it('moves descendant preferences without touching similarly named siblings', () => {
  store.getState().setAppearance('Courses', { color: '#53ad87' });
  store.getState().setAppearance('Courses/Math', { style: 'outline' });
  store.getState().setAppearance('Courses old', { color: '#a28ad0' });
  store.getState().relocate('Courses', 'Archive/University');
  expect(Object.keys(store.getState().appearances).sort()).toEqual([
    'Archive/University',
    'Archive/University/Math',
    'Courses old',
  ]);
  expect(store.getState().appearances['Archive/University/Math']?.style).toBe('outline');
  store.getState().forget('Archive/University');
  expect(Object.keys(store.getState().appearances)).toEqual(['Courses old']);
});
