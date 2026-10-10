import { Focus } from 'lucide-react';
import { useNoteStyleStore } from '@/features/documents/store/noteStyleStore';
import { usePlatformModifier } from '@/hooks/usePlatform';

/** Fades everything but the writing (or the drawing); the notes' tools and the canvas dock share it. */
export function FocusModeButton({
  className,
  onToggle,
}: {
  className: string;
  /** Runs after the switch, e.g. to close a popover and give the text its caret back. */
  onToggle?: () => void;
}) {
  const { isMac } = usePlatformModifier();
  const focus = useNoteStyleStore((state) => state.focus);
  const toggleFocus = useNoteStyleStore((state) => state.toggleFocus);
  return (
    <button
      type="button"
      className={className}
      aria-label="Focus mode"
      aria-keyshortcuts={isMac ? 'Meta+Shift+F' : 'Control+Shift+F'}
      title={`Focus mode (${isMac ? '⇧⌘F' : 'Ctrl+Shift+F'})`}
      aria-pressed={focus}
      onClick={() => {
        toggleFocus();
        onToggle?.();
      }}
    >
      <Focus size={17} aria-hidden />
    </button>
  );
}
