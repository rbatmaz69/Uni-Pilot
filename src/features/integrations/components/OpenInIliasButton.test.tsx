import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

beforeEach(() => {
  openIlias.mockReset().mockResolvedValue(undefined);
  useIliasStore.setState({ connection: HEILBRONN, busy: false });
});

describe('OpenInIliasButton', () => {
  it('opens the linked page, not the ILIAS start page', async () => {
    render(<OpenInIliasButton url={EXERCISE} />);

    await userEvent.click(screen.getByRole('button', { name: 'Open in ILIAS' }));

    expect(openIlias).toHaveBeenCalledWith(HEILBRONN, EXERCISE);
  });

  it('shows nothing until ILIAS is connected', () => {
    useIliasStore.setState({ connection: null });
    render(<OpenInIliasButton url={EXERCISE} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  /** A button that could only fail is worse than no button. */
  it('shows nothing for a link that belongs somewhere else', () => {
    render(<OpenInIliasButton url="https://splan.hs-heilbronn.de/splan/" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows nothing for a link into a different ILIAS client', () => {
    render(<OpenInIliasButton url={`${EXERCISE}&client_id=other`} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('says what went wrong when the window will not open', async () => {
    openIlias.mockRejectedValue('ILIAS could not be opened: no display');
    render(<OpenInIliasButton url={EXERCISE} />);

    await userEvent.click(screen.getByRole('button', { name: 'Open in ILIAS' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('ILIAS could not be opened');
  });
});
