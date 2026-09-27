import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { sheetGeometry, sheetStackStyle } from '@/features/documents/lib/pageSheets';
import { PageSheets } from './PageSheets';

const layout = {
  ...sheetGeometry({ width: 800, marginTop: 76, marginBottom: 76, gap: 28 })!,
  count: 3,
  lead: 180,
};

describe('PageSheets', () => {
  it('draws one numbered A4 sheet per page, stacked with a gap', () => {
    const { container } = render(<PageSheets layout={layout} />);
    const sheets = Array.from(container.querySelectorAll<HTMLElement>('.note-sheet'));
    expect(sheets.map((sheet) => sheet.textContent)).toEqual(['1', '2', '3']);
    expect(sheets.map((sheet) => sheet.style.top)).toEqual(['0px', '1159px', '2318px']);
    expect(sheets[0]).toHaveStyle({ height: '1131px' });
    // Decoration only: the page numbers are not read out between paragraphs.
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });

  it('gives the stack the height of its sheets and the sizes its text layer needs', () => {
    const style = sheetStackStyle(layout) as Record<string, unknown>;
    expect(style.minHeight).toBe(3 * 1131 + 2 * 28);
    expect(style['--note-sheet-content']).toBe('979px');
    expect(style['--note-sheet-break']).toBe('180px');
    // The first boundary comes earlier by the cover and title above the text.
    expect(style['--note-sheet-first']).toBe('799px');
    expect(style['--note-sheet-clip']).toMatch(/^polygon\(/);
  });
});
