import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { Button, Modal } from '@/components/ui';
import { ReminderControls } from '@/features/reminders/components/ReminderControls';
import { previewEvent } from '@/features/reminders/lib/runtime';
import { defaultRule, type ReminderRule } from '@/features/reminders/lib/engine';
import { useReminderStore } from '@/features/reminders/store/reminderStore';
import { formatClock, formatDayLabel, minutesOfDay, parseDateKey } from '@/lib/date';
import { TONE_EVENT, type EventTone } from '@/lib/tone';
import { cn } from '@/lib/utils';
import {
  EVENT_KIND_ORDER,
  EVENT_KINDS,
  type CalendarEvent,
  type CalendarEventKind,
} from '@/features/calendar/lib/types';

export interface EventDraft {
  date: string;
  startTime: string;
}

interface EventComposerDialogProps {
  draft: EventDraft;
  onClose: () => void;
  onSubmit: (event: CalendarEvent) => void;
}

const TONE_LABELS: Record<EventTone, string> = {
  accent: 'Indigo',
  blue: 'Blue',
  green: 'Green',
  yellow: 'Amber',
  pink: 'Pink',
  lavender: 'Lavender',
  orange: 'Orange',
  teal: 'Teal',
  coral: 'Coral',
};

const TONES = Object.keys(TONE_LABELS) as EventTone[];

const DEFAULT_LENGTH = 90;
const MIN_LENGTH = 15;

const FIELD =
  'w-full rounded-xl border border-line bg-surface-secondary px-3 py-2 text-[13px] text-primary transition-colors placeholder:text-muted focus:border-accent focus:outline-none';

/** Deadlines are a single moment, so the end time is not asked for. */
const isMoment = (kind: CalendarEventKind) => kind === 'deadline';

export function EventComposerDialog({ draft, onClose, onSubmit }: EventComposerDialogProps) {
  const formId = useId();
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<CalendarEventKind>('lecture');
  const [reminders, setReminders] = useState<ReminderRule | null>(null);
  const rule = reminders ?? defaultRule(kind);
  const [tone, setTone] = useState<EventTone>('accent');
  const [date, setDate] = useState(draft.date);
  const [startTime, setStartTime] = useState(draft.startTime);
  const [endTime, setEndTime] = useState(() =>
    formatClock(minutesOfDay(draft.startTime) + DEFAULT_LENGTH),
  );
  const [room, setRoom] = useState('');
  const [courseCode, setCourseCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Moving the start drags the end along, which is what anyone rescheduling a
  // 90-minute lecture expects instead of a silently invalid pair of times.
  const handleStartChange = (value: string) => {
    const length = Math.max(minutesOfDay(endTime) - minutesOfDay(startTime), MIN_LENGTH);
    setStartTime(value);
    setEndTime(formatClock(minutesOfDay(value) + length));
  };

  const handleSubmit = (formEvent: FormEvent<HTMLFormElement>) => {
    formEvent.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) {
      setError('Give the event a name so you can recognise it later.');
      return;
    }
    if (!isMoment(kind) && minutesOfDay(endTime) <= minutesOfDay(startTime)) {
      setError('The end time has to come after the start time.');
      return;
    }

    const id = `custom-${crypto.randomUUID()}`;
    useReminderStore.getState().setRule(id, rule);
    onSubmit({
      id,
      title: trimmed,
      kind,
      tone,
      date,
      startTime,
      endTime: isMoment(kind) ? startTime : endTime,
      status: 'confirmed',
      ...(isMoment(kind) ? { allDay: true } : {}),
      ...(room.trim() ? { room: room.trim() } : {}),
      ...(courseCode.trim() ? { courseCode: courseCode.trim().toUpperCase() } : {}),
    });
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="New event"
      description={`Lands on ${formatDayLabel(parseDateKey(date))}.`}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" type="submit" form={formId}>
            Add to calendar
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="flex flex-col gap-3.5">
        <Field label="Title">
          {(id) => (
            <input
              id={id}
              type="text"
              value={title}
              onChange={(changeEvent) => {
                setTitle(changeEvent.target.value);
                setError(null);
              }}
              placeholder="e.g. Algorithms tutorial"
              className={FIELD}
            />
          )}
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Type">
            {(id) => (
              <select
                id={id}
                value={kind}
                onChange={(changeEvent) => setKind(changeEvent.target.value as CalendarEventKind)}
                className={FIELD}
              >
                {EVENT_KIND_ORDER.map((option) => (
                  <option key={option} value={option}>
                    {EVENT_KINDS[option].label}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Course code">
            {(id) => (
              <input
                id={id}
                type="text"
                value={courseCode}
                onChange={(changeEvent) => setCourseCode(changeEvent.target.value)}
                placeholder="Optional"
                className={FIELD}
              />
            )}
          </Field>
        </div>

        <div className={cn('grid gap-3', isMoment(kind) ? 'grid-cols-2' : 'grid-cols-3')}>
          <Field label="Date">
            {(id) => (
              <input
                id={id}
                type="date"
                value={date}
                onChange={(changeEvent) => setDate(changeEvent.target.value)}
                className={FIELD}
              />
            )}
          </Field>
          <Field label={isMoment(kind) ? 'Due at' : 'Starts'}>
            {(id) => (
              <input
                id={id}
                type="time"
                value={startTime}
                onChange={(changeEvent) => handleStartChange(changeEvent.target.value)}
                className={FIELD}
              />
            )}
          </Field>
          {isMoment(kind) ? null : (
            <Field label="Ends">
              {(id) => (
                <input
                  id={id}
                  type="time"
                  value={endTime}
                  onChange={(changeEvent) => {
                    setEndTime(changeEvent.target.value);
                    setError(null);
                  }}
                  className={FIELD}
                />
              )}
            </Field>
          )}
        </div>

        <Field label="Location">
          {(id) => (
            <input
              id={id}
              type="text"
              value={room}
              onChange={(changeEvent) => setRoom(changeEvent.target.value)}
              placeholder="Room, building or link"
              className={FIELD}
            />
          )}
        </Field>

        <fieldset className="min-w-0">
          <legend className="mb-1.5 text-[12px] font-medium text-secondary">Colour</legend>
          <div className="flex flex-wrap gap-2">
            {TONES.map((option) => (
              <label key={option} className="cursor-pointer">
                <input
                  type="radio"
                  name={`${formId}-tone`}
                  value={option}
                  checked={tone === option}
                  onChange={() => setTone(option)}
                  className="peer sr-only"
                />
                <span className="sr-only">{TONE_LABELS[option]}</span>
                <span
                  aria-hidden
                  className={cn(
                    'block h-6 w-6 rounded-full border-2 border-transparent transition-transform',
                    'peer-checked:scale-110 peer-checked:border-primary peer-focus-visible:border-accent',
                    TONE_EVENT[option].solid,
                  )}
                />
              </label>
            ))}
          </div>
        </fieldset>

        <ReminderControls
          value={rule}
          onChange={setReminders}
          onPreview={() =>
            previewEvent(
              {
                id: 'preview',
                title: title.trim() || 'Your next exam',
                kind,
                tone,
                date,
                startTime,
                endTime,
                status: 'confirmed',
              },
              rule,
            )
          }
        />

        {error ? (
          <p role="alert" className="text-[12px] font-medium text-coral">
            {error}
          </p>
        ) : null}
      </form>
    </Modal>
  );
}

/**
 * Wrapping a `<select>` in its `<label>` makes assistive tech read the label
 * plus every option as one name, so each control gets an explicit id instead.
 */
function Field({ label, children }: { label: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-1 block text-[12px] font-medium text-secondary">
        {label}
      </label>
      {children(id)}
    </div>
  );
}
