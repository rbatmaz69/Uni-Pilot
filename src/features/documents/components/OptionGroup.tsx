import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface Option<T extends string> {
  value: T;
  label: string;
  /** A preview drawn above the label, e.g. "Ag" in the typeface or a swatch. */
  preview?: ReactNode;
}

interface OptionGroupProps<T extends string> {
  label: string;
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  columns?: number;
}

/** A labelled radio group of tiles: one Tab stop, arrow keys choose. */
export function OptionGroup<T extends string>({
  label,
  options,
  value,
  onChange,
  columns = options.length,
}: OptionGroupProps<T>) {
  const id = useId();
  const group = useRef<HTMLDivElement>(null);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? -1
          : 0;
    if (!step) return;
    event.preventDefault();
    const index = options.findIndex((option) => option.value === value);
    const next = options[(index + step + options.length) % options.length];
    if (!next) return;
    onChange(next.value);
    group.current?.querySelector<HTMLElement>(`[data-value="${next.value}"]`)?.focus();
  }

  return (
    <div className="note-option-group">
      <span id={`${id}-label`} className="note-panel-label">
        {label}
      </span>
      <div
        ref={group}
        role="radiogroup"
        aria-labelledby={`${id}-label`}
        className="note-options"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        onKeyDown={onKeyDown}
      >
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            data-value={option.value}
            aria-checked={option.value === value}
            tabIndex={option.value === value ? 0 : -1}
            className={cn('note-option', option.value === value && 'is-on')}
            onClick={() => onChange(option.value)}
          >
            {option.preview ? (
              <span className="note-option-preview" aria-hidden>
                {option.preview}
              </span>
            ) : null}
            <span>{option.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
