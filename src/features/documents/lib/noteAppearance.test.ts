import { describe, expect, it } from 'vitest';
import { layoutChoice, layoutSummary, typographySummary } from './noteAppearance';

describe('note appearance summaries', () => {
  it('treats the notebook as a layout of its own, whatever page layout was saved', () => {
    expect(layoutChoice('notebook', 'full')).toBe('notebook');
    expect(layoutChoice('standard', 'card')).toBe('card');
  });

  it('names only the setting that shapes each layout', () => {
    expect(layoutSummary('pages', 'wide', 'lined')).toEqual({ name: 'Pages', detail: 'A4' });
    expect(layoutSummary('card', 'narrow', 'lined')).toEqual({
      name: 'Pageless',
      detail: 'Narrow',
    });
    expect(layoutSummary('full', 'wide', 'lined')).toEqual({ name: 'Full width', detail: 'Wide' });
    expect(layoutSummary('notebook', 'wide', 'grid')).toEqual({
      name: 'Notebook',
      detail: 'Grid paper',
    });
  });

  it('reads the typeface and text size', () => {
    expect(typographySummary('literata', 'xl')).toEqual({ name: 'Literata', detail: 'X-Large' });
  });
});
