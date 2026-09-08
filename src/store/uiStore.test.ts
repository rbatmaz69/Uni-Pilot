import { describe, expect, it } from 'vitest';
import { useUiStore } from './uiStore';

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
});
