import { describe, expect, it } from 'vitest';
import emptyListXml from './fixtures/courses-for-user-empty.xml?raw';
import liveCourseXml from './fixtures/course.xml?raw';
import listXml from './fixtures/courses-for-user.xml?raw';
import { parseCourse, parseCourseList } from './parseCourses';
import type { CourseMappingContext } from './parseCourses';

const context: CourseMappingContext = {
  origin: { provider: 'ilias', installation: 'demo.ilias.de' },
  baseUrl: 'https://demo.ilias.de',
};

/**
 * `course.xml` is a real getCourseXML answer from demo.ilias.de (ILIAS 10.11,
 * captured 2026-09-20), which is why the assertions below are about German
 * text and pretty-printed whitespace rather than about a tidy sample.
 */
describe('parseCourse, against the captured response', () => {
  const course = parseCourse(liveCourseXml, '717', context);

  it('trims the title ILIAS pretty-prints across three lines', () => {
    expect(course.title).toBe('Ordner');
  });

  it('reads the description', () => {
    expect(course.description).toBe('Beispiel(e) für die Verwendung des Objekttyps "Ordner"');
  });

  it('keeps the language the metadata declares', () => {
    expect(course.language).toBe('de');
  });

  it('uses the reference id it was given, not the object id in the document', () => {
    // The document says id="il_12895_crs_5584"; 717 is the reference id.
    expect(course.externalId).toBe('717');
    expect(liveCourseXml).toContain('il_12895_crs_5584');
  });

  it('reports no period when ILIAS emitted the element with empty children', () => {
    expect(course.period).toBeNull();
  });

  it('records where the course came from', () => {
    expect(course.origin).toEqual({ provider: 'ilias', installation: 'demo.ilias.de' });
    expect(course.url).toBe('https://demo.ilias.de/goto.php?target=crs_717');
  });
});

describe('parseCourse, on course settings', () => {
  const withPeriod = (start: string, end: string) =>
    `<Course id="il_1_crs_5"><MetaData><General><Title Language="en">Systems</Title></General></MetaData>` +
    `<Settings><Period withTime="1"><Start>${start}</Start><End>${end}</End></Period></Settings></Course>`;

  it('converts the unix seconds ILIAS writes into an ISO instant', () => {
    const course = parseCourse(withPeriod('1727740800', '1738368000'), '5', context);
    expect(course.period).toEqual({
      start: '2024-10-01T00:00:00.000Z',
      end: '2025-02-01T00:00:00.000Z',
    });
  });

  it('treats a zero timestamp as no date, which is how ILIAS writes "unset"', () => {
    expect(parseCourse(withPeriod('0', '0'), '5', context).period).toBeNull();
  });

  it('keeps a half-open period rather than discarding both ends', () => {
    expect(parseCourse(withPeriod('1727740800', ''), '5', context).period).toEqual({
      start: '2024-10-01T00:00:00.000Z',
      end: null,
    });
  });

  it('falls back to a placeholder title instead of an empty course card', () => {
    const course = parseCourse('<Course id="il_1_crs_5"><MetaData/></Course>', '5', context);
    expect(course.title).toBe('5');
  });
});

describe('parseCourseList', () => {
  it('unwraps the result set and maps each course document inside it', () => {
    const courses = parseCourseList(listXml, context);
    expect(courses).toHaveLength(1);
    expect(courses[0]?.externalId).toBe('717');
    expect(courses[0]?.title).toBe('Ordner');
  });

  it('returns nothing for the empty result set ILIAS sends when there is nothing to show', () => {
    expect(parseCourseList(emptyListXml, context)).toEqual([]);
  });

  it('addresses columns by name, so a reordered result set still maps', () => {
    const reordered =
      '<result><colspecs><colspec idx="0" name="parent_ref_id"/><colspec idx="1" name="xml"/>' +
      '<colspec idx="2" name="ref_id"/></colspecs><rows><row>' +
      '<column>279</column>' +
      '<column>&lt;Course&gt;&lt;MetaData&gt;&lt;General&gt;&lt;Title&gt;Maths&lt;/Title&gt;&lt;/General&gt;&lt;/MetaData&gt;&lt;/Course&gt;</column>' +
      '<column>717</column>' +
      '</row></rows></result>';

    const [course] = parseCourseList(reordered, context);
    expect(course?.externalId).toBe('717');
    expect(course?.title).toBe('Maths');
  });

  it('returns nothing when the result set is not a course list at all', () => {
    const other =
      '<result><colspecs><colspec idx="0" name="user_id"/></colspecs>' +
      '<rows><row><column>4711</column></row></rows></result>';
    expect(parseCourseList(other, context)).toEqual([]);
  });

  it('keeps the courses it can read when one row is unreadable', () => {
    const mixed =
      '<result><colspecs><colspec idx="0" name="ref_id"/><colspec idx="1" name="xml"/></colspecs><rows>' +
      '<row><column>1</column><column>&lt;not closed</column></row>' +
      '<row><column>2</column><column>&lt;Course&gt;&lt;MetaData&gt;&lt;General&gt;&lt;Title&gt;Physics&lt;/Title&gt;&lt;/General&gt;&lt;/MetaData&gt;&lt;/Course&gt;</column></row>' +
      '</rows></result>';

    const courses = parseCourseList(mixed, context);
    expect(courses.map((course) => course.title)).toEqual(['Physics']);
  });
});
