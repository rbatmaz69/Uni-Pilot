import { useEffect, type ReactNode } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { useUiStore } from '@/store/uiStore';

/** Applies the active theme token set to the document root. */
function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useUiStore((state) => state.theme);

  useEffect(() => {
    document.documentElement.dataset['theme'] = theme;
  }, [theme]);

  return <>{children}</>;
}

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <BrowserRouter>{children}</BrowserRouter>
    </ThemeProvider>
  );
}
