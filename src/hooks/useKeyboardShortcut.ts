import { useEffect } from 'react';

interface ShortcutOptions {
  key: string;
  /** Cmd on Apple platforms, Ctrl elsewhere. */
  meta?: boolean;
}

export function useKeyboardShortcut(
  { key, meta = false }: ShortcutOptions,
  handler: () => void,
): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== key.toLowerCase()) return;
      if (meta && !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      handler();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [key, meta, handler]);
}
