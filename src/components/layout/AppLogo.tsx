import { cn } from '@/lib/utils';

export function AppLogo({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('grid h-9 w-9 flex-none place-items-center text-accent', className)}
    >
      <svg viewBox="0 0 32 32" className="h-8 w-8" fill="currentColor">
        <path d="M16 2a7 7 0 0 1 6.4 4.2 7 7 0 0 1 3.4 11.9A7 7 0 0 1 16 28a7 7 0 0 1-9.8-9.9A7 7 0 0 1 9.6 6.2 7 7 0 0 1 16 2Z" />
        <path d="m16 10 5.5 11-5.5-2.7-5.5 2.7L16 10Z" fill="var(--surface)" />
      </svg>
    </span>
  );
}
