import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NAV_ITEMS } from '@/lib/navigation';
import { renderApp } from '@/test/render';

describe('Page placeholder', () => {
  it('leads back to the dashboard from a page that has nothing yet', () => {
    renderApp(NAV_ITEMS.tasks.path);

    expect(screen.getByRole('link', { name: 'Back to dashboard' })).toHaveAttribute(
      'href',
      NAV_ITEMS.dashboard.path,
    );
  });

  it('does not offer the dashboard a way back to itself', () => {
    renderApp(NAV_ITEMS.dashboard.path);

    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Back to dashboard' })).not.toBeInTheDocument();
  });
});
