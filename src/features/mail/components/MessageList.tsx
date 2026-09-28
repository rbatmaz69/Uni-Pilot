import { FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MailMessage } from '@/features/mail/lib/appleMail';
import {
  TRIAGE_LABELS,
  formatReceived,
  groupByDay,
  parseSender,
  type TriageState,
} from '@/features/mail/lib/mail';
import { MailAvatar } from '@/features/mail/components/MailAvatar';

interface ListProps {
  messages: MailMessage[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

interface BoardProps extends ListProps {
  triage: Readonly<Record<string, TriageState>>;
}

/** What a screen reader hears for a message, and what the tests find it by. */
function messageLabel(message: MailMessage): string {
  return `${message.read ? '' : 'Unread: '}${message.subject || '(no subject)'}, from ${parseSender(message.sender).name}`;
}

/** Newest first, under Today, Yesterday, This week and Earlier. */
export function MessageList({ messages, selectedId, onSelect }: ListProps) {
  const now = new Date();
  const groups = groupByDay(messages, now);
  return (
    <div role="region" aria-label="Messages">
      {groups.map((group) => (
        <section key={group.label} aria-label={group.label}>
          <h3 className="mail-day-heading">{group.label}</h3>
          <ul className="mail-message-group">
            {group.messages.map((message) => (
              <MessageRow
                key={message.id}
                message={message}
                selected={message.id === selectedId}
                now={now}
                onSelect={() => onSelect(message.id)}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

interface RowProps {
  message: MailMessage;
  selected: boolean;
  now: Date;
  onSelect: () => void;
}

function MessageRow({ message, selected, now, onSelect }: RowProps) {
  const sender = parseSender(message.sender);
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-label={messageLabel(message)}
        aria-current={selected ? 'true' : undefined}
        className={cn(
          'mail-message-row',
          selected && 'mail-message-row--selected',
          !message.read && 'mail-message-row--unread',
        )}
      >
        {!message.read ? <span aria-hidden className="mail-unread-dot" /> : null}
        <MailAvatar name={sender.name} />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span
              className={cn(
                'truncate text-[13px]',
                message.read ? 'text-secondary' : 'font-semibold text-primary',
              )}
            >
              {sender.name}
            </span>
            <span className="shrink-0 text-[11px] tabular-nums text-muted">
              {formatReceived(message.receivedAt, now)}
            </span>
          </span>
          <span
            className={cn(
              'mt-0.5 block truncate text-[12.5px]',
              message.read ? 'text-secondary' : 'font-medium text-primary',
            )}
          >
            {message.subject || '(no subject)'}
          </span>
          {message.snippet ? <span className="mail-message-snippet">{message.snippet}</span> : null}
          {message.attachments > 0 ? (
            <AttachmentBadges count={message.attachments} names={message.attachmentNames ?? []} />
          ) : null}
        </span>
      </button>
    </li>
  );
}

/** Real filenames arrive with the lightweight preview; the count is the fallback. */
function AttachmentBadges({ count, names }: { count: number; names: string[] }) {
  const files = names.slice(0, 3);
  const remaining = Math.max(0, count - files.length);
  return (
    <span
      className="mail-attachment-badges"
      aria-label={`${count} ${count === 1 ? 'attachment' : 'attachments'}`}
    >
      {files.map((name, index) => {
        const extension = name.split('.').at(-1)?.toLowerCase() ?? '';
        const kind = /^[a-z0-9]{1,4}$/.test(extension) ? extension : 'file';
        return (
          <span className="mail-file-badge" key={`${name}-${index}`} title={name}>
            <span className="mail-file-mark" data-filetype={kind} aria-hidden>
              {kind === 'pdf' ? 'PDF' : kind.slice(0, 3).toUpperCase() || <FileText size={11} />}
            </span>
            <span className="mail-file-name">{name}</span>
          </span>
        );
      })}
      {remaining > 0 ? (
        <span className="mail-more-files">
          {remaining === count ? `${count} files` : `+${remaining}`}
        </span>
      ) : null}
      {files.length === 0 && remaining === 0 ? (
        <span className="mail-file-badge">
          <span className="mail-file-mark" data-filetype="file" aria-hidden>
            <FileText size={11} />
          </span>
          <span className="mail-file-name">
            {count} {count === 1 ? 'file' : 'files'}
          </span>
        </span>
      ) : null}
    </span>
  );
}

const COLUMNS: { id: TriageState | 'new'; title: string; hint: string }[] = [
  { id: 'new', title: 'New', hint: 'Not sorted yet' },
  { id: 'reply', title: TRIAGE_LABELS.reply, hint: 'Waiting on you' },
  { id: 'waiting', title: TRIAGE_LABELS.waiting, hint: 'Waiting on someone else' },
  { id: 'done', title: TRIAGE_LABELS.done, hint: 'Nothing left to do' },
];

/** The same messages as columns: what still needs you, and what does not. */
export function TriageBoard({ messages, selectedId, triage, onSelect }: BoardProps) {
  const now = new Date();
  return (
    <div className="grid h-full min-w-[640px] grid-cols-4 gap-3 p-3">
      {COLUMNS.map((column) => {
        const cards = messages.filter((message) =>
          column.id === 'new' ? !triage[message.id] : triage[message.id] === column.id,
        );
        return (
          <section
            key={column.id}
            aria-label={column.title}
            className="flex min-h-0 flex-col rounded-xl bg-surface-secondary/70"
          >
            <header className="px-3 pb-2 pt-3">
              <h3 className="flex items-center gap-2 text-[12.5px] font-semibold text-primary">
                {column.title}
                <span className="rounded-full bg-surface px-1.5 text-[10.5px] font-medium text-muted">
                  {cards.length}
                </span>
              </h3>
              <p className="text-[11px] text-muted">{column.hint}</p>
            </header>
            <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
              {cards.map((message) => {
                const sender = parseSender(message.sender);
                return (
                  <li key={message.id}>
                    <button
                      type="button"
                      onClick={() => onSelect(message.id)}
                      aria-label={messageLabel(message)}
                      aria-current={message.id === selectedId ? 'true' : undefined}
                      className={cn(
                        'w-full rounded-xl border bg-surface p-3 text-left shadow-soft transition',
                        message.id === selectedId
                          ? 'border-accent'
                          : 'border-transparent hover:-translate-y-0.5 hover:border-line-strong',
                      )}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span
                          className={cn(
                            'truncate text-[12px]',
                            message.read ? 'text-secondary' : 'font-semibold text-primary',
                          )}
                        >
                          {!message.read ? (
                            <span
                              aria-hidden
                              className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-accent align-middle"
                            />
                          ) : null}
                          {sender.name}
                        </span>
                        <span className="shrink-0 text-[10.5px] text-muted">
                          {formatReceived(message.receivedAt, now)}
                        </span>
                      </span>
                      <span className="mt-1 line-clamp-2 block text-[12.5px] font-medium leading-snug text-primary">
                        {message.subject || '(no subject)'}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
