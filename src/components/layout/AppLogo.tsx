import { cn } from '@/lib/utils';

interface AppLogoProps {
  className?: string;
}

/** Placeholder mark — swap the inner content for the real logo asset later. */
export function AppLogo({ className }: AppLogoProps) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid h-9 w-9 flex-none place-items-center rounded-[12px_12px_12px_4px]',
        'bg-accent text-[15px] font-bold tracking-[-0.02em] text-accent-foreground',
        className,
      )}
    >
      U
    </span>
  );
}
