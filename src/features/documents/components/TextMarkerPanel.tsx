import { useId, type CSSProperties } from 'react';
import type { Editor } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';
import { SENTENCE_KINDS, textMarkerTally } from '@/features/documents/lib/textMarker';
import { useNoteStyleStore } from '@/features/documents/store/noteStyleStore';
import { usePlatformModifier } from '@/hooks/usePlatform';
import { cn } from '@/lib/utils';

function percent(part: number, whole: number) {
  return whole ? Math.round((part / whole) * 100) : 0;
}

/**
 * Turns the Textmarker on and explains its colours. While it is on, each role
 * shows how much of the note it covers, and choosing one spotlights it.
 */
export function TextMarkerPanel({ editor }: { editor: Editor | null }) {
  const id = useId();
  const { isMac } = usePlatformModifier();
  const { markers, markerOnly, toggleMarkers, setMarkerOnly } = useNoteStyleStore();
  const tally = useEditorState({
    editor,
    selector: ({ editor: current }) => (current ? textMarkerTally(current.state) : null),
  });
  const total = tally ? Object.values(tally).reduce((sum, part) => sum + part, 0) : 0;
  const shortcut = isMac ? '⇧⌘M' : 'Ctrl+Shift+M';

  return (
    <div className="text-marker-panel">
      <label className="text-marker-toggle">
        <span>
          <span className="text-marker-toggle-title">Mark sentences by role</span>
          <small>
            One highlighter per role · <kbd>{shortcut}</kbd>
          </small>
        </span>
        <input
          type="checkbox"
          role="switch"
          className="toggle-switch"
          aria-keyshortcuts={isMac ? 'Meta+Shift+M' : 'Control+Shift+M'}
          checked={markers}
          onChange={toggleMarkers}
        />
      </label>
      <span className="note-panel-label" id={`${id}-roles`}>
        {markers ? 'Roles in this note' : 'Colours'}
      </span>
      <ul className="text-marker-legend" aria-labelledby={`${id}-roles`}>
        {SENTENCE_KINDS.map(({ kind, label, hint }) => {
          const share = tally ? percent(tally[kind], total) : null;
          return (
            <li key={kind}>
              <button
                type="button"
                className={cn('text-marker-role', `is-${kind}`)}
                aria-label={label}
                aria-pressed={markerOnly === kind}
                aria-describedby={`${id}-${kind}`}
                title={
                  markerOnly === kind ? 'Show every role' : `Spotlight ${label.toLowerCase()}s`
                }
                disabled={!markers}
                onClick={() => setMarkerOnly(markerOnly === kind ? null : kind)}
              >
                <span
                  className="text-marker-swatch"
                  style={{ '--marker-share': `${share ?? 100}%` } as CSSProperties}
                  aria-hidden
                />
                <span className="text-marker-role-name">{label}</span>
                <span className="text-marker-role-hint" id={`${id}-${kind}`}>
                  {share === null ? hint : `${share}% · ${hint}`}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="note-panel-note">
        {tally && total
          ? `${percent(tally.plain, total)}% has no clear cue and stays unmarked. `
          : null}
        Read from the wording, on this device. A reading aid only: the colours are never saved into
        the note.
      </p>
    </div>
  );
}
