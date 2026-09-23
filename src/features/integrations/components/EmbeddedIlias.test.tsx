import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IliasConnection } from '@/features/integrations/lib/ilias/connection';
import { EmbeddedIlias } from './EmbeddedIlias';

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
    command === 'show_ilias_view' ? `${command}(${String(args.target)})` : command,
  );

beforeEach(() => {
  invoke.mockReset().mockResolvedValue(undefined);
  openIlias.mockReset().mockResolvedValue(undefined);
  document.body.innerHTML = '';
});

describe('arriving and leaving', () => {
  it('shows ILIAS where the student left it', async () => {
    render(<EmbeddedIlias connection={HEILBRONN} onDisconnect={() => undefined} />);
    await waitFor(() => expect(sent()).toContain('show_ilias_view(null)'));
  });

  it('opens a deep link it was brought here with', async () => {
    const link = 'https://ilias.hs-heilbronn.de/goto.php?target=exc_4711';
    render(
      <EmbeddedIlias connection={HEILBRONN} initialTarget={link} onDisconnect={() => undefined} />,
    );
    await waitFor(() => expect(sent()).toContain(`show_ilias_view(${link})`));
  });

  it('steps aside when the student leaves the page, without closing', async () => {
    const { unmount } = render(
      <EmbeddedIlias connection={HEILBRONN} onDisconnect={() => undefined} />,
    );
    await waitFor(() => expect(sent()).toContain('show_ilias_view(null)'));

    unmount();

    await waitFor(() => expect(sent().at(-1)).toBe('hide_ilias_view'));
    expect(sent()).not.toContain('close_ilias_view');
  });

  it('marks out the area ILIAS is laid over', () => {
    render(<EmbeddedIlias connection={HEILBRONN} onDisconnect={() => undefined} />);
    expect(screen.getByRole('region', { name: 'ILIAS' })).toBeInTheDocument();
  });
});

describe('dialogs', () => {
  /**
   * The view is native and sits above the page, so a dialog would open
   * underneath it. ILIAS steps aside while one is open and comes back on the
   * same page afterwards.
   */
  it('steps aside while a dialog is open and comes back on the same page', async () => {
    render(<EmbeddedIlias connection={HEILBRONN} onDisconnect={() => undefined} />);
    await waitFor(() => expect(sent()).toContain('show_ilias_view(null)'));
    invoke.mockClear();

    const dialog = document.createElement('dialog');
    document.body.append(dialog);
    dialog.setAttribute('open', '');
    await waitFor(() => expect(sent()).toEqual(['hide_ilias_view']));

    dialog.removeAttribute('open');
    await waitFor(() => expect(sent()).toEqual(['hide_ilias_view', 'show_ilias_view(null)']));
  });
});

describe('the bar above ILIAS', () => {
  it('names the installation', () => {
    render(<EmbeddedIlias connection={HEILBRONN} onDisconnect={() => undefined} />);
    expect(screen.getByRole('heading', { name: 'Hochschule Heilbronn' })).toBeInTheDocument();
    expect(screen.getByText('ILIAS 9.23')).toBeInTheDocument();
  });

  it('goes back to the dashboard', async () => {
    render(<EmbeddedIlias connection={HEILBRONN} onDisconnect={() => undefined} />);
    await userEvent.click(screen.getByRole('button', { name: 'ILIAS dashboard' }));
    await waitFor(() => expect(sent()).toContain('show_ilias_view()'));
  });

  it('signs out through ILIAS’s own logout page', async () => {
    render(<EmbeddedIlias connection={HEILBRONN} onDisconnect={() => undefined} />);
    await userEvent.click(screen.getByRole('button', { name: 'Sign out of ILIAS' }));
    await waitFor(() =>
      expect(sent()).toContain('show_ilias_view(https://ilias.hs-heilbronn.de/logout.php)'),
    );
  });

  it('still offers the separate window', async () => {
    render(<EmbeddedIlias connection={HEILBRONN} onDisconnect={() => undefined} />);
    await userEvent.click(screen.getByRole('button', { name: 'Open in a separate window' }));
    expect(openIlias).toHaveBeenCalledWith(HEILBRONN, undefined);
  });

  it('closes the view before disconnecting', async () => {
    const onDisconnect = vi.fn();
    render(<EmbeddedIlias connection={HEILBRONN} onDisconnect={onDisconnect} />);

    await userEvent.click(screen.getByRole('button', { name: 'Disconnect' }));

    await waitFor(() => expect(onDisconnect).toHaveBeenCalled());
    expect(sent()).toContain('close_ilias_view');
  });

  it('shows what went wrong', async () => {
    invoke.mockRejectedValue('ILIAS could not be opened: the Uni Pilot window is gone.');
    render(<EmbeddedIlias connection={HEILBRONN} onDisconnect={() => undefined} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('the Uni Pilot window is gone');
  });
});
