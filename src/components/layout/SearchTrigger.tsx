import { forwardRef } from 'react';
import { Search } from 'lucide-react';
import { usePlatformModifier } from '@/hooks/usePlatform';

interface SearchTriggerProps {
  onClick?: () => void;
}

/**
 * Visual entry point for the future command palette. It shows as much as the
 * width it is given allows: a bare icon in a narrow slot, the label and the
 * shortcut from 160px on. The slot names itself `@container/search`.
 */
export const SearchTrigger = forwardRef<HTMLButtonElement, SearchTriggerProps>(
  function SearchTrigger({ onClick }, ref) {
    const { label } = usePlatformModifier();

    return (
      <button
        ref={ref}
        type="button"
        onClick={onClick}
        aria-label="Search anything"
        className="group flex h-9 w-full items-center gap-2.5 rounded-full border border-line-soft bg-surface-secondary px-2.5 @[160px]/search:px-3.5 text-muted transition-colors duration-150 hover:border-line-strong hover:bg-surface hover:text-secondary"
      >
        <Search size={16} strokeWidth={1.9} className="flex-none" aria-hidden />
        <span className="hidden @[160px]/search:block flex-1 truncate text-left text-[13px]">
          Search anything…
        </span>
        <kbd className="hidden @[160px]/search:block flex-none rounded-xs border border-line bg-surface px-1.5 py-0.5 font-mono text-[10.5px] font-medium text-muted">
          {label} K
        </kbd>
      </button>
    );
  },
);
