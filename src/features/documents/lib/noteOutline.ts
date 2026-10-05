import type { Node as ProseMirrorNode } from '@tiptap/pm/model';

/**
 * Everything the note sidebar and info panel show is read from the open
 * document: nothing here is stored, so none of it can change the file.
 */

export interface OutlineEntry {
  /** Position of the heading node, for `nodeDOM` and selection. */
  pos: number;
  level: number;
  text: string;
}
export interface TaskEntry {
  pos: number;
  text: string;
  checked: boolean;
}
export interface LinkEntry {
  /** Position of the first character of the linked text. */
  pos: number;
  text: string;
  href: string;
}
export interface TextRange {
  from: number;
  to: number;
}
export interface NoteStats {
  words: number;
  characters: number;
  headings: number;
  images: number;
  tasks: number;
  openTasks: number;
  /** Minutes at 200 words a minute, never less than one. */
  readingMinutes: number;
}

export function collectOutline(doc: ProseMirrorNode, maxLevel = 3): OutlineEntry[] {
  const entries: OutlineEntry[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== 'heading') return true;
    const level = Number(node.attrs.level);
    const text = node.textContent.trim();
    if (level <= maxLevel && text) entries.push({ pos, level, text });
    return false;
  });
  return entries;
}

export function collectTasks(doc: ProseMirrorNode): TaskEntry[] {
  const tasks: TaskEntry[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== 'taskItem') return true;
    // A nested checklist is listed on its own, so only the item's first paragraph names it.
    const text = (node.firstChild?.textContent ?? '').trim();
    tasks.push({ pos, text, checked: Boolean(node.attrs.checked) });
    return true;
  });
  return tasks;
}

export function collectLinks(doc: ProseMirrorNode): LinkEntry[] {
  const links: LinkEntry[] = [];
  doc.descendants((node, pos) => {
    if (!node.isText) return true;
    const link = node.marks.find((mark) => mark.type.name === 'link');
    const href = typeof link?.attrs.href === 'string' ? link.attrs.href : '';
    if (!href) return false;
    const previous = links.at(-1);
    // Bold inside a link splits it into several text nodes; they are one link.
    if (previous && previous.href === href && previous.pos + previous.text.length === pos)
      previous.text += node.text ?? '';
    else links.push({ pos, text: node.text ?? '', href });
    return false;
  });
  return links;
}

export function countWords(text: string): number {
  return text.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
}

export function readingMinutes(words: number): number {
  return Math.max(1, Math.round(words / 200));
}

export function noteStats(doc: ProseMirrorNode): NoteStats {
  const text = doc.textBetween(0, doc.content.size, '\n', ' ');
  const words = countWords(text);
  let headings = 0;
  let images = 0;
  doc.descendants((node) => {
    if (node.type.name === 'heading') headings += 1;
    else if (node.type.name === 'image') images += 1;
    return true;
  });
  const tasks = collectTasks(doc);
  return {
    words,
    characters: text.replace(/\s/g, '').length,
    headings,
    images,
    tasks: tasks.length,
    openTasks: tasks.filter((task) => !task.checked).length,
    readingMinutes: readingMinutes(words),
  };
}

// Stands in for inline nodes (images, line breaks) so a match never spans one.
const OBJECT = '￼';

/**
 * Case-insensitive matches of `query` in the note's text, as document ranges.
 * Matches may cross mark boundaries (`**Mito**sis`) but never leave a block.
 */
export function findMatches(doc: ProseMirrorNode, query: string): TextRange[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [];
  const matches: TextRange[] = [];
  doc.descendants((block, blockPos) => {
    if (!block.isTextblock) return true;
    let text = '';
    // Document position of every character in `text`.
    const positions: number[] = [];
    block.forEach((child, offset) => {
      const start = blockPos + 1 + offset;
      const content = child.isText ? (child.text ?? '') : OBJECT;
      for (let index = 0; index < content.length; index += 1) positions.push(start + index);
      text += content;
    });
    // Lower-casing per character keeps indices aligned with `positions`.
    const haystack = Array.from(text, (character) =>
      character.toLocaleLowerCase().length === 1 ? character.toLocaleLowerCase() : character,
    ).join('');
    // Matches never overlap, like find in any editor: "aa" occurs once in "aaa".
    for (
      let at = haystack.indexOf(needle);
      at !== -1;
      at = haystack.indexOf(needle, at + needle.length)
    ) {
      const from = positions[at];
      const last = positions[at + needle.length - 1];
      if (from !== undefined && last !== undefined) matches.push({ from, to: last + 1 });
    }
    return false;
  });
  return matches;
}
