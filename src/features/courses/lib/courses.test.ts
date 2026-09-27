import { describe, expect, it } from 'vitest';
import type { IliasContentItem, IliasCourse } from '@/features/integrations/lib/iliasSync';
import {
  containerFor,
  dueLabel,
  formatIliasDate,
  formatSize,
  groupByBlock,
  groupCourses,
  iliasTarget,
  itemKind,
  splitCourseTitle,
} from './courses';

function course(refId: string, area: string | null, online = true): IliasCourse {
  return {
    refId,
    providerType: 'crs',
    title: `Kurs ${refId}`,
    description: null,
    area,
    online,
    period: null,
    properties: [],
  };
}

function item(refId: string, block: string | null): IliasContentItem {
  return {
    refId,
    parentRefId: '1',
    providerType: 'fold',
    title: `Ordner ${refId}`,
    description: null,
    block,
    file: null,
    properties: [],
  };
}

describe('groupCourses', () => {
  it('groups online courses by area in ILIAS order and keeps offline ones apart', () => {
    const { areas, offline } = groupCourses([
      course('1', 'H1 Mathematik'),
      course('2', 'H2 Theorie', false),
      course('3', 'H1 Mathematik'),
      course('4', null),
    ]);
    expect(areas.map((area) => [area.name, area.courses.map((c) => c.refId)])).toEqual([
      ['H1 Mathematik', ['1', '3']],
      ['Other courses', ['4']],
    ]);
    expect(offline.map((c) => c.refId)).toEqual(['2']);
  });
});

describe('splitCourseTitle', () => {
  it('takes the module number off the front, as HHN writes it', () => {
    expect(splitCourseTitle('262058 Datenbanken 1 - WS25')).toEqual({
      code: '262058',
      name: 'Datenbanken 1 - WS25',
    });
    expect(splitCourseTitle('261835/262135 Praktisches Studiensemester')).toEqual({
      code: '261835/262135',
      name: 'Praktisches Studiensemester',
    });
  });

  it('leaves a title without one alone', () => {
    expect(splitCourseTitle('Allgemeine Unterweisung 2024')).toEqual({
      code: null,
      name: 'Allgemeine Unterweisung 2024',
    });
  });
});

describe('groupByBlock', () => {
  it('keeps ILIAS order and starts a block where the heading changes', () => {
    const blocks = groupByBlock([item('1', 'Part 1'), item('2', 'Part 1'), item('3', 'Part 2')]);
    expect(blocks.map((block) => [block.title, block.items.length])).toEqual([
      ['Part 1', 2],
      ['Part 2', 1],
    ]);
  });
});

describe('what a row is', () => {
  it('opens containers here and everything else in ILIAS', () => {
    expect(itemKind('fold')).toBe('folder');
    expect(itemKind('grp')).toBe('folder');
    expect(itemKind('file')).toBe('file');
    expect(itemKind('exc')).toBe('exercise');
    expect(itemKind('webr')).toBe('link');
    expect(itemKind('tst')).toBe('other');
    expect(containerFor('fold')).toBe('fold');
    expect(containerFor('file')).toBeNull();
    expect(iliasTarget('file', '967852')).toBe('file_967852');
  });
});

describe('formatting', () => {
  it('writes sizes the way a person reads them', () => {
    expect(formatSize(812)).toBe('812 B');
    expect(formatSize(51087)).toBe('49.9 KB');
    expect(formatSize(2516582)).toBe('2.4 MB');
    expect(formatSize(null)).toBeNull();
  });

  it('writes ILIAS dates with or without the time', () => {
    expect(formatIliasDate('2025-09-15T08:41')).toBe('15 Sep 2025, 08:41');
    expect(formatIliasDate('2026-03-01')).toBe('1 Mar 2026');
    expect(formatIliasDate('Heute, 10:12')).toBeNull();
    expect(formatIliasDate(null)).toBeNull();
  });

  it('says where a deadline stands', () => {
    const now = new Date(2026, 8, 25, 12, 0);
    expect(dueLabel('2025-12-22T23:55', now)).toBe('Ended');
    expect(dueLabel('2026-09-25T23:55', now)).toBe('Due today');
    expect(dueLabel('2026-09-26T09:00', now)).toBe('Due tomorrow');
    expect(dueLabel('2026-09-28T23:55', now)).toBe('Due in 3 days');
    expect(dueLabel(null, now)).toBeNull();
  });
});
