import { useEffect, useState } from 'react';
import { Bell, BellOff, Clock, X } from 'lucide-react';
import { useReminderStore } from '@/features/reminders/store/reminderStore';
import { currentEvents, currentSchedule, historyAction } from '@/features/reminders/lib/runtime';
import { defaultRule } from '@/features/reminders/lib/engine';

export function ReminderHistoryPanel() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 10_000);
    return () => window.clearInterval(timer);
  }, []);
  const history = useReminderStore((s) => s.history);
  const error = useReminderStore((s) => s.error);
  const items = [...history].sort((a, b) => b.shownAt - a.shownAt).slice(0, 50);
  return (
    <div className="max-h-[420px] overflow-y-auto">
      {error && (
        <p role="alert" className="mb-3 rounded-xl bg-coral/10 p-3 text-xs text-coral">
          {error}
        </p>
      )}
      {!items.length && (
        <div className="py-8 text-center">
          <Bell size={26} className="mx-auto mb-3 text-muted" aria-hidden />
          <p className="text-sm font-medium">All clear for now</p>
          <p className="mt-2 text-xs leading-relaxed text-muted">
            Your calendar reminders will land here.
            <br />
            Open an event to choose when they arrive.
          </p>
        </div>
      )}
      {items.map((item) => {
        const active = currentSchedule().some((event) => event.id === item.id && event.at > now);
        return (
          <article key={item.id} className="border-b border-line-soft py-4 last:border-0">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-sm font-medium">{item.title}</h3>
              <span className="shrink-0 text-[10px] text-muted">
                {new Date(item.shownAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
              </span>
            </div>
            <p className="mt-1 text-xs text-secondary">
              {new Date(item.at).toLocaleString([], {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
            {item.snoozeUntil && active && (
              <p className="mt-2 text-xs text-accent">
                Snoozed until{' '}
                {new Date(item.snoozeUntil).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-muted">
              {!item.dismissed && (
                <button
                  type="button"
                  onClick={() => {
                    void historyAction(item.id, 'dismiss');
                  }}
                  className="inline-flex items-center gap-1 hover:text-primary"
                >
                  <X size={12} aria-hidden /> Dismiss
                </button>
              )}
              {active && item.at > now + 30 * 60_000 && (
                <button
                  type="button"
                  onClick={() => {
                    void historyAction(item.id, 'snooze');
                  }}
                  className="inline-flex items-center gap-1 hover:text-primary"
                >
                  <Clock size={12} aria-hidden /> Snooze 30 min
                </button>
              )}
              {active && (
                <button
                  type="button"
                  onClick={() => {
                    const state = useReminderStore.getState();
                    state.setRule(item.eventId, {
                      ...(state.rules[item.eventId] ??
                        defaultRule(
                          currentEvents().find((event) => event.id === item.eventId)?.kind ??
                            'personal',
                        )),
                      enabled: false,
                    });
                    void historyAction(item.id, 'dismiss');
                  }}
                  className="inline-flex items-center gap-1 hover:text-primary"
                >
                  <BellOff size={12} aria-hidden /> Mute this event
                </button>
              )}
              {item.dismissed && !item.snoozeUntil && <span>Dismissed</span>}
            </div>
          </article>
        );
      })}
    </div>
  );
}
