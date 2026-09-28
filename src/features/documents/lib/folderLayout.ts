import { editable, type DocumentEntry } from '@/features/documents/lib/files';

export type PreviewSize = { width: number; height: number };
export type FolderCard = PreviewSize & { x: number; y: number };
export type FolderLayout = {
  cards: Record<string, FolderCard>;
  bounds: FolderCard;
};

const GAP = 14;

/** Fit the actual preview into a comfortable visual size without changing its ratio. */
export function folderCardSize(entry: DocumentEntry, natural?: PreviewSize): PreviewSize {
  if (entry.folder) return { width: 126, height: 122 };
  const ratio =
    natural && natural.width > 0 && natural.height > 0
      ? natural.width / natural.height
      : 760 / 1068;
  if (editable(entry)) {
    const width = ratio >= 1 ? 110 : 134;
    return { width, height: Math.min(194, width / ratio) };
  }
  const width = Math.sqrt(22000 * ratio);
  const height = width / ratio;
  const scale = Math.min(1, 230 / width, 194 / height);
  return { width: width * scale, height: height * scale };
}

/** A stable skyline pack: file order is fixed; each card takes the lowest open space. */
export function packFolder(
  entries: DocumentEntry[],
  dimensions: Record<string, PreviewSize> = {},
): FolderLayout {
  const ordered = [...entries].sort(
    (a, b) =>
      a.name.localeCompare(b.name, 'en', { numeric: true }) || a.path.localeCompare(b.path, 'en'),
  );
  const sizes = ordered.map((entry) => folderCardSize(entry, dimensions[entry.path]));
  const area = sizes.reduce((sum, size) => sum + (size.width + GAP) * (size.height + GAP), 0);
  const maxWidth = Math.max(0, ...sizes.map((size) => size.width));
  const width = Math.max(maxWidth, Math.min(760, Math.sqrt(area) * 1.25));
  const placed: FolderCard[] = [];
  for (const size of sizes) {
    const candidates = new Set([0, width - size.width, (width - size.width) / 2]);
    for (const other of placed) {
      candidates.add(other.x + other.width + GAP);
      candidates.add(other.x - size.width - GAP);
      candidates.add(other.x);
    }
    let best: FolderCard | undefined;
    let score = Infinity;
    for (const x of candidates) {
      if (x < 0 || x + size.width > width + 0.01) continue;
      const y = Math.max(
        0,
        ...placed
          .filter(
            (other) =>
              x < other.x + other.width + GAP - 0.01 && x + size.width + GAP > other.x + 0.01,
          )
          .map((other) => other.y + other.height + GAP),
      );
      const candidateScore = y * 1000 + x;
      if (candidateScore < score) {
        score = candidateScore;
        best = { ...size, x, y };
      }
    }
    placed.push(best ?? { ...size, x: 0, y: 0 });
  }
  const left = placed.length ? Math.min(...placed.map((card) => card.x)) : 0;
  const right = Math.max(0, ...placed.map((card) => card.x + card.width));
  const height = Math.max(0, ...placed.map((card) => card.y + card.height));
  const offsetX = 500 - (right - left) / 2 - left;
  return {
    cards: Object.fromEntries(
      ordered.map((entry, index) => {
        const card = placed[index]!;
        return [entry.path, { ...card, x: card.x + offsetX, y: card.y + 108 }];
      }),
    ),
    bounds: { x: offsetX + left, y: 108, width: right - left, height },
  };
}

/** The padded collection stays fixed for the duration of a drag. */
export function outsideFolder(point: { x: number; y: number }, bounds: FolderCard) {
  const margin = 42;
  return (
    point.x < bounds.x - margin ||
    point.x > bounds.x + bounds.width + margin ||
    point.y < bounds.y - margin ||
    point.y > bounds.y + bounds.height + margin
  );
}
