/** The hues a folder is drawn in on the canvas and in the ILIAS space. */
export const FOLDER_TONES = ['sage', 'peach', 'blue', 'lilac'] as const;
export type FolderTone = (typeof FOLDER_TONES)[number];

/** The canvas palette, also used by sidebar folders before a color is chosen. */
export const FOLDER_TONE_COLORS: Record<FolderTone, string> = {
  sage: '#c9dcbd',
  peach: '#ecc4a7',
  blue: '#bdd2e9',
  lilac: '#d5c8e7',
};

/** A folder's hue follows its name, so it looks the same wherever it shows. */
export function folderTone(name: string): FolderTone {
  const sum = Array.from(name).reduce((total, char) => total + char.charCodeAt(0), 0);
  return FOLDER_TONES[sum % FOLDER_TONES.length] ?? 'sage';
}
