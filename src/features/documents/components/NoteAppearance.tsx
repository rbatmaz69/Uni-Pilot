import {
  LAYOUT_CHOICES,
  layoutChoice,
  LINE_SPACINGS,
  PAGE_WIDTHS,
  TEXT_SIZES,
  type LayoutChoice,
} from '@/features/documents/lib/noteAppearance';
import { NOTE_FONTS, type PageFont } from '@/features/documents/lib/noteFonts';
import {
  useNoteStyleStore,
  type BoldTextColor,
  type PageBackdrop,
  type PageCover,
  type PageTone,
} from '@/features/documents/store/noteStyleStore';
import { usePlatformModifier } from '@/hooks/usePlatform';
import { OptionGroup, type Option } from './OptionGroup';

/*
 * The appearance popovers of the editor dock. Each choice applies to every
 * note and never reaches the file; a control only shows where it has an
 * effect, so no setting sits there doing nothing.
 */

/** A small drawing of each layout, for its tile and for the dock button. */
export function LayoutGlyph({ layout }: { layout: LayoutChoice }) {
  return (
    <svg className="note-layout-glyph" viewBox="0 0 28 24" aria-hidden>
      {layout === 'pages' ? (
        <>
          <rect x="4.5" y="1.5" width="12" height="16" rx="1.5" />
          <rect className="is-front" x="11.5" y="6.5" width="12" height="16" rx="1.5" />
        </>
      ) : layout === 'card' ? (
        <>
          <rect x="7.5" y="1.5" width="13" height="21" rx="2" />
          <path d="M10.5 6.5h7M10.5 10h7M10.5 13.5h4.5" />
        </>
      ) : layout === 'full' ? (
        <>
          <rect x="1.5" y="3.5" width="25" height="17" rx="2" />
          <path d="M5 8.5h18M5 12h18M5 15.5h11" />
        </>
      ) : (
        <>
          <path d="M14 5.5c-2.8-2-6.4-2.4-11-1.6v15c4.6-.8 8.2-.4 11 1.6 2.8-2 6.4-2.4 11-1.6v-15c-4.6-.8-8.2-.4-11 1.6Z" />
          <path d="M14 5.5v15" />
        </>
      )}
    </svg>
  );
}

const LAYOUTS: Option<LayoutChoice>[] = LAYOUT_CHOICES.map((option) => ({
  ...option,
  preview: <LayoutGlyph layout={option.value} />,
}));
const FONTS: Option<PageFont>[] = NOTE_FONTS.map(({ value, label }) => ({
  value,
  label,
  preview: (
    <span className="note-font-preview" data-font={value}>
      Ag
    </span>
  ),
}));
const BOLD_COLORS: Option<BoldTextColor>[] = (['default', 'blue', 'teal', 'rose'] as const).map(
  (value) => ({
    value,
    label: value.charAt(0).toUpperCase() + value.slice(1),
    preview: <span className={`note-bold-preview is-${value}`}>B</span>,
  }),
);
const TONES: Option<PageTone>[] = [
  { value: 'default', label: 'Theme', preview: <span className="note-tone-swatch is-default" /> },
  { value: 'warm', label: 'Ivory', preview: <span className="note-tone-swatch is-warm" /> },
  { value: 'contrast', label: 'Slate', preview: <span className="note-tone-swatch is-contrast" /> },
];
const COVERS: Option<PageCover>[] = (['none', 'sage', 'dune', 'blue'] as const).map((value) => ({
  value,
  label: value === 'none' ? 'None' : value.charAt(0).toUpperCase() + value.slice(1),
  preview: <span className={`note-cover-swatch is-${value}`} />,
}));
const BACKDROPS: Option<PageBackdrop>[] = (['none', 'paper', 'dots', 'calm'] as const).map(
  (value) => ({
    value,
    label: value === 'none' ? 'None' : value.charAt(0).toUpperCase() + value.slice(1),
    preview: <span className={`note-swatch is-${value}`} />,
  }),
);

export function LayoutPanel() {
  const settings = useNoteStyleStore();
  const { isMac } = usePlatformModifier();
  const layout = layoutChoice(settings.style, settings.layout);

  function choose(choice: LayoutChoice) {
    if (choice === 'notebook') settings.setStyle('notebook');
    else {
      settings.setStyle('standard');
      settings.setLayout(choice);
    }
  }
  return (
    <div className="note-appearance">
      <OptionGroup
        label="Page layout"
        options={LAYOUTS}
        value={layout}
        onChange={choose}
        columns={4}
      />
      {layout === 'card' || layout === 'full' ? (
        <OptionGroup
          label="Width"
          variant="segmented"
          options={PAGE_WIDTHS}
          value={settings.width}
          onChange={settings.setWidth}
        />
      ) : (
        <p className="note-panel-note">
          {layout === 'pages'
            ? `A4 sheets keep their width. To see more of a sheet, zoom from the top bar or with ${isMac ? '⌘+ / ⌘−' : 'Ctrl+ / Ctrl−'}.`
            : 'Paper, bookmark and page sounds are in the dock under the notebook.'}
        </p>
      )}
    </div>
  );
}

export function TypographyPanel() {
  const settings = useNoteStyleStore();
  const notebook = settings.style === 'notebook';
  return (
    <div className="note-appearance">
      {notebook ? (
        <p className="note-panel-note">
          The notebook prints in its own type and spacing, like real paper.
        </p>
      ) : (
        <>
          <div className="note-option-stack">
            <OptionGroup
              label="Font"
              options={FONTS}
              value={settings.font}
              onChange={settings.setFont}
              columns={4}
            />
            <p className="note-panel-note">
              {NOTE_FONTS.find((font) => font.value === settings.font)?.description}
            </p>
          </div>
          <OptionGroup
            label="Text size"
            variant="segmented"
            options={TEXT_SIZES}
            value={settings.textSize}
            onChange={settings.setTextSize}
          />
          <OptionGroup
            label="Line spacing"
            variant="segmented"
            options={LINE_SPACINGS}
            value={settings.lineSpacing}
            onChange={settings.setLineSpacing}
          />
        </>
      )}
      <OptionGroup
        label="Bold text color"
        options={BOLD_COLORS}
        value={settings.boldColor}
        onChange={settings.setBoldColor}
      />
    </div>
  );
}

/** A page in miniature, drawn with the current font, colour, cover and backdrop. */
export function PagePreview() {
  const settings = useNoteStyleStore();
  const layout = layoutChoice(settings.style, settings.layout);
  return (
    <div
      className="note-style-preview"
      data-backdrop={layout === 'full' ? 'none' : settings.backdrop}
      data-tone={layout === 'notebook' ? 'default' : settings.tone}
      data-font={settings.font}
      data-layout={layout}
      data-bold-color={settings.boldColor}
      aria-hidden="true"
    >
      <div className="note-style-preview-sheet">
        {settings.cover !== 'none' && layout !== 'notebook' && (
          <div className={`note-cover-swatch is-${settings.cover}`} />
        )}
        <div className="note-style-preview-title">A fresh perspective</div>
        <p className="note-style-preview-copy">
          Keep the context. <strong>Bold the insight.</strong> <mark>Highlight the essential.</mark>
        </p>
        <span />
      </div>
    </div>
  );
}

export function PagePanel() {
  const settings = useNoteStyleStore();
  const full = settings.style === 'standard' && settings.layout === 'full';
  return (
    <div className="note-page-panel">
      <div className="note-appearance is-rows">
        <OptionGroup
          label="Colour"
          options={TONES}
          value={settings.tone}
          onChange={settings.setTone}
        />
        <OptionGroup
          label="Cover"
          options={COVERS}
          value={settings.cover}
          onChange={settings.setCover}
        />
        {full ? (
          <p className="note-panel-note">
            Full width fills the window, so there is no backdrop around the page.
          </p>
        ) : (
          <OptionGroup
            label="Backdrop"
            options={BACKDROPS}
            value={settings.backdrop}
            onChange={settings.setBackdrop}
          />
        )}
      </div>
      <figure className="note-page-preview">
        <figcaption className="note-panel-label">Preview</figcaption>
        <PagePreview />
        <p className="note-panel-note">Applies to every note. The file itself never changes.</p>
      </figure>
    </div>
  );
}
