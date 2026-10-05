// Bundled, so a note reads the same offline and on every platform. The browser
// fetches a face (and only the scripts it needs) once a note is set in it.
import '@fontsource-variable/inter/opsz.css';
import '@fontsource-variable/inter/opsz-italic.css';
import '@fontsource-variable/atkinson-hyperlegible-next/wght.css';
import '@fontsource-variable/atkinson-hyperlegible-next/wght-italic.css';
import '@fontsource-variable/literata/opsz.css';
import '@fontsource-variable/literata/opsz-italic.css';
import '@fontsource-variable/newsreader/opsz.css';
import '@fontsource-variable/newsreader/opsz-italic.css';
import '@fontsource/ia-writer-quattro/400.css';
import '@fontsource/ia-writer-quattro/400-italic.css';
import '@fontsource/ia-writer-quattro/700.css';
import '@fontsource/ia-writer-quattro/700-italic.css';

/**
 * The typefaces a note can be written in. Each one's CSS stack lives in
 * documents.css under `[data-font]`, beside the sizes and spacing.
 */
export type PageFont =
  'inter' | 'system' | 'atkinson' | 'instrument' | 'literata' | 'newsreader' | 'iowan' | 'quattro';

export interface NoteFont {
  value: PageFont;
  label: string;
  /** Why you might pick it, shown under the choices. */
  description: string;
}

/** Sans faces first, then serifs and the writer's face: two rows of four. */
export const NOTE_FONTS: readonly NoteFont[] = [
  {
    value: 'inter',
    label: 'Inter',
    description: 'Drawn for screens, with tall lowercase letters that stay clear at any size.',
  },
  {
    value: 'system',
    label: 'System',
    description: 'Your system’s own face: SF Pro on macOS, Segoe UI on Windows.',
  },
  {
    value: 'atkinson',
    label: 'Atkinson',
    description: 'Atkinson Hyperlegible, by the Braille Institute: l, I and 1 never look alike.',
  },
  {
    value: 'instrument',
    label: 'Instrument',
    description: 'Instrument Sans, the typeface of the app itself.',
  },
  {
    value: 'literata',
    label: 'Literata',
    description: 'Made for Google Play Books, to read long texts on screen without tiring.',
  },
  {
    value: 'newsreader',
    label: 'Newsreader',
    description: 'An editorial serif for continuous reading, lighter than Literata.',
  },
  {
    value: 'iowan',
    label: 'Iowan',
    description: 'Iowan Old Style from Apple Books; Charter or Georgia where it is missing.',
  },
  {
    value: 'quattro',
    label: 'Quattro',
    description: 'iA Writer Quattro: the calm rhythm of a typewriter, easier on the eyes.',
  },
];

export const DEFAULT_NOTE_FONT: PageFont = 'inter';

/**
 * Before the catalog a note chose a family. Serif keeps its face; the old
 * default sans moves to the new default, mono to the writer's face.
 */
const LEGACY_FONTS: Record<string, PageFont> = { sans: 'inter', serif: 'iowan', mono: 'quattro' };

/** A saved choice as a face from the catalog, whatever version wrote it. */
export function noteFont(saved: unknown): PageFont {
  if (typeof saved !== 'string') return DEFAULT_NOTE_FONT;
  const legacy = LEGACY_FONTS[saved];
  if (legacy) return legacy;
  return NOTE_FONTS.find((font) => font.value === saved)?.value ?? DEFAULT_NOTE_FONT;
}
