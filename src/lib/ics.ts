/**
 * A reader for the slice of RFC 5545 that university timetables actually use.
 *
 * Supported: line unfolding, escaped text, `VEVENT` blocks, `DTSTART`/`DTEND`
 * and `DURATION`, all-day dates, `RRULE` for daily, weekly, monthly and yearly
 * repeats with `INTERVAL`, `BYDAY`, `BYMONTHDAY`, `COUNT` and `UNTIL`,
 * `EXDATE` holes, and `RECURRENCE-ID` overrides for the one week a lecture
 * moved.
 *
 * Not supported, on purpose: `VTIMEZONE` definitions. A stamp ending in `Z` is
 * converted from UTC, and anything else — including a `TZID` reference — is
 * read as local wall-clock time. That is correct whenever the reader and the
 * timetable share a timezone, which is the case for a campus schedule, and it
 * avoids shipping a timezone database to solve a problem students do not have.
 */

export interface IcsEvent {
  uid: string;
  summary: string;
  description: string | null;
  location: string | null;
  /** `CANCELLED`, `TENTATIVE` or `CONFIRMED` when the feed says so. */
  status: string | null;
  categories: string[];
  start: Date;
  end: Date;
  allDay: boolean;
}

export interface IcsCalendar {
  /** `X-WR-CALNAME`, the name most exporters give the feed. */
  name: string | null;
  events: IcsEvent[];
}

export interface IcsWindow {
  from: Date;
  to: Date;
}

interface ContentLine {
  name: string;
  params: Record<string, string>;
  value: string;
}

interface RecurrenceRule {
  freq: string;
  interval: number;
  count: number | null;
  until: Date | null;
  byDay: number[];
  byMonthDay: number[];
}

/** A runaway `RRULE` with no end must not be able to hang the app. */
const MAX_OCCURRENCES = 500;
const MS_PER_DAY = 86_400_000;
const WEEKDAY_CODES = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

export function parseIcs(text: string, window: IcsWindow): IcsCalendar {
  const { name, blocks } = readBlocks(text);
  const events: IcsEvent[] = [];
  const overridden = new Set<string>();
  const recurring: { block: ContentLine[]; base: IcsEvent }[] = [];

  // Two passes on purpose. A moved lecture arrives as its own VEVENT carrying
  // RECURRENCE-ID, and nothing says it has to come after the master it edits,
  // so every exception has to be known before any rule is expanded.
  for (const block of blocks) {
    const base = readEvent(block);
    if (!base) continue;

    const recurrenceId = findLine(block, 'RECURRENCE-ID');
    if (recurrenceId) {
      const at = parseStamp(recurrenceId.value, base.allDay);
      if (at) overridden.add(`${base.uid}@${at.getTime()}`);
      if (base.status !== 'CANCELLED' && within(base, window)) events.push(base);
      continue;
    }

    if (findLine(block, 'RRULE')) recurring.push({ block, base });
    else if (within(base, window)) events.push(base);
  }

  for (const { block, base } of recurring) {
    for (const occurrence of occurrences(block, base, window)) {
      if (overridden.has(`${base.uid}@${occurrence.start.getTime()}`)) continue;
      events.push(occurrence);
    }
  }

  return { name, events: events.sort((a, b) => a.start.getTime() - b.start.getTime()) };
}

/** Splits the feed into VEVENT blocks, ignoring nested VALARM and VTIMEZONE. */
function readBlocks(text: string): { name: string | null; blocks: ContentLine[][] } {
  const blocks: ContentLine[][] = [];
  let name: string | null = null;
  let block: ContentLine[] | null = null;
  let depth = 0;

  for (const raw of unfold(text)) {
    const line = parseLine(raw);
    if (!line) continue;

    if (line.name === 'BEGIN') {
      if (line.value === 'VEVENT' && !block) {
        block = [];
        depth = 1;
      } else if (block) {
        depth += 1;
      }
      continue;
    }

    if (line.name === 'END') {
      if (block && line.value === 'VEVENT' && depth === 1) {
        blocks.push(block);
        block = null;
        depth = 0;
      } else if (block) {
        depth -= 1;
      }
      continue;
    }

    if (block && depth === 1) block.push(line);
    else if (!block && line.name === 'X-WR-CALNAME') name = unescapeText(line.value).trim() || null;
  }

  return { name, blocks };
}

const findLine = (block: ContentLine[], name: string) => block.find((line) => line.name === name);

function unfold(text: string): string[] {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n[ \t]/g, '')
    .split('\n');
}

function parseLine(raw: string): ContentLine | null {
  if (!raw.trim()) return null;

  let colon = -1;
  let quoted = false;
  for (let index = 0; index < raw.length; index += 1) {
    const character = raw[index];
    if (character === '"') quoted = !quoted;
    else if (character === ':' && !quoted) {
      colon = index;
      break;
    }
  }
  if (colon === -1) return null;

  const head = raw.slice(0, colon);
  const value = raw.slice(colon + 1);
  const [name, ...rest] = head.split(';');
  const params: Record<string, string> = {};

  for (const part of rest) {
    const equals = part.indexOf('=');
    if (equals === -1) continue;
    params[part.slice(0, equals).toUpperCase()] = part.slice(equals + 1).replace(/^"|"$/g, '');
  }

  return { name: (name ?? '').toUpperCase(), params, value };
}

/**
 * One pass, not four: unescaping `\\n` then `\\\\` in sequence would turn a
 * literal escaped backslash followed by an n into a newline.
 */
function unescapeText(value: string): string {
  return value.replace(/\\([nN,;\\])/g, (_, char: string) =>
    char === 'n' || char === 'N' ? '\n' : char,
  );
}

/** `20260907T081500Z`, `20260907T081500` or `20260907`. */
function parseStamp(value: string, dateOnly: boolean): Date | null {
  const match = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(value.trim());
  if (!match) return null;

  const [, year, month, day, hour, minute, second, utc] = match;
  const parts = [year, month, day, hour ?? '0', minute ?? '0', second ?? '0'].map(Number);
  const [y = 1970, mo = 1, d = 1, h = 0, mi = 0, s = 0] = parts;

  if (dateOnly || !hour) return new Date(y, mo - 1, d);
  return utc ? new Date(Date.UTC(y, mo - 1, d, h, mi, s)) : new Date(y, mo - 1, d, h, mi, s);
}

/** `PT1H30M`, `P1D`, `P2DT3H`. */
function parseDuration(value: string): number | null {
  const match = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(
    value.trim(),
  );
  if (!match) return null;

  const [, sign, weeks, days, hours, minutes, seconds] = match;
  const total =
    Number(weeks ?? 0) * 7 * MS_PER_DAY +
    Number(days ?? 0) * MS_PER_DAY +
    Number(hours ?? 0) * 3_600_000 +
    Number(minutes ?? 0) * 60_000 +
    Number(seconds ?? 0) * 1000;

  return sign === '-' ? -total : total;
}

function parseRule(value: string): RecurrenceRule | null {
  const parts: Record<string, string> = {};
  for (const pair of value.split(';')) {
    const equals = pair.indexOf('=');
    if (equals > 0) parts[pair.slice(0, equals).toUpperCase()] = pair.slice(equals + 1);
  }
  if (!parts.FREQ) return null;

  const until = parts.UNTIL ? parseStamp(parts.UNTIL, false) : null;

  return {
    freq: parts.FREQ.toUpperCase(),
    interval: Math.max(1, Number(parts.INTERVAL ?? 1) || 1),
    count: parts.COUNT ? Number(parts.COUNT) : null,
    until,
    byDay: (parts.BYDAY ?? '')
      .split(',')
      // A leading ordinal ("2TH") is ignored; the weekday still applies.
      .map((code) => WEEKDAY_CODES.indexOf(code.trim().slice(-2).toUpperCase()))
      .filter((index) => index >= 0),
    byMonthDay: (parts.BYMONTHDAY ?? '')
      .split(',')
      .map(Number)
      .filter((day) => Number.isInteger(day) && day !== 0),
  };
}

function readEvent(block: ContentLine[]): IcsEvent | null {
  const startLine = findLine(block, 'DTSTART');
  if (!startLine) return null;

  const allDay = startLine.params.VALUE === 'DATE' || /^\d{8}$/.test(startLine.value);
  const start = parseStamp(startLine.value, allDay);
  if (!start) return null;

  const endLine = findLine(block, 'DTEND');
  const durationLine = findLine(block, 'DURATION');
  const parsedEnd = endLine ? parseStamp(endLine.value, allDay) : null;
  const duration = durationLine ? parseDuration(durationLine.value) : null;
  const end = parsedEnd ?? new Date(start.getTime() + (duration ?? (allDay ? MS_PER_DAY : 0)));

  return {
    uid: findLine(block, 'UID')?.value.trim() || `${start.getTime()}-${startLine.value}`,
    summary: unescapeText(findLine(block, 'SUMMARY')?.value ?? '').trim() || 'Untitled',
    description: unescapeText(findLine(block, 'DESCRIPTION')?.value ?? '').trim() || null,
    location: unescapeText(findLine(block, 'LOCATION')?.value ?? '').trim() || null,
    status: findLine(block, 'STATUS')?.value.trim().toUpperCase() ?? null,
    categories: (findLine(block, 'CATEGORIES')?.value ?? '')
      .split(',')
      .map((entry) => unescapeText(entry).trim())
      .filter(Boolean),
    start,
    end,
    allDay,
  };
}

/** Every instance a block's RRULE produces inside the window, minus EXDATEs. */
function occurrences(block: ContentLine[], base: IcsEvent, window: IcsWindow): IcsEvent[] {
  const ruleLine = findLine(block, 'RRULE');
  const rule = ruleLine ? parseRule(ruleLine.value) : null;
  if (!rule) return within(base, window) ? [base] : [];

  const excluded = new Set<number>();
  for (const line of block) {
    if (line.name !== 'EXDATE') continue;
    for (const entry of line.value.split(',')) {
      const at = parseStamp(entry, base.allDay || line.params.VALUE === 'DATE');
      if (at) excluded.add(at.getTime());
    }
  }

  return [...expand(base, rule, window)].filter(
    (occurrence) => !excluded.has(occurrence.start.getTime()),
  );
}

function within(event: IcsEvent, window: IcsWindow): boolean {
  return (
    event.end.getTime() >= window.from.getTime() && event.start.getTime() <= window.to.getTime()
  );
}

function* expand(base: IcsEvent, rule: RecurrenceRule, window: IcsWindow): Generator<IcsEvent> {
  const length = base.end.getTime() - base.start.getTime();
  const limit = window.to.getTime();
  const until = rule.until?.getTime() ?? Number.POSITIVE_INFINITY;

  let produced = 0;
  let emitted = 0;

  for (const start of walk(base.start, rule)) {
    if (produced >= MAX_OCCURRENCES) return;
    produced += 1;

    const time = start.getTime();
    if (time > limit || time > until) return;
    if (rule.count !== null && emitted >= rule.count) return;
    emitted += 1;

    const end = new Date(time + length);
    if (end.getTime() >= window.from.getTime()) {
      yield { ...base, uid: `${base.uid}@${time}`, start, end };
    }
  }
}

/** Yields every start the rule produces, in order, without any windowing. */
function* walk(seed: Date, rule: RecurrenceRule): Generator<Date> {
  const stepWeeks = rule.freq === 'WEEKLY';
  const days = rule.byDay.length ? [...rule.byDay].sort((a, b) => a - b) : null;

  if (stepWeeks && days) {
    // Start from the Monday of the seed's week so BYDAY order is stable.
    const weekStart = addDaysKeepingTime(seed, -((seed.getDay() + 6) % 7));
    for (let week = 0; ; week += rule.interval) {
      for (const weekday of days) {
        const candidate = addDaysKeepingTime(weekStart, week * 7 + weekday);
        if (candidate.getTime() >= seed.getTime()) yield candidate;
      }
    }
  }

  for (let step = 0; ; step += rule.interval) {
    if (rule.freq === 'DAILY') {
      yield addDaysKeepingTime(seed, step);
    } else if (rule.freq === 'WEEKLY') {
      yield addDaysKeepingTime(seed, step * 7);
    } else if (rule.freq === 'MONTHLY') {
      for (const day of rule.byMonthDay.length ? rule.byMonthDay : [seed.getDate()]) {
        const candidate = new Date(seed);
        candidate.setDate(1);
        candidate.setMonth(seed.getMonth() + step);
        const lastDay = new Date(candidate.getFullYear(), candidate.getMonth() + 1, 0).getDate();
        const target = day > 0 ? day : lastDay + day + 1;
        if (target < 1 || target > lastDay) continue;
        candidate.setDate(target);
        if (candidate.getTime() >= seed.getTime()) yield candidate;
      }
    } else if (rule.freq === 'YEARLY') {
      const candidate = new Date(seed);
      candidate.setFullYear(seed.getFullYear() + step);
      yield candidate;
    } else {
      return;
    }
  }
}

/** Day arithmetic that preserves the time of day across a DST boundary. */
function addDaysKeepingTime(date: Date, amount: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}
