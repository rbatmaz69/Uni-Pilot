/**
 * ILIAS course XML -> Uni Pilot's ExternalCourse.
 *
 * Two shapes arrive here. `getCourseXML` answers with one `<Course>` document.
 * `getCoursesForUser` wraps several of them in an `ilXMLResultSet`, a generic
 * table where the course document sits in a column — which is why the list
 * mapper has to unwrap a table before it can reuse the single mapper.
 */

import type { ExternalCourse, ExternalOrigin, ExternalPeriod } from '../types';
import { objectUrl } from './endpoints';
import { attributeOf, childText, objectIdOf, parseXmlDocument, textOf, toIsoDate } from './xml';

export interface CourseMappingContext {
  origin: ExternalOrigin;
  /** Used to build the deep link back into ILIAS. */
  baseUrl: string;
}

/**
 * Reads one `<Course>` document.
 *
 * `refId` is passed in because the course document does not contain it: it
 * carries the object id (`il_12895_crs_5584`), while every later call —
 * `getTreeChilds`, `goto.php` — needs the reference id. Losing that distinction
 * is the single easiest way to build a connector that cannot open anything.
 */
export function parseCourse(
  xml: string,
  refId: string,
  context: CourseMappingContext,
): ExternalCourse {
  const document = parseXmlDocument(xml);
  const course = document.getElementsByTagName('Course')[0] ?? null;
  const general = document.getElementsByTagName('General')[0] ?? null;

  const titleElement = general?.getElementsByTagName('Title')[0] ?? null;

  return {
    origin: context.origin,
    externalId: refId,
    // The object id is not the identity used elsewhere, so it is not kept as
    // the external id; it is only worth reading to notice it differs.
    title: titleElement?.textContent?.trim() ?? objectIdOf(attributeOf(course, 'id')) ?? 'Untitled',
    description: general ? textOf(general, 'Description') : null,
    language: attributeOf(titleElement, 'Language'),
    period: readPeriod(document),
    url: objectUrl(context.baseUrl, refId, 'crs'),
  };
}

/**
 * Reads the `ilXMLResultSet` that `getCoursesForUser` answers with.
 *
 * The table is self-describing: `<colspecs>` names the columns and each
 * `<row>` holds `<column>` values in that order. Columns are addressed by name
 * rather than by index because ILIAS numbers `colspec idx` inconsistently —
 * `getCoursesForUser` emits 0, 1, 2, while other calls emit 0 for every one.
 */
export function parseCourseList(
  resultSetXml: string,
  context: CourseMappingContext,
): ExternalCourse[] {
  const document = parseXmlDocument(resultSetXml);

  const columnNames = Array.from(document.getElementsByTagName('colspec')).map(
    (spec) => spec.getAttribute('name') ?? '',
  );
  const refIdColumn = columnNames.indexOf('ref_id');
  const xmlColumn = columnNames.indexOf('xml');
  if (refIdColumn === -1 || xmlColumn === -1) return [];

  const courses: ExternalCourse[] = [];
  for (const row of Array.from(document.getElementsByTagName('row'))) {
    const columns = Array.from(row.getElementsByTagName('column'));
    const refId = columns[refIdColumn]?.textContent?.trim();
    const courseXml = columns[xmlColumn]?.textContent?.trim();
    if (!refId || !courseXml) continue;

    try {
      courses.push(parseCourse(courseXml, refId, context));
    } catch {
      // One unreadable course must not cost the student the whole list.
      continue;
    }
  }
  return courses;
}

/**
 * `Period` holds the course runtime as unix seconds, and ILIAS emits the
 * element with empty children when no dates are set — so "present" is not the
 * same as "has a period".
 */
function readPeriod(document: Document): ExternalPeriod | null {
  const period = document.getElementsByTagName('Period')[0];
  if (!period) return null;

  const start = toIsoDate(childText(period, 'Start'));
  const end = toIsoDate(childText(period, 'End'));
  return start || end ? { start, end } : null;
}
