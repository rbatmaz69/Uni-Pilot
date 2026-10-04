import { useEffect, useId, useState, type FormEvent } from 'react';
import { TriangleAlert } from 'lucide-react';
import { Button, Modal } from '@/components/ui';
import type { IliasConnection } from '@/features/integrations/lib/ilias/connection';
import { authenticatorCode, vaultFailureText } from '@/features/auto-sign-in/lib/autoSignIn';
import {
  useAutoSignInStore,
  type KnownSignIn,
} from '@/features/auto-sign-in/store/autoSignInStore';

const FIELD =
  'w-full rounded-xl border border-line bg-surface-secondary px-3 py-2 text-[13px] text-primary transition-colors placeholder:text-muted focus:border-accent focus:outline-none';
const LABEL = 'text-[12px] font-medium text-secondary';
const HINT = 'text-[11.5px] leading-relaxed text-muted';
/** Long enough not to ask Rust on every keystroke of a pasted secret. */
const SETTLE_MS = 250;

interface CredentialsDialogProps {
  connection: IliasConnection;
  onClose: () => void;
  onSaved: (saved: KnownSignIn) => void;
}

/**
 * What signing in automatically needs: the HHN user name and password, and an
 * authenticator of Uni Pilot's own, set up at HHN next to the student's phone.
 * Uni Pilot shows the code HHN asks for to confirm it. Never recovery codes.
 *
 * Mount it only while open: closing drops what was typed, so the password and
 * the secret are gone from the page once saved, and Rust's answer never
 * carries them back.
 */
export function CredentialsDialog({ connection, onClose, onSaved }: CredentialsDialogProps) {
  const save = useAutoSignInStore((state) => state.save);
  const formId = useId();
  const usernameId = useId();
  const passwordId = useId();
  const authenticatorId = useId();
  const deviceId = useId();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [authenticator, setAuthenticator] = useState('');
  const [device, setDevice] = useState('Uni Pilot');
  /** The code to confirm at HHN, and the input it was made from. */
  const [shown, setShown] = useState<{ from: string; code: string } | null>(null);
  const code = shown?.from === authenticator ? shown.code : null;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const complete = username.trim() !== '' && password !== '' && authenticator.trim() !== '';

  // The code to confirm the authenticator at HHN, renewed when it changes.
  useEffect(() => {
    if (!authenticator.trim()) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let current = true;
    const show = async () => {
      try {
        const now = await authenticatorCode(authenticator);
        if (!current) return;
        setShown({ from: authenticator, code: now.code });
        timer = setTimeout(() => void show(), Math.max(now.validFor, 1) * 1000);
      } catch {
        // Not a secret yet; the field's hint says what belongs there.
        if (current) setShown(null);
      }
    };
    timer = setTimeout(() => void show(), SETTLE_MS);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [authenticator]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!complete || saving) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await save(connection, { username, password, authenticator, device });
      setPassword('');
      setAuthenticator('');
      onSaved(saved);
    } catch (failure) {
      setError(vaultFailureText(failure));
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Set up automatic sign-in"
      description="Uni Pilot signs in with an authenticator of its own. Your phone keeps its authenticator, and you can remove Uni Pilot’s at HHN at any time."
      className="max-w-[520px]"
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
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    >
      <ol className="mb-5 flex list-decimal flex-col gap-1 rounded-xl bg-surface-secondary py-3 pl-8 pr-4 text-[12px] leading-relaxed text-secondary">
        <li>On HHN’s account page, under Signing in, add a second authenticator app.</li>
        <li>Choose “Unable to scan?” and copy the secret into the Authenticator field below.</li>
        <li>
          Enter the code Uni Pilot shows, and give the authenticator the name from the last field.
        </li>
      </ol>
      <form id={formId} onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={usernameId} className={LABEL}>
            HHN user name
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
            The secret from “Unable to scan?”, or the otpauth:// link behind the QR code.
          </p>
          <p aria-live="polite" className="text-[12px] text-secondary">
            {code ? (
              <>
                Code to confirm at HHN:{' '}
                <span className="font-medium tabular-nums tracking-wider text-primary">
                  {code.slice(0, 3)} {code.slice(3)}
                </span>
              </>
            ) : null}
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
            Use the same name at HHN: its code page lists authenticators by name, and Uni Pilot
            picks its own by this one.
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
