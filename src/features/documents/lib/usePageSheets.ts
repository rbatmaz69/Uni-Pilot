import { useLayoutEffect, useRef, useState } from 'react';
import { countSheets, sheetGeometry, type SheetLayout } from '@/features/documents/lib/pageSheets';

/**
 * A block that cannot break (a table, a code block) and is taller than a page
 * fits under no boundary and would be pushed past every new one. Growth that
 * never settles is stopped after this many passes instead of adding sheets forever.
 */
const MAX_GROWTH_PASSES = 6;

function sameLayout(a: SheetLayout | null, b: SheetLayout) {
  return (
    a !== null &&
    a.count === b.count &&
    a.height === b.height &&
    a.gap === b.gap &&
    a.marginTop === b.marginTop &&
    a.content === b.content &&
    a.breakHeight === b.breakHeight &&
    a.lead === b.lead
  );
}

/**
 * Measures the page and counts the sheets its text needs. `page` is the sheet
 * stack, whose padding is the page margin; `flow` is the text layer inside it.
 */
export function usePageSheets(
  page: HTMLElement | null,
  flow: HTMLElement | null,
  enabled: boolean,
): SheetLayout | null {
  const [layout, setLayout] = useState<SheetLayout | null>(null);
  const count = useRef(1);
  const growth = useRef(0);

  useLayoutEffect(() => {
    count.current = 1;
    growth.current = 0;
    if (!enabled || !page || !flow) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const style = getComputedStyle(page);
      const geometry = sheetGeometry({
        width: page.offsetWidth,
        marginTop: parseFloat(style.paddingTop) || 0,
        marginBottom: parseFloat(style.paddingBottom) || 0,
        gap: parseFloat(style.getPropertyValue('--note-sheet-gap')) || 0,
      });
      if (!geometry) {
        setLayout(null);
        return;
      }
      // The text is the layer's last child, below the cover and the title.
      // Screen rectangles are zoomed; the geometry is in the page's own pixels.
      const text = (flow.lastElementChild ?? flow).getBoundingClientRect();
      const bounds = page.getBoundingClientRect();
      const scale = bounds.width / page.offsetWidth || 1;
      const bottom = (text.bottom - bounds.top) / scale;
      const lead = (text.top - flow.getBoundingClientRect().top) / scale;
      let next = countSheets(bottom, count.current, geometry);
      if (next > count.current) {
        growth.current += 1;
        if (growth.current > MAX_GROWTH_PASSES) next = count.current;
      } else growth.current = 0;
      count.current = next;
      const measured = { ...geometry, count: next, lead };
      setLayout((current) => (sameLayout(current, measured) ? current : measured));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    // A frame later, not inside the callback: the new sheets resize what is observed.
    const observer = new ResizeObserver(() => {
      if (!frame) frame = requestAnimationFrame(measure);
    });
    observer.observe(page);
    observer.observe(flow);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [enabled, page, flow]);

  return enabled ? layout : null;
}
