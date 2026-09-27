import { describe, expect, it } from 'vitest';
import { DEFAULT_NOTE_FONT, NOTE_FONTS, noteFont } from './noteFonts';

describe('note fonts', () => {
  it('offers each face once, with a reason to pick it', () => {
    const values = NOTE_FONTS.map((font) => font.value);
    expect(new Set(values).size).toBe(values.length);
    expect(values).toContain(DEFAULT_NOTE_FONT);
    for (const font of NOTE_FONTS) expect(font.description).not.toBe('');
  });

  it('moves the families saved before the catalog onto faces', () => {
    expect(noteFont('sans')).toBe('inter');
    expect(noteFont('serif')).toBe('iowan');
    expect(noteFont('mono')).toBe('quattro');
  });

  it('keeps a face from the catalog and falls back for anything else', () => {
    expect(noteFont('literata')).toBe('literata');
    expect(noteFont('comic-sans')).toBe(DEFAULT_NOTE_FONT);
    expect(noteFont(undefined)).toBe(DEFAULT_NOTE_FONT);
  });
});
