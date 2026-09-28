import { describe, expect, it } from 'vitest';
import { folderCardSize, outsideFolder, packFolder } from './folderLayout';
import type { DocumentEntry } from './files';

const entry = (name: string): DocumentEntry => ({
  name,
  path: `Study/${name}`,
  folder: false,
  size: 100,
  modified: 0,
});

describe('automatic folder arrangement', () => {
  const entries = Array.from({ length: 22 }, (_, index) => entry(`${index}.png`));
  const dimensions = Object.fromEntries(
    entries.map((file, index) => [
      file.path,
      { width: [600, 1200, 800][index % 3]!, height: [900, 600, 800][index % 3]! },
    ]),
  );

  it('packs mixed proportions without overlapping or stretching previews', () => {
    const layout = packFolder(entries, dimensions);
    const cards = Object.values(layout.cards);
    cards.forEach((card, index) => {
      const natural = dimensions[entries[index]!.path]!;
      expect(card.width / card.height).toBeCloseTo(natural.width / natural.height);
      expect(card.x).toBeGreaterThanOrEqual(layout.bounds.x);
      expect(card.x + card.width).toBeLessThanOrEqual(layout.bounds.x + layout.bounds.width + 0.01);
      cards.slice(index + 1).forEach((other) => {
        expect(
          card.x + card.width <= other.x ||
            other.x + other.width <= card.x ||
            card.y + card.height <= other.y ||
            other.y + other.height <= card.y,
        ).toBe(true);
      });
    });
    expect(layout.bounds.x + layout.bounds.width / 2).toBeCloseTo(500);
  });

  it('restores the same arrangement when an item is returned, regardless of input order', () => {
    const original = packFolder(entries, dimensions);
    const remaining = entries.slice(1);
    expect(packFolder(remaining, dimensions).cards).not.toEqual(original.cards);
    expect(packFolder([...remaining.reverse(), entries[0]!], dimensions)).toEqual(original);
  });

  it('uses a compact arrangement for a small collection', () => {
    const result = packFolder(entries.slice(0, 3));
    expect(new Set(Object.values(result.cards).map((card) => card.x)).size).toBeGreaterThan(1);
    expect(result.bounds.height).toBeLessThan(400);
  });

  it('centres a single item and handles an empty folder', () => {
    const single = packFolder([entry('Note.md')]);
    const card = Object.values(single.cards)[0]!;
    expect(card.x + card.width / 2).toBeCloseTo(500);
    expect(packFolder([]).bounds).toEqual({ x: 500, y: 108, width: 0, height: 0 });
  });

  it('gives short notes smaller frames and keeps a margin for extraction', () => {
    const note = entry('Note.md');
    expect(folderCardSize(note, { width: 760, height: 600 }).height).toBeLessThan(
      folderCardSize(note).height,
    );
    const { bounds } = packFolder([note]);
    expect(outsideFolder({ x: bounds.x - 40, y: bounds.y }, bounds)).toBe(false);
    expect(outsideFolder({ x: bounds.x - 43, y: bounds.y }, bounds)).toBe(true);
  });
});
