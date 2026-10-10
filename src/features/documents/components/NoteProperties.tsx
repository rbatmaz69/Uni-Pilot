import { useEffect, useId, useState, type ReactNode } from 'react';
import type { Editor, EditorEvents } from '@tiptap/core';
import { ChevronDown, ChevronUp, Clock, Folder, Type } from 'lucide-react';
import type { DocumentEntry } from '@/features/documents/lib/files';
import { noteStats, plainStats, type NoteStats } from '@/features/documents/lib/noteOutline';
import { useNoteStyleStore } from '@/features/documents/store/noteStyleStore';

/** Quiet time after the last edit before the figures are counted again. */
const COUNT_DELAY = 250;

type NotePropertiesProps = {
  entry: DocumentEntry;
  /** When this session last saved the note, in milliseconds; null if it has not. */
  savedAt: number | null;
  /** The rich-text editor; null for a plain-text note, which is counted from `text`. */
  editor: Editor | null;
  text: string;
};

const sameStats = (a: NoteStats, b: NoteStats) =>
  (Object.keys(a) as (keyof NoteStats)[]).every((key) => a[key] === b[key]);

/** Keeps the current figures when the new count changes nothing, so no render follows. */
const counted = (next: NoteStats) => (current: NoteStats) =>
  sameStats(current, next) ? current : next;

/**
 * The note's figures, counted again shortly after the last edit instead of on
 * every keystroke. Reading the document changes nothing in it.
 */
function useNoteStats(editor: Editor | null, text: string): NoteStats {
  const [stats, setStats] = useState(() =>
    editor ? noteStats(editor.state.doc) : plainStats(text),
  );

  useEffect(() => {
    if (!editor) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!editor.isDestroyed) setStats(counted(noteStats(editor.state.doc)));
      }, COUNT_DELAY);
    };
    // Typing, and also content set from outside (a change another app made), which sends no update.
    const onTransaction = ({ transaction }: EditorEvents['transaction']) => {
      if (transaction.docChanged) schedule();
    };
    editor.on('transaction', onTransaction);
    schedule();
    return () => {
      clearTimeout(timer);
      editor.off('transaction', onTransaction);
    };
  }, [editor]);

  useEffect(() => {
    if (editor) return;
    const timer = setTimeout(() => setStats(counted(plainStats(text))), COUNT_DELAY);
    return () => clearTimeout(timer);
  }, [editor, text]);

  return stats;
}

function When({ at }: { at: number | null }) {
  if (!at) return '—';
  const when = new Date(at);
  return (
    <time dateTime={when.toISOString()}>
      {when.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
    </time>
  );
}

function Figure({ value, one, many }: { value: number; one: string; many: string }) {
  return (
    <span className="note-properties-figure">
      <strong>{value.toLocaleString()}</strong> {value === 1 ? one : many}
    </span>
  );
}

function Property({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="note-properties-row">
      <dt>
        {icon}
        {label}
      </dt>
      <dd>{children}</dd>
    </div>
  );
}

/**
 * A read-only block below a standard note: when it was last written, where it
 * lives and how long it is. It sits outside the editor's content and outside
 * the page's text layer, so it can neither be saved into the file nor move a
 * page break. Whether it is open is an app setting, like the page style.
 */
export function NoteProperties({ entry, savedAt, editor, text }: NotePropertiesProps) {
  const id = useId();
  const open = useNoteStyleStore((state) => state.properties);
  const toggle = useNoteStyleStore((state) => state.toggleProperties);
  const stats = useNoteStats(editor, text);
  const folders = entry.path.split('/').slice(0, -1);
  const Chevron = open ? ChevronUp : ChevronDown;

  return (
    <section className="note-properties" aria-label="Note properties">
      <div className="note-properties-divider">
        <button
          type="button"
          className="note-properties-toggle"
          aria-expanded={open}
          aria-controls={id}
          onClick={toggle}
        >
          <Chevron size={12} aria-hidden />
          {open ? 'Collapse' : 'Properties'}
        </button>
      </div>
      <dl id={id} className="note-properties-list" hidden={!open}>
        <Property icon={<Clock size={14} aria-hidden />} label="Last update">
          <When at={savedAt ?? entry.modified} />
        </Property>
        <Property icon={<Folder size={14} aria-hidden />} label="Location">
          {['Documents', ...folders].join(' / ')}
        </Property>
        <Property icon={<Type size={14} aria-hidden />} label="Count">
          <span className="note-properties-count">
            <Figure value={stats.characters} one="character" many="characters" />
            <span aria-hidden="true"> · </span>
            <Figure value={stats.words} one="word" many="words" />
            <span aria-hidden="true"> · </span>
            <span className="note-properties-figure">
              <strong>{stats.readingMinutes.toLocaleString()}</strong> min read
            </span>
          </span>
        </Property>
      </dl>
    </section>
  );
}
