import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IliasConnection } from '@/features/integrations/lib/ilias/connection';
import type { IliasMetrics } from './iliasFrame';
import {
  closeIliasView,
  enterIliasMode,
  leaveIliasMode,
  navigateIlias,
  overlayIsOpen,
  setIliasLayout,
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

/** The rail and the panel, the frame's gutter and its colour. */
const METRICS: IliasMetrics = { column: 312, gutter: 8, frame: [227, 239, 249] };

const commands = () => invoke.mock.calls.map(([command]) => command);

beforeEach(() => {
  invoke.mockReset().mockResolvedValue(undefined);
  document.body.innerHTML = '';
});

describe('overlayIsOpen', () => {
  const add = (html: string) => document.body.insertAdjacentHTML('beforeend', html);

  it('is false on a page with nothing open', () => {
    expect(overlayIsOpen()).toBe(false);
  });

  it('sees the app’s own dialogs', () => {
    add('<div role="dialog" aria-modal="true"></div>');
    expect(overlayIsOpen()).toBe(true);
  });

  it('sees an open native dialog, and ignores a closed one', () => {
    add('<dialog aria-label="Search workspace"></dialog>');
    expect(overlayIsOpen()).toBe(false);
    document.querySelector('dialog')?.setAttribute('open', '');
    expect(overlayIsOpen()).toBe(true);
  });

  /** ILIAS jumping out of the way on hover would be worse than a clipped tooltip. */
  it('ignores tooltips and reminders', () => {
    add('<div role="tooltip">Close</div><div class="reminder-overlay" role="status"></div>');
    expect(overlayIsOpen()).toBe(false);
  });
});

describe('entering ILIAS mode', () => {
  /**
   * Rust cannot see how wide the column is, how wide the frame's gutter is or
   * what colour, nor how tall the page was before it shrank — the last is what
   * the title bar is read from. So all of them travel.
   */
  it('hands Rust the column, the frame and the page height', async () => {
    await enterIliasMode(HEILBRONN, METRICS);

    expect(invoke).toHaveBeenCalledWith('enter_ilias_mode', {
      baseUrl: 'https://ilias.hs-heilbronn.de',
      clientId: 'iliashhn',
      target: null,
      column: 312,
      gutter: 8,
      frame: [227, 239, 249],
      pageHeight: window.innerHeight,
    });
  });

  it('says so when the frame’s colour is not known', async () => {
    await enterIliasMode(HEILBRONN, { ...METRICS, frame: null });
    expect(invoke).toHaveBeenCalledWith(
      'enter_ilias_mode',
      expect.objectContaining({ frame: null }),
    );
  });

  it('passes a deep link to arrive at', async () => {
    const link = 'https://ilias.hs-heilbronn.de/goto.php?target=exc_4711';
    await enterIliasMode(HEILBRONN, METRICS, link);
    expect(invoke).toHaveBeenCalledWith(
      'enter_ilias_mode',
      expect.objectContaining({ target: link }),
    );
  });

  it('never crosses into Rust with a link from somewhere else', async () => {
    await expect(enterIliasMode(HEILBRONN, METRICS, 'https://evil.example/')).rejects.toThrowError(
      /does not belong to your ILIAS/,
    );
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe('the other commands', () => {
  it('passes on a new layout — the theme changed, say — without entering again', async () => {
    await setIliasLayout({ column: 312, gutter: 8, frame: [14, 16, 21] });

    expect(invoke).toHaveBeenCalledOnce();
    expect(invoke).toHaveBeenCalledWith('set_ilias_layout', {
      column: 312,
      gutter: 8,
      frame: [14, 16, 21],
    });
  });

  it('leaves, giving Uni Pilot the window back', async () => {
    await leaveIliasMode();
    expect(invoke).toHaveBeenCalledWith('leave_ilias_mode', {});
  });

  it('navigates, with an empty target meaning the dashboard', async () => {
    await navigateIlias(HEILBRONN, '');
    expect(invoke).toHaveBeenCalledWith('navigate_ilias', {
      baseUrl: 'https://ilias.hs-heilbronn.de',
      clientId: 'iliashhn',
      target: '',
    });
  });

  it('checks a navigation target before sending it', async () => {
    await expect(navigateIlias(HEILBRONN, 'javascript:alert(1)')).rejects.toThrowError();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('closes ILIAS for good', async () => {
    await closeIliasView();
    expect(invoke).toHaveBeenCalledWith('close_ilias_view', {});
  });
});

describe('the order calls reach Rust in', () => {
  /**
   * React mounts effects twice in development: enter, leave, enter. If the
   * leave landed last, the ILIAS page would be the column beside an empty window.
   */
  it('keeps enter, leave, enter in that order even when the first is slow', async () => {
    let finishFirst: () => void = () => undefined;
    invoke.mockImplementationOnce(
      () =>
        new Promise<undefined>((resolve) => {
          finishFirst = () => resolve(undefined);
        }),
    );

    const first = enterIliasMode(HEILBRONN, METRICS);
    const leave = leaveIliasMode();
    const second = enterIliasMode(HEILBRONN, METRICS);

    try {
      await vi.waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
      // Give the others every chance to jump ahead. They must not.
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(commands()).toEqual(['enter_ilias_mode']);
    } finally {
      // Released either way, so a failure here cannot jam the queue for the
      // tests after it.
      finishFirst();
    }
    await Promise.all([first, leave, second]);

    expect(commands()).toEqual(['enter_ilias_mode', 'leave_ilias_mode', 'enter_ilias_mode']);
  });

  /** A layout update that overtook "enter" would reach Rust while ILIAS mode was still off, and be lost. */
  it('keeps a layout update behind the enter it follows', async () => {
    let finishFirst: () => void = () => undefined;
    invoke.mockImplementationOnce(
      () =>
        new Promise<undefined>((resolve) => {
          finishFirst = () => resolve(undefined);
        }),
    );

    const enter = enterIliasMode(HEILBRONN, METRICS);
    const update = setIliasLayout({ ...METRICS, frame: [14, 16, 21] });

    try {
      await vi.waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(commands()).toEqual(['enter_ilias_mode']);
    } finally {
      finishFirst();
    }
    await Promise.all([enter, update]);

    expect(commands()).toEqual(['enter_ilias_mode', 'set_ilias_layout']);
  });

  /** Without the limit, one call that never returns would jam the page for good. */
  it('lets later calls through when one never returns', async () => {
    vi.useFakeTimers();
    try {
      invoke.mockImplementationOnce(() => new Promise<undefined>(() => undefined));

      const stuck = enterIliasMode(HEILBRONN, METRICS);
      stuck.catch(() => undefined);
      await vi.advanceTimersByTimeAsync(0);
      const after = leaveIliasMode();

      await vi.advanceTimersByTimeAsync(15_000);

      await expect(stuck).rejects.toThrowError(/did not respond/);
      await after;
      expect(invoke).toHaveBeenLastCalledWith('leave_ilias_mode', {});
    } finally {
      vi.useRealTimers();
    }
  });

  it('carries on after a call fails', async () => {
    invoke.mockRejectedValueOnce('ILIAS could not be opened: gone');

    await expect(enterIliasMode(HEILBRONN, METRICS)).rejects.toBe(
      'ILIAS could not be opened: gone',
    );
    await leaveIliasMode();

    expect(invoke).toHaveBeenLastCalledWith('leave_ilias_mode', {});
  });
});
