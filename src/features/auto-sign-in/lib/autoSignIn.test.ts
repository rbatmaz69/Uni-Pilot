import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IliasConnection } from '@/features/integrations/lib/ilias/connection';
import {
  authenticatorCode,
  forgetAutoSignIn,
  installationHost,
  readAutoSignIn,
  saveAutoSignIn,
  signInFailureKind,
  signInFailureText,
  signInToIlias,
  vaultFailureText,
} from './autoSignIn';

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
  invoke.mockReset().mockResolvedValue(undefined);
});

describe('what the page asks Rust for', () => {
  /** The sign-on and the secrets are Rust's: the page names the ILIAS and nothing else. */
  it('names the installation, nothing more', async () => {
    const values = { username: 'student', password: 'pw', authenticator: 'SECRET' };
    await readAutoSignIn(HHN);
    await saveAutoSignIn(HHN, { ...values, device: ' Laptop ' });
    await saveAutoSignIn(HHN, { ...values, device: '  ' });
    await forgetAutoSignIn(HHN);
    await signInToIlias(HHN);
    await authenticatorCode('SECRET');
    expect(invoke.mock.calls).toEqual([
      ['auto_sign_in_status', { baseUrl: HHN.baseUrl }],
      ['auto_sign_in_save', { baseUrl: HHN.baseUrl, ...values, device: 'Laptop' }],
      ['auto_sign_in_save', { baseUrl: HHN.baseUrl, ...values, device: null }],
      ['auto_sign_in_forget', { baseUrl: HHN.baseUrl }],
      ['sign_in_to_ilias', { baseUrl: HHN.baseUrl, clientId: 'iliashhn' }],
      ['auto_sign_in_code', { authenticator: 'SECRET' }],
    ]);
  });

  it('keys the sign-in by host, as Rust does', () => {
    expect(installationHost({ ...HHN, baseUrl: 'https://ILIAS.hs-heilbronn.de/' })).toBe(
      'ilias.hs-heilbronn.de',
    );
  });
});

describe('when it does not work', () => {
  it('says why signing in did not work', () => {
    expect(signInFailureText({ kind: 'notSetUp' })).toMatch(/set it up in Settings/);
    expect(signInFailureText({ kind: 'wrongPassword' })).toMatch(/password was not accepted/);
    expect(signInFailureText({ kind: 'wrongCode' })).toMatch(/code .* was not accepted/);
    expect(signInFailureText({ kind: 'unreachable', message: 'The sign-on is busy (503).' })).toBe(
      'The sign-on is busy (503).',
    );
    expect(signInFailureText('command not found')).toBe('Signing in did not work.');
    expect(signInFailureKind({ kind: 'wrongPassword' })).toBe('wrongPassword');
    expect(signInFailureKind({ kind: 'signedOut' })).toBeNull();
  });

  it('says why storing did not work, in Rust’s words', () => {
    expect(vaultFailureText({ kind: 'invalid', message: 'Your HHN password is missing.' })).toBe(
      'Your HHN password is missing.',
    );
    expect(vaultFailureText({ kind: 'refused' })).toMatch(/declined/);
    expect(vaultFailureText(undefined)).toBe('The sign-in could not be stored.');
  });
});
