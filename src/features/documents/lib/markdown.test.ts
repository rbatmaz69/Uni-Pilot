import { Editor, type JSONContent } from '@tiptap/core';
import { afterEach, describe, expect, it } from 'vitest';
import { createNoteVisual } from './noteVisuals';
import { createToggle } from './noteDetails';
import type { DrawingPresetId } from './drawingPresets';
import {
  composeNote,
  escapeMarkdownText,
  findContentLoss,
  noteExtensions,
  splitFrontMatter,
} from './markdown';

let editor: Editor | null = null;

afterEach(() => {
  editor?.destroy();
  editor = null;
});

function notes() {
  editor ??= new Editor({ extensions: noteExtensions() });
  return editor;
}

/** Opens `markdown` in the editor and returns what saving it would write. */
function save(markdown: string) {
  notes().commands.setContent(markdown, { contentType: 'markdown' });
  return composeNote('', notes().getMarkdown());
}

function paragraph(text: string): JSONContent {
  return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] };
}

describe('note Markdown round trip', () => {
  it.each([
    ['nested lists', '- one\n  - nested a\n  - nested b\n- two\n'],
    ['task lists', '- [ ] read chapter 3\n- [x] submit sheet\n'],
    ['multi-paragraph quotes', '> line one\n> line two\n>\n> second paragraph\n'],
    ['code with a language', '```python\nprint("hi")\n```\n'],
    ['deep headings', '#### Four\n\n###### Six\n'],
    ['ordered list start', '3. three\n4. four\n'],
    ['hard breaks', 'line one  \nline two\n'],
    ['strike and highlight', '~~gone~~ and ==marked==\n'],
    ['links with underscores', '[Sheet](https://uni.example/blatt_03_final.pdf)\n'],
    ['attachment images', '![Slide 4](attachments/slide-4.png)\n'],
    ['snake_case and maths', 'my_var_name is 2 \\* 3 \\* 4\n'],
  ])('keeps %s unchanged', (_name, markdown) => {
    expect(save(markdown)).toBe(markdown);
  });

  it('keeps tables instead of dropping them', () => {
    const saved = save('| a | b |\n| --- | --- |\n| 1 | 2 |\n');
    expect(saved).toMatch(/^\| a +\| b +\|\n\| -+ \| -+ \|\n\| 1 +\| 2 +\|\n$/);
    expect(save(saved)).toBe(saved);
  });

  it('keeps styled, resized and merged tables editable through Markdown and HTML', () => {
    const current = notes();
    current.commands.setContent({
      type: 'doc',
      content: [
        {
          type: 'table',
          attrs: { variant: 'striped', density: 'spacious', tone: 'blue' },
          content: [
            {
              type: 'tableRow',
              content: [
                {
                  type: 'tableHeader',
                  attrs: {
                    tone: 'yellow',
                    ink: 'green',
                    colspan: 2,
                    colwidth: [180, 220],
                    align: 'center',
                  },
                  content: [paragraph('Study plan').content![0]!],
                },
              ],
            },
            {
              type: 'tableRow',
              content: [
                { type: 'tableHeader', content: [paragraph('Week').content![0]!] },
                {
                  type: 'tableCell',
                  content: [
                    {
                      type: 'paragraph',
                      content: [
                        { type: 'text', text: 'Review', marks: [{ type: 'bold' }] },
                        { type: 'text', text: ' & discuss | a < b' },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    const before = current.getJSON();
    const markdown = current.getMarkdown();
    expect(markdown).toContain('<table');
    expect(markdown).toContain('data-note-table-variant="striped"');
    current.commands.setContent(markdown, { contentType: 'markdown' });
    expect(current.getJSON()).toEqual(before);
    expect(current.getMarkdown()).toBe(markdown);
    current.commands.setContent(current.getHTML());
    expect(current.getJSON()).toEqual(before);
  });

  it('keeps alignment on one cell without applying it to the whole column', () => {
    const current = notes();
    current.commands.setContent({
      type: 'doc',
      content: [
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [
                {
                  type: 'tableHeader',
                  attrs: { align: 'center' },
                  content: [paragraph('A').content![0]!],
                },
                { type: 'tableHeader', content: [paragraph('B').content![0]!] },
              ],
            },
            {
              type: 'tableRow',
              content: [
                { type: 'tableCell', content: [paragraph('1').content![0]!] },
                { type: 'tableCell', content: [paragraph('2').content![0]!] },
              ],
            },
          ],
        },
      ],
    });
    const before = current.getJSON();
    const markdown = current.getMarkdown();
    expect(markdown).toContain('<table');
    current.commands.setContent(markdown, { contentType: 'markdown' });
    expect(current.getJSON()).toEqual(before);
  });

  it('does not grow blank lines around a table from one save to the next', () => {
    const first = save('## Phases\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n\n> after\n');
    const second = save(first);
    expect(save(second)).toBe(second);
    expect(second).toBe(first);
    // No empty paragraphs between the blocks; the editor only keeps a trailing
    // one to type into after the quote, and that one is never written.
    expect(
      notes()
        .getJSON()
        .content?.map((node) => node.type),
    ).toEqual(['heading', 'table', 'blockquote', 'paragraph']);
    expect(notes().getJSON().content?.at(-1)?.content).toBeUndefined();
  });

  it('writes underline as HTML other apps render, and still reads the older ++ form', () => {
    expect(save('<u>underlined</u> text\n')).toBe('<u>underlined</u> text\n');
    expect(save('++underlined++ text\n')).toBe('<u>underlined</u> text\n');
  });

  it('keeps plain ampersands and comparisons readable in the file', () => {
    expect(save('Tom & Jerry <3 and a < b > c\n')).toBe('Tom & Jerry <3 and a < b > c\n');
  });

  it.each([
    '# not a heading',
    '- not a list',
    '+ not a list',
    '1. Semester',
    '2) not ordered',
    '> not a quote',
    '---',
    '    not code',
    '```',
    '[ ] not a task',
    'a == b == c',
    '<div> literal',
    '&copy; literal',
    ':::noteCard sticky yellow',
    'my_var_name, _lead and trail_, __init__',
    '2 * 3 * 4',
    'see https://uni.example/c_d_e.pdf',
    'www.example.com/a_b',
    'back\\slash and `tick`',
    'a$b$c and $x$',
    '$$ not a formula $$',
  ])('keeps the literal paragraph %j a paragraph with the same text', (text) => {
    const editor = notes();
    editor.commands.setContent(paragraph(text));
    const markdown = editor.getMarkdown();
    editor.commands.setContent(markdown, { contentType: 'markdown' });
    expect(editor.getText()).toBe(text.trimStart());
    expect(editor.getJSON().content?.[0]?.type).toBe('paragraph');
  });

  it('keeps block-looking lines after a line break inside the paragraph', () => {
    const editor = notes();
    editor.commands.setContent({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Title' },
            { type: 'hardBreak' },
            { type: 'text', text: '---' },
            { type: 'hardBreak' },
            { type: 'text', text: '1. item' },
          ],
        },
      ],
    });
    const before = editor.getJSON();
    editor.commands.setContent(editor.getMarkdown(), { contentType: 'markdown' });
    expect(editor.getJSON()).toEqual(before);
  });

  it.each([
    [
      'a pipe inside a table cell',
      {
        type: 'table',
        content: [
          {
            type: 'tableRow',
            content: [
              { type: 'tableHeader', content: [paragraph('Term').content![0]!] },
              { type: 'tableHeader', content: [paragraph('Meaning').content![0]!] },
            ],
          },
          {
            type: 'tableRow',
            content: [
              { type: 'tableCell', content: [paragraph('a | b').content![0]!] },
              { type: 'tableCell', content: [paragraph('either').content![0]!] },
            ],
          },
        ],
      },
    ],
    [
      'block syntax inside a list item',
      {
        type: 'bulletList',
        content: [{ type: 'listItem', content: [paragraph('# 1. not a heading').content![0]!] }],
      },
    ],
  ])('keeps %s', (_name, node) => {
    const editor = notes();
    editor.commands.setContent({ type: 'doc', content: [node] });
    const before = editor.getJSON();
    editor.commands.setContent(editor.getMarkdown(), { contentType: 'markdown' });
    expect(editor.getJSON()).toEqual(before);
  });

  it('writes overlapping bold and italic as valid Markdown', () => {
    const editor = notes();
    editor.commands.setContent({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'bold ', marks: [{ type: 'bold' }] },
            { type: 'text', text: 'both', marks: [{ type: 'bold' }, { type: 'italic' }] },
            { type: 'text', text: ' tail' },
          ],
        },
      ],
    });
    const before = editor.getJSON();
    editor.commands.setContent(editor.getMarkdown(), { contentType: 'markdown' });
    expect(editor.getJSON()).toEqual(before);
  });
});

describe('formulas', () => {
  const inline = (latex: string): JSONContent => ({ type: 'inlineMath', attrs: { latex } });
  const block = (latex: string): JSONContent => ({ type: 'blockMath', attrs: { latex } });

  it.each([
    ['inline formulas', 'Pythagoras: $a^2 + b^2 = c^2$ holds.\n'],
    ['a formula at the start of a line', '$x$ is unknown\n'],
    ['escaped dollars inside a formula', 'Price $\\$5 + x$\n'],
    ['a block formula', '$$\n\\int_0^1 x^2 \\, dx = \\frac{1}{3}\n$$\n'],
    [
      'a multi-line block formula',
      '$$\n\\begin{aligned}\na &= b \\\\\nc &= d\n\\end{aligned}\n$$\n',
    ],
    ['chemistry', 'Water is $\\ce{H2O}$.\n'],
  ])('keeps %s unchanged', (_name, markdown) => {
    expect(save(markdown)).toBe(markdown);
  });

  it('reads formulas into formula nodes', () => {
    save('Area $\\pi r^2$ here\n\n$$\nE = mc^2\n$$\n');
    expect(notes().getJSON().content).toEqual([
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Area ' },
          inline('\\pi r^2'),
          { type: 'text', text: ' here' },
        ],
      },
      block('E = mc^2'),
      { type: 'paragraph' },
    ]);
  });

  it('writes a one-line block formula in the usual three-line form', () => {
    expect(save('$$E = mc^2$$\n')).toBe('$$\nE = mc^2\n$$\n');
  });

  it.each([
    ['amounts with the sign after', 'It costs 5 $ and 10 $ in total.\n'],
    ['amounts with the sign before', 'Between $5 and $10 each.\n'],
    ['a range of amounts', 'From $5-$6.\n'],
  ])('keeps %s as text, readable in the file', (_name, markdown) => {
    expect(save(markdown)).toBe(markdown);
    expect(JSON.stringify(notes().getJSON())).not.toContain('inlineMath');
  });

  it('escapes a dollar in text wherever it could start a formula', () => {
    const current = notes();
    current.commands.setContent({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'US$5, a$b$c and ' },
            { type: 'text', text: 'bold$', marks: [{ type: 'bold' }] },
            { type: 'text', text: ' x$ then ' },
            inline('y'),
            { type: 'text', text: '$' },
          ],
        },
      ],
    });
    const before = current.getJSON();
    const markdown = current.getMarkdown();
    expect(markdown).toContain('US\\$5');
    current.commands.setContent(markdown, { contentType: 'markdown' });
    expect(current.getJSON()).toEqual(before);
  });

  it('keeps formulas with pipes inside table cells', () => {
    const current = notes();
    const cell = (content: JSONContent[]): JSONContent => ({
      type: 'tableCell',
      content: [{ type: 'paragraph', content }],
    });
    current.commands.setContent({
      type: 'doc',
      content: [
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [
                { type: 'tableHeader', content: [paragraph('Event').content![0]!] },
                { type: 'tableHeader', content: [paragraph('Probability').content![0]!] },
              ],
            },
            {
              type: 'tableRow',
              content: [cell([{ type: 'text', text: 'A given B' }]), cell([inline('P(A|B)')])],
            },
          ],
        },
      ],
    });
    const before = current.getJSON();
    const markdown = current.getMarkdown();
    expect(markdown).toContain('$P(A\\|B)$');
    current.commands.setContent(markdown, { contentType: 'markdown' });
    expect(current.getJSON()).toEqual(before);
  });

  it('writes a table with a block formula in a cell as HTML', () => {
    const current = notes();
    current.commands.setContent({
      type: 'doc',
      content: [
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [
                { type: 'tableHeader', content: [paragraph('Law').content![0]!] },
                { type: 'tableHeader', content: [block('F = ma')] },
              ],
            },
          ],
        },
      ],
    });
    const before = current.getJSON();
    const markdown = current.getMarkdown();
    expect(markdown).toContain('data-type="block-math"');
    current.commands.setContent(markdown, { contentType: 'markdown' });
    expect(current.getJSON()).toEqual(before);
  });

  it('keeps block formulas inside study cards', () => {
    const current = notes();
    const card = createNoteVisual('study-card');
    card.content = [paragraph('Energy').content![0]!, block('E = mc^2')];
    current.commands.setContent({ type: 'doc', content: [card] });
    const before = current.getJSON();
    current.commands.setContent(current.getMarkdown(), { contentType: 'markdown' });
    expect(current.getJSON()).toEqual(before);
  });

  it('drops empty formulas instead of writing lone dollar signs', () => {
    const current = notes();
    current.commands.setContent({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a ' }, inline('')] }],
    });
    expect(composeNote('', current.getMarkdown())).toBe('a\n');
  });

  it('never reports formula text as lost', () => {
    const original = 'Mean $\\bar{x} = \\frac{1}{n}\\sum x_i$\n\n$$\n\\sigma^2\n$$\n';
    expect(findContentLoss(original, save(original))).toEqual([]);
  });
});

describe('toggles', () => {
  const toggle = [
    '<details>',
    '<summary>What is a **monad**?</summary>',
    '',
    'A monoid in the category of endofunctors.',
    '',
    '- with lists',
    '',
    '</details>',
    '',
  ].join('\n');

  it('keeps a toggle with Markdown inside unchanged', () => {
    expect(save(toggle)).toBe(toggle);
    expect(notes().getJSON().content?.[0]?.type).toBe('details');
  });

  it('keeps nested toggles, formulas in the summary and tags quoted in code', () => {
    const nested = [
      '<details>',
      '<summary>Outer $x^2$</summary>',
      '',
      '<details>',
      '<summary>Inner</summary>',
      '',
      '```html',
      '</details>',
      '```',
      '',
      '</details>',
      '',
      '</details>',
      '',
    ].join('\n');
    expect(save(nested)).toBe(nested);
    const outer: JSONContent | undefined = notes().getJSON().content?.[0];
    expect(outer?.content?.[0]?.content?.[1]).toEqual({
      type: 'inlineMath',
      attrs: { latex: 'x^2' },
    });
    expect(outer?.content?.[1]?.content?.[0]?.type).toBe('details');
  });

  it('writes an empty toggle that reads back as one', () => {
    const current = notes();
    current.commands.setContent({ type: 'doc', content: [createToggle()] });
    const before = current.getJSON();
    current.commands.setContent(current.getMarkdown(), { contentType: 'markdown' });
    expect(current.getJSON()).toEqual(before);
  });

  it('keeps summary text that looks like HTML as text', () => {
    const current = notes();
    current.commands.setContent({
      type: 'doc',
      content: [createToggle('a </summary> b & <i>c</i>', [paragraph('answer').content![0]!])],
    });
    const before = current.getJSON();
    current.commands.setContent(current.getMarkdown(), { contentType: 'markdown' });
    expect(current.getJSON()).toEqual(before);
  });

  it('reads a toggle written as one line of HTML', () => {
    expect(save('<details><summary>More</summary>hidden</details>\n')).toBe(
      '<details>\n<summary>More</summary>\n\nhidden\n\n</details>\n',
    );
  });

  it.each([
    ['an unclosed toggle', '<details>\n<summary>Open</summary>\n\ntext\n'],
    ['a stock Tiptap container', ':::details\n:::detailsSummary\nQ\n:::\n:::\n'],
  ])('never loses the text of %s', (_name, markdown) => {
    expect(findContentLoss(markdown, save(markdown))).toEqual([]);
  });
});

describe('footnotes', () => {
  it.each([
    ['a reference and its definition', 'Proof by Euclid.[^1]\n\n[^1]: Elements, Book IX.\n'],
    ['named labels', 'See[^euclid] and[^2].\n\n[^euclid]: Elements.\n\n[^2]: Second.\n'],
    [
      'a definition with several paragraphs',
      'Text.[^1]\n\n[^1]: First paragraph.\n\n    Second paragraph with $x$.\n',
    ],
    ['a definition with a list', 'Text.[^1]\n\n[^1]: Sources:\n\n    - one\n    - two\n'],
    ['a reference followed by a colon', 'See note[^1]: it matters.\n\n[^1]: Yes.\n'],
  ])('keeps %s unchanged', (_name, markdown) => {
    expect(save(markdown)).toBe(markdown);
    expect(findContentLoss(markdown, save(markdown))).toEqual([]);
  });

  it('reads references and definitions into footnote nodes', () => {
    save('Claim[^1] here.\n\n[^1]: Source.\n');
    expect(notes().getJSON().content?.slice(0, 2)).toEqual([
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Claim' },
          { type: 'footnoteReference', attrs: { label: '1' } },
          { type: 'text', text: ' here.' },
        ],
      },
      {
        type: 'footnoteDefinition',
        attrs: { label: '1' },
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Source.' }] }],
      },
    ]);
  });

  it('keeps a paragraph that starts with a reference and a colon a paragraph', () => {
    const current = notes();
    current.commands.setContent({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'footnoteReference', attrs: { label: '1' } },
            { type: 'text', text: ': starts the line' },
          ],
        },
      ],
    });
    const before = current.getJSON();
    current.commands.setContent(current.getMarkdown(), { contentType: 'markdown' });
    expect(current.getJSON()).toEqual(before);
  });

  it('keeps footnote-looking text as text', () => {
    const current = notes();
    current.commands.setContent(paragraph('[^1]: not a definition and [^2] no reference'));
    current.commands.setContent(current.getMarkdown(), { contentType: 'markdown' });
    expect(current.getJSON()).toEqual(paragraph('[^1]: not a definition and [^2] no reference'));
  });
});

describe('escapeMarkdownText', () => {
  it('leaves bare URLs intact but escapes punctuation that ends them', () => {
    expect(escapeMarkdownText('https://a.example/c_d*')).toBe('https://a.example/c_d\\*');
    expect(escapeMarkdownText('see www.a.example/x_y.')).toBe('see www.a.example/x_y.');
  });

  it('escapes URLs used as link text like any other text', () => {
    expect(escapeMarkdownText('https://a.example/_x_', { inLink: true })).toBe(
      'https://a.example/\\_x\\_',
    );
  });
});

describe('front matter', () => {
  it('keeps YAML properties verbatim outside the editor', () => {
    const note = '---\ntitle: Lecture 3\ntags: [bio]\n---\n\n# Mitosis\n';
    const { frontMatter, body } = splitFrontMatter(note);
    expect(frontMatter).toBe('---\ntitle: Lecture 3\ntags: [bio]\n---\n');
    expect(composeNote(frontMatter, save(body))).toBe(note);
  });

  it('does not mistake a leading rule for properties', () => {
    const note = '---\n\nIntro text\n\n---\n';
    expect(splitFrontMatter(note)).toEqual({ frontMatter: '', body: note });
  });
});

describe('composeNote', () => {
  it('ends a file with exactly one newline and keeps empty notes empty', () => {
    expect(composeNote('', '\n# Title\n\n\n')).toBe('# Title\n');
    expect(composeNote('', '')).toBe('');
  });
});

describe('findContentLoss', () => {
  it('reports text the editor would drop', () => {
    const original = '<video controls>Your browser cannot play this</video>\n';
    expect(findContentLoss(original, save(original))).not.toEqual([]);
    expect(findContentLoss('Visible <!-- todo: ask tutor -->\n', 'Visible\n')).not.toEqual([]);
  });

  it('ignores formatting that is only normalised', () => {
    for (const original of [
      '* star bullet\n+ plus bullet\n',
      '1. one\n1. lazily numbered\n',
      '- [X] done\n',
      '__bold__ and _em_\n',
      'Title\n=====\n',
      'Tom &amp; Jerry &lt;3\n',
      '| a | b |\n|---|:-:|\n| 1 | 2 |\n',
    ])
      expect(findContentLoss(original, save(original))).toEqual([]);
  });
});

describe('visual components inside notes', () => {
  const presets: DrawingPresetId[] = [
    'sticky-yellow',
    'sticky-peach',
    'sticky-mint',
    'sticky-blue',
    'rectangle',
    'ellipse',
    'diamond',
    'arrow',
    'study-card',
    'flow',
    'compare',
    'cornell',
    'study-board',
    'mind-map',
  ];
  it.each(presets)('preserves %s, its colors and all text through repeated saves', (preset) => {
    const current = notes();
    current.commands.setContent({
      type: 'doc',
      content: [
        paragraph('Before').content![0]!,
        createNoteVisual(preset),
        paragraph('After').content![0]!,
      ],
    });
    const before = current.getJSON();
    const markdown = current.getMarkdown();
    current.commands.setContent(markdown, { contentType: 'markdown' });
    expect(current.getJSON()).toEqual(before);
    expect(current.getMarkdown()).toBe(markdown);
    expect(findContentLoss(markdown, current.getMarkdown())).toEqual([]);
  });

  it('preserves rich text, lists, attachment references and literal container fences within cards', () => {
    const current = notes();
    current.commands.setContent(
      '**Bold** and [link](https://example.com)\n\n- first\n- second\n\n![Image](attachments/a.png)\n\n```text\n:::noteCard sticky yellow\n::::\n```',
      { contentType: 'markdown' },
    );
    const content = current
      .getJSON()
      .content.filter((node) => node.type !== 'paragraph' || node.content?.length);
    current.commands.setContent({
      type: 'doc',
      content: [{ ...createNoteVisual('sticky-mint'), content }, paragraph('After').content![0]!],
    });
    const before = current.getJSON();
    const markdown = current.getMarkdown();
    current.commands.setContent(markdown, { contentType: 'markdown' });
    expect(current.getJSON()).toEqual(before);
    expect(current.getMarkdown()).toBe(markdown);
  });

  it('preserves visual component attributes in HTML copy and paste', () => {
    const current = notes();
    current.commands.setContent({
      type: 'doc',
      content: [createNoteVisual('cornell'), paragraph('After').content![0]!],
    });
    const before = current.getJSON();
    current.commands.setContent(current.getHTML());
    expect(current.getJSON()).toEqual(before);
  });

  it('preserves resized and aligned layouts and individual cards through Markdown and HTML', () => {
    const current = notes();
    const visual = createNoteVisual('compare');
    visual.attrs = { ...visual.attrs, width: 680, height: 310, align: 'center' };
    visual.content![0]!.attrs = {
      ...visual.content![0]!.attrs,
      width: 240,
      height: 180,
      align: 'right',
    };
    current.commands.setContent({
      type: 'doc',
      content: [visual, paragraph('After').content![0]!],
    });
    const before = current.getJSON();
    const markdown = current.getMarkdown();
    expect(markdown).toContain('noteLayout compare width=680 height=310 align=center');
    expect(markdown).toContain('noteCard sticky blue width=240 height=180 align=right');
    current.commands.setContent(markdown, { contentType: 'markdown' });
    expect(current.getJSON()).toEqual(before);
    current.commands.setContent(current.getHTML());
    expect(current.getJSON()).toEqual(before);
    expect(current.getMarkdown()).toBe(markdown);
    expect(findContentLoss(markdown, current.getMarkdown())).toEqual([]);
  });

  it('keeps incomplete or unknown container syntax as ordinary text', () => {
    for (const markdown of [
      ':::noteCard sticky yellow\nDo not lose this',
      ':::noteCard unknown violet\nKeep this\n:::',
      ':::noteCard sticky yellow width=oops\nKeep this\n:::',
      ':::noteCard sticky yellow align=diagonal\nKeep this\n:::',
      ':::noteCard sticky yellow width=320 width=400\nKeep this\n:::',
    ]) {
      const saved = save(markdown);
      expect(findContentLoss(markdown, saved)).toEqual([]);
      expect(
        notes()
          .getJSON()
          .content?.some((node) => node.type === 'noteCard'),
      ).toBe(false);
    }
  });
});
