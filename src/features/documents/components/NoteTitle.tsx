import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { useNoteStyleStore } from '@/features/documents/store/noteStyleStore';

interface NoteTitleProps {
  title: string;
  fileName: string;
  disabled: boolean;
  /** Renames the note; resolves to false when the rename did not happen. */
  onRename: (title: string) => Promise<boolean>;
  /** Enter or ↓ at the end of the title continue in the note. */
  onContinue: () => void;
}

/**
 * The title as the first line of the page. It is the file name, as in
 * Obsidian's inline title: editing it renames the note on disk when the field
 * is left or Enter is pressed, and Escape restores it.
 */
export function NoteTitle({ title, fileName, disabled, onRename, onContinue }: NoteTitleProps) {
  const [draft, setDraft] = useState(title);
  const [busy, setBusy] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);
  // Enter and Escape already decided; the blur that follows must not decide again.
  const settled = useRef(false);
  const hint = useId();
  const typeface = useNoteStyleStore((state) => `${state.font} ${state.textSize}`);

  // Grows with the title so long names wrap instead of scrolling sideways.
  const fit = useCallback(() => {
    const element = field.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${element.scrollHeight}px`;
  }, []);
  useLayoutEffect(() => fit(), [fit, draft, typeface]);
  // A narrower page, or a face that has just loaded, moves the line breaks too.
  useEffect(() => {
    const element = field.current;
    if (!element) return;
    let width = element.offsetWidth;
    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => {
            if (element.offsetWidth === width) return;
            width = element.offsetWidth;
            fit();
          });
    observer?.observe(element);
    document.fonts?.addEventListener('loadingdone', fit);
    return () => {
      observer?.disconnect();
      document.fonts?.removeEventListener('loadingdone', fit);
    };
  }, [fit]);

  async function commit() {
    if (busy) return;
    if (draft.replace(/\s+/g, ' ').trim() === title) {
      setDraft(title);
      return;
    }
    setBusy(true);
    const renamed = await onRename(draft);
    setBusy(false);
    // A successful rename reopens the note under its new name.
    if (!renamed) setDraft(title);
  }

  return (
    <div className="note-title">
      <h1 aria-label={title}>
        <textarea
          ref={field}
          rows={1}
          aria-label="Title"
          aria-describedby={hint}
          className="note-title-field"
          value={draft}
          disabled={disabled || busy}
          spellCheck={false}
          onChange={(event) => setDraft(event.target.value.replace(/\n/g, ' '))}
          onBlur={() => {
            if (settled.current) settled.current = false;
            else void commit();
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              settled.current = true;
              void commit();
              onContinue();
            } else if (event.key === 'Escape') {
              event.preventDefault();
              settled.current = true;
              setDraft(title);
              onContinue();
            } else if (
              event.key === 'ArrowDown' &&
              event.currentTarget.selectionStart === event.currentTarget.value.length
            ) {
              event.preventDefault();
              onContinue();
            }
          }}
        />
      </h1>
      <p id={hint} className="note-title-hint">
        The title is the file name. Changing it renames “{fileName}”.
      </p>
    </div>
  );
}
