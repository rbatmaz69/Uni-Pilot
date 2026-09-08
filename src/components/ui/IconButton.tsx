import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

type IconButtonSurface = 'light' | 'sidebar';
type IconButtonSize = 'sm' | 'md';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required — icon-only controls need an accessible name. */
  label: string;
  surface?: IconButtonSurface;
  size?: IconButtonSize;
  children: ReactNode;
}

const SURFACES: Record<IconButtonSurface, string> = {
  light: 'text-secondary hover:bg-surface-hover hover:text-primary',
  sidebar: 'text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-foreground',
};

const SIZES: Record<IconButtonSize, string> = {
  sm: 'h-7 w-7 rounded-sm',
  md: 'h-9 w-9 rounded-md',
};

export function IconButton({
  label,
  surface = 'light',
  size = 'md',
  className,
  type = 'button',
  children,
  ...props
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'relative inline-grid place-items-center transition-colors duration-150',
        'disabled:pointer-events-none disabled:opacity-50',
        SURFACES[surface],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
