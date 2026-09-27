/**
 * A block tokenizer's `start`: where `pattern` begins a line. marked passes
 * the source from its second character on to find where a paragraph ends, so
 * the first position is not a line start — `^` with the `m` flag would find
 * `$$` inside an escaped `\$$` and cut the paragraph there.
 */
export function lineStart(pattern: RegExp) {
  const search = new RegExp(`\\n${pattern.source}`);
  return (src: string) => {
    const match = search.exec(src);
    return match ? match.index + 1 : -1;
  };
}
