import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

type TooltipSide = 'right' | 'bottom';

interface TooltipProps {
  label: string;
  side?: TooltipSide;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}

const GAP = 10;

export function Tooltip({
  label,
  side = 'right',
  disabled = false,
  className,
  children,
}: TooltipProps) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const tooltipId = useId();

  const show = useCallback(() => {
    if (disabled) return;
    const rect = anchorRef.current?.getBoundingClientRect();
    if (!rect) return;

    setPosition(
      side === 'right'
        ? { top: rect.top + rect.height / 2, left: rect.right + GAP }
        : { top: rect.bottom + GAP, left: rect.left + rect.width / 2 },
    );
  }, [disabled, side]);

  const hide = useCallback(() => setPosition(null), []);

  const open = position !== null;

  useEffect(() => {
    if (!open) return;
    if (disabled) {
      hide();
      return;
    }

    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    window.addEventListener('blur', hide);
    return () => {
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
      window.removeEventListener('blur', hide);
    };
  }, [open, disabled, hide]);

  return (
    <>
      <span
        ref={anchorRef}
        className={cn('inline-flex', className)}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocusCapture={show}
        onBlurCapture={hide}
        onClick={hide}
        aria-describedby={open ? tooltipId : undefined}
      >
        {children}
      </span>

      {open &&
        createPortal(
          <span
            id={tooltipId}
            role="tooltip"
            className={cn(
              'animate-tooltip-enter pointer-events-none fixed z-50 whitespace-nowrap',
              'rounded-md bg-sidebar px-2.5 py-1.5 text-[12px] font-medium text-sidebar-foreground shadow-raised',
              side === 'right' ? '-translate-y-1/2' : '-translate-x-1/2',
            )}
            style={{ top: position.top, left: position.left }}
          >
            {label}
          </span>,
          document.body,
        )}
    </>
  );
}
