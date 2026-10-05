/**
 * Adds a scheme to what was typed into the link field, so `uni.de` opens a
 * website instead of being read as a file next to the note.
 */
export function normaliseHref(input: string): string {
  const href = input.trim();
  if (!href) return '';
  if (/^[a-z][a-z\d+.-]*:/i.test(href) || href.startsWith('#') || href.startsWith('/')) return href;
  if (/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(href)) return `mailto:${href}`;
  return `https://${href}`;
}
