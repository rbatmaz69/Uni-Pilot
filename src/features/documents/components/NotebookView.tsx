import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type WheelEvent,
} from 'react';
import type { Editor } from '@tiptap/react';
import {
  activeSection,
  clampSpread,
  countPages,
  countSpreads,
  dragProgress,
  edgeLayers,
  MAX_SECTION_TABS,
  notebookGeometry,
  pagesLabel,
  releaseCompletes,
  riffleSteps,
  spreadAt,
  type NotebookSection,
} from '@/features/documents/lib/notebook';
import { createPaperSounds } from '@/features/documents/lib/paperSounds';
import { NOTE_LAYOUT_EVENT } from '@/features/documents/lib/mermaid';
import { useNoteStyleStore } from '@/features/documents/store/noteStyleStore';
import { cn } from '@/lib/utils';
import { NotebookBinding, PunchedHoles } from './NotebookBinding';
import { NotebookCover } from './NotebookCover';
import { NotebookDock } from './NotebookDock';
import { NotebookOverview } from './NotebookOverview';
import { NotebookPageRail } from './NotebookPageRail';
import { NotebookSheet, type Flip } from './NotebookSheet';

type NotebookViewProps = {
  title: string;
  /** The note's file, which its bookmark belongs to. */
  notePath: string;
  /** The rich editor whose caret the pages follow; null for plain text. */
  editor: Editor | null;
  /** Rich notes flow across the pages; plain text keeps one scrolling page. */
  flow: boolean;
  children: ReactNode;
};

type Drag = {
  direction: 1 | -1;
  startX: number;
  lastX: number;
  lastTime: number;
  /** Pointer speed towards turning, in pixels per millisecond. */
  velocity: number;
  active: boolean;
};

/** Fallbacks in case a browser skips an animation, e.g. in a hidden window. */
const FLIP_FALLBACK_MS: Record<Flip['motion'], number | null> = {
  turn: 900,
  quick: 520,
  drag: null,
  settle: 520,
};
/** A grabbed corner starts a drag after this many pixels, not a click. */
const DRAG_THRESHOLD = 6;
/** The corner is grabbed a little inside the page edge. */
const CORNER_GRIP = 24;
const SWIPE_DISTANCE = 60;
const SWIPE_LOCK_MS = 650;

function reducedMotion() {
  return (
    typeof window.matchMedia !== 'function' ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function sameSections(a: NotebookSection[], b: NotebookSection[]) {
  return (
    a.length === b.length &&
    a.every(
      (section, index) => section.label === b[index]?.label && section.spread === b[index]?.spread,
    )
  );
}

export function NotebookView({ title, notePath, editor, flow, children }: NotebookViewProps) {
  const paper = useNoteStyleStore((state) => state.paper);
  const setPaper = useNoteStyleStore((state) => state.setPaper);
  const sound = useNoteStyleStore((state) => state.sound);
  const toggleSound = useNoteStyleStore((state) => state.toggleSound);
  const bookmark = useNoteStyleStore((state) => state.bookmarks[notePath]);
  const setBookmark = useNoteStyleStore((state) => state.setBookmark);
  const [sounds] = useState(() => createPaperSounds(() => useNoteStyleStore.getState().sound));

  const deskRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<HTMLDivElement>(null);
  const flowRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [spread, setSpread] = useState(0);
  const [pages, setPages] = useState(2);
  const [sections, setSections] = useState<NotebookSection[]>([]);
  const [bookmarkSpread, setBookmarkSpread] = useState<number | null>(null);
  const [flip, setFlip] = useState<Flip | null>(null);
  const [opening, setOpening] = useState(() => !reducedMotion());
  const [overview, setOverview] = useState(false);
  const [thumbnailsOpen, setThumbnailsOpen] = useState(true);
  const [calm, setCalm] = useState(false);
  const geometry = useMemo(() => notebookGeometry(size.width), [size.width]);
  const spreads = flow ? countSpreads(pages) : 1;

  // Event handlers read the latest layout without re-subscribing on every change.
  const spreadRef = useRef(0);
  const spreadsRef = useRef(1);
  const geometryRef = useRef(geometry);
  const bookmarkRef = useRef(bookmark);
  const flipRef = useRef<Flip | null>(null);
  const queueRef = useRef<number[]>([]);
  const dragRef = useRef<Drag | null>(null);
  const suppressClick = useRef(false);
  const flipId = useRef(0);
  const openingRef = useRef(opening);
  const swipe = useRef({ total: 0, lockedUntil: 0 });
  const pointer = useRef({ x: 0, y: 0 });
  useLayoutEffect(() => {
    geometryRef.current = geometry;
    spreadsRef.current = spreads;
    bookmarkRef.current = bookmark;
    openingRef.current = opening;
  }, [geometry, spreads, bookmark, opening]);

  // Layout size, not the visual one: the book rises into place when it opens.
  // Whole pixels keep every spread boundary on an exact scroll position.
  useLayoutEffect(() => {
    const book = bookRef.current;
    if (!book) return;
    const update = (width: number, height: number) => {
      const next = { width: Math.floor(width), height: Math.floor(height) };
      setSize((current) =>
        current.width === next.width && current.height === next.height ? current : next,
      );
    };
    update(book.offsetWidth, book.offsetHeight);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) update(entry.contentRect.width, entry.contentRect.height);
    });
    observer.observe(book);
    return () => observer.disconnect();
  }, []);

  /** Counts the pages and finds where each heading and the ribbon landed. */
  const measureFlow = useCallback(() => {
    const element = flowRef.current;
    const content = element?.querySelector<HTMLElement>('.tiptap');
    const current = geometryRef.current;
    if (!flow || !element || !content || current.spread <= 0) return;
    const origin = element.getBoundingClientRect().left - element.scrollLeft;
    // Not scrollWidth: the end marker below keeps that at whole spreads.
    const last = content.lastElementChild;
    const end = last ? Math.max(0, ...Array.from(last.getClientRects(), (rect) => rect.right)) : 0;
    const nextPages = countPages(end - origin, current);
    spreadsRef.current = countSpreads(nextPages);
    setPages(nextPages);

    const top = content.querySelectorAll<HTMLElement>(':scope > h1');
    const headings = top.length ? top : content.querySelectorAll<HTMLElement>(':scope > h2');
    const next = Array.from(headings)
      .map((heading) => ({
        label: heading.textContent?.trim() ?? '',
        spread: spreadAt(heading.getBoundingClientRect().left - origin, current),
      }))
      .filter((section) => section.label)
      .slice(0, MAX_SECTION_TABS);
    setSections((previous) => (sameSections(previous, next) ? previous : next));

    const marked = bookmarkRef.current;
    let marker: number | null = null;
    if (marked !== undefined && editor && !editor.isDestroyed) {
      try {
        const position = Math.min(marked, editor.state.doc.content.size);
        marker = spreadAt(editor.view.coordsAtPos(position).left - origin, current);
      } catch {
        marker = null;
      }
    }
    setBookmarkSpread(marker);
  }, [flow, editor]);

  /** Moves the live pages without any animation. */
  const show = useCallback((to: number) => {
    spreadRef.current = to;
    setSpread(to);
    if (flowRef.current) flowRef.current.scrollLeft = to * geometryRef.current.spread;
  }, []);

  /** The thumbnail rail lands immediately on its selected spread. */
  const jump = useCallback(
    (target: number) => {
      queueRef.current = [];
      flipRef.current = null;
      setFlip(null);
      sounds.play('tab');
      show(clampSpread(target, spreadsRef.current));
    },
    [show, sounds],
  );

  /** Starts one sheet turning; the live pages move under it at once. */
  const startFlip = useCallback(
    (target: number, motion: Flip['motion']) => {
      const from = spreadRef.current;
      const to = clampSpread(target, spreadsRef.current);
      if (to === from) return false;
      show(to);
      const next = reducedMotion() ? null : { id: ++flipId.current, from, to, motion, progress: 0 };
      flipRef.current = next;
      setFlip(next);
      return true;
    },
    [show],
  );

  const finishFlip = useCallback(() => {
    const current = flipRef.current;
    // A released sheet that fell back: the pages underneath return with it.
    if (current?.motion === 'settle' && current.progress === 0) show(current.from);
    flipRef.current = null;
    const upcoming = queueRef.current.shift();
    if (upcoming !== undefined && startFlip(upcoming, 'quick')) return;
    queueRef.current = [];
    setFlip(null);
  }, [show, startFlip]);

  /** Turns to a spread: one sheet next door, a quick riffle further away. */
  const go = useCallback(
    (target: number) => {
      if (flipRef.current?.motion === 'drag' || flipRef.current?.motion === 'settle') return;
      const from = spreadRef.current;
      const to = clampSpread(target, spreadsRef.current);
      if (to === from) return;
      // Under the closed cover, pages move silently to where the note opens.
      if (openingRef.current) {
        show(to);
        return;
      }
      const steps = riffleSteps(from, to);
      const [first, ...rest] = steps;
      if (first === undefined) return;
      sounds.play(steps.length > 1 ? 'riffle' : 'turn');
      queueRef.current = rest;
      startFlip(first, steps.length > 1 ? 'quick' : 'turn');
    },
    [show, sounds, startFlip],
  );

  // Deleting text can remove the spread being shown.
  useEffect(() => {
    if (spread > spreads - 1 && !flipRef.current) show(spreads - 1);
  }, [spread, spreads, show]);

  // The flow only ever shows whole spreads, whatever the browser tried to scroll.
  useLayoutEffect(() => {
    const element = flowRef.current;
    if (!element) return;
    element.scrollLeft = spread * geometry.spread;
    element.scrollTop = 0;
    measureFlow();
  }, [spread, geometry, measureFlow]);

  useEffect(() => {
    measureFlow();
  }, [bookmark, paper, measureFlow]);

  // Writing past the last line of a page turns to the next one, like the caret does.
  useEffect(() => {
    if (!editor || !flow) return;
    let frame = 0;
    const follow = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        measureFlow();
        const element = flowRef.current;
        // Where the focus is, not whether the window has it: the caret still counts.
        if (!element || editor.isDestroyed || !element.contains(document.activeElement)) return;
        let left: number;
        try {
          left = editor.view.coordsAtPos(editor.state.selection.head).left;
        } catch {
          return;
        }
        const origin = element.getBoundingClientRect().left - element.scrollLeft;
        go(spreadAt(left - origin, geometryRef.current));
      });
    };
    editor.on('update', follow);
    editor.on('selectionUpdate', follow);
    editor.on('focus', follow);
    follow();
    return () => {
      cancelAnimationFrame(frame);
      editor.off('update', follow);
      editor.off('selectionUpdate', follow);
      editor.off('focus', follow);
    };
  }, [editor, flow, measureFlow, go]);

  // Late fonts, images, and rendered diagrams change page layout without an edit.
  useEffect(() => {
    const element = flowRef.current;
    if (!flow || !element) return;
    let active = true;
    const remeasure = () => {
      if (active) measureFlow();
    };
    element.addEventListener('load', remeasure, true);
    element.addEventListener(NOTE_LAYOUT_EVENT, remeasure);
    void document.fonts?.ready.then(remeasure);
    return () => {
      active = false;
      element.removeEventListener('load', remeasure, true);
      element.removeEventListener(NOTE_LAYOUT_EVENT, remeasure);
    };
  }, [flow, measureFlow]);

  useEffect(() => {
    const timeout = flip ? FLIP_FALLBACK_MS[flip.motion] : null;
    if (timeout === null) return;
    const timer = window.setTimeout(finishFlip, timeout);
    return () => window.clearTimeout(timer);
  }, [flip, finishFlip]);

  // The cover swings open with a soft thud; ticking a task clicks.
  useEffect(() => {
    if (opening) sounds.play('cover');
    // Only when the notebook first appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const desk = deskRef.current;
    if (!desk) return;
    const tick = (event: Event) => {
      if ((event.target as HTMLInputElement).type === 'checkbox') sounds.play('tick');
    };
    desk.addEventListener('change', tick);
    return () => desk.removeEventListener('change', tick);
  }, [sounds]);

  const endOpening = useCallback(() => setOpening(false), []);

  function onScroll() {
    const element = flowRef.current;
    if (!element) return;
    const expected = spreadRef.current * geometryRef.current.spread;
    if (Math.abs(element.scrollLeft - expected) > 1) element.scrollLeft = expected;
    if (element.scrollTop !== 0) element.scrollTop = 0;
  }

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (overview) return;
    const typing = (event.target as HTMLElement).closest('.tiptap, textarea, input');
    const step =
      event.key === 'PageDown' || (!typing && event.key === 'ArrowRight')
        ? 1
        : event.key === 'PageUp' || (!typing && event.key === 'ArrowLeft')
          ? -1
          : 0;
    if (!step || !flow) return;
    event.preventDefault();
    go(spreadRef.current + step);
  }

  // A two-finger swipe on a trackpad turns the page.
  function onWheel(event: WheelEvent<HTMLDivElement>) {
    if (!flow || overview || Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
    const state = swipe.current;
    if (event.timeStamp < state.lockedUntil) return;
    state.total += event.deltaX;
    if (Math.abs(state.total) < SWIPE_DISTANCE) return;
    go(spreadRef.current + Math.sign(state.total));
    state.total = 0;
    state.lockedUntil = event.timeStamp + SWIPE_LOCK_MS;
  }

  // Writing calms the desk; moving the pointer brings the controls back.
  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const last = pointer.current;
    const moved = Math.hypot(event.clientX - last.x, event.clientY - last.y);
    pointer.current = { x: event.clientX, y: event.clientY };
    if (calm && moved > 4) setCalm(false);
  }

  // Blank paper after the end of the note still takes a click to write there.
  function onPaperDown(event: MouseEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget || !editor?.isEditable) return;
    event.preventDefault();
    editor.commands.focus('end');
  }

  // The drag is followed on the window: the grabbed corner itself may vanish
  // as soon as the pages underneath move to the next spread.
  const releaseDrag = useRef<(() => void) | null>(null);
  useEffect(() => () => releaseDrag.current?.(), []);

  function onCornerDown(direction: 1 | -1) {
    return (event: PointerEvent<HTMLDivElement>) => {
      suppressClick.current = false;
      if (event.button !== 0 || flipRef.current) return;
      dragRef.current = {
        direction,
        startX: event.clientX,
        lastX: event.clientX,
        lastTime: event.timeStamp,
        velocity: 0,
        active: false,
      };
      const move = (moved: globalThis.PointerEvent) => onCornerMove(moved);
      const release = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', end);
        window.removeEventListener('pointercancel', end);
        window.removeEventListener('blur', end);
        releaseDrag.current = null;
      };
      const end = () => {
        release();
        onCornerUp();
      };
      releaseDrag.current?.();
      releaseDrag.current = release;
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', end);
      window.addEventListener('pointercancel', end);
      window.addEventListener('blur', end);
    };
  }

  function onCornerMove(event: { clientX: number; timeStamp: number }) {
    const drag = dragRef.current;
    const book = bookRef.current;
    if (!drag || !book) return;
    const travelled = (drag.startX - event.clientX) * drag.direction;
    if (!drag.active) {
      if (travelled < DRAG_THRESHOLD) return;
      if (!startFlip(spreadRef.current + drag.direction, 'drag') || !flipRef.current) {
        dragRef.current = null;
        return;
      }
      drag.active = true;
      suppressClick.current = true;
    }
    const elapsed = Math.max(1, event.timeStamp - drag.lastTime);
    drag.velocity = ((drag.lastX - event.clientX) * drag.direction) / elapsed;
    drag.lastX = event.clientX;
    drag.lastTime = event.timeStamp;
    const current = flipRef.current;
    if (!current) return;
    const next = { ...current, progress: dragProgress(travelled + CORNER_GRIP, book.offsetWidth) };
    flipRef.current = next;
    setFlip(next);
  }

  function onCornerUp() {
    const drag = dragRef.current;
    dragRef.current = null;
    const current = flipRef.current;
    if (!drag?.active || current?.motion !== 'drag') return;
    const complete = releaseCompletes(current.progress, drag.velocity);
    if (complete) sounds.play('turn');
    const next: Flip = { ...current, motion: 'settle', progress: complete ? 1 : 0 };
    flipRef.current = next;
    setFlip(next);
  }

  function onCornerClick(direction: 1 | -1) {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    go(spreadRef.current + direction);
  }

  function toggleBookmark() {
    if (!editor || !flowRef.current) return;
    sounds.play('ribbon');
    if (bookmarkSpread === spreadRef.current) {
      setBookmark(notePath, null);
      return;
    }
    // Mark the first words on the left page, so the ribbon moves with the text.
    const rect = flowRef.current.getBoundingClientRect();
    const padding = geometryRef.current.padding;
    const found = editor.view.posAtCoords({
      left: rect.left + padding + 2,
      top: rect.top + padding + 2,
    });
    setBookmark(notePath, found?.pos ?? 0);
  }

  const layers = edgeLayers(spread, spreads);
  const active = activeSection(sections, spread);
  const deskStyle = {
    '--notebook-spread-w': `${geometry.spread}px`,
    '--notebook-page-h': `${size.height}px`,
    '--notebook-padding': `${geometry.padding}px`,
  } as CSSProperties;

  return (
    <div
      ref={deskRef}
      role="region"
      aria-label="Notebook"
      data-paper={paper}
      className={cn('notebook-desk', calm && 'is-calm', flow && thumbnailsOpen && 'has-page-rail')}
      style={deskStyle}
      onKeyDown={onKeyDown}
      onWheel={onWheel}
      onInput={() => setCalm(true)}
      onPointerMove={onPointerMove}
    >
      <div
        ref={bookRef}
        className={cn(
          'notebook-book notebook-ink',
          opening && 'is-opening',
          flip?.motion === 'drag' && 'is-dragging',
        )}
        // Positions read while the book was still rising were moved with it.
        onAnimationEnd={(event) => {
          if (event.target === event.currentTarget) measureFlow();
        }}
      >
        <div className="notebook-pages">
          {(['left', 'right'] as const).map((side) => (
            <div key={side} className={`notebook-edges is-${side}`} aria-hidden>
              {Array.from({ length: layers[side] }, (_, index) => (
                <span
                  key={index}
                  style={{
                    [side]: `${-(index + 1) * 1.4}px`,
                    top: `${3 + index * 0.5}px`,
                    bottom: `${3 + index * 0.5}px`,
                  }}
                />
              ))}
            </div>
          ))}

          {(['left', 'right'] as const).map((side, index) => (
            <div key={side} className={`notebook-paper is-${side}`}>
              <PunchedHoles side={side} />
              <span className={`notebook-page-number is-${side}`} aria-hidden>
                {spread * 2 + index + 1}
              </span>
            </div>
          ))}

          {flow ? (
            <div
              ref={flowRef}
              className="notebook-flow study-editor-canvas"
              onScroll={onScroll}
              onMouseDown={onPaperDown}
            >
              {children}
              {/* Lets the last spread scroll fully into place when its right page is empty. */}
              <span
                className="notebook-flow-end"
                style={{ left: `${spreads * geometry.spread}px` }}
                aria-hidden
              />
            </div>
          ) : (
            <>
              <div className="notebook-title-page">
                <span className="notebook-eyebrow">Plain text</span>
                <h2>{title}</h2>
                <span className="notebook-title-rule" aria-hidden />
              </div>
              <div className="notebook-single">{children}</div>
            </>
          )}

          {bookmarkSpread === spread ? (
            <span key={`ribbon-${spread}`} className="notebook-ribbon" aria-hidden />
          ) : null}

          {flip ? (
            <NotebookSheet
              key={flip.id}
              flip={flip}
              source={flowRef}
              pageWidth={geometry.page}
              onDone={finishFlip}
            />
          ) : null}

          <NotebookBinding />

          {flow ? (
            <>
              {(
                [
                  [-1, 'is-prev', spread > 0],
                  [1, 'is-next', spread < spreads - 1],
                ] as const
              ).map(([direction, name, available]) =>
                available ? (
                  <div
                    key={name}
                    aria-hidden
                    className={cn('notebook-corner', name)}
                    onPointerDown={onCornerDown(direction)}
                    onClick={() => onCornerClick(direction)}
                  >
                    <span className="notebook-curl">
                      <span />
                    </span>
                  </div>
                ) : null,
              )}
            </>
          ) : null}
        </div>

        {bookmarkSpread !== null && bookmarkSpread !== spread ? (
          <button
            type="button"
            aria-label="Go to bookmark"
            title="Go to bookmark"
            className={cn(
              'notebook-ribbon-tail',
              bookmarkSpread > spread ? 'is-ahead' : 'is-behind',
            )}
            onClick={() => {
              sounds.play('ribbon');
              go(bookmarkSpread);
            }}
          />
        ) : null}

        {sections.length ? (
          <nav aria-label="Sections" className="notebook-tabs">
            {sections.map((section, index) => (
              <button
                key={`${section.label}-${index}`}
                type="button"
                title={section.label}
                aria-current={index === active ? 'true' : undefined}
                className="notebook-tab"
                style={{ '--i': index } as CSSProperties}
                onClick={() => {
                  sounds.play('tab');
                  go(section.spread);
                }}
              >
                <span>{section.label}</span>
              </button>
            ))}
          </nav>
        ) : null}

        {opening ? <NotebookCover title={title} onOpen={endOpening} /> : null}
      </div>

      {flow && thumbnailsOpen ? (
        <NotebookPageRail
          source={flowRef}
          editor={editor}
          pages={pages}
          currentSpread={spread}
          size={size}
          onPick={jump}
          onClose={() => setThumbnailsOpen(false)}
        />
      ) : null}

      <NotebookDock
        label={pagesLabel(spread, spreads)}
        paged={flow}
        canPrevious={spread > 0}
        canNext={spread < spreads - 1}
        bookmarked={bookmarkSpread === spread}
        paper={paper}
        sound={sound}
        onPrevious={() => go(spread - 1)}
        onNext={() => go(spread + 1)}
        onOverview={() => {
          sounds.play('tab');
          setOverview(true);
        }}
        thumbnailsOpen={thumbnailsOpen}
        onToggleThumbnails={() => setThumbnailsOpen((open) => !open)}
        onBookmark={toggleBookmark}
        onPaper={(next) => {
          sounds.play('tab');
          setPaper(next);
        }}
        onSound={toggleSound}
      />

      {overview ? (
        <NotebookOverview
          source={flowRef}
          spreads={spreads}
          current={spread}
          sections={sections}
          bookmark={bookmarkSpread}
          size={size}
          words={editor?.storage.characterCount?.words() ?? 0}
          onClose={() => {
            setOverview(false);
            deskRef.current
              ?.querySelector<HTMLButtonElement>('[aria-label="Page overview"]')
              ?.focus();
          }}
          onPick={(target) => {
            setOverview(false);
            window.setTimeout(() => go(target), 140);
          }}
        />
      ) : null}
    </div>
  );
}
