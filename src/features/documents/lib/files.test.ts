import { describe, expect, it } from 'vitest';
import { lockedReason, type DocumentEntry } from '@/features/documents/lib/files';

const folder: DocumentEntry = {
  name: 'ILIAS',
  path: 'Courses/Summer 2026/Datenbanken/ILIAS',
  folder: true,
  size: 0,
  modified: 1000,
};

describe('lockedReason', () => {
  it('explains why the managed ILIAS root folder cannot be changed', () => {
    expect(lockedReason({ ...folder, ilias: 'root' })).toBe(
      'This folder is kept in sync with ILIAS. Stop syncing the course in Courses to change it.',
    );
  });

  it('allows a plain entry with no ILIAS mark', () => {
    expect(lockedReason(folder)).toBeNull();
  });

  it.each(['folder', 'file', 'gone'] as const)('allows entries marked %s', (ilias) => {
    expect(lockedReason({ ...folder, ilias })).toBeNull();
  });

  it('allows an entry explicitly marked null', () => {
    expect(lockedReason({ ...folder, ilias: null })).toBeNull();
  });
});
