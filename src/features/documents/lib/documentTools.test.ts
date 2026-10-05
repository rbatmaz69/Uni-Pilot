import { describe, expect, it } from 'vitest';
import { availableDocumentTools, parsePageRange, uniqueOutputName } from './documentTools';
import type { DocumentEntry } from './files';

function entry(name: string, folder = false): DocumentEntry {
  return { name, path: name, folder, size: 100, modified: 0 };
}

describe('student file tools', () => {
  it('only offers tools that can process the selected format', () => {
    expect(availableDocumentTools(entry('Photo.HEIC'), [])).toContain('image-pdf');
    expect(availableDocumentTools(entry('Photo.HEIC'), [])).toContain('jpg');
    expect(
      availableDocumentTools(entry('Photo.HEIC'), [entry('Photo.HEIC'), entry('Scan.png')]),
    ).toContain('multi-image-pdf');
    expect(availableDocumentTools(entry('Lecture.pdf'), [entry('Lecture.pdf')])).not.toContain(
      'merge-pdf',
    );
    expect(
      availableDocumentTools(entry('Lecture.pdf'), [entry('Lecture.pdf'), entry('Lab.pdf')]),
    ).toContain('merge-pdf');
    expect(availableDocumentTools(entry('Lecture.pdf'), [entry('Lecture.pdf')])).toContain(
      'reorder-pdf',
    );
    expect(availableDocumentTools(entry('Essay.docx'), [])).toEqual([]);
    expect(availableDocumentTools(entry('Lecture.md'), [])).toEqual(['note-pdf']);
    expect(availableDocumentTools(entry('Course', true), [])).toEqual([]);
  });

  it('checks page ranges before extracting a PDF', () => {
    expect(parsePageRange('1-3, 5', 8)).toEqual([0, 1, 2, 4]);
    expect(() => parsePageRange('3-1', 8)).toThrow(/ascending/);
    expect(() => parsePageRange('9', 8)).toThrow(/1 to 8/);
    expect(() => parsePageRange('1, 1', 8)).toThrow(/only once/);
    expect(() => parsePageRange('1-x', 8)).toThrow(/page numbers/);
  });

  it('never chooses an existing output name', () => {
    expect(
      uniqueOutputName('Scan (submission).pdf', [
        'scan (submission).PDF',
        'Scan (submission) 2.pdf',
      ]),
    ).toBe('Scan (submission) 3.pdf');
  });
});
