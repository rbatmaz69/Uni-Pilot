import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { AppProviders } from '@/app/providers';
import { useUiStore } from '@/store/uiStore';
import { renderApp } from '@/test/render';
import { SettingsPage } from './SettingsPage';

afterEach(() => {
  delete document.documentElement.dataset['theme'];
});

describe('appearance settings', () => {
  it('applies each optional palette to the workspace and marks only that choice selected', async () => {
    const user = userEvent.setup();
    render(
      <AppProviders>
        <SettingsPage />
      </AppProviders>,
    );

    expect(document.documentElement).toHaveAttribute('data-theme', 'light');

    for (const [label, theme] of [
      ['Flexoki light', 'flexoki-light'],
      ['Flexoki dark', 'flexoki-dark'],
      ['After hours', 'dark'],
      ['Light & airy', 'light'],
    ] as const) {
      await user.click(screen.getByRole('button', { name: label }));
      expect(useUiStore.getState().theme).toBe(theme);
      expect(document.documentElement).toHaveAttribute('data-theme', theme);
      expect(screen.getAllByRole('button', { pressed: true })).toHaveLength(1);
      expect(screen.getByRole('button', { name: label })).toHaveAttribute('aria-pressed', 'true');
    }
  });

  it('keeps Flexoki selected when either quick toggle changes brightness', async () => {
    const user = userEvent.setup();
    useUiStore.getState().setTheme('flexoki-light');
    renderApp('/settings');

    const header = screen.getByRole('banner');
    await user.click(within(header).getByRole('button', { name: 'Toggle color theme' }));
    expect(screen.getByRole('button', { name: 'Flexoki dark' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    const sidebar = screen.getByRole('complementary', { name: 'Main navigation' });
    await user.click(within(sidebar).getByRole('button', { name: 'Toggle color theme' }));
    expect(screen.getByRole('button', { name: 'Flexoki light' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});
