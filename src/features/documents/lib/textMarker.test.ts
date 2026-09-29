import { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it } from 'vitest';
import { composeNote, noteExtensions } from './markdown';
import {
  classifySentence,
  setTextMarker,
  splitSentences,
  TextMarker,
  textMarkerTally,
  type SentenceKind,
} from './textMarker';

const sentences = (text: string) =>
  splitSentences(text).map(({ from, to }) => text.slice(from, to));

describe('sentences', () => {
  it('ends at its mark and keeps closing quotes with it', () => {
    expect(sentences('It rains. Does it? Yes! "Stop." Then go…  Done')).toEqual([
      'It rains.',
      'Does it?',
      'Yes!',
      '"Stop."',
      'Then go…',
      'Done',
    ]);
  });

  it('reads past abbreviations, initials, ordinals, decimals and addresses', () => {
    expect(
      sentences('Viele Tiere, z. B. Katzen, schlafen am 3. Mai 12.5 Stunden. Dr. Weber sagt das.'),
    ).toEqual([
      'Viele Tiere, z. B. Katzen, schlafen am 3. Mai 12.5 Stunden.',
      'Dr. Weber sagt das.',
    ]);
    expect(
      sentences(
        'Use a heap, e.g. Fibonacci heaps. J. S. Bach wrote it in 1723. See www.example.org.',
      ),
    ).toEqual([
      'Use a heap, e.g. Fibonacci heaps.',
      'J. S. Bach wrote it in 1723.',
      'See www.example.org.',
    ]);
  });

  it('runs on into lowercase text and always ends at a line break', () => {
    expect(sentences('Hmm... okay then. Well?! Fine\nNext line')).toEqual([
      'Hmm... okay then.',
      'Well?!',
      'Fine',
      'Next line',
    ]);
  });
});

describe('sentence roles', () => {
  it.each<[string, SentenceKind]>([
    ['A stack is a data structure that stores items in order.', 'definition'],
    ['Entropie: ein Maß für die Unordnung eines Systems.', 'definition'],
    ['Unter Inflation versteht man einen anhaltenden Anstieg des Preisniveaus.', 'definition'],
    ['The Treaty of Versailles was signed in 1919.', 'fact'],
    ['Laut Statistischem Bundesamt studieren 2,9 Mio. Menschen in Deutschland.', 'fact'],
    ['Motivation drops sharply after the first week (Smith, 2020).', 'fact'],
    ['Social media always leads to worse grades.', 'claim'],
    ['Deshalb muss jede Funktion getestet werden.', 'claim'],
    ['I think the second lecture was far more interesting.', 'opinion'],
    ['Meiner Meinung nach sollte man früher anfangen.', 'opinion'],
    ['However, the effect might disappear in larger samples.', 'qualification'],
    ['Das gilt allerdings nur teilweise.', 'qualification'],
    ['All students may pass the exam.', 'qualification'],
  ])('reads “%s” as %s', (sentence, kind) => {
    expect(classifySentence(sentence)).toBe(kind);
  });

  it('leaves questions and sentences without a cue unmarked', () => {
    expect(classifySentence('Does this always hold?')).toBeNull();
    expect(classifySentence('The lecture starts after lunch.')).toBeNull();
    expect(classifySentence('   ')).toBeNull();
  });
});

describe('Textmarker in the editor', () => {
  let editor: Editor | null = null;
  afterEach(() => {
    editor?.destroy();
    editor = null;
  });

  function open(markdown: string) {
    editor = new Editor({
      element: document.createElement('div'),
      extensions: [...noteExtensions(), TextMarker],
      content: markdown,
      contentType: 'markdown',
    });
    return editor;
  }
  const on = (current: Editor, only: SentenceKind | null = null) =>
    setTextMarker(current.view, { enabled: true, only });
  /** The text under each role's ink, joined across the pieces a sentence is drawn in. */
  const inked = (current: Editor, kind: SentenceKind) =>
    Array.from(
      current.view.dom.querySelectorAll(`.text-marker.is-${kind}`),
      (piece) => piece.textContent,
    ).join('');
  const piece = (current: Editor, selector: string, text: string) =>
    Array.from(current.view.dom.querySelectorAll<HTMLElement>(selector)).find(
      (element) => element.textContent === text,
    );

  it('marks nothing until it is turned on, then inks each sentence by its role', () => {
    const current = open('I think this is great. It was founded in 1998. The bus is red.');
    expect(current.view.dom.querySelector('.text-marker')).toBeNull();
    expect(textMarkerTally(current.state)).toBeNull();

    on(current);
    expect(inked(current, 'opinion')).toBe('I think this is great.');
    expect(inked(current, 'fact')).toBe('It was founded in 1998.');
    expect(current.view.dom.textContent).toContain('The bus is red.');
    expect(textMarkerTally(current.state)).toMatchObject({
      opinion: 'I think this is great.'.length,
      fact: 'It was founded in 1998.'.length,
      plain: 'The bus is red.'.length,
    });
  });

  it('feathers the first and last word into the neighbouring sentence', () => {
    const current = open('I think this is great. It was founded in 1998.');
    on(current);
    const firstWord = piece(current, '.is-marker-start', 'I');
    expect(firstWord).toHaveClass('text-marker', 'is-opinion');
    expect(firstWord?.getAttribute('style') ?? '').not.toContain('--marker-before');
    expect(piece(current, '.is-marker-end', 'great.')?.getAttribute('style')).toContain(
      '--marker-after: var(--marker-fact)',
    );
    expect(piece(current, '.is-marker-start', 'It')?.getAttribute('style')).toContain(
      '--marker-before: var(--marker-opinion)',
    );
  });

  it('spotlights one role and lets the others fade without tinting its edges', () => {
    const current = open('I think this is great. It was founded in 1998.');
    on(current, 'fact');
    for (const element of current.view.dom.querySelectorAll('.is-opinion'))
      expect(element).toHaveClass('is-muted');
    expect(current.view.dom.querySelector('.is-opinion.is-marker-start')).toBeNull();
    expect(piece(current, '.is-marker-start', 'It')?.getAttribute('style')).toBeNull();
    expect(current.view.dom.querySelector('.is-fact.is-muted')).toBeNull();
  });

  it('leaves headings and code alone and counts a footnote as a source', () => {
    const current = open(
      '# I think headings are great\n\n```\nI think code is great.\n```\n\nWater boils early[^1].\n\n[^1]: Source.\n',
    );
    on(current);
    expect(current.view.dom.querySelector('h1 .text-marker, pre .text-marker')).toBeNull();
    expect(inked(current, 'fact')).toContain('Water boils early');
  });

  it('follows edits and never changes the saved note or its undo history', () => {
    const markdown = 'The bus is red.';
    const current = open(markdown);
    on(current);
    expect(current.view.dom.querySelector('.text-marker')).toBeNull();
    current.commands.insertContentAt(current.state.doc.content.size - 1, ' I think it is great.');
    expect(inked(current, 'opinion')).toBe('I think it is great.');
    expect(composeNote('', current.getMarkdown())).toBe('The bus is red. I think it is great.\n');
    current.commands.undo();
    expect(composeNote('', current.getMarkdown())).toBe(`${markdown}\n`);
    expect(textMarkerTally(current.state)).not.toBeNull();

    setTextMarker(current.view, { enabled: false, only: null });
    current.commands.insertContentAt(1, 'I think ');
    expect(current.view.dom.querySelector('.text-marker')).toBeNull();
    current.commands.undo();
    expect(composeNote('', current.getMarkdown())).toBe(`${markdown}\n`);
  });
});
