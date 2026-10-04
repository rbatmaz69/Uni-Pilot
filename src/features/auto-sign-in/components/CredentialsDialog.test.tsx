import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IliasConnection } from '@/features/integrations/lib/ilias/connection';
import { useAutoSignInStore } from '@/features/auto-sign-in/store/autoSignInStore';
import { CredentialsDialog } from './CredentialsDialog';

const invoke = vi.fn<(command: string, args: Record<string, unknown>) => Promise<unknown>>();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (command: string, args: Record<string, unknown>) => invoke(command, args),
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

beforeEach(() => {
  invoke.mockReset();
  useAutoSignInStore.setState({ byHost: {}, signingIn: false });
});

afterEach(() => {
  vi.useRealTimers();
});

function renderDialog() {
  const onClose = vi.fn();
  const onSaved = vi.fn();
  render(<CredentialsDialog connection={HHN} onClose={onClose} onSaved={onSaved} />);
  return { onClose, onSaved };
}

describe('setting up the automatic sign-in', () => {
  it('asks for four things, keeps the secret ones hidden, and never for recovery codes', () => {
    renderDialog();
    expect(screen.getByRole('dialog').querySelectorAll('input')).toHaveLength(4);
    for (const label of ['HHN user name', 'Password', 'Authenticator', 'Authenticator name']) {
      expect(screen.getByLabelText(label)).toHaveAttribute('autocomplete', 'off');
    }
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
    expect(screen.getByLabelText('Authenticator')).toHaveAttribute('type', 'password');
    expect(screen.getByLabelText('Authenticator name')).toHaveValue('Uni Pilot');
    expect(screen.getByRole('dialog')).not.toHaveTextContent(/recovery/i);
    expect(screen.getByRole('dialog')).toHaveTextContent('Your phone keeps its authenticator');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  /** HHN asks for a code before it accepts the authenticator; it changes every half minute. */
  it('shows the code to confirm at HHN, and the next one when it changes', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    invoke
      .mockResolvedValueOnce({ code: '755224', validFor: 5 })
      .mockResolvedValueOnce({ code: '287082', validFor: 30 });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderDialog();

    await user.type(screen.getByLabelText('Authenticator'), 'GEZDGNBVGY3TQOJQ');
    expect(await screen.findByText('755 224')).toBeInTheDocument();
    expect(invoke).toHaveBeenCalledExactlyOnceWith('auto_sign_in_code', {
      authenticator: 'GEZDGNBVGY3TQOJQ',
    });

    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(await screen.findByText('287 082')).toBeInTheDocument();
  });

  it('shows no code for something that is not a secret', async () => {
    invoke.mockRejectedValue({ kind: 'invalid', message: 'That is neither…' });
    const user = userEvent.setup();
    renderDialog();
    await user.type(screen.getByLabelText('Authenticator'), 'nope');
    await act(() => new Promise((resolve) => setTimeout(resolve, 300)));
    expect(screen.queryByText(/Code to confirm/)).not.toBeInTheDocument();
  });

  it('stays open with Rust’s reason when the values cannot be saved', async () => {
    const refuse = vi.fn<() => Promise<unknown>>().mockRejectedValue({
      kind: 'invalid',
      message: 'That secret is too short to be one from HHN.',
    });
    invoke.mockImplementation((command) =>
      command === 'auto_sign_in_save'
        ? refuse()
        : Promise.resolve({ code: '755224', validFor: 30 }),
    );
    const user = userEvent.setup();
    const { onSaved } = renderDialog();

    await user.type(screen.getByLabelText('HHN user name'), 'student');
    await user.type(screen.getByLabelText('Password'), 'pw');
    await user.type(screen.getByLabelText('Authenticator'), 'JBSWY3DP');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That secret is too short to be one from HHN.',
    );
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });
});
