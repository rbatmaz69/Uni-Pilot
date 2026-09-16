import { Bell, Moon } from 'lucide-react';
import { useReminderStore } from '@/features/reminders/store/reminderStore';
import { nativeReminders } from '@/features/reminders/lib/runtime';

export function ReminderSettings() {
  const settings = useReminderStore((state) => state.settings);
  const setSettings = useReminderStore((state) => state.setSettings);
  const error = useReminderStore((state) => state.error);
  return (
    <section className="mt-5 max-w-3xl rounded-2xl border border-line p-6 sm:p-8">
      <div className="flex items-center gap-2">
        <Bell size={19} className="text-accent" aria-hidden />
        <h2 className="text-lg font-semibold tracking-tight">A heads-up, on your terms</h2>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-secondary">
        Choose individual timings in your calendar. Exams start with reminders one week, two days,
        and one hour before.
      </p>
      <label className="mt-5 flex items-center gap-3 text-sm font-medium">
        <input
          type="checkbox"
          checked={settings.enabled}
          onChange={(e) => setSettings({ enabled: e.target.checked })}
          className="accent-accent"
        />{' '}
        Calendar reminders
      </label>
      <div className="mt-5 border-t border-line-soft pt-5">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <Moon size={15} aria-hidden /> Quiet hours
        </h3>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="text-xs text-secondary">
            From{' '}
            <input
              aria-label="Quiet hours start"
              type="time"
              value={settings.quietStart}
              onChange={(e) => {
                if (e.target.value) setSettings({ quietStart: e.target.value });
              }}
              className="ml-2 rounded-lg border border-line bg-surface-secondary px-3 py-2 text-primary"
            />
          </label>
          <label className="text-xs text-secondary">
            Until{' '}
            <input
              aria-label="Quiet hours end"
              type="time"
              value={settings.quietEnd}
              onChange={(e) => {
                if (e.target.value) setSettings({ quietEnd: e.target.value });
              }}
              className="ml-2 rounded-lg border border-line bg-surface-secondary px-3 py-2 text-primary"
            />
          </label>
        </div>
        <p className="mt-2 text-xs text-muted">
          Deferred reminders arrive when you’re active again, if the event is still ahead. Set both
          times alike to turn quiet hours off.
        </p>
      </div>
      <p className="mt-5 rounded-xl bg-surface-secondary p-3 text-xs leading-relaxed text-secondary">
        {nativeReminders()
          ? 'Reminders keep running when you close the window. Use the Uni-Pilot Dock icon to reopen it. Quitting Uni-Pilot stops reminders until you launch it again.'
          : 'Reminders appear while you’re active in this app. The macOS desktop app can also show the airplane over other apps, with its window closed.'}{' '}
        Saved events do not need an internet connection.
      </p>
      {error && (
        <p role="alert" className="mt-3 text-xs text-coral">
          {error}
        </p>
      )}
    </section>
  );
}
