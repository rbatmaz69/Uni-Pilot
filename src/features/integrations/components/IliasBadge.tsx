import { cn } from '@/lib/utils';

/** The official ILIAS mark for synced files, folders and course labels. */
interface IliasBadgeProps {
  size?: 'sm' | 'md';
  showLabel?: boolean;
  className?: string;
  title?: string;
}

const SIZES = {
  sm: { pill: 'gap-1 px-1.5 py-0.5 text-[10px]', image: 'size-4 rounded-[3px]' },
  md: { pill: 'gap-1.5 px-2 py-1 text-xs', image: 'size-[18px] rounded-[4px]' },
};

export function IliasBadge({ size = 'md', showLabel = true, className, title }: IliasBadgeProps) {
  const label = title ?? 'Synced from ILIAS';
  const { pill, image } = SIZES[size];
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex shrink-0 items-center rounded-full bg-blue-soft font-medium text-blue',
        pill,
        className,
      )}
    >
      <img
        src="/ilias-logo.jpg"
        alt=""
        aria-hidden="true"
        className={cn('shrink-0 object-cover', image)}
      />
      {showLabel && <span>ILIAS</span>}
    </span>
  );
}
