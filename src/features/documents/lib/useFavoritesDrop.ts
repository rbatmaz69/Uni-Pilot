import { useState, type DragEvent } from 'react';
import {
  DOCUMENT_DRAG_TYPE,
  FAVORITES_DROP_ATTRIBUTE,
  hasDragType,
  readDocumentDrag,
} from '@/lib/sidebar';
import { useSidebarStore } from '@/store/sidebarStore';

/**
 * Makes an element a place a document can be dropped on to become a favorite.
 * `props` go onto every such element — the Favorites tab and its panel — and
 * `over` says whether a drag is above any of them. Pointer-driven drags (the
 * canvas cards) never reach these handlers; they find the elements through
 * the attribute instead.
 */
export function useFavoritesDrop() {
  const addFavorite = useSidebarStore((state) => state.addFavorite);
  const [over, setOver] = useState(false);

  const props = {
    [FAVORITES_DROP_ATTRIBUTE]: '',
    onDragOver(event: DragEvent<HTMLElement>) {
      if (!hasDragType(event.dataTransfer, DOCUMENT_DRAG_TYPE)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'link';
      setOver(true);
    },
    onDragLeave(event: DragEvent<HTMLElement>) {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(false);
    },
    onDrop(event: DragEvent<HTMLElement>) {
      setOver(false);
      const dropped = readDocumentDrag(event.dataTransfer);
      if (!dropped) return;
      event.preventDefault();
      addFavorite(dropped);
    },
  };

  return { over, props };
}
