import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IliasConnection } from '@/features/integrations/lib/ilias/connection';
import { useAutoSignInStore } from '@/features/auto-sign-in/store/autoSignInStore';
import { FaceUnlockDialog } from './FaceUnlockDialog';

/** Everything that happened, in order: Rust's commands, the camera on and off. */
const log: string[] = [];
const JPEG = new Uint8Array([0xff, 0xd8]);

const invoke = vi.fn<(command: string, args?: unknown) => Promise<unknown>>();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (command: string, args?: unknown) => {
    log.push(command);
    return invoke(command, args);
  },
}));

const camera = {
  grab: vi.fn(() => Promise.resolve(JPEG)),
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

const HHN: IliasConnection = {
  name: 'Hochschule Heilbronn',
  baseUrl: 'https://ilias.hs-heilbronn.de',
  clientId: 'iliashhn',
  version: '9.23',
  signIn: 'both',
  soap: 'blocked',
  checkedAt: '2026-09-25T10:00:00.000Z',
};

/** Rust's refusal, a plain object as Tauri hands it over. */
const refuse = (failure: unknown) => vi.fn<() => Promise<unknown>>().mockRejectedValue(failure);

const looking = (prompt: string, done = 0) => ({ state: 'looking', prompt, done, of: 2 });

/** Rust's answers to frames, one after another; the last one repeats. */
function frames(...answers: (() => Promise<unknown>)[]) {
  let next = 0;
  return () => answers[Math.min(next++, answers.length - 1)]!();
}

function rust(answers: Partial<Record<string, () => Promise<unknown>>>) {
  invoke.mockImplementation((command) =>
    (answers[command] ?? (() => Promise.resolve(undefined)))(),
  );
}

beforeEach(() => {
  log.length = 0;
  invoke.mockReset();
  camera.grab.mockClear();
  camera.stop.mockClear();
  useAutoSignInStore.setState({ byHost: {}, signingIn: false });
});

function renderDialog() {
  const props = {
    onClose: vi.fn(),
    onSignedIn: vi.fn(),
    onPasswordInstead: vi.fn(),
  };
  const view = render(<FaceUnlockDialog connection={HHN} {...props} />);
  return { ...props, ...view, user: userEvent.setup() };
}

describe('unlocking with the face', () => {
  it('reads the store before the camera, turns it off before signing in, and signs in once', async () => {
    let release: (value: unknown) => void = () => undefined;
    rust({
      face_unlock_start: () => Promise.resolve(looking('lookAtCamera')),
      face_unlock_frame: frames(
        () => Promise.resolve(looking('turnLeft')),
        () => new Promise((resolve) => (release = resolve)),
      ),
      face_unlock_finish: () => Promise.resolve(true),
    });
    const { onSignedIn } = renderDialog();

    expect(await screen.findByText('Turn your head to the left')).toBeInTheDocument();
    expect(screen.getByText('Camera on')).toBeInTheDocument();
    await waitFor(() =>
      expect(log.filter((entry) => entry === 'face_unlock_frame')).toHaveLength(2),
    );
    act(() => release({ state: 'passed' }));

    await waitFor(() => expect(onSignedIn).toHaveBeenCalledOnce());
    expect(log).toEqual([
      'face_unlock_start',
      'camera on',
      'face_unlock_frame',
      'face_unlock_frame',
      'camera off',
      'face_unlock_finish',
    ]);
    expect(invoke).toHaveBeenCalledWith('face_unlock_frame', JPEG);
  });

  /** A refused Keychain, a lockout: the camera never turns on. */
  it('leaves the camera off when Rust cannot start', async () => {
    rust({ face_unlock_start: refuse({ kind: 'locked' }) });
    renderDialog();

    expect(await screen.findByText(/paused after three tries/)).toBeInTheDocument();
    expect(log).toEqual(['face_unlock_start', 'face_unlock_cancel']);
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Sign in with password instead' }),
    ).toBeInTheDocument();
  });

  it('offers another try when the face was not recognised in time', async () => {
    rust({
      face_unlock_start: () => Promise.resolve(looking('lookAtCamera')),
      face_unlock_frame: refuse({ kind: 'notRecognised' }),
    });
    const { user } = renderDialog();

    expect(await screen.findByText(/^Not recognised/)).toBeInTheDocument();
    expect(camera.stop).toHaveBeenCalled();
    expect(screen.queryByText('Camera on')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(log.filter((entry) => entry === 'camera on')).toHaveLength(2));
  });

  it('turns the camera off and tells Rust when the dialog closes', async () => {
    rust({
      face_unlock_start: () => Promise.resolve(looking('lookAtCamera')),
      face_unlock_frame: () => Promise.resolve(looking('turnRight')),
    });
    const { unmount } = renderDialog();
    await screen.findByText('Turn your head to the right');

    unmount();
    expect(camera.stop).toHaveBeenCalled();
    await waitFor(() => expect(log).toContain('face_unlock_cancel'));
  });

  it('turns the camera off when Uni Pilot goes to the background', async () => {
    rust({
      face_unlock_start: () => Promise.resolve(looking('lookAtCamera')),
      face_unlock_frame: () => Promise.resolve(looking('turnRight')),
    });
    renderDialog();
    await screen.findByText('Turn your head to the right');

    act(() => {
      window.dispatchEvent(new Event('blur'));
    });
    expect(await screen.findByText(/went to the background/)).toBeInTheDocument();
    expect(camera.stop).toHaveBeenCalled();
    await waitFor(() => expect(log).toContain('face_unlock_cancel'));
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('always lets the student sign in with the password instead', async () => {
    rust({ face_unlock_start: () => new Promise(() => undefined) });
    const { user, onPasswordInstead } = renderDialog();
    await user.click(screen.getByRole('button', { name: 'Sign in with password instead' }));
    expect(onPasswordInstead).toHaveBeenCalledOnce();
  });
});
