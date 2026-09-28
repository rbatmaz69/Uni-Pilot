import { useId, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import {
  AlignLeft,
  Bell,
  CalendarDays,
  ChevronDown,
  Flag,
  Hash,
  Image,
  MapPin,
  Palette,
  Tag,
} from 'lucide-react';
import { Button, Modal } from '@/components/ui';
import { ReminderControls } from '@/features/reminders/components/ReminderControls';
import { previewEvent } from '@/features/reminders/lib/runtime';
import { defaultRule, offsetLabel, type ReminderRule } from '@/features/reminders/lib/engine';
import { useReminderStore } from '@/features/reminders/store/reminderStore';
import { formatClock, formatDayLabel, minutesOfDay, parseDateKey } from '@/lib/date';
import { TONE_EVENT, type EventTone } from '@/lib/tone';
import { cn } from '@/lib/utils';
import { PRIORITY_LABELS, type TaskPriority } from '@/features/calendar/lib/agenda';
import type { NewTask } from '@/features/calendar/store/taskStore';
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

type ComposerMode = 'event' | 'task';

interface EventComposerDialogProps {
  draft: EventDraft;
  onClose: () => void;
  onSubmit: (event: CalendarEvent) => void;
  /**
   * Leave it out and the Task tab stays hidden. A tab with nowhere to file its
   * task would be a dead control, which is worse than one fewer choice.
   */
  onSubmitTask?: (task: NewTask) => void;
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
const PRIORITIES: readonly TaskPriority[] = ['high', 'med', 'low'];

const DEFAULT_LENGTH = 90;
const MIN_LENGTH = 15;

/**
 * Fields carry no chrome of their own: the icon in the gutter says what the
 * row is, and the surface only appears once a pointer or the keyboard is on
 * it. No `focus:outline-none` here — with no border to swap in, the global
 * focus ring is the only thing left marking where you are.
 *
 * Placeholders sit on `text-secondary`, not `text-muted`: muted is 3.7:1 on
 * the light surface, which is under the 4.5:1 that body text has to clear.
 */
const LINE =
  'min-w-0 rounded-lg bg-transparent px-2 py-1.5 text-[13.5px] text-primary transition-colors placeholder:text-secondary hover:bg-surface-hover focus:bg-surface-secondary';
/** Same box as a field, for the rows that open something instead of typing. */
const LINE_BUTTON =
  'rounded-lg px-2 py-1.5 text-left text-[13.5px] transition-colors hover:bg-surface-hover';
/** Native option lists ignore a transparent parent, so they name both colours. */
const OPTION = 'bg-surface text-primary';

/** Deadlines are a single moment, so the end time is not asked for. */
const isMoment = (kind: CalendarEventKind) => kind === 'deadline';

const isApple = () => /Mac|iPhone|iPad/.test(globalThis.navigator?.userAgent ?? '');

export function EventComposerDialog({
  draft,
  onClose,
  onSubmit,
  onSubmitTask,
}: EventComposerDialogProps) {
  const formId = useId();
  const [mode, setMode] = useState<ComposerMode>('event');
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
  const [note, setNote] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('med');
  const [dueTime, setDueTime] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [eventImage, setEventImage] = useState('');
  const [category, setCategory] = useState('Student event');
  const [timeUnannounced, setTimeUnannounced] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  /** `null` follows the rule: reminders that are on open themselves. */
  const [remindersOpen, setRemindersOpen] = useState<boolean | null>(null);

  const isTask = mode === 'task';
  const unknownTime = kind === 'event' && timeUnannounced;
  const KindIcon = EVENT_KINDS[kind].icon;

  const loadImage = (file: File | undefined) => {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 1_000_000) {
      setError('Choose a PNG, JPEG or WebP image up to 1 MB.');
      return;
    }
    setImageLoading(true);
    const reader = new FileReader();
    reader.onload = () => {
      setEventImage(typeof reader.result === 'string' ? reader.result : '');
      setError(null);
      setImageLoading(false);
    };
    reader.onerror = () => {
      setError('The image could not be read. Try another file.');
      setImageLoading(false);
    };
    reader.readAsDataURL(file);
  };

  // Moving the start drags the end along, which is what anyone rescheduling a
  // 90-minute lecture expects instead of a silently invalid pair of times.
  const handleStartChange = (value: string) => {
    const length = Math.max(minutesOfDay(endTime) - minutesOfDay(startTime), MIN_LENGTH);
    setStartTime(value);
    setEndTime(formatClock(minutesOfDay(value) + length));
  };

  // A description needs Enter for its own line breaks, so the whole form also
  // takes the shortcut every other composer on the desktop uses.
  const handleKeyDown = (keyEvent: KeyboardEvent<HTMLFormElement>) => {
    if (keyEvent.key !== 'Enter' || !(keyEvent.metaKey || keyEvent.ctrlKey)) return;
    keyEvent.preventDefault();
    keyEvent.currentTarget.requestSubmit();
  };

  const handleSubmit = (formEvent: FormEvent<HTMLFormElement>) => {
    formEvent.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) {
      setError(
        isTask
          ? 'Give the task a name so you can recognise it later.'
          : 'Give the event a name so you can recognise it later.',
      );
      return;
    }

    if (isTask) {
      onSubmitTask?.({
        title: trimmed,
        dueDate: date,
        // An empty time is the normal case: the task belongs to the day, not
        // to a slot, and the week view pins it in the all-day row.
        dueTime: dueTime || null,
        priority,
        courseCode: courseCode.trim() ? courseCode.trim().toUpperCase() : null,
      });
      onClose();
      return;
    }

    if (imageLoading) return;
    if (!unknownTime && !isMoment(kind) && minutesOfDay(endTime) <= minutesOfDay(startTime)) {
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
      startTime: unknownTime ? '00:00' : startTime,
      endTime: unknownTime ? '23:59' : isMoment(kind) ? startTime : endTime,
      status: 'confirmed',
      ...(isMoment(kind) || unknownTime ? { allDay: true } : {}),
      ...(kind === 'event'
        ? {
            feature: {
              image: eventImage,
              category: category.trim() || 'Student event',
              timeUnannounced: unknownTime,
            },
          }
        : {}),
      ...(room.trim() ? { room: room.trim() } : {}),
      ...(courseCode.trim() ? { courseCode: courseCode.trim().toUpperCase() } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
      ...(kind !== 'event' && eventImage ? { coverImage: eventImage } : {}),
    });
    onClose();
  };

  return (
    <Modal
      open
      titleHidden
      onClose={onClose}
      title={isTask ? 'New task' : 'New event'}
      description={`Lands on ${formatDayLabel(parseDateKey(date))}.`}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} className="mr-auto">
            Cancel
          </Button>
          <Button variant="primary" size="sm" type="submit" form={formId} disabled={imageLoading}>
            Add to calendar
            <kbd
              aria-hidden
              className="ml-0.5 font-sans text-[11px] font-normal opacity-70"
            >{`${isApple() ? '⌘' : 'Ctrl'} ↵`}</kbd>
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} onKeyDown={handleKeyDown} className="pt-1">
        <input
          type="text"
          aria-label="Title"
          value={title}
          onChange={(changeEvent) => {
            setTitle(changeEvent.target.value);
            setError(null);
          }}
          placeholder={isTask ? 'Add a task' : 'Add a title'}
          className="w-full rounded-lg bg-transparent px-2 py-1.5 text-[21px] font-semibold tracking-tight text-primary transition-colors placeholder:font-normal placeholder:text-secondary hover:bg-surface-hover focus:bg-surface-secondary"
        />

        {onSubmitTask ? (
          <div
            role="group"
            aria-label="What to add"
            className="mt-4 grid grid-cols-2 gap-1 rounded-xl border border-line-soft bg-surface-secondary p-1"
          >
            {(['event', 'task'] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={mode === option}
                onClick={() => {
                  setMode(option);
                  setError(null);
                }}
                className={cn(
                  'h-9 rounded-lg px-3 text-[13px] transition-colors',
                  mode === option
                    ? 'bg-surface font-semibold text-primary shadow-soft'
                    : 'font-medium text-secondary hover:text-primary',
                )}
              >
                {option === 'event' ? 'Event' : 'Task'}
              </button>
            ))}
          </div>
        ) : null}

        <div className="mt-4 flex flex-col gap-1">
          <Row icon={<CalendarDays size={17} strokeWidth={1.9} />}>
            <div className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-1">
              <input
                type="date"
                aria-label={isTask ? 'Due date' : 'Date'}
                value={date}
                onChange={(changeEvent) => setDate(changeEvent.target.value)}
                className={cn(LINE, 'w-[130px]')}
              />
              {isTask ? (
                <input
                  type="time"
                  aria-label="Time, optional"
                  value={dueTime}
                  onChange={(changeEvent) => setDueTime(changeEvent.target.value)}
                  className={cn(LINE, 'w-[86px]')}
                />
              ) : unknownTime ? (
                <span className="px-2 text-[13.5px] text-secondary">Time to be announced</span>
              ) : (
                <>
                  <input
                    type="time"
                    aria-label={isMoment(kind) ? 'Due at' : 'Starts'}
                    value={startTime}
                    onChange={(changeEvent) => handleStartChange(changeEvent.target.value)}
                    className={cn(LINE, 'w-[86px]')}
                  />
                  {isMoment(kind) ? null : (
                    <>
                      <span aria-hidden className="text-[13.5px] text-secondary">
                        –
                      </span>
                      <input
                        type="time"
                        aria-label="Ends"
                        value={endTime}
                        onChange={(changeEvent) => {
                          setEndTime(changeEvent.target.value);
                          setError(null);
                        }}
                        className={cn(LINE, 'w-[86px]')}
                      />
                    </>
                  )}
                </>
              )}
            </div>
          </Row>

          {isTask ? (
            <Row icon={<Flag size={17} strokeWidth={1.9} />}>
              <SelectField
                label="Priority"
                value={priority}
                onChange={(next) => setPriority(next as TaskPriority)}
                options={PRIORITIES.map((option) => ({
                  value: option,
                  label: PRIORITY_LABELS[option],
                }))}
              />
            </Row>
          ) : (
            <Row icon={<KindIcon size={17} strokeWidth={1.9} />}>
              <SelectField
                label="Type"
                value={kind}
                onChange={(next) => setKind(next as CalendarEventKind)}
                options={EVENT_KIND_ORDER.map((option) => ({
                  value: option,
                  label: EVENT_KINDS[option].label,
                }))}
              />
            </Row>
          )}

          <Row icon={<Hash size={17} strokeWidth={1.9} />}>
            <input
              type="text"
              aria-label="Course code"
              value={courseCode}
              onChange={(changeEvent) => setCourseCode(changeEvent.target.value)}
              placeholder="Add a course code"
              className={cn(LINE, 'w-full')}
            />
          </Row>

          {isTask ? null : (
            <>
              {kind === 'event' && (
                <>
                  <Row icon={<Tag size={17} strokeWidth={1.9} />}>
                    <input
                      aria-label="Event category"
                      value={category}
                      onChange={(changeEvent) => setCategory(changeEvent.target.value)}
                      placeholder="Hackathon, workshop, meetup…"
                      className={cn(LINE, 'w-full')}
                    />
                  </Row>
                  <Row>
                    <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[13.5px] text-primary transition-colors hover:bg-surface-hover">
                      <input
                        type="checkbox"
                        checked={timeUnannounced}
                        onChange={(changeEvent) => setTimeUnannounced(changeEvent.target.checked)}
                        className="accent-accent"
                      />
                      Time to be announced
                    </label>
                  </Row>
                </>
              )}

              <Row icon={<MapPin size={17} strokeWidth={1.9} />}>
                <input
                  type="text"
                  aria-label="Location"
                  value={room}
                  onChange={(changeEvent) => setRoom(changeEvent.target.value)}
                  placeholder="Add a room, building or link"
                  className={cn(LINE, 'w-full')}
                />
              </Row>

              <Row icon={<Palette size={17} strokeWidth={1.9} />}>
                <fieldset className="min-w-0 px-2 py-1">
                  <legend className="sr-only">Colour</legend>
                  <div className="flex flex-wrap items-center gap-2">
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
                            'block h-5 w-5 rounded-full border-2 border-transparent transition-transform',
                            'peer-checked:scale-110 peer-checked:border-primary peer-focus-visible:border-accent',
                            TONE_EVENT[option].solid,
                          )}
                        />
                      </label>
                    ))}
                  </div>
                </fieldset>
              </Row>

              {!unknownTime && (
                <Row icon={<Bell size={17} strokeWidth={1.9} />}>
                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      aria-expanded={remindersOpen ?? rule.enabled}
                      onClick={() => setRemindersOpen(!(remindersOpen ?? rule.enabled))}
                      className={cn(
                        LINE_BUTTON,
                        'w-full',
                        rule.enabled ? 'text-primary' : 'text-secondary hover:text-primary',
                      )}
                    >
                      {describeReminders(rule)}
                    </button>
                    {(remindersOpen ?? rule.enabled) && (
                      <ReminderControls
                        className="mt-2"
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
                    )}
                  </div>
                </Row>
              )}

              <Row icon={<Image size={17} strokeWidth={1.9} />}>
                <div className="min-w-0 flex-1">
                  <label
                    className={cn(
                      LINE_BUTTON,
                      'inline-flex cursor-pointer items-center text-secondary hover:text-primary',
                    )}
                  >
                    Cover image (optional)
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      disabled={imageLoading}
                      onChange={(changeEvent) => loadImage(changeEvent.target.files?.[0])}
                      className="sr-only"
                    />
                  </label>
                  {eventImage ? (
                    <div className="mt-1.5 flex items-center gap-2.5 px-2">
                      <img
                        src={eventImage}
                        alt="Event cover preview"
                        className="h-10 w-10 rounded-lg object-cover"
                      />
                      <button
                        type="button"
                        disabled={imageLoading}
                        onClick={() => {
                          setEventImage('');
                          setError(null);
                        }}
                        className="rounded-md px-1.5 py-1 text-[12.5px] text-secondary underline transition-colors hover:text-primary"
                      >
                        Remove cover
                      </button>
                    </div>
                  ) : (
                    <p className="px-2 text-[11.5px] text-secondary">
                      PNG, JPEG or WebP, up to 1 MB.
                    </p>
                  )}
                </div>
              </Row>

              <Row icon={<AlignLeft size={17} strokeWidth={1.9} />}>
                <textarea
                  aria-label="Description"
                  value={note}
                  onChange={(changeEvent) => setNote(changeEvent.target.value)}
                  placeholder="Add a description"
                  rows={2}
                  className={cn(LINE, 'w-full resize-none leading-relaxed')}
                />
              </Row>
            </>
          )}
        </div>

        {error ? (
          <p role="alert" className="mt-3 px-2 text-[12.5px] font-medium text-coral">
            {error}
          </p>
        ) : null}
      </form>
    </Modal>
  );
}

/** "15 min before", or what the row says before anyone opens it. */
function describeReminders(rule: ReminderRule): string {
  if (!rule.enabled) return 'Add a reminder';
  const offsets = [...rule.offsets].sort((a, b) => b - a).map(offsetLabel);
  const daily = rule.dailyDays
    ? `daily for the last ${rule.dailyDays} ${rule.dailyDays === 1 ? 'day' : 'days'}`
    : null;
  const parts = [offsets.length ? `${offsets.join(', ')} before` : null, daily].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'Reminders on, no timing chosen';
}

/**
 * One line of the composer: a fixed icon gutter, then the control itself. The
 * icon is aligned to the first line rather than centred, so a row that grows —
 * the reminder panel, a cover preview — keeps its marker at the top.
 */
function Row({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <span
        aria-hidden
        className="flex h-9 w-5 flex-none items-center justify-center text-secondary"
      >
        {icon}
      </span>
      <div className="flex min-w-0 flex-1 items-start">{children}</div>
    </div>
  );
}

/**
 * A `<select>` sized to its value, so the chevron stays next to the word it
 * belongs to instead of drifting to the far edge of a full-width row.
 */
function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly { value: string; label: string }[];
}) {
  return (
    <span className="relative inline-flex items-center">
      <select
        aria-label={label}
        value={value}
        onChange={(changeEvent) => onChange(changeEvent.target.value)}
        className={cn(LINE, 'w-auto cursor-pointer appearance-none pr-7')}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} className={OPTION}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={15}
        strokeWidth={1.9}
        aria-hidden
        className="pointer-events-none absolute right-2 text-secondary"
      />
    </span>
  );
}
