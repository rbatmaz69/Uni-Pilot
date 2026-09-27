import { useState, type FormEvent } from 'react';
import {
  ArrowLeft,
  BookOpen,
  ExternalLink,
  FileText,
  Inbox,
  MailOpen,
  MoreHorizontal,
  Reply,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button, IconButton } from '@/components/ui';
import { cn } from '@/lib/utils';
import { NAV_ITEMS } from '@/lib/navigation';
import { openInMail, replyInMail, type MailFailure } from '@/features/mail/lib/appleMail';
import {
  CATEGORY_LABELS,
  TRIAGE_LABELS,
  categoryOf,
  courseFor,
  formatBytes,
  parseSender,
  toneFor,
  type CourseRef,
  type TriageState,
} from '@/features/mail/lib/mail';
import { useMailStore } from '@/features/mail/store/mailStore';
import { MailAvatar } from '@/features/mail/components/MailAvatar';

const TRIAGE_ORDER: TriageState[] = ['reply', 'waiting', 'done'];

/** Where the quote of earlier messages begins: `Am … schrieb …:`, `On … wrote:`, or `>`. */
function splitQuote(content: string): { text: string; quote: string | null } {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const start = lines.findIndex(
    (line, index) =>
      /^(am|on)\s.+(schrieb|wrote).*:\s*$/i.test(line.trim()) ||
      /^-{2,}\s*(original|ursprüngliche)/i.test(line.trim()) ||
      (line.startsWith('>') && index > 0),
  );
  if (start <= 0) return { text: content.trim(), quote: null };
  return {
    text: lines.slice(0, start).join('\n').trim(),
    quote: lines.slice(start).join('\n').trim(),
  };
}

function fullDate(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleString('en-GB', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
}

interface ReadingPaneProps {
  domain: string | null;
  refs: readonly CourseRef[];
  summary: string;
}

/** The opened message: who, what, the text, its files, the course it is about. */
export function ReadingPane({ domain, refs, summary }: ReadingPaneProps) {
  const selectedId = useMailStore((state) => state.selectedId);
  const listed = useMailStore((state) =>
    state.messages?.find((message) => message.id === state.selectedId),
  );
  const body = useMailStore((state) =>
    state.selectedId ? state.bodies[state.selectedId] : undefined,
  );
  const loading = useMailStore((state) => state.bodyLoading === state.selectedId);
  const failure = useMailStore((state) => state.bodyFailure);
  const triage = useMailStore((state) =>
    state.selectedId ? state.triage[state.selectedId] : undefined,
  );
  const view = useMailStore((state) => state.view);
  const [showQuote, setShowQuote] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  if (!selectedId) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-8 py-16 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-2xl border border-line bg-surface-secondary text-accent">
          <Inbox size={24} strokeWidth={1.4} />
        </span>
        <p className="mt-5 text-[15px] font-semibold text-primary">{summary}</p>
        <p className="mt-2 max-w-sm text-[12.5px] leading-relaxed text-muted">
          Pick a message to read it here. Replies open in Apple Mail as drafts — you send them
          there.
        </p>
      </div>
    );
  }

  const message = body ?? listed;
  if (!message) return null;
  const sender = parseSender(message.sender);
  const category = categoryOf(message, domain);
  const course = listed ? courseFor(listed, refs) : null;
  const { text, quote } = splitQuote(body?.content ?? '');
  const { select, setRead, setTriage } = useMailStore.getState();

  const act = async (work: Promise<unknown>) => {
    setProblem(null);
    try {
      await work;
    } catch (cause) {
      setProblem((cause as MailFailure).message);
    }
  };

  return (
    <article key={selectedId} className="animate-page-enter flex min-h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-line-soft px-5 py-2.5">
        <Button
          variant="ghost"
          size="sm"
          // Beside the list the list is right there; beside the board, and on
          // a narrow window, the pane needs a way back.
          className={cn(view === 'list' && 'lg:invisible')}
          onClick={() => void select(null)}
          leadingIcon={<ArrowLeft size={14} strokeWidth={1.8} aria-hidden />}
        >
          {view === 'board' ? 'Close' : 'Inbox'}
        </Button>
        <div className="flex items-center gap-1">
          <IconButton
            label="Mark as unread"
            size="sm"
            onClick={() => void setRead(selectedId, false)}
          >
            <MailOpen size={15} strokeWidth={1.8} aria-hidden />
          </IconButton>
          <IconButton
            label="Open in Mail"
            size="sm"
            onClick={() => void act(openInMail(selectedId))}
          >
            <ExternalLink size={15} strokeWidth={1.8} aria-hidden />
          </IconButton>
        </div>
      </div>

      <div className="flex-1 px-6 py-6 lg:px-8">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-full bg-surface-secondary px-2 py-0.5 text-[10.5px] font-medium text-secondary">
            {CATEGORY_LABELS[category]}
          </span>
          {course ? (
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-[10.5px] font-medium',
                toneFor(course.key),
              )}
            >
              {course.key}
            </span>
          ) : null}
        </div>
        <h2 className="mt-3 text-[21px] font-semibold leading-snug tracking-tight text-primary">
          {message.subject || '(no subject)'}
        </h2>

        <div className="mt-5 flex items-start gap-3">
          <MailAvatar name={sender.name} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] font-semibold text-primary">{sender.name}</p>
            <p className="truncate text-[12px] text-muted">
              {sender.address ?? ''}
              {body && body.to.length > 0 ? ` → ${body.to.join(', ')}` : ''}
            </p>
          </div>
          <time
            className="shrink-0 text-[11.5px] text-muted"
            dateTime={message.receivedAt ?? undefined}
          >
            {fullDate(message.receivedAt)}
          </time>
        </div>

        <div role="group" aria-label="Sort this message" className="mt-5 flex flex-wrap gap-1.5">
          {TRIAGE_ORDER.map((state) => (
            <button
              key={state}
              type="button"
              aria-pressed={triage === state}
              onClick={() => setTriage(selectedId, triage === state ? null : state)}
              className={cn(
                'rounded-full border px-3 py-1 text-[12px] font-medium transition-colors',
                triage === state
                  ? 'border-transparent bg-primary text-inverted'
                  : 'border-line text-secondary hover:border-line-strong hover:text-primary',
              )}
            >
              {TRIAGE_LABELS[state]}
            </button>
          ))}
        </div>

        <div className="mt-6 max-w-[70ch]">
          {loading ? (
            <div aria-label="Reading the message" className="flex flex-col gap-2.5">
              {[92, 84, 88, 60].map((width) => (
                <span
                  key={width}
                  className="h-3 animate-pulse rounded-full bg-surface-secondary"
                  style={{ width: `${width}%` }}
                />
              ))}
            </div>
          ) : failure ? (
            <p role="alert" className="text-[13px] text-coral">
              {failure.message}
            </p>
          ) : (
            <>
              <p className="whitespace-pre-wrap break-words text-[13.5px] leading-relaxed text-primary">
                {text || message.subject}
              </p>
              {quote ? (
                <div className="mt-4">
                  <button
                    type="button"
                    aria-expanded={showQuote}
                    aria-label={showQuote ? 'Hide earlier messages' : 'Show earlier messages'}
                    onClick={() => setShowQuote((shown) => !shown)}
                    className="rounded-full bg-surface-secondary px-2.5 py-0.5 text-muted hover:text-primary"
                  >
                    <MoreHorizontal size={15} aria-hidden />
                  </button>
                  {showQuote ? (
                    <p className="mt-3 whitespace-pre-wrap break-words border-l-2 border-line pl-4 text-[12.5px] leading-relaxed text-muted">
                      {quote}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </div>

        {body && body.attachments.length > 0 ? (
          <section aria-label="Attachments" className="mt-7">
            <h3 className="text-[12px] font-semibold text-secondary">
              {body.attachments.length === 1
                ? '1 attachment'
                : `${body.attachments.length} attachments`}
            </h3>
            <ul className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {body.attachments.map((attachment, index) => (
                <li key={`${attachment.name}-${index}`}>
                  <button
                    type="button"
                    onClick={() => void act(openInMail(selectedId))}
                    title="Open the message in Mail to save it"
                    className="flex w-full items-center gap-3 rounded-xl border border-line-soft bg-surface-secondary/60 px-3 py-2.5 text-left transition-colors hover:border-line-strong"
                  >
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface text-secondary">
                      <FileText size={15} strokeWidth={1.7} aria-hidden />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[12.5px] font-medium text-primary">
                        {attachment.name}
                      </span>
                      <span className="block text-[11px] text-muted">
                        {formatBytes(attachment.size) ?? 'In Mail'}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {course ? (
          <Link
            to={`${NAV_ITEMS.courses.path}?course=${course.refId}`}
            className="mt-7 flex items-center gap-3 rounded-xl border border-line-soft px-4 py-3 transition-colors hover:border-line-strong"
          >
            <span className={cn('grid h-9 w-9 place-items-center rounded-lg', toneFor(course.key))}>
              <BookOpen size={16} strokeWidth={1.7} aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block text-[11px] text-muted">About your course</span>
              <span className="block truncate text-[13px] font-medium text-primary">
                {course.name}
              </span>
            </span>
          </Link>
        ) : null}

        {problem ? (
          <p role="alert" className="mt-4 text-[12.5px] text-coral">
            {problem}
          </p>
        ) : null}
      </div>

      <ReplyBox messageId={selectedId} to={sender.name} />
    </article>
  );
}

/**
 * Write the reply here, finish it in Mail. The text goes into Mail's reply
 * window above the quote, and onto the clipboard in case Mail keeps the
 * window as it opened it.
 */
function ReplyBox({ messageId, to }: { messageId: string; to: string }) {
  const account = useMailStore((state) => state.account);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: 'ok' | 'problem'; text: string } | null>(null);
  const [focused, setFocused] = useState(false);
  // One line while the student reads; room to write once they start.
  const open = focused || text.length > 0;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!account) return;
    setBusy(true);
    setNote(null);
    try {
      if (text.trim()) await navigator.clipboard?.writeText(text).catch(() => undefined);
      const placed = await replyInMail(account, messageId, text);
      setNote({
        tone: 'ok',
        text:
          placed || !text.trim()
            ? 'Your reply is open in Mail. Check it, then press Send there.'
            : 'Mail opened the reply. Your text is on the clipboard — paste it with ⌘V.',
      });
      setText('');
    } catch (cause) {
      setNote({ tone: 'problem', text: (cause as MailFailure).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="sticky bottom-0 border-t border-line-soft bg-surface/95 px-5 py-3 backdrop-blur"
    >
      <textarea
        aria-label={`Reply to ${to}`}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        rows={open ? 4 : 1}
        placeholder={`Reply to ${to}…`}
        className="w-full resize-none rounded-xl border border-line bg-surface-secondary px-3 py-2 text-[13px] text-primary transition-[height] placeholder:text-muted focus:border-accent focus:outline-none"
      />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p
          aria-live="polite"
          className={cn('text-[11.5px]', note?.tone === 'problem' ? 'text-coral' : 'text-muted')}
        >
          {note?.text ?? 'Mail opens this as a draft. Nothing is sent until you press Send there.'}
        </p>
        <Button
          type="submit"
          variant="primary"
          size="sm"
          disabled={busy}
          leadingIcon={<Reply size={14} strokeWidth={1.8} aria-hidden />}
        >
          Continue in Mail
        </Button>
      </div>
    </form>
  );
}
