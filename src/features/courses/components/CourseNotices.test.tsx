import { render, screen, within } from '@testing-library/react';
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

  /** What "Store sign-in…" keeps is what "Test sign-in" reads: the same ILIAS. */
  it('stores a sign-in, never shows the password again, and tests with it', async () => {
    invoke.mockImplementation((command) =>
      Promise.resolve(
        command === 'auto_sign_in_save'
          ? {
              credentials: true,
              username: 'student@stud.hs-heilbronn.de',
              device: 'Uni Pilot',
              stale: false,
              face: false,
            }
          : true,
      ),
    );
    const { user } = renderNotice();

    await user.click(screen.getByRole('button', { name: 'Store sign-in…' }));
    const dialog = screen.getByRole('dialog', { name: 'Store sign-in' });
    await user.type(within(dialog).getByLabelText('User name'), 'student@stud.hs-heilbronn.de');
    await user.type(within(dialog).getByLabelText('Password'), 'correct horse');
    await user.type(within(dialog).getByLabelText('Authenticator'), 'GEZDGNBVGY3TQOJQ');
    await user.click(within(dialog).getByRole('button', { name: 'Store' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Stored for student@stud.hs-heilbronn.de, authenticator “Uni Pilot”.',
    );
    expect(document.body.innerHTML).not.toContain('correct horse');

    // Opened again, the dialog starts empty.
    await user.click(screen.getByRole('button', { name: 'Store sign-in…' }));
    expect(screen.getByLabelText('Password')).toHaveValue('');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    await user.click(screen.getByRole('button', { name: 'Test sign-in' }));
    expect(await screen.findByText('Signed in.')).toBeInTheDocument();
    const [[, stored], [command, tested]] = invoke.mock.calls as [
      [string, Record<string, unknown>],
      [string, Record<string, unknown>],
    ];
    expect(command).toBe('sign_in_to_ilias');
    expect(tested.baseUrl).toBe(stored.baseUrl);
  });

  it('has no test sign-in outside development', () => {
    vi.stubEnv('DEV', false);
    renderNotice();
    expect(screen.queryByRole('button', { name: 'Test sign-in' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Store sign-in…' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in to ILIAS' })).toBeInTheDocument();
  });
});
