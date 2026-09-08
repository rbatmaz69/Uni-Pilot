import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';
type ButtonSize = 'sm' | 'md';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  leadingIcon?: ReactNode;
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-accent-foreground shadow-soft hover:bg-accent-hover active:translate-y-px',
  secondary:
    'bg-surface text-secondary border border-line hover:border-line-strong hover:text-primary active:translate-y-px',
  ghost: 'text-secondary hover:bg-surface-hover hover:text-primary',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-[12.5px] gap-1.5',
  md: 'h-9 px-4 text-[13px] gap-2',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  leadingIcon,
  className,
  type = 'button',
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex select-none items-center justify-center rounded-full font-medium',
        'transition-[background-color,border-color,color,box-shadow,transform] duration-150',
        'disabled:pointer-events-none disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {leadingIcon}
      {children}
    </button>
  );
}
