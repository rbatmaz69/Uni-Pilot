import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IliasConnection } from '@/features/integrations/lib/ilias/connection';
import { belongsToIlias, canOpenIliasWindow, openIlias } from './iliasWindow';

const invoke = vi.fn<(command: string, args: Record<string, unknown>) => Promise<unknown>>();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (command: string, args: Record<string, unknown>) => invoke(command, args),
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

const DASHBOARD =
  'https://ilias.hs-heilbronn.de/ilias.php?baseClass=ilDashboardGUI&client_id=iliashhn';

/** What Tauri puts on the window; its presence is how the app knows it is desktop. */
function pretendDesktop(): void {
  Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {}, configurable: true });
}

beforeEach(() => {
  invoke.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  Reflect.deleteProperty(window, '__TAURI_INTERNALS__');
  vi.restoreAllMocks();
});

describe('in a browser tab', () => {
  it('opens the dashboard in a new tab, not the root', async () => {
    const tab = { opener: window as unknown };
    const open = vi.spyOn(window, 'open').mockReturnValue(tab as Window);

    await openIlias(HEILBRONN);

    expect(open).toHaveBeenCalledWith(DASHBOARD, '_blank');
    expect(invoke).not.toHaveBeenCalled();
  });

  it('cuts the tab loose from Uni Pilot', async () => {
    const tab = { opener: window as unknown };
    vi.spyOn(window, 'open').mockReturnValue(tab as Window);

    await openIlias(HEILBRONN);

    expect(tab.opener).toBeNull();
  });

  it('opens a deep link from the calendar with the client added', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue({ opener: null } as Window);

    await openIlias(HEILBRONN, 'https://ilias.hs-heilbronn.de/goto.php?target=exc_42');

    expect(open).toHaveBeenCalledWith(
      'https://ilias.hs-heilbronn.de/goto.php?target=exc_42&client_id=iliashhn',
      '_blank',
    );
  });

  it('says so when the browser blocks the tab', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null);

    await expect(openIlias(HEILBRONN)).rejects.toThrowError(/blocked the new tab/);
  });

  it('opens nothing for a link from somewhere else', async () => {
    const open = vi.spyOn(window, 'open');

    await expect(openIlias(HEILBRONN, 'https://evil.example/login')).rejects.toThrowError(
      /does not belong to your ILIAS/,
    );
    expect(open).not.toHaveBeenCalled();
  });

  it('reports that ILIAS opens in a tab here', () => {
    expect(canOpenIliasWindow()).toBe(false);
  });
});

describe('in the desktop app', () => {
  beforeEach(pretendDesktop);

  it('asks Rust for the window, with the client', async () => {
    const open = vi.spyOn(window, 'open');

    await openIlias(HEILBRONN);

    expect(invoke).toHaveBeenCalledWith('open_ilias', {
      baseUrl: 'https://ilias.hs-heilbronn.de',
      clientId: 'iliashhn',
      target: null,
    });
    expect(open).not.toHaveBeenCalled();
  });

  it('passes a deep link through for Rust to check again', async () => {
    await openIlias(HEILBRONN, 'crs_717');

    expect(invoke).toHaveBeenCalledWith('open_ilias', {
      baseUrl: 'https://ilias.hs-heilbronn.de',
      clientId: 'iliashhn',
      target: 'crs_717',
    });
  });

  /** A refused link fails here, with the same message as in the browser. */
  it('never crosses into Rust with a link from somewhere else', async () => {
    await expect(openIlias(HEILBRONN, 'javascript:alert(1)')).rejects.toThrowError();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('passes on what Rust reports', async () => {
    invoke.mockRejectedValue('ILIAS could not be opened: window already exists');

    await expect(openIlias(HEILBRONN)).rejects.toBe(
      'ILIAS could not be opened: window already exists',
    );
  });

  it('reports that ILIAS opens in a window here', () => {
    expect(canOpenIliasWindow()).toBe(true);
  });
});

describe('belongsToIlias', () => {
  it('accepts links from the connected installation', () => {
    expect(belongsToIlias(HEILBRONN, 'https://ilias.hs-heilbronn.de/goto.php?target=crs_1')).toBe(
      true,
    );
  });

  it('turns down anything else, so the UI does not offer a button that cannot work', () => {
    expect(belongsToIlias(HEILBRONN, 'https://splan.hs-heilbronn.de/splan/')).toBe(false);
    expect(belongsToIlias(HEILBRONN, 'not a link')).toBe(false);
  });
});
