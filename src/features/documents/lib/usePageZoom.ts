import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { clampZoom } from '@/features/documents/lib/pageSheets';
import { useNoteStyleStore } from '@/features/documents/store/noteStyleStore';

/** A point of the page, in unzoomed pixels, and where on screen it has to stay. */
type Anchor = { x: number; y: number; left: number; top: number };
type Point = { x: number; y: number };

/** WebKit reports a trackpad pinch as gesture events, not as a wheel with Ctrl. */
type GestureEvent = Event & { scale?: number; clientX?: number; clientY?: number };

const frameOf = (stage: HTMLElement) => stage.querySelector<HTMLElement>('.note-zoom');

/**
 * Zooms the sheets inside `stage` around a point, so what is under the
 * pointer (or the middle of the window) stays in place. A pinch on the
 * trackpad and Ctrl or ⌘ with the scroll wheel zoom as well.
 */
export function usePageZoom(stage: HTMLElement | null, enabled: boolean) {
  const zoom = useNoteStyleStore((state) => state.zoom);
  const setZoom = useNoteStyleStore((state) => state.setZoom);
  // The zoom the page is drawn at, and the one asked for since.
  const drawn = useRef(zoom);
  const wanted = useRef(zoom);
  const anchor = useRef<Anchor | null>(null);

  const zoomTo = useCallback(
    (next: number, origin?: Point) => {
      const target = clampZoom(next);
      if (target === wanted.current) return;
      const frame = stage && frameOf(stage);
      // Several steps before the next paint keep the first point in place.
      if (stage && frame && !anchor.current) {
        const bounds = stage.getBoundingClientRect();
        const left = origin ? origin.x - bounds.left : stage.clientWidth / 2;
        const top = origin ? origin.y - bounds.top : stage.clientHeight / 2;
        anchor.current = {
          x: (stage.scrollLeft + left - frame.offsetLeft) / drawn.current,
          y: (stage.scrollTop + top - frame.offsetTop) / drawn.current,
          left,
          top,
        };
      }
      wanted.current = target;
      setZoom(target);
    },
    [stage, setZoom],
  );

  useLayoutEffect(() => {
    drawn.current = zoom;
    wanted.current = zoom;
    const point = anchor.current;
    anchor.current = null;
    const frame = stage && frameOf(stage);
    if (!point || !stage || !frame) return;
    stage.scrollTo({
      left: point.x * zoom + frame.offsetLeft - point.left,
      top: point.y * zoom + frame.offsetTop - point.top,
      behavior: 'instant',
    });
  }, [zoom, stage]);

  useEffect(() => {
    if (!stage || !enabled) return;
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const lines = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : 1;
      // A pinch sends small steps; a wheel notch is held to about a fifth.
      const delta = Math.max(-40, Math.min(40, event.deltaY * lines));
      zoomTo(wanted.current * Math.exp(-delta / 200), {
        x: event.clientX,
        y: event.clientY,
      });
    };
    let pinchFrom = 1;
    const gestureStart = (event: Event) => {
      event.preventDefault();
      pinchFrom = wanted.current;
    };
    const gestureChange = (event: GestureEvent) => {
      event.preventDefault();
      const origin =
        event.clientX === undefined || event.clientY === undefined
          ? undefined
          : { x: event.clientX, y: event.clientY };
      zoomTo(pinchFrom * (event.scale ?? 1), origin);
    };
    stage.addEventListener('wheel', wheel, { passive: false });
    stage.addEventListener('gesturestart', gestureStart);
    stage.addEventListener('gesturechange', gestureChange);
    return () => {
      stage.removeEventListener('wheel', wheel);
      stage.removeEventListener('gesturestart', gestureStart);
      stage.removeEventListener('gesturechange', gestureChange);
    };
  }, [stage, enabled, zoomTo]);

  return { zoom: enabled ? zoom : 1, zoomTo };
}
