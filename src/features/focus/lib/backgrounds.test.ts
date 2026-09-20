import { describe, expect, it } from 'vitest';
import { addFocusBackground } from '@/features/focus/lib/backgrounds';

describe('user background files', () => {
  it('rejects files that are not supported images before storing anything', async () => {
    await expect(
      addFocusBackground(new File(['notes'], 'notes.txt', { type: 'text/plain' })),
    ).rejects.toThrow('Use a JPEG, PNG, WebP, AVIF or GIF image up to 50 MB.');
    await expect(
      addFocusBackground(new File([], 'empty.png', { type: 'image/png' })),
    ).rejects.toThrow('Use a JPEG, PNG, WebP, AVIF or GIF image up to 50 MB.');
  });
});
