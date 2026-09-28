import { describe, expect, it } from 'vitest';
import { createDataTransfer as transfer } from '@/test/dataTransfer';
import { NAV_ITEMS, NAV_SECTIONS } from './navigation';
import {
  arrangeSections,
  DOCUMENT_DRAG_TYPE,
  favoriteLabel,
  neighbourTarget,
  orderedPaths,
  placeBefore,
  readDocumentDrag,
  readOpenDocument,
  relocate,
  writeDocumentDrag,
} from './sidebar';

const planning = NAV_SECTIONS.find((section) => section.id === 'planning')!;
const { calendar, tasks, focus } = NAV_ITEMS;

describe('placeBefore', () => {
  it('moves a key in front of another', () => {
    expect(placeBefore(['a', 'b', 'c'], 'c', 'a')).toEqual(['c', 'a', 'b']);
    expect(placeBefore(['a', 'b', 'c'], 'a', 'c')).toEqual(['b', 'a', 'c']);
  });

  it('moves to the end without a target, or with one that is gone', () => {
    expect(placeBefore(['a', 'b', 'c'], 'a', null)).toEqual(['b', 'c', 'a']);
    expect(placeBefore(['a', 'b', 'c'], 'a', 'gone')).toEqual(['b', 'c', 'a']);
  });

  it('leaves the order alone when dropped onto itself or its own slot', () => {
    expect(placeBefore(['a', 'b', 'c'], 'b', 'b')).toEqual(['a', 'b', 'c']);
    expect(placeBefore(['a', 'b', 'c'], 'b', 'c')).toEqual(['a', 'b', 'c']);
  });
});

describe('neighbourTarget', () => {
  const keys = ['a', 'b', 'c'];

  it('steps up in front of the previous entry', () => {
    expect(neighbourTarget(keys, 'b', 'up')).toBe('a');
    expect(neighbourTarget(keys, 'a', 'up')).toBeUndefined();
  });

  it('steps down in front of the entry after next, or to the end', () => {
    expect(neighbourTarget(keys, 'a', 'down')).toBe('c');
    expect(neighbourTarget(keys, 'b', 'down')).toBeNull();
    expect(neighbourTarget(keys, 'c', 'down')).toBeUndefined();
  });
});

describe('arrangeSections', () => {
  it('keeps the configured sections when nothing was changed', () => {
    expect(arrangeSections(NAV_SECTIONS, { order: {}, hidden: [] })).toEqual(NAV_SECTIONS);
  });

  it("applies the student's order and leaves hidden entries out", () => {
    const [arranged] = arrangeSections([planning], {
      order: { planning: [focus.path, calendar.path, tasks.path] },
      hidden: [calendar.path],
    });
    expect(arranged?.items).toEqual([focus, tasks]);
  });

  it('appends entries a saved order does not know yet and ignores removed ones', () => {
    expect(orderedPaths(planning, { planning: [focus.path, '/removed'] })).toEqual([
      focus.path,
      calendar.path,
      tasks.path,
    ]);
  });
});

describe('favorites', () => {
  it('drops a note extension from the label but keeps other file types', () => {
    expect(favoriteLabel({ path: 'a/Lecture 3.md', name: 'Lecture 3.md', folder: false })).toBe(
      'Lecture 3',
    );
    expect(favoriteLabel({ path: 'Slides.pdf', name: 'Slides.pdf', folder: false })).toBe(
      'Slides.pdf',
    );
    expect(favoriteLabel({ path: 'Math.md', name: 'Math.md', folder: true })).toBe('Math.md');
  });

  it('follows a moved folder to everything inside it, and nothing beside it', () => {
    expect(relocate('Biology', 'Biology', 'Science/Biology')).toBe('Science/Biology');
    expect(relocate('Biology/Cells.md', 'Biology', 'Bio')).toBe('Bio/Cells.md');
    expect(relocate('Biology 2/Cells.md', 'Biology', 'Bio')).toBe('Biology 2/Cells.md');
  });

  it('round-trips a document through a drag', () => {
    const data = transfer();
    writeDocumentDrag(data, { path: 'Biology', name: 'Biology', folder: true });
    expect(data.types).toContain(DOCUMENT_DRAG_TYPE);
    expect(data.getData('text/plain')).toBe('Biology');
    expect(readDocumentDrag(data)).toEqual({ path: 'Biology', name: 'Biology', folder: true });
  });

  it('rejects drags that are not documents or come from Recently deleted', () => {
    const data = transfer();
    expect(readDocumentDrag(data)).toBeNull();
    data.setData(DOCUMENT_DRAG_TYPE, '{not json');
    expect(readDocumentDrag(data)).toBeNull();
    writeDocumentDrag(data, { path: '.trash/Old.md', name: 'Old.md', folder: false });
    expect(readDocumentDrag(data)).toBeNull();
  });

  it('reads the document a favorite link asks the Documents page to open', () => {
    const favorite = { path: 'Biology', name: 'Biology', folder: true };
    expect(readOpenDocument({ openDocument: favorite })).toEqual(favorite);
    expect(readOpenDocument(null)).toBeNull();
    expect(readOpenDocument({ openDocument: { path: 3 } })).toBeNull();
  });
});
