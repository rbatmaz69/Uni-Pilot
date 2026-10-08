import { useEffect, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Copy, Highlighter } from 'lucide-react';
import {
  INK_COLORS,
  type InkColor,
  type HighlightRect,
} from '@/features/documents/lib/pdfInkTypes';
import { selectedTextRects, selectionRects } from '@/features/documents/lib/pdfTextSelection';

interface Selection {
  text: string;
  rects: HighlightRect[];
  left: number;
  top: number;
}
export function PdfTextSelectionMenu({
  layer,
  width,
  height,
  enabled,
  editable,
  onHighlight,
}: {
  layer: RefObject<HTMLDivElement | null>;
  width: number;
  height: number;
  enabled: boolean;
  editable: boolean;
  onHighlight: (rects: HighlightRect[], color: InkColor) => void;
}) {
  const [selection, setSelection] = useState<Selection | null>(null);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    if (!enabled) return;
    const element = layer.current;
    if (!element) return;
    let frame = 0,
      dragging = false;
    let previousText = '';
    const stage = element.closest('.note-stage');
    const update = () => {
      const selected = document.getSelection();
      if (
        dragging ||
        !selected?.rangeCount ||
        selected.isCollapsed ||
        !element.contains(selected.anchorNode) ||
        !element.contains(selected.focusNode)
      ) {
        setSelection(null);
        return;
      }
      const range = selected.getRangeAt(0);
      const rects = selectedTextRects(element, range).filter(
        (rect) => rect.width > 0 && rect.height > 0,
      );
      const first = rects[0],
        last = rects.at(-1);
      const bounds = stage?.getBoundingClientRect();
      if (!first || !last || (bounds && (last.bottom < bounds.top || first.top > bounds.bottom))) {
        setSelection(null);
        return;
      }
      const top =
        last.bottom + 48 < Math.min(window.innerHeight, bounds?.bottom ?? window.innerHeight)
          ? last.bottom + 8
          : Math.max((bounds?.top ?? 0) + 8, first.top - 44);
      const text = selected.toString();
      if (text !== previousText) setNotice('');
      previousText = text;
      setSelection({
        text,
        rects: selectionRects(rects, element.getBoundingClientRect(), width, height),
        left: Math.max(12, Math.min(first.left, window.innerWidth - 302)),
        top,
      });
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    const down = (event: Event) => {
      if (element.contains(event.target as Node)) {
        dragging = true;
        setSelection(null);
      }
    };
    const up = () => {
      dragging = false;
      schedule();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && element.contains(document.getSelection()?.anchorNode ?? null)) {
        document.getSelection()?.removeAllRanges();
        setSelection(null);
      }
    };
    document.addEventListener('selectionchange', schedule);
    document.addEventListener('pointerdown', down);
    document.addEventListener('pointerup', up);
    document.addEventListener('keydown', escape);
    stage?.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('selectionchange', schedule);
      document.removeEventListener('pointerdown', down);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('keydown', escape);
      stage?.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [layer, width, height, enabled]);
  if (!enabled || !selection) return null;
  return createPortal(
    <div
      className="note-bubble-bar pdf-selection-menu"
      role="toolbar"
      aria-label="PDF text selection"
      style={{ left: selection.left, top: selection.top }}
      onMouseDown={(event) => event.preventDefault()}
    >
      <button
        type="button"
        className="note-bubble-tool"
        aria-label="Copy selected text"
        title="Copy selected text"
        onClick={() => {
          void navigator.clipboard.writeText(selection.text).then(
            () => setNotice('Copied'),
            () => setNotice('Copy failed. Use ⌘C or Ctrl+C.'),
          );
        }}
      >
        <Copy size={15} />
      </button>
      <span className="note-bubble-divider" />
      <Highlighter size={15} aria-hidden />
      {(['yellow', 'blue', 'green', 'red'] as const).map((color) => (
        <button
          key={color}
          type="button"
          className="note-color-swatch"
          style={{ backgroundColor: INK_COLORS[color].hex }}
          aria-label={`Highlight ${color}`}
          title={`Highlight ${color}`}
          disabled={!editable}
          onClick={() => {
            onHighlight(selection.rects, color);
            document.getSelection()?.removeAllRanges();
            setSelection(null);
          }}
        />
      ))}
      {notice ? (
        <span role="status" className="pdf-selection-notice">
          {notice}
        </span>
      ) : null}
    </div>,
    document.body,
  );
}
