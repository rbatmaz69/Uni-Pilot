import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderThumbnail } from './thumbnail';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('card thumbnails', () => {
  it.each(['image/svg+xml', 'image/gif', 'image/x-icon'])('shows %s as it is', async (mime) => {
    expect(await renderThumbnail({ mime, base64: 'YWJj' })).toBeNull();
  });

  it('leaves a picture as it is when the webview cannot decode it', async () => {
    vi.stubGlobal('createImageBitmap', undefined);
    expect(await renderThumbnail({ mime: 'image/png', base64: 'YWJj' })).toBeNull();
  });
});
