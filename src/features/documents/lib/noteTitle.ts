/**
 * The title on the page is the note's file name, like Obsidian's inline
 * title. These rules mirror `valid_name` in `src-tauri/src/documents.rs`, so a
 * title the backend would refuse is explained before anything is renamed.
 */

const NOTE_EXTENSION = /\.(md|markdown|txt)$/i;
const FORBIDDEN = /[/\\:*?"<>|]/;

export function noteTitle(fileName: string): string {
  return fileName.replace(NOTE_EXTENSION, '');
}

export function noteExtension(fileName: string): string {
  return NOTE_EXTENSION.exec(fileName)?.[0] ?? '';
}

export type TitleCheck = { ok: true; fileName: string } | { ok: false; reason: string };

/** The file name for a new title, or why it cannot be one. */
export function titleToFileName(title: string, currentFileName: string): TitleCheck {
  // A title is one line; pasted line breaks become spaces.
  const clean = title.replace(/\s+/g, ' ').trim();
  if (!clean) return { ok: false, reason: 'A note needs a title.' };
  if (clean.startsWith('.')) return { ok: false, reason: 'A title can’t start with a dot.' };
  if (clean.endsWith('.')) return { ok: false, reason: 'A title can’t end with a dot.' };
  const character = FORBIDDEN.exec(clean)?.[0];
  if (character)
    return {
      ok: false,
      reason: `A title can’t contain “${character}”, which file names don’t allow.`,
    };
  // Control characters come in with pasted text.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(clean))
    return { ok: false, reason: 'A title can’t contain control characters.' };
  const fileName = `${clean}${noteExtension(currentFileName)}`;
  if (new TextEncoder().encode(fileName).length > 240)
    return { ok: false, reason: 'This title is too long for a file name.' };
  return { ok: true, fileName };
}
