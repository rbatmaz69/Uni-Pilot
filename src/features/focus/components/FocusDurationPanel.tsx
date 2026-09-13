import { useEffect, useRef, useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import { validMinutes } from '@/features/focus/store/focusStore';

interface FocusDurationPanelProps {
  workMinutes: number;
  breakMinutes: number;
  onSave: (workMinutes: number, breakMinutes: number) => void;
  onClose: () => void;
}

export function FocusDurationPanel({
  workMinutes,
  breakMinutes,
  onSave,
  onClose,
}: FocusDurationPanelProps) {
  const [work, setWork] = useState(String(workMinutes));
  const [rest, setRest] = useState(String(breakMinutes));
  const workRef = useRef<HTMLInputElement>(null);
  const valid = validMinutes(Number(work)) && validMinutes(Number(rest));

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

  return (
    <div className="absolute inset-0 z-20 grid place-items-center bg-black/25 p-4">
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
        className="w-full max-w-xs rounded-2xl border border-line bg-surface p-5 text-left text-primary shadow-raised"
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-base font-semibold">Pomodoro times</h2>
          <button type="button" aria-label="Close Pomodoro settings" onClick={onClose}>
            <X size={18} aria-hidden />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-2 text-xs font-medium">
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
              className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm"
            />
          </label>
          <label className="flex flex-col gap-2 text-xs font-medium">
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
              className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm"
            />
          </label>
        </div>
        {!valid && <p className="mt-2 text-xs text-danger">Enter 1–240 whole minutes.</p>}
        <button
          type="submit"
          disabled={!valid}
          className="mt-5 h-10 w-full rounded-full bg-accent text-sm font-semibold text-accent-foreground disabled:opacity-50"
        >
          Save times
        </button>
      </form>
    </div>
  );
}
