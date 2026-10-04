import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui';
import { NAV_ITEMS } from '@/lib/navigation';
import type { CourseFailure } from '@/features/courses/store/courseStore';
import type { IliasConnection } from '@/features/integrations/lib/ilias/connection';
import {
  cancelUnlock,
  faceFailureKind,
  faceFailureText,
  startUnlock,
  unlockFrame,
  type UnlockProgress,
} from '@/features/auto-sign-in/lib/faceUnlock';
import { useAutoSignInStore } from '@/features/auto-sign-in/store/autoSignInStore';
import { useFaceBar } from '@/features/auto-sign-in/components/useFaceBar';
import { useFaceSession } from '@/features/auto-sign-in/components/useFaceSession';

const LOOKING = 'ILIAS signed you out. Look at the camera, and Uni Pilot signs you in again.';

/** The camera and Rust's look at it. Mounted again for each new look. */
function Watch({
  connection,
  failure,
  onPaused,
}: {
  connection: IliasConnection;
  failure: CourseFailure;
  onPaused: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const setFaceBar = useAutoSignInStore((state) => state.setFaceBar);
  const noteFaceFailure = useAutoSignInStore((state) => state.noteFaceFailure);
  const finishFaceUnlock = useAutoSignInStore((state) => state.finishFaceUnlock);
  const { progress, cameraOn } = useFaceSession(
    {
      start: () => startUnlock(connection),
      frame: unlockFrame,
      finished: (answer: UnlockProgress) => answer.state === 'passed',
      cancel: cancelUnlock,
    },
    {
      onFinished: () => void finishFaceUnlock(connection, failure),
      onFailed: (cause) => {
        noteFaceFailure(connection, cause);
        const kind = faceFailureKind(cause);
        setFaceBar({
          for: failure,
          state: 'stopped',
          text: faceFailureText(cause),
          again: kind !== 'locked' && kind !== 'noFace' && kind !== 'passwordRefused',
        });
      },
      onPaused,
    },
    video,
  );

  return (
    <>
      <video
        ref={video}
        muted
        playsInline
        aria-label="Camera preview"
        className="h-9 w-12 flex-none -scale-x-100 rounded-md bg-surface-secondary object-cover"
      />
      <p aria-live="polite" className="min-w-0 flex-1 truncate text-[12.5px] text-primary">
        {progress ? LOOKING : 'ILIAS signed you out. Getting the camera ready…'}
      </p>
      {cameraOn ? (
        <span className="flex flex-none items-center gap-1.5 rounded-full bg-surface px-2 py-0.5 text-[11px] font-medium text-primary">
          <span aria-hidden className="h-2 w-2 rounded-full bg-coral" />
          Camera on
        </span>
      ) : null}
    </>
  );
}

/**
 * A thin bar at the top of the workspace: when ILIAS has signed the student
 * out and face unlock may run, a small preview, one sentence and the camera
 * mark. Not a dialog — everything below stays usable. The camera runs only
 * while the bar shows and Uni Pilot is in front; the moment the face passes,
 * the bar goes and Rust signs in in the background (`finishFaceUnlock`).
 */
export function FaceUnlockBar() {
  const { connection, failure, showing, bar } = useFaceBar();
  const setFaceBar = useAutoSignInStore((state) => state.setFaceBar);
  const navigate = useNavigate();
  const [round, setRound] = useState(0);
  const [paused, setPaused] = useState(false);

  // Back in front after a pause: look again.
  useEffect(() => {
    if (!paused) return;
    const back = () => {
      setPaused(false);
      setRound((value) => value + 1);
    };
    window.addEventListener('focus', back);
    return () => window.removeEventListener('focus', back);
  }, [paused]);

  if (!showing || !connection || !failure) return null;

  const close = () => setFaceBar({ for: failure, state: 'dismissed' });
  const password = () => {
    close();
    void navigate(NAV_ITEMS.ilias.path);
  };

  return (
    <div
      role="region"
      aria-label="Face unlock"
      className="flex min-h-12 flex-none items-center gap-3 border-b border-line-soft bg-accent-soft px-4 py-1.5"
    >
      {bar?.state === 'stopped' ? (
        <>
          <p role="status" className="min-w-0 flex-1 text-[12.5px] text-primary">
            {bar.text}
          </p>
          {bar.again ? (
            <Button
              size="sm"
              variant="primary"
              onClick={() => setFaceBar({ for: failure, state: 'requested' })}
            >
              Try again
            </Button>
          ) : null}
        </>
      ) : paused ? (
        <p role="status" className="min-w-0 flex-1 text-[12.5px] text-secondary">
          The camera is off while Uni Pilot is in the background.
        </p>
      ) : (
        <Watch
          key={round}
          connection={connection}
          failure={failure}
          onPaused={() => setPaused(true)}
        />
      )}
      <Button size="sm" variant="secondary" onClick={password}>
        Sign in with password instead
      </Button>
      <Button size="sm" variant="ghost" onClick={close}>
        Cancel
      </Button>
    </div>
  );
}
