import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCourseStore } from '@/features/courses/store/courseStore';
import type { IliasConnection } from '@/features/integrations/lib/ilias/connection';
import type { IliasCourse } from '@/features/integrations/lib/iliasSync';
import { useIliasBrowserStore } from '@/features/integrations/store/iliasBrowserStore';
import { useUiStore } from '@/store/uiStore';
import { IliasPanel } from './IliasPanel';

const invoke = vi.fn<(command: string, args: Record<string, unknown>) => Promise<unknown>>();
const openIlias = vi.fn<(connection: IliasConnection, target?: string) => Promise<void>>();

type Handler = (event: { payload: unknown }) => void;
/** What the panel listens to, by event name — for playing Rust's part. */
const listeners = new Map<string, Handler>();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (command: string, args: Record<string, unknown>) => invoke(command, args),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: (name: string, handler: Handler) => {
    listeners.set(name, handler);
    return Promise.resolve(() => listeners.delete(name));
  },
}));

/** Sends an event as Rust would, once the panel is listening for it. */
async function fromRust(name: string, payload: unknown) {
  await waitFor(() => expect(listeners.has(name)).toBe(true));
  act(() => listeners.get(name)?.({ payload }));
}

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

/**
 * Every layout or navigation command sent to Rust, in order, with its target
 * where it has one. Asking where ILIAS stands in its history changes nothing,
 * so it is left out.
 */
const sent = () =>
  invoke.mock.calls
    .filter(([command]) => command !== 'ilias_history')
    .map(([command, args]) => ('target' in args ? `${command}(${String(args.target)})` : command));

const argsOf = (command: string) =>
  invoke.mock.calls.filter(([name]) => name === command).map(([, args]) => args);

function renderPanel(props: { initialTarget?: string; onDisconnect?: () => void } = {}) {
  const view = (target?: string) => (
    <IliasPanel
      connection={HEILBRONN}
      initialTarget={target}
      onDisconnect={props.onDisconnect ?? (() => undefined)}
    />
  );
  const result = render(view(props.initialTarget));
  return { ...result, retarget: (target: string) => result.rerender(view(target)) };
}

const panel = () => screen.getByRole('complementary', { name: 'ILIAS' });

const course = (refId: string, title: string, extra: Partial<IliasCourse> = {}): IliasCourse => ({
  refId,
  providerType: 'crs',
  title,
  description: null,
  area: null,
  online: true,
  period: null,
  properties: [],
  ...extra,
});

beforeEach(() => {
  invoke.mockReset().mockResolvedValue(undefined);
  openIlias.mockReset().mockResolvedValue(undefined);
  listeners.clear();
  document.body.innerHTML = '';
  document.documentElement.removeAttribute('style');
  document.documentElement.removeAttribute('data-theme');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('entering and leaving', () => {
  it('switches the window to ILIAS mode, keeping ILIAS’s page', async () => {
    renderPanel();
    await waitFor(() => expect(sent()).toContain('enter_ilias_mode(null)'));
  });

  it('tells the shell, so the header and the card step aside', () => {
    const { unmount } = renderPanel();
    expect(useUiStore.getState().iliasMode).toBe(true);

    unmount();
    expect(useUiStore.getState().iliasMode).toBe(false);
  });

  it('arrives at a deep link it was brought with', async () => {
    const link = 'https://ilias.hs-heilbronn.de/goto.php?target=exc_4711';
    renderPanel({ initialTarget: link });
    await waitFor(() => expect(sent()).toContain(`enter_ilias_mode(${link})`));
  });

  /** A new link only navigates — the window is not taken apart and rebuilt. */
  it('follows a later deep link without leaving ILIAS mode', async () => {
    const { retarget } = renderPanel();
    await waitFor(() => expect(sent()).toContain('enter_ilias_mode(null)'));
    invoke.mockClear();

    const link = 'https://ilias.hs-heilbronn.de/goto.php?target=crs_717';
    retarget(link);

    await waitFor(() => expect(sent()).toEqual([`navigate_ilias(${link})`]));
  });

  it('gives Uni Pilot the window back on the way out', async () => {
    const { unmount } = renderPanel();
    await waitFor(() => expect(sent()).toContain('enter_ilias_mode(null)'));

    unmount();

    await waitFor(() => expect(sent().at(-1)).toBe('leave_ilias_mode'));
    expect(sent()).not.toContain('close_ilias_view');
  });
});

describe('what the page tells Rust about its layout', () => {
  /** The panel could not be measured here, so the rail and the panel as drawn stand in. */
  it('sends the column, the gutter and no colour where nothing is laid out', async () => {
    renderPanel();
    await waitFor(() => expect(argsOf('enter_ilias_mode')).toHaveLength(1));

    expect(argsOf('enter_ilias_mode')[0]).toEqual({
      baseUrl: 'https://ilias.hs-heilbronn.de',
      clientId: 'iliashhn',
      target: null,
      column: 312,
      gutter: 4,
      frame: null,
      pageHeight: window.innerHeight,
    });
  });

  /** The column is however far the panel reaches — rail and panel together. */
  it('sends the right edge of the panel as the column’s width', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      const right = this.tagName === 'ASIDE' ? 318 : 0;
      return new DOMRect(0, 0, right, 0);
    });
    renderPanel();

    await waitFor(() => expect(argsOf('enter_ilias_mode')).toHaveLength(1));
    expect(argsOf('enter_ilias_mode')[0]).toMatchObject({ column: 318 });
  });

  it('sends the stylesheet’s gutter and the frame’s colour', async () => {
    document.documentElement.style.setProperty('--frame-gutter', '12px');
    document.documentElement.style.setProperty('--frame-to', '#e3eff9');
    renderPanel();

    await waitFor(() => expect(argsOf('enter_ilias_mode')).toHaveLength(1));
    expect(argsOf('enter_ilias_mode')[0]).toMatchObject({
      gutter: 12,
      frame: [0xe3, 0xef, 0xf9],
    });
  });

  /** The dark theme writes its colours as oklch(). */
  it('sends it again, without re-entering, when the theme changes it', async () => {
    document.documentElement.style.setProperty('--frame-to', '#e3eff9');
    renderPanel();
    await waitFor(() => expect(argsOf('enter_ilias_mode')).toHaveLength(1));
    invoke.mockClear();

    act(() => {
      document.documentElement.style.setProperty('--frame-to', 'oklch(1 0 0)');
      document.documentElement.dataset['theme'] = 'dark';
    });

    await waitFor(() => expect(argsOf('set_ilias_layout')).toHaveLength(1));
    expect(argsOf('set_ilias_layout')[0]).toEqual({
      column: 312,
      gutter: 4,
      frame: [255, 255, 255],
    });
    expect(sent()).toEqual(['set_ilias_layout']);
  });

  it('says nothing when the theme changed but the layout did not', async () => {
    document.documentElement.style.setProperty('--frame-to', '#e3eff9');
    renderPanel();
    await waitFor(() => expect(argsOf('enter_ilias_mode')).toHaveLength(1));
    invoke.mockClear();

    act(() => {
      document.documentElement.dataset['theme'] = 'flexoki-light';
    });
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(sent()).toEqual([]);
  });
});

describe('dialogs', () => {
  /**
   * Uni Pilot is only the left column in ILIAS mode, so a dialog would be cut
   * off. While one is open the window goes back to Uni Pilot, and afterwards
   * ILIAS returns on the page it was on.
   */
  it('takes the window back while a dialog is open', async () => {
    renderPanel();
    await waitFor(() => expect(sent()).toContain('enter_ilias_mode(null)'));
    invoke.mockClear();

    const dialog = document.createElement('dialog');
    document.body.append(dialog);
    dialog.setAttribute('open', '');
    await waitFor(() => expect(sent()).toEqual(['leave_ilias_mode']));

    dialog.removeAttribute('open');
    await waitFor(() => expect(sent()).toEqual(['leave_ilias_mode', 'enter_ilias_mode(null)']));
    expect(argsOf('enter_ilias_mode')[0]).toMatchObject({ column: 312, gutter: 4 });
  });
});

describe('the panel', () => {
  it('is named, and says which ILIAS it is', () => {
    renderPanel();
    expect(within(panel()).getByRole('heading', { name: 'ILIAS' })).toBeInTheDocument();
    expect(within(panel()).getByText('Hochschule Heilbronn · ILIAS 9.23')).toBeInTheDocument();
  });

  it('names the page for screen readers, in the place ILIAS will be', () => {
    renderPanel();
    expect(
      screen.getByRole('heading', { level: 1, name: 'ILIAS: Hochschule Heilbronn' }),
    ).toBeInTheDocument();
  });

  it('goes to the ILIAS dashboard', async () => {
    renderPanel();
    await userEvent.click(screen.getByRole('button', { name: 'ILIAS dashboard' }));
    await waitFor(() => expect(sent()).toContain('navigate_ilias()'));
  });

  /** ILIAS 9 ignores a bare logout.php; Rust finds ILIAS's own link instead. */
  it('signs out the way ILIAS’s own menu does', async () => {
    renderPanel();
    await userEvent.click(screen.getByRole('button', { name: 'Sign out of ILIAS' }));
    expect(invoke).toHaveBeenCalledWith('sign_out_of_ilias', {
      baseUrl: 'https://ilias.hs-heilbronn.de',
      clientId: 'iliashhn',
    });
    expect(sent()).not.toContain('navigate_ilias(https://ilias.hs-heilbronn.de/logout.php)');
  });

  it('says so when no one was signed in', async () => {
    invoke.mockImplementation((command) =>
      Promise.resolve(command === 'sign_out_of_ilias' ? 'here' : undefined),
    );
    renderPanel();
    await userEvent.click(screen.getByRole('button', { name: 'Sign out of ILIAS' }));
    expect(await screen.findByText('No one was signed in to ILIAS.')).toBeInTheDocument();
  });

  /** Passkeys (Touch ID) work in a browser, never in an app's webview. */
  it('opens ILIAS in the student’s own browser', async () => {
    renderPanel();
    await userEvent.click(screen.getByRole('button', { name: 'Open in your browser' }));
    expect(invoke).toHaveBeenCalledWith('open_ilias_in_browser', {
      baseUrl: 'https://ilias.hs-heilbronn.de',
      clientId: 'iliashhn',
    });
  });

  it('still offers the separate window', async () => {
    renderPanel();
    await userEvent.click(screen.getByRole('button', { name: 'Open in a separate window' }));
    expect(openIlias).toHaveBeenCalledWith(HEILBRONN, undefined);
  });

  it('closes ILIAS before disconnecting', async () => {
    const onDisconnect = vi.fn();
    renderPanel({ onDisconnect });

    await userEvent.click(screen.getByRole('button', { name: 'Disconnect' }));

    await waitFor(() => expect(onDisconnect).toHaveBeenCalled());
    expect(sent()).toContain('close_ilias_view');
  });

  it('shows what went wrong', async () => {
    invoke.mockRejectedValue('ILIAS could not be opened: the Uni Pilot window is gone.');
    renderPanel();

    expect(await screen.findByRole('alert')).toHaveTextContent('the Uni Pilot window is gone');
  });

  /** The rail is the way back to Uni Pilot; the panel no longer has one of its own. */
  it('has no way back to Uni Pilot of its own', () => {
    renderPanel();
    expect(screen.queryByRole('button', { name: 'Uni Pilot' })).not.toBeInTheDocument();
  });
});

describe('courses', () => {
  const read = (installation: string, courses: IliasCourse[]) =>
    useCourseStore.setState({
      installation,
      courses: { items: courses, loadedAt: '2026-10-08T09:00:00.000Z' },
    });

  it('lists the ones ILIAS gave, by name, and not the ones that are offline', () => {
    read('ilias.hs-heilbronn.de', [
      course('717', '262058 Datenbanken 1 - WS25'),
      course('718', '262059 Analysis 2 - SoSe 2026'),
      course('719', '262060 Alte Vorlesung', { online: false }),
    ]);
    renderPanel();

    const courses = within(screen.getByRole('group', { name: 'Courses' }));
    expect(courses.getByRole('button', { name: 'Datenbanken 1 - WS25' })).toBeInTheDocument();
    expect(courses.getByRole('button', { name: 'Analysis 2 - SoSe 2026' })).toBeInTheDocument();
    expect(courses.queryByRole('button', { name: /Alte Vorlesung/ })).not.toBeInTheDocument();
  });

  it('opens a course in ILIAS', async () => {
    read('ilias.hs-heilbronn.de', [course('717', '262058 Datenbanken 1 - WS25')]);
    renderPanel();
    await waitFor(() => expect(sent()).toContain('enter_ilias_mode(null)'));
    invoke.mockClear();

    await userEvent.click(screen.getByRole('button', { name: 'Datenbanken 1 - WS25' }));

    await waitFor(() => expect(sent()).toEqual(['navigate_ilias(crs_717)']));
  });

  it('opens a group the same way', async () => {
    read('ilias.hs-heilbronn.de', [course('555', 'Lerngruppe Mathe', { providerType: 'grp' })]);
    renderPanel();

    await userEvent.click(screen.getByRole('button', { name: 'Lerngruppe Mathe' }));

    await waitFor(() => expect(sent()).toContain('navigate_ilias(grp_555)'));
  });

  it('marks the course ILIAS is showing', async () => {
    read('ilias.hs-heilbronn.de', [
      course('717', '262058 Datenbanken 1 - WS25'),
      course('718', '262059 Analysis 2 - SoSe 2026'),
    ]);
    renderPanel();
    const database = screen.getByRole('button', { name: 'Datenbanken 1 - WS25' });
    expect(database).not.toHaveAttribute('aria-current');

    await fromRust('ilias-location', { refId: '717' });

    expect(database).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('button', { name: 'Analysis 2 - SoSe 2026' })).not.toHaveAttribute(
      'aria-current',
    );

    await fromRust('ilias-location', { refId: null });
    expect(database).not.toHaveAttribute('aria-current');
  });

  /** Courses cached for another university would send the student somewhere they are not. */
  it('shows none from another installation, and says when there are none yet', () => {
    read('ilias.other-university.example', [course('717', 'Datenbanken')]);
    renderPanel();

    expect(screen.queryByRole('button', { name: 'Datenbanken' })).not.toBeInTheDocument();
    expect(screen.getByText(/Your courses appear here/)).toBeInTheDocument();
  });
});

describe('back and forward', () => {
  const back = () => screen.getByRole('button', { name: 'Back in ILIAS' });
  const forward = () => screen.getByRole('button', { name: 'Forward in ILIAS' });

  it('has nowhere to go before ILIAS has been anywhere', () => {
    renderPanel();
    expect(back()).toBeDisabled();
    expect(forward()).toBeDisabled();
  });

  /** Returning to the page, the panel must not show a stale history. */
  it('asks where ILIAS stands once it is on screen', async () => {
    invoke.mockImplementation((command) =>
      Promise.resolve(
        command === 'ilias_history' ? { canGoBack: true, canGoForward: false } : undefined,
      ),
    );
    renderPanel();
    await waitFor(() => expect(back()).toBeEnabled());
    expect(forward()).toBeDisabled();
  });

  it('follows ILIAS as it moves from page to page', async () => {
    renderPanel();
    await fromRust('ilias-history', { canGoBack: true, canGoForward: true });
    expect(back()).toBeEnabled();
    expect(forward()).toBeEnabled();
  });

  it('goes back and forward like a browser', async () => {
    renderPanel();
    await fromRust('ilias-history', { canGoBack: true, canGoForward: true });

    await userEvent.click(back());
    await userEvent.click(forward());

    expect(invoke).toHaveBeenCalledWith('travel_ilias', { step: 'back' });
    expect(invoke).toHaveBeenLastCalledWith('travel_ilias', { step: 'forward' });
  });
});

describe('downloads', () => {
  const pdf = { id: 1, fileName: 'Blatt 3.pdf', openable: true };

  /** The bug this answers: a PDF was clicked, and nothing said whether it came. */
  it('says a download is running, then that it arrived', async () => {
    renderPanel();

    await fromRust('ilias-download', { ...pdf, state: 'started' });
    expect(screen.getByRole('status')).toHaveTextContent('Downloading Blatt 3.pdf');

    await fromRust('ilias-download', { ...pdf, state: 'finished' });
    expect(screen.getByRole('status')).toHaveTextContent('Blatt 3.pdf saved to Downloads');
  });

  it('opens the file it saved, by its id', async () => {
    renderPanel();
    await fromRust('ilias-download', { ...pdf, state: 'finished' });

    await userEvent.click(screen.getByRole('button', { name: 'Open Blatt 3.pdf' }));

    expect(invoke).toHaveBeenCalledWith('open_ilias_download', { id: 1 });
  });

  it('keeps its place in the panel’s foot, above the controls', async () => {
    renderPanel();
    await fromRust('ilias-download', { ...pdf, state: 'finished' });

    const status = screen.getByRole('status');
    const footer = status.closest('.panel-footer');
    expect(footer).not.toBeNull();
    expect(within(footer as HTMLElement).getByRole('button', { name: 'Disconnect' })).toBeVisible();
    expect(useIliasBrowserStore.getState().downloads).toHaveLength(1);
  });
});
