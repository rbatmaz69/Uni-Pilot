/**
 * What face unlock's island in the notch should show, as far as Uni Pilot's
 * page knows it beyond the auto-sign-in store: where the camera is (`camera`,
 * set by the face bar), the moment a sign-in went through (`signedInAt`), and
 * whether this Mac has a notch to show it in (`available`, from Rust's
 * `notch_show`). Not persisted.
 */

import { create } from 'zustand';

export type CameraPhase = 'starting' | 'looking' | 'paused';

interface NotchState {
  /** The face bar's camera: getting ready, looking, or off in the background. */
  camera: CameraPhase | null;
  /** When a face unlock signed in, for the island's moment of "signed in". */
  signedInAt: number | null;
  /** `null` until Rust has been asked once. */
  available: boolean | null;

  setCamera: (camera: CameraPhase | null) => void;
  signedIn: () => void;
  settle: () => void;
  setAvailable: (available: boolean) => void;
}

export const useNotchStore = create<NotchState>()((set) => ({
  camera: null,
  signedInAt: null,
  available: null,

  setCamera: (camera) => set({ camera }),
  signedIn: () => set({ signedInAt: Date.now() }),
  settle: () => set({ signedInAt: null }),
  setAvailable: (available) => set({ available }),
}));
