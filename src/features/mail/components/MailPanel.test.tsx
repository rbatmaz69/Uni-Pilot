import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MailMessage } from '@/features/mail/lib/appleMail';
import { MailPanel } from '@/features/mail/components/MailPanel';
import type { FilterGroups, MailFilter } from '@/features/mail/lib/mail';
import { useMailStore } from '@/features/mail/store/mailStore';
import { useUiStore } from '@/store/uiStore';

const GROUPS: FilterGroups = {
  views: [
    { id: 'all', label: 'All mail', count: 12 },
    { id: 'unread', label: 'Unread', count: 3 },
    { id: 'reply', label: 'To answer', count: 0 },
  ],
  senders: [
    { id: 'university', label: 'University', count: 7 },
    { id: 'ilias', label: 'ILIAS', count: 2 },
  ],
  courses: [{ id: 'course:1', label: 'Datenbanken 1', count: 4 }],
};

const MESSAGE: MailMessage = {
  id: 'one@hs',
  mailId: 1,
  subject: 'Blatt 4 ist online',
  sender: 'Prof. Beispiel <prof@hs-heilbronn.de>',
  receivedAt: new Date().toISOString(),
  read: false,
  snippet: 'Guten Tag',
  attachments: 0,
};

function setup(props: Partial<React.ComponentProps<typeof MailPanel>> = {}) {
  const handlers = {
    onFilter: vi.fn<(filter: MailFilter) => void>(),
    onQuery: vi.fn<(query: string) => void>(),
    onSelect: vi.fn<(id: string) => void>(),
    onRefresh: vi.fn(),
    onCompose: vi.fn(),
    onAccount: vi.fn(),
  };
  render(
    <MemoryRouter>
      <MailPanel
        messages={[MESSAGE]}
        inbox={[MESSAGE]}
        loading={false}
        groups={GROUPS}
        refs={[{ refId: '1', code: null, key: 'Datenbanken 1', name: 'Datenbanken 1' }]}
        filter="all"
        query=""
        selectedId={null}
        {...handlers}
        {...props}
      />
    </MemoryRouter>,
  );
  return { ...handlers, panel: within(screen.getByRole('complementary', { name: 'Mail' })) };
}

beforeEach(() => {
  useMailStore.setState({ accounts: null, account: null });
});

describe('MailPanel', () => {
  it('is the Mail landmark, titled Mail, and holds the inbox itself', async () => {
    const user = userEvent.setup();
    const { panel, onSelect } = setup();

    expect(panel.getByRole('heading', { level: 2, name: 'Mail' })).toBeVisible();
    expect(panel.getByRole('searchbox', { name: 'Search mail' })).toBeVisible();
    const list = panel.getByRole('region', { name: 'Messages' });
    await user.click(within(list).getByRole('button', { name: /Blatt 4/ }));
    expect(onSelect).toHaveBeenCalledWith('one@hs');
    expect(panel.getByText('1 message')).toBeVisible();
  });

  it('shows the three views, with a count only where there is one', () => {
    const { panel } = setup();
    const views = panel.getByRole('group', { name: 'Show' });

    expect(within(views).getByRole('button', { name: 'All mail' })).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(within(views).getByRole('button', { name: 'Unread 3' })).toBeVisible();
    expect(within(views).getByRole('button', { name: 'To answer' })).toHaveTextContent(
      /^To answer$/,
    );
  });

  it('keeps senders and courses behind one button, grouped, with their counts', async () => {
    const user = userEvent.setup();
    const { panel, onFilter } = setup();
    expect(screen.queryByRole('menu')).toBeNull();

    await user.click(panel.getByRole('button', { name: 'Filter by sender or course' }));
    const menu = screen.getByRole('menu', { name: 'Filter by sender or course' });
    const senders = within(menu).getByRole('group', { name: 'Senders' });
    expect(within(senders).getByRole('menuitemradio', { name: 'University 7' })).toBeVisible();
    const courses = within(menu).getByRole('group', { name: 'Courses' });
    await user.click(within(courses).getByRole('menuitemradio', { name: 'Datenbanken 1 4' }));

    expect(onFilter).toHaveBeenCalledWith('course:1');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('has no filter button when there is no sender or course to filter by', () => {
    const { panel } = setup({ groups: { ...GROUPS, senders: [], courses: [] } });

    expect(panel.queryByRole('button', { name: 'Filter by sender or course' })).toBeNull();
    expect(panel.getByRole('button', { name: 'Unread 3' })).toBeVisible();
  });

  it('says which sender or course it is filtered by, and clears it from there', async () => {
    const user = userEvent.setup();
    const { panel, onFilter } = setup({ filter: 'ilias' });

    expect(panel.getByRole('button', { name: 'All mail' })).not.toHaveAttribute('aria-current');
    await user.click(panel.getByRole('button', { name: 'Clear filter: ILIAS' }));
    expect(onFilter).toHaveBeenCalledWith('all');
  });

  it('writes a new message and asks Mail again from its header', async () => {
    const user = userEvent.setup();
    const { panel, onCompose, onRefresh } = setup();

    await user.click(panel.getByRole('button', { name: 'New message' }));
    await user.click(panel.getByRole('button', { name: 'Refresh' }));

    expect(onCompose).toHaveBeenCalledTimes(1);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('cannot ask Mail again while Mail is being asked', () => {
    const { panel } = setup({ loading: true });

    expect(panel.getByRole('button', { name: 'Refresh' })).toBeDisabled();
    expect(panel.getByRole('button', { name: 'New message' })).toBeEnabled();
  });

  it('leads to the mail settings from its header', () => {
    const { panel } = setup();

    expect(panel.getByRole('link', { name: 'Mail settings' })).toHaveAttribute(
      'href',
      '/settings?section=mail',
    );
  });

  it('is wider than other panels by default, and as wide as the student drags it', async () => {
    const user = userEvent.setup();
    const { panel } = setup();
    const edge = panel.getByRole('separator', { name: 'Resize sidebar' });
    expect(edge).toHaveAttribute('aria-valuenow', '380');

    edge.focus();
    await user.keyboard('{ArrowRight}');
    expect(edge).toHaveAttribute('aria-valuenow', '396');
    expect(useUiStore.getState().panelWidths).toEqual({ mail: 396 });
  });

  it('keeps the plain title with one account', () => {
    useMailStore.setState({
      accounts: [{ name: 'Uni', addresses: ['me@stud.hs-heilbronn.de'] }],
      account: 'Uni',
    });
    const { panel } = setup();
    expect(panel.queryByRole('button', { name: 'Mail' })).toBeNull();
    expect(panel.getByRole('heading', { level: 2, name: 'Mail' })).toBeVisible();
  });

  it('puts the account switcher in the title’s place with several accounts', async () => {
    useMailStore.setState({
      accounts: [
        { name: 'iCloud', addresses: ['me@icloud.com'] },
        { name: 'Uni', addresses: ['me@stud.hs-heilbronn.de'] },
      ],
      account: 'Uni',
    });
    const user = userEvent.setup();
    const { panel, onAccount } = setup();

    expect(panel.getAllByRole('heading', { level: 2 })).toHaveLength(1);
    await user.click(panel.getByRole('button', { name: 'Mail' }));
    await user.click(screen.getByRole('menuitemradio', { name: 'iCloud' }));

    expect(onAccount).toHaveBeenCalledWith('iCloud');
  });
});
