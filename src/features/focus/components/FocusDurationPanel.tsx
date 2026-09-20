import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { validMinutes } from '@/features/focus/store/focusStore';

interface FocusDurationPanelProps {
  anchorRef: RefObject<HTMLElement | null>;
  workMinutes: number;
  breakMinutes: number;
  appliesToNextSegment?: boolean;
  onSave: (workMinutes: number, breakMinutes: number) => void;
  onClose: () => void;
}

export function FocusDurationPanel({
  anchorRef,
  workMinutes,
  breakMinutes,
  appliesToNextSegment = false,
  onSave,
  onClose,
}: FocusDurationPanelProps) {
  const [work, setWork] = useState(String(workMinutes));
  const [rest, setRest] = useState(String(breakMinutes));
  const workRef = useRef<HTMLInputElement>(null);
  const [anchorBounds, setAnchorBounds] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  const valid = validMinutes(Number(work)) && validMinutes(Number(rest));

  useLayoutEffect(() => {
    const updateBounds = () => {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0 || rect.height <= 0) {
        setAnchorBounds(null);
        return;
      }
      setAnchorBounds({
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      });
    };

    updateBounds();
    window.addEventListener('resize', updateBounds);
    return () => window.removeEventListener('resize', updateBounds);
  }, [anchorRef]);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    workRef.current?.focus();
    return () => {
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (valid) onSave(Number(work), Number(rest));
  };

  const positionerStyle: CSSProperties = anchorBounds
    ? {
        left: anchorBounds.left,
        top: anchorBounds.top,
        width: anchorBounds.width,
        height: anchorBounds.height,
      }
    : { inset: 0 };

  return createPortal(
    <div className="focus-duration-overlay animate-overlay-enter fixed inset-0 z-50">
      <div
        className="focus-duration-positioner fixed grid place-items-center p-4"
        style={positionerStyle}
      >
        <form
          role="dialog"
          aria-label="Pomodoro settings"
          aria-modal="true"
          onSubmit={save}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation();
              onClose();
            }
          }}
          className="focus-duration-dialog animate-page-enter w-full max-w-sm rounded-2xl p-6 text-left"
        >
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-[17px] font-semibold tracking-[-0.01em]">Pomodoro times</h2>
              {appliesToNextSegment && (
                <p className="focus-duration-note mt-1 text-[11px] leading-relaxed">
                  Changes apply to the next timer.
                </p>
              )}
            </div>
            <button
              type="button"
              aria-label="Close Pomodoro settings"
              onClick={onClose}
              className="focus-duration-close grid h-7 w-7 place-items-center rounded-full"
            >
              <X size={16} aria-hidden />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="focus-duration-label flex flex-col gap-2 text-xs font-medium">
              Pomodoro · min
              <input
                ref={workRef}
                type="number"
                min="1"
                max="240"
                step="1"
                value={work}
                onChange={(event) => setWork(event.target.value)}
                aria-label="Pomodoro minutes"
                aria-invalid={!validMinutes(Number(work))}
                className="focus-duration-input h-11 w-full rounded-lg px-3.5 text-sm font-medium tabular-nums"
              />
            </label>
            <label className="focus-duration-label flex flex-col gap-2 text-xs font-medium">
              Break · min
              <input
                type="number"
                min="1"
                max="240"
                step="1"
                value={rest}
                onChange={(event) => setRest(event.target.value)}
                aria-label="Break minutes"
                aria-invalid={!validMinutes(Number(rest))}
                className="focus-duration-input h-11 w-full rounded-lg px-3.5 text-sm font-medium tabular-nums"
              />
            </label>
          </div>
          {!valid && <p className="mt-2 text-xs text-danger">Enter 1–240 whole minutes.</p>}
          <button
            type="submit"
            disabled={!valid}
            className="focus-duration-save mt-6 h-11 w-full rounded-full text-sm font-semibold disabled:opacity-50"
          >
            Save times
          </button>
        </form>
      </div>
    </div>,
    document.body,
  );
}
