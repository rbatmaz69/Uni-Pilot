import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { Button, Modal } from '@/components/ui';
import { composeInMail, type MailFailure } from '@/features/mail/lib/appleMail';
import { universityAddress, universityDomain } from '@/features/mail/lib/mail';
import { useMailStore } from '@/features/mail/store/mailStore';
import { useIliasStore } from '@/features/integrations/store/iliasStore';

const FIELD =
  'w-full rounded-xl border border-line bg-surface-secondary px-3 py-2 text-[13px] text-primary transition-colors placeholder:text-muted focus:border-accent focus:outline-none';

interface ComposeDialogProps {
  onClose: () => void;
  /** What the draft starts with — a subject from the page it came from. */
  initial?: { to?: string; subject?: string; body?: string };
}

/**
 * Writes a message and hands it to Apple Mail as a draft. The student reads it
 * there and presses Send there: Uni Pilot never sends mail in anyone's name.
 */
export function ComposeDialog({ onClose, initial }: ComposeDialogProps) {
  const formId = useId();
  const [to, setTo] = useState(initial?.to ?? '');
  const [subject, setSubject] = useState(initial?.subject ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const domain = universityDomain(useIliasStore((state) => state.connection?.baseUrl));
  const account = useMailStore((state) =>
    state.accounts?.find((known) => known.name === state.account),
  );
  const from = account ? universityAddress(account, domain) : null;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      await composeInMail({
        from,
        to: to
          .split(/[,;\s]+/)
          .map((address) => address.trim())
          .filter(Boolean),
        subject: subject.trim(),
        body,
      });
      onClose();
    } catch (cause) {
      setProblem((cause as MailFailure).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="New message"
      description="Apple Mail opens it as a draft. You read it there, and send it there."
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" type="submit" form={formId} disabled={busy}>
            Open draft in Mail
          </Button>
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
        ) : null}
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
