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
 *
 * Also here: whether the student allowed the camera to turn on by itself when
 * ILIAS signs them out (`autoUnlock`, off until they turn it on in Settings),
 * and where the face bar stands for the current sign-out (`faceBar`).
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
import {
  faceFailureKind,
  faceFailureText,
  finishUnlock,
} from '@/features/auto-sign-in/lib/faceUnlock';
import { useCourseStore, type CourseFailure } from '@/features/courses/store/courseStore';

export interface KnownSignIn {
  credentials: boolean;
  username: string | null;
  device: string | null;
  /** The university did not accept the stored password; Rust will not send it again. */
  stale: boolean;
  /** A face is enrolled. */
  face: boolean;
}

/**
 * The face bar for one sign-out — tied to the very failure ILIAS gave, so a
 * new sign-out starts afresh. `requested`: the student asked for it.
 * `dismissed`: they closed it. `signingIn`: the face passed, Rust signs in
 * in the background and the bar is gone. `stopped`: it ended with `text`.
 */
export interface FaceBar {
  for: CourseFailure;
  state: 'requested' | 'dismissed' | 'signingIn' | 'stopped';
  text?: string;
  /** For `stopped`: whether another look could help. */
  again?: boolean;
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

  /** The camera may turn on by itself when ILIAS signs the student out. Off until allowed. */
  autoUnlock: boolean;
  setAutoUnlock: (allowed: boolean) => void;
  faceBar: FaceBar | null;
  setFaceBar: (bar: FaceBar | null) => void;
  /**
   * The face passed: the bar goes at once, Rust signs in in the background,
   * and the course list is read again. Nobody waits for it.
   */
  finishFaceUnlock: (connection: IliasConnection, failure: CourseFailure) => Promise<void>;
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
        autoUnlock: false,
        faceBar: null,

        setAutoUnlock: (allowed) => set({ autoUnlock: allowed }),
        setFaceBar: (bar) => set({ faceBar: bar }),

        finishFaceUnlock: async (connection, failure) => {
          set({ faceBar: { for: failure, state: 'signingIn' } });
          const stop = (on: CourseFailure, text: string) =>
            set({ faceBar: { for: on, state: 'stopped', text, again: false } });
          try {
            if (!(await finishUnlock())) {
              stop(
                failure,
                'HHN let Uni Pilot in, but ILIAS did not take the sign-in. Sign in with your password this time.',
              );
              return;
            }
            await useCourseStore.getState().loadCourses(connection);
            const after = useCourseStore.getState().failure;
            if (after?.kind === 'session-expired') {
              // Not again with the camera: the face did its part.
              stop(after, 'Signed in, but ILIAS still asks. Sign in with your password this time.');
            } else {
              set({ faceBar: null });
            }
          } catch (cause) {
            get().noteFaceFailure(connection, cause);
            stop(failure, faceFailureText(cause));
          }
        },

        load: async (connection) => remember(connection, known(await readAutoSignIn(connection))),

        save: async (connection, values) =>
          remember(connection, known(await saveAutoSignIn(connection, values))),

        forget: async (connection) => {
          await forgetAutoSignIn(connection);
          remember(connection, NOTHING);
          // The face went with it; turning the camera on by itself waits for a new one.
          set({ autoUnlock: false });
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
      partialize: (state) => ({ byHost: state.byHost, autoUnlock: state.autoUnlock }),
    },
  ),
);
