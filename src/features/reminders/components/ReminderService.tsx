import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell } from 'lucide-react';
import { useSourceStore } from '@/features/calendar/store/sourceStore';
import { useEventStore } from '@/features/calendar/store/eventStore';
import { nextReminder, timingLabel, type ScheduledReminder } from '@/features/reminders/lib/engine';
import { useReminderStore } from '@/features/reminders/store/reminderStore';
import {
  currentSchedule,
  nativeReminders,
  nativeRequest,
  previewPayload,
  saveDelivery,
} from '@/features/reminders/lib/runtime';

/** Mounted with the app, not a route: navigation cannot stop the scheduler. */
export function ReminderService() {
  const [shown, setShown] = useState<ScheduledReminder | null>(null);
  useEffect(() => {
    let alive = true;
    let busy = false;
    let revision = 1;
    let synced = 0;
    let lastActivity = Date.now();
    let lastRefresh = 0;
    const activity = () => {
      lastActivity = Date.now();
    };
    const run = async () => {
      if (busy || !alive) return;
      busy = true;
      try {
        const state = useReminderStore.getState();
        const preview = state.preview;
        if (preview) useReminderStore.setState({ preview: null });
        if (nativeReminders()) {
          if (synced !== revision) {
            const version = revision;
            const history = await nativeRequest({
              command: 'sync',
              events: currentSchedule(),
              settings: state.settings,
            });
            if (!alive) return;
            useReminderStore.setState({ history, error: null });
            synced = version;
          } else {
            const history = await nativeRequest({ command: 'history' });
            if (!alive) return;
            useReminderStore.setState({ history, error: null });
          }
          if (preview) await nativeRequest(previewPayload(preview));
        } else {
          if (preview) setShown(preview);
          else {
            const due = nextReminder(
              currentSchedule(),
              state.history,
              new Date(),
              state.settings,
              document.visibilityState === 'visible' && Date.now() - lastActivity < 5 * 60_000,
            );
            if (due) {
              saveDelivery(due.record);
              setShown(due.event);
            }
          }
        }
        if (Date.now() - lastRefresh > 5 * 60_000) {
          lastRefresh = Date.now();
          useSourceStore.getState().refreshStale();
        }
      } catch (cause) {
        synced = 0;
        if (alive)
          useReminderStore.setState({
            error:
              typeof cause === 'string'
                ? cause
                : 'Desktop reminders could not start. Reopen Uni-Pilot to retry.',
          });
      } finally {
        busy = false;
      }
    };
    const changed = () => {
      revision++;
      void run();
    };
    const unsubEvents = useEventStore.subscribe(changed);
    const unsubSources = useSourceStore.subscribe((state, previous) => {
      if (state.sources !== previous.sources) changed();
    });
    const unsubReminders = useReminderStore.subscribe((state, previous) => {
      if (state.rules !== previous.rules || state.settings !== previous.settings) changed();
      else if (state.preview && state.preview !== previous.preview) void run();
    });
    const wake = () => {
      activity();
      void run();
    };
    window.addEventListener('pointerdown', activity);
    window.addEventListener('keydown', activity);
    window.addEventListener('pointermove', activity);
    window.addEventListener('focus', wake);
    document.addEventListener('visibilitychange', wake);
    const timer = window.setInterval(() => {
      void run();
    }, 10_000);
    void run();
    return () => {
      alive = false;
      window.clearInterval(timer);
      unsubEvents();
      unsubSources();
      unsubReminders();
      window.removeEventListener('pointerdown', activity);
      window.removeEventListener('keydown', activity);
      window.removeEventListener('pointermove', activity);
      window.removeEventListener('focus', wake);
      document.removeEventListener('visibilitychange', wake);
    };
  }, []);

  useEffect(() => {
    if (!shown) return;
    const timer = window.setTimeout(() => setShown(null), 8000);
    return () => window.clearTimeout(timer);
  }, [shown]);

  if (!shown) return null;
  return createPortal(
    <div
      className={`reminder-overlay ${shown.style === 'airplane' ? 'reminder-flight' : 'reminder-quiet'}`}
      role="status"
      aria-live="polite"
    >
      <div className="reminder-banner">
        <span className="reminder-eyebrow">UNI PILOT · {timingLabel(shown.at)}</span>
        <strong>{shown.title}</strong>
        <span>
          {new Date(shown.at).toLocaleString([], {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      </div>
      {shown.style === 'airplane' ? (
        <img src="/reminders/plane.png" alt="" className="reminder-plane" />
      ) : (
        <Bell size={24} aria-hidden />
      )}
    </div>,
    document.body,
  );
}
