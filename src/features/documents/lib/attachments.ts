const IMAGE_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/bmp': 'bmp',
  'image/svg+xml': 'svg',
};
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'svg']);
const GERMAN = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' } as const;

function imageExtension(file: { name: string; type: string }): string | null {
  const byName = /\.([a-z0-9]+)$/i.exec(file.name)?.[1]?.toLowerCase();
  return IMAGE_TYPES[file.type] ?? (byName && IMAGE_EXTENSIONS.has(byName) ? byName : null);
}

export function isImageFile(file: { name: string; type: string }) {
  return imageExtension(file) !== null;
}

function stamp(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

/**
 * A file name for an image pasted into a note. It only uses characters that
 * need no escaping in a Markdown link, so the note stays readable in any app.
 * Clipboard images are all called "image.png" and get a timestamp instead.
 */
export function attachmentName(file: { name: string; type: string }, now = new Date()): string {
  const extension = imageExtension(file) ?? 'png';
  const stem = file.name
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[äöüß]/g, (letter) => GERMAN[letter as keyof typeof GERMAN])
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/, '');
  return `${!stem || stem === 'image' ? `image-${stamp(now)}` : stem}.${extension}`;
}

/**
 * The workspace path a note's image link points at, or null for links that
 * are not files in the workspace (web addresses, data URLs, absolute paths).
 */
export function resolveNoteLink(notePath: string, src: string): string | null {
  if (!src || /^[a-z][a-z\d+.-]*:/i.test(src) || src.startsWith('/') || src.startsWith('#'))
    return null;
  const target = src.replace(/^<|>$/g, '').split(/[?#]/)[0] ?? '';
  let decoded = target;
  try {
    decoded = decodeURIComponent(target);
  } catch {
    // Keep a malformed escape as written; the file lookup reports it missing.
  }
  const segments = notePath.split('/').slice(0, -1);
  for (const segment of decoded.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment !== '..') segments.push(segment);
    else if (!segments.pop()) return null;
  }
  return segments.join('/') || null;
}
