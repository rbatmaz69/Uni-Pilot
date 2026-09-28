import { describe, expect, it } from 'vitest';
import { pdfCoverScale } from './pdfCover';

describe('PDF cover scale', () => {
  it('fills the card width for a portrait page instead of fitting its full height', () => {
    const scale = pdfCoverScale(612, 792);
    expect(612 * scale).toBeCloseTo(176);
    expect(792 * scale).toBeGreaterThan(177);
  });

  it('fills the card height for a landscape page', () => {
    const scale = pdfCoverScale(792, 612);
    expect(612 * scale).toBeCloseTo(177);
    expect(792 * scale).toBeGreaterThan(176);
  });
});
