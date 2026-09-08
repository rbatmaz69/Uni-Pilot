import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { NAV_ITEMS, NAV_SECTIONS } from '@/lib/navigation';
import { useUiStore } from '@/store/uiStore';
import { renderApp } from '@/test/render';

const sidebar = () => screen.getByRole('complementary', { name: 'Main navigation' });

describe('Sidebar, expanded', () => {
  it('lists every navigation entry with its label visible', () => {
    renderApp(NAV_ITEMS.dashboard.path);

    for (const item of Object.values(NAV_ITEMS)) {
      expect(within(sidebar()).getByRole('link', { name: item.label })).toBeVisible();
    }
  });

  it('groups the entries under their section headings', () => {
    renderApp(NAV_ITEMS.dashboard.path);

    for (const section of NAV_SECTIONS) {
      expect(within(sidebar()).getByText(section.label)).toBeVisible();
    }
  });

  it('offers a collapse control and reports the expanded state', () => {
    renderApp(NAV_ITEMS.dashboard.path);

    expect(sidebar()).toHaveAttribute('data-collapsed', 'false');
    expect(within(sidebar()).getByRole('button', { name: 'Collapse sidebar' })).toBeVisible();
  });
});

describe('Sidebar, collapsed', () => {
  it('collapses when the control is used', async () => {
    const user = userEvent.setup();
    renderApp(NAV_ITEMS.dashboard.path);

    await user.click(within(sidebar()).getByRole('button', { name: 'Collapse sidebar' }));

    expect(sidebar()).toHaveAttribute('data-collapsed', 'true');
    expect(useUiStore.getState().sidebarCollapsed).toBe(true);
  });

  it('drops the visible entry labels', () => {
    useUiStore.setState({ sidebarCollapsed: true });
    renderApp(NAV_ITEMS.dashboard.path);

    expect(within(sidebar()).queryByText(NAV_ITEMS.calendar.label)).not.toBeInTheDocument();
    expect(within(sidebar()).queryByText('Uni Pilot')).not.toBeInTheDocument();
  });

  it('keeps the section grouping for screen readers', () => {
    useUiStore.setState({ sidebarCollapsed: true });
    renderApp(NAV_ITEMS.dashboard.path);

    for (const section of NAV_SECTIONS) {
      const group = within(sidebar()).getByRole('group', { name: section.label });
      expect(within(group).getByText(section.label)).toHaveClass('sr-only');
    }
  });

  it('keeps every link reachable by name for screen readers', () => {
    useUiStore.setState({ sidebarCollapsed: true });
    renderApp(NAV_ITEMS.dashboard.path);

    for (const item of Object.values(NAV_ITEMS)) {
      expect(within(sidebar()).getByRole('link', { name: item.label })).toBeInTheDocument();
    }
  });

  it('moves the toggle into the header', () => {
    useUiStore.setState({ sidebarCollapsed: true });
    renderApp(NAV_ITEMS.dashboard.path);

    expect(within(sidebar()).queryByRole('button', { name: 'Collapse sidebar' })).toBeNull();
    expect(
      within(screen.getByRole('banner')).getByRole('button', { name: 'Expand sidebar' }),
    ).toBeVisible();
  });
});
