import { useLayoutEffect, useRef, type RefObject } from 'react';
import { cn } from '@/lib/utils';
import { PunchedHoles } from './NotebookBinding';
import { namespaceSvgIds } from '@/features/documents/lib/svgIds';
import { NOTE_LAYOUT_EVENT } from '@/features/documents/lib/mermaid';

export type Side = 'left' | 'right';

const EDITOR_ATTRIBUTES = ['contenteditable', 'role', 'aria-label', 'aria-multiline', 'id'];

/**
 * A still copy of one page of the flowing note: for a sheet that is turning,
 * the page underneath it, or a thumbnail. The live editor stays where it is.
 */
export function PageClone({
  source,
  page,
  pageWidth,
  side,
  back,
}: {
  source: RefObject<HTMLDivElement | null>;
  page: number;
  pageWidth: number;
  side: Side;
  back?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const content = source.current?.querySelector<HTMLElement>('.tiptap');
    if (!content || !host.current) return;
    const refresh = () => {
      if (!host.current) return;
      const copy = content.cloneNode(true) as HTMLElement;
      for (const attribute of EDITOR_ATTRIBUTES) copy.removeAttribute(attribute);
      for (const control of copy.querySelectorAll('input, button, a'))
        control.setAttribute('tabindex', '-1');
      for (const svg of copy.querySelectorAll('.note-mermaid svg')) namespaceSvgIds(svg);
      // Keep the measured space so the copy uses the same page breaks as the editor.
      for (const controls of copy.querySelectorAll<HTMLElement>(
        '.note-mermaid-toolbar, .note-mermaid-source, .note-mermaid-help, .note-mermaid-copy-status, .note-mermaid-code',
      )) {
        controls.style.visibility = 'hidden';
        controls.setAttribute('aria-hidden', 'true');
      }
      copy.style.transform = `translateX(${-page * pageWidth}px)`;
      host.current.replaceChildren(copy);
    };
    refresh();
    content.addEventListener(NOTE_LAYOUT_EVENT, refresh);
    return () => content.removeEventListener(NOTE_LAYOUT_EVENT, refresh);
  }, [source, page, pageWidth]);
  return (
    <div className={cn('notebook-paper', `is-${side}`, back && 'is-back')}>
      <PunchedHoles side={side} />
      <div ref={host} className="notebook-clone study-editor-canvas" />
      <span className={`notebook-page-number is-${side}`}>{page + 1}</span>
    </div>
  );
}
