import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCourseStore } from '@/features/courses/store/courseStore';
import { useIliasStore } from '@/features/integrations/store/iliasStore';
import { useAutoSignInStore } from '@/features/auto-sign-in/store/autoSignInStore';
import { useNotchStore } from '@/features/auto-sign-in/store/notchStore';
import { FaceUnlockBar } from './FaceUnlockBar';

/** What happened, in order: Rust's commands, the camera on and off. */
const log: string[] = [];
const invoke = vi.fn<(command: string, args?: unknown) => Promise<unknown>>();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (command: string, args?: unknown) => {
    log.push(command);
    return invoke(command, args);
  },
}));

const camera = {
  grab: vi.fn(() => Promise.resolve(new Uint8Array([0xff, 0xd8]))),
  stop: vi.fn(() => {
    log.push('camera off');
  }),
};
vi.mock('@/features/auto-sign-in/lib/camera', () => ({
  openCamera: () => {
    log.push('camera on');
    return Promise.resolve(camera);
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
const SIGNED_OUT = {
  kind: 'session-expired' as const,
  message: 'The ILIAS sign-in has ended. Sign in to ILIAS again.',
};

/** Rust's refusal, a plain object as Tauri hands it over. */
const refuse = (failure: unknown) => vi.fn<() => Promise<unknown>>().mockRejectedValue(failure);

function rust(answers: Partial<Record<string, () => Promise<unknown>>>) {
  invoke.mockImplementation((command) =>
    (answers[command] ?? (() => Promise.resolve(undefined)))(),
  );
}

beforeEach(() => {
  log.length = 0;
  invoke.mockReset();
  camera.stop.mockClear();
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
  useCourseStore.setState({ failure: { ...SIGNED_OUT }, loading: {}, courses: null });
  useAutoSignInStore.setState({
    byHost: { [HOST]: READY },
    autoUnlock: true,
    faceBar: null,
    signingIn: false,
  });
  useNotchStore.setState({ camera: null, signedInAt: null, available: null });
});

afterEach(() => {
  Reflect.deleteProperty(window, '__TAURI_INTERNALS__');
});

function renderBar() {
  render(
    <MemoryRouter initialEntries={['/documents']}>
      <Routes>
        <Route path="/ilias" element={<p>ILIAS mode</p>} />
        <Route path="*" element={<FaceUnlockBar />} />
      </Routes>
    </MemoryRouter>,
  );
  return userEvent.setup();
}

const bar = () => screen.queryByRole('region', { name: 'Face unlock' });

describe('the face bar', () => {
  it('is not there while ILIAS has a session, nor before it is allowed', async () => {
    useCourseStore.setState({ failure: null });
    const { unmount } = render(
      <MemoryRouter>
        <FaceUnlockBar />
      </MemoryRouter>,
    );
    expect(bar()).not.toBeInTheDocument();
    unmount();

    useCourseStore.setState({ failure: { ...SIGNED_OUT } });
    useAutoSignInStore.setState({ autoUnlock: false });
    renderBar();
    expect(bar()).not.toBeInTheDocument();
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(log).toEqual([]);
  });

  /** A read under way may find the session back: no camera until it answers. */
  it('waits while the course list is being read', async () => {
    useCourseStore.setState({ loading: { courses: true } });
    renderBar();
    expect(bar()).not.toBeInTheDocument();
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(log).toEqual([]);
  });

  it('turns the camera on once ILIAS signed the student out, after Rust is ready', async () => {
    rust({
      face_unlock_start: () => Promise.resolve({ state: 'looking' }),
      face_unlock_frame: () => Promise.resolve({ state: 'looking' }),
    });
    renderBar();

    expect(bar()).toBeInTheDocument();
    expect(await screen.findByText('Camera on')).toBeInTheDocument();
    expect(
      screen.getByText(/Look at the camera, and Uni Pilot signs you in again/),
    ).toBeInTheDocument();
    expect(log.slice(0, 2)).toEqual(['face_unlock_start', 'camera on']);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('goes at once when the face passes, signs in in the background and reads the courses again', async () => {
    let finish: (signedIn: boolean) => void = () => undefined;
    let frames = 0;
    rust({
      face_unlock_start: () => Promise.resolve({ state: 'looking' }),
      face_unlock_frame: () =>
        Promise.resolve(++frames < 2 ? { state: 'looking' } : { state: 'passed' }),
      face_unlock_finish: () => new Promise((resolve) => (finish = resolve)),
      ilias_sync_courses: () => Promise.resolve([]),
    });
    renderBar();

    await waitFor(() => expect(log).toContain('face_unlock_finish'));
    // Rust is still signing in, and the bar is gone already.
    expect(bar()).not.toBeInTheDocument();
    expect(log.indexOf('camera off')).toBeLessThan(log.indexOf('face_unlock_finish'));

    act(() => finish(true));
    await waitFor(() => expect(useCourseStore.getState().failure).toBeNull());
    expect(log.at(-1)).toBe('ilias_sync_courses');
    expect(useAutoSignInStore.getState().faceBar).toBeNull();
  });

  it('closes on Cancel, turns the camera off and stays closed for this sign-out', async () => {
    rust({
      face_unlock_start: () => Promise.resolve({ state: 'looking' }),
      face_unlock_frame: () => Promise.resolve({ state: 'looking' }),
    });
    const user = renderBar();
    await screen.findByText('Camera on');

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(bar()).not.toBeInTheDocument();
    expect(camera.stop).toHaveBeenCalled();
    await waitFor(() => expect(log).toContain('face_unlock_cancel'));

    // A new sign-out brings it back.
    act(() => {
      useCourseStore.setState({ failure: { ...SIGNED_OUT } });
    });
    expect(bar()).toBeInTheDocument();
  });

  it('lets the student sign in with the password instead', async () => {
    rust({ face_unlock_start: () => new Promise(() => undefined) });
    const user = renderBar();
    await user.click(screen.getByRole('button', { name: 'Sign in with password instead' }));
    expect(screen.getByText('ILIAS mode')).toBeInTheDocument();
    expect(bar()).not.toBeInTheDocument();
  });

  it('says why it stopped, and offers another look when that could help', async () => {
    rust({
      face_unlock_start: () => Promise.resolve({ state: 'looking' }),
      face_unlock_frame: refuse({ kind: 'notRecognised' }),
    });
    const user = renderBar();

    expect(await screen.findByText(/^Not recognised/)).toBeInTheDocument();
    expect(screen.queryByText('Camera on')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(log.filter((entry) => entry === 'camera on')).toHaveLength(2));
  });

  /** On a Mac with a notch the island shows it; the camera keeps going here. */
  it('steps out of sight when the notch shows it, and tells the notch where the camera is', async () => {
    useNotchStore.setState({ available: true });
    rust({
      face_unlock_start: () => Promise.resolve({ state: 'looking' }),
      face_unlock_frame: () => Promise.resolve({ state: 'looking' }),
    });
    renderBar();

    expect(bar()).toHaveClass('sr-only');
    expect(await screen.findByText('Camera on')).toBeInTheDocument();
    expect(useNotchStore.getState().camera).toBe('looking');
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('leaves the camera off when Rust cannot start', async () => {
    rust({ face_unlock_start: refuse({ kind: 'locked' }) });
    renderBar();
    expect(await screen.findByText(/paused after three tries/)).toBeInTheDocument();
    expect(log).not.toContain('camera on');
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });
});
