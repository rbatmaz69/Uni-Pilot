import { cn } from '@/lib/utils';

interface NewBadgeProps {
  /** New files: on a folder how many are below it, on a file 1. */
  count?: number | undefined;
  /** A file shows a dot: the count of one file says nothing. */
  file?: boolean;
  className?: string;
}

/**
 * The only number the document sidebar shows: how many files arrived from
 * ILIAS and were not opened yet. Nothing at all when there are none.
 */
export function NewBadge({ count = 0, file = false, className }: NewBadgeProps) {
  if (count <= 0) return null;
  if (file)
    return (
      <span
        role="img"
        aria-label="New"
        title="New from ILIAS"
        className={cn('inline-block size-2 shrink-0 rounded-full bg-accent', className)}
      />
    );
  const label = `${count} new ${count === 1 ? 'file' : 'files'}`;
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={cn(
        'inline-grid h-[18px] min-w-[18px] shrink-0 place-items-center rounded-full bg-accent px-1',
        'text-[10px] font-semibold leading-none tabular-nums text-accent-foreground',
        className,
      )}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}
