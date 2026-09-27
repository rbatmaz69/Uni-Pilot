import { Extension, textInputRule } from '@tiptap/core';
import Typography from '@tiptap/extension-typography';

// Comparisons and implications as written by hand. `<=>` and `<->` arrive
// here after `<=` and `<-` have already become `≤` and `←`.
const SYMBOLS: [RegExp, string][] = [
  [/>=$/, '≥'],
  [/<=$/, '≤'],
  [/=>$/, '⇒'],
  [/≤>$/, '⇔'],
  [/←>$/, '↔'],
  [/~=$/, '≈'],
];

/**
 * Replaces what is typed with the symbol it stands for: `->` → `→`, `!=` → `≠`,
 * `...` → `…`. Backspace right after a replacement brings the typed characters
 * back, and code keeps everything as typed. Only the characters being typed
 * change, never existing text, so nothing reaches the file the student did not
 * write. Left out on purpose:
 * - quotes: the right pair depends on the language of the note;
 * - `(c)`, `(r)`, `(tm)`: sub-tasks are numbered (a), (b), (c);
 * - `^2`, `2x3`: they would rewrite LaTeX and hex numbers while being typed;
 * - `<<`, `>>`: shift operators, and German reverses the guillemets.
 */
export const NoteTypography = Extension.create({
  name: 'noteTypography',
  addExtensions() {
    return [
      Typography.configure({
        openDoubleQuote: false,
        closeDoubleQuote: false,
        openSingleQuote: false,
        closeSingleQuote: false,
        copyright: false,
        registeredTrademark: false,
        trademark: false,
        servicemark: false,
        superscriptTwo: false,
        superscriptThree: false,
        multiplication: false,
        laquo: false,
        raquo: false,
      }),
    ];
  },
  addInputRules() {
    return SYMBOLS.map(([find, replace]) => textInputRule({ find, replace }));
  },
});
