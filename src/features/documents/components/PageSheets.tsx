import type { SheetLayout } from '@/features/documents/lib/pageSheets';

/** The paper behind the text: one A4 sheet per page, numbered at its foot. */
export function PageSheets({ layout }: { layout: SheetLayout }) {
  return (
    <div className="note-sheets" aria-hidden="true">
      {Array.from({ length: layout.count }, (_, index) => (
        <div
          key={index}
          className="note-sheet"
          style={{ top: index * layout.stride, height: layout.height }}
        >
          <span className="note-sheet-number">{index + 1}</span>
        </div>
      ))}
    </div>
  );
}
