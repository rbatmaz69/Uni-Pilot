import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCourseStore } from '@/features/courses/store/courseStore';
import { useIliasStore } from '@/features/integrations/store/iliasStore';
import { useUiStore } from '@/store/uiStore';
import { useAutoSignInStore } from '@/features/auto-sign-in/store/autoSignInStore';
import { useNotchStore } from '@/features/auto-sign-in/store/notchStore';
import { NotchSync, SIGNED_IN_MS } from './NotchSync';

const invoke = vi.fn<(command: string, args?: unknown) => Promise<unknown>>();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (command: string, args?: unknown) => invoke(command, args),
}));

let act_on: (action: string) => void = () => undefined;
vi.mock('@tauri-apps/api/event', () => ({
  listen: (_event: string, handler: (event: { payload: { action: string } }) => void) => {
    act_on = (action) => handler({ payload: { action } });
    return Promise.resolve(() => undefined);
  },
}));

const HOST = 'ilias.hs-heilbronn.de';
const READY = {
  credentials: true,
  username: 'student',
  device: 'Uni Pilot',
  stale: false,
  face: true,
};
const SIGNED_OUT = { kind: 'session-expired' as const, message: 'Sign in to ILIAS again.' };

const shows = () =>
  invoke.mock.calls
    .filter(([command]) => command === 'notch_show')
    .map(([, args]) => (args as { state: { phase: string } }).state);
const hides = () => invoke.mock.calls.filter(([command]) => command === 'notch_hide');

beforeEach(() => {
  invoke.mockReset().mockResolvedValue(true);
  Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {}, configurable: true });
  useIliasStore.setState({
    connection: {
      name: 'Hochschule Heilbronn',
      baseUrl: 'https://ilias.hs-heilbronn.de',
      clientId: 'iliashhn',
      version: '9.23',
      signIn: 'both',
      soap: 'blocked',
      checkedAt: '2026-09-25T10:00:00.000Z',
    },
  });
  useCourseStore.setState({ failure: { ...SIGNED_OUT }, loading: {} });
  useAutoSignInStore.setState({ byHost: { [HOST]: READY }, autoUnlock: true, faceBar: null });
  useNotchStore.setState({ camera: null, signedInAt: null, available: null });
  useUiStore.setState({ iliasMode: false });
});

afterEach(() => {
  Reflect.deleteProperty(window, '__TAURI_INTERNALS__');
  vi.useRealTimers();
});

function renderSync() {
  render(
    <MemoryRouter initialEntries={['/documents']}>
      <Routes>
        <Route path="/ilias" element={<p>ILIAS mode</p>} />
        <Route path="*" element={<NotchSync />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('face unlock in the notch', () => {
  it('shows where the camera is, and learns that this Mac has a notch', async () => {
    renderSync();
    await waitFor(() => expect(shows().at(-1)?.phase).toBe('starting'));

    act(() => useNotchStore.getState().setCamera('looking'));
    await waitFor(() =>
      expect(shows().at(-1)).toEqual({
        phase: 'looking',
        text: 'Look at the camera to sign in to ILIAS again.',
        again: false,
        camera: true,
      }),
    );
    expect(useNotchStore.getState().available).toBe(true);
  });

  it('keeps the bar in the window on a Mac without a notch', async () => {
    invoke.mockResolvedValue(false);
    renderSync();
    await waitFor(() => expect(useNotchStore.getState().available).toBe(false));
  });

  it('shows nothing in ILIAS mode, while the session holds, or before it is allowed', async () => {
    useUiStore.setState({ iliasMode: true });
    renderSync();
    await waitFor(() => expect(hides()).toHaveLength(1));
    expect(shows()).toHaveLength(0);
  });

  it('smiles while signing in and once signed in, then folds away', async () => {
    renderSync();
    await waitFor(() => expect(shows()).toHaveLength(1));

    act(() => {
      useAutoSignInStore.setState({
        faceBar: { for: useCourseStore.getState().failure!, state: 'signingIn' },
      });
    });
    await waitFor(() => expect(shows().at(-1)?.phase).toBe('signingIn'));

    vi.useFakeTimers({ shouldAdvanceTime: true });
    act(() => {
      useAutoSignInStore.setState({ faceBar: null });
      useCourseStore.setState({ failure: null });
      useNotchStore.getState().signedIn();
    });
    await waitFor(() => expect(shows().at(-1)?.phase).toBe('signedIn'));
    const before = hides().length;
    await act(() => vi.advanceTimersByTimeAsync(SIGNED_IN_MS + 10));
    await waitFor(() => expect(hides().length).toBeGreaterThan(before));
  });

  it('does what the island asks', async () => {
    renderSync();
    await waitFor(() => expect(shows()).toHaveLength(1));
    const failure = useCourseStore.getState().failure;

    act(() => act_on('cancel'));
    expect(useAutoSignInStore.getState().faceBar).toEqual({ for: failure, state: 'dismissed' });

    act(() => act_on('retry'));
    expect(useAutoSignInStore.getState().faceBar).toEqual({ for: failure, state: 'requested' });

    act(() => act_on('password'));
    expect(useAutoSignInStore.getState().faceBar?.state).toBe('dismissed');
    expect(screen.getByText('ILIAS mode')).toBeInTheDocument();
  });
});
