import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react';
import { Button, Modal } from '@/components/ui';
import { isDesktopRuntime } from '@/lib/icsFetch';
import {
  composeInMail,
  sendWithMail,
  type MailDraft,
  type MailFailure,
} from '@/features/mail/lib/appleMail';
import { universityAddress, universityDomain } from '@/features/mail/lib/mail';
import { useMailStore } from '@/features/mail/store/mailStore';
import { useIliasStore } from '@/features/integrations/store/iliasStore';

const FIELD =
  'w-full rounded-xl border border-line bg-surface-secondary px-3 py-2 text-[13px] text-primary transition-colors placeholder:text-muted focus:border-accent focus:outline-none disabled:text-secondary';

/** Writing; asked once more before sending; or not sent, and left in Mail. */
type Step = 'write' | 'confirm' | 'inMail';

interface ComposeDialogProps {
  onClose: () => void;
  /** What the draft starts with — a subject from the page it came from. */
  initial?: { to?: string; subject?: string; body?: string };
}

/**
 * Writes a message, and either hands it to Apple Mail as a draft or has Mail
 * send it. Sending asks once more, naming who gets it and from which address:
 * Uni Pilot sends nothing in the student's name they have not confirmed.
 */
export function ComposeDialog({ onClose, initial }: ComposeDialogProps) {
  const formId = useId();
  const sendNowId = useId();
  const dismissId = useId();
  const [to, setTo] = useState(initial?.to ?? '');
  const [subject, setSubject] = useState(initial?.subject ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [step, setStep] = useState<Step>('write');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const domain = universityDomain(useIliasStore((state) => state.connection?.baseUrl));
  const account = useMailStore((state) =>
    state.accounts?.find((known) => known.name === state.account),
  );
  const knowsAccounts = useMailStore((state) => state.accounts !== null);
  const findAccount = useMailStore((state) => state.findAccount);
  const from = account ? universityAddress(account, domain) : null;

  // Written away from the Inbox, Mail's accounts may not be known yet.
  useEffect(() => {
    if (!knowsAccounts && isDesktopRuntime()) void findAccount(domain);
  }, [knowsAccounts, findAccount, domain]);

  // The button that replaced the one just pressed takes the focus.
  useEffect(() => {
    if (step === 'confirm') document.getElementById(sendNowId)?.focus();
    if (step === 'inMail') document.getElementById(dismissId)?.focus();
  }, [step, sendNowId, dismissId]);

  const recipients = to
    .split(/[,;\s]+/)
    .map((address) => address.trim())
    .filter(Boolean);
  const draft = (): MailDraft => ({ from, to: recipients, subject: subject.trim(), body });
  const canSend = from !== null && recipients.length > 0;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      await composeInMail(draft());
      onClose();
    } catch (cause) {
      setProblem((cause as MailFailure).message);
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    setBusy(true);
    setProblem(null);
    try {
      if (await sendWithMail(draft())) {
        onClose();
        return;
      }
      setStep('inMail');
    } catch (cause) {
      const failure = cause as MailFailure;
      // Mail may have sent it before the answer went missing.
      setProblem(
        failure.kind === 'failed'
          ? `${failure.message} It may have gone out anyway: look in Sent in Mail before sending it again.`
          : failure.message,
      );
      setStep('write');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="New message"
      description="Apple Mail sends it from your university address, or opens it as a draft for you to finish there."
      footer={
        <>
          {/* One button throughout, so the focus stays on it when it turns into Back. */}
          <Button
            id={dismissId}
            variant="ghost"
            size="sm"
            onClick={step === 'confirm' ? () => setStep('write') : onClose}
            disabled={busy && step === 'confirm'}
          >
            {step === 'confirm' ? 'Back' : step === 'inMail' ? 'Close' : 'Cancel'}
          </Button>
          {step === 'write' ? (
            <>
              <Button variant="secondary" size="sm" type="submit" form={formId} disabled={busy}>
                Open draft in Mail
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setStep('confirm')}
                disabled={busy || !canSend}
              >
                Send…
              </Button>
            </>
          ) : null}
          {step === 'confirm' ? (
            <Button
              id={sendNowId}
              variant="primary"
              size="sm"
              onClick={() => void send()}
              disabled={busy}
            >
              {busy ? 'Sending…' : 'Send now'}
            </Button>
          ) : null}
        </>
      }
    >
      <form
        id={formId}
        onSubmit={(event) => void handleSubmit(event)}
        className="flex flex-col gap-3.5"
      >
        {from ? (
          <p className="text-[12px] text-muted">
            From <span className="text-secondary">{from}</span>
          </p>
        ) : (
          <p className="text-[12px] text-muted">
            Sending from here needs your university account in Apple Mail. A draft works without it.
          </p>
        )}
        <fieldset disabled={step !== 'write'} className="flex min-w-0 flex-col gap-3.5">
          <Field label="To">
            {(id) => (
              <input
                id={id}
                type="text"
                value={to}
                onChange={(event) => setTo(event.target.value)}
                placeholder="name@hs-heilbronn.de"
                className={FIELD}
              />
            )}
          </Field>
          <Field label="Subject">
            {(id) => (
              <input
                id={id}
                type="text"
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                className={FIELD}
              />
            )}
          </Field>
          <Field label="Message">
            {(id) => (
              <textarea
                id={id}
                value={body}
                onChange={(event) => setBody(event.target.value)}
                rows={8}
                className={`${FIELD} resize-y`}
              />
            )}
          </Field>
        </fieldset>
        {step === 'confirm' ? (
          <p className="rounded-xl border border-line bg-surface-secondary px-3 py-2 text-[12.5px] text-secondary">
            Send to <span className="font-medium text-primary">{recipients.join(', ')}</span> now?
            Apple Mail sends it from {from} right away.
            {subject.trim() ? null : ' It has no subject.'}
          </p>
        ) : null}
        {step === 'inMail' ? (
          <p role="alert" className="text-[12px] text-coral">
            Apple Mail did not send it. It is open in Mail as a draft: send it from there.
          </p>
        ) : null}
        {problem ? (
          <p role="alert" className="text-[12px] text-coral">
            {problem}
          </p>
        ) : null}
      </form>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-1 block text-[12px] font-medium text-secondary">
        {label}
      </label>
      {children(id)}
    </div>
  );
}
