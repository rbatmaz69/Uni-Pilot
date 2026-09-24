/**
 * ILIAS mode across the whole shell: on the ILIAS page, in the desktop app and
 * connected, the sidebar and header step aside for the strip — and come back
 * the moment the student leaves.
 */

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useIliasStore } from '@/features/integrations/store/iliasStore';
import { renderApp } from '@/test/render';
import { useUiStore } from '@/store/uiStore';

const invoke = vi.fn<(command: string, args: Record<string, unknown>) => Promise<unknown>>();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (command: string, args: Record<string, unknown>) => invoke(command, args),
}));

const pretendDesktop = () =>
  Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {}, configurable: true });

const sidebar = () => screen.queryByRole('complementary', { name: 'Main navigation' });

beforeEach(() => {
  invoke.mockReset().mockResolvedValue(undefined);
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
  it('clears the sidebar and header away for the strip', async () => {
    pretendDesktop();
    renderApp('/ilias');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'ILIAS: Hochschule Heilbronn' }),
    ).toBeInTheDocument();
    expect(sidebar()).not.toBeInTheDocument();
    expect(useUiStore.getState().immersive).toBe(true);
  });

  it('brings them back when the student leaves', async () => {
    pretendDesktop();
    renderApp('/ilias');
    await screen.findByRole('button', { name: 'Uni Pilot' });

    await userEvent.click(screen.getByRole('button', { name: 'Uni Pilot' }));

    await waitFor(() => expect(useUiStore.getState().immersive).toBe(false));
    expect(sidebar()).toBeInTheDocument();
    expect(invoke).toHaveBeenCalledWith('leave_ilias_mode', {});
  });

  /**
   * Switching layouts must not remount the page. If it did, the page would
   * leave ILIAS mode on unmounting and enter it again on mounting, forever.
   */
  it('enters once, not in a loop', async () => {
    pretendDesktop();
    renderApp('/ilias');
    await screen.findByRole('button', { name: 'Uni Pilot' });
    await new Promise((resolve) => setTimeout(resolve, 50));

    const entered = invoke.mock.calls.filter(([command]) => command === 'enter_ilias_mode');
    // React's development double-mount may enter twice; a loop enters on and on.
    expect(entered.length).toBeLessThanOrEqual(2);
  });

  it('stays out of the way in a browser tab, where ILIAS cannot fill the window', async () => {
    renderApp('/ilias');
    expect(await screen.findByRole('heading', { level: 1, name: 'ILIAS' })).toBeInTheDocument();
    expect(sidebar()).toBeInTheDocument();
    expect(useUiStore.getState().immersive).toBe(false);
    expect(invoke).not.toHaveBeenCalled();
  });
});
