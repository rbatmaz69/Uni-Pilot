import type { MouseEvent } from 'react';
import type { MenuEntry } from '@/components/ui';
import { cn } from '@/lib/utils';

/** Thin, SF-Symbols-like glyphs: about 1.3px of rendered stroke at this size. */
export const SIDEBAR_ICON = { size: 17, strokeWidth: 1.75 } as const;

/** Opens the sidebar's shared context menu at the pointer, or under a row opened by keyboard. */
export type OpenSidebarMenu = (
  event: MouseEvent<HTMLElement>,
  label: string,
  items: readonly MenuEntry[],
) => void;

export function sidebarRowClass(active: boolean, collapsed: boolean) {
  return cn(
    'nav-link group relative flex h-[30px] w-full select-none items-center rounded-sm text-[13px] transition-colors duration-150',
    collapsed ? 'justify-center' : 'gap-2.5 px-2.5',
    active
      ? 'bg-sidebar-active font-medium text-sidebar-foreground'
      : 'text-sidebar-foreground/80 hover:bg-sidebar-hover hover:text-sidebar-foreground',
  );
}

export function sidebarIconClass(active: boolean) {
  return cn(
    'nav-icon flex-none transition-colors duration-150',
    active ? 'text-sidebar-foreground' : 'text-sidebar-muted group-hover:text-sidebar-foreground',
  );
}
