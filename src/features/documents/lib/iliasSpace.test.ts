import { describe, expect, it } from 'vitest';
import type { IliasCourse, IliasFile } from '@/features/documents/lib/files';
import {
  addedAt,
  courseCards,
  courseName,
  courseParent,
  iliasEntry,
  inIliasSpace,
  keptCourses,
  looksSynced,
  newestFiles,
  offlineCourses,
  peekFolder,
} from '@/features/documents/lib/iliasSpace';
import type { IliasCourse as ListedCourse } from '@/features/integrations/lib/iliasSync';

const file = (name: string, extra: Partial<IliasFile> = {}): IliasFile => ({
  name,
  path: `Courses/Winter 2026-27/Datenbanken/ILIAS/${name}`,
  size: 10,
  updatedAt: null,
  arrived: 0,
  ...extra,
});
const course = (root: string, files: IliasFile[] = []): IliasCourse => ({
  courseRefId: root,
  title: 'Datenbanken 1 - WS26',
  root,
  syncedAt: null,
  unseen: 0,
  files,
});
const datenbanken = 'Courses/Winter 2026-27/Datenbanken/ILIAS';

describe('ILIAS space', () => {
  it('dates a file by ILIAS, and by its arrival only when ILIAS gave no date', () => {
    expect(addedAt(file('a', { updatedAt: '2026-09-24T17:05', arrived: 5 }))).toBe(
      new Date(2026, 8, 24, 17, 5).getTime(),
    );
    expect(addedAt(file('b', { arrived: 5 }))).toBe(5);
    expect(addedAt(file('c', { updatedAt: 'gestern', arrived: 7 }))).toBe(7);
  });

  it('lists the files of every course newest first', () => {
    const rows = newestFiles([
      course(datenbanken, [
        file('Blatt 1.pdf', { updatedAt: '2026-10-01T10:00' }),
        file('Blatt 2.pdf', { updatedAt: '2026-10-08T10:00' }),
      ]),
      course('Courses/Winter 2026-27/Analysis/ILIAS', [
        file('Folien.pdf', { updatedAt: '2026-10-05T09:00' }),
      ]),
    ]);
    expect(rows.map((row) => row.name)).toEqual(['Blatt 2.pdf', 'Folien.pdf', 'Blatt 1.pdf']);
    expect(courseName(rows[1]!.course)).toBe('Analysis');
  });

  it('names a course by its folder and the folder it sits in', () => {
    expect(courseName(course(datenbanken))).toBe('Datenbanken');
    expect(courseParent(course(datenbanken))).toBe('Winter 2026-27');
    expect(courseParent(course('Courses/Datenbanken/ILIAS'))).toBeNull();
    expect(courseParent(course('Datenbanken/ILIAS'))).toBeNull();
  });

  it('counts the synced folders to the ILIAS space, but not the course folder around them', () => {
    const courses = [course(datenbanken)];
    expect(inIliasSpace(':ilias', courses)).toBe(true);
    expect(inIliasSpace(datenbanken, courses)).toBe(true);
    expect(inIliasSpace(`${datenbanken}/Folien/Kapitel 1.pdf`, courses)).toBe(true);
    expect(inIliasSpace('Courses/Winter 2026-27/Datenbanken', courses)).toBe(false);
    expect(inIliasSpace(`${datenbanken} (alt)`, courses)).toBe(false);
  });

  it('opens a synced file as the explorer does, new mark included', () => {
    expect(iliasEntry(file('Blatt.pdf', { unseen: true, arrived: 3 }))).toEqual({
      name: 'Blatt.pdf',
      path: `${datenbanken}/Blatt.pdf`,
      folder: false,
      size: 10,
      modified: 3,
      ilias: 'file',
      unseen: 1,
    });
    expect(iliasEntry(file('Alt.pdf', { gone: true })).ilias).toBe('gone');
  });

  const listed = (refId: string, title: string, online = true): ListedCourse => ({
    refId,
    providerType: 'crs',
    title,
    description: null,
    area: null,
    online,
    period: null,
    properties: [],
  });

  it('shows every open course, and the kept ones even once ILIAS closed them', () => {
    const kept = [{ ...course(datenbanken), courseRefId: '7' }];
    const cards = courseCards(
      [
        listed('9', '262147 Informationssicherheit'),
        listed('7', '262009 Datenbanken 1', false),
        listed('10', 'Arbeitssicherheit', false),
      ],
      kept,
    );
    expect(cards.map((card) => [card.refId, card.code, card.name, !!card.synced])).toEqual([
      ['7', '262009', 'Datenbanken 1', true],
      ['9', '262147', 'Informationssicherheit', false],
    ]);
    expect(offlineCourses([listed('10', 'Arbeitssicherheit', false)], kept)).toHaveLength(1);
    expect(offlineCourses([listed('7', 'Datenbanken', false)], kept)).toHaveLength(0);
    // Kept, but ILIAS no longer lists it at all: still a folder.
    expect(courseCards([], kept).map((card) => card.refId)).toEqual(['7']);
  });

  it('counts a course the sync just made a folder for as kept', () => {
    const folder = {
      courseRefId: '9',
      courseTitle: 'Informationssicherheit',
      root: 'Courses/Informationssicherheit/ILIAS',
      auto: true,
      excluded: [],
      syncedAt: null,
      folders: [],
      files: {},
    };
    const kept = keptCourses([course(datenbanken)], { '9': folder });
    expect(kept.map((item) => item.root)).toEqual([datenbanken, folder.root]);
    expect(keptCourses([course(datenbanken)], null)).toHaveLength(1);
  });

  it('lets the newest file of a course peek out of its folder', () => {
    expect(
      peekFolder(
        course(datenbanken, [
          file('Old.pdf', { updatedAt: '2026-09-01T10:00', path: `${datenbanken}/A/Old.pdf` }),
          file('New.pdf', { updatedAt: '2026-10-01T10:00', path: `${datenbanken}/B/New.pdf` }),
        ]),
      ),
    ).toBe(`${datenbanken}/B`);
    expect(peekFolder(course(datenbanken))).toBe(datenbanken);
  });

  it('knows a synced folder by its name before the listing says so', () => {
    expect(looksSynced(`${datenbanken}/Folien`)).toBe(true);
    expect(looksSynced(datenbanken)).toBe(true);
    expect(looksSynced('Courses/ILIAS notes/Idea.md')).toBe(false);
    expect(looksSynced(':ilias')).toBe(false);
  });
});
