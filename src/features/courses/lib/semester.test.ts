import { describe, expect, it } from 'vitest';
import type { IliasCourse } from '@/features/integrations/lib/iliasSync';
import { courseFolderName, courseTarget, semesterLabel, semesterOf } from './semester';

function course(title: string, start: string | null = null): IliasCourse {
  return {
    refId: '100100',
    providerType: 'crs',
    title,
    description: null,
    area: null,
    online: true,
    period: start ? { start, end: null } : null,
    properties: [],
  };
}

const label = (title: string, start: string | null = null) => {
  const semester = semesterOf(course(title, start));
  return semester ? semesterLabel(semester) : null;
};

describe('the semester of a course', () => {
  /** Every spelling seen in HHN course titles. */
  it.each([
    ['262058 Datenbanken 1 - WS25', 'Winter 2025-26'],
    ['262009 Logik und Künstliche Intelligenz SoSe 2023 B.Heußen', 'Summer 2023'],
    ['Allgemeine Unterweisung "Arbeitssicherheit für Studierende" - 2024 WS', 'Winter 2024-25'],
    ['261835/262135 Praktisches Studiensemester und Praktikantenkolloquium 2025 SS', 'Summer 2025'],
    [
      '261835/262135 Praktisches Studiensemester und Praktikantenkolloquium 2026 WS',
      'Winter 2026-27',
    ],
    ['Mathematik 2 WiSe 24/25', 'Winter 2024-25'],
    ['Mathematik 2 Wintersemester 2025/2026', 'Winter 2025-26'],
    ['Programmieren SS25', 'Summer 2025'],
  ])('reads %s as %s', (title, expected) => {
    expect(label(title)).toBe(expected);
  });

  it('does not read "Studiensemester" as a semester of its own', () => {
    expect(label('Praktisches Studiensemester')).toBeNull();
  });

  it('falls back on when the course runs', () => {
    expect(label('262147 Informationssicherheit', '2026-04-13')).toBe('Summer 2026');
    expect(label('Datenbanken', '2026-10-01')).toBe('Winter 2026-27');
    expect(label('Datenbanken', '2027-01-15')).toBe('Winter 2026-27');
  });

  it('says nothing when neither title nor period does', () => {
    expect(label('262009 Logik und Künstliche Intelligenz')).toBeNull();
  });
});

describe('the course folder', () => {
  it('drops the module number and the semester the folder above names', () => {
    expect(courseFolderName('262058 Datenbanken 1 - WS25')).toBe('Datenbanken 1');
    expect(courseFolderName('261835/262135 Praktikantenkolloquium 2025 SS')).toBe(
      'Praktikantenkolloquium',
    );
    expect(courseFolderName('262009 Logik und Künstliche Intelligenz SoSe 2023 B.Heußen')).toBe(
      'Logik und Künstliche Intelligenz B.Heußen',
    );
    expect(courseFolderName('262009 Logik und Künstliche Intelligenz')).toBe(
      'Logik und Künstliche Intelligenz',
    );
  });

  it('tells the sync which course and where it goes', () => {
    expect(courseTarget(course('262058 Datenbanken 1 - WS25'))).toEqual({
      refId: '100100',
      container: 'crs',
      title: 'Datenbanken 1',
      semester: 'Winter 2025-26',
    });
    expect(courseTarget({ ...course('Lerngruppe'), providerType: 'grp' })).toMatchObject({
      container: 'grp',
      semester: null,
    });
  });
});
