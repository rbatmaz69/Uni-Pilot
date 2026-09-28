import { School } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Placeholder mark for anything the ILIAS course sync manages (a folder, a
 * downloaded file, an ILIAS sync banner). It draws a generic pill with the
 * same `School` icon navigation uses for ILIAS — the single place this mark
 * is drawn, so an official ILIAS logo can later be swapped in by editing
 * only this file. Check ILIAS e.V.'s logo usage terms before using their
 * mark.
 */
interface IliasBadgeProps {
  size?: 'sm' | 'md';
  showLabel?: boolean;
  className?: string;
  title?: string;
}

const SIZES = {
  sm: { pill: 'gap-1 px-1.5 py-0.5 text-[10px]', icon: 11 },
  md: { pill: 'gap-1.5 px-2 py-1 text-xs', icon: 13 },
};

export function IliasBadge({ size = 'md', showLabel = true, className, title }: IliasBadgeProps) {
  const label = title ?? 'Synced from ILIAS';
  const { pill, icon } = SIZES[size];
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
      <School aria-hidden size={icon} />
      {showLabel && <span>ILIAS</span>}
    </span>
  );
}
