import { useState, type KeyboardEvent } from 'react';

export function TableSizePicker({ onInsert }: { onInsert: (rows: number, cols: number) => void }) {
  const [size, setSize] = useState({ rows: 3, cols: 3 });
  function move(event: KeyboardEvent<HTMLButtonElement>, row: number, col: number) {
    const next = {
      ArrowRight: [row, col + 1],
      ArrowLeft: [row, col - 1],
      ArrowDown: [row + 1, col],
      ArrowUp: [row - 1, col],
      Home: [row, 1],
      End: [row, 8],
    }[event.key];
    if (!next) return;
    event.preventDefault();
    event.stopPropagation();
    const rows = Math.max(1, Math.min(8, next[0]!));
    const cols = Math.max(1, Math.min(8, next[1]!));
    event.currentTarget
      .closest('[role="grid"]')
      ?.querySelector<HTMLButtonElement>(`[data-size="${rows}-${cols}"]`)
      ?.focus();
    setSize({ rows, cols });
  }
  return (
    <div className="note-table-picker">
      <div role="grid" aria-label="Table size">
        {Array.from({ length: 8 }, (_, y) => (
          <div role="row" key={y}>
            {Array.from({ length: 8 }, (_, x) => (
              <button
                key={x}
                type="button"
                role="gridcell"
                aria-label={`${y + 1} rows, ${x + 1} columns`}
                aria-selected={y < size.rows && x < size.cols}
                data-size={`${y + 1}-${x + 1}`}
                tabIndex={y + 1 === size.rows && x + 1 === size.cols ? 0 : -1}
                onMouseEnter={() => setSize({ rows: y + 1, cols: x + 1 })}
                onFocus={() => setSize({ rows: y + 1, cols: x + 1 })}
                onKeyDown={(event) => move(event, y + 1, x + 1)}
                onClick={() => onInsert(y + 1, x + 1)}
              />
            ))}
          </div>
        ))}
      </div>
      <p aria-live="polite">
        {size.rows} × {size.cols}
      </p>
      <small>Inserted after the selected text</small>
    </div>
  );
}
