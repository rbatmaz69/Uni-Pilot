import { describe, expect, it } from 'vitest';
import type { DocumentEntry } from '@/features/documents/lib/files';
import {
  DOCUMENTS,
  ILIAS,
  looseFiles,
  resolveSpace,
  SPACE_TONES,
  spaceFolders,
  spaceTones,
  within,
  type Space,
} from '@/features/documents/lib/spaces';

const entry = (name: string, folder: boolean, modified = 0): DocumentEntry => ({
  name,
  path: name,
  folder,
  size: 0,
  modified,
});

describe('spaces', () => {
  const personal: Space = { id: 'p', name: 'Personal', folder: 'Personal' };
  const work: Space = { id: 'w', name: 'Work', folder: 'Personal/Job' };
  const synced = 'Courses/Winter 2026-27/Datenbanken/ILIAS';
  const inIlias = (path: string) => path === ':ilias' || path.startsWith(synced);
  const resolve = (path: string, picked: string | null = null) =>
    resolveSpace(path, [personal, work], picked, inIlias);

  it('tells whether a path lies in a folder, the whole workspace holding every one', () => {
    expect(within('', 'Anything/Deep.md')).toBe(true);
    expect(within('Personal', 'Personal')).toBe(true);
    expect(within('Personal', 'Personal/Routines/Sunday.md')).toBe(true);
    expect(within('Personal', 'Personal notes/Idea.md')).toBe(false);
    expect(within('', ':ilias')).toBe(false);
  });

  it('keeps the picked space while the path lies in it', () => {
    expect(resolve('Personal/Job/Plan.md', DOCUMENTS)).toBe(DOCUMENTS);
    expect(resolve(`${synced}/Folien`, DOCUMENTS)).toBe(DOCUMENTS);
    expect(resolve('Personal/Job', 'p')).toBe('p');
    expect(resolve(`${synced}/Folien`, ILIAS)).toBe(ILIAS);
  });

  it('otherwise finds ILIAS for a synced folder, then the closest added space', () => {
    expect(resolve(':ilias', DOCUMENTS)).toBe(ILIAS);
    expect(resolve(`${synced}/Folien`)).toBe(ILIAS);
    expect(resolve('Personal/Job/Plan.md')).toBe('w');
    expect(resolve('Personal/Routines', 'w')).toBe('p');
    expect(resolve('Biology', 'p')).toBe(DOCUMENTS);
    expect(resolve('.trash', 'p')).toBe(DOCUMENTS);
  });

  it('gives every space a hue of its own', () => {
    const names = ['Courses', 'Personal', 'Work', 'Misc', 'Sport'];
    const tones = spaceTones(names);
    expect(new Set(tones.values()).size).toBe(names.length);
    for (const tone of tones.values()) expect(SPACE_TONES).toContain(tone);
    // The hue follows the name, whatever order the spaces come in.
    expect(spaceTones([...names].reverse())).toEqual(tones);
  });

  it('keeps a space its hue when an unrelated one is added', () => {
    const before = spaceTones(['Courses', 'Personal']);
    const after = spaceTones(['Courses', 'Personal', 'Zeichnen']);
    expect(after.get('Courses')).toBe(before.get('Courses'));
    expect(after.get('Personal')).toBe(before.get('Personal'));
  });

  it('shares hues only once every hue is taken', () => {
    const names = Array.from({ length: SPACE_TONES.length + 1 }, (_, index) => `Space ${index}`);
    expect(new Set(spaceTones(names).values()).size).toBe(SPACE_TONES.length);
  });

  it('lists folders by name and loose files latest first', () => {
    const entries = [
      entry('Week 10', true),
      entry('Old.md', false, 1),
      entry('Week 2', true),
      entry('New.md', false, 3),
      entry('Slides.pdf', false, 2),
    ];
    expect(spaceFolders(entries).map((item) => item.name)).toEqual(['Week 2', 'Week 10']);
    expect(looseFiles(entries).map((item) => item.name)).toEqual([
      'New.md',
      'Slides.pdf',
      'Old.md',
    ]);
  });
});
