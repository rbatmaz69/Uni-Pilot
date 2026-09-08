import { render, type RenderResult } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from '@/app/routes';

/**
 * Renders the whole application shell at a given route.
 *
 * Deliberately does not use AppProviders — that wires up BrowserRouter, which
 * cannot start at an arbitrary path.
 */
export function renderApp(initialPath: string): RenderResult {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AppRoutes />
    </MemoryRouter>,
  );
}
