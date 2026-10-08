import type { HighlightRect } from './pdfInkTypes';

/** Convert visible text runs into page points; zoom and page rotation are already in the DOM geometry. */
export function selectionRects(
  rects: ArrayLike<DOMRect>,
  page: DOMRect,
  width: number,
  height: number,
): HighlightRect[] {
  if (page.width <= 0 || page.height <= 0) return [];
  const result: HighlightRect[] = [];
  for (const rect of Array.from(rects)) {
    const left = Math.max(page.left, rect.left),
      top = Math.max(page.top, rect.top);
    const right = Math.min(page.right, rect.right),
      bottom = Math.min(page.bottom, rect.bottom);
    if (right - left < 0.5 || bottom - top < 0.5) continue;
    const next = {
      x: ((left - page.left) * width) / page.width,
      y: ((top - page.top) * height) / page.height,
      width: ((right - left) * width) / page.width,
      height: ((bottom - top) * height) / page.height,
    };
    const last = result.at(-1);
    if (
      last &&
      Math.abs(last.y - next.y) < 2 &&
      Math.abs(last.height - next.height) < 2 &&
      next.x >= last.x &&
      next.x <= last.x + last.width + 6
    )
      last.width = Math.max(last.width, next.x + next.width - last.x);
    else result.push(next);
  }
  return result;
}

/** Text nodes only: element rectangles can include text outside the actual selection. */
export function selectedTextRects(layer: HTMLElement, range: Range): DOMRect[] {
  const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT);
  const rects: DOMRect[] = [];
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (!range.intersectsNode(node)) continue;
    const part = document.createRange();
    part.setStart(node, range.startContainer === node ? range.startOffset : 0);
    part.setEnd(
      node,
      range.endContainer === node ? range.endOffset : (node.textContent?.length ?? 0),
    );
    if (!part.collapsed) rects.push(...Array.from(part.getClientRects()));
  }
  return rects;
}
