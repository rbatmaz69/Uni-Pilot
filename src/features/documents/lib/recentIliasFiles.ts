import {
  containerFor,
  fileKind,
  parseIliasDate,
  type CourseFileKind,
} from '@/features/courses/lib/courses';
import type { IliasFileRow } from '@/features/documents/lib/iliasSpace';
import { addedAt } from '@/features/documents/lib/iliasSpace';
import type { IliasContentItem, IliasCourse } from '@/features/integrations/lib/iliasSync';

export type RecentIliasFile =
  | {
      source: 'saved';
      id: string;
      name: string;
      courseId: string;
      courseTitle: string;
      kind: CourseFileKind;
      status: 'documents' | 'gone';
      time: number;
      file: IliasFileRow;
    }
  | {
      source: 'ilias';
      id: string;
      name: string;
      courseId: string;
      courseTitle: string;
      kind: CourseFileKind;
      status: 'ilias';
      time: number | null;
      item: IliasContentItem;
      course: IliasCourse;
      trail: { refId: string; title: string }[];
    };

/** Combine local copies with all course and folder listings already read from ILIAS. */
export function recentIliasFiles(
  courses: readonly IliasCourse[],
  contents: Readonly<Record<string, { items: IliasContentItem[] }>>,
  saved: readonly IliasFileRow[],
): RecentIliasFile[] {
  const rows: RecentIliasFile[] = saved.map((file) => ({
    source: 'saved',
    id: `saved:${file.path}`,
    name: file.name,
    courseId: file.course.courseRefId,
    courseTitle: file.course.title,
    kind: fileKind(null, file.name),
    status: file.gone ? 'gone' : 'documents',
    time: addedAt(file),
    file,
  }));
  const localRefs = new Set(
    saved.filter((file) => file.refId).map((file) => `${file.course.courseRefId}:${file.refId}`),
  );

  for (const course of courses) {
    if (!course.online) continue;
    const visited = new Set<string>();
    const visit = (refId: string, trail: { refId: string; title: string }[]) => {
      if (visited.has(refId)) return;
      visited.add(refId);
      for (const item of contents[refId]?.items ?? []) {
        if (item.providerType === 'file') {
          if (localRefs.has(`${course.refId}:${item.refId}`)) continue;
          rows.push({
            source: 'ilias',
            id: `ilias:${course.refId}:${item.refId}`,
            name: item.title,
            courseId: course.refId,
            courseTitle: course.title,
            kind: fileKind(item.file?.suffix ?? null, item.title),
            status: 'ilias',
            time: parseIliasDate(item.file?.updatedAt ?? null)?.getTime() ?? null,
            item,
            course,
            trail,
          });
        } else if (containerFor(item.providerType)) {
          visit(item.refId, [...trail, { refId: item.refId, title: item.title }]);
        }
      }
    };
    visit(course.refId, []);
  }
  return rows.sort(
    (a, b) =>
      (b.time ?? -Infinity) - (a.time ?? -Infinity) ||
      a.name.localeCompare(b.name, undefined, { numeric: true }),
  );
}
