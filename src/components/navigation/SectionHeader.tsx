import type { MouseEvent } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SectionHeaderProps {
  /** Names the section's group via `aria-labelledby`. */
  id: string;
  label: string;
  /** Icon-only sidebar: the heading stays for screen readers and cannot fold. */
  collapsed: boolean;
  folded: boolean;
  onToggle: () => void;
  onContextMenu?: (event: MouseEvent<HTMLElement>) => void;
}

/** Finder-style heading: quiet caps, and a chevron that shows on hover to fold the section. */
export function SectionHeader({
  id,
  label,
  collapsed,
  folded,
  onToggle,
  onContextMenu,
}: SectionHeaderProps) {
  if (collapsed)
    return (
      <div id={id} className="sr-only">
        {label}
      </div>
    );
  return (
    <button
      type="button"
      aria-expanded={!folded}
      onClick={onToggle}
      onContextMenu={onContextMenu}
      className="sidebar-section-label group/section flex h-6 w-full items-center gap-1 rounded-xs px-2.5 text-left text-[10.5px] font-semibold uppercase tracking-[0.08em] text-sidebar-muted/90 transition-colors hover:text-sidebar-foreground"
    >
      <span id={id} className="min-w-0 flex-1 truncate">
        {label}
      </span>
      <ChevronDown
        size={13}
        strokeWidth={2}
        aria-hidden
        className={cn(
          'flex-none opacity-0 transition-[opacity,transform] duration-150 group-hover/section:opacity-100 group-focus-visible/section:opacity-100',
          folded && '-rotate-90 opacity-100',
        )}
      />
    </button>
  );
}
