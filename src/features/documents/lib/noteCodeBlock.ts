import CodeBlock from '@tiptap/extension-code-block';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import type { Editor } from '@tiptap/core';
import { isMermaidLanguage } from './mermaid';

const openingFence = /^ {0,3}(`{3,}|~{3,})([^\n]*)$/;
const closingFence = /^ {0,3}(`{3,}|~{3,})[ \t]*$/;

export function unwrapMermaidFence(text: string): string | null {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  while (lines.length && !lines[0]?.trim()) lines.shift();
  while (lines.length && !lines.at(-1)?.trim()) lines.pop();
  const open = openingFence.exec(lines[0] ?? '');
  if (!open || !isMermaidLanguage(open[2])) return null;
  const fence = open[1]!;
  for (let index = 1; index < lines.length; index++) {
    const close = closingFence.exec(lines[index]!);
    if (close && close[1]![0] === fence[0] && close[1]!.length >= fence.length) {
      return index === lines.length - 1 ? lines.slice(1, index).join('\n') : null;
    }
  }
  return null;
}

/** Ignore Mermaid-looking text inside other code fences and incomplete pastes. */
export function hasMermaidFence(text: string) {
  let fence: { marker: string; length: number; mermaid: boolean } | null = null;
  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    if (fence) {
      const close = closingFence.exec(line)?.[1];
      if (close && close[0] === fence.marker && close.length >= fence.length) {
        if (fence.mermaid) return true;
        fence = null;
      }
    } else {
      const open = openingFence.exec(line);
      if (open)
        fence = {
          marker: open[1]![0]!,
          length: open[1]!.length,
          mermaid: isMermaidLanguage(open[2]),
        };
    }
  }
  return false;
}

export function continueAfterCode(editor: Editor, position: number) {
  if (!editor.isEditable) return false;
  return editor
    .chain()
    .focus()
    .command(({ tr }) => {
      const node = tr.doc.nodeAt(position);
      if (node?.type.name !== 'codeBlock') return false;
      const after = position + node.nodeSize;
      const next = tr.doc.resolve(after).nodeAfter;
      if (!next?.isTextblock || next.type.spec.code) {
        tr.insert(after, editor.schema.nodes.paragraph!.create());
      }
      tr.setSelection(TextSelection.near(tr.doc.resolve(after + 1))).scrollIntoView();
      return true;
    })
    .run();
}

export const NoteCodeBlock = CodeBlock.extend({
  renderMarkdown(node, helpers) {
    const code = helpers.renderChildren(node.content ?? []);
    // A pasted label may itself contain backticks. Never close its outer fence early.
    const length = Math.max(
      3,
      ...Array.from(code.matchAll(/`{3,}/g), (match) => match[0].length + 1),
    );
    const fence = '`'.repeat(length);
    return `${fence}${String(node.attrs?.language ?? '')}\n${code}\n${fence}`;
  },
  addKeyboardShortcuts() {
    return {
      ...this.parent?.(),
      'Mod-Enter': () => {
        const { $from } = this.editor.state.selection;
        return (
          $from.parent.type.name === this.name && continueAfterCode(this.editor, $from.before())
        );
      },
    };
  },
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('noteMermaidPaste'),
        props: {
          handlePaste: (view, event) => {
            if (!view.editable || !event.clipboardData) return false;
            const text = event.clipboardData.getData('text/plain');
            const { $from, from, to } = view.state.selection;
            if ($from.parent.type.spec.code) {
              const unwrapped = isMermaidLanguage($from.parent.attrs.language)
                ? unwrapMermaidFence(text)
                : null;
              if (unwrapped === null) return false;
              view.dispatch(view.state.tr.insertText(unwrapped, from, to).setMeta('paste', true));
              return true;
            }
            if (!hasMermaidFence(text) || !this.editor.markdown) return false;
            return this.editor
              .chain()
              .insertContent(text, { contentType: 'markdown' })
              .command(({ tr }) => {
                tr.setMeta('paste', true).setMeta('uiEvent', 'paste');
                return true;
              })
              .run();
          },
        },
      }),
      ...(this.parent?.() ?? []),
    ];
  },
});
