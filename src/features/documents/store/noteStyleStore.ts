import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_NOTE_FONT, noteFont, type PageFont } from '@/features/documents/lib/noteFonts';
import { clampZoom } from '@/features/documents/lib/pageSheets';

/** How a note is presented while writing: a plain page, or a ring-bound notebook. */
export type NoteStyle = 'standard' | 'notebook';
/** The ruling printed on notebook paper. */
export type PaperKind = 'dotted' | 'lined' | 'grid' | 'blank';
/**
 * A standard page is a stack of A4 sheets, one card that grows with the text,
 * or fills the window.
 */
export type PageLayout = 'pages' | 'card' | 'full';
export type PageWidth = 'narrow' | 'normal' | 'wide';
/** The body text size; headings and the title grow with it. */
export type TextSize = 's' | 'm' | 'l' | 'xl';
export type LineSpacing = 'compact' | 'normal' | 'relaxed';
/** What lies behind a card page. */
export type PageBackdrop = 'none' | 'paper' | 'dots' | 'calm';
export type PageTone = 'default' | 'warm' | 'contrast';
export type PageCover = 'none' | 'sage' | 'dune' | 'blue';
/** A display preference for bold passages, never written into the Markdown. */
export type BoldTextColor = 'default' | 'blue' | 'teal' | 'rose';

export const PAPER_KINDS: { value: PaperKind; label: string }[] = [
  { value: 'dotted', label: 'Dotted' },
  { value: 'lined', label: 'Lined' },
  { value: 'grid', label: 'Grid' },
  { value: 'blank', label: 'Blank' },
];

interface NoteStyleState {
  style: NoteStyle;
  paper: PaperKind;
  sound: boolean;
  layout: PageLayout;
  font: PageFont;
  textSize: TextSize;
  lineSpacing: LineSpacing;
  width: PageWidth;
  backdrop: PageBackdrop;
  tone: PageTone;
  cover: PageCover;
  boldColor: BoldTextColor;
  /** How large the sheets are drawn; the text keeps its line breaks. */
  zoom: number;
  /** The outline / tasks / links / search panel beside a standard page. */
  sidebar: boolean;
  /** Dims everything but the block being written and steps the chrome back. */
  focus: boolean;
  /** Per note path, the document position the ribbon marks. */
  bookmarks: Record<string, number>;
  setStyle: (style: NoteStyle) => void;
  setPaper: (paper: PaperKind) => void;
  toggleSound: () => void;
  setLayout: (layout: PageLayout) => void;
  setFont: (font: PageFont) => void;
  setTextSize: (textSize: TextSize) => void;
  setLineSpacing: (lineSpacing: LineSpacing) => void;
  setWidth: (width: PageWidth) => void;
  setBackdrop: (backdrop: PageBackdrop) => void;
  setTone: (tone: PageTone) => void;
  setCover: (cover: PageCover) => void;
  setBoldColor: (boldColor: BoldTextColor) => void;
  setZoom: (zoom: number) => void;
  toggleSidebar: () => void;
  toggleFocus: () => void;
  setBookmark: (path: string, position: number | null) => void;
  /** Keeps a note's bookmark when the note is renamed. */
  moveBookmark: (from: string, to: string) => void;
}

export const useNoteStyleStore = create<NoteStyleState>()(
  persist(
    (set) => ({
      style: 'standard',
      paper: 'dotted',
      sound: true,
      layout: 'pages',
      font: DEFAULT_NOTE_FONT,
      textSize: 'm',
      lineSpacing: 'normal',
      width: 'normal',
      backdrop: 'paper',
      tone: 'default',
      cover: 'none',
      boldColor: 'default',
      zoom: 1,
      sidebar: true,
      focus: false,
      bookmarks: {},
      setStyle: (style) => set({ style }),
      setPaper: (paper) => set({ paper }),
      toggleSound: () => set((state) => ({ sound: !state.sound })),
      setLayout: (layout) => set({ layout }),
      setFont: (font) => set({ font }),
      setTextSize: (textSize) => set({ textSize }),
      setLineSpacing: (lineSpacing) => set({ lineSpacing }),
      setWidth: (width) => set({ width }),
      setBackdrop: (backdrop) => set({ backdrop }),
      setTone: (tone) => set({ tone }),
      setCover: (cover) => set({ cover }),
      setBoldColor: (boldColor) => set({ boldColor }),
      setZoom: (zoom) => set({ zoom: clampZoom(zoom) }),
      toggleSidebar: () => set((state) => ({ sidebar: !state.sidebar })),
      toggleFocus: () => set((state) => ({ focus: !state.focus })),
      setBookmark: (path, position) =>
        set((state) => {
          const bookmarks = { ...state.bookmarks };
          if (position === null) delete bookmarks[path];
          else bookmarks[path] = position;
          return { bookmarks };
        }),
      moveBookmark: (from, to) =>
        set((state) => {
          const position = state.bookmarks[from];
          if (position === undefined) return state;
          const bookmarks = { ...state.bookmarks, [to]: position };
          delete bookmarks[from];
          return { bookmarks };
        }),
    }),
    {
      name: 'uni-pilot.note-style',
      version: 2,
      migrate: (persisted, version) => {
        let state = persisted as Partial<NoteStyleState>;
        // Version 1 brings sheets: the growing card was the default, not a choice.
        if (version < 1 && state.layout === 'card') state = { ...state, layout: 'pages' };
        // Version 2 names typefaces instead of families.
        if (version < 2 && state.font !== undefined)
          state = { ...state, font: noteFont(state.font) };
        return state;
      },
    },
  ),
);
