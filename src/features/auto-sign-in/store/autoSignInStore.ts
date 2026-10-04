/**
 * Whether signing in automatically, and face unlock, are set up, by ILIAS host.
 *
 * Remembered here so the notice that ILIAS wants a sign-in can offer "Sign in
 * automatically" without asking the credential store: on a Mac, reading it can
 * bring up the Keychain's password prompt after every update, and that prompt
 * should follow a click, not the appearance of a notice. The store is asked
 * once, in Settings, while nothing is remembered; after that every save,
 * forget and sign-in keeps this up to date.
 *
 * Never a password, an authenticator or a face: only what Rust's status
 * says about them.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { IliasConnection } from '@/features/integrations/lib/ilias/connection';
import {
  forgetAutoSignIn,
  installationHost,
  readAutoSignIn,
  saveAutoSignIn,
  signInFailureKind,
  signInFailureText,
  signInToIlias,
  type AutoSignInStatus,
  type AutoSignInValues,
} from '@/features/auto-sign-in/lib/autoSignIn';
import { faceFailureKind } from '@/features/auto-sign-in/lib/faceUnlock';

export interface KnownSignIn {
  credentials: boolean;
  username: string | null;
  device: string | null;
  /** The university did not accept the stored password; Rust will not send it again. */
  stale: boolean;
  /** A face is enrolled. */
  face: boolean;
}

export interface SignInResult {
  /** ILIAS has a session again. */
  signedIn: boolean;
  message: string;
}

interface AutoSignInState {
  /** By ILIAS host. Absent: not asked yet. */
  byHost: Record<string, KnownSignIn>;
  signingIn: boolean;

  load: (connection: IliasConnection) => Promise<KnownSignIn>;
  save: (connection: IliasConnection, values: AutoSignInValues) => Promise<KnownSignIn>;
  forget: (connection: IliasConnection) => Promise<void>;
  signIn: (connection: IliasConnection) => Promise<SignInResult>;
  faceEnrolled: (connection: IliasConnection) => void;
  /** What a face unlock that stopped says about what is stored. */
  noteFaceFailure: (connection: IliasConnection, failure: unknown) => void;
}

const NOTHING: KnownSignIn = {
  credentials: false,
  username: null,
  device: null,
  stale: false,
  face: false,
};

function known(status: AutoSignInStatus): KnownSignIn {
  return {
    credentials: status.credentials,
    username: status.username,
    device: status.device,
    stale: status.stale,
    face: status.face,
  };
}

export const useAutoSignInStore = create<AutoSignInState>()(
  persist(
    (set, get) => {
      const remember = (connection: IliasConnection, value: KnownSignIn) => {
        set((state) => ({ byHost: { ...state.byHost, [installationHost(connection)]: value } }));
        return value;
      };
      const current = (connection: IliasConnection) =>
        get().byHost[installationHost(connection)] ?? NOTHING;

      return {
        byHost: {},
        signingIn: false,

        load: async (connection) => remember(connection, known(await readAutoSignIn(connection))),

        save: async (connection, values) =>
          remember(connection, known(await saveAutoSignIn(connection, values))),

        forget: async (connection) => {
          await forgetAutoSignIn(connection);
          remember(connection, NOTHING);
        },

        faceEnrolled: (connection) => {
          remember(connection, { ...current(connection), face: true });
        },

        noteFaceFailure: (connection, failure) => {
          switch (faceFailureKind(failure)) {
            case 'notSetUp':
              remember(connection, NOTHING);
              break;
            case 'passwordRefused':
              remember(connection, { ...current(connection), credentials: true, stale: true });
              break;
            case 'noFace':
              remember(connection, { ...current(connection), face: false });
              break;
            case 'signIn':
              if (
                signInFailureKind((failure as { message?: unknown }).message) === 'wrongPassword'
              ) {
                remember(connection, { ...current(connection), credentials: true, stale: true });
              }
              break;
            default:
          }
        },

        signIn: async (connection) => {
          if (get().signingIn) return { signedIn: false, message: 'Uni Pilot is signing in.' };
          set({ signingIn: true });
          try {
            const signedIn = await signInToIlias(connection);
            // Rust found a sign-in to try, so one is stored, and was accepted.
            remember(connection, { ...current(connection), credentials: true, stale: false });
            return signedIn
              ? { signedIn, message: 'Signed in to ILIAS.' }
              : {
                  signedIn,
                  message:
                    'The university let Uni Pilot in, but ILIAS did not take the sign-in. Sign in yourself this time.',
                };
          } catch (failure) {
            const kind = signInFailureKind(failure);
            if (kind === 'wrongPassword') {
              remember(connection, { ...current(connection), credentials: true, stale: true });
            }
            if (kind === 'notSetUp') remember(connection, NOTHING);
            return { signedIn: false, message: signInFailureText(failure) };
          } finally {
            set({ signingIn: false });
          }
        },
      };
    },
    {
      name: 'uni-pilot.auto-sign-in',
      partialize: (state) => ({ byHost: state.byHost }),
    },
  ),
);
