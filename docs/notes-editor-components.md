# Notes editor component research

The notes workspace has two surfaces: Markdown text in Tiptap and an associated visual canvas in Excalidraw. The text editor already had a selection menu and `/` block menu. The canvas already supported freehand drawing and native Excalidraw tools, but had no quick way to add reusable study objects.

## Visual component options

| Option                                                                                                | Relevant capability                                                | Fit                                                                                                                         |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| [Excalidraw](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/excalidraw-element-skeleton) | Programmatic shapes, bound text, arrows, and editable scenes       | Chosen. It is already installed and drawings are saved beside notes as `.excalidraw` files.                                 |
| [tldraw](https://tldraw.dev/docs/shapes)                                                              | Built-in and custom shapes, tools, and a reactive canvas           | Strong option for a future canvas redesign. Adopting it now would require replacing the existing drawing format and editor. |
| [Miro Web SDK](https://developers.miro.com/docs/board-items)                                          | Sticky notes, shapes, connectors, frames, and cards on Miro boards | Useful as interaction inspiration. It targets Miro boards rather than this local, offline canvas.                           |

[Goodnotes](https://support.goodnotes.com/hc/en-us/articles/16348150581647-Add-sticky-notes-to-your-notes) uses quick access to sticky notes, while its [shape tools](https://support.goodnotes.com/hc/en-us/articles/13682939148943-Draw-shapes-and-build-diagrams-in-Goodnotes) support visual note taking. Those patterns informed the insert palette.

## Implemented on the canvas

The drawing insert palette adds four coloured, editable sticky-style notes; rectangle, ellipse, diamond, and arrow shapes; and six study layouts: study card, flow, comparison, Cornell notes, study board, and mind map. Three compact buttons — **Sticky notes**, **Shapes**, and **Layouts** — open anchored windows with labelled visual previews. Only one picker opens at a time; choosing a preset, clicking outside, or pressing Escape closes it. The pickers support keyboard navigation and stay within the window when space is limited. A click places the object near the visible center of the canvas. The flow and mind map use Excalidraw arrow bindings, so connectors follow their cards. Inserts participate in undo and autosave with the rest of the `.excalidraw` scene. Open a note and choose **Canvas** or **Visual canvas** to find the palette.

The installed Excalidraw version is 0.18.1. Its newer native `stickynote` element is absent, so these notes are labelled, filled rectangles. Their text remains editable in Excalidraw. The [element skeleton API](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/excalidraw-element-skeleton) is beta; validate it when upgrading Excalidraw.

## Text editor

The Notes tab keeps its tools in one **editor dock** that floats at the bottom of the page (`components/EditorDock.tsx`), in three groups:

| Group | Buttons                                                             | Opens                                                                                                                                                                      |
| ----- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Write | **Insert** (+), **Text** (Aa), Undo, Redo                           | Insert adds new objects: a **Blocks** tab (table, image, formulas, toggle, footnote, Mermaid, divider) and a **Visuals** tab (sticky notes, study layouts, shapes, canvas) |
| Look  | **Layout**, **Typography**, **Page** — each shows its current value | Layout: Pages / Pageless / Full width / Notebook, plus width. Typography: font, size, spacing, bold color. Page: colour, cover, backdrop, with a live preview              |
| Note  | **Details** (ⓘ), **Focus mode**                                     | Word count and reading time once each, characters, headings, tasks, images and the file name                                                                               |

The split follows one rule: **Insert adds something new, Text changes the text you are on.** Headings, lists, quotes and code blocks therefore live only in Text (and in the selection menu, the block handle and the `/` menu), never in Insert. A control is only shown where it has an effect: Width appears for Pageless and Full width (A4 sheets keep their width; zoom instead), Backdrop disappears in Full width because the page covers it, and in the notebook the dock drops Insert, Text, Undo/Redo and Page because the notebook has its own toolbar and paper menu. The dock then moves to the corner beside the notebook's page dock.

One popover opens at a time, above its button, with an arrow pointing at it; it stays inside the editor, closes on an outside click, and returns focus to its button on Escape. Arrow keys, Home and End move between the dock's buttons; Alt+F10 in the text reaches the selection menu, or the dock's Text button when nothing is selected.

All four sticky colors, four shapes and six study templates insert native Tiptap blocks between paragraphs. Text is edited directly, using the existing formatting commands. Each card and layout has an explicit Edit button, a grip for dragging, and a corner handle for resizing. The object options offer move up/down, left/center/right alignment, exact dimensions, color, reset size and removal. Alt+Up/Down on the grip reorders siblings; arrow keys on the resize handle adjust size (Shift uses larger steps). Clicking blank card space enters its text. A drag resize is one undoable change and Escape cancels it. Heights are minimums so text is never clipped; widths fit the available page or layout column. Cmd/Ctrl+Enter continues writing below the component.

Object dimensions and alignment persist with their Markdown and HTML clipboard attributes. The slash menu also offers sticky notes, shapes and layouts.

`noteCard` and `noteLayout` nodes persist as readable Markdown inside app-specific colon containers (`:::noteCard sticky yellow`, with a longer fence around nested layouts). Standard Markdown apps retain the text but do not reproduce the visual layout automatically. These notes remain independent of the Excalidraw sidecar. Templates on the Notes page follow the document flow; the Canvas tab retains freely positioned objects and bound connectors.

Round-trip tests cover every preset, rich text, attachments, resized/aligned nested layouts, literal fences and HTML clipboard attributes. Object interaction tests cover editing, resizing, cancellation, keyboard movement, read-only controls and undo without losing text edits. Insertion tests cover selection preservation, undo, read-only controls and continuing below a template.

The visible formatting toolbar uses the existing Tiptap schema and shared block commands. [Tiptap UI Components](https://tiptap.dev/docs/ui-components/components/overview) informed the controls. [Plate](https://platejs.org/docs/markdown) and [Lexical](https://github.com/facebook/lexical) would both be full editor replacements for this use case; see below for what was taken from Plate as ideas.

New inline text features still need Markdown round-trip tests. Tiptap documents [Markdown limitations](https://tiptap.dev/docs/editor/markdown), including comments and table cell content. The app already detects content that the editor would lose on opening; preserve that guard.

### Tables

The floating table bar shows a labelled **Table options** button and quick accent colors. Its menu offers layout presets (grid, soft, striped and minimal), spacing, table accents, cell fill and text colors, alignment, row and column insertion and removal, header toggles, merge and split. Column edges can be dragged to resize. These controls extend the installed [Tiptap TableKit](https://github.com/ueberdosis/tiptap/tree/main/packages/extension-table) rather than replacing the note editor.

Simple tables remain GitHub-flavored Markdown. Styling, individual cell alignment, merged cells, header columns and column widths are saved as an HTML table inside the Markdown file so reopening the note keeps them editable. Other Markdown readers can display the table content, but the app-specific palette and layout attributes need Uni Pilot's stylesheet to reproduce the same appearance.

## Formulas, toggles, footnotes and the block handle

[Plate](https://github.com/udecode/plate) served as a feature catalogue. It is built on Slate, so none of its code applies to Tiptap; the features below use Tiptap's own MIT extensions or small nodes of our own, and each keeps a Markdown form other apps read:

| Feature      | In the file                                                                               | Where                                               |
| ------------ | ----------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Formulas     | `$x^2$` in a line, `$$ … $$` as a block (KaTeX, with `\ce{}` for chemistry)               | `lib/noteMath.ts`, `components/NoteMathView.tsx`    |
| Toggles      | `<details>` / `<summary>` with Markdown inside, as GitHub, Obsidian and VS Code render it | `lib/noteDetails.ts`                                |
| Footnotes    | GFM `[^1]` and `[^1]: …`, numbered in the order they are referenced                       | `lib/noteFootnotes.ts`                              |
| Typography   | Plain characters: `->` → `→`, `!=` → `≠`, `>=` → `≥`, `...` → `…`                         | `lib/typography.ts`                                 |
| Block handle | Nothing: moving, duplicating or turning a block only changes the text                     | `lib/blockActions.ts`, `components/BlockHandle.tsx` |

- **Formulas** follow Pandoc's rule for `$`: the opening sign is followed by a non-space, the closing one follows a non-space and no digit comes after it, so `5 $ and 10 $` or `$5 and $10` stay text. When writing, `escapeMarkdownText` adds `\$` only where a sign would otherwise open a formula; a line that starts with `$$` is escaped like other block syntax. A click, or Enter on a selected formula, opens its LaTeX with a live preview and KaTeX's error message; Enter finishes (Shift+Enter adds a line in a block), Escape restores the old formula, and an emptied formula removes itself. Typing `$x$` or `$$` and a space on an empty line creates one. Pipes in formulas inside GFM tables are written as `\|`; a block formula in a cell turns the table into HTML.
- **Toggles** keep whether they are open as a view state only. Tiptap's stock toggle reads and writes `:::details` containers; those tokenizers are switched off so such text stays text.
- **Footnotes** are inserted with the next free number after the other definitions, with the cursor in the new definition. The number in the text jumps to the definition, the definition's number jumps back.
- **Typography** leaves out quotes (their shape depends on the note's language), `(c)`, `(r)`, `(tm)` (sub-tasks are numbered (a), (b), (c)), `^2` and `2x3` (they would rewrite LaTeX and hex numbers) and `<<`, `>>`. Backspace right after a replacement restores what was typed; code keeps everything as typed.
- **The block handle** appears beside the block under the pointer on the Notes page: “+” adds a block below, the grip drags the block (ProseMirror moves it on drop, with its drop cursor) or opens options to duplicate, move, delete or turn it into another kind of text block. List items move on their own; cards and layouts keep their own grip. ⌘/Ctrl + Shift + ↑ / ↓ moves the block the cursor is in.

Pressing a formula or a footnote number is handled as a press and release instead of a `click`: on the first press ProseMirror makes the node draggable to select it, and Chrome then drops the click. In the Pages layout the text layer is positioned, so lifting its clip for a menu no longer lets the sheets cover the title.

Block tokenizers report where a paragraph must end through `start`, and marked passes the source from its second character on. `lib/markdownTokens.ts` therefore only reports real line starts; `^` with the `m` flag would find `$$` inside an escaped `\$$`.

## Page appearance

Notes open on **Pages**: A4 sheets (width × √2) stacked with a gap, each with a visible end and a page number, like the print layout of Word, Pages or Google Docs. The Markdown stays one continuous text; the sheets are purely visual. Tiptap's own [Pages extension](https://tiptap.dev/docs/pages/getting-started/overview) is a paid Pro add-on, so the layout follows the open-source technique of [tiptap-pagination-plus](https://github.com/RomikMakavana/tiptap-pagination-plus): at every page boundary a full-width `float` pushes each line that would cross it onto the next sheet, so paragraphs break between lines rather than jumping as a whole.

- `lib/pageSheets.ts` holds the geometry: sheet height, writable height, how many sheets the text needs (`countSheets`), and a `clip-path` that hides anything drawn in a margin or gap (a quote's bar or a card's paper that straddles a boundary).
- `lib/usePageSheets.ts` measures the page with a `ResizeObserver` and counts the sheets; `components/PageSheets.tsx` draws them behind the text.
- `lib/pageBreaks.ts` is a decoration-only plugin that places the boundary floats as a widget at the start of the editor. They must live inside it: browsers treat the `contenteditable` root as its own formatting context, so floats outside it cannot reach its lines. Lines avoid a float's whole margin box, so each boundary is a zero-width float holding the writable height plus the full-width break.
- Blocks that cannot break (code blocks, tables, images, diagrams, study layouts) are capped at one sheet's writable height and scroll inside. A taller unbreakable block would fit under no boundary and push the page count up forever; the hook also stops growth that never settles.
- Clicking the empty rest of the last sheet writes at the end of the note. Plain `.txt` files keep the Card layout, because a textarea cannot break across sheets.

- **Zoom** (25–200 %) scales the sheets with a CSS transform, so no line break moves: zoomed out, pages 2, 3 and further sit one below the other. A trackpad pinch (Chromium sends it as Ctrl + wheel, WebKit as gesture events), Ctrl/⌘ + scroll wheel, ⌘+ / ⌘− / ⌘0 and the `Page 2 of 5 · − 100% +` bar in the top bar all zoom around the pointer or the middle of the window. `lib/usePageZoom.ts` keeps that point in place; the frame around the sheets takes their zoomed size so scrolling ends where the last sheet does. Measurements divide screen rectangles by the zoom (ProseMirror does the same for scaled editors), and resizing a card turns pointer movement back into page pixels.

**Pageless** keeps the earlier single card that grows with the text, and **Full width** fills the window. Saved settings from before sheets existed move from the card to Pages once.

The dock's Layout, Typography and Page popovers hold the appearance settings: page layout and width; font, text size, line spacing and bold color; theme/ivory/slate page colours, optional sage/dune/blue abstract covers and the backdrop, with a live page preview. These appearance preferences are local and apply to all notes without changing their Markdown. Pages open at the beginning; notebooks retain their saved bookmark. The paper backdrop uses a subtle grain in place of the pronounced crumpled texture. Popovers size to the available editor width and height and scroll independently of the note.
