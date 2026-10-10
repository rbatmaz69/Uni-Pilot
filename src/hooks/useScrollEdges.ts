import { useEffect, useState, type RefObject } from 'react';

export interface ScrollEdges {
  /** Content is scrolled out of sight above the visible part. */
  above: boolean;
  /** Content is waiting out of sight below the visible part. */
  below: boolean;
}

const NONE: ScrollEdges = { above: false, below: false };

/**
 * Which edges of a scroll container have more behind them, for a cue (a fade) that
 * says "this scrolls". Follows scrolling, the container's own size and what is
 * added to or removed from it.
 */
export function useScrollEdges(ref: RefObject<HTMLElement | null>): ScrollEdges {
  const [edges, setEdges] = useState(NONE);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => {
      const above = element.scrollTop > 1;
      const below = element.scrollHeight - element.clientHeight - element.scrollTop > 1;
      setEdges((current) =>
        current.above === above && current.below === below ? current : { above, below },
      );
    };
    update();
    element.addEventListener('scroll', update, { passive: true });
    // A taller window needs no cue; a favorite added to the list may.
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    resize?.observe(element);
    const content = new MutationObserver(update);
    content.observe(element, { childList: true, subtree: true });
    return () => {
      element.removeEventListener('scroll', update);
      resize?.disconnect();
      content.disconnect();
    };
  }, [ref]);

  return edges;
}
