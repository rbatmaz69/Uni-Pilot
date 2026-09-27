import { Paperclip } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MailMessage } from '@/features/mail/lib/appleMail';
import {
  CATEGORY_LABELS,
  TRIAGE_LABELS,
  categoryOf,
  courseFor,
  formatReceived,
  groupByDay,
  parseSender,
  toneFor,
  type CourseRef,
  type TriageState,
} from '@/features/mail/lib/mail';
import { MailAvatar } from '@/features/mail/components/MailAvatar';

interface ListProps {
  messages: MailMessage[];
  selectedId: string | null;
  domain: string | null;
  refs: readonly CourseRef[];
  triage: Readonly<Record<string, TriageState>>;
  onSelect: (id: string) => void;
}

/** What a screen reader hears for a message, and what the tests find it by. */
function messageLabel(message: MailMessage): string {
  return `${message.read ? '' : 'Unread: '}${message.subject || '(no subject)'}, from ${parseSender(message.sender).name}`;
}

/** Newest first, under Today, Yesterday, This week and Earlier. */
export function MessageList({ messages, selectedId, domain, refs, triage, onSelect }: ListProps) {
  const now = new Date();
  const groups = groupByDay(messages, now);
  return (
    <div role="region" aria-label="Messages">
      {groups.map((group) => (
        <section key={group.label} aria-label={group.label}>
          <h3 className="sticky top-0 z-10 border-b border-line-soft bg-surface/95 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted backdrop-blur">
            {group.label}
          </h3>
          <ul className="divide-y divide-line-soft">
            {group.messages.map((message) => (
              <MessageRow
                key={message.id}
                message={message}
                selected={message.id === selectedId}
                course={courseFor(message, refs)}
                category={categoryOf(message, domain)}
                triage={triage[message.id] ?? null}
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
  course: CourseRef | null;
  category: ReturnType<typeof categoryOf>;
  triage: TriageState | null;
  now: Date;
  onSelect: () => void;
}

function MessageRow({ message, selected, course, category, triage, now, onSelect }: RowProps) {
  const sender = parseSender(message.sender);
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-label={messageLabel(message)}
        aria-current={selected ? 'true' : undefined}
        className={cn(
          'relative flex w-full gap-3 px-4 py-3.5 text-left transition-colors',
          selected ? 'bg-accent-soft' : 'hover:bg-surface-hover',
        )}
      >
        {!message.read ? (
          <span
            aria-hidden
            className="absolute bottom-3 left-0 top-3 w-[3px] rounded-r-full bg-accent"
          />
        ) : null}
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
          {message.snippet ? (
            <span className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-muted">
              {message.snippet}
            </span>
          ) : null}
          <Tags
            course={course}
            category={category}
            triage={triage}
            attachments={message.attachments}
          />
        </span>
      </button>
    </li>
  );
}

function Tags({
  course,
  category,
  triage,
  attachments,
}: {
  course: CourseRef | null;
  category: ReturnType<typeof categoryOf>;
  triage: TriageState | null;
  attachments: number;
}) {
  if (!course && category !== 'ilias' && !triage && attachments === 0) return null;
  return (
    <span className="mt-2 flex flex-wrap items-center gap-1.5">
      {course ? (
        <span
          className={cn('rounded-full px-2 py-0.5 text-[10.5px] font-medium', toneFor(course.key))}
        >
          {course.key}
        </span>
      ) : null}
      {category === 'ilias' ? (
        <span className="rounded-full bg-blue-soft px-2 py-0.5 text-[10.5px] font-medium text-blue">
          {CATEGORY_LABELS.ilias}
        </span>
      ) : null}
      {triage ? (
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-[10.5px] font-medium',
            triage === 'reply' && 'bg-orange-soft text-orange',
            triage === 'waiting' && 'bg-lavender-soft text-lavender',
            triage === 'done' && 'bg-green-soft text-green',
          )}
        >
          {TRIAGE_LABELS[triage]}
        </span>
      ) : null}
      {attachments > 0 ? (
        <span className="flex items-center gap-0.5 text-[11px] text-muted">
          <Paperclip size={12} strokeWidth={1.8} aria-hidden />
          {attachments}
          <span className="sr-only">{attachments === 1 ? ' attachment' : ' attachments'}</span>
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
export function TriageBoard({ messages, selectedId, refs, triage, onSelect }: ListProps) {
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
                const course = courseFor(message, refs);
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
                      {course ? (
                        <span
                          className={cn(
                            'mt-2 inline-block rounded-full px-2 py-0.5 text-[10.5px] font-medium',
                            toneFor(course.key),
                          )}
                        >
                          {course.key}
                        </span>
                      ) : null}
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
