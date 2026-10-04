import { useRef, useState } from 'react';
import { Button, Modal } from '@/components/ui';
import type { IliasConnection } from '@/features/integrations/lib/ilias/connection';
import {
  cancelUnlock,
  faceFailureKind,
  faceFailureText,
  finishUnlock,
  PROMPTS,
  startUnlock,
  unlockFrame,
  type UnlockProgress,
} from '@/features/auto-sign-in/lib/faceUnlock';
import { useAutoSignInStore } from '@/features/auto-sign-in/store/autoSignInStore';
import { CameraView } from '@/features/auto-sign-in/components/CameraView';
import { useFaceSession } from '@/features/auto-sign-in/components/useFaceSession';

interface FaceUnlockDialogProps {
  connection: IliasConnection;
  onClose: () => void;
  /** ILIAS has a session again. */
  onSignedIn: () => void;
  /** The student signs in themselves, in ILIAS mode. */
  onPasswordInstead: () => void;
}

const steps = (connection: IliasConnection) => ({
  start: () => startUnlock(connection),
  frame: unlockFrame,
  finished: (progress: UnlockProgress) => progress.state === 'passed',
  cancel: cancelUnlock,
});

/** One look into the camera, from Rust's start to its last answer. */
function Looking({
  connection,
  onPassed,
  onStopped,
}: {
  connection: IliasConnection;
  onPassed: () => void;
  onStopped: (failure: unknown) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const { progress, cameraOn } = useFaceSession(
    steps(connection),
    {
      onFinished: onPassed,
      onFailed: onStopped,
      onPaused: () =>
        onStopped({
          kind: 'local',
          message: 'The camera turned off when Uni Pilot went to the background.',
        }),
    },
    video,
  );
  const prompt =
    progress === null
      ? 'Getting ready…'
      : progress.state === 'looking'
        ? PROMPTS[progress.prompt]
        : null;
  return <CameraView video={video} cameraOn={cameraOn} prompt={prompt} />;
}

type Stage =
  | { stage: 'looking'; round: number }
  | { stage: 'signingIn' }
  | { stage: 'stopped'; text: string; again: boolean };

/**
 * "Unlock with your face": the camera turns on once Rust has read the stored
 * sign-in and face — it does not when that fails — and off as soon as the
 * face passed, before Rust signs in. Signing in with the password is always
 * on offer.
 */
export function FaceUnlockDialog({
  connection,
  onClose,
  onSignedIn,
  onPasswordInstead,
}: FaceUnlockDialogProps) {
  const [stage, setStage] = useState<Stage>({ stage: 'looking', round: 0 });
  const noteFaceFailure = useAutoSignInStore((state) => state.noteFaceFailure);

  const onStopped = (failure: unknown) => {
    noteFaceFailure(connection, failure);
    const kind = faceFailureKind(failure);
    setStage({
      stage: 'stopped',
      text: faceFailureText(failure),
      again: kind === 'notRecognised' || kind === 'local',
    });
  };

  const onPassed = () => {
    setStage({ stage: 'signingIn' });
    finishUnlock()
      .then((signedIn) => {
        if (signedIn) onSignedIn();
        else
          setStage({
            stage: 'stopped',
            text: 'HHN let Uni Pilot in, but ILIAS did not take the sign-in. Sign in with your password this time.',
            again: false,
          });
      })
      .catch(onStopped);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Unlock with your face"
      description="Look into the camera and follow the prompts. Pictures stay on this computer and are not kept."
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onPasswordInstead}>
            Sign in with password instead
          </Button>
          {stage.stage === 'stopped' && stage.again ? (
            <Button
              variant="primary"
              size="sm"
              onClick={() => setStage({ stage: 'looking', round: Date.now() })}
            >
              Try again
            </Button>
          ) : null}
        </>
      }
    >
      {stage.stage === 'looking' ? (
        <Looking
          key={stage.round}
          connection={connection}
          onPassed={onPassed}
          onStopped={onStopped}
        />
      ) : (
        <p role="status" className="py-6 text-center text-sm text-primary">
          {stage.stage === 'signingIn' ? 'Recognised. Signing in…' : stage.text}
        </p>
      )}
    </Modal>
  );
}
