import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DEFAULT_ROUTE, NAV_ITEMS } from '@/lib/navigation';
import { renderApp } from '@/test/render';

const navItems = Object.values(NAV_ITEMS);
const dashboard = NAV_ITEMS.dashboard;

describe('application routes', () => {
  /**
   * Table driven on purpose: routes.tsx keeps its own list of <Route> elements,
   * so a new entry in NAV_ITEMS without a matching route would silently fall
   * through to the catch-all redirect. This test grows with the config.
   */
  it.each(navItems.map((item) => [item.label, item] as const))('serves %s', (_label, item) => {
    renderApp(item.path);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(item.label);
    expect(screen.getByText(item.subtitle)).toBeInTheDocument();
  });

  it.each(navItems.map((item) => [item.label, item] as const))(
    'marks the sidebar link for %s as the current page',
    (_label, item) => {
      renderApp(item.path);

      const links = screen.getAllByRole('link', { current: 'page' });
      expect(links).toHaveLength(1);
      expect(links[0]).toHaveAccessibleName(item.label);
      expect(links[0]).toHaveAttribute('href', item.path);
    },
  );

  it('shows the same title in the header as on the page', () => {
    renderApp(NAV_ITEMS.calendar.path);

    const heading = screen.getByRole('heading', { level: 1 });
    const header = screen.getByRole('banner');

    expect(header).toHaveTextContent(NAV_ITEMS.calendar.label);
    expect(heading).toHaveTextContent(NAV_ITEMS.calendar.label);
  });

  it('redirects the index route to the dashboard', () => {
    renderApp('/');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(dashboard.label);
  });

  it('redirects an unknown route to the dashboard', () => {
    renderApp('/not-a-real-page');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(dashboard.label);
  });

  it('points the default route at the dashboard', () => {
    expect(DEFAULT_ROUTE).toBe(dashboard.path);
  });

  it('keeps the shell in place while navigating', () => {
    renderApp(NAV_ITEMS.exams.path);

    expect(screen.getByRole('complementary', { name: 'Main navigation' })).toBeInTheDocument();
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
  });
});
