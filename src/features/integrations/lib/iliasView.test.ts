import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IliasConnection } from '@/features/integrations/lib/ilias/connection';
import {
  boundsOf,
  closeIliasView,
  hideIliasView,
  overlayIsOpen,
  placeIliasView,
  showIliasView,
} from './iliasView';

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

const AREA = { x: 248, y: 132, width: 1100, height: 700 };

beforeEach(() => {
  invoke.mockReset().mockResolvedValue(undefined);
  document.body.innerHTML = '';
});

describe('boundsOf', () => {
  it('rounds, so the view does not land on half pixels', () => {
    const element = document.createElement('div');
    element.getBoundingClientRect = () =>
      ({ left: 248.4, top: 131.6, width: 1100.5, height: 699.49 }) as DOMRect;

    expect(boundsOf(element)).toEqual({ x: 248, y: 132, width: 1101, height: 699 });
  });

  it('never reports a negative size', () => {
    const element = document.createElement('div');
    element.getBoundingClientRect = () => ({ left: 0, top: 0, width: -3, height: -1 }) as DOMRect;

    expect(boundsOf(element)).toMatchObject({ width: 0, height: 0 });
  });
});

describe('overlayIsOpen', () => {
  const add = (html: string) => {
    document.body.insertAdjacentHTML('beforeend', html);
  };

  it('is false on a page with nothing open', () => {
    expect(overlayIsOpen()).toBe(false);
  });

  it('sees the app’s own dialogs', () => {
    add('<div role="dialog" aria-modal="true"></div>');
    expect(overlayIsOpen()).toBe(true);
  });

  /** The header's search and notifications are a native <dialog>. */
  it('sees an open native dialog, and ignores a closed one', () => {
    add('<dialog aria-label="Search workspace"></dialog>');
    expect(overlayIsOpen()).toBe(false);

    document.querySelector('dialog')?.setAttribute('open', '');
    expect(overlayIsOpen()).toBe(true);
  });

  /** Hiding ILIAS on hover would make it flicker. */
  it('ignores tooltips', () => {
    add('<div role="tooltip">Close</div>');
    expect(overlayIsOpen()).toBe(false);
  });

  /** A reminder should not make a half-written forum post vanish. */
  it('ignores reminders', () => {
    add('<div class="reminder-overlay" role="status">Exam tomorrow</div>');
    expect(overlayIsOpen()).toBe(false);
  });
});

describe('showIliasView', () => {
  it('asks Rust to show ILIAS over the area, keeping the page it was on', async () => {
    await showIliasView(HEILBRONN, AREA);

    expect(invoke).toHaveBeenCalledWith('show_ilias_view', {
      baseUrl: 'https://ilias.hs-heilbronn.de',
      clientId: 'iliashhn',
      target: null,
      bounds: AREA,
    });
  });

  it('passes an empty target through, which means the dashboard', async () => {
    await showIliasView(HEILBRONN, AREA, '');
    expect(invoke).toHaveBeenCalledWith('show_ilias_view', expect.objectContaining({ target: '' }));
  });

  it('never crosses into Rust with a link from somewhere else', async () => {
    await expect(showIliasView(HEILBRONN, AREA, 'https://evil.example/')).rejects.toThrowError(
      /does not belong to your ILIAS/,
    );
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe('the order calls reach Rust in', () => {
  /**
   * React mounts effects twice in development: show, hide, show. The Rust
   * commands are async and could overtake each other; if the hide landed last,
   * ILIAS would stay invisible on an open ILIAS page.
   */
  it('keeps show, hide, show in that order even when the first is slow', async () => {
    let finishFirst: () => void = () => undefined;
    invoke.mockImplementationOnce(
      () =>
        new Promise<undefined>((resolve) => {
          finishFirst = () => resolve(undefined);
        }),
    );

    const first = showIliasView(HEILBRONN, AREA);
    const hide = hideIliasView();
    const second = showIliasView(HEILBRONN, AREA);

    try {
      await vi.waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
      // Give the others every chance to jump ahead. They must not.
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(invoke.mock.calls.map(([command]) => command)).toEqual(['show_ilias_view']);
    } finally {
      // Released either way, so a failure here cannot leave the queue stuck
      // for every test after it.
      finishFirst();
    }
    await Promise.all([first, hide, second]);

    expect(invoke.mock.calls.map(([command]) => command)).toEqual([
      'show_ilias_view',
      'hide_ilias_view',
      'show_ilias_view',
    ]);
  });

  /**
   * A call that never returns must not leave every later one waiting. Without
   * the limit, the ILIAS page would be dead until the app restarted.
   */
  it('lets later calls through when one never returns', async () => {
    vi.useFakeTimers();
    try {
      invoke.mockImplementationOnce(() => new Promise<undefined>(() => undefined));

      const stuck = showIliasView(HEILBRONN, AREA);
      const after = hideIliasView();
      stuck.catch(() => undefined);

      await vi.advanceTimersByTimeAsync(15_000);

      await expect(stuck).rejects.toThrowError(/did not respond/);
      await after;
      expect(invoke).toHaveBeenLastCalledWith('hide_ilias_view', {});
    } finally {
      vi.useRealTimers();
    }
  });

  it('carries on after a call fails', async () => {
    invoke.mockRejectedValueOnce('ILIAS could not be opened: gone');

    await expect(showIliasView(HEILBRONN, AREA)).rejects.toBe('ILIAS could not be opened: gone');
    await hideIliasView();

    expect(invoke).toHaveBeenLastCalledWith('hide_ilias_view', {});
  });

  /** While the sidebar animates, only where it ends up matters. */
  it('sends only the newest placement when several arrive at once', async () => {
    const pending = [
      placeIliasView({ ...AREA, x: 100 }),
      placeIliasView({ ...AREA, x: 150 }),
      placeIliasView({ ...AREA, x: 200 }),
    ];
    await Promise.all(pending);

    const placements = invoke.mock.calls.filter(([command]) => command === 'place_ilias_view');
    expect(placements).toHaveLength(1);
    expect(placements[0]?.[1]).toEqual({ bounds: { ...AREA, x: 200 } });
  });

  it('closes the view for good', async () => {
    await closeIliasView();
    expect(invoke).toHaveBeenCalledWith('close_ilias_view', {});
  });
});
