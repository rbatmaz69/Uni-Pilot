import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IliasConnection } from '@/features/integrations/lib/ilias/connection';
import { useAutoSignInStore } from '@/features/auto-sign-in/store/autoSignInStore';
import { FaceEnrollDialog } from './FaceEnrollDialog';

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

const HHN: IliasConnection = {
  name: 'Hochschule Heilbronn',
  baseUrl: 'https://ilias.hs-heilbronn.de',
  clientId: 'iliashhn',
  version: '9.23',
  signIn: 'both',
  soap: 'blocked',
  checkedAt: '2026-09-25T10:00:00.000Z',
};
const HOST = 'ilias.hs-heilbronn.de';
const SET_UP = {
  credentials: true,
  username: 'student',
  device: 'Uni Pilot',
  stale: false,
  face: false,
};

/** Rust's refusal, a plain object as Tauri hands it over. */
const refuse = (failure: unknown) => vi.fn<() => Promise<unknown>>().mockRejectedValue(failure);

const progress = (prompt: string, taken: number, done = false) => ({
  prompt,
  taken,
  needed: 8,
  done,
});

beforeEach(() => {
  log.length = 0;
  invoke.mockReset();
  camera.stop.mockClear();
  useAutoSignInStore.setState({ byHost: { [HOST]: SET_UP }, signingIn: false });
});

describe('setting up face unlock', () => {
  it('says what it keeps first, and turns the camera on only after the click', async () => {
    let release: (value: unknown) => void = () => undefined;
    let frame = 0;
    invoke.mockImplementation((command) => {
      if (command === 'face_enroll_start') return Promise.resolve(progress('lookAtCamera', 0));
      if (command === 'face_enroll_frame') {
        frame += 1;
        return frame === 1
          ? Promise.resolve(progress('turnSlightlyLeft', 4))
          : new Promise((resolve) => (release = resolve));
      }
      return Promise.resolve(undefined);
    });
    const user = userEvent.setup();
    render(<FaceEnrollDialog connection={HHN} onClose={vi.fn()} />);

    expect(screen.getByRole('dialog')).toHaveTextContent('No picture is kept');
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(log).toEqual([]);

    await user.click(screen.getByRole('button', { name: 'Start camera' }));
    expect(await screen.findByText('Turn your head slightly to the left')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Face set-up' })).toHaveAttribute(
      'aria-valuenow',
      '50',
    );
    await waitFor(() =>
      expect(log.filter((entry) => entry === 'face_enroll_frame')).toHaveLength(2),
    );
    act(() => release(progress('lookAtCamera', 8, true)));

    expect(await screen.findByText('Face unlock is set up.')).toBeInTheDocument();
    expect(log.slice(0, 2)).toEqual(['face_enroll_start', 'camera on']);
    expect(log.at(-1)).toBe('camera off');
    expect(log).not.toContain('face_enroll_cancel');
    expect(useAutoSignInStore.getState().byHost[HOST]?.face).toBe(true);
  });

  it('leaves the camera off when nothing is stored to unlock with', async () => {
    invoke.mockImplementation((command) =>
      command === 'face_enroll_start' ? refuse({ kind: 'notSetUp' })() : Promise.resolve(undefined),
    );
    const user = userEvent.setup();
    render(<FaceEnrollDialog connection={HHN} onClose={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Start camera' }));
    expect(await screen.findByText(/Set up signing in automatically/)).toBeInTheDocument();
    expect(log).not.toContain('camera on');
    expect(useAutoSignInStore.getState().byHost[HOST]?.credentials).toBe(false);
  });
});
