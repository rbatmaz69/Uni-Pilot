import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { NAV_ITEMS } from '@/lib/navigation';
import { newTab } from '@/lib/tabs';
import { useTabStore } from '@/store/tabStore';
import { useUiStore } from '@/store/uiStore';
import { renderApp } from '@/test/render';
import { AppLayout } from './AppLayout';
import { PanelHeader } from './Panel';
import { SectionPanel } from './SectionPanel';

const titleBar = () => screen.getByRole('banner', { name: 'Title bar' });
const tabs = () => within(titleBar()).getAllByRole('tab');
const openTab = () => within(titleBar()).getByRole('tab', { selected: true });
const rail = () => screen.getByRole('complementary', { name: 'Main navigation' });
const railLink = (name: string) => within(rail()).getByRole('link', { name });
const button = (name: string) => within(titleBar()).getByRole('button', { name });

describe('The title bar', () => {
  it.each([NAV_ITEMS.dashboard, NAV_ITEMS.grades, NAV_ITEMS.ai, NAV_ITEMS.settings])(
    'shows the current page as the open tab ($label)',
    (item) => {
      renderApp(item.path);
      expect(openTab()).toHaveAccessibleName(item.label);
      expect(tabs()).toHaveLength(1);
    },
  );

  it('is a window drag region whose controls stay clickable', () => {
    renderApp(NAV_ITEMS.dashboard.path);

    expect(titleBar()).toHaveAttribute('data-tauri-drag-region');
    expect(button('Search anything')).not.toHaveAttribute('data-tauri-drag-region');
    expect(button('New tab')).not.toHaveAttribute('data-tauri-drag-region');
  });

  it('offers the search with a keyboard hint, and focuses it on ⌘K or Ctrl+K only', () => {
    renderApp(NAV_ITEMS.dashboard.path);
    const search = button('Search anything');
    expect(search).toHaveTextContent(/K$/);

    fireEvent.keyDown(window, { key: 'k' });
    expect(search).not.toHaveFocus();
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(search).toHaveFocus();
    search.blur();
    fireEvent.keyDown(window, { key: 'K', ctrlKey: true });
    expect(search).toHaveFocus();
  });

  it('exposes the theme and the notifications; the profile is on the rail', () => {
    renderApp(NAV_ITEMS.dashboard.path);

    expect(button('Toggle color theme')).toBeVisible();
    expect(button('Notifications')).toBeVisible();
    expect(within(titleBar()).queryByRole('button', { name: 'Account menu' })).toBeNull();
  });

  it('has no sidebar toggle on a page without a panel', () => {
    renderApp(NAV_ITEMS.dashboard.path);

    expect(within(titleBar()).queryByRole('button', { name: 'Hide sidebar' })).toBeNull();
    expect(within(titleBar()).queryByRole('button', { name: 'Show sidebar' })).toBeNull();
  });
});

describe('The title bar, on a page with a section panel', () => {
  function renderWithPanel() {
    return render(
      <MemoryRouter initialEntries={['/panel']}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route
              path="/panel"
              element={
                <SectionPanel label="Demo panel">
                  <PanelHeader title="Demo" />
                </SectionPanel>
              }
            />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
  }

  it('offers to hide the panel, and to show it again', async () => {
    const user = userEvent.setup();
    renderWithPanel();

    await user.click(button('Hide sidebar'));
    expect(useUiStore.getState().panelOpen).toBe(false);
    expect(within(titleBar()).queryByRole('button', { name: 'Hide sidebar' })).toBeNull();

    await user.click(button('Show sidebar'));
    expect(useUiStore.getState().panelOpen).toBe(true);
    expect(button('Hide sidebar')).toBeVisible();
  });

  it('follows the stored preference when it changes elsewhere', () => {
    renderWithPanel();
    expect(button('Hide sidebar')).toBeVisible();

    act(() => {
      useUiStore.setState({ panelOpen: false });
    });
    expect(button('Show sidebar')).toBeVisible();
  });
});

describe('Tabs', () => {
  it('opens a section from the rail in the open tab, as a link in a browser tab does', async () => {
    const user = userEvent.setup();
    renderApp(NAV_ITEMS.dashboard.path);

    await user.click(railLink('Calendar'));

    expect(await screen.findByRole('heading', { name: 'Calendar' })).toBeVisible();
    expect(openTab()).toHaveAccessibleName('Calendar');
    expect(tabs()).toHaveLength(1);
  });

  it('goes back and forward through the sections the tab has shown', async () => {
    const user = userEvent.setup();
    renderApp(NAV_ITEMS.dashboard.path);
    expect(button('Go back')).toBeDisabled();

    await user.click(railLink('Calendar'));
    await user.click(railLink('Tasks'));
    await waitFor(() => expect(openTab()).toHaveAccessibleName('Tasks'));

    await user.click(button('Go back'));
    await waitFor(() => expect(openTab()).toHaveAccessibleName('Calendar'));
    expect(await screen.findByRole('heading', { name: 'Calendar' })).toBeVisible();
    await user.click(button('Go back'));
    await waitFor(() => expect(openTab()).toHaveAccessibleName('Dashboard'));
    expect(button('Go back')).toBeDisabled();

    await user.click(button('Go forward'));
    await waitFor(() => expect(openTab()).toHaveAccessibleName('Calendar'));
    expect(button('Go forward')).toBeEnabled();
  });

  it('opens a new tab on the open section with +, and switches between tabs', async () => {
    const user = userEvent.setup();
    renderApp(NAV_ITEMS.calendar.path);

    await user.click(button('New tab'));
    expect(tabs()).toHaveLength(2);
    expect(tabs()[1]).toHaveAttribute('aria-selected', 'true');
    expect(openTab()).toHaveAccessibleName('Calendar');

    await user.click(railLink('Tasks'));
    await waitFor(() => expect(openTab()).toHaveAccessibleName('Tasks'));
    expect(tabs()[0]).toHaveAccessibleName('Calendar');

    await user.click(tabs()[0]!);
    expect(await screen.findByRole('heading', { name: 'Calendar' })).toBeVisible();
    expect(railLink('Calendar')).toHaveAttribute('aria-current', 'page');
    // Each tab keeps its own way back: the first never saw Tasks.
    expect(button('Go back')).toBeDisabled();
  });

  it('opens a section in a new tab on ⌘-click or with the middle button', async () => {
    renderApp(NAV_ITEMS.dashboard.path);

    fireEvent.click(railLink('Calendar'), { metaKey: true });
    await waitFor(() => expect(openTab()).toHaveAccessibleName('Calendar'));
    expect(tabs()).toHaveLength(2);
    expect(tabs()[0]).toHaveAccessibleName('Dashboard');

    fireEvent(railLink('Tasks'), new MouseEvent('auxclick', { bubbles: true, button: 1 }));
    await waitFor(() => expect(openTab()).toHaveAccessibleName('Tasks'));
    expect(tabs()).toHaveLength(3);
  });

  it('closes a tab, the open one handing over to its neighbour, but never the last one', async () => {
    const user = userEvent.setup();
    renderApp(NAV_ITEMS.dashboard.path);
    // A single tab has nothing to close.
    expect(within(titleBar()).queryByRole('button', { name: /^Close / })).toBeNull();

    fireEvent.click(railLink('Calendar'), { metaKey: true });
    await waitFor(() => expect(openTab()).toHaveAccessibleName('Calendar'));

    await user.click(button('Close Calendar tab'));
    expect(tabs()).toHaveLength(1);
    expect(openTab()).toHaveAccessibleName('Dashboard');
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeVisible();
  });

  it('closes a tab with the middle button', async () => {
    renderApp(NAV_ITEMS.dashboard.path);
    fireEvent.click(railLink('Calendar'), { metaKey: true });
    await waitFor(() => expect(tabs()).toHaveLength(2));

    fireEvent(tabs()[0]!.parentElement!, new MouseEvent('auxclick', { bubbles: true, button: 1 }));
    expect(tabs()).toHaveLength(1);
    expect(openTab()).toHaveAccessibleName('Calendar');
  });

  it('answers ⌘T, Ctrl+Tab and ⌘1 to ⌘9', () => {
    renderApp(NAV_ITEMS.dashboard.path);

    // Ctrl stands in for ⌘ where the platform is not a Mac, as in the test browser.
    fireEvent.keyDown(document.body, { key: 't', ctrlKey: true });
    expect(tabs()).toHaveLength(2);
    expect(tabs()[1]).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(document.body, { key: 'Tab', ctrlKey: true });
    expect(tabs()[0]).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(document.body, { key: 'Tab', ctrlKey: true, shiftKey: true });
    expect(tabs()[1]).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(document.body, { key: '1', ctrlKey: true });
    expect(tabs()[0]).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(document.body, { key: '9', ctrlKey: true });
    expect(tabs()[1]).toHaveAttribute('aria-selected', 'true');
  });
});

describe('Starting the app', () => {
  it('opens where the open tab was', async () => {
    const tab = newTab({ location: NAV_ITEMS.tasks.path });
    useTabStore.setState({ tabs: [tab], activeId: tab.id });
    renderApp('/');

    expect(await screen.findByRole('heading', { name: 'Tasks' })).toBeVisible();
    expect(openTab()).toHaveAccessibleName('Tasks');
    expect(button('Go back')).toBeDisabled();
  });

  it('never opens in ILIAS, which takes over the window', async () => {
    const tab = newTab({ location: NAV_ITEMS.ilias.path });
    useTabStore.setState({ tabs: [tab], activeId: tab.id });
    renderApp('/');

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeVisible();
    expect(openTab()).toHaveAccessibleName('Dashboard');
  });
});
