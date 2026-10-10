import type { MouseEvent } from 'react';
import { useTabStore } from '@/store/tabStore';

/**
 * The tab actions. Each leaves the address to show with the store, and the
 * shell's `TabSync` takes the window there, so they need no router of their
 * own and work from anywhere: the title bar, the rail, a page.
 */
export const tabActions = {
  /** ⌘-click, middle click, "+": the place opens in a tab of its own. */
  openInNewTab: (location: string) => {
    useTabStore.getState().open({ location });
  },
  select: (id: string) => {
    useTabStore.getState().select(id);
  },
  close: (id: string) => {
    useTabStore.getState().close(id);
  },
  cycle: (step: -1 | 1) => {
    useTabStore.getState().cycle(step);
  },
  back: () => {
    useTabStore.getState().step(-1);
  },
  forward: () => {
    useTabStore.getState().step(1);
  },
};

/**
 * For a link: ⌘-click (Ctrl-click elsewhere) and the middle button open it in
 * a new tab, as in a browser. A plain click is the link's own.
 */
export function newTabHandlers(location: string) {
  return {
    onClick: (event: MouseEvent<HTMLElement>) => {
      if (!event.metaKey && !event.ctrlKey) return;
      event.preventDefault();
      tabActions.openInNewTab(location);
    },
    onAuxClick: (event: MouseEvent<HTMLElement>) => {
      if (event.button !== 1) return;
      event.preventDefault();
      tabActions.openInNewTab(location);
    },
  };
}
