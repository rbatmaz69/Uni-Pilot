import { useCallback, useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { IconButton } from './IconButton';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  /** Pinned under the scrollable body — put the confirming action last. */
  footer?: ReactNode;
  className?: string;
  children: ReactNode;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Dialog with the behaviour a native `<dialog>` would give us for free.
 *
 * We cannot use `<dialog showModal()>` here: it is missing from the jsdom
 * build the test suite runs on, so every dialog would be untestable. The
 * pieces reimplemented below are exactly the ones that make a dialog usable
 * without a mouse — focus moves in on open, Tab cannot escape, Escape closes,
 * and focus returns to whatever opened it.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  footer,
  className,
  children,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  const focusables = useCallback(
    () => Array.from(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []),
    [],
  );

  /**
   * Opening a form on its close button is a small insult: the first thing the
   * keyboard offers should be the first thing to fill in. Falls back to the
   * close button for dialogs that only present information.
   */
  const initialFocus = useCallback(() => {
    const body = panelRef.current?.querySelector<HTMLElement>('[data-modal-body]');
    const [firstInBody] = Array.from(body?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    return firstInBody ?? focusables()[0] ?? panelRef.current;
  }, [focusables]);

  useEffect(() => {
    if (!open) return;

    openerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    initialFocus()?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
      openerRef.current?.focus();
    };
  }, [open, initialFocus]);

  if (!open) return null;

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;

    const items = focusables();
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <div
      className="animate-overlay-enter fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className={cn(
          'animate-page-enter flex max-h-[min(88vh,720px)] w-full max-w-[460px] flex-col',
          'rounded-2xl border border-line-soft bg-surface shadow-raised outline-none',
          className,
        )}
      >
        <div className="flex items-start gap-4 px-6 pb-4 pt-6">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-[17px] font-semibold tracking-tight text-primary">
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="mt-1 text-[12.5px] leading-relaxed text-secondary">
                {description}
              </p>
            ) : null}
          </div>
          <IconButton label="Close dialog" size="sm" onClick={onClose} className="-mr-1 flex-none">
            <X size={17} strokeWidth={1.8} aria-hidden />
          </IconButton>
        </div>

        <div data-modal-body className="scroll-area min-h-0 flex-1 overflow-y-auto px-6 pb-6">
          {children}
        </div>

        {footer ? (
          <div className="flex items-center justify-end gap-2 border-t border-line-soft px-6 py-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
