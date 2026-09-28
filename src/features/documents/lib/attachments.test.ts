import { describe, expect, it } from 'vitest';
import { attachmentName, isImageFile, resolveNoteLink } from './attachments';

const at = new Date(2026, 8, 22, 9, 5, 7);

describe('attachmentName', () => {
  it('gives clipboard images a timestamp instead of the generic name', () => {
    expect(attachmentName({ name: 'image.png', type: 'image/png' }, at)).toBe(
      'image-20260922-090507.png',
    );
    expect(attachmentName({ name: '', type: 'image/jpeg' }, at)).toBe('image-20260922-090507.jpg');
  });

  it('keeps dropped file names readable but safe for Markdown links', () => {
    expect(
      attachmentName({ name: 'Screenshot 2026-09-22 at 09.05.07.png', type: 'image/png' }, at),
    ).toBe('screenshot-2026-09-22-at-09-05-07.png');
    expect(attachmentName({ name: 'Übungsblatt Größen (1).JPEG', type: '' }, at)).toBe(
      'uebungsblatt-groessen-1.jpeg',
    );
    expect(attachmentName({ name: 'Café crème.webp', type: 'image/webp' }, at)).toBe(
      'cafe-creme.webp',
    );
  });
});

describe('isImageFile', () => {
  it('accepts images by type or extension and rejects everything else', () => {
    expect(isImageFile({ name: 'a.png', type: 'image/png' })).toBe(true);
    expect(isImageFile({ name: 'scan.HEIC.svg', type: '' })).toBe(true);
    expect(isImageFile({ name: 'notes.pdf', type: 'application/pdf' })).toBe(false);
    expect(isImageFile({ name: 'clip.tiff', type: 'image/tiff' })).toBe(false);
  });
});

describe('resolveNoteLink', () => {
  it('resolves links relative to the note’s folder', () => {
    expect(resolveNoteLink('Biology/Notes.md', 'attachments/cell.png')).toBe(
      'Biology/attachments/cell.png',
    );
    expect(resolveNoteLink('Notes.md', './attachments/a%20b.png')).toBe('attachments/a b.png');
    expect(resolveNoteLink('Biology/Week 1/Notes.md', '../shared/x.png?raw#top')).toBe(
      'Biology/shared/x.png',
    );
    expect(resolveNoteLink('Notes.md', '<attachments/d e.png>')).toBe('attachments/d e.png');
  });

  it('leaves web, data and escaping links alone', () => {
    for (const src of [
      'https://uni.example/a.png',
      'data:image/png;base64,AAAA',
      '/etc/passwd',
      '../outside.png',
      '',
    ])
      expect(resolveNoteLink('Notes.md', src)).toBeNull();
  });
});
