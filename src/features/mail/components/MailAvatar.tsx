import { initials, toneFor } from '@/features/mail/lib/mail';
import { cn } from '@/lib/utils';

const SIZES = {
  sm: 'h-7 w-7 text-[10px]',
  md: 'h-9 w-9 text-[11.5px]',
  lg: 'h-11 w-11 text-[13px]',
} as const;

/** A sender's initials, always in the same tone for the same sender. */
export function MailAvatar({ name, size = 'md' }: { name: string; size?: keyof typeof SIZES }) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid shrink-0 place-items-center rounded-full font-semibold tracking-wide',
        SIZES[size],
        toneFor(name),
      )}
    >
      {initials(name)}
    </span>
  );
}
