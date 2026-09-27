import { useEffect, useRef, useState, type RefObject } from 'react';
import type { Editor } from '@tiptap/react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PageClone } from './NotebookPage';
import { NOTE_LAYOUT_EVENT } from '@/features/documents/lib/mermaid';

const THUMB_WIDTH = 116;

function PageThumbnail({
  source,
  page,
  pageWidth,
  pageHeight,
  revision,
  current,
  onPick,
}: {
  source: RefObject<HTMLDivElement | null>;
  page: number;
  pageWidth: number;
  pageHeight: number;
  revision: number;
  current: boolean;
  onPick: () => void;
}) {
  const host = useRef<HTMLButtonElement>(null);
  const [near, setNear] = useState(typeof IntersectionObserver === 'undefined');

  useEffect(() => {
    const element = host.current;
    if (!element || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) => setNear(Boolean(entry?.isIntersecting)),
      { root: element.closest('.notebook-page-rail-list'), rootMargin: '240px 0px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const scale = pageWidth > 0 ? THUMB_WIDTH / pageWidth : 0;

  return (
    <button
      ref={host}
      type="button"
      className={cn('notebook-page-rail-item', current && 'is-current')}
      aria-label={`Go to page ${page + 1}`}
      aria-current={current ? 'page' : undefined}
      onClick={onPick}
    >
      <span
        className="notebook-page-rail-paper"
        style={{ aspectRatio: `${pageWidth || 1} / ${pageHeight || 1}` }}
        aria-hidden="true"
      >
        {near && pageWidth > 0 ? (
          <span
            className="notebook-page-rail-scale notebook-ink"
            style={{
              width: pageWidth * 2,
              height: pageHeight,
              transform: `scale(${scale})`,
            }}
          >
            <PageClone
              key={revision}
              source={source}
              page={page}
              pageWidth={pageWidth}
              side="left"
            />
          </span>
        ) : null}
      </span>
      <span className="notebook-page-rail-number">{page + 1}</span>
    </button>
  );
}

export function NotebookPageRail({
  source,
  editor,
  pages,
  currentSpread,
  size,
  onPick,
  onClose,
}: {
  source: RefObject<HTMLDivElement | null>;
  editor: Editor | null;
  pages: number;
  currentSpread: number;
  size: { width: number; height: number };
  onPick: (spread: number) => void;
  onClose: () => void;
}) {
  const [revision, setRevision] = useState(0);
  const list = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!editor) return;
    let timer = 0;
    const refresh = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setRevision((value) => value + 1), 180);
    };
    editor.on('update', refresh);
    const element = source.current;
    element?.addEventListener(NOTE_LAYOUT_EVENT, refresh);
    return () => {
      window.clearTimeout(timer);
      editor.off('update', refresh);
      element?.removeEventListener(NOTE_LAYOUT_EVENT, refresh);
    };
  }, [editor, source]);

  useEffect(() => {
    list.current?.querySelector('[aria-current="page"]')?.scrollIntoView?.({ block: 'nearest' });
  }, [currentSpread]);

  const pageWidth = size.width / 2;
  return (
    <aside className="notebook-page-rail" aria-label="Document pages">
      <header className="notebook-page-rail-header">
        <div>
          <strong>Pages</strong>
          <span>{pages}</span>
        </div>
        <button type="button" aria-label="Hide page thumbnails" onClick={onClose}>
          <X size={15} />
        </button>
      </header>
      <nav ref={list} className="notebook-page-rail-list" aria-label="Page thumbnails">
        {Array.from({ length: pages }, (_, page) => (
          <PageThumbnail
            key={page}
            source={source}
            page={page}
            pageWidth={pageWidth}
            pageHeight={size.height}
            revision={revision}
            current={page === currentSpread * 2}
            onPick={() => onPick(Math.floor(page / 2))}
          />
        ))}
      </nav>
    </aside>
  );
}
