import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IliasConnection } from '@/features/integrations/lib/ilias/connection';
import {
  cancelEnrolment,
  cancelUnlock,
  enrolFrame,
  faceFailureKind,
  faceFailureText,
  finishUnlock,
  startEnrolment,
  startUnlock,
  unlockFrame,
} from './faceUnlock';

const invoke = vi.fn<(command: string, args?: unknown) => Promise<unknown>>();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (command: string, args?: unknown) => invoke(command, args),
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
  /** Frames go as raw bytes; the page names the ILIAS, never a secret. */
  it('sends the installation, and frames as raw bytes', async () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff]);
    await startEnrolment(HHN);
    await enrolFrame(jpeg);
    await cancelEnrolment();
    await startUnlock(HHN);
    await unlockFrame(jpeg);
    await finishUnlock();
    await cancelUnlock();
    expect(invoke.mock.calls).toEqual([
      ['face_enroll_start', { baseUrl: HHN.baseUrl }],
      ['face_enroll_frame', jpeg],
      ['face_enroll_cancel', undefined],
      ['face_unlock_start', { baseUrl: HHN.baseUrl, clientId: 'iliashhn' }],
      ['face_unlock_frame', jpeg],
      ['face_unlock_finish', undefined],
      ['face_unlock_cancel', undefined],
    ]);
    expect(invoke.mock.calls[1]?.[1]).toBeInstanceOf(Uint8Array);
  });
});

describe('when face unlock stops', () => {
  it('says why, calmly', () => {
    expect(faceFailureText({ kind: 'locked' })).toMatch(/paused after three tries/);
    expect(faceFailureText({ kind: 'notRecognised' })).toMatch(/^Not recognised/);
    expect(faceFailureText({ kind: 'noFace' })).toMatch(/set one up in Settings/);
    expect(faceFailureText({ kind: 'passwordRefused' })).toMatch(
      /did not accept the stored password/,
    );
    expect(faceFailureText({ kind: 'signIn', message: { kind: 'wrongCode' } })).toMatch(
      /code .* was not accepted/,
    );
    expect(faceFailureText({ kind: 'unavailable', message: 'No models.' })).toBe('No models.');
    expect(faceFailureText(new Error('camera'))).toBe('Face unlock stopped.');
    const denied = Object.assign(new Error('The request is not allowed'), {
      name: 'NotAllowedError',
    });
    expect(faceFailureText(denied)).toMatch(/may not use the camera/);
    expect(faceFailureKind({ kind: 'locked' })).toBe('locked');
    expect(faceFailureKind({ kind: 'signedOut' })).toBeNull();
  });
});
