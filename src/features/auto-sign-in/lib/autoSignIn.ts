/**
 * Signing in to ILIAS automatically — the TypeScript side of
 * `src-tauri/src/vault.rs` and `src-tauri/src/ilias_sync/sign_in/`.
 *
 * Rust keeps the student's HHN password and Uni Pilot's own authenticator in
 * this computer's credential store and signs in with them. The page may store
 * them, forget them and ask Rust to sign in. It never gets the password or the
 * authenticator back, and it names only the ILIAS: Rust knows where its
 * sign-on is. Plan and reasons: `docs/face-unlock-plan.md`, Phases 1–3.
 *
 * Desktop only.
 */

import type { IliasConnection } from '@/features/integrations/lib/ilias/connection';

/** What the page may know: `Status` in `src-tauri/src/vault.rs`. Never a secret. */
export interface AutoSignInStatus {
  credentials: boolean;
  username: string | null;
  /** The name of Uni Pilot's authenticator at the university. */
  device: string | null;
  /** The university did not accept the stored password; saving again clears it. */
  stale: boolean;
  face: boolean;
}

export interface AutoSignInValues {
  username: string;
  password: string;
  /** An `otpauth://totp/…` link, or the bare secret. */
  authenticator: string;
  /** Empty for Rust's default, "Uni Pilot". */
  device: string;
}

/** What an authenticator being set up shows now. */
export interface AuthenticatorCode {
  code: string;
  /** Seconds until it shows the next one. */
  validFor: number;
}

/** `SignInError` in `src-tauri/src/ilias_sync/sign_in/mod.rs`. */
export type SignInFailureKind =
  'notSetUp' | 'wrongPassword' | 'wrongCode' | 'unrecognised' | 'unreachable' | 'local';

let tauri: Promise<typeof import('@tauri-apps/api/core')> | null = null;

async function call<T>(command: string, args: Record<string, unknown>): Promise<T> {
  const { invoke } = await (tauri ??= import('@tauri-apps/api/core'));
  return invoke<T>(command, args);
}

/** The host the stored sign-in belongs to, as Rust keys it. */
export function installationHost(connection: IliasConnection): string {
  try {
    return new URL(connection.baseUrl).hostname.toLowerCase();
  } catch {
    return connection.baseUrl;
  }
}

/**
 * Whether a sign-in is stored. Reads the credential store, which on a Mac may
 * ask for the computer's password after an update — so only after a click or
 * in Settings, never because a notice appeared.
 */
export function readAutoSignIn(connection: IliasConnection): Promise<AutoSignInStatus> {
  return call('auto_sign_in_status', { baseUrl: connection.baseUrl });
}

/** Stores the values for this ILIAS, replacing what was there. Rejects with a `VaultError`. */
export function saveAutoSignIn(
  connection: IliasConnection,
  values: AutoSignInValues,
): Promise<AutoSignInStatus> {
  return call('auto_sign_in_save', {
    baseUrl: connection.baseUrl,
    username: values.username,
    password: values.password,
    authenticator: values.authenticator,
    device: values.device.trim() || null,
  });
}

/** Removes the stored sign-in for this ILIAS from this computer. */
export function forgetAutoSignIn(connection: IliasConnection): Promise<void> {
  return call('auto_sign_in_forget', { baseUrl: connection.baseUrl });
}

/**
 * Rust signs in with what is stored — one password, one code, nothing
 * retried — and lets ILIAS sign in through it. `true` when ILIAS has a session
 * again. Rejects with a `SignInError`.
 */
export function signInToIlias(connection: IliasConnection): Promise<boolean> {
  return call('sign_in_to_ilias', { baseUrl: connection.baseUrl, clientId: connection.clientId });
}

/**
 * The code an authenticator being set up shows now, made from what was just
 * entered — the university asks for one before it accepts the authenticator.
 */
export function authenticatorCode(authenticator: string): Promise<AuthenticatorCode> {
  return call('auto_sign_in_code', { authenticator });
}

function kindAndMessage(failure: unknown): { kind?: unknown; message?: unknown } {
  return typeof failure === 'object' && failure !== null ? failure : {};
}

export function signInFailureKind(failure: unknown): SignInFailureKind | null {
  const { kind } = kindAndMessage(failure);
  return [
    'notSetUp',
    'wrongPassword',
    'wrongCode',
    'unrecognised',
    'unreachable',
    'local',
  ].includes(kind as string)
    ? (kind as SignInFailureKind)
    : null;
}

/** What a sign-in that did not work says. */
export function signInFailureText(failure: unknown): string {
  const { message } = kindAndMessage(failure);
  switch (signInFailureKind(failure)) {
    case 'notSetUp':
      return 'Nothing is stored for signing in automatically. You can set it up in Settings.';
    case 'wrongPassword':
      return 'The stored password was not accepted. Set it up again with your current password.';
    case 'wrongCode':
      return 'The code from Uni Pilot’s authenticator was not accepted.';
    default:
      return typeof message === 'string' ? message : 'Signing in did not work.';
  }
}

/** What a failed store or forget says, from `VaultError`. Its messages never repeat the input. */
export function vaultFailureText(failure: unknown): string {
  const { kind, message } = kindAndMessage(failure);
  if (kind === 'refused') return 'Access to this computer’s credential store was declined.';
  return typeof message === 'string' ? message : 'The sign-in could not be stored.';
}
