export const THEMES = [
  { name: 'light', label: 'Light & airy', description: 'A fresh, bright workspace.' },
  { name: 'dark', label: 'After hours', description: 'A quiet glow for late nights.' },
  { name: 'flexoki-light', label: 'Flexoki light', description: 'Warm paper and colorful inks.' },
  { name: 'flexoki-dark', label: 'Flexoki dark', description: 'Soft inks on a charcoal canvas.' },
] as const;

export type ThemeName = (typeof THEMES)[number]['name'];

export function isDarkTheme(theme: ThemeName) {
  return theme === 'dark' || theme === 'flexoki-dark';
}

/** The quick toggle keeps the selected palette and changes only its brightness. */
export function alternateTheme(theme: ThemeName): ThemeName {
  const pairs: Record<ThemeName, ThemeName> = {
    light: 'dark',
    dark: 'light',
    'flexoki-light': 'flexoki-dark',
    'flexoki-dark': 'flexoki-light',
  };
  return pairs[theme];
}
