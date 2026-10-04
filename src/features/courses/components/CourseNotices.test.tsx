import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCourseStore } from '@/features/courses/store/courseStore';
import { useIliasStore } from '@/features/integrations/store/iliasStore';
import { FailureNotice } from './CourseNotices';

const invoke = vi.fn<(command: string, args: Record<string, unknown>) => Promise<unknown>>();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (command: string, args: Record<string, unknown>) => invoke(command, args),
}));

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
});

afterEach(() => {
  vi.unstubAllEnvs();
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
  it('offers a test sign-in in development, and reads again once it worked', async () => {
    invoke.mockResolvedValue(true);
    const { user, onRetry } = renderNotice();

    await user.click(screen.getByRole('button', { name: 'Test sign-in' }));

    expect(invoke).toHaveBeenCalledExactlyOnceWith('sign_in_to_ilias', {
      baseUrl: 'https://ilias.hs-heilbronn.de',
      clientId: 'iliashhn',
    });
    expect(await screen.findByRole('status')).toHaveTextContent('Signed in.');
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('says why the sign-in did not work, and does not read again', async () => {
    invoke.mockRejectedValue({ kind: 'wrongPassword' });
    const { user, onRetry } = renderNotice();

    await user.click(screen.getByRole('button', { name: 'Test sign-in' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'The stored password was refused. Save it again before the next try.',
    );
    expect(invoke).toHaveBeenCalledOnce();
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('has no test sign-in outside development', () => {
    vi.stubEnv('DEV', false);
    renderNotice();
    expect(screen.queryByRole('button', { name: 'Test sign-in' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in to ILIAS' })).toBeInTheDocument();
  });
});
