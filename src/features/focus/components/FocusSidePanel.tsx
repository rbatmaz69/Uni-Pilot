import { useId, useLayoutEffect, useRef, type MouseEvent, type ReactNode } from 'react';
import { X } from 'lucide-react';

export interface FocusSidePanelProps {
  open: boolean;
  id: string;
  title: string;
  subtitle?: string;
  closeLabel: string;
  onClose: () => void;
  onAfterClose?: () => void;
  children: ReactNode;
}

export function FocusSidePanel({
  open,
  id,
  title,
  subtitle,
  closeLabel,
  onClose,
  onAfterClose,
  children,
}: FocusSidePanelProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const subtitleId = useId();

  const closeFromBlankSurface = (event: MouseEvent<HTMLElement>) => {
    if (event.target === event.currentTarget) onClose();
  };

  useLayoutEffect(() => {
    if (open) {
      openerRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      closeButtonRef.current?.focus({ preventScroll: true });
      return;
    }
    if (openerRef.current?.isConnected) openerRef.current.focus({ preventScroll: true });
    openerRef.current = null;
  }, [open]);

  return (
    <div
      className="focus-side-panel-layer absolute inset-0 z-20"
      data-open={open ? 'true' : 'false'}
      aria-hidden={!open}
      inert={!open}
    >
      <div
        aria-hidden="true"
        className="focus-side-panel-backdrop absolute inset-0"
        onMouseDown={onClose}
      />
      <div
        id={id}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={subtitle ? subtitleId : undefined}
        tabIndex={open ? -1 : undefined}
        onTransitionEnd={(event) => {
          if (!open && event.target === event.currentTarget && event.propertyName === 'transform') {
            onAfterClose?.();
          }
        }}
        onMouseDown={(event) => {
          event.stopPropagation();
          closeFromBlankSurface(event);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            onClose();
          }
        }}
        className="focus-side-panel absolute inset-y-0 right-0 flex w-[min(360px,92vw)] flex-col overflow-hidden text-left"
      >
        <div
          className="focus-side-panel-header flex shrink-0 items-start justify-between gap-3 px-6 pt-6"
          onMouseDown={closeFromBlankSurface}
        >
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold">
              {title}
            </h2>
            {subtitle && (
              <p
                id={subtitleId}
                className="mt-1 text-xs leading-relaxed text-[var(--focus-side-panel-muted)]"
              >
                {subtitle}
              </p>
            )}
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            aria-label={closeLabel}
            onClick={onClose}
            className="focus-side-panel-close grid h-7 w-7 shrink-0 place-items-center rounded-full"
          >
            <X size={15} aria-hidden />
          </button>
        </div>
        <div
          className="focus-side-panel-content scroll-area min-h-0 flex-1 overflow-y-auto px-6 pb-[88px] pt-5"
          onMouseDown={closeFromBlankSurface}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
