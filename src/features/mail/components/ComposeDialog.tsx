import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Send } from 'lucide-react';
import { Button, Modal } from '@/components/ui';
import { isDesktopRuntime } from '@/lib/icsFetch';
import { composeInMail, type MailDraft, type MailFailure } from '@/features/mail/lib/appleMail';
import { universityAddress, universityDomain } from '@/features/mail/lib/mail';
import { useMailStore } from '@/features/mail/store/mailStore';
import { useIliasStore } from '@/features/integrations/store/iliasStore';

/** A field without a box of its own: its row draws the line under it. */
const FIELD =
  'min-w-0 flex-1 bg-transparent text-[13.5px] text-primary placeholder:text-muted focus:outline-none disabled:text-secondary';

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
  const sendId = useId();
  const sendNowId = useId();
  const closeId = useId();
  const [to, setTo] = useState(initial?.to ?? '');
  const [subject, setSubject] = useState(initial?.subject ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [step, setStep] = useState<Step>('write');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const previousStep = useRef<Step>(step);

  const domain = universityDomain(useIliasStore((state) => state.connection?.baseUrl));
  const account = useMailStore((state) =>
    state.accounts?.find((known) => known.name === state.account),
  );
  const knowsAccounts = useMailStore((state) => state.accounts !== null);
  const findAccount = useMailStore((state) => state.findAccount);
  // Through the store, so fetching ahead waits while Mail sends.
  const sendThroughMail = useMailStore((state) => state.send);
  const from = account ? universityAddress(account, domain) : null;

  // Written away from the Inbox, Mail's accounts may not be known yet.
  useEffect(() => {
    if (!knowsAccounts && isDesktopRuntime()) void findAccount(domain);
  }, [knowsAccounts, findAccount, domain]);

  // The footer's buttons change with the step; the focus goes to the one that
  // carries on from the button just pressed.
  useEffect(() => {
    const target =
      step === 'confirm'
        ? sendNowId
        : step === 'inMail'
          ? closeId
          : previousStep.current === 'confirm'
            ? sendId
            : null;
    if (target) document.getElementById(target)?.focus();
    previousStep.current = step;
  }, [step, sendId, sendNowId, closeId]);

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
      if (await sendThroughMail(draft())) {
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

  /** Beside the buttons: the question before sending, or what went wrong. */
  const note =
    step === 'confirm' ? (
      <p className="text-secondary">
        Send to <span className="font-medium text-primary">{recipients.join(', ')}</span> now? Apple
        Mail sends it from {from} right away.
        {subject.trim() ? null : ' It has no subject.'}
      </p>
    ) : step === 'inMail' ? (
      <p role="alert" className="text-coral">
        Apple Mail did not send it. It is open in Mail as a draft: send it from there.
      </p>
    ) : problem ? (
      <p role="alert" className="text-coral">
        {problem}
      </p>
    ) : null;

  return (
    <Modal
      open
      onClose={onClose}
      title="New message"
      className="max-w-[540px]"
      footer={
        <>
          <div className="mr-auto min-w-0 text-[12px] leading-snug [overflow-wrap:anywhere]">
            {note}
          </div>
          {step === 'write' ? (
            <>
              <Button
                variant="secondary"
                type="submit"
                form={formId}
                disabled={busy}
                className="flex-none"
              >
                Open draft in Mail
              </Button>
              <Button
                id={sendId}
                variant="primary"
                leadingIcon={<Send size={15} strokeWidth={1.9} aria-hidden />}
                onClick={() => setStep('confirm')}
                disabled={busy || !canSend}
                className="flex-none"
              >
                Send email
              </Button>
            </>
          ) : null}
          {step === 'confirm' ? (
            <>
              <Button
                variant="ghost"
                onClick={() => setStep('write')}
                disabled={busy}
                className="flex-none"
              >
                Back
              </Button>
              <Button
                id={sendNowId}
                variant="primary"
                leadingIcon={<Send size={15} strokeWidth={1.9} aria-hidden />}
                onClick={() => void send()}
                disabled={busy}
                className="flex-none"
              >
                {busy ? 'Sending…' : 'Send now'}
              </Button>
            </>
          ) : null}
          {step === 'inMail' ? (
            <Button id={closeId} variant="secondary" onClick={onClose} className="flex-none">
              Close
            </Button>
          ) : null}
        </>
      }
    >
      <form id={formId} onSubmit={(event) => void handleSubmit(event)} className="flex flex-col">
        <div aria-hidden className="-mx-6 border-t border-line" />
        <div className="flex items-center gap-3 border-b border-line py-3">
          <span className="w-16 flex-none text-[13.5px] text-muted">From</span>
          {/* Not drawn between flex items; read aloud as "From student@…". */}{' '}
          {from ? (
            <span className="min-w-0 truncate text-[13.5px] text-secondary">{from}</span>
          ) : (
            <span className="min-w-0 text-[12.5px] leading-snug text-muted">
              Sending needs your university account in Apple Mail; a draft works without it.
            </span>
          )}
        </div>
        <fieldset disabled={step !== 'write'} className="flex min-w-0 flex-col">
          <Row label="To">
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
          </Row>
          <Row label="Subject">
            {(id) => (
              <input
                id={id}
                type="text"
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                placeholder="What is this about?"
                className={FIELD}
              />
            )}
          </Row>
          <MessageField value={body} onChange={setBody} />
        </fieldset>
      </form>
    </Modal>
  );
}

/** One line of the header: its label on the left, the field filling the rest. */
function Row({ label, children }: { label: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="flex items-center gap-3 border-b border-line py-3 transition-colors focus-within:border-accent">
      <label htmlFor={id} className="w-16 flex-none text-[13.5px] text-muted">
        {label}
      </label>
      {children(id)}
    </div>
  );
}

/** The message itself: no label shown, and room to write. */
function MessageField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const id = useId();
  return (
    <>
      <label htmlFor={id} className="sr-only">
        Message
      </label>
      <textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Write your message…"
        rows={9}
        className="min-h-[160px] w-full resize-y bg-transparent pt-4 text-[13.5px] leading-relaxed text-primary placeholder:text-muted focus:outline-none disabled:text-secondary"
      />
    </>
  );
}
