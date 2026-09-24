import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IliasConnection } from '@/features/integrations/lib/ilias/connection';
import { IliasStrip } from './IliasStrip';

const invoke = vi.fn<(command: string, args: Record<string, unknown>) => Promise<unknown>>();
const openIlias = vi.fn<(connection: IliasConnection, target?: string) => Promise<void>>();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (command: string, args: Record<string, unknown>) => invoke(command, args),
}));

vi.mock('@/features/integrations/lib/iliasWindow', () => ({
  openIlias: (connection: IliasConnection, target?: string) => openIlias(connection, target),
}));

const HEILBRONN: IliasConnection = {
  name: 'Hochschule Heilbronn',
  baseUrl: 'https://ilias.hs-heilbronn.de',
  clientId: 'iliashhn',
  version: '9.23',
  signIn: 'both',
  soap: 'blocked',
  checkedAt: '2026-09-23T10:00:00.000Z',
};

/** Every command sent to Rust, in order, with its target where it has one. */
const sent = () =>
  invoke.mock.calls.map(([command, args]) =>
    'target' in args ? `${command}(${String(args.target)})` : command,
  );

function renderStrip(props: { initialTarget?: string; onDisconnect?: () => void } = {}) {
  const view = (target?: string) => (
    <MemoryRouter initialEntries={['/ilias']}>
      <Routes>
        <Route
          path="/ilias"
          element={
            <IliasStrip
              connection={HEILBRONN}
              initialTarget={target}
              onDisconnect={props.onDisconnect ?? (() => undefined)}
            />
          }
        />
        <Route path="/dashboard" element={<p>Dashboard page</p>} />
      </Routes>
    </MemoryRouter>
  );
  const result = render(view(props.initialTarget));
  return { ...result, retarget: (target: string) => result.rerender(view(target)) };
}

beforeEach(() => {
  invoke.mockReset().mockResolvedValue(undefined);
  openIlias.mockReset().mockResolvedValue(undefined);
  document.body.innerHTML = '';
});

describe('entering and leaving', () => {
  it('switches the window to ILIAS mode, keeping ILIAS’s page', async () => {
    renderStrip();
    await waitFor(() => expect(sent()).toContain('enter_ilias_mode(null)'));
  });

  it('tells Rust how tall the strip is', async () => {
    renderStrip();
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(
        'enter_ilias_mode',
        expect.objectContaining({ strip: 48 }),
      ),
    );
  });

  it('arrives at a deep link it was brought with', async () => {
    const link = 'https://ilias.hs-heilbronn.de/goto.php?target=exc_4711';
    renderStrip({ initialTarget: link });
    await waitFor(() => expect(sent()).toContain(`enter_ilias_mode(${link})`));
  });

  /** A new link only navigates — the window is not taken apart and rebuilt. */
  it('follows a later deep link without leaving ILIAS mode', async () => {
    const { retarget } = renderStrip();
    await waitFor(() => expect(sent()).toContain('enter_ilias_mode(null)'));
    invoke.mockClear();

    const link = 'https://ilias.hs-heilbronn.de/goto.php?target=crs_717';
    retarget(link);

    await waitFor(() => expect(sent()).toEqual([`navigate_ilias(${link})`]));
  });

  it('gives Uni Pilot the window back on the way out', async () => {
    const { unmount } = renderStrip();
    await waitFor(() => expect(sent()).toContain('enter_ilias_mode(null)'));

    unmount();

    await waitFor(() => expect(sent().at(-1)).toBe('leave_ilias_mode'));
    expect(sent()).not.toContain('close_ilias_view');
  });
});

describe('dialogs', () => {
  /**
   * Uni Pilot is only the strip in ILIAS mode, so a dialog would be cut off.
   * While one is open the window goes back to Uni Pilot, and afterwards ILIAS
   * returns on the page it was on.
   */
  it('takes the window back while a dialog is open', async () => {
    renderStrip();
    await waitFor(() => expect(sent()).toContain('enter_ilias_mode(null)'));
    invoke.mockClear();

    const dialog = document.createElement('dialog');
    document.body.append(dialog);
    dialog.setAttribute('open', '');
    await waitFor(() => expect(sent()).toEqual(['leave_ilias_mode']));

    dialog.removeAttribute('open');
    await waitFor(() => expect(sent()).toEqual(['leave_ilias_mode', 'enter_ilias_mode(null)']));
  });
});

describe('the strip', () => {
  it('names the page and the installation', () => {
    renderStrip();
    expect(
      screen.getByRole('heading', { level: 1, name: 'ILIAS: Hochschule Heilbronn' }),
    ).toBeInTheDocument();
    expect(screen.getByText('ILIAS 9.23')).toBeInTheDocument();
  });

  it('leads back to Uni Pilot', async () => {
    renderStrip();
    await userEvent.click(screen.getByRole('button', { name: 'Uni Pilot' }));
    expect(await screen.findByText('Dashboard page')).toBeInTheDocument();
  });

  it('goes to the ILIAS dashboard', async () => {
    renderStrip();
    await userEvent.click(screen.getByRole('button', { name: 'ILIAS dashboard' }));
    await waitFor(() => expect(sent()).toContain('navigate_ilias()'));
  });

  it('signs out through ILIAS’s own logout page', async () => {
    renderStrip();
    await userEvent.click(screen.getByRole('button', { name: 'Sign out of ILIAS' }));
    await waitFor(() =>
      expect(sent()).toContain('navigate_ilias(https://ilias.hs-heilbronn.de/logout.php)'),
    );
  });

  it('still offers the separate window', async () => {
    renderStrip();
    await userEvent.click(screen.getByRole('button', { name: 'Open in a separate window' }));
    expect(openIlias).toHaveBeenCalledWith(HEILBRONN, undefined);
  });

  it('closes ILIAS before disconnecting', async () => {
    const onDisconnect = vi.fn();
    renderStrip({ onDisconnect });

    await userEvent.click(screen.getByRole('button', { name: 'Disconnect' }));

    await waitFor(() => expect(onDisconnect).toHaveBeenCalled());
    expect(sent()).toContain('close_ilias_view');
  });

  it('shows what went wrong', async () => {
    invoke.mockRejectedValue('ILIAS could not be opened: the Uni Pilot window is gone.');
    renderStrip();

    expect(await screen.findByRole('alert')).toHaveTextContent('the Uni Pilot window is gone');
  });
});
