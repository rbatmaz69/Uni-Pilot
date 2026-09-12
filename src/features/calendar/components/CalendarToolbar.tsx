import { useEffect, useId, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Plus,
  Rss,
  SlidersHorizontal,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  EVENT_KINDS,
  EVENT_KIND_ORDER,
  type CalendarEventKind,
  type CalendarView,
} from '@/features/calendar/lib/types';

export interface KindFilterOption {
  kind: CalendarEventKind;
  count: number;
}

export interface WeekSummary {
  /** Timetabled entries in view, deadlines excluded. */
  sessions: number;
  contactMinutes: number;
  nextDeadline: string | null;
}

interface CalendarToolbarProps {
  monthLabel: string;
  rangeLabel: string;
  relativeLabel: string;
  weekNumber: number;
  view: CalendarView;
  summary: WeekSummary;
  filters: readonly KindFilterOption[];
  activeKinds: ReadonlySet<CalendarEventKind>;
  onViewChange: (view: CalendarView) => void;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
  onToggleKind: (kind: CalendarEventKind) => void;
  onClearFilters: () => void;
  onNewEvent: () => void;
  onOpenSources: () => void;
  /** Subscriptions and imported files currently feeding the grid. */
  sourceCount: number;
}

export function CalendarToolbar({
  monthLabel,
  rangeLabel,
  relativeLabel,
  view,
  filters,
  activeKinds,
  onViewChange,
  onPrevious,
  onNext,
  onToday,
  onToggleKind,
  onClearFilters,
  onNewEvent,
  onOpenSources,
  sourceCount,
}: CalendarToolbarProps) {
  const unit = view === 'week' ? 'week' : 'day';
  const [panel, setPanel] = useState<'filters' | 'options' | null>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelId = useId();
  const control =
    'inline-flex h-8 items-center justify-center rounded-md text-secondary transition-colors hover:bg-surface-hover hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2';
  const row =
    'flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-2 text-left text-[12px] transition-colors hover:bg-surface-hover focus-visible:outline-2';

  useEffect(() => {
    if (!panel) return;
    if (panel === 'filters') {
      actionsRef.current?.querySelector<HTMLButtonElement>('[role="region"] button')?.focus();
    }
    const outside = (event: MouseEvent) => {
      if (event.target instanceof Node && !actionsRef.current?.contains(event.target))
        setPanel(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setPanel(null);
      triggerRef.current?.focus();
    };
    window.addEventListener('mousedown', outside);
    window.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('mousedown', outside);
      window.removeEventListener('keydown', escape);
    };
  }, [panel]);

  return (
    <section
      aria-label="Calendar controls"
      className="relative z-50 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 bg-surface px-4 py-2"
    >
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-1" role="group" aria-label="Date navigation">
          <button
            type="button"
            onClick={onToday}
            title="Jump to today (T)"
            className={cn(control, 'mr-1.5 border border-line px-3.5 text-[12px] font-medium')}
          >
            Today
          </button>
          <button
            type="button"
            aria-label={`Previous ${unit}`}
            title={`Previous ${unit} (←)`}
            onClick={onPrevious}
            className={cn(control, 'w-7')}
          >
            <ChevronLeft size={16} aria-hidden />
          </button>
          <button
            type="button"
            aria-label={`Next ${unit}`}
            title={`Next ${unit} (→)`}
            onClick={onNext}
            className={cn(control, 'w-7')}
          >
            <ChevronRight size={16} aria-hidden />
          </button>
        </div>
        <h2
          aria-label={rangeLabel}
          title={rangeLabel}
          className="text-[17px] font-semibold tracking-[-0.025em] text-primary"
        >
          {monthLabel}
        </h2>
        <span className="sr-only">{relativeLabel}</span>
      </div>

      <div
        ref={actionsRef}
        className="relative ml-auto flex items-center gap-1.5"
        onBlur={(event) => {
          if (
            event.relatedTarget instanceof Node &&
            !event.currentTarget.contains(event.relatedTarget)
          )
            setPanel(null);
        }}
      >
        <button
          type="button"
          aria-label="Calendar options"
          title="Calendar options"
          aria-expanded={panel !== null}
          aria-controls={panel ? panelId : undefined}
          onClick={(event) => {
            triggerRef.current = event.currentTarget;
            setPanel(panel ? null : 'options');
          }}
          className={cn(control, 'gap-3 border border-line px-3 text-[12px] font-medium')}
        >
          <span>{view === 'week' ? 'Week' : 'Day'}</span>
          {activeKinds.size > 0 ? (
            <span className="h-1.5 w-1.5 rounded-full bg-accent" title="Event filters active" />
          ) : null}
          <ChevronDown size={14} strokeWidth={1.7} aria-hidden />
        </button>

        {panel ? (
          <div
            id={panelId}
            role="region"
            aria-label={panel === 'filters' ? 'Event filters' : 'Calendar options'}
            className="absolute right-0 top-full z-50 mt-2 w-[224px] rounded-lg border border-line bg-surface p-1.5 shadow-raised"
          >
            {panel === 'options' ? (
              <>
                <p className="px-2.5 pb-1 pt-2 text-[11px] text-muted">View</p>
                <div role="group" aria-label="Calendar view">
                  {(['day', 'week'] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={view === option}
                      onClick={() => {
                        onViewChange(option);
                        setPanel(null);
                        triggerRef.current?.focus();
                      }}
                      className={cn(row, view === option ? 'text-accent' : 'text-secondary')}
                    >
                      <span>{option === 'day' ? 'Day' : 'Week'}</span>
                      {view === option ? <Check size={14} aria-hidden /> : null}
                    </button>
                  ))}
                </div>
                <div className="my-1 border-t border-line-soft" />
                <button
                  type="button"
                  onClick={() => {
                    setPanel(null);
                    triggerRef.current?.focus();
                    onNewEvent();
                  }}
                  className={cn(row, 'text-secondary')}
                >
                  <span className="flex items-center gap-2">
                    <Plus size={14} aria-hidden />
                    New event
                  </span>
                  <span aria-hidden className="text-[10px] text-muted">
                    N
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setPanel('filters')}
                  className={cn(row, activeKinds.size > 0 ? 'text-accent' : 'text-secondary')}
                >
                  <span className="flex items-center gap-2">
                    <SlidersHorizontal size={14} aria-hidden />
                    Filter
                  </span>
                  {activeKinds.size > 0 ? (
                    <span className="text-[11px] tabular-nums">{activeKinds.size}</span>
                  ) : (
                    <ChevronRight size={13} aria-hidden />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setPanel(null);
                    triggerRef.current?.focus();
                    onOpenSources();
                  }}
                  className={cn(row, 'text-secondary')}
                >
                  <span className="flex items-center gap-2">
                    <Rss size={14} aria-hidden />
                    Sources
                  </span>
                  {sourceCount > 0 ? (
                    <span className="text-[11px] tabular-nums text-muted">{sourceCount}</span>
                  ) : null}
                </button>
              </>
            ) : (
              <>
                <p className="px-2.5 pb-1 pt-2 text-[11px] text-muted">Show events</p>
                <button
                  type="button"
                  aria-pressed={activeKinds.size === 0}
                  onClick={onClearFilters}
                  className={cn(row, activeKinds.size === 0 ? 'text-accent' : 'text-secondary')}
                >
                  <span>All</span>
                  {activeKinds.size === 0 ? <Check size={14} aria-hidden /> : null}
                </button>
                {EVENT_KIND_ORDER.map((kind) => {
                  const config = EVENT_KINDS[kind];
                  const active = activeKinds.has(kind);
                  const count = filters.find((filter) => filter.kind === kind)?.count ?? 0;
                  return (
                    <button
                      key={kind}
                      type="button"
                      aria-pressed={active}
                      onClick={() => onToggleKind(kind)}
                      className={cn(row, active ? 'text-accent' : 'text-secondary')}
                    >
                      <span className="flex items-center gap-2">
                        <config.icon size={13} aria-hidden />
                        {config.plural}
                      </span>
                      <span className="flex items-center gap-2">
                        {count > 0 ? (
                          <span className="text-[11px] tabular-nums text-muted">{count}</span>
                        ) : null}
                        {active ? <Check size={14} aria-hidden /> : null}
                      </span>
                    </button>
                  );
                })}
              </>
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}
