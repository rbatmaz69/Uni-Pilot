import { useUiStore } from '@/store/uiStore';

/**
 * How a section's sidebar comes and goes. A panel that arrives slides out
 * from under the card, which glides aside, and comes into focus in steps; one
 * that goes blurs out the same way while the card glides back over it. Moving
 * from one panel to another (Mail to Settings), the old one blurs out on top
 * of the new one while the card settles at the new width.
 *
 * Real layout moves, not pictures of it: the panel's right margin runs from
 * minus its width to nothing, so the card — the panel's neighbour in the row —
 * moves with it and keeps its own border and corners all the way. A panel that
 * goes is already gone from the DOM when its page has changed, so its ref's
 * cleanup (which React calls while the element is still in place) copies it,
 * and the copy — inert, hidden from assistive technology — is what slides
 * away. Whether a panel arrives, goes or is swapped is only known once React
 * has finished, so arrivals and departures are collected and settled in one
 * microtask, before the browser paints.
 *
 * Nothing moves while ILIAS is open (its native view is laid out from the
 * panel's measured edge), when the system asks for reduced motion, where the
 * browser has no Web Animations, or before the student has done anything: a
 * window that opens should not perform. The title bar follows the same beat
 * on its own (`--panel-span` in globals.css).
 */

/** The beat every panel moves to; globals.css gives the title bar the same. */
export const PANEL_MOTION_MS = 340;
export const PANEL_MOTION_EASE = 'cubic-bezier(0.25, 0.8, 0.25, 1)';
/** How blurred a panel is when it is all but gone. */
export const PANEL_BLUR = 16;

/** Marks the animations this module runs, so a panel is never started twice. */
const MOTION_ID = 'panel-motion';

/** The blur and the fade, in steps rather than one ramp: sharp for a while, then going fast. */
const OUT = { offset: [0, 0.35, 0.7, 1], blur: [0, 4, 10, PANEL_BLUR], opacity: [1, 0.85, 0.5, 0] };

interface Departure {
  /** The panel itself, to tell a real departure from one that only looked like it. */
  node: HTMLElement;
  ghost: HTMLElement;
  rect: DOMRect;
  parent: Element | null;
  next: Node | null;
  /** Where it was mid-way, if it was still arriving or being dragged shut. */
  marginRight: string;
  filter: string;
  opacity: string;
  /** Documents' sidebar draws on Documents' own tokens; a copy outside Documents needs them. */
  documents: boolean;
  scrolls: [number, number, number][];
}

let settled = false;
let departures: Departure[] = [];
let arrivals: HTMLElement[] = [];
let scheduled = false;

if (typeof window !== 'undefined') {
  const settle = () => {
    settled = true;
    window.removeEventListener('pointerdown', settle, true);
    window.removeEventListener('keydown', settle, true);
  };
  window.addEventListener('pointerdown', settle, true);
  window.addEventListener('keydown', settle, true);
}

function motionAllowed() {
  return (
    settled &&
    typeof HTMLElement.prototype.animate === 'function' &&
    !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches &&
    !useUiStore.getState().iliasMode
  );
}

/**
 * The ref for a panel's root element (`SectionPanel`, Documents' sidebar).
 * Stable, so React calls it only when the element itself comes and goes.
 */
export function panelMotionRef(node: HTMLElement | null) {
  if (!node) return;
  arrive(node);
  return () => leave(node);
}

function arrive(node: HTMLElement) {
  if (!motionAllowed()) return;
  arrivals.push(node);
  schedule();
}

function leave(node: HTMLElement) {
  if (!motionAllowed() || !node.isConnected) return;
  // Came and went in one go: nothing to show for it.
  arrivals = arrivals.filter((item) => item !== node);
  const style = getComputedStyle(node);
  departures.push({
    node,
    ghost: copy(node),
    rect: node.getBoundingClientRect(),
    parent: node.parentElement,
    next: node.nextSibling,
    marginRight: style.marginRight || '0px',
    filter: style.filter && style.filter !== 'none' ? style.filter : 'blur(0px)',
    opacity: style.opacity || '1',
    documents: node.closest('.document-explorer') !== null,
    scrolls: scrollPositions(node),
  });
  schedule();
}

function schedule() {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(settle);
}

/** After React's commit, before the paint: what came, what went, and how to show it. */
function settle() {
  scheduled = false;
  // A panel still in the page has not gone: React's strict mode calls a ref's cleanup and
  // the ref again to try them, and a panel can be moved rather than removed.
  const gone = departures.filter((departure) => !departure.node.isConnected);
  const come = arrivals.filter((node) => node.isConnected);
  departures = [];
  arrivals = [];
  // A quick second step lands on a panel still moving: start from where things are now.
  for (const ghost of document.querySelectorAll('.panel-ghost')) ghost.remove();
  if (!motionAllowed()) return;
  const left = gone.at(-1);
  const arriving = come.at(-1);
  if (left && arriving) swap(left, arriving);
  else if (left) slideOut(left);
  else if (arriving) slideIn(arriving);
}

function slideIn(node: HTMLElement) {
  const width = node.getBoundingClientRect().width;
  // Already on its way in (React's strict mode tries a ref twice): once is enough.
  if (width <= 0 || node.getAnimations().some((animation) => animation.id === MOTION_ID)) return;
  void moving(node, () => [
    node.animate(
      { marginRight: [`${-width}px`, '0px'] },
      { duration: PANEL_MOTION_MS, easing: PANEL_MOTION_EASE },
    ),
    node.animate(
      {
        filter: [...OUT.blur].reverse().map((px) => `blur(${px}px)`),
        opacity: [...OUT.opacity].reverse(),
        offset: OUT.offset,
      },
      { duration: PANEL_MOTION_MS, easing: 'ease-out' },
    ),
  ]);
}

function slideOut(left: Departure) {
  const { ghost, rect } = left;
  const width = rect.width;
  const placed = place(left);
  if (!placed || width <= 0) return;
  ghost.style.width = `${width}px`;
  restoreScrolls(ghost, left.scrolls);
  void moving(ghost, () => [
    ghost.animate(
      { marginRight: [left.marginRight, `${-width}px`] },
      { duration: PANEL_MOTION_MS, easing: PANEL_MOTION_EASE },
    ),
    ghost.animate(
      {
        filter: [left.filter, ...OUT.blur.slice(1).map((px) => `blur(${px}px)`)],
        opacity: [left.opacity, ...OUT.opacity.slice(1).map(String)],
        offset: OUT.offset,
      },
      { duration: PANEL_MOTION_MS, easing: 'ease-in' },
    ),
  ]).then(() => placed.remove());
}

/** One panel for another: the old one fades out over the new, the card settles between. */
function swap(left: Departure, arriving: HTMLElement) {
  const row = arriving.closest('.panel-stage');
  const width = arriving.getBoundingClientRect().width;
  if (!row || width <= 0) return slideIn(arriving);
  const { ghost, rect } = left;
  const box = row.getBoundingClientRect();
  Object.assign(ghost.style, {
    position: 'absolute',
    left: `${rect.left - box.left}px`,
    top: `${rect.top - box.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    margin: '0',
  });
  const placed =
    left.documents && !arriving.closest('.document-explorer') ? withTokens(ghost) : ghost;
  row.prepend(placed);
  restoreScrolls(ghost, left.scrolls);
  const fade = ghost.animate(
    {
      filter: [left.filter, ...OUT.blur.slice(1).map((px) => `blur(${px}px)`)],
      opacity: [left.opacity, ...OUT.opacity.slice(1).map(String)],
      offset: OUT.offset,
    },
    { duration: PANEL_MOTION_MS * 0.8, easing: 'ease-in', fill: 'forwards' },
  );
  void fade.finished.then(
    () => placed.remove(),
    () => placed.remove(),
  );
  void moving(arriving, () => [
    arriving.animate(
      { marginRight: [`${rect.width - width}px`, '0px'] },
      { duration: PANEL_MOTION_MS, easing: PANEL_MOTION_EASE },
    ),
    arriving.animate(
      { filter: ['blur(8px)', 'blur(0px)'], opacity: [0, 1] },
      { duration: PANEL_MOTION_MS, easing: 'ease-out' },
    ),
  ]);
}

/**
 * Runs a panel's animations with the card beside it marked as moving, so it
 * keeps its rounded edge until it has joined the panel.
 */
function moving(panel: HTMLElement, start: () => Animation[]) {
  const card = cardBeside(panel);
  card?.setAttribute('data-panel-moving', '');
  const animations = start();
  for (const animation of animations) animation.id = MOTION_ID;
  const done = Promise.allSettled(animations.map((animation) => animation.finished));
  return done.then(() => card?.removeAttribute('data-panel-moving'));
}

/** The card is the panel's neighbour: after the shell's slot, or after Documents' sidebar. */
function cardBeside(panel: HTMLElement) {
  const slot = panel.closest('.section-panel-slot');
  return (slot ?? panel).nextElementSibling;
}

/**
 * Puts a departing panel's copy where the panel was: in its own place if that
 * is still there (it was hidden), else in the shell's slot (its page went).
 * Returns what to remove when it is done.
 */
function place(left: Departure): HTMLElement | null {
  const { ghost, parent, next } = left;
  if (parent?.isConnected) {
    parent.insertBefore(ghost, next && next.parentNode === parent ? next : null);
    return ghost;
  }
  const slot = document.querySelector<HTMLElement>('.section-panel-slot');
  if (!slot || slot.hidden) return null;
  const placed = left.documents ? withTokens(ghost) : ghost;
  slot.prepend(placed);
  return placed;
}

/** Documents' sidebar outside Documents: wrapped so its tokens still reach it. */
function withTokens(ghost: HTMLElement) {
  const wrap = document.createElement('div');
  wrap.className = 'document-explorer panel-ghost';
  wrap.style.display = 'contents';
  wrap.append(ghost);
  return wrap;
}

/** A still copy of a panel: nothing in it can be reached, focused or found by its id. */
function copy(node: HTMLElement) {
  const ghost = node.cloneNode(true) as HTMLElement;
  ghost.classList.add('panel-ghost');
  ghost.setAttribute('aria-hidden', 'true');
  ghost.inert = true;
  ghost.removeAttribute('id');
  for (const element of ghost.querySelectorAll('[id]')) element.removeAttribute('id');
  // What was typed lives in the field, not its attributes.
  const fields = node.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea');
  ghost
    .querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea')
    .forEach((field, index) => {
      const value = fields[index]?.value;
      if (value !== undefined) field.value = value;
    });
  return ghost;
}

/** Where each scrolled list in the panel stood, so its copy shows the same rows. */
function scrollPositions(node: HTMLElement): [number, number, number][] {
  const positions: [number, number, number][] = [];
  node.querySelectorAll('*').forEach((element, index) => {
    if (element.scrollTop || element.scrollLeft)
      positions.push([index, element.scrollTop, element.scrollLeft]);
  });
  return positions;
}

function restoreScrolls(ghost: HTMLElement, positions: [number, number, number][]) {
  if (positions.length === 0) return;
  const elements = ghost.querySelectorAll('*');
  for (const [index, top, leftScroll] of positions) {
    const element = elements[index];
    if (!element) continue;
    element.scrollTop = top;
    element.scrollLeft = leftScroll;
  }
}
