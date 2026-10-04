import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { isDesktopRuntime } from '@/lib/icsFetch';
import { NAV_ITEMS } from '@/lib/navigation';
import { useUiStore } from '@/store/uiStore';
import { useCourseStore } from '@/features/courses/store/courseStore';
import { useAutoSignInStore } from '@/features/auto-sign-in/store/autoSignInStore';
import { useNotchStore } from '@/features/auto-sign-in/store/notchStore';
import { useFaceBar } from '@/features/auto-sign-in/components/useFaceBar';
import type { NotchAction, NotchPhase } from '@/features/auto-sign-in/components/NotchIsland';

/** How long the island smiles after signing in, before it folds away. */
export const SIGNED_IN_MS = 1600;

/** What the page asks the notch to show: `Shown` in `src-tauri/src/notch.rs`. */
export interface NotchShown {
  phase: NotchPhase;
  text: string;
  again: boolean;
  camera: boolean;
}

let tauri: Promise<typeof import('@tauri-apps/api/core')> | null = null;
let events: Promise<typeof import('@tauri-apps/api/event')> | null = null;

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await (tauri ??= import('@tauri-apps/api/core'));
  return invoke<T>(command, args);
}

/** What the island should show now, from where face unlock stands. */
function useShown(): NotchShown | null {
  const { showing, bar } = useFaceBar();
  const faceBar = useAutoSignInStore((state) => state.faceBar);
  const camera = useNotchStore((state) => state.camera);
  const signedInAt = useNotchStore((state) => state.signedInAt);
  const immersive = useUiStore((state) => state.immersive);

  return useMemo(() => {
    const shown = (phase: NotchPhase, text: string, extra: Partial<NotchShown> = {}) => ({
      phase,
      text,
      again: false,
      camera: false,
      ...extra,
    });
    if (faceBar?.state === 'signingIn') return shown('signingIn', 'Recognised. Signing in…');
    if (signedInAt !== null) return shown('signedIn', 'Signed in to ILIAS.');
    // In ILIAS mode the bar, and with it the camera, is gone: so is the island.
    if (immersive || !showing) return null;
    if (bar?.state === 'stopped') {
      return shown('stopped', bar.text ?? 'Face unlock stopped.', { again: Boolean(bar.again) });
    }
    if (camera === 'paused') {
      return shown('paused', 'Paused while Uni Pilot is in the background.');
    }
    if (camera === 'looking') {
      return shown('looking', 'Look at the camera to sign in to ILIAS again.', { camera: true });
    }
    return shown('starting', 'ILIAS signed you out. Getting the camera ready…');
  }, [bar, camera, faceBar?.state, immersive, showing, signedInAt]);
}

/**
 * Face unlock in the notch, from Uni Pilot's side: tells Rust what the island
 * shows (`notch_show`, `notch_hide`), learns whether this Mac has a notch at
 * all — without one the face bar stays in the window — and does what the
 * island's buttons ask. Mounted with the app.
 */
export function NotchSync() {
  const navigate = useNavigate();
  const shown = useShown();
  const signedInAt = useNotchStore((state) => state.signedInAt);
  const key = shown ? JSON.stringify(shown) : null;

  useEffect(() => {
    if (!isDesktopRuntime()) return;
    const state: NotchShown | null = key ? (JSON.parse(key) as NotchShown) : null;
    if (state) {
      call<boolean>('notch_show', { state })
        .then((available) => useNotchStore.getState().setAvailable(available))
        .catch(() => useNotchStore.getState().setAvailable(false));
    } else {
      call('notch_hide').catch(() => undefined);
    }
  }, [key]);

  // The smile after signing in, then the island folds away.
  useEffect(() => {
    if (signedInAt === null) return;
    const timer = setTimeout(
      () => useNotchStore.getState().settle(),
      Math.max(0, signedInAt + SIGNED_IN_MS - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [signedInAt]);

  // The island's buttons. Rust brings the window to the front for these.
  useEffect(() => {
    if (!isDesktopRuntime()) return;
    let stop: (() => void) | undefined;
    let alive = true;
    void (events ??= import('@tauri-apps/api/event'))
      .then(async ({ listen }) => {
        const unlisten = await listen<{ action: NotchAction }>('notch-action', (event) => {
          const failure = useCourseStore.getState().failure;
          if (failure?.kind !== 'session-expired') return;
          const { setFaceBar } = useAutoSignInStore.getState();
          switch (event.payload.action) {
            case 'cancel':
              setFaceBar({ for: failure, state: 'dismissed' });
              break;
            case 'password':
              setFaceBar({ for: failure, state: 'dismissed' });
              void navigate(NAV_ITEMS.ilias.path);
              break;
            case 'retry':
              setFaceBar({ for: failure, state: 'requested' });
              break;
            case 'open':
              break;
          }
        });
        if (!alive) unlisten();
        else stop = unlisten;
      })
      .catch(() => undefined);
    return () => {
      alive = false;
      stop?.();
    };
  }, [navigate]);

  return null;
}
