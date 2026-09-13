/** Most common colour family, ignoring transparent, near-white and black pixels. */
export function dominantImageColor(pixels: Uint8ClampedArray): string | null {
  const buckets = new Map<string, { count: number; r: number; g: number; b: number }>();
  for (let i = 0; i < pixels.length; i += 4) {
    const [r = 0, g = 0, b = 0, a = 0] = pixels.slice(i, i + 4);
    if (a < 128 || Math.max(r, g, b) < 25 || Math.min(r, g, b) > 230) continue;
    const key = `${r >> 5},${g >> 5},${b >> 5}`;
    const bucket = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
    bucket.count++;
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    buckets.set(key, bucket);
  }
  const dominant = [...buckets.values()].sort((a, b) => b.count - a.count)[0];
  if (!dominant) return null;
  const rgb = [dominant.r, dominant.g, dominant.b].map((value) => value / dominant.count);
  // Cap the brightest channel so white text always has comfortable contrast.
  const scale = Math.min(0.8, 95 / Math.max(...rgb));
  return `rgb(${rgb.map((value) => Math.round(value * scale)).join(' ')})`;
}

export function sampleImageColor(image: HTMLImageElement, height = 1): string | null {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 32;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(image, 0, 0, image.naturalWidth, image.naturalHeight * height, 0, 0, 32, 32);
    return dominantImageColor(context.getImageData(0, 0, 32, 32).data);
  } catch {
    // Unavailable canvas or a cross-origin image keeps the semantic fallback.
    return null;
  }
}
