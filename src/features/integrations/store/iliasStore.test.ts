import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IliasInstallation } from '@/features/integrations/lib/ilias/connection';
import { IliasError } from '@/features/integrations/lib/ilias/errors';
import { useIliasStore } from './iliasStore';

const discoverInstallation = vi.fn<(url: string) => Promise<IliasInstallation>>();

vi.mock('@/features/integrations/lib/ilias/connection', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/integrations/lib/ilias/connection')>()),
  discoverInstallation: (url: string) => discoverInstallation(url),
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

beforeEach(() => {
  discoverInstallation.mockReset();
  useIliasStore.setState({ connection: null, busy: false });
});

describe('connecting', () => {
  it('keeps what discovery found, under the university name', async () => {
    discoverInstallation.mockResolvedValue(HEILBRONN);

    await useIliasStore.getState().connect('https://ilias.hs-heilbronn.de');

    expect(useIliasStore.getState().connection).toMatchObject({
      name: 'Hochschule Heilbronn',
      baseUrl: 'https://ilias.hs-heilbronn.de',
      clientId: 'iliashhn',
      version: '9.23',
      signIn: 'both',
    });
  });

  it('recognises Heilbronn from a pasted deep link', async () => {
    discoverInstallation.mockResolvedValue(HEILBRONN);

    await useIliasStore
      .getState()
      .connect('https://ilias.hs-heilbronn.de/ilias.php?baseClass=ilrepositorygui&ref_id=1');

    expect(discoverInstallation).toHaveBeenCalledWith('https://ilias.hs-heilbronn.de');
    expect(useIliasStore.getState().connection?.name).toBe('Hochschule Heilbronn');
  });

  it('names an installation it does not know by its host', async () => {
    discoverInstallation.mockResolvedValue({
      ...HEILBRONN,
      baseUrl: 'https://ilias.example.edu',
      clientId: 'main',
    });

    await useIliasStore.getState().connect('https://ilias.example.edu');

    expect(useIliasStore.getState().connection?.name).toBe('ilias.example.edu');
  });

  it('asks for an address before going anywhere', async () => {
    await expect(useIliasStore.getState().connect('   ')).rejects.toThrowError(/address/);
    expect(discoverInstallation).not.toHaveBeenCalled();
  });

  /**
   * Without a client id the window would open wherever the server's default
   * points, which on a multi-client installation is the wrong ILIAS.
   */
  it('refuses to keep an installation that would not name its client', async () => {
    discoverInstallation.mockResolvedValue({ ...HEILBRONN, clientId: null, clients: [] });

    await expect(
      useIliasStore.getState().connect('https://ilias.hs-heilbronn.de'),
    ).rejects.toThrowError(/which client/);
    expect(useIliasStore.getState().connection).toBeNull();
  });

  it('says plainly when an address is not ILIAS at all', async () => {
    discoverInstallation.mockResolvedValue({
      ...HEILBRONN,
      version: null,
      clientId: null,
      clients: [],
      soap: 'missing',
    });

    await expect(useIliasStore.getState().connect('https://example.com')).rejects.toThrowError(
      /does not look like an ILIAS/,
    );
  });

  it('is busy while it looks, and not afterwards even when it fails', async () => {
    let finish!: () => void;
    discoverInstallation.mockReturnValue(
      new Promise((_resolve, reject) => {
        finish = () =>
          reject(new IliasError('network', 'Could not reach that ILIAS installation.'));
      }),
    );

    const attempt = useIliasStore.getState().connect('https://ilias.hs-heilbronn.de');
    expect(useIliasStore.getState().busy).toBe(true);

    finish();
    await expect(attempt).rejects.toThrowError(/Could not reach/);
    expect(useIliasStore.getState().busy).toBe(false);
  });
});

describe('rechecking', () => {
  beforeEach(async () => {
    discoverInstallation.mockResolvedValue(HEILBRONN);
    await useIliasStore.getState().connect('https://ilias.hs-heilbronn.de');
  });

  it('picks up an upgrade and keeps the name', async () => {
    discoverInstallation.mockResolvedValue({
      ...HEILBRONN,
      version: '10.4',
      layout: 'public-root',
    });

    await useIliasStore.getState().recheck();

    expect(useIliasStore.getState().connection).toMatchObject({
      name: 'Hochschule Heilbronn',
      version: '10.4',
    });
  });

  it('keeps the connection when the recheck fails', async () => {
    discoverInstallation.mockRejectedValue(new IliasError('network', 'offline'));

    await expect(useIliasStore.getState().recheck()).rejects.toThrowError();

    expect(useIliasStore.getState().connection?.version).toBe('9.23');
  });
});

describe('disconnecting', () => {
  it('forgets the installation', async () => {
    discoverInstallation.mockResolvedValue(HEILBRONN);
    await useIliasStore.getState().connect('https://ilias.hs-heilbronn.de');

    useIliasStore.getState().disconnect();

    expect(useIliasStore.getState().connection).toBeNull();
  });
});

describe('what is persisted', () => {
  it('keeps the connection and nothing else', async () => {
    discoverInstallation.mockResolvedValue(HEILBRONN);
    await useIliasStore.getState().connect('https://ilias.hs-heilbronn.de');

    const stored = JSON.parse(localStorage.getItem('uni-pilot.ilias') ?? '{}') as {
      state: Record<string, unknown>;
    };

    expect(Object.keys(stored.state)).toEqual(['connection']);
  });

  /**
   * Checked by field, not by searching the text: an installation whose login
   * page offers a password form stores `signIn: 'password'`, and that word as a
   * value is not a secret. What matters is that no field exists that could
   * carry one.
   */
  it('holds no secret — there is no field that could hold one', async () => {
    discoverInstallation.mockResolvedValue(HEILBRONN);
    await useIliasStore.getState().connect('https://ilias.hs-heilbronn.de');

    const stored = JSON.parse(localStorage.getItem('uni-pilot.ilias') ?? '{}') as {
      state: { connection: Record<string, unknown> };
    };

    expect(Object.keys(stored.state.connection).sort()).toEqual([
      'baseUrl',
      'checkedAt',
      'clientId',
      'name',
      'signIn',
      'soap',
      'version',
    ]);
  });
});
