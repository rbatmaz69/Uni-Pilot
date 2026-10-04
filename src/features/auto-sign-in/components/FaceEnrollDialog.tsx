import { useRef, useState } from 'react';
import { Button, Modal } from '@/components/ui';
import type { IliasConnection } from '@/features/integrations/lib/ilias/connection';
import {
  cancelEnrolment,
  enrolFrame,
  faceFailureText,
  PROMPTS,
  startEnrolment,
  type EnrolProgress,
} from '@/features/auto-sign-in/lib/faceUnlock';
import { useAutoSignInStore } from '@/features/auto-sign-in/store/autoSignInStore';
import { CameraView } from '@/features/auto-sign-in/components/CameraView';
import { useFaceSession } from '@/features/auto-sign-in/components/useFaceSession';

interface FaceEnrollDialogProps {
  connection: IliasConnection;
  onClose: () => void;
}

function Enrolling({
  connection,
  onDone,
  onStopped,
}: {
  connection: IliasConnection;
  onDone: () => void;
  onStopped: (failure: unknown) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const { progress, cameraOn } = useFaceSession(
    {
      start: () => startEnrolment(connection),
      frame: enrolFrame,
      finished: (answer: EnrolProgress) => answer.done,
      cancel: cancelEnrolment,
    },
    {
      onFinished: onDone,
      onFailed: onStopped,
      onPaused: () =>
        onStopped({
          kind: 'local',
          message: 'The camera turned off when Uni Pilot went to the background. Start again.',
        }),
    },
    video,
  );
  const share = progress ? progress.taken / progress.needed : 0;
  return (
    <div className="flex flex-col gap-4">
      <CameraView
        video={video}
        cameraOn={cameraOn}
        prompt={progress ? PROMPTS[progress.prompt] : 'Getting ready…'}
      />
      <div
        role="progressbar"
        aria-label="Face set-up"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(share * 100)}
        className="mx-auto h-1.5 w-full max-w-[400px] overflow-hidden rounded-full bg-surface-secondary"
      >
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-300"
          style={{ width: `${share * 100}%` }}
        />
      </div>
    </div>
  );
}

type Stage = 'intro' | 'enrolling' | 'done' | { stopped: string };

/**
 * Setting up face unlock: what it keeps first, then the camera — only after
 * "Start camera" is clicked. A few looks straight on and slightly to each
 * side; Rust keeps one set of numbers describing the face, no picture.
 */
export function FaceEnrollDialog({ connection, onClose }: FaceEnrollDialogProps) {
  const [stage, setStage] = useState<Stage>('intro');
  const faceEnrolled = useAutoSignInStore((state) => state.faceEnrolled);
  const noteFaceFailure = useAutoSignInStore((state) => state.noteFaceFailure);

  return (
    <Modal
      open
      onClose={onClose}
      title="Set up face unlock"
      description="When ILIAS asks you to sign in again, a look into the camera will do instead of your password and code."
      className="max-w-[520px]"
      footer={
        stage === 'done' ? (
          <Button variant="primary" size="sm" onClick={onClose}>
            Done
          </Button>
        ) : (
          <>
            <Button variant="secondary" size="sm" onClick={onClose}>
              Cancel
            </Button>
            {stage === 'intro' || typeof stage === 'object' ? (
              <Button variant="primary" size="sm" onClick={() => setStage('enrolling')}>
                {stage === 'intro' ? 'Start camera' : 'Start again'}
              </Button>
            ) : null}
          </>
        )
      }
    >
      {stage === 'intro' ? (
        <div className="flex flex-col gap-2 text-[12.5px] leading-relaxed text-secondary">
          <p>
            Uni Pilot keeps 128 numbers that describe your face, in this computer’s credential store
            next to your sign-in. No picture is kept: each frame is looked at and dropped, and
            nothing leaves this computer.
          </p>
          <p>
            The camera turns on when you start, and off when you are done. You will be asked to look
            straight at it, then to turn your head slightly to each side.
          </p>
          <p>Forget, in Settings, removes your face together with your sign-in.</p>
        </div>
      ) : stage === 'enrolling' ? (
        <Enrolling
          connection={connection}
          onDone={() => {
            faceEnrolled(connection);
            setStage('done');
          }}
          onStopped={(failure) => {
            noteFaceFailure(connection, failure);
            setStage({ stopped: faceFailureText(failure) });
          }}
        />
      ) : (
        <p role="status" className="py-6 text-center text-sm text-primary">
          {stage === 'done' ? 'Face unlock is set up.' : stage.stopped}
        </p>
      )}
    </Modal>
  );
}
