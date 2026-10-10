import { NOTE_FONTS, type PageFont } from '@/features/documents/lib/noteFonts';
import {
  PAPER_KINDS,
  type LineSpacing,
  type NoteStyle,
  type PageLayout,
  type PageWidth,
  type PaperKind,
  type TextSize,
} from '@/features/documents/store/noteStyleStore';

/** Every way a note can be laid out: the three page layouts, or the notebook. */
export type LayoutChoice = PageLayout | 'notebook';

export function layoutChoice(style: NoteStyle, layout: PageLayout): LayoutChoice {
  return style === 'notebook' ? 'notebook' : layout;
}

export const LAYOUT_CHOICES: { value: LayoutChoice; label: string; detail: string }[] = [
  { value: 'pages', label: 'Pages', detail: 'A4 sheets' },
  { value: 'card', label: 'Pageless', detail: 'One long page' },
  { value: 'full', label: 'Full width', detail: 'Edge to edge' },
  { value: 'notebook', label: 'Notebook', detail: 'Turn the pages' },
];
export const PAGE_WIDTHS: { value: PageWidth; label: string }[] = [
  { value: 'narrow', label: 'Narrow' },
  { value: 'normal', label: 'Normal' },
  { value: 'wide', label: 'Wide' },
];
export const TEXT_SIZES: { value: TextSize; label: string }[] = [
  { value: 's', label: 'Small' },
  { value: 'm', label: 'Medium' },
  { value: 'l', label: 'Large' },
  { value: 'xl', label: 'X-Large' },
];
export const LINE_SPACINGS: { value: LineSpacing; label: string }[] = [
  { value: 'compact', label: 'Compact' },
  { value: 'normal', label: 'Normal' },
  { value: 'relaxed', label: 'Relaxed' },
];

const labelOf = <T extends string>(options: readonly { value: T; label: string }[], value: T) =>
  options.find((option) => option.value === value)?.label ?? '';

/**
 * What the Layout button's tooltip reads: the layout, and the one setting that
 * shapes it. A4 has a fixed width, so only the other layouts name theirs.
 */
export function layoutSummary(layout: LayoutChoice, width: PageWidth, paper: PaperKind) {
  const name = labelOf(LAYOUT_CHOICES, layout);
  if (layout === 'pages') return { name, detail: 'A4' };
  if (layout === 'notebook') return { name, detail: `${labelOf(PAPER_KINDS, paper)} paper` };
  return { name, detail: labelOf(PAGE_WIDTHS, width) };
}

/** What the Typography button's tooltip reads: the typeface and the text size. */
export function typographySummary(font: PageFont, size: TextSize) {
  return { name: labelOf(NOTE_FONTS, font), detail: labelOf(TEXT_SIZES, size) };
}
