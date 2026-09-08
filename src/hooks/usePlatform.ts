const isApplePlatform = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  return /mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent);
};

/** Modifier label for keyboard hints — "⌘" on Apple platforms, "Ctrl" elsewhere. */
export function usePlatformModifier(): { label: string; isMac: boolean } {
  const isMac = isApplePlatform();
  return { label: isMac ? '⌘' : 'Ctrl', isMac };
}
