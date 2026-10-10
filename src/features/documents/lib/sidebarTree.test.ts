import { describe, expect, it } from 'vitest';
import type { DocumentEntry } from '@/features/documents/lib/files';
import { closeAll, foldersAbove, isFolderOpen, openFolders, reveal } from './sidebarTree';

const entry = (path: string, folder: boolean): DocumentEntry => ({
  name: path.split('/').at(-1) ?? path,
  path,
  folder,
  size: 0,
  modified: 0,
});

const lists = {
  '': [entry('Courses', true), entry('Inbox.md', false)],
  Courses: [entry('Courses/Winter', true), entry('Courses/Plan.md', false)],
  'Courses/Winter': [entry('Courses/Winter/Databases', true)],
};

describe('sidebar tree', () => {
  it('names the folders above a path, outermost first', () => {
    expect(foldersAbove('a/b/c.md')).toEqual(['a', 'a/b']);
    expect(foldersAbove('a')).toEqual([]);
    expect(foldersAbove('')).toEqual([]);
  });

  it('opens the folders above a path and leaves the rest alone', () => {
    const open = { Other: false };
    expect(reveal(open, 'Courses/Winter/Plan.md')).toEqual({
      Other: false,
      Courses: true,
      'Courses/Winter': true,
    });
    expect(reveal({ Courses: false }, 'Courses/Plan.md')).toEqual({ Courses: true });
  });

  it('keeps the same object when everything above is open already', () => {
    const open = { Courses: true };
    expect(reveal(open, 'Courses/Plan.md')).toBe(open);
  });

  it('opens the top of a space by default and everything deeper only when asked', () => {
    expect(isFolderOpen({}, 'Courses', 0)).toBe(true);
    expect(isFolderOpen({}, 'Courses/Winter', 1)).toBe(false);
    expect(isFolderOpen({ Courses: false }, 'Courses', 0)).toBe(false);
    expect(isFolderOpen({ 'Courses/Winter': true }, 'Courses/Winter', 1)).toBe(true);
  });

  it('lists the open folders one level at a time', () => {
    expect(openFolders('', {}, {})).toEqual([]);
    expect(openFolders('', { '': lists[''] }, {})).toEqual(['Courses']);
    expect(openFolders('', lists, {})).toEqual(['Courses']);
    expect(openFolders('', lists, { 'Courses/Winter': true })).toEqual([
      'Courses',
      'Courses/Winter',
    ]);
    expect(openFolders('', lists, { Courses: false, 'Courses/Winter': true })).toEqual([]);
  });

  it('closes every folder that is listed', () => {
    expect(closeAll(lists)).toEqual({
      Courses: false,
      'Courses/Winter': false,
      'Courses/Winter/Databases': false,
    });
  });
});
