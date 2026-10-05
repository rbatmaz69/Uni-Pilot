/**
 * Which semester a course belongs to, and what its folder in Documents is
 * called — `Courses/<semester>/<course>/`.
 *
 * ILIAS has no semester field. HHN writes it into the title, in every spelling
 * a lecturer can think of: `- WS25`, `SoSe 2023`, `2024 WS`, `2025 SS`,
 * `WiSe 24/25`. Where the title says nothing, the course's period does; where
 * neither does, the course goes straight into `Courses/`.
 */

import { splitCourseTitle } from '@/features/courses/lib/courses';
import type { CourseTarget, IliasCourse } from '@/features/integrations/lib/iliasSync';

export type Season = 'summer' | 'winter';

export interface Semester {
  season: Season;
  /** The year the semester starts in. */
  year: number;
}

const SUMMER =
  /\b(?:SoSe|SS|Sommersemester|Summer(?:\s+(?:term|semester))?)\s*'?(\d{4}|\d{2})\b|\b(\d{4})\s*(?:SoSe|SS)\b/i;
const WINTER =
  /\b(?:WiSe|WS|Wintersemester|Winter(?:\s+(?:term|semester))?)\s*'?(\d{4}|\d{2})(?:\s*\/\s*(?:\d{4}|\d{2}))?\b|\b(\d{4})\s*(?:WiSe|WS)\b/i;

function fullYear(value: string): number {
  const year = Number(value);
  return value.length === 2 ? 2000 + year : year;
}

/** The semester a title names, and the text that named it. */
function fromTitle(title: string): { semester: Semester; match: string } | null {
  const summer = SUMMER.exec(title);
  const winter = WINTER.exec(title);
  // Both in one title is odd; the one written first wins.
  const found =
    summer && winter
      ? summer.index <= winter.index
        ? { hit: summer, season: 'summer' as const }
        : { hit: winter, season: 'winter' as const }
      : summer
        ? { hit: summer, season: 'summer' as const }
        : winter
          ? { hit: winter, season: 'winter' as const }
          : null;
  if (!found) return null;
  const year = found.hit[1] ?? found.hit[2];
  if (!year) return null;
  return { semester: { season: found.season, year: fullYear(year) }, match: found.hit[0] };
}

/** March to August is the summer semester; September to February the winter one. */
function fromDate(value: string | null | undefined): Semester | null {
  const match = value ? /^(\d{4})-(\d{2})/.exec(value) : null;
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month >= 3 && month <= 8) return { season: 'summer', year };
  return { season: 'winter', year: month >= 9 ? year : year - 1 };
}

export function semesterOf(course: Pick<IliasCourse, 'title' | 'period'>): Semester | null {
  return fromTitle(course.title)?.semester ?? fromDate(course.period?.start) ?? null;
}

/** `Summer 2026`, `Winter 2025-26` — a folder name, so no slash. */
export function semesterLabel(semester: Semester): string {
  if (semester.season === 'summer') return `Summer ${semester.year}`;
  const next = String((semester.year + 1) % 100).padStart(2, '0');
  return `Winter ${semester.year}-${next}`;
}

/**
 * The course folder's name: the title without its module number, and without
 * the semester, which the folder above already says.
 */
export function courseFolderName(title: string): string {
  const { name } = splitCourseTitle(title);
  const named = fromTitle(name);
  if (!named) return name;
  const cleaned = name
    .replace(named.match, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[\s\-–—,]+$/, '')
    .replace(/^[\s\-–—,]+/, '')
    .trim();
  return cleaned || name;
}

/** What the sync needs to know about a course: which one, and where it goes. */
export function courseTarget(course: IliasCourse): CourseTarget {
  const semester = semesterOf(course);
  return {
    refId: course.refId,
    container: course.providerType === 'grp' ? 'grp' : 'crs',
    title: courseFolderName(course.title),
    semester: semester ? semesterLabel(semester) : null,
  };
}
