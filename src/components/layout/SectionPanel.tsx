import {
  useLayoutEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { selectPanelShown, useUiStore } from '@/store/uiStore';
import { PANEL_BLUR, PANEL_MOTION_EASE, panelMotionRef } from './panelMotion';
import { useSectionPanelHost } from './sectionPanelHost';

/** A panel the student can make wider or narrower, by dragging its edge. */
export interface PanelResize {
  /** Where the chosen width is kept (`uiStore.panelWidths`), e.g. "mail". */
  id: string;
  defaultWidth: number;
  min: number;
  max: number;
}

interface SectionPanelProps extends Omit<HTMLAttributes<HTMLElement>, 'aria-label'> {
  /** Names the panel's landmark for screen readers, e.g. "Mail". Required: a landmark needs a name. */
  label: string;
  /** Lets the student drag the panel's right edge; without it the panel is `--panel-width` wide. */
  resize?: PanelResize;
  /**
   * Slides in and out as it comes and goes (`panelMotion`). Off for ILIAS, whose native
   * view is laid out from where the panel ends.
   */
  motion?: boolean;
  children: ReactNode;
}

const clamp = (width: number, { min, max }: PanelResize) =>
  Math.min(max, Math.max(min, Math.round(width)));

/**
 * A page's own sidebar, shown between the app's icon rail and the page's card
 * (the Synara layout: rail, then a panel for sections that need one, then the
 * content). A page renders it anywhere in its tree and does not need to know
 * the shell: the panel portals into the slot `AppLayout` keeps free for it.
 *
 *     <SectionPanel label="Mail">
 *       <PanelHeader title="Mail" actions={<PanelAction label="Compose">…</PanelAction>} />
 *       <PanelBody>
 *         <PanelSection>
 *           <PanelItem icon={Inbox} label="Inbox" count={3} active to="/inbox" />
 *           <PanelItem icon={Send} label="Sent" onClick={openSent} />
 *         </PanelSection>
 *         <PanelSection heading="Labels">…</PanelSection>
 *       </PanelBody>
 *       <PanelFooter>…</PanelFooter>
 *     </SectionPanel>
 *
 * Pages without a `SectionPanel` leave the slot empty: it takes no room and the
 * card spans the full width. While a panel is mounted the card joins it (no
 * gutter or rounded corners on their shared edge) and the header offers a
 * "Hide sidebar" / "Show sidebar" button. That is one app-wide preference,
 * `uiStore.panelOpen`: hidden, the panel unmounts its content (keep state that
 * must survive in a store) and the card takes the whole width. ILIAS mode is the
 * exception: its panel carries the only controls ILIAS has, and there is no
 * header to bring it back from, so it stays open (`selectPanelShown`).
 *
 * A page that keeps what its panel offers in its card while the panel is hidden
 * (Events, Mail, Settings) asks `useSectionPanelShown()` whether to.
 *
 * With `resize` the panel has an edge to drag (and a separator to move with the
 * arrow keys; a double click goes back to the default). Its width is an app
 * setting (`uiStore.panelWidths`), and the shell sets it as `--panel-width`, so
 * the title bar's tabs keep starting above the card. Dragged narrower than its
 * narrowest, it blurs more the further it goes; let go far enough and it
 * closes, as the "Hide sidebar" button would, else it springs back.
 *
 * It slides in from under the card as it arrives and out as it goes
 * (`panelMotion`), unless `motion` is off.
 *
 * Rendered outside the shell (a feature on its own in a test) there is no slot
 * and the panel renders in place, always open.
 *
 * Build its insides from `PanelHeader`, `PanelBody`, `PanelSection`,
 * `PanelItem` and `PanelFooter`, so every section's sidebar looks like
 * Documents'. The panel is a flex column as tall as the card; `PanelBody` is
 * the part that scrolls.
 */
export function SectionPanel({
  label,
  resize,
  motion = true,
  className,
  style,
  children,
  ...props
}: SectionPanelProps) {
  const host = useSectionPanelHost();
  const open = useUiStore(selectPanelShown);
  const stored = useUiStore((state) => (resize ? state.panelWidths[resize.id] : undefined));
  const width = resize ? clamp(stored ?? resize.defaultWidth, resize) : null;
  // While its edge is dragged past the narrowest, the panel is as wide as the pointer says.
  const [live, setLive] = useState<number | null>(null);
  const shown = live ?? width;
  const claim = host?.claim;
  const setWidth = host?.setWidth;

  // Layout effect: the card must join the panel in the frame it appears in, not one later.
  useLayoutEffect(() => claim?.(), [claim]);
  // The same for its width, which the title bar lines its tabs up with.
  useLayoutEffect(() => {
    if (!setWidth || shown === null || !open) return;
    setWidth(shown);
    return () => setWidth(null);
  }, [setWidth, shown, open]);

  const panel = (
    <aside
      {...props}
      ref={motion ? panelMotionRef : undefined}
      aria-label={label}
      className={cn('section-panel', className)}
      // In the shell the width arrives as `--panel-width`; on its own it is set here.
      style={!host && shown !== null ? { ...style, width: shown } : style}
    >
      {children}
      {resize && width !== null ? (
        <PanelResizer
          resize={resize}
          width={width}
          // Narrower than the narrowest, the shell follows the edge without storing it.
          onLive={setLive}
        />
      ) : null}
    </aside>
  );
  if (!host) return panel;
  if (!open || !host.slot) return null;
  return createPortal(panel, host.slot);
}

/** Let go with the panel this much narrower than its narrowest, and it closes. */
const CLOSE_AT = 0.55;

/**
 * The panel's right edge, to drag: a separator, so it is reachable and movable
 * from the keyboard too (arrows, with Shift in bigger steps; Home and End for
 * the narrowest and the widest). A double click goes back to the default.
 * Dragged past the narrowest the panel follows the pointer, blurring and
 * fading the further it goes, and closes when let go far enough; the setting
 * keeps its narrowest width for next time.
 */
function PanelResizer({
  resize,
  width,
  onLive,
}: {
  resize: PanelResize;
  width: number;
  onLive: (width: number | null) => void;
}) {
  const setPanelWidth = useUiStore((state) => state.setPanelWidth);
  const drag = useRef<{ x: number; width: number; from: number; live: number | null } | null>(null);
  const set = (next: number) => setPanelWidth(resize.id, clamp(next, resize));

  /** Below the narrowest: how far, from 0 at the narrowest to 1 at nothing. */
  const closing = (live: number) => Math.min(1, Math.max(0, (resize.min - live) / resize.min));

  const follow = (panel: HTMLElement | null, live: number | null) => {
    if (!drag.current) return;
    drag.current.live = live;
    onLive(live);
    if (!panel) return;
    if (live === null) {
      panel.style.removeProperty('filter');
      panel.style.removeProperty('opacity');
      return;
    }
    const gone = closing(live);
    panel.style.filter = `blur(${(gone * PANEL_BLUR).toFixed(1)}px)`;
    panel.style.opacity = String(1 - gone * 0.75);
  };

  const end = (panel: HTMLElement | null) => {
    const current = drag.current;
    if (!current) return;
    delete document.documentElement.dataset.resizing;
    const live = current.live;
    if (live !== null && closing(live) >= CLOSE_AT) {
      drag.current = null;
      // Opened again, it comes back as wide as it was before this drag.
      set(current.from);
      onLive(null);
      // Closed as the button would; it slides on out from where it was let go.
      useUiStore.getState().togglePanel();
      return;
    }
    follow(panel, null);
    drag.current = null;
    if (live === null || !panel || typeof panel.animate !== 'function') return;
    // Not far enough: back to the narrowest, coming into focus again.
    const gone = closing(live);
    panel.animate(
      {
        width: [`${live}px`, `${resize.min}px`],
        filter: [`blur(${(gone * PANEL_BLUR).toFixed(1)}px)`, 'blur(0px)'],
        opacity: [1 - gone * 0.75, 1],
      },
      { duration: 220, easing: PANEL_MOTION_EASE },
    );
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
      aria-valuenow={width}
      aria-valuemin={resize.min}
      aria-valuemax={resize.max}
      tabIndex={0}
      className="panel-resizer"
      onPointerDown={(event: PointerEvent<HTMLDivElement>) => {
        if (event.button !== 0) return;
        event.preventDefault();
        // From the width on screen, which a narrow window may have made smaller than the setting.
        const panel = event.currentTarget.parentElement;
        drag.current = {
          x: event.clientX,
          width: panel?.getBoundingClientRect().width || width,
          from: width,
          live: null,
        };
        document.documentElement.dataset.resizing = 'column';
        // Keeps the drag when the pointer runs ahead of the edge; a drag goes on without it.
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // Not every pointer can be captured (one a test made up, say).
        }
      }}
      onPointerMove={(event) => {
        const current = drag.current;
        if (!current) return;
        const next = Math.round(current.width + event.clientX - current.x);
        const panel = event.currentTarget.parentElement;
        if (next >= resize.min) {
          if (current.live !== null) follow(panel, null);
          set(next);
        } else {
          if (width !== resize.min) set(resize.min);
          follow(panel, Math.max(0, next));
        }
      }}
      onPointerUp={(event) => end(event.currentTarget.parentElement)}
      onPointerCancel={(event) => end(event.currentTarget.parentElement)}
      onLostPointerCapture={(event) => end(event.currentTarget.parentElement)}
      onDoubleClick={() => setPanelWidth(resize.id, null)}
      onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
        const step = event.shiftKey ? 64 : 16;
        const next =
          event.key === 'ArrowLeft'
            ? width - step
            : event.key === 'ArrowRight'
              ? width + step
              : event.key === 'Home'
                ? resize.min
                : event.key === 'End'
                  ? resize.max
                  : null;
        if (next === null) return;
        event.preventDefault();
        set(next);
      }}
    />
  );
}
