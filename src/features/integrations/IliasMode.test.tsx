/**
 * ILIAS mode across the whole shell: on the ILIAS page, in the desktop app and
 * connected, the header and the card step aside for the ILIAS panel — the icon
 * rail stays, as the way out — and everything comes back the moment the student
 * leaves.
 */

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useIliasStore } from '@/features/integrations/store/iliasStore';
import { renderApp } from '@/test/render';
import { useUiStore } from '@/store/uiStore';

const invoke = vi.fn<(command: string, args: Record<string, unknown>) => Promise<unknown>>();

// The whole shell renders, and it asks `isTauri` too; only `invoke` is faked.
vi.mock('@tauri-apps/api/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tauri-apps/api/core')>()),
  invoke: (command: string, args: Record<string, unknown>) => invoke(command, args),
  isTauri: () => false,
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: () => Promise.resolve(() => undefined),
}));

const pretendDesktop = () =>
  Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {}, configurable: true });

const sidebar = () => screen.queryByRole('complementary', { name: 'Main navigation' });

beforeEach(() => {
  // ILIAS answers the course list with a list; the rest of the commands with nothing.
  invoke
    .mockReset()
    .mockImplementation((command) =>
      Promise.resolve(command === 'ilias_sync_courses' ? [] : undefined),
    );
  useIliasStore.setState({
    connection: {
      name: 'Hochschule Heilbronn',
      baseUrl: 'https://ilias.hs-heilbronn.de',
      clientId: 'iliashhn',
      version: '9.23',
      signIn: 'both',
      soap: 'blocked',
      checkedAt: '2026-09-23T10:00:00.000Z',
    },
  });
});

afterEach(() => {
  Reflect.deleteProperty(window, '__TAURI_INTERNALS__');
});

describe('ILIAS mode', () => {
  it('keeps the icon rail and brings the ILIAS panel, in place of the header and the card', async () => {
    pretendDesktop();
    renderApp('/ilias');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'ILIAS: Hochschule Heilbronn' }),
    ).toBeInTheDocument();
    expect(sidebar()).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'ILIAS' })).toBeInTheDocument();
    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
    expect(screen.getByRole('main').closest('.workspace')).toBeNull();
    expect(useUiStore.getState().iliasMode).toBe(true);
  });

  /** The rail is the way back: there is no "Uni Pilot" button any more. */
  it('brings the header and the card back when the student leaves by the rail', async () => {
    pretendDesktop();
    renderApp('/ilias');
    await screen.findByRole('complementary', { name: 'ILIAS' });

    await userEvent.click(
      within(sidebar() as HTMLElement).getByRole('link', { name: 'Dashboard' }),
    );

    await waitFor(() => expect(useUiStore.getState().iliasMode).toBe(false));
    expect(sidebar()).toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: 'ILIAS' })).not.toBeInTheDocument();
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('main').closest('.workspace')).not.toBeNull();
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('leave_ilias_mode', {}));
  });

  /**
   * The panel holds ILIAS's only controls and there is no header to bring it
   * back from, so ILIAS mode keeps it open. What the student chose is theirs
   * and applies again afterwards.
   */
  it('keeps the panel open when the student had hidden panels, and keeps their choice', async () => {
    useUiStore.setState({ panelOpen: false });
    pretendDesktop();
    renderApp('/ilias');

    expect(await screen.findByRole('complementary', { name: 'ILIAS' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Show sidebar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Hide sidebar' })).not.toBeInTheDocument();
    expect(useUiStore.getState().panelOpen).toBe(false);
  });

  /** The page takes its panel's width from the stylesheet's fixed one, never from the window. */
  it('marks the shell, so the stylesheet can fix the column’s width', async () => {
    pretendDesktop();
    const { container } = renderApp('/ilias');
    await screen.findByRole('complementary', { name: 'ILIAS' });

    expect(container.querySelector('.app-shell')).toHaveAttribute('data-ilias-mode', 'true');
  });

  /**
   * Switching layouts must not remount the page. If it did, the page would
   * leave ILIAS mode on unmounting and enter it again on mounting, forever.
   */
  it('enters once, not in a loop', async () => {
    pretendDesktop();
    renderApp('/ilias');
    await screen.findByRole('complementary', { name: 'ILIAS' });
    await new Promise((resolve) => setTimeout(resolve, 50));

    const entered = invoke.mock.calls.filter(([command]) => command === 'enter_ilias_mode');
    // React's development double-mount may enter twice; a loop enters on and on.
    expect(entered.length).toBeLessThanOrEqual(2);
  });

  it('stays out of the way in a browser tab, where ILIAS cannot fill the window', async () => {
    renderApp('/ilias');
    expect(await screen.findByRole('heading', { level: 1, name: 'ILIAS' })).toBeInTheDocument();
    expect(sidebar()).toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: 'ILIAS' })).not.toBeInTheDocument();
    expect(useUiStore.getState().iliasMode).toBe(false);
    expect(invoke).not.toHaveBeenCalled();
  });
});
