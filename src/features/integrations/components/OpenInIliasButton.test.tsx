import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IliasConnection } from '@/features/integrations/lib/ilias/connection';
import { useIliasStore } from '@/features/integrations/store/iliasStore';
import { OpenInIliasButton } from './OpenInIliasButton';

const openIlias = vi.fn<(connection: IliasConnection, target?: string) => Promise<void>>();

vi.mock('@/features/integrations/lib/iliasWindow', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/integrations/lib/iliasWindow')>()),
  openIlias: (connection: IliasConnection, target?: string) => openIlias(connection, target),
}));

const HEILBRONN: IliasConnection = {
  name: 'Hochschule Heilbronn',
  baseUrl: 'https://ilias.hs-heilbronn.de',
  clientId: 'iliashhn',
  version: '9.23',
  signIn: 'both',
  soap: 'blocked',
  checkedAt: '2026-09-23T10:00:00.000Z',
};

const EXERCISE = 'https://ilias.hs-heilbronn.de/goto.php?target=exc_4711';

/** Shows where the router ended up, so a test can read it. */
function Where() {
  const location = useLocation();
  return <p data-location>{`${location.pathname}${location.search}`}</p>;
}

function renderButton(url: string) {
  return render(
    <MemoryRouter initialEntries={['/calendar']}>
      <Routes>
        <Route path="/calendar" element={<OpenInIliasButton url={url} />} />
        <Route path="/ilias" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  Reflect.deleteProperty(window, '__TAURI_INTERNALS__');
});

beforeEach(() => {
  openIlias.mockReset().mockResolvedValue(undefined);
  useIliasStore.setState({ connection: HEILBRONN, busy: false });
});

describe('OpenInIliasButton', () => {
  /**
   * In the desktop app ILIAS lives inside Uni Pilot, so the button goes to the
   * ILIAS page and hands it the link rather than opening a window.
   */
  it('takes the link to the ILIAS page in the desktop app', async () => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {}, configurable: true });
    renderButton(EXERCISE);

    await userEvent.click(screen.getByRole('button', { name: 'Open in ILIAS' }));

    expect(document.querySelector('[data-location]')?.textContent).toBe(
      `/ilias?target=${encodeURIComponent(EXERCISE)}`,
    );
    expect(openIlias).not.toHaveBeenCalled();
  });

  it('opens the linked page in a tab from a browser', async () => {
    renderButton(EXERCISE);

    await userEvent.click(screen.getByRole('button', { name: 'Open in ILIAS' }));

    expect(openIlias).toHaveBeenCalledWith(HEILBRONN, EXERCISE);
  });

  it('shows nothing until ILIAS is connected', () => {
    useIliasStore.setState({ connection: null });
    renderButton(EXERCISE);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  /** A button that could only fail is worse than no button. */
  it('shows nothing for a link that belongs somewhere else', () => {
    renderButton('https://splan.hs-heilbronn.de/splan/');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows nothing for a link into a different ILIAS client', () => {
    renderButton(`${EXERCISE}&client_id=other`);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('says what went wrong when the window will not open', async () => {
    openIlias.mockRejectedValue('ILIAS could not be opened: no display');
    renderButton(EXERCISE);

    await userEvent.click(screen.getByRole('button', { name: 'Open in ILIAS' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('ILIAS could not be opened');
  });
});
