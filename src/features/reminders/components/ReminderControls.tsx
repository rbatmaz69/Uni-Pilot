import { useId, useState } from 'react';
import { Bell, Plane, Play, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { defaultRule, offsetLabel, type ReminderRule } from '@/features/reminders/lib/engine';
import type { CalendarEvent } from '@/features/calendar/lib/types';
import { useReminderStore } from '@/features/reminders/store/reminderStore';
import { previewEvent } from '@/features/reminders/lib/runtime';

const PRESETS = [10080, 4320, 2880, 1440, 120, 60, 30, 15, 0];
const FIELD =
  'rounded-lg border border-line bg-surface px-2.5 py-2 text-xs text-primary focus:outline-accent';

export function ReminderControls({
  value,
  onChange,
  onPreview,
}: {
  value: ReminderRule;
  onChange: (rule: ReminderRule) => void;
  onPreview: () => void;
}) {
  const id = useId();
  const [amount, setAmount] = useState('4');
  const [unit, setUnit] = useState(1440);
  const [error, setError] = useState('');
  const patch = (change: Partial<ReminderRule>) => onChange({ ...value, ...change });
  const toggle = (minutes: number) =>
    patch({
      offsets: value.offsets.includes(minutes)
        ? value.offsets.filter((offset) => offset !== minutes)
        : [...value.offsets, minutes].sort((a, b) => b - a),
    });

  return (
    <section
      className="mt-5 rounded-xl border border-line bg-surface-secondary p-4"
      aria-label="Event reminders"
    >
      <div className="flex items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-[13px] font-semibold">
          <input
            type="checkbox"
            checked={value.enabled}
            onChange={(e) => patch({ enabled: e.target.checked })}
            className="accent-accent"
          />
          Reminders
        </label>
        <button
          type="button"
          onClick={onPreview}
          className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
        >
          <Play size={12} aria-hidden /> Preview
        </button>
      </div>
      <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted">
        A little heads-up, right when you need it.
      </p>
      {value.enabled && (
        <>
          <p className="mb-2 mt-4 text-[11px] font-medium text-secondary">
            Remind me before this event
          </p>
          <div className="flex flex-wrap gap-1.5">
            {[...new Set([...PRESETS, ...value.offsets])]
              .sort((a, b) => b - a)
              .map((minutes) => (
                <button
                  type="button"
                  key={minutes}
                  aria-pressed={value.offsets.includes(minutes)}
                  onClick={() => toggle(minutes)}
                  className={cn(
                    'rounded-lg border px-2.5 py-1.5 text-[11.5px] transition-colors',
                    value.offsets.includes(minutes)
                      ? 'border-accent/40 bg-accent-soft text-accent'
                      : 'border-line bg-surface text-secondary hover:border-accent/40',
                  )}
                >
                  {offsetLabel(minutes)}
                </button>
              ))}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <input
              aria-label="Custom reminder amount"
              type="number"
              min="1"
              max="525600"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={`${FIELD} w-16`}
            />
            <select
              aria-label="Custom reminder unit"
              value={unit}
              onChange={(e) => setUnit(Number(e.target.value))}
              className={`${FIELD} min-w-0 flex-1`}
            >
              <option value={1440}>days before</option>
              <option value={60}>hours before</option>
              <option value={1}>minutes before</option>
            </select>
            <button
              type="button"
              aria-label="Add custom reminder"
              className={`${FIELD} hover:text-accent`}
              onClick={() => {
                const offset = Number(amount) * unit;
                if (!Number.isInteger(Number(amount)) || offset < 1 || offset > 525600) {
                  setError('Choose a whole number between 1 minute and 365 days.');
                  return;
                }
                setError('');
                patch({ offsets: [...new Set([...value.offsets, offset])].sort((a, b) => b - a) });
              }}
            >
              <Plus size={15} aria-hidden />
            </button>
          </div>
          {error && (
            <p role="alert" className="mt-2 text-xs text-coral">
              {error}
            </p>
          )}
          <label htmlFor={`${id}-daily`} className="mt-4 block text-[11.5px] text-secondary">
            Also remind me once a day
          </label>
          <select
            id={`${id}-daily`}
            value={value.dailyDays}
            onChange={(e) => patch({ dailyDays: Number(e.target.value) })}
            className={`${FIELD} mt-1.5 w-full`}
          >
            <option value={0}>Off — selected reminders only</option>
            {Array.from({ length: 30 }, (_, i) => i + 1).map((days) => (
              <option key={days} value={days}>
                During the last {days} {days === 1 ? 'day' : 'days'}
              </option>
            ))}
          </select>
          <div
            className="mt-3 grid grid-cols-2 gap-2"
            role="group"
            aria-label="Reminder appearance"
          >
            {(['airplane', 'quiet'] as const).map((style) => (
              <button
                type="button"
                key={style}
                aria-pressed={value.style === style}
                onClick={() => patch({ style })}
                className={cn(
                  'flex items-center justify-center gap-2 rounded-lg border px-2 py-2 text-xs',
                  value.style === style
                    ? 'border-accent/40 bg-accent-soft text-accent'
                    : 'border-line text-secondary',
                )}
              >
                {style === 'airplane' ? (
                  <Plane size={14} aria-hidden />
                ) : (
                  <Bell size={14} aria-hidden />
                )}
                {style === 'airplane' ? 'Airplane' : 'Quiet card'}
              </button>
            ))}
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-muted">
            Day reminders arrive after 09:00 when you’re active. Missed reminders combine into one.
            Quiet hours apply.
          </p>
          {!value.offsets.length && !value.dailyDays && (
            <p className="mt-2 text-xs text-coral">Select a timing to receive reminders.</p>
          )}
        </>
      )}
    </section>
  );
}

export function EventReminders({ event }: { event: CalendarEvent }) {
  const saved = useReminderStore((state) => state.rules[event.id]);
  const setRule = useReminderStore((state) => state.setRule);
  const rule = saved ?? defaultRule(event.kind);
  if (event.status === 'cancelled')
    return (
      <p className="mt-4 text-xs text-muted">Reminders are stopped for this cancelled event.</p>
    );
  return (
    <ReminderControls
      value={rule}
      onChange={(next) => setRule(event.id, next)}
      onPreview={() => previewEvent(event, rule)}
    />
  );
}
