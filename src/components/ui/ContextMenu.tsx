import { useEffect, useEffectEvent, useLayoutEffect, useRef, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface MenuAction {
  label: string;
  icon?: LucideIcon;
  /** Shown right-aligned, e.g. `⌥↑`. The key handling lives with the opener. */
  shortcut?: string;
  disabled?: boolean;
  onSelect: () => void;
}
export type MenuEntry = MenuAction | 'separator';

interface ContextMenuProps {
  /** Viewport point the menu opens at, usually the pointer. */
  at: { x: number; y: number };
  label: string;
  items: readonly MenuEntry[];
  onClose: () => void;
}

const MARGIN = 8;
const ITEM = '[role="menuitem"]:not(:disabled)';

/**
 * A menu that behaves like a native one: it opens at the pointer, hands focus
 * to its first item, walks with the arrow keys, and closes on Escape, Tab or a
 * click anywhere else. Focus goes back to whatever opened it.
 */
export function ContextMenu({ at, label, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Keep the whole menu on screen, measured once it has a size.
  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const { width, height } = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(MARGIN, Math.min(at.x, window.innerWidth - width - MARGIN))}px`;
    menu.style.top = `${Math.max(MARGIN, Math.min(at.y, window.innerHeight - height - MARGIN))}px`;
  }, [at]);

  const close = useEffectEvent(onClose);
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    menuRef.current?.querySelector<HTMLElement>(ITEM)?.focus();
    const dismiss = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) close();
    };
    const leave = () => close();
    document.addEventListener('pointerdown', dismiss);
    window.addEventListener('blur', leave);
    window.addEventListener('resize', leave);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      window.removeEventListener('blur', leave);
      window.removeEventListener('resize', leave);
      // Only when focus went down with the menu; a click elsewhere keeps its target.
      if (!document.activeElement || document.activeElement === document.body) opener?.focus();
    };
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const options = Array.from(menuRef.current?.querySelectorAll<HTMLElement>(ITEM) ?? []);
    const index = options.indexOf(document.activeElement as HTMLElement);
    const step: Record<string, number> = { ArrowDown: 1, ArrowUp: -1 };
    if (event.key in step) {
      event.preventDefault();
      const next = (index + (step[event.key] ?? 0) + options.length) % options.length;
      options[next]?.focus();
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      options.at(event.key === 'Home' ? 0 : -1)?.focus();
    } else if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }
  }

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label={label}
      tabIndex={-1}
      style={{ left: at.x, top: at.y }}
      onKeyDown={handleKeyDown}
      onContextMenu={(event) => event.preventDefault()}
      className="animate-tooltip-enter fixed z-[60] min-w-[200px] rounded-lg border border-line-soft bg-surface/95 p-1 shadow-float outline-none backdrop-blur-xl"
    >
      {items.map((item, index) =>
        item === 'separator' ? (
          <div key={`separator-${index}`} role="separator" className="mx-2 my-1 h-px bg-line" />
        ) : (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            tabIndex={-1}
            disabled={item.disabled}
            onPointerEnter={(event) => event.currentTarget.focus()}
            onClick={() => {
              onClose();
              item.onSelect();
            }}
            className={cn(
              'group flex h-7 w-full items-center gap-2 rounded-xs px-2 text-left text-[13px] text-primary outline-none',
              'focus:bg-accent focus:text-accent-foreground disabled:opacity-40',
            )}
          >
            {item.icon ? (
              <item.icon
                size={15}
                strokeWidth={1.75}
                aria-hidden
                className="flex-none text-secondary group-focus:text-accent-foreground"
              />
            ) : null}
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {item.shortcut ? (
              <span
                aria-hidden
                className="pl-4 text-[12px] text-muted group-focus:text-accent-foreground/80"
              >
                {item.shortcut}
              </span>
            ) : null}
          </button>
        ),
      )}
    </div>,
    document.body,
  );
}
