import { describe, expect, it } from 'vitest';
import { noteTitle, titleToFileName } from './noteTitle';

describe('note titles', () => {
  it('shows a note’s file name without its extension', () => {
    expect(noteTitle('Lecture 3.md')).toBe('Lecture 3');
    expect(noteTitle('todo.TXT')).toBe('todo');
    expect(noteTitle('v1.2 draft.markdown')).toBe('v1.2 draft');
  });

  it('keeps the extension and tidies whitespace when renaming', () => {
    expect(titleToFileName('  Lecture 3 —\nVariance ', 'Notes.md')).toEqual({
      ok: true,
      fileName: 'Lecture 3 — Variance.md',
    });
    expect(titleToFileName('Plan', 'old.txt')).toEqual({ ok: true, fileName: 'Plan.txt' });
  });

  it.each([
    ['', 'A note needs a title.'],
    ['.hidden', 'A title can’t start with a dot.'],
    ['Ends with.', 'A title can’t end with a dot.'],
    ['Pros/Cons', 'A title can’t contain “/”, which file names don’t allow.'],
    ['Why?', 'A title can’t contain “?”, which file names don’t allow.'],
    ['x'.repeat(240), 'This title is too long for a file name.'],
  ])('refuses %j before asking the backend', (title, reason) => {
    expect(titleToFileName(title, 'Notes.md')).toEqual({ ok: false, reason });
  });
});
