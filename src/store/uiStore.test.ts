import { describe, expect, it } from 'vitest';
import { selectPanelShown, useUiStore } from './uiStore';
import type { ThemeName } from '@/lib/theme';

const state = () => useUiStore.getState();

describe('uiStore', () => {
  it('starts on the light theme with the section panel shown', () => {
    expect(state().panelOpen).toBe(true);
    expect(state().theme).toBe('light');
  });

  it('shows and hides the section panel on toggle', () => {
    state().togglePanel();
    expect(state().panelOpen).toBe(false);

    state().togglePanel();
    expect(state().panelOpen).toBe(true);
  });

  it('persists the panel preference so it survives a restart', async () => {
    state().togglePanel();

    const saved = localStorage.getItem('uni-pilot.ui')!;
    expect(JSON.parse(saved)).toMatchObject({ state: { panelOpen: false } });

    useUiStore.setState({ panelOpen: true });
    localStorage.setItem('uni-pilot.ui', saved);
    await useUiStore.persist.rehydrate();
    expect(state().panelOpen).toBe(false);
  });

  it('starts from what an earlier version stored, and drops its collapsed-sidebar flag', async () => {
    localStorage.setItem(
      'uni-pilot.ui',
      JSON.stringify({ state: { sidebarCollapsed: true, theme: 'dark' }, version: 0 }),
    );
    await useUiStore.persist.rehydrate();
    expect(state().theme).toBe('dark');
    expect(state().panelOpen).toBe(true);

    state().togglePanel();
    const saved = JSON.parse(localStorage.getItem('uni-pilot.ui') ?? '{}') as {
      state: Record<string, unknown>;
    };
    expect(saved.state).toEqual({
      studentEventsCollapsed: false,
      theme: 'dark',
      panelOpen: false,
      panelWidths: {},
    });
  });

  it('keeps the width a panel was dragged to, by panel, and forgets it on reset', () => {
    state().setPanelWidth('mail', 420);
    state().setPanelWidth('events', 300);
    expect(state().panelWidths).toEqual({ mail: 420, events: 300 });

    state().setPanelWidth('mail', null);
    expect(state().panelWidths).toEqual({ events: 300 });
    const saved = JSON.parse(localStorage.getItem('uni-pilot.ui') ?? '{}') as {
      state: Record<string, unknown>;
    };
    expect(saved.state.panelWidths).toEqual({ events: 300 });
  });

  it('shows the panel as the student left it, except in ILIAS mode', () => {
    expect(selectPanelShown(state())).toBe(true);

    state().togglePanel();
    expect(selectPanelShown(state())).toBe(false);

    // The panel holds ILIAS's only controls, and there is no header to bring it back from.
    state().setIliasMode(true);
    expect(selectPanelShown(state())).toBe(true);
    expect(state().panelOpen).toBe(false);

    state().setIliasMode(false);
    expect(selectPanelShown(state())).toBe(false);
  });

  it('does not remember ILIAS mode', () => {
    state().setIliasMode(true);

    const saved = JSON.parse(localStorage.getItem('uni-pilot.ui') ?? '{}') as {
      state?: Record<string, unknown>;
    };
    expect(saved.state ?? {}).not.toHaveProperty('iliasMode');
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
