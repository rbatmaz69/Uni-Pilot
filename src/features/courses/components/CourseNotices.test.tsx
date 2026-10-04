import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAutoSignInStore } from '@/features/auto-sign-in';
import { useCourseStore } from '@/features/courses/store/courseStore';
import { useIliasStore } from '@/features/integrations/store/iliasStore';
import { FailureNotice } from './CourseNotices';

const invoke = vi.fn<(command: string, args: Record<string, unknown>) => Promise<unknown>>();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (command: string, args: Record<string, unknown>) => invoke(command, args),
}));

vi.mock('@/features/auto-sign-in/lib/camera', () => ({
  openCamera: () => Promise.reject(new Error('No camera in tests.')),
}));

const HOST = 'ilias.hs-heilbronn.de';
const SET_UP = {
  credentials: true,
  username: 'student',
  device: 'Uni Pilot',
  stale: false,
  face: false,
};

beforeEach(() => {
  invoke.mockReset();
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
  useCourseStore.setState({
    failure: {
      kind: 'session-expired',
      message: 'The ILIAS sign-in has ended. Sign in to ILIAS again.',
    },
  });
  useAutoSignInStore.setState({ byHost: {}, signingIn: false });
});

function renderNotice() {
  const onRetry = vi.fn();
  render(
    <MemoryRouter>
      <FailureNotice onRetry={onRetry} />
    </MemoryRouter>,
  );
  return { user: userEvent.setup(), onRetry };
}

describe('the notice that ILIAS wants a sign-in', () => {
  it('offers to sign in automatically when that is set up, and reads again once it worked', async () => {
    useAutoSignInStore.setState({ byHost: { [HOST]: SET_UP } });
    invoke.mockResolvedValue(true);
    const { user, onRetry } = renderNotice();

    expect(screen.getByRole('button', { name: 'Sign in yourself' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign in to ILIAS' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Sign in automatically' }));

    expect(invoke).toHaveBeenCalledExactlyOnceWith('sign_in_to_ilias', {
      baseUrl: 'https://ilias.hs-heilbronn.de',
      clientId: 'iliashhn',
    });
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('says why signing in automatically did not work, and does not read again', async () => {
    useAutoSignInStore.setState({ byHost: { [HOST]: SET_UP } });
    invoke.mockRejectedValue({ kind: 'wrongCode' });
    const { user, onRetry } = renderNotice();

    await user.click(screen.getByRole('button', { name: 'Sign in automatically' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'The code from Uni Pilot’s authenticator was not accepted.',
    );
    expect(onRetry).not.toHaveBeenCalled();
  });

  /** Nothing remembered is nothing offered — and the credential store is not asked. */
  it('sends the student to sign in themselves when nothing is set up', () => {
    renderNotice();
    expect(screen.getByRole('button', { name: 'Sign in to ILIAS' })).toBeInTheDocument();
    for (const gone of ['Sign in automatically', 'Store sign-in…', 'Test sign-in']) {
      expect(screen.queryByRole('button', { name: gone })).not.toBeInTheDocument();
    }
    expect(invoke).not.toHaveBeenCalled();
  });

  it('offers to unlock with the face when one is set up, with the password always beside it', async () => {
    useAutoSignInStore.setState({ byHost: { [HOST]: { ...SET_UP, face: true } } });
    invoke.mockRejectedValue({ kind: 'locked' });
    const { user } = renderNotice();

    expect(screen.queryByRole('button', { name: 'Sign in automatically' })).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Sign in with password instead' }),
    ).toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Unlock with your face' }));
    const dialog = await screen.findByRole('dialog', { name: 'Unlock with your face' });
    expect(await within(dialog).findByText(/paused after three tries/)).toBeInTheDocument();
    expect(invoke).toHaveBeenCalledWith('face_unlock_start', {
      baseUrl: 'https://ilias.hs-heilbronn.de',
      clientId: 'iliashhn',
    });
  });

  it('stops offering the stored password once HHN refused it, and says where to fix that', () => {
    useAutoSignInStore.setState({ byHost: { [HOST]: { ...SET_UP, stale: true } } });
    renderNotice();
    expect(screen.queryByRole('button', { name: 'Sign in automatically' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in to ILIAS' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Set it up again in Settings' })).toHaveAttribute(
      'href',
      '/settings',
    );
  });
});
