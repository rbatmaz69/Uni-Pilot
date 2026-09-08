import { act, fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NAV_ITEMS } from '@/lib/navigation';
import { useUiStore } from '@/store/uiStore';
import { renderApp } from '@/test/render';

const header = () => screen.getByRole('banner');

describe('Header', () => {
  it.each([NAV_ITEMS.dashboard, NAV_ITEMS.grades, NAV_ITEMS.ai])(
    'shows the title of the current route ($label)',
    (item) => {
      renderApp(item.path);
      expect(within(header()).getByText(item.label)).toBeVisible();
    },
  );

  it('offers the search trigger with a keyboard hint', () => {
    renderApp(NAV_ITEMS.dashboard.path);

    const search = within(header()).getByRole('button', { name: 'Search anything' });
    expect(search).toBeVisible();
    expect(search).toHaveTextContent(/K$/);
  });

  it('focuses the search trigger on the command shortcut', () => {
    renderApp(NAV_ITEMS.dashboard.path);
    const search = within(header()).getByRole('button', { name: 'Search anything' });

    expect(search).not.toHaveFocus();
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(search).toHaveFocus();
  });

  it('also accepts the control shortcut', () => {
    renderApp(NAV_ITEMS.dashboard.path);
    const search = within(header()).getByRole('button', { name: 'Search anything' });

    fireEvent.keyDown(window, { key: 'K', ctrlKey: true });
    expect(search).toHaveFocus();
  });

  it('ignores the key without a modifier', () => {
    renderApp(NAV_ITEMS.dashboard.path);
    const search = within(header()).getByRole('button', { name: 'Search anything' });

    fireEvent.keyDown(window, { key: 'k' });
    expect(search).not.toHaveFocus();
  });

  it('exposes the notification and account controls', () => {
    renderApp(NAV_ITEMS.dashboard.path);

    expect(within(header()).getByRole('button', { name: 'Notifications' })).toBeVisible();
    expect(within(header()).getByRole('button', { name: 'Account menu' })).toBeVisible();
  });

  it('only shows the expand control while the sidebar is collapsed', () => {
    renderApp(NAV_ITEMS.dashboard.path);
    expect(within(header()).queryByRole('button', { name: 'Expand sidebar' })).toBeNull();

    act(() => {
      useUiStore.setState({ sidebarCollapsed: true });
    });
    expect(within(header()).getByRole('button', { name: 'Expand sidebar' })).toBeVisible();
  });
});
