import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  IliasConnection,
  IliasInstallation,
} from '@/features/integrations/lib/ilias/connection';
import { useIliasStore } from '@/features/integrations/store/iliasStore';
import { IliasWorkspace } from './IliasWorkspace';

const discoverInstallation = vi.fn<(url: string) => Promise<IliasInstallation>>();
const openIlias = vi.fn<(connection: IliasConnection, target?: string) => Promise<void>>();

vi.mock('@/features/integrations/lib/ilias/connection', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/integrations/lib/ilias/connection')>()),
  discoverInstallation: (url: string) => discoverInstallation(url),
}));

vi.mock('@/features/integrations/lib/iliasWindow', () => ({
  canOpenIliasWindow: () => false,
  openIlias: (connection: IliasConnection, target?: string) => openIlias(connection, target),
}));

/** What discovery really returned for Heilbronn on 23.09.2026. */
const HEILBRONN: IliasInstallation = {
  baseUrl: 'https://ilias.hs-heilbronn.de',
  version: '9.23',
  release: 9,
  layout: 'legacy',
  clientId: 'iliashhn',
  clients: ['iliashhn'],
  signIn: 'both',
  soap: 'blocked',
  soapEndpoint: null,
};

const CONNECTED: IliasConnection = {
  name: 'Hochschule Heilbronn',
  baseUrl: 'https://ilias.hs-heilbronn.de',
  clientId: 'iliashhn',
  version: '9.23',
  signIn: 'both',
  soap: 'blocked',
  checkedAt: '2026-09-23T10:00:00.000Z',
};

beforeEach(() => {
  discoverInstallation.mockReset();
  openIlias.mockReset().mockResolvedValue(undefined);
  useIliasStore.setState({ connection: null, busy: false });
});

describe('before connecting', () => {
  it('offers Heilbronn in one click', () => {
    render(<IliasWorkspace />);
    expect(
      screen.getByRole('button', { name: 'Connect Hochschule Heilbronn' }),
    ).toBeInTheDocument();
  });

  it('still allows another ILIAS', () => {
    render(<IliasWorkspace />);
    expect(screen.getByLabelText('Another ILIAS')).toBeInTheDocument();
  });

  it('connects Heilbronn and says so', async () => {
    discoverInstallation.mockResolvedValue(HEILBRONN);
    render(<IliasWorkspace />);

    await userEvent.click(screen.getByRole('button', { name: 'Connect Hochschule Heilbronn' }));

    expect(discoverInstallation).toHaveBeenCalledWith('https://ilias.hs-heilbronn.de');
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Connected to Hochschule Heilbronn.',
    );
    expect(screen.getByRole('heading', { name: 'Hochschule Heilbronn' })).toBeInTheDocument();
  });

  it('connects an address typed by hand', async () => {
    discoverInstallation.mockResolvedValue({
      ...HEILBRONN,
      baseUrl: 'https://ilias.example.edu',
      clientId: 'main',
    });
    render(<IliasWorkspace />);

    await userEvent.type(screen.getByLabelText('Another ILIAS'), 'https://ilias.example.edu');
    await userEvent.click(screen.getByRole('button', { name: 'Connect' }));

    expect(await screen.findByRole('heading', { name: 'ilias.example.edu' })).toBeInTheDocument();
  });

  it('shows why an address could not be connected', async () => {
    discoverInstallation.mockResolvedValue({
      ...HEILBRONN,
      version: null,
      clientId: null,
      clients: [],
      soap: 'missing',
    });
    render(<IliasWorkspace />);

    await userEvent.type(screen.getByLabelText('Another ILIAS'), 'https://example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Connect' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('does not look like an ILIAS');
  });
});

describe('once connected', () => {
  beforeEach(() => useIliasStore.setState({ connection: CONNECTED }));

  it('names the installation, its release and its client', () => {
    render(<IliasWorkspace />);
    expect(screen.getByRole('heading', { name: 'Hochschule Heilbronn' })).toBeInTheDocument();
    expect(screen.getByText(/ILIAS 9\.23 · client\s+iliashhn/)).toBeInTheDocument();
  });

  /**
   * Heilbronn's login page carries a password form, but a student account has
   * no local password there. The page must point at the university account and
   * never promise a password that would not work.
   */
  it('points a Heilbronn student at the university account', () => {
    render(<IliasWorkspace />);
    expect(screen.getByText(/university account/)).toBeInTheDocument();
    expect(screen.queryByText(/username and password/)).not.toBeInTheDocument();
  });

  it('mentions a password only where the installation has nothing else', () => {
    useIliasStore.setState({ connection: { ...CONNECTED, signIn: 'password' } });
    render(<IliasWorkspace />);
    expect(screen.getByText(/username and password/)).toBeInTheDocument();
  });

  /** "SOAP blocked" means nothing to a student and reads like a fault. */
  it('does not show the state of SOAP', () => {
    render(<IliasWorkspace />);
    expect(screen.queryByText(/soap/i)).not.toBeInTheDocument();
  });

  it('opens ILIAS', async () => {
    render(<IliasWorkspace />);
    await userEvent.click(screen.getByRole('button', { name: 'Open ILIAS' }));
    expect(openIlias).toHaveBeenCalledWith(CONNECTED, undefined);
  });

  it('shows what went wrong when ILIAS cannot be opened', async () => {
    // Tauri rejects with the Rust error string itself, not an Error.
    openIlias.mockRejectedValue('ILIAS could not be opened: no display');
    render(<IliasWorkspace />);

    await userEvent.click(screen.getByRole('button', { name: 'Open ILIAS' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'ILIAS could not be opened: no display',
    );
  });

  /**
   * In a browser tab ILIAS lives in the browser, where Uni Pilot cannot sign
   * it out — and ILIAS 9 ignores a bare logout.php. So there is no button that
   * would only pretend; the page points to ILIAS's own menu instead.
   */
  it('leaves signing out to ILIAS’s own menu in a browser tab', () => {
    render(<IliasWorkspace />);
    expect(screen.queryByRole('button', { name: 'Sign out of ILIAS' })).not.toBeInTheDocument();
    expect(screen.getByText(/from the menu at the top right/)).toBeInTheDocument();
  });

  it('explains what disconnecting does before it happens', () => {
    render(<IliasWorkspace />);
    expect(screen.getByText(/only makes Uni Pilot forget this ILIAS/)).toBeInTheDocument();
  });

  it('disconnects and goes back to the start', async () => {
    render(<IliasWorkspace />);

    await userEvent.click(screen.getByRole('button', { name: 'Disconnect' }));

    expect(screen.getByRole('status')).toHaveTextContent('Disconnected from Hochschule Heilbronn.');
    expect(
      screen.getByRole('button', { name: 'Connect Hochschule Heilbronn' }),
    ).toBeInTheDocument();
    expect(useIliasStore.getState().connection).toBeNull();
  });

  it('says plainly that the app does not read the window', () => {
    render(<IliasWorkspace />);
    expect(screen.getByText(/never\s+sees your password/)).toBeInTheDocument();
  });
});
