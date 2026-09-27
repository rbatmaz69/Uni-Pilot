import { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  activeBlockType,
  BLOCK_TYPES,
  filterSlashCommands,
  openBlockMenu,
  runSlashCommand,
  SLASH_COMMANDS,
  turnInto,
} from './blockTypes';
import { composeNote, noteExtensions } from './markdown';

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});

function open(markdown: string) {
  editor = new Editor({ extensions: noteExtensions(), content: markdown, contentType: 'markdown' });
  return editor;
}
const saved = (current: Editor) => composeNote('', current.getMarkdown());
const type = (id: string) => BLOCK_TYPES.find((block) => block.id === id)!;
const command = (id: string) => SLASH_COMMANDS.find((entry) => entry.id === id)!;

/** Types `/query` at the end of the last paragraph and returns its range. */
function typeSlash(current: Editor, query: string) {
  const end = current.state.doc.content.size - 1;
  current.chain().setTextSelection(end).insertContent(`/${query}`).run();
  return { from: end, to: end + query.length + 1 };
}

describe('filtering the / menu', () => {
  it('shows every command before anything is typed', () => {
    expect(filterSlashCommands('')).toEqual(SLASH_COMMANDS);
  });

  it('ranks a label that starts with the query above keyword matches', () => {
    expect(filterSlashCommands('che').map((entry) => entry.label)).toEqual(['Checklist']);
    expect(filterSlashCommands('h2').map((entry) => entry.id)).toEqual(['heading2']);
    const list = filterSlashCommands('list').map((entry) => entry.label);
    expect(list.slice(0, 2)).toEqual(['Bulleted list', 'Numbered list']);
    expect(list).toContain('Checklist');
  });

  it('matches nothing for text no command is about', () => {
    expect(filterSlashCommands('zebra')).toEqual([]);
  });
});

describe('turning blocks into other blocks', () => {
  it('reports the block the cursor is in, preferring the list over its paragraph', () => {
    const current = open('- item\n');
    current.commands.setTextSelection(3);
    expect(activeBlockType(current).id).toBe('bulletList');
  });

  it.each([
    ['heading2', '## Variance\n'],
    ['taskList', '- [ ] Variance\n'],
    ['blockquote', '> Variance\n'],
    ['orderedList', '1. Variance\n'],
  ])('turns a paragraph into %s', (id, markdown) => {
    const current = open('Variance');
    turnInto(current, type(id));
    expect(saved(current)).toBe(markdown);
  });

  it('lifts a list item back into a plain paragraph', () => {
    const current = open('- [ ] Variance\n');
    current.commands.setTextSelection(4);
    turnInto(current, type('paragraph'));
    expect(saved(current)).toBe('Variance\n');
  });
});

describe('running / commands', () => {
  it('replaces the typed query with the chosen block', () => {
    const current = open('Intro\n\nVariance ');
    runSlashCommand(current, typeSlash(current, 'h1'), command('heading1'), vi.fn());
    expect(saved(current)).toBe('Intro\n\n# Variance\n');
  });

  it('inserts a divider and a table without leaving the query behind', () => {
    const current = open('Intro');
    runSlashCommand(current, typeSlash(current, 'div'), command('divider'), vi.fn());
    expect(saved(current)).not.toContain('/div');
    expect(saved(current)).toContain('---');

    runSlashCommand(current, typeSlash(current, 'tab'), command('table'), vi.fn());
    expect(saved(current)).toMatch(/\| .* \|/);
  });

  it('inserts a toggle and puts the cursor in its summary', () => {
    const current = open('Intro ');
    runSlashCommand(current, typeSlash(current, 'tog'), command('toggle'), vi.fn());
    expect(current.state.selection.$from.parent.type.name).toBe('detailsSummary');
    current.commands.insertContent('Question');
    expect(saved(current)).toContain('<details>\n<summary>Question</summary>');
  });

  it('inserts an empty block or inline formula', () => {
    const current = open('Intro ');
    runSlashCommand(current, typeSlash(current, 'form'), command('formula'), vi.fn());
    expect(current.getJSON().content?.map((node) => node.type)).toContain('blockMath');
    const inline = open('Mass ');
    runSlashCommand(inline, typeSlash(inline, 'inl'), command('inlineFormula'), vi.fn());
    expect(inline.state.doc.firstChild?.lastChild?.type.name).toBe('inlineMath');
  });

  it('attaches a footnote to the word before the typed query', () => {
    const current = open('Gauss as a child ');
    runSlashCommand(current, typeSlash(current, 'foot'), command('footnote'), vi.fn());
    current.commands.insertContent('A legend.');
    expect(saved(current)).toBe('Gauss as a child[^1]\n\n[^1]: A legend.\n');
  });

  it('asks the host for an image after removing the query', () => {
    const current = open('Intro ');
    const insertImage = vi.fn();
    runSlashCommand(current, typeSlash(current, 'ima'), command('image'), insertImage);
    expect(insertImage).toHaveBeenCalledOnce();
    expect(saved(current)).toBe('Intro\n');
  });
});

describe('the page rail "+"', () => {
  it('types / on the empty line the cursor is in', () => {
    const current = open('Intro\n\n');
    current.commands.setTextSelection(current.state.doc.content.size - 1);
    current.commands.insertContent({ type: 'paragraph' });
    openBlockMenu(current);
    expect(current.state.selection.$from.parent.textContent).toBe('/');
    expect(current.state.doc.childCount).toBeLessThanOrEqual(3);
  });

  it('starts a new paragraph after the whole list instead of splitting it', () => {
    const current = open('- one\n- two\n\nAfter');
    current.commands.setTextSelection(4);
    openBlockMenu(current);
    const { $from } = current.state.selection;
    expect($from.parent.textContent).toBe('/');
    expect($from.depth).toBe(1);
    expect(current.state.doc.child(0).type.name).toBe('bulletList');
    expect(current.state.doc.child(0).childCount).toBe(2);
    expect(current.state.doc.child(1).textContent).toBe('/');
  });
});
