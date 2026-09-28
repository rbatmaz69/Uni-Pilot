import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface Option<T extends string> {
  value: T;
  label: string;
  /** A quieter second line under the label, e.g. "A4 sheets" under "Pages". */
  detail?: string;
  /** A preview drawn above the label, e.g. "Ag" in the typeface or a swatch. */
  preview?: ReactNode;
}

interface OptionGroupProps<T extends string> {
  label: string;
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  columns?: number;
  /** Tiles show a preview above the label; a segmented control is one pill of words. */
  variant?: 'tiles' | 'segmented';
}

/** A labelled radio group: one Tab stop, arrow keys choose. */
export function OptionGroup<T extends string>({
  label,
  options,
  value,
  onChange,
  columns = options.length,
  variant = 'tiles',
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
    <div className={cn('note-option-group', variant === 'segmented' && 'is-segmented')}>
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
            aria-label={option.detail ? option.label : undefined}
            aria-describedby={option.detail ? `${id}-${option.value}` : undefined}
            tabIndex={option.value === value ? 0 : -1}
            className={cn('note-option', option.value === value && 'is-on')}
            onClick={() => onChange(option.value)}
          >
            {option.preview ? (
              <span className="note-option-preview" aria-hidden>
                {option.preview}
              </span>
            ) : null}
            <span className="note-option-label">{option.label}</span>
            {option.detail ? (
              <span id={`${id}-${option.value}`} className="note-option-detail">
                {option.detail}
              </span>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}
