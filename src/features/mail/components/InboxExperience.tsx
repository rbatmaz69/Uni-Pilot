import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from 'react';
import {
  Columns3,
  Check,
  ChevronDown,
  Inbox,
  X,
  Mail,
  MailPlus,
  MonitorSmartphone,
  RefreshCw,
  Rows3,
  Search,
  ShieldQuestion,
} from 'lucide-react';
import { Button, IconButton } from '@/components/ui';
import { isDesktopRuntime } from '@/lib/icsFetch';
import { cn } from '@/lib/utils';
import { useIliasStore } from '@/features/integrations/store/iliasStore';
import { useCourseStore } from '@/features/courses/store/courseStore';
import { launchMail, type MailFailure, type MailMessage } from '@/features/mail/lib/appleMail';
import {
  CATEGORY_LABELS,
  categoryOf,
  courseFor,
  courseRefs,
  formatChecked,
  matchesFilter,
  matchesSearch,
  universityDomain,
  type CourseRef,
  type MailCategory,
  type MailFilter,
  type TriageState,
} from '@/features/mail/lib/mail';
import { useMailStore } from '@/features/mail/store/mailStore';
import { ComposeDialog } from '@/features/mail/components/ComposeDialog';
import '@/features/mail/mail.css';
import { MessageList, TriageBoard } from '@/features/mail/components/MessageList';
import { ReadingPane } from '@/features/mail/components/ReadingPane';

/** Opening the page or coming back to the window asks Mail again only after this long. */
const REFRESH_GAP_MS = 60_000;

/**
 * The university inbox, through Apple Mail: sorted by who wrote and which
 * course it is about, readable here, answered in Mail. Replies open in Mail as
 * drafts; a new message is sent through Mail once the student confirms it.
 */
export function InboxExperience() {
  const domain = universityDomain(useIliasStore((state) => state.connection?.baseUrl));
  const accounts = useMailStore((state) => state.accounts);
  const account = useMailStore((state) => state.account);
  const failure = useMailStore((state) => state.failure);
  const refresh = useMailStore((state) => state.refresh);

  useEffect(() => {
    if (!isDesktopRuntime()) return;
    // Mail may have new messages whenever the student opens the Inbox or comes
    // back to Uni Pilot — but a list from a moment ago stands: Mail answers one
    // question at a time, and a click on a message would wait behind it.
    const again = () => {
      const { loading, checkedAt, account, messages, failure } = useMailStore.getState();
      const recent =
        account !== null &&
        messages !== null &&
        failure === null &&
        checkedAt !== null &&
        Date.now() - Date.parse(checkedAt) < REFRESH_GAP_MS;
      if (loading || recent) return;
      void useMailStore.getState().refresh(domain);
    };
    again();
    window.addEventListener('focus', again);
    return () => window.removeEventListener('focus', again);
  }, [domain]);

  if (!isDesktopRuntime()) {
    return (
      <Notice icon={MonitorSmartphone} title="Your mail comes through the desktop app">
        Uni Pilot reads your university mail through Apple Mail on your Mac. Open Uni Pilot there to
        see it.
      </Notice>
    );
  }
  if (failure && failure.kind !== 'noAccount' && failure.kind !== 'noMessage') {
    return <FailureState failure={failure} onRetry={() => void refresh(domain)} />;
  }
  if (accounts && !account) return <AccountChoice domain={domain} />;
  return <MailWorkspace domain={domain} />;
}

interface Chip {
  id: MailFilter;
  label: string;
  count: number;
}

function chipsFor(
  messages: readonly MailMessage[],
  domain: string | null,
  refs: readonly CourseRef[],
  triage: Readonly<Record<string, TriageState>>,
): Chip[] {
  const count = (test: (message: MailMessage) => boolean) => messages.filter(test).length;
  const chips: Chip[] = [
    { id: 'all', label: 'All', count: messages.length },
    { id: 'unread', label: 'Unread', count: count((message) => !message.read) },
    {
      id: 'reply',
      label: 'Needs reply',
      count: count((message) => triage[message.id] === 'reply'),
    },
  ];
  for (const category of ['university', 'ilias', 'students'] as MailCategory[]) {
    chips.push({
      id: category,
      label: CATEGORY_LABELS[category],
      count: count((message) => categoryOf(message, domain) === category),
    });
  }
  // The courses the inbox talks about most, by how often.
  const byCourse = new Map<string, { ref: CourseRef; count: number }>();
  for (const message of messages) {
    const course = courseFor(message, refs);
    if (!course) continue;
    const known = byCourse.get(course.refId);
    byCourse.set(course.refId, { ref: course, count: (known?.count ?? 0) + 1 });
  }
  for (const { ref, count: n } of [...byCourse.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 4)) {
    chips.push({ id: `course:${ref.refId}`, label: ref.key, count: n });
  }
  return chips.filter((chip) => chip.id === 'all' || chip.count > 0);
}

function summaryOf(
  messages: readonly MailMessage[] | null,
  domain: string | null,
  triage: Readonly<Record<string, TriageState>>,
): string {
  if (!messages) return 'Asking Apple Mail…';
  const unread = messages.filter((message) => !message.read);
  const fromUniversity = unread.filter((message) => categoryOf(message, domain) === 'university');
  const toAnswer = messages.filter((message) => triage[message.id] === 'reply').length;
  if (unread.length === 0 && toAnswer === 0) return 'All caught up';
  const parts = [`${unread.length} unread`];
  if (fromUniversity.length > 0) parts.push(`${fromUniversity.length} from the university`);
  if (toAnswer > 0) parts.push(`${toAnswer} to answer`);
  return parts.join(' · ');
}

export function MailWorkspace({ domain }: { domain: string | null }) {
  const account = useMailStore((state) => state.account);
  const messages = useMailStore((state) => state.messages);
  const checkedAt = useMailStore((state) => state.checkedAt);
  const loading = useMailStore((state) => state.loading);
  const selectedId = useMailStore((state) => state.selectedId);
  const triage = useMailStore((state) => state.triage);
  const view = useMailStore((state) => state.view);
  const accounts = useMailStore((state) => state.accounts);
  const courses = useCourseStore((state) => state.courses?.items);
  const [filter, setFilter] = useState<MailFilter>('all');
  const [query, setQuery] = useState('');
  const [composing, setComposing] = useState(false);

  const refs = useMemo(() => courseRefs(courses ?? []), [courses]);
  const all = messages ?? [];
  const chips = chipsFor(all, domain, refs, triage);
  const shown = all.filter(
    (message) =>
      matchesFilter(message, filter, { domain, refs, triage }) && matchesSearch(message, query),
  );
  const summary = summaryOf(messages, domain, triage);
  const { refresh, select, setView } = useMailStore.getState();
  const now = new Date();

  return (
    <div className="mail-workspace" data-view={view} data-selected={Boolean(selectedId)}>
      <header className="mail-workspace-header">
        <div className="mail-heading">
          <span className="mail-heading-icon">
            <Inbox size={21} strokeWidth={1.6} aria-hidden />
          </span>
          <div>
            <p className="mail-heading-title">Your inbox</p>
            <h2 className="mail-summary" aria-live="polite">
              {summary}
            </h2>
          </div>
        </div>
        <div className="mail-header-actions">
          <div role="group" aria-label="View" className="mail-view-toggle">
            {(
              [
                ['list', 'List', Rows3],
                ['board', 'Board', Columns3],
              ] as const
            ).map(([id, label, Icon]) => (
              <button
                key={id}
                type="button"
                aria-pressed={view === id}
                onClick={() => setView(id)}
                className={cn(
                  'flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium transition-colors',
                  view === id
                    ? 'bg-surface-secondary text-primary'
                    : 'text-muted hover:text-primary',
                )}
              >
                <Icon size={13} strokeWidth={1.8} aria-hidden />
                {label}
              </button>
            ))}
          </div>

          <IconButton
            label="Refresh"
            size="sm"
            disabled={loading}
            onClick={() => void refresh(domain)}
          >
            <RefreshCw
              size={15}
              strokeWidth={1.8}
              aria-hidden
              className={cn(loading && 'animate-spin')}
            />
          </IconButton>
          <Button
            variant="primary"
            size="sm"
            className="mail-compose-button"
            onClick={() => setComposing(true)}
            leadingIcon={<MailPlus size={14} strokeWidth={1.8} aria-hidden />}
          >
            New message
          </Button>
        </div>
      </header>

      <div className={cn('mail-panes', view === 'board' && selectedId && 'mail-panes--board-open')}>
        <div className={cn('mail-list-pane', selectedId && 'max-lg:hidden')}>
          <div className="mail-list-controls">
            <label className="mail-search">
              <Search size={16} strokeWidth={1.7} aria-hidden />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search your mail…"
                aria-label="Search mail"
              />
              {query && (
                <button type="button" aria-label="Clear search" onClick={() => setQuery('')}>
                  <X size={14} aria-hidden />
                </button>
              )}
            </label>
            <div role="group" aria-label="Show" className="mail-filters">
              {chips
                .filter((chip) => ['all', 'unread', 'reply'].includes(chip.id))
                .map((chip) => (
                  <button
                    key={chip.id}
                    type="button"
                    aria-pressed={filter === chip.id}
                    onClick={() => setFilter(chip.id)}
                  >
                    {chip.label}
                    {chip.id !== 'all' && <span>{chip.count}</span>}
                  </button>
                ))}
              <details
                className="mail-filter-menu"
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.currentTarget.removeAttribute('open');
                    event.currentTarget.querySelector('summary')?.focus();
                  }
                }}
              >
                <summary aria-label="Filter by sender or course" title="Filter by sender or course">
                  <span>{!['all', 'unread', 'reply'].includes(filter) ? 'Filtered' : 'More'}</span>
                  <ChevronDown size={12} aria-hidden />
                </summary>
                <div className="mail-filter-options">
                  <p>Sender &amp; course</p>
                  {chips
                    .filter((chip) => !['all', 'unread', 'reply'].includes(chip.id))
                    .map((chip) => (
                      <button
                        key={chip.id}
                        type="button"
                        aria-pressed={filter === chip.id}
                        onClick={(event) => {
                          setFilter(chip.id);
                          const menu = event.currentTarget.closest('details');
                          menu?.removeAttribute('open');
                          menu?.querySelector('summary')?.focus();
                        }}
                      >
                        {chip.label}
                        <span>{chip.count}</span>
                      </button>
                    ))}
                </div>
              </details>
            </div>
            {!['all', 'unread', 'reply'].includes(filter) && (
              <button type="button" className="mail-active-filter" onClick={() => setFilter('all')}>
                {chips.find((chip) => chip.id === filter)?.label ?? 'Course filter'}
                <X size={12} aria-hidden />
                <span className="sr-only">Clear filter</span>
              </button>
            )}
          </div>
          <div className="mail-list-scroll scroll-area">
            {!messages && loading ? (
              <p className="px-4 py-6 text-[13px] text-secondary">Asking Apple Mail…</p>
            ) : shown.length === 0 ? (
              <p className="px-4 py-6 text-[13px] text-secondary">
                {all.length === 0 ? 'Your inbox is empty.' : 'Nothing here with this filter.'}
              </p>
            ) : view === 'board' ? (
              <TriageBoard
                messages={shown}
                selectedId={selectedId}
                triage={triage}
                onSelect={(id) => void select(id)}
              />
            ) : (
              <MessageList
                messages={shown}
                selectedId={selectedId}
                onSelect={(id) => void select(id)}
              />
            )}
          </div>
          <div className="mail-list-count">
            {shown.length} {shown.length === 1 ? 'message' : 'messages'}
            <span>Newest first</span>
          </div>
        </div>
        <div
          className={cn(
            'mail-reading-pane scroll-area',
            !selectedId && 'max-lg:hidden',
            view === 'board' && !selectedId && 'lg:hidden',
          )}
        >
          <ReadingPane key={selectedId ?? 'empty'} domain={domain} refs={refs} summary={summary} />
        </div>
      </div>

      <footer className="mail-status">
        <span className="mail-connection">
          <Check size={12} aria-hidden />
          {account ? `${account} · Apple Mail` : 'Apple Mail'}
        </span>
        <span className="mail-freshness">
          {loading ? 'Asking Mail…' : formatChecked(checkedAt, now)}
        </span>
        {accounts && accounts.length > 1 && (
          <button type="button" onClick={() => useMailStore.getState().chooseAccount(null)}>
            Switch account
          </button>
        )}
      </footer>

      {composing ? <ComposeDialog onClose={() => setComposing(false)} /> : null}
    </div>
  );
}

function AccountChoice({ domain }: { domain: string | null }) {
  const accounts = useMailStore((state) => state.accounts) ?? [];
  const choose = (name: string) => {
    useMailStore.getState().chooseAccount(name);
    void useMailStore.getState().refresh(domain);
  };

  if (accounts.length === 0) {
    return (
      <Notice icon={Mail} title="Add your university account to Apple Mail">
        Uni Pilot reads your mail through Apple Mail. In Mail, choose Settings → Accounts → + →
        Microsoft Exchange with your university address and Sign In, then come back here.
      </Notice>
    );
  }

  return (
    <section aria-labelledby="mail-account" className="flex flex-col gap-3">
      <h2 id="mail-account" className="text-[14px] font-semibold text-primary">
        Which Mail account is your university&apos;s?
      </h2>
      <p className="text-[12.5px] text-secondary">
        Uni Pilot found no address at {domain ?? 'your university'} in Apple Mail. Choose the
        account to read.
      </p>
      <ul className="flex flex-col gap-2">
        {accounts.map((known) => (
          <li key={known.name}>
            <Button onClick={() => choose(known.name)}>
              {known.name}
              {known.addresses[0] ? ` · ${known.addresses[0]}` : ''}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function FailureState({ failure, onRetry }: { failure: MailFailure; onRetry: () => void }) {
  if (failure.kind === 'notRunning') {
    return (
      <Notice
        icon={Mail}
        title="Apple Mail is not open"
        action={
          <Button
            variant="primary"
            onClick={() =>
              void launchMail()
                .catch(() => undefined)
                .then(() => setTimeout(onRetry, 2500))
            }
          >
            Open Mail
          </Button>
        }
      >
        Uni Pilot reads your inbox through Apple Mail and does not start it on its own.
      </Notice>
    );
  }
  if (failure.kind === 'notAllowed') {
    return (
      <Notice
        icon={ShieldQuestion}
        title="Allow Uni Pilot to ask Apple Mail"
        action={<Button onClick={onRetry}>Try again</Button>}
      >
        macOS asks once whether Uni Pilot may control Mail. If you said no, turn it on in System
        Settings → Privacy &amp; Security → Automation → Uni Pilot → Mail. Your mail stays on this
        Mac, and Uni Pilot never sends mail itself.
      </Notice>
    );
  }
  if (failure.kind === 'unsupported') {
    return (
      <Notice icon={MonitorSmartphone} title="University mail needs a Mac for now">
        {failure.message}
      </Notice>
    );
  }
  return (
    <Notice
      icon={Mail}
      title="Apple Mail did not answer"
      action={<Button onClick={onRetry}>Try again</Button>}
    >
      {failure.message}
    </Notice>
  );
}

function Notice({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-[300px] flex-col items-center justify-center rounded-2xl border border-line-soft bg-surface-secondary/50 px-6 py-14 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-2xl border border-line bg-surface text-accent shadow-soft">
        <Icon size={24} strokeWidth={1.4} />
      </span>
      <h2 className="mt-6 text-lg font-semibold tracking-tight">{title}</h2>
      <p className="mt-2 max-w-md text-[13px] leading-relaxed text-secondary">{children}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
