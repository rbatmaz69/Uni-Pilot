import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppProviders } from '@/app/providers';
import { useUiStore } from '@/store/uiStore';
import { renderApp } from '@/test/render';
import { SettingsPage } from './SettingsPage';

vi.mock('@tauri-apps/api/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tauri-apps/api/core')>()),
  invoke: () => Promise.resolve(undefined),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: () => Promise.resolve(() => undefined),
}));

afterEach(() => {
  delete document.documentElement.dataset['theme'];
  Reflect.deleteProperty(window, '__TAURI_INTERNALS__');
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

  it('keeps Flexoki selected when the quick toggle changes brightness', async () => {
    const user = userEvent.setup();
    useUiStore.getState().setTheme('flexoki-light');
    renderApp('/settings');

    const header = screen.getByRole('banner');
    await user.click(within(header).getByRole('button', { name: 'Toggle color theme' }));
    expect(screen.getByRole('button', { name: 'Flexoki dark' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await user.click(within(header).getByRole('button', { name: 'Toggle color theme' }));
    expect(screen.getByRole('button', { name: 'Flexoki light' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('offers the quick toggle in the header only: the icon rail has none', () => {
    renderApp('/settings');

    const rail = screen.getByRole('complementary', { name: 'Main navigation' });
    expect(within(rail).queryByRole('button', { name: 'Toggle color theme' })).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Toggle color theme' })).toHaveLength(1);
  });

  it('has no compact-sidebar switch: the sidebar is always the icon rail', () => {
    renderApp('/settings');

    expect(screen.queryByRole('switch', { name: 'Compact sidebar' })).toBeNull();
    expect(screen.queryByText('Compact sidebar')).toBeNull();
  });
});

const SECTIONS = [
  { label: 'Appearance', id: 'appearance' },
  { label: 'Reminders', id: 'reminders' },
  { label: 'Automatic sign-in', id: 'sign-in' },
  { label: 'Mail', id: 'mail' },
] as const;

/** Settings' own sidebar, between the icon rail and the card. */
const panel = () => screen.getByRole('complementary', { name: 'Settings' });
/** The heading the card shows for its section: named like a section, unlike the settings' own headings. */
const cardHeading = () =>
  within(screen.getByRole('main')).getByRole('heading', {
    level: 2,
    name: /^(Appearance|Reminders|Automatic sign-in|Mail)$/,
  });
const pretendDesktop = () =>
  Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {}, configurable: true });

describe('settings sections', () => {
  it('lists the sections in the sidebar and opens on Appearance', () => {
    renderApp('/settings');

    const links = within(panel()).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual(SECTIONS.map(({ label }) => label));
    expect(within(panel()).getByRole('heading', { level: 2, name: 'Settings' })).toBeVisible();
    expect(cardHeading()).toHaveTextContent('Appearance');
    expect(screen.getByRole('button', { name: 'Flexoki light' })).toBeVisible();
    expect(screen.queryByRole('checkbox', { name: 'Calendar reminders' })).toBeNull();
  });

  it('keeps a single h1 for the page, whichever section is shown', () => {
    for (const { id } of SECTIONS) {
      const { unmount } = renderApp(`/settings?section=${id}`);
      expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
      expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
      unmount();
    }
  });

  it('links each row to its section and marks only the open one as current', () => {
    renderApp('/settings?section=reminders');

    for (const { label, id } of SECTIONS) {
      const link = within(panel()).getByRole('link', { name: label });
      expect(link).toHaveAttribute('href', `/settings?section=${id}`);
      if (id === 'reminders') expect(link).toHaveAttribute('aria-current', 'page');
      else expect(link).not.toHaveAttribute('aria-current');
    }
  });

  it('reaches each section from the sidebar', async () => {
    pretendDesktop();
    const user = userEvent.setup();
    renderApp('/settings');

    await user.click(within(panel()).getByRole('link', { name: 'Reminders' }));
    expect(cardHeading()).toHaveTextContent('Reminders');
    expect(screen.getByRole('checkbox', { name: 'Calendar reminders' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Flexoki light' })).toBeNull();
    expect(within(panel()).getByRole('link', { name: 'Reminders' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(panel()).getByRole('link', { name: 'Appearance' })).not.toHaveAttribute(
      'aria-current',
    );

    await user.click(within(panel()).getByRole('link', { name: 'Automatic sign-in' }));
    expect(cardHeading()).toHaveTextContent('Automatic sign-in');
    expect(screen.getByRole('region', { name: 'Sign in to ILIAS automatically' })).toBeVisible();
    expect(screen.queryByRole('checkbox', { name: 'Calendar reminders' })).toBeNull();

    await user.click(within(panel()).getByRole('link', { name: 'Mail' }));
    expect(cardHeading()).toHaveTextContent('Mail');
    expect(
      screen.getByRole('checkbox', { name: 'Keep the newest mail on this Mac' }),
    ).toBeVisible();
    expect(screen.queryByRole('region', { name: 'Sign in to ILIAS automatically' })).toBeNull();

    await user.click(within(panel()).getByRole('link', { name: 'Appearance' }));
    expect(cardHeading()).toHaveTextContent('Appearance');
    expect(screen.getByRole('button', { name: 'Flexoki light' })).toBeVisible();
  });

  it('opens the section the URL names, so a link such as ?section=mail works', () => {
    pretendDesktop();
    renderApp('/settings?section=mail');

    expect(cardHeading()).toHaveTextContent('Mail');
    expect(
      screen.getByRole('checkbox', { name: 'Keep the newest mail on this Mac' }),
    ).toBeVisible();
    expect(within(panel()).getByRole('link', { name: 'Mail' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('says so in the browser, where there is no mail to set up', () => {
    renderApp('/settings?section=mail');

    expect(cardHeading()).toHaveTextContent('Mail');
    expect(screen.getByText(/only the Uni Pilot desktop app can reach/)).toBeVisible();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it.each(['nope', '', 'MAIL', 'appearance,mail'])(
    'falls back to Appearance for the unknown section %j',
    (value) => {
      renderApp(`/settings?section=${value}`);

      expect(cardHeading()).toHaveTextContent('Appearance');
      expect(within(panel()).getByRole('link', { name: 'Appearance' })).toHaveAttribute(
        'aria-current',
        'page',
      );
      expect(within(panel()).getAllByRole('link', { current: 'page' })).toHaveLength(1);
    },
  );

  it('starts a section at its top, not where the last one was scrolled to', async () => {
    const user = userEvent.setup();
    renderApp('/settings');
    const main = screen.getByRole('main');

    main.scrollTop = 240;
    await user.click(within(panel()).getByRole('link', { name: 'Reminders' }));
    expect(main.scrollTop).toBe(0);
  });

  describe('while the sidebar is hidden', () => {
    it('offers no row of links while the sidebar is shown', () => {
      renderApp('/settings');

      expect(screen.queryByRole('navigation', { name: 'Settings sections' })).toBeNull();
    });

    it('still lets the student switch sections, and keeps the choice when the sidebar returns', async () => {
      const user = userEvent.setup();
      renderApp('/settings');

      await user.click(screen.getByRole('button', { name: 'Hide sidebar' }));
      expect(screen.queryByRole('complementary', { name: 'Settings' })).toBeNull();
      const switcher = screen.getByRole('navigation', { name: 'Settings sections' });
      expect(
        within(switcher)
          .getAllByRole('link')
          .map((link) => link.textContent),
      ).toEqual(SECTIONS.map(({ label }) => label));
      expect(within(switcher).getByRole('link', { name: 'Appearance' })).toHaveAttribute(
        'aria-current',
        'page',
      );
      expect(cardHeading()).toHaveTextContent('Appearance');

      await user.click(within(switcher).getByRole('link', { name: 'Reminders' }));
      expect(cardHeading()).toHaveTextContent('Reminders');
      expect(screen.getByRole('checkbox', { name: 'Calendar reminders' })).toBeVisible();
      expect(within(switcher).getByRole('link', { name: 'Reminders' })).toHaveAttribute(
        'aria-current',
        'page',
      );
      expect(within(switcher).getByRole('link', { name: 'Appearance' })).not.toHaveAttribute(
        'aria-current',
      );

      await user.click(screen.getByRole('button', { name: 'Show sidebar' }));
      expect(screen.queryByRole('navigation', { name: 'Settings sections' })).toBeNull();
      expect(within(panel()).getByRole('link', { name: 'Reminders' })).toHaveAttribute(
        'aria-current',
        'page',
      );
      expect(cardHeading()).toHaveTextContent('Reminders');
    });

    it('opens the section the URL names, with the row of links already in place', () => {
      useUiStore.setState({ panelOpen: false });
      renderApp('/settings?section=reminders');

      const switcher = screen.getByRole('navigation', { name: 'Settings sections' });
      expect(within(switcher).getByRole('link', { name: 'Reminders' })).toHaveAttribute(
        'aria-current',
        'page',
      );
      expect(screen.getByRole('checkbox', { name: 'Calendar reminders' })).toBeVisible();
    });
  });

  it('shows the sidebar in place, and no row of links, outside the shell', () => {
    useUiStore.setState({ panelOpen: false });
    render(
      <AppProviders>
        <SettingsPage />
      </AppProviders>,
    );

    expect(panel()).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Settings sections' })).toBeNull();
  });
});
