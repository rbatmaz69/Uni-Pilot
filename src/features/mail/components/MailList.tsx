import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Check, ListFilter, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MailMessage } from '@/features/mail/lib/appleMail';
import {
  filterLabel,
  type CourseRef,
  type FilterEntry,
  type FilterGroups,
  type MailFilter,
} from '@/features/mail/lib/mail';
import { MessageList } from '@/features/mail/components/MessageList';

interface Props {
  /** What the filter and the search leave of the inbox. */
  messages: MailMessage[];
  /** The whole inbox, before filter and search; `null` until Mail has answered. */
  inbox: readonly MailMessage[] | null;
  loading: boolean;
  groups: FilterGroups;
  refs: readonly CourseRef[];
  filter: MailFilter;
  onFilter: (filter: MailFilter) => void;
  query: string;
  onQuery: (query: string) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** In place of the list, e.g. the board while the panel is hidden. */
  children?: ReactNode;
  className?: string;
}

const isView = (filter: MailFilter) =>
  filter === 'all' || filter === 'unread' || filter === 'reply';

/**
 * The inbox as a column: the search, the three views (all, unread, to answer),
 * the filters by sender and course behind one button, the messages newest
 * first, and how many there are. It is the Mail panel when the panel is shown,
 * and the card's left column when it is hidden; the workspace keeps the filter
 * and the search, so they carry over.
 */
export function MailList({
  messages,
  inbox,
  loading,
  groups,
  refs,
  filter,
  onFilter,
  query,
  onQuery,
  selectedId,
  onSelect,
  children,
  className,
}: Props) {
  const narrowed = !isView(filter);
  return (
    <div className={cn('mail-list-pane', className)}>
      <div className="mail-list-controls">
        <div className="mail-search-row">
          <label className="mail-search">
            <Search size={16} strokeWidth={1.7} aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(event) => onQuery(event.target.value)}
              placeholder="Search your mail…"
              aria-label="Search mail"
            />
            {query && (
              <button type="button" aria-label="Clear search" onClick={() => onQuery('')}>
                <X size={14} aria-hidden />
              </button>
            )}
          </label>
          {groups.senders.length > 0 || groups.courses.length > 0 ? (
            <FilterMenu groups={groups} filter={filter} onFilter={onFilter} />
          ) : null}
        </div>
        <div role="group" aria-label="Show" className="mail-views">
          {groups.views.map((entry) => (
            <button
              key={entry.id}
              type="button"
              aria-current={filter === entry.id || undefined}
              aria-label={
                entry.id !== 'all' && entry.count > 0
                  ? `${entry.label} ${entry.count}`
                  : entry.label
              }
              onClick={() => onFilter(entry.id)}
            >
              {entry.label}
              {entry.id !== 'all' && entry.count > 0 ? (
                <span className="mail-view-count" aria-hidden>
                  {entry.count}
                </span>
              ) : null}
            </button>
          ))}
        </div>
        {narrowed && (
          <button
            type="button"
            className="mail-active-filter"
            aria-label={`Clear filter: ${filterLabel(filter, refs)}`}
            onClick={() => onFilter('all')}
          >
            <ListFilter size={12} aria-hidden />
            {filterLabel(filter, refs)}
            <X size={12} aria-hidden />
          </button>
        )}
      </div>
      <div className="mail-list-scroll scroll-area">
        {!inbox && loading ? (
          <p className="px-4 py-6 text-[13px] text-secondary">Asking Apple Mail…</p>
        ) : messages.length === 0 ? (
          <p className="px-4 py-6 text-[13px] text-secondary">
            {(inbox ?? []).length === 0 ? 'Your inbox is empty.' : 'Nothing here with this filter.'}
          </p>
        ) : (
          (children ?? (
            <MessageList messages={messages} selectedId={selectedId} onSelect={onSelect} />
          ))
        )}
      </div>
      <div className="mail-list-count">
        {messages.length} {messages.length === 1 ? 'message' : 'messages'}
        <span>Newest first</span>
      </div>
    </div>
  );
}

/**
 * Who wrote and which course, behind one button beside the search: the views
 * are what the student switches between all day, these are for now and then.
 */
function FilterMenu({
  groups,
  filter,
  onFilter,
}: {
  groups: FilterGroups;
  filter: MailFilter;
  onFilter: (filter: MailFilter) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const active = !isView(filter);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    const items = rootRef.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]');
    (rootRef.current?.querySelector<HTMLElement>('[aria-checked="true"]') ?? items?.[0])?.focus();
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open]);

  function close(restoreFocus: boolean) {
    setOpen(false);
    if (restoreFocus) buttonRef.current?.focus();
  }

  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const items = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitemradio"]'),
    );
    const index = items.indexOf(document.activeElement as HTMLElement);
    const focus = (next: number) => {
      event.preventDefault();
      items[(next + items.length) % items.length]?.focus();
    };
    switch (event.key) {
      case 'ArrowDown':
        return focus(index + 1);
      case 'ArrowUp':
        return focus(index === -1 ? items.length - 1 : index - 1);
      case 'Home':
        return focus(0);
      case 'End':
        return focus(items.length - 1);
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        return close(true);
      case 'Tab':
        return close(false);
    }
  }

  const item = (entry: FilterEntry) => {
    const current = filter === entry.id;
    return (
      <button
        key={entry.id}
        type="button"
        role="menuitemradio"
        aria-checked={current}
        aria-label={`${entry.label} ${entry.count}`}
        tabIndex={-1}
        className={cn('mail-filter-item', current && 'is-current')}
        onClick={() => {
          close(true);
          onFilter(current ? 'all' : entry.id);
        }}
      >
        <span className="mail-filter-name">{entry.label}</span>
        <span className="mail-filter-count">{entry.count}</span>
        {current ? <Check size={13} aria-hidden /> : null}
      </button>
    );
  };

  return (
    <div ref={rootRef} className="mail-filter">
      <button
        ref={buttonRef}
        type="button"
        className={cn('mail-filter-button', active && 'is-active')}
        aria-label="Filter by sender or course"
        title="Filter by sender or course"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen(!open)}
      >
        <ListFilter size={15} strokeWidth={1.8} aria-hidden />
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label="Filter by sender or course"
          className="mail-filter-menu"
          onKeyDown={onMenuKeyDown}
        >
          {groups.senders.length > 0 ? (
            <div role="group" aria-label="Senders">
              <p className="mail-filter-heading" aria-hidden>
                Senders
              </p>
              {groups.senders.map(item)}
            </div>
          ) : null}
          {groups.courses.length > 0 ? (
            <div role="group" aria-label="Courses">
              <p className="mail-filter-heading" aria-hidden>
                Courses
              </p>
              {groups.courses.map(item)}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
