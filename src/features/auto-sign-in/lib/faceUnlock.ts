/**
 * Face unlock — the TypeScript side of `src-tauri/src/face_unlock/`.
 *
 * The page turns the camera on, sends frames as raw JPEG bytes and shows what
 * Rust answers: the enrolment's prompts, the unlock's "still looking". Rust decides: it never tells the page whether a
 * face matched, and never hands over the face template, the password or a
 * code. When the face passes, Rust signs in itself (`finishUnlock`).
 *
 * Every `start…` reads the credential store first and loads the models; the
 * camera turns on only once it has answered. If it fails, the camera stays off.
 */

import type { InvokeArgs } from '@tauri-apps/api/core';
import type { IliasConnection } from '@/features/integrations/lib/ilias/connection';
import { signInFailureText } from '@/features/auto-sign-in/lib/autoSignIn';

/** `Prompt` in `src-tauri/src/face_unlock/attempt.rs`. */
export type FacePrompt =
  'lookAtCamera' | 'oneFaceOnly' | 'comeCloser' | 'turnSlightlyLeft' | 'turnSlightlyRight';

export interface EnrolProgress {
  prompt: FacePrompt;
  taken: number;
  needed: number;
  done: boolean;
}

/** Unlocking asks nothing but to be seen for a second and a half. */
export type UnlockProgress = { state: 'looking' } | { state: 'passed' };

/** `FaceError` in `src-tauri/src/face_unlock/mod.rs`. */
export type FaceFailureKind =
  | 'notSetUp'
  | 'passwordRefused'
  | 'noFace'
  | 'locked'
  | 'notRecognised'
  | 'unavailable'
  | 'signIn'
  | 'local';

export const PROMPTS: Record<FacePrompt, string> = {
  lookAtCamera: 'Look straight at the camera',
  oneFaceOnly: 'Only one face, please',
  comeCloser: 'Come a little closer',
  turnSlightlyLeft: 'Turn your head slightly to the left',
  turnSlightlyRight: 'Turn your head slightly to the right',
};

let tauri: Promise<typeof import('@tauri-apps/api/core')> | null = null;

async function call<T>(command: string, args?: InvokeArgs): Promise<T> {
  const { invoke } = await (tauri ??= import('@tauri-apps/api/core'));
  return invoke<T>(command, args);
}

export function startEnrolment(connection: IliasConnection): Promise<EnrolProgress> {
  return call('face_enroll_start', { baseUrl: connection.baseUrl });
}

/** One frame, as raw bytes: no JSON, no base64. */
export function enrolFrame(jpeg: Uint8Array): Promise<EnrolProgress> {
  return call('face_enroll_frame', jpeg);
}

export function cancelEnrolment(): Promise<void> {
  return call('face_enroll_cancel');
}

export function startUnlock(connection: IliasConnection): Promise<UnlockProgress> {
  return call('face_unlock_start', {
    baseUrl: connection.baseUrl,
    clientId: connection.clientId,
  });
}

export function unlockFrame(jpeg: Uint8Array): Promise<UnlockProgress> {
  return call('face_unlock_frame', jpeg);
}

/** After the face passed, with the camera off: Rust signs in. `true` when ILIAS has a session. */
export function finishUnlock(): Promise<boolean> {
  return call('face_unlock_finish');
}

export function cancelUnlock(): Promise<void> {
  return call('face_unlock_cancel');
}

function kindAndMessage(failure: unknown): { kind?: unknown; message?: unknown } {
  return typeof failure === 'object' && failure !== null ? failure : {};
}

export function faceFailureKind(failure: unknown): FaceFailureKind | null {
  const { kind } = kindAndMessage(failure);
  const kinds: readonly unknown[] = [
    'notSetUp',
    'passwordRefused',
    'noFace',
    'locked',
    'notRecognised',
    'unavailable',
    'signIn',
    'local',
  ];
  return kinds.includes(kind) ? (kind as FaceFailureKind) : null;
}

/** What a face unlock that stopped says. */
export function faceFailureText(failure: unknown): string {
  const { message } = kindAndMessage(failure);
  switch (faceFailureKind(failure)) {
    case 'notSetUp':
      return 'Set up signing in automatically in Settings first.';
    case 'passwordRefused':
      return 'HHN did not accept the stored password. Set it up again in Settings.';
    case 'noFace':
      return 'No face is set up yet. You can set one up in Settings.';
    case 'locked':
      return 'Face unlock is paused after three tries. Sign in with your password, or try again in a few minutes.';
    case 'notRecognised':
      return 'Not recognised. Try again, or sign in with your password.';
    case 'signIn':
      return signInFailureText(message);
    case 'unavailable':
    case 'local':
      return typeof message === 'string' ? message : 'Face unlock stopped.';
    default:
      return cameraFailureText(failure);
  }
}

/** The camera's own refusals, in words instead of the browser's. */
function cameraFailureText(failure: unknown): string {
  // A DOMException, which not every webview makes an `Error`.
  const name =
    typeof failure === 'object' && failure !== null && 'name' in failure ? failure.name : '';
  if (name === 'NotAllowedError') {
    return 'Uni Pilot may not use the camera. Allow it in System Settings → Privacy & Security → Camera, then try again.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return 'No camera was found.';
  }
  if (name === 'NotReadableError') return 'The camera is in use by another app.';
  return 'Face unlock stopped.';
}
