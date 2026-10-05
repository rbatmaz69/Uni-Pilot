/** Keep a preview short without cutting an embedded image's data URL in half. */
export function slicePreviewText(source: string, limit: number): string {
  if (source.length <= limit) return source;

  const image = /!\[[^\]\n]*\]\(data:image\/[a-z\d.+-]+;base64,/gi;
  let last: RegExpExecArray | null = null;
  for (const match of source.matchAll(image)) {
    if (match.index >= limit) break;
    last = match;
  }
  if (last) {
    const end = source.indexOf(')', last.index + last[0].length);
    if (end === -1) return source.slice(0, last.index);
    if (end >= limit) return source.slice(0, end + 1);
  }
  return source.slice(0, limit);
}
