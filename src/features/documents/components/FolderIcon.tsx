import { Folder, FolderOpen } from 'lucide-react';
import { useFolderAppearance, type FolderAppearance } from '../store/folderAppearanceStore';

/** Original, layered vector artwork: a tab, a paper edge and a colored pocket. */
export function FolderGlyph({
  appearance,
  size = 19,
  open = false,
}: {
  appearance: FolderAppearance;
  size?: number;
  open?: boolean;
}) {
  const { color, style } = appearance;
  if (style === 'outline') {
    const Icon = open ? FolderOpen : Folder;
    return <Icon size={size} strokeWidth={1.7} style={{ color }} aria-hidden />;
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className="folder-glyph"
      aria-hidden="true"
      focusable="false"
      data-folder-color={color}
    >
      <path
        d="M2 6a2 2 0 0 1 2-2h4.4c.6 0 1.1.3 1.5.7L11.4 6H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2Z"
        fill={color}
      />
      <path
        d="M2 6a2 2 0 0 1 2-2h4.4c.6 0 1.1.3 1.5.7L11.4 6H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2Z"
        fill="#000"
        opacity=".16"
      />
      <rect x="3" y="7" width="18" height="10" rx="1.3" fill="#fff" opacity=".8" />
      <path
        d={
          open
            ? 'M4 10h17.1a1.3 1.3 0 0 1 1.3 1.6l-1.6 7a1.8 1.8 0 0 1-1.8 1.4H4a2 2 0 0 1-2-2V10Z'
            : 'M2 10a1.5 1.5 0 0 1 1.5-1.5h17A1.5 1.5 0 0 1 22 10v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2Z'
        }
        fill={color}
      />
    </svg>
  );
}

export function FolderIcon({
  path,
  name,
  open = false,
}: {
  path: string;
  name?: string;
  open?: boolean;
}) {
  const appearance = useFolderAppearance(path, name);
  return <FolderGlyph appearance={appearance} open={open} />;
}
