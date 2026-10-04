import { useId, useState, type FormEvent } from 'react';
import { TriangleAlert } from 'lucide-react';
import { Button, Modal } from '@/components/ui';
import { hostOf } from '@/features/courses/store/courseStore';
import type { IliasConnection } from '@/features/integrations/lib/ilias/connection';
import {
  saveIliasSignIn,
  vaultFailureText,
  type AutoSignInStatus,
} from '@/features/integrations/lib/iliasSync';

const FIELD =
  'w-full rounded-xl border border-line bg-surface-secondary px-3 py-2 text-[13px] text-primary transition-colors placeholder:text-muted focus:border-accent focus:outline-none';
const LABEL = 'text-[12px] font-medium text-secondary';
const HINT = 'text-[11.5px] leading-relaxed text-muted';

interface DevSignInDialogProps {
  connection: IliasConnection;
  onClose: () => void;
  onSaved: (status: AutoSignInStatus) => void;
}

/**
 * Development builds only: stores what "Test sign-in" needs, for the ILIAS
 * Uni Pilot is connected to. Rust checks the values and keeps them in the
 * platform's credential store; the page gets back only the user name and the
 * authenticator's name. Mount it only while open — closing drops what was
 * typed, so the password is never shown again. The set-up for students is
 * Phase 3's (`docs/face-unlock-plan.md`).
 */
export function DevSignInDialog({ connection, onClose, onSaved }: DevSignInDialogProps) {
  const formId = useId();
  const usernameId = useId();
  const passwordId = useId();
  const authenticatorId = useId();
  const deviceId = useId();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [authenticator, setAuthenticator] = useState('');
  const [device, setDevice] = useState('Uni Pilot');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const complete = username.trim() !== '' && password !== '' && authenticator.trim() !== '';

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!complete || saving) return;
    setSaving(true);
    setError(null);
    try {
      const status = await saveIliasSignIn(connection, {
        username,
        password,
        authenticator,
        device,
      });
      setPassword('');
      setAuthenticator('');
      onSaved(status);
    } catch (failure) {
      setError(vaultFailureText(failure));
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Store sign-in"
      description={`Development builds only. Kept in this computer’s credential store for ${hostOf(connection)}; “Test sign-in” reads it from there.`}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            type="submit"
            form={formId}
            disabled={!complete || saving}
          >
            {saving ? 'Storing…' : 'Store'}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={(event) => void save(event)} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={usernameId} className={LABEL}>
            User name
          </label>
          <input
            id={usernameId}
            type="text"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            className={FIELD}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={passwordId} className={LABEL}>
            Password
          </label>
          <input
            id={passwordId}
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="off"
            className={FIELD}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={authenticatorId} className={LABEL}>
            Authenticator
          </label>
          <input
            id={authenticatorId}
            type="password"
            value={authenticator}
            onChange={(event) => setAuthenticator(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            aria-describedby={`${authenticatorId}-hint`}
            className={FIELD}
          />
          <p id={`${authenticatorId}-hint`} className={HINT}>
            The otpauth:// link behind the QR code, or the secret shown under “Unable to scan?”.
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={deviceId} className={LABEL}>
            Authenticator name
          </label>
          <input
            id={deviceId}
            type="text"
            value={device}
            onChange={(event) => setDevice(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            aria-describedby={`${deviceId}-hint`}
            className={FIELD}
          />
          <p id={`${deviceId}-hint`} className={HINT}>
            As it was named when added; the code page lists authenticators by this name.
          </p>
        </div>
        {error ? (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-coral/40 bg-coral-soft px-3 py-2.5 text-[12px] leading-relaxed text-primary"
          >
            <TriangleAlert size={14} aria-hidden className="mt-0.5 flex-none text-coral" />
            {error}
          </p>
        ) : null}
      </form>
    </Modal>
  );
}
