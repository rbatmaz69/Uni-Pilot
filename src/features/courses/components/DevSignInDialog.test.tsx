import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IliasConnection } from '@/features/integrations/lib/ilias/connection';
import { DevSignInDialog } from './DevSignInDialog';

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
const LINK = 'otpauth://totp/HHN:student?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

beforeEach(() => {
  invoke.mockReset();
});

function renderDialog() {
  const onClose = vi.fn();
  const onSaved = vi.fn();
  render(<DevSignInDialog connection={HHN} onClose={onClose} onSaved={onSaved} />);
  return { user: userEvent.setup(), onClose, onSaved };
}

describe('storing a sign-in for the test sign-in', () => {
  it('stores user name, password, authenticator and its name for the connected ILIAS', async () => {
    const status = {
      credentials: true,
      username: 'student@stud.hs-heilbronn.de',
      device: 'Uni Pilot',
      stale: false,
      face: false,
    };
    invoke.mockResolvedValue(status);
    const { user, onSaved } = renderDialog();

    expect(screen.getByRole('dialog', { name: 'Store sign-in' })).toHaveAccessibleDescription(
      /ilias\.hs-heilbronn\.de/,
    );
    const store = screen.getByRole('button', { name: 'Store' });
    expect(store).toBeDisabled();
    expect(screen.getByLabelText('Authenticator name')).toHaveValue('Uni Pilot');

    await user.type(screen.getByLabelText('User name'), 'student@stud.hs-heilbronn.de');
    await user.type(screen.getByLabelText('Password'), 'correct horse');
    await user.type(screen.getByLabelText('Authenticator'), LINK);
    await user.click(store);

    expect(invoke).toHaveBeenCalledExactlyOnceWith('auto_sign_in_save', {
      baseUrl: 'https://ilias.hs-heilbronn.de',
      username: 'student@stud.hs-heilbronn.de',
      password: 'correct horse',
      authenticator: LINK,
      device: 'Uni Pilot',
    });
    expect(onSaved).toHaveBeenCalledExactlyOnceWith(status);
  });

  it('hides the password and the authenticator while they are typed', () => {
    renderDialog();
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
    expect(screen.getByLabelText('Authenticator')).toHaveAttribute('type', 'password');
  });

  it('stays open with Rust’s reason when the values cannot be stored', async () => {
    invoke.mockRejectedValue({
      kind: 'invalid',
      message: 'That is neither an authenticator link nor a secret from HHN.',
    });
    const { user, onSaved } = renderDialog();

    await user.type(screen.getByLabelText('User name'), 'student');
    await user.type(screen.getByLabelText('Password'), 'correct horse');
    await user.type(screen.getByLabelText('Authenticator'), 'not a secret');
    await user.click(screen.getByRole('button', { name: 'Store' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That is neither an authenticator link nor a secret from HHN.',
    );
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Store' })).toBeEnabled();
  });

  it('closes without storing', async () => {
    const { user, onClose } = renderDialog();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(invoke).not.toHaveBeenCalled();
  });
});
