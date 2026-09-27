import type { LucideIcon } from 'lucide-react';
import {
  AlarmClock,
  BookOpen,
  ClipboardCheck,
  Coffee,
  FlaskConical,
  User,
  Users,
  Sparkles,
} from 'lucide-react';
import type { EventTone } from '@/lib/tone';

export type CalendarEventKind =
  'lecture' | 'lab' | 'seminar' | 'exam' | 'deadline' | 'study' | 'personal' | 'event';

export type CalendarEventStatus = 'confirmed' | 'tentative' | 'cancelled';

export type CalendarView = 'week' | 'day';

export interface CalendarEvent {
  id: string;
  title: string;
  kind: CalendarEventKind;
  tone: EventTone;
  /** Local `YYYY-MM-DD`. */
  date: string;
  /** 24-hour `HH:MM`. */
  startTime: string;
  endTime: string;
  status: CalendarEventStatus;
  /**
   * Deadlines are a moment, not a span. They ride in the pinned row above the
   * grid so a 23:59 hand-in cannot stretch the time axis over the whole night.
   */
  allDay?: boolean;
  /** Set for anything that came from a subscription or an imported file. */
  sourceId?: string;
  courseCode?: string;
  room?: string;
  instructor?: string;
  note?: string;
  /**
   * The entry's own page in the system it came from. ILIAS feeds link each date
   * to its course or exercise, which is what "Open in ILIAS" follows.
   */
  url?: string;
  /** Optional cover for regular events; special events reuse feature.image. */
  coverImage?: string;
  /** Image-led treatment for student events, independent of their duration. */
  feature?: {
    image: string;
    category: string;
    /** Fraction of the source image to display, measured from the top. */
    imageHeight?: number;
    timeUnannounced?: boolean;
  };
}

interface EventKindMeta {
  label: string;
  /** Used for filter chips, where the count makes the plural read naturally. */
  plural: string;
  icon: LucideIcon;
}

export const EVENT_KINDS: Record<CalendarEventKind, EventKindMeta> = {
  lecture: { label: 'Lecture', plural: 'Lectures', icon: BookOpen },
  lab: { label: 'Lab', plural: 'Labs', icon: FlaskConical },
  seminar: { label: 'Seminar', plural: 'Seminars', icon: Users },
  exam: { label: 'Exam', plural: 'Exams', icon: ClipboardCheck },
  deadline: { label: 'Deadline', plural: 'Deadlines', icon: AlarmClock },
  study: { label: 'Study session', plural: 'Study', icon: Coffee },
  personal: { label: 'Personal', plural: 'Personal', icon: User },
  event: { label: 'Special event', plural: 'Events', icon: Sparkles },
};

/** Filter chips follow this order so the row never reshuffles between weeks. */
export const EVENT_KIND_ORDER: readonly CalendarEventKind[] = [
  'lecture',
  'lab',
  'seminar',
  'exam',
  'deadline',
  'study',
  'personal',
  'event',
];

export const EVENT_STATUS_LABEL: Record<CalendarEventStatus, string> = {
  confirmed: 'Confirmed',
  tentative: 'Tentative',
  cancelled: 'Cancelled',
};
