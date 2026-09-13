import { describe, expect, it } from 'vitest';
import { dominantImageColor } from './imagePalette';

describe('Image-derived event colours', () => {
  it('keeps the dominant brown family while ignoring white text and transparent pixels', () => {
    const pixels = new Uint8ClampedArray([
      140, 80, 40, 255, 145, 85, 45, 255, 10, 120, 180, 255, 255, 255, 255, 255, 255, 0, 0, 0,
    ]);
    expect(dominantImageColor(pixels)).toBe('rgb(95 55 28)');
  });
  it('falls back when the image has no usable colour', () => {
    expect(dominantImageColor(new Uint8ClampedArray([255, 255, 255, 255]))).toBeNull();
  });
});
