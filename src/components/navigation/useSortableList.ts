import { useRef, useState, type DragEvent } from 'react';
import { hasDragType } from '@/lib/sidebar';

interface SortableOptions {
  /** The drag type this list's own rows carry; their payload is the row key. */
  type: string;
  keys: readonly string[];
  /** Further drag types dropped into the list, e.g. documents from the explorer. */
  accepts?: readonly string[];
  /** `before` is the key the drop landed in front of, or null for the end. */
  onDrop: (transfer: DataTransfer, before: string | null) => void;
}

/**
 * HTML5 drag-and-drop reordering for a sidebar list, with a Finder-style line
 * where the row will land. Rows report which half the pointer is over; the
 * list applies the drop.
 */
export function useSortableList({ type, keys, accepts = [], onDrop }: SortableOptions) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [slot, setSlot] = useState<number | null>(null);
  const slotRef = useRef<number | null>(null);

  function place(next: number | null) {
    slotRef.current = next;
    setSlot(next);
  }
  function accepted(event: DragEvent) {
    return [type, ...accepts].some((item) => hasDragType(event.dataTransfer, item));
  }

  function row(key: string, index: number) {
    const last = index === keys.length - 1;
    return {
      draggable: true,
      'data-dragging': dragging === key || undefined,
      'data-drop': slot === index ? 'before' : last && slot === keys.length ? 'after' : undefined,
      onDragStart: (event: DragEvent<HTMLElement>) => {
        event.stopPropagation();
        event.dataTransfer.setData(type, key);
        event.dataTransfer.effectAllowed = 'move';
        // A dragged link would otherwise show its URL instead of the row.
        event.dataTransfer.setDragImage?.(event.currentTarget, 16, 15);
        setDragging(key);
      },
      onDragEnd: () => {
        setDragging(null);
        place(null);
      },
      onDragOver: (event: DragEvent<HTMLElement>) => {
        if (!accepted(event)) return;
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = hasDragType(event.dataTransfer, type) ? 'move' : 'link';
        const rect = event.currentTarget.getBoundingClientRect();
        place(index + (event.clientY > rect.top + rect.height / 2 ? 1 : 0));
      },
    };
  }

  const list = {
    onDragLeave: (event: DragEvent<HTMLElement>) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) place(null);
    },
    onDrop: (event: DragEvent<HTMLElement>) => {
      if (!accepted(event)) return;
      event.preventDefault();
      event.stopPropagation();
      const index = slotRef.current ?? keys.length;
      place(null);
      setDragging(null);
      onDrop(event.dataTransfer, keys[index] ?? null);
    },
  };

  return { row, list };
}
