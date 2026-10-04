/**
 * Signing in automatically, set up in Settings across the whole shell: set
 * up, test, forget — and the password, once saved, nowhere on the page. Rust
 * is a stand-in answering like `vault.rs` and `ilias_sync/sign_in/` do.
 */

import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAutoSignInStore } from '@/features/auto-sign-in/store/autoSignInStore';
import { useIliasStore } from '@/features/integrations/store/iliasStore';
import { renderApp } from '@/test/render';

const invoke = vi.fn<(command: string, args: Record<string, unknown>) => Promise<unknown>>();

vi.mock('@tauri-apps/api/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tauri-apps/api/core')>()),
  invoke: (command: string, args: Record<string, unknown>) => invoke(command, args),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: () => Promise.resolve(() => undefined),
}));

const PASSWORD = 'correct horse battery staple';
const SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
const HHN = { baseUrl: 'https://ilias.hs-heilbronn.de', clientId: 'iliashhn' };
const NOT_SET_UP = { credentials: false, username: null, device: null, stale: false, face: false };
const SET_UP = {
  credentials: true,
  username: 'student@stud.hs-heilbronn.de',
  device: 'Uni Pilot',
  stale: false,
  face: false,
};

type Answer = (args: Record<string, unknown>) => Promise<unknown>;

/** Rust, as far as these tests need it; a test may change an answer. */
let answers: Record<string, Answer>;

const called = (command: string) => invoke.mock.calls.filter(([name]) => name === command);

beforeEach(() => {
  answers = {
    auto_sign_in_status: () => Promise.resolve(NOT_SET_UP),
    auto_sign_in_code: () => Promise.resolve({ code: '755224', validFor: 20 }),
    auto_sign_in_save: () => Promise.resolve(SET_UP),
    auto_sign_in_forget: () => Promise.resolve(undefined),
    sign_in_to_ilias: () => Promise.resolve(true),
  };
  Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {}, configurable: true });
  invoke
    .mockReset()
    .mockImplementation((command, args) =>
      (answers[command] ?? (() => Promise.resolve(undefined)))(args),
    );
  useIliasStore.setState({
    connection: {
      name: 'Hochschule Heilbronn',
      ...HHN,
      version: '9.23',
      signIn: 'both',
      soap: 'blocked',
      checkedAt: '2026-09-25T10:00:00.000Z',
    },
  });
  useAutoSignInStore.setState({ byHost: {}, signingIn: false, autoUnlock: false, faceBar: null });
});

afterEach(() => {
  Reflect.deleteProperty(window, '__TAURI_INTERNALS__');
});

function section() {
  return screen.getByRole('region', { name: 'Sign in to ILIAS automatically' });
}

describe('signing in automatically, in Settings', () => {
  it('sets it up, shows the code HHN asks for, and never shows the password again', async () => {
    const user = userEvent.setup();
    renderApp('/settings');

    expect(await within(section()).findByText('Not set up.')).toBeInTheDocument();
    expect(called('auto_sign_in_status')).toEqual([
      ['auto_sign_in_status', { baseUrl: HHN.baseUrl }],
    ]);
    expect(within(section()).getByText(/What is kept, and where/)).toBeInTheDocument();

    await user.click(within(section()).getByRole('button', { name: 'Set up' }));
    const dialog = screen.getByRole('dialog', { name: 'Set up automatic sign-in' });
    expect(dialog).toHaveTextContent('add a second authenticator app');
    await user.type(within(dialog).getByLabelText('HHN user name'), 'student@stud.hs-heilbronn.de');
    await user.type(within(dialog).getByLabelText('Password'), PASSWORD);
    await user.type(within(dialog).getByLabelText('Authenticator'), SECRET);
    expect(await within(dialog).findByText('755 224')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Authenticator name')).toHaveValue('Uni Pilot');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(called('auto_sign_in_save')).toEqual([
      [
        'auto_sign_in_save',
        {
          baseUrl: HHN.baseUrl,
          username: 'student@stud.hs-heilbronn.de',
          password: PASSWORD,
          authenticator: SECRET,
          device: 'Uni Pilot',
        },
      ],
    ]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(
      within(section()).getByText(
        'Set up for student@stud.hs-heilbronn.de, with the authenticator “Uni Pilot”.',
      ),
    ).toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain(PASSWORD);
    expect(document.body.innerHTML).not.toContain(SECRET);
    expect(JSON.stringify(useAutoSignInStore.getState())).not.toContain(PASSWORD);

    // Opened again, it starts empty.
    await user.click(within(section()).getByRole('button', { name: 'Set up' }));
    expect(screen.getByLabelText('Password')).toHaveValue('');
    expect(screen.getByLabelText('Authenticator')).toHaveValue('');
  });

  /** Known from before: the credential store is not asked just for showing Settings. */
  it('tests the sign-in, and stops offering it once HHN refuses the password', async () => {
    useAutoSignInStore.setState({ byHost: { 'ilias.hs-heilbronn.de': { ...SET_UP } } });
    const user = userEvent.setup();
    renderApp('/settings');

    await user.click(within(section()).getByRole('button', { name: 'Test sign-in' }));
    expect(await within(section()).findByRole('status')).toHaveTextContent('Signed in to ILIAS.');
    expect(called('sign_in_to_ilias')).toEqual([['sign_in_to_ilias', HHN]]);

    answers['sign_in_to_ilias'] = vi.fn<Answer>().mockRejectedValue({ kind: 'wrongPassword' });
    await user.click(within(section()).getByRole('button', { name: 'Test sign-in' }));
    expect(
      await within(section()).findByText(/The stored password was not accepted/),
    ).toBeInTheDocument();
    expect(
      within(section()).getByText(/HHN did not accept the stored password/),
    ).toBeInTheDocument();
    expect(within(section()).getByRole('button', { name: 'Test sign-in' })).toBeDisabled();
    expect(called('auto_sign_in_status')).toHaveLength(0);
  });

  it('offers face unlock once a sign-in is stored, and says when it is set up', () => {
    useAutoSignInStore.setState({ byHost: { 'ilias.hs-heilbronn.de': { ...SET_UP } } });
    const { unmount } = renderApp('/settings');
    expect(
      within(section()).getByRole('button', { name: 'Set up face unlock' }),
    ).toBeInTheDocument();
    unmount();

    useAutoSignInStore.setState({
      byHost: { 'ilias.hs-heilbronn.de': { ...SET_UP, face: true } },
    });
    renderApp('/settings');
    expect(within(section()).getByText(/a look into the camera will do/)).toBeInTheDocument();
    expect(
      within(section()).getByRole('button', { name: 'Set up face unlock again' }),
    ).toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalledWith('face_enroll_start', expect.anything());
  });

  it('lets the camera turn on by itself only once allowed, and only with a face', async () => {
    useAutoSignInStore.setState({ byHost: { 'ilias.hs-heilbronn.de': { ...SET_UP } } });
    const user = userEvent.setup();
    const { unmount } = renderApp('/settings');
    const off = within(section()).getByRole('switch', {
      name: 'Unlock as soon as ILIAS signs you out',
    });
    expect(off).toBeDisabled();
    expect(off).toHaveAttribute('aria-checked', 'false');
    unmount();

    useAutoSignInStore.setState({
      byHost: { 'ilias.hs-heilbronn.de': { ...SET_UP, face: true } },
    });
    renderApp('/settings');
    const toggle = within(section()).getByRole('switch', {
      name: 'Unlock as soon as ILIAS signs you out',
    });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(useAutoSignInStore.getState().autoUnlock).toBe(true);
  });

  it('forgets the sign-in', async () => {
    useAutoSignInStore.setState({ byHost: { 'ilias.hs-heilbronn.de': { ...SET_UP } } });
    const user = userEvent.setup();
    renderApp('/settings');

    await user.click(within(section()).getByRole('button', { name: 'Forget' }));
    expect(called('auto_sign_in_forget')).toEqual([
      ['auto_sign_in_forget', { baseUrl: HHN.baseUrl }],
    ]);
    expect(await within(section()).findByText('Not set up.')).toBeInTheDocument();
    expect(within(section()).getByRole('button', { name: 'Forget' })).toBeDisabled();
    expect(within(section()).getByRole('button', { name: 'Test sign-in' })).toBeDisabled();
  });

  it('asks to connect ILIAS first', () => {
    useIliasStore.setState({ connection: null });
    renderApp('/settings');
    expect(within(section()).getByRole('link', { name: 'Connect ILIAS' })).toBeInTheDocument();
    expect(within(section()).queryByRole('button', { name: 'Set up' })).not.toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalledWith('auto_sign_in_status', expect.anything());
  });
});
