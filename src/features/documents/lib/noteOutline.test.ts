import { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it } from 'vitest';
import { noteExtensions } from './markdown';
import {
  collectLinks,
  collectOutline,
  collectTasks,
  countWords,
  findMatches,
  noteStats,
} from './noteOutline';

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});

function open(markdown: string) {
  editor = new Editor({ extensions: noteExtensions(), content: markdown, contentType: 'markdown' });
  return editor.state.doc;
}

function textAt(doc: ReturnType<typeof open>, range: { from: number; to: number }) {
  return doc.textBetween(range.from, range.to);
}

describe('note outline', () => {
  it('lists headings up to level three in reading order', () => {
    const doc = open('# Variance\n\nText\n\n## Sample\n\n#### Too deep\n\n### Bessel\n\n##   \n');
    expect(collectOutline(doc).map(({ level, text }) => [level, text])).toEqual([
      [1, 'Variance'],
      [2, 'Sample'],
      [3, 'Bessel'],
    ]);
  });

  it('points each entry at its heading node', () => {
    const doc = open('Intro\n\n## Sample\n');
    const [entry] = collectOutline(doc);
    expect(doc.nodeAt(entry!.pos)?.type.name).toBe('heading');
  });
});

describe('note tasks', () => {
  it('lists every checklist item, nested ones included, with its state', () => {
    const doc = open('- [x] rewatch recording\n- [ ] sheet 3\n  - [ ] task 1\n');
    expect(collectTasks(doc).map(({ text, checked }) => [text, checked])).toEqual([
      ['rewatch recording', true],
      ['sheet 3', false],
      ['task 1', false],
    ]);
  });
});

describe('note links', () => {
  it('joins a link split by formatting into one entry', () => {
    const doc = open(
      'See [**Seeing** Theory](https://seeing-theory.brown.edu) and [docs](https://a.b).',
    );
    expect(collectLinks(doc).map(({ text, href }) => [text, href])).toEqual([
      ['Seeing Theory', 'https://seeing-theory.brown.edu'],
      ['docs', 'https://a.b'],
    ]);
  });
});

describe('note stats', () => {
  it('counts words, including hyphenated and German ones, once each', () => {
    expect(countWords('Die Standard-Abweichung ist größer – n − 1!')).toBe(6);
  });

  it('summarises the note for the info panel', () => {
    const doc = open('# Title\n\nOne two three.\n\n- [ ] open\n- [x] done\n');
    expect(noteStats(doc)).toMatchObject({
      words: 6,
      headings: 1,
      tasks: 2,
      openTasks: 1,
      readingMinutes: 1,
    });
  });
});

describe('find in note', () => {
  it('finds matches case-insensitively across formatting, without overlaps', () => {
    const doc = open('**Mito**sis and mitosis.\n\naaa');
    const matches = findMatches(doc, 'MITOSIS');
    expect(matches.map((match) => textAt(doc, match))).toEqual(['Mitosis', 'mitosis']);
    expect(findMatches(doc, 'aa')).toHaveLength(1);
  });

  it('finds nothing for an empty query and never matches across blocks', () => {
    const doc = open('end\n\nstart');
    expect(findMatches(doc, '  ')).toEqual([]);
    expect(findMatches(doc, 'endstart')).toEqual([]);
  });
});
