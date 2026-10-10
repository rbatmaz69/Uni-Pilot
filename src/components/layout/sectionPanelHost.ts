import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { selectPanelShown, useUiStore } from '@/store/uiStore';

/** What the shell offers to a page that brings a sidebar of its own. */
export interface SectionPanelHost {
  /** The place between the icon rail and the card; null until the shell has mounted it. */
  slot: HTMLElement | null;
  /** A panel has mounted. Returns the call that releases it again. */
  claim: () => () => void;
  /** At least one panel is mounted, shown or not. */
  present: boolean;
  /**
   * The width a resizable panel on screen asks for, in pixels; `null` for the
   * default. The shell sets it as `--panel-width` on the column that holds the
   * title bar and the panel, so the tabs move with the panel's edge.
   */
  width: number | null;
  setWidth: (width: number | null) => void;
}

export const SectionPanelHostContext = createContext<SectionPanelHost | null>(null);

/** The shell's panel slot, or null when rendered outside the shell (a feature on its own in a test). */
export function useSectionPanelHost() {
  return useContext(SectionPanelHostContext);
}

/**
 * Whether the page being shown has a `SectionPanel`, whether or not the student
 * has hidden it. The header offers the show/hide control only then.
 */
export function useHasSectionPanel() {
  return useContext(SectionPanelHostContext)?.present ?? false;
}

/**
 * Whether the page's section panel is on screen right now. A page keeps what
 * its panel offers (filters, "Create", the account) in its card while the panel
 * is hidden, and drops it from the card while the panel shows it, so nothing
 * is on screen twice. Outside the shell (a feature on its own in a test) the
 * panel renders in place and is always shown; inside it follows the student's
 * preference, or ILIAS mode (`selectPanelShown`), exactly like `SectionPanel`.
 */
export function useSectionPanelShown() {
  const insideShell = useSectionPanelHost() !== null;
  const shown = useUiStore(selectPanelShown);
  return !insideShell || shown;
}

/**
 * For the shell: the slot's callback ref, and the host to provide to everything
 * inside it. `AppLayout` is the only caller.
 */
export function useSectionPanelSlot() {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [claims, setClaims] = useState(0);
  const [width, setWidth] = useState<number | null>(null);
  const claim = useCallback(() => {
    setClaims((count) => count + 1);
    return () => setClaims((count) => count - 1);
  }, []);
  const host = useMemo<SectionPanelHost>(
    () => ({ slot, claim, present: claims > 0, width, setWidth }),
    [slot, claim, claims, width],
  );
  return { host, slotRef: setSlot };
}
