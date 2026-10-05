import { describe, expect, it } from 'vitest';
import { useUiStore } from './uiStore';
import type { ThemeName } from '@/lib/theme';

const state = () => useUiStore.getState();

describe('uiStore', () => {
  it('starts with the sidebar expanded on the light theme', () => {
    expect(state().sidebarCollapsed).toBe(false);
    expect(state().theme).toBe('light');
  });

  it('flips the sidebar on toggle', () => {
    state().toggleSidebar();
    expect(state().sidebarCollapsed).toBe(true);

    state().toggleSidebar();
    expect(state().sidebarCollapsed).toBe(false);
  });

  it('sets the sidebar to an absolute value', () => {
    state().setSidebarCollapsed(true);
    expect(state().sidebarCollapsed).toBe(true);

    state().setSidebarCollapsed(true);
    expect(state().sidebarCollapsed).toBe(true);
  });

  it('persists the sidebar state so it survives a restart', () => {
    state().setSidebarCollapsed(true);

    const stored: unknown = JSON.parse(localStorage.getItem('uni-pilot.ui') ?? '{}');
    expect(stored).toMatchObject({ state: { sidebarCollapsed: true } });
  });

  it.each(['flexoki-light', 'flexoki-dark'] as const)(
    'restores the saved %s theme after rehydration',
    async (theme) => {
      state().setTheme(theme);
      const saved = localStorage.getItem('uni-pilot.ui')!;
      expect(JSON.parse(saved)).toMatchObject({ state: { theme } });

      useUiStore.setState({ theme: 'light' });
      localStorage.setItem('uni-pilot.ui', saved);
      await useUiStore.persist.rehydrate();

      expect(state().theme).toBe(theme);
    },
  );

  it.each<[ThemeName, ThemeName]>([
    ['light', 'dark'],
    ['dark', 'light'],
    ['flexoki-light', 'flexoki-dark'],
    ['flexoki-dark', 'flexoki-light'],
  ])('toggles %s to %s without changing the palette', (from, to) => {
    state().setTheme(from);
    state().toggleTheme();
    expect(state().theme).toBe(to);
    state().toggleTheme();
    expect(state().theme).toBe(from);
  });
});
