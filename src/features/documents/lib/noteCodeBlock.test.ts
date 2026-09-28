import { Editor } from '@tiptap/core';
import { Slice } from '@tiptap/pm/model';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { composeNote, findContentLoss, noteExtensions } from './markdown';
import { continueAfterCode, hasMermaidFence, unwrapMermaidFence } from './noteCodeBlock';
import { MERMAID_EXAMPLE } from './mermaid';
import { filterSlashCommands, runSlashCommand } from './blockTypes';

let editor: Editor;
afterEach(() => editor?.destroy());
const fenced = (code: string) => `\`\`\`mermaid\n${code}\n\`\`\``;
function open(markdown: string) {
  editor = new Editor({
    extensions: noteExtensions(),
    content: markdown,
    contentType: 'markdown',
    editorProps: { handleScrollToSelection: () => true },
  });
  return editor;
}
function paste(text: string, extras: Record<string, string> = {}) {
  const event = new Event('paste') as ClipboardEvent;
  Object.defineProperty(event, 'clipboardData', {
    value: { getData: (type: string) => (type === 'text/plain' ? text : (extras[type] ?? '')) },
  });
  return editor.view.someProp('handlePaste', (handler) => handler(editor.view, event, Slice.empty));
}

describe('Mermaid note storage and clipboard', () => {
  it.each([
    MERMAID_EXAMPLE,
    '',
    'not valid mermaid!',
    'flowchart LR\n  %% a comment\n  A["<>& | _ * ` ```"] --> B["Größe"]',
  ])('preserves source through repeated saves: %s', (code) => {
    const source = code.includes('```') ? `\`\`\`\`mermaid\n${code}\n\`\`\`\`` : fenced(code);
    open(`Before\n\n${source}\n\nAfter`);
    const saved = editor.getMarkdown();
    const diagram = editor.state.doc.child(1);
    expect(diagram.type.name).toBe('codeBlock');
    expect(diagram.attrs.language).toBe('mermaid');
    expect(diagram.textContent).toBe(code);
    expect(findContentLoss(source, saved)).toEqual([]);
    editor.commands.setContent(saved, { contentType: 'markdown' });
    expect(editor.getMarkdown()).toBe(saved);
    expect(editor.state.doc.child(1).textContent).toBe(code);
  });

  it('keeps diagrams inside study cards and accepts tilde fences', () => {
    open(`:::noteCard sticky mint\n~~~mermaid\n${MERMAID_EXAMPLE}\n~~~\n:::`);
    const saved = composeNote('', editor.getMarkdown());
    expect(editor.state.doc.child(0).child(0).textContent).toBe(MERMAID_EXAMPLE);
    editor.commands.setContent(saved, { contentType: 'markdown' });
    expect(composeNote('', editor.getMarkdown())).toBe(saved);
  });

  it('pastes surrounding Markdown and multiple diagrams as one undoable edit', () => {
    open('Original');
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    expect(
      paste(
        `\n\n## Diagram\n\n${fenced(MERMAID_EXAMPLE)}\n\nBetween\n\n${fenced('sequenceDiagram\n  Alice->>Bob: Hello')}\n\nAfter`,
      ),
    ).toBe(true);
    expect(editor.getJSON().content?.filter((node) => node.type === 'codeBlock')).toHaveLength(2);
    expect(editor.getText()).toContain('Between');
    expect(editor.getText()).toContain('After');
    editor.commands.undo();
    expect(composeNote('', editor.getMarkdown())).toBe('Original\n');
    editor.commands.redo();
    expect(editor.getText()).toContain(MERMAID_EXAMPLE);
  });

  it('unwraps a pasted fence inside Mermaid without creating nested blocks', () => {
    open(fenced('flowchart LR\n  A-->B'));
    editor.commands.setTextSelection({ from: 1, to: editor.state.doc.child(0).nodeSize - 1 });
    expect(paste(fenced(MERMAID_EXAMPLE).replaceAll('\n', '\r\n'))).toBe(true);
    expect(editor.state.doc.child(0).textContent).toBe(MERMAID_EXAMPLE);
    expect(editor.state.doc.child(0).childCount).toBe(1);
  });

  it('leaves raw text, other code blocks, incomplete fences and read-only notes to normal paste', () => {
    open('Original');
    expect(paste(MERMAID_EXAMPLE)).not.toBe(true);
    expect(paste('```mermaid\nA')).not.toBe(true);
    expect(hasMermaidFence('````python\n```mermaid\nA\n```\n````')).toBe(false);
    editor.setEditable(false);
    expect(paste(fenced(MERMAID_EXAMPLE))).not.toBe(true);
    expect(editor.getText()).toBe('Original');
  });

  it('retains the existing VS Code clipboard handling', () => {
    open('');
    expect(
      paste('print("hello")', { 'vscode-editor-data': JSON.stringify({ mode: 'python' }) }),
    ).toBe(true);
    expect(editor.state.doc.child(0).attrs.language).toBe('python');
    expect(editor.getMarkdown()).toContain('print("hello")');
  });

  it('inserts from the slash menu, starts code editing, and continues below without duplicating paragraphs', () => {
    open('/mermaid');
    const command = filterSlashCommands('mermaid')[0]!;
    runSlashCommand(editor, { from: 1, to: 9 }, command, vi.fn());
    expect(editor.state.selection.$from.parent.type.name).toBe('codeBlock');
    expect(editor.getMarkdown()).toContain(MERMAID_EXAMPLE);
    expect(continueAfterCode(editor, 0)).toBe(true);
    expect(editor.state.selection.$from.parent.type.name).toBe('paragraph');
    expect(editor.state.doc.childCount).toBe(2);
    expect(filterSlashCommands('diagram').map((item) => item.id)).toContain('mermaid');
  });

  it('unwraps only one complete enclosing fence', () => {
    expect(unwrapMermaidFence(`\n~~~~mermaid\n${MERMAID_EXAMPLE}\n~~~~~\n`)).toBe(MERMAID_EXAMPLE);
    expect(unwrapMermaidFence(`${fenced(MERMAID_EXAMPLE)}\nAfter`)).toBeNull();
  });
});
