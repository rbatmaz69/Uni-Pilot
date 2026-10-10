/**
 * The Inbox across the shell: the university account found by its address,
 * messages sorted by sender and course through the Mail panel, a message read
 * in the pane and marked read in Mail, a reply handed to Mail as a draft, a new
 * message sent once the student confirmed it, triage and the board — and
 * what the page says when Mail cannot help. Rust and Mail are a stand-in
 * answering like `apple_mail.rs` does.
 */

import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useIliasStore } from '@/features/integrations/store/iliasStore';
import { useCourseStore } from '@/features/courses/store/courseStore';
import { useMailStore } from '@/features/mail/store/mailStore';
import { renderApp } from '@/test/render';

const invoke = vi.fn<(command: string, args: Record<string, unknown>) => Promise<unknown>>();

// The whole shell renders, and it asks `isTauri` too; only `invoke` is faked.
vi.mock('@tauri-apps/api/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tauri-apps/api/core')>()),
  invoke: (command: string, args: Record<string, unknown>) => invoke(command, args),
  isTauri: () => false,
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: () => Promise.resolve(() => undefined),
}));

const pretendDesktop = () =>
  Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {}, configurable: true });

const ACCOUNTS = [
  { name: 'iCloud', addresses: ['me@icloud.com'] },
  { name: 'stud.hs-heilbronn.de', addresses: ['student@stud.hs-heilbronn.de'] },
];

const MESSAGES = [
  {
    id: 'new@hs-heilbronn.de',
    mailId: 301,
    subject: 'Datenbanken 1: Blatt 4 ist online',
    sender: 'Prof. Beispiel <prof@hs-heilbronn.de>',
    receivedAt: '2026-09-25T09:12:00.000Z',
    read: false,
    snippet: 'Guten Tag, Blatt 4 ist jetzt online.',
    attachments: 1,
  },
  {
    id: 'ilias@hs-heilbronn.de',
    mailId: 302,
    subject: '[ILIAS] Neue Datei in Material',
    sender: 'ILIAS HHN <noreply-ilias@hs-heilbronn.de>',
    receivedAt: '2026-09-24T18:00:00.000Z',
    read: true,
    snippet: 'Eine neue Datei wurde hochgeladen.',
    attachments: 0,
  },
  {
    id: 'mia@stud.hs-heilbronn.de',
    mailId: 303,
    subject: 'Lerngruppe morgen?',
    sender: 'Mia <mia@stud.hs-heilbronn.de>',
    receivedAt: '2026-09-20T10:00:00.000Z',
    read: true,
    snippet: 'Hast du morgen Zeit?',
    attachments: 0,
  },
];

const BODY = {
  id: 'new@hs-heilbronn.de',
  subject: 'Datenbanken 1: Blatt 4 ist online',
  sender: 'Prof. Beispiel <prof@hs-heilbronn.de>',
  to: ['student@stud.hs-heilbronn.de'],
  cc: [],
  receivedAt: '2026-09-25T09:12:00.000Z',
  read: false,
  content:
    'Guten Tag,\n\nBlatt 4 ist jetzt online.\n\nAm 20.09.2026 schrieb Studienbüro:\n> Willkommen.',
  attachments: [{ name: 'Blatt4.pdf', size: 81234 }],
};

/** Answers as Rust would; `refuse` makes a command fail with that kind. */
function answerLikeRust(refuse: Record<string, string> = {}, accounts = ACCOUNTS) {
  const refusal = (kind: string) => vi.fn<() => Promise<unknown>>().mockRejectedValue({ kind })();
  invoke.mockImplementation((command) => {
    const kind = refuse[command];
    if (kind) return refusal(kind);
    if (command === 'mail_accounts') return Promise.resolve(accounts);
    if (command === 'mail_inbox') return Promise.resolve(MESSAGES);
    if (command === 'mail_previews') return Promise.resolve({});
    if (command === 'mail_message') return Promise.resolve(BODY);
    if (command === 'mail_reply') return Promise.resolve(true);
    if (command === 'mail_send') return Promise.resolve(true);
    // The shell reads the course list at start (CourseSync): the student's courses, as set below.
    if (command === 'ilias_sync_courses') {
      return Promise.resolve(useCourseStore.getState().courses?.items ?? []);
    }
    return Promise.resolve(undefined);
  });
}

beforeEach(() => {
  invoke.mockReset();
  answerLikeRust();
  useIliasStore.setState({
    connection: {
      name: 'Hochschule Heilbronn',
      baseUrl: 'https://ilias.hs-heilbronn.de',
      clientId: 'iliashhn',
      version: '9.23',
      signIn: 'both',
      soap: 'blocked',
      checkedAt: '2026-09-25T10:00:00.000Z',
    },
  });
  useCourseStore.setState({
    installation: 'ilias.hs-heilbronn.de',
    courses: {
      items: [
        {
          refId: '967849',
          providerType: 'crs',
          title: '262058 Datenbanken 1 - WS25',
          description: null,
          area: 'H3 Labor für Softwareentwicklung 1',
          online: true,
          period: null,
          properties: [],
        },
      ],
      loadedAt: '2026-09-25T10:00:00.000Z',
    },
  });
  useMailStore.setState({
    account: null,
    accounts: null,
    messages: null,
    checkedAt: null,
    loading: false,
    failure: null,
    previews: {},
    selectedId: null,
    bodies: {},
    bodyLoading: null,
    bodyFailure: null,
    triage: {},
    view: 'list',
  });
});

afterEach(() => {
  Reflect.deleteProperty(window, '__TAURI_INTERNALS__');
});

const row = (name: string | RegExp) => screen.findByRole('button', { name });
/** The Mail panel: the shell shows it between the rail and the card. It is the message list. */
const panel = () => within(screen.getByRole('complementary', { name: 'Mail' }));
/** The menu of senders and courses, opened from the button beside the search. */
async function filterMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Filter by sender or course' }));
  return within(screen.getByRole('menu', { name: 'Filter by sender or course' }));
}

describe('the inbox', () => {
  it('finds the university account by its address and sums up what is new', async () => {
    pretendDesktop();
    renderApp('/inbox');

    // The header bar names the page; the title stays for screen readers only.
    expect(screen.getByRole('heading', { level: 1, name: 'Inbox' }).parentElement).toHaveClass(
      'sr-only',
    );

    expect(
      await screen.findByRole('heading', { name: '1 unread · 1 from the university' }),
    ).toBeInTheDocument();
    const list = screen.getByRole('region', { name: 'Messages' });
    expect(
      within(list).getByRole('button', {
        name: 'Unread: Datenbanken 1: Blatt 4 ist online, from Prof. Beispiel',
      }),
    ).toBeInTheDocument();
    expect(invoke).toHaveBeenCalledWith('mail_inbox', { account: 'stud.hs-heilbronn.de' });
  });

  /** Mail is busy enough; switching back to the window must not ask it again at once. */
  it('counts a single attachment as one file, before Mail has named it', async () => {
    pretendDesktop();
    renderApp('/inbox');

    const message = await row(/Blatt 4/);
    expect(within(message).getByLabelText('1 attachment')).toHaveTextContent('1 file');
    expect(within(message).getByLabelText('1 attachment')).not.toHaveTextContent('1 files');
  });

  it('does not ask Mail again the moment the window comes back', async () => {
    pretendDesktop();
    renderApp('/inbox');
    await row(/Blatt 4/);

    window.dispatchEvent(new Event('focus'));
    const asked = invoke.mock.calls.filter(([command]) => command === 'mail_inbox');
    expect(asked).toHaveLength(1);
  });

  it('does not ask Mail again when the Inbox is opened again soon after', async () => {
    pretendDesktop();
    const first = renderApp('/inbox');
    await row(/Blatt 4/);
    first.unmount();

    renderApp('/inbox');
    expect(await row(/Blatt 4/)).toBeInTheDocument();
    const asked = (command: string) => invoke.mock.calls.filter(([name]) => name === command);
    expect(asked('mail_inbox')).toHaveLength(1);
    expect(asked('mail_accounts')).toHaveLength(1);
  });

  it('knows which course a message is about', async () => {
    pretendDesktop();
    renderApp('/inbox');

    const message = await row(/Blatt 4 ist online/);
    expect(message).toHaveTextContent('Datenbanken 1');
    const menu = await filterMenu(userEvent.setup());
    expect(menu.getByRole('menuitemradio', { name: 'Datenbanken 1 1' })).not.toBeChecked();
  });

  it('reads a message in the pane and marks it read in Mail', async () => {
    pretendDesktop();
    const user = userEvent.setup();
    renderApp('/inbox');

    await user.click(await row(/Unread: Datenbanken 1: Blatt 4/));
    const pane = await screen.findByRole('article');
    expect(await within(pane).findByText(/Blatt 4 ist jetzt online\./)).toBeInTheDocument();
    expect(
      within(pane).getByRole('heading', { name: 'Datenbanken 1: Blatt 4 ist online' }),
    ).toBeInTheDocument();
    expect(within(pane).getByText('Blatt4.pdf')).toBeInTheDocument();
    expect(within(pane).getByRole('link', { name: /About your course/ })).toHaveAttribute(
      'href',
      '/documents?path=%3Ailias&course=967849',
    );

    const message = { id: 'new@hs-heilbronn.de', mailId: 301 };
    expect(invoke).toHaveBeenCalledWith('mail_message', {
      account: 'stud.hs-heilbronn.de',
      message,
    });
    expect(invoke).toHaveBeenCalledWith('mail_mark_read', {
      account: 'stud.hs-heilbronn.de',
      message,
      read: true,
    });
    expect(await row('Datenbanken 1: Blatt 4 ist online, from Prof. Beispiel')).toBeInTheDocument();
  });

  it('shows a message read before at once, without asking Mail again', async () => {
    pretendDesktop();
    const user = userEvent.setup();
    renderApp('/inbox');

    await user.click(await row(/Blatt 4/));
    await within(await screen.findByRole('article')).findByText(/Blatt 4 ist jetzt online\./);
    await user.click(await row(/Lerngruppe/));
    await user.click(await row(/Blatt 4/));

    const pane = screen.getByRole('article');
    expect(within(pane).getByText(/Blatt 4 ist jetzt online\./)).toBeInTheDocument();
    expect(within(pane).queryByLabelText('Reading the message')).not.toBeInTheDocument();
    const asked = invoke.mock.calls.filter(
      ([command, args]) =>
        command === 'mail_message' && (args.message as { id: string }).id === 'new@hs-heilbronn.de',
    );
    expect(asked).toHaveLength(1);
  });

  it('keeps earlier messages of a thread folded away until asked', async () => {
    pretendDesktop();
    const user = userEvent.setup();
    renderApp('/inbox');

    await user.click(await row(/Blatt 4/));
    const pane = await screen.findByRole('article');
    await within(pane).findByText(/Blatt 4 ist jetzt online\./);
    expect(within(pane).queryByText(/Willkommen\./)).not.toBeInTheDocument();
    await user.click(within(pane).getByRole('button', { name: 'Show earlier messages' }));
    expect(within(pane).getByText(/Willkommen\./)).toBeInTheDocument();
  });

  it('hands a reply to Mail with the text typed here', async () => {
    pretendDesktop();
    const user = userEvent.setup();
    renderApp('/inbox');

    await user.click(await row(/Blatt 4/));
    await user.type(
      await screen.findByRole('textbox', { name: 'Reply to Prof. Beispiel' }),
      'Danke, schaue ich mir an.',
    );
    await user.click(screen.getByRole('button', { name: 'Continue in Mail' }));

    expect(invoke).toHaveBeenCalledWith('mail_reply', {
      account: 'stud.hs-heilbronn.de',
      message: { id: 'new@hs-heilbronn.de', mailId: 301 },
      text: 'Danke, schaue ich mir an.',
    });
    expect(
      await screen.findByText('Your reply is open in Mail. Check it, then press Send there.'),
    ).toBeInTheDocument();
  });

  it('sorts a message and shows it on the board', async () => {
    pretendDesktop();
    const user = userEvent.setup();
    renderApp('/inbox');

    await user.click(await row(/Blatt 4/));
    const sorting = await screen.findByRole('group', { name: 'Sort this message' });
    await user.click(within(sorting).getByRole('button', { name: 'Needs reply' }));
    expect(useMailStore.getState().triage).toEqual({ 'new@hs-heilbronn.de': 'reply' });
    expect(screen.getByRole('heading', { name: /1 to answer/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Board' }));
    const column = screen.getByRole('region', { name: 'Needs reply' });
    expect(within(column).getByRole('button', { name: /Blatt 4/ })).toBeInTheDocument();
  });

  it('filters by who wrote from the panel, and searches', async () => {
    pretendDesktop();
    const user = userEvent.setup();
    renderApp('/inbox');

    await row(/Blatt 4/);
    await user.click((await filterMenu(user)).getByRole('menuitemradio', { name: 'ILIAS 1' }));
    const list = screen.getByRole('region', { name: 'Messages' });
    expect(within(list).getAllByRole('button')).toHaveLength(1);
    expect(within(list).getByRole('button', { name: /Neue Datei/ })).toBeInTheDocument();
    expect((await filterMenu(user)).getByRole('menuitemradio', { name: 'ILIAS 1' })).toBeChecked();
    await user.keyboard('{Escape}');

    await user.click(panel().getByRole('button', { name: 'All mail' }));
    await user.type(screen.getByRole('searchbox', { name: 'Search mail' }), 'lerngruppe');
    expect(within(list).getAllByRole('button')).toHaveLength(1);
  });

  it('clears a search and restores the message list', async () => {
    pretendDesktop();
    const user = userEvent.setup();
    renderApp('/inbox');
    await row(/Blatt 4/);
    await user.type(screen.getByRole('searchbox', { name: 'Search mail' }), 'not in this inbox');
    expect(screen.getByText('Nothing here with this filter.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(
      within(screen.getByRole('region', { name: 'Messages' })).getAllByRole('button'),
    ).toHaveLength(3);
    expect(screen.getByRole('searchbox', { name: 'Search mail' })).toHaveValue('');
  });

  describe('the Mail panel', () => {
    const messages = () => within(screen.getByRole('region', { name: 'Messages' }));

    it('is the inbox: views, the messages, and senders and courses with their counts', async () => {
      pretendDesktop();
      const user = userEvent.setup();
      renderApp('/inbox');
      await row(/Blatt 4/);

      const mail = panel();
      expect(screen.getByRole('complementary', { name: 'Mail' })).toBeVisible();
      // Accounts: iCloud and the university's. Mail's title is the switcher.
      expect(mail.getByRole('heading', { level: 2 })).toHaveTextContent('Mail');
      expect(mail.getByRole('region', { name: 'Messages' })).toBeVisible();
      expect(mail.getByRole('button', { name: 'All mail' })).toHaveAttribute(
        'aria-current',
        'true',
      );
      expect(mail.getByRole('button', { name: 'Unread 1' })).toBeVisible();
      // Nothing is sorted "to answer" yet: no number, but the view stays.
      expect(mail.getByRole('button', { name: 'To answer' })).toBeVisible();
      const menu = await filterMenu(user);
      const senders = menu.getByRole('group', { name: 'Senders' });
      expect(within(senders).getByRole('menuitemradio', { name: 'University 1' })).toBeVisible();
      expect(within(senders).getByRole('menuitemradio', { name: 'ILIAS 1' })).toBeVisible();
      expect(within(senders).getByRole('menuitemradio', { name: 'Students 1' })).toBeVisible();
      const courses = menu.getByRole('group', { name: 'Courses' });
      expect(within(courses).getByRole('menuitemradio', { name: 'Datenbanken 1 1' })).toBeVisible();
    });

    it('shows only what is unread, and only what is to answer once sorted', async () => {
      pretendDesktop();
      const user = userEvent.setup();
      renderApp('/inbox');
      await row(/Blatt 4/);

      await user.click(panel().getByRole('button', { name: 'Unread 1' }));
      expect(messages().getAllByRole('button')).toHaveLength(1);
      expect(panel().getByRole('button', { name: 'Unread 1' })).toHaveAttribute(
        'aria-current',
        'true',
      );
      expect(panel().getByRole('button', { name: 'All mail' })).not.toHaveAttribute('aria-current');

      await user.click(panel().getByRole('button', { name: 'All mail' }));
      await user.click(await row(/Lerngruppe/));
      await user.click(
        within(await screen.findByRole('group', { name: 'Sort this message' })).getByRole(
          'button',
          { name: 'Needs reply' },
        ),
      );
      await user.click(panel().getByRole('button', { name: 'To answer 1' }));
      expect(messages().getAllByRole('button')).toHaveLength(1);
      expect(messages().getByRole('button', { name: /Lerngruppe/ })).toBeInTheDocument();
    });

    it('filters by course, says so above the list, and lets that be cleared', async () => {
      pretendDesktop();
      const user = userEvent.setup();
      renderApp('/inbox');
      await row(/Blatt 4/);

      expect(screen.queryByRole('button', { name: /^Clear filter/ })).not.toBeInTheDocument();
      await user.click(
        (await filterMenu(user)).getByRole('menuitemradio', { name: 'Datenbanken 1 1' }),
      );
      expect(messages().getAllByRole('button')).toHaveLength(1);
      expect(panel().getByRole('button', { name: 'All mail' })).not.toHaveAttribute('aria-current');

      await user.click(screen.getByRole('button', { name: 'Clear filter: Datenbanken 1' }));
      expect(messages().getAllByRole('button')).toHaveLength(3);
      expect(panel().getByRole('button', { name: 'All mail' })).toHaveAttribute(
        'aria-current',
        'true',
      );
      expect(screen.queryByRole('button', { name: /^Clear filter/ })).not.toBeInTheDocument();
    });

    it('keeps the filter, visible and clearable, while the panel is hidden', async () => {
      pretendDesktop();
      const user = userEvent.setup();
      renderApp('/inbox');
      await row(/Blatt 4/);

      await user.click(panel().getByRole('button', { name: 'Unread 1' }));
      await user.click(screen.getByRole('button', { name: 'Hide sidebar' }));
      expect(screen.queryByRole('complementary', { name: 'Mail' })).not.toBeInTheDocument();
      // The list moves into the card, with the views, still filtered.
      expect(messages().getAllByRole('button')).toHaveLength(1);
      expect(screen.getByRole('button', { name: 'Unread 1' })).toHaveAttribute(
        'aria-current',
        'true',
      );

      await user.click(screen.getByRole('button', { name: 'All mail' }));
      expect(messages().getAllByRole('button')).toHaveLength(3);

      // The panel comes back showing what the card is showing.
      await user.click(screen.getByRole('button', { name: 'Show sidebar' }));
      expect(panel().getByRole('button', { name: 'All mail' })).toHaveAttribute(
        'aria-current',
        'true',
      );
    });

    it('writes a new message, from the panel only', async () => {
      pretendDesktop();
      const user = userEvent.setup();
      renderApp('/inbox');
      await row(/Blatt 4/);

      const compose = screen.getAllByRole('button', { name: 'New message' });
      expect(compose).toHaveLength(1);
      expect(panel().getByRole('button', { name: 'New message' })).toBe(compose[0]);

      await user.click(compose[0]!);
      expect(screen.getByRole('dialog', { name: 'New message' })).toBeVisible();
    });

    it('asks Mail again from the panel, and waits while it is asked', async () => {
      pretendDesktop();
      const user = userEvent.setup();
      renderApp('/inbox');
      await row(/Blatt 4/);
      const asked = () => invoke.mock.calls.filter(([command]) => command === 'mail_inbox').length;
      expect(asked()).toBe(1);

      let answer: (messages: unknown) => void = () => undefined;
      const listed = invoke.getMockImplementation()!;
      invoke.mockImplementation((command, args) =>
        command === 'mail_inbox'
          ? new Promise((resolve) => {
              answer = resolve;
            })
          : listed(command, args),
      );
      const refresh = screen.getAllByRole('button', { name: 'Refresh' });
      expect(refresh).toHaveLength(1);
      expect(refresh[0]).toBe(panel().getByRole('button', { name: 'Refresh' }));

      await user.click(refresh[0]!);
      expect(asked()).toBe(2);
      expect(refresh[0]).toBeDisabled();
      await act(() => {
        answer(MESSAGES);
        return Promise.resolve();
      });
      expect(refresh[0]).toBeEnabled();
    });

    describe('with the panel hidden', () => {
      const hidePanel = async (user: ReturnType<typeof userEvent.setup>) => {
        await user.click(screen.getByRole('button', { name: 'Hide sidebar' }));
        expect(screen.queryByRole('complementary', { name: 'Mail' })).not.toBeInTheDocument();
      };

      it('moves the account, Refresh and New message into the card, once each', async () => {
        pretendDesktop();
        const user = userEvent.setup();
        renderApp('/inbox');
        await row(/Blatt 4/);
        // Shown, the panel has them: the card does not repeat them.
        expect(
          screen.queryByRole('button', { name: 'stud.hs-heilbronn.de' }),
        ).not.toBeInTheDocument();

        await hidePanel(user);
        expect(screen.getAllByRole('button', { name: 'New message' })).toHaveLength(1);
        expect(screen.getAllByRole('button', { name: 'Refresh' })).toHaveLength(1);
        expect(screen.getAllByRole('button', { name: 'stud.hs-heilbronn.de' })).toHaveLength(1);

        await user.click(screen.getByRole('button', { name: 'Show sidebar' }));
        expect(panel().getByRole('button', { name: 'New message' })).toBeVisible();
        expect(panel().getByRole('button', { name: 'Refresh' })).toBeVisible();
        expect(screen.getAllByRole('button', { name: 'New message' })).toHaveLength(1);
        expect(screen.getAllByRole('button', { name: 'Refresh' })).toHaveLength(1);
        expect(
          screen.queryByRole('button', { name: 'stud.hs-heilbronn.de' }),
        ).not.toBeInTheDocument();
      });

      it('writes a new message from the card', async () => {
        pretendDesktop();
        const user = userEvent.setup();
        renderApp('/inbox');
        await row(/Blatt 4/);
        await hidePanel(user);

        await user.click(screen.getByRole('button', { name: 'New message' }));
        expect(screen.getByRole('dialog', { name: 'New message' })).toBeVisible();
      });

      it('asks Mail again from the card, and waits while it is asked', async () => {
        pretendDesktop();
        const user = userEvent.setup();
        renderApp('/inbox');
        await row(/Blatt 4/);
        await hidePanel(user);
        const asked = () =>
          invoke.mock.calls.filter(([command]) => command === 'mail_inbox').length;
        expect(asked()).toBe(1);

        let answer: (messages: unknown) => void = () => undefined;
        const listed = invoke.getMockImplementation()!;
        invoke.mockImplementation((command, args) =>
          command === 'mail_inbox'
            ? new Promise((resolve) => {
                answer = resolve;
              })
            : listed(command, args),
        );
        const refresh = screen.getByRole('button', { name: 'Refresh' });

        await user.click(refresh);
        expect(asked()).toBe(2);
        expect(refresh).toBeDisabled();
        await act(() => {
          answer(MESSAGES);
          return Promise.resolve();
        });
        expect(refresh).toBeEnabled();
      });

      it('reads another of Mail’s accounts from the card and starts that inbox unfiltered', async () => {
        pretendDesktop();
        const user = userEvent.setup();
        renderApp('/inbox');
        await row(/Blatt 4/);
        await user.click(panel().getByRole('button', { name: 'Unread 1' }));
        await hidePanel(user);

        const account = screen.getByRole('button', { name: 'stud.hs-heilbronn.de' });
        expect(account).toHaveAttribute('aria-haspopup', 'menu');
        // The card's heading is the inbox's; the switcher brings no heading of its own.
        expect(screen.queryByRole('heading', { name: 'Mail' })).not.toBeInTheDocument();
        await user.click(account);
        const menu = screen.getByRole('menu', { name: 'Mail accounts' });
        expect(
          within(menu).getByRole('menuitemradio', { name: 'stud.hs-heilbronn.de' }),
        ).toBeChecked();

        await user.click(within(menu).getByRole('menuitemradio', { name: 'iCloud' }));
        expect(invoke).toHaveBeenCalledWith('mail_inbox', { account: 'iCloud' });
        expect(useMailStore.getState().account).toBe('iCloud');
        expect(await screen.findByRole('button', { name: 'iCloud' })).toBeVisible();
        expect(screen.queryByRole('button', { name: /^Clear filter/ })).not.toBeInTheDocument();
      });

      it('leaves the account out when Mail has only one', async () => {
        pretendDesktop();
        const user = userEvent.setup();
        answerLikeRust({}, [ACCOUNTS[1]!]);
        renderApp('/inbox');
        await row(/Blatt 4/);
        await hidePanel(user);

        expect(screen.getByRole('button', { name: 'New message' })).toBeVisible();
        expect(screen.queryByRole('button', { name: 'Switch account' })).not.toBeInTheDocument();
        expect(
          screen.queryByRole('button', { name: 'stud.hs-heilbronn.de' }),
        ).not.toBeInTheDocument();
      });
    });

    it('leaves the card the open message, with the heading and the view toggle', async () => {
      pretendDesktop();
      const user = userEvent.setup();
      renderApp('/inbox');
      await row(/Blatt 4/);
      const card = within(screen.getByRole('main'));

      // The list, its search and its views are the panel, and only there.
      expect(card.queryByRole('region', { name: 'Messages' })).not.toBeInTheDocument();
      expect(card.queryByRole('searchbox', { name: 'Search mail' })).not.toBeInTheDocument();
      expect(card.queryByRole('group', { name: 'Show' })).not.toBeInTheDocument();
      expect(screen.getAllByRole('searchbox', { name: 'Search mail' })).toHaveLength(1);
      expect(card.getByRole('group', { name: 'View' })).toBeVisible();
      expect(card.getByRole('heading', { name: /1 unread/ })).toBeVisible();

      await user.click(panel().getByRole('button', { name: /Blatt 4/ }));
      expect(await card.findByRole('group', { name: 'Sort this message' })).toBeVisible();
    });

    it('leads to the mail settings', async () => {
      pretendDesktop();
      renderApp('/inbox');
      await row(/Blatt 4/);

      expect(panel().getByRole('link', { name: 'Mail settings' })).toHaveAttribute(
        'href',
        '/settings?section=mail',
      );
    });
  });

  describe('the account switcher', () => {
    it('is only the title when Mail has one account', async () => {
      pretendDesktop();
      answerLikeRust({}, [ACCOUNTS[1]!]);
      renderApp('/inbox');
      await row(/Blatt 4/);

      expect(
        within(screen.getByRole('complementary', { name: 'Mail' })).getByRole('heading', {
          name: 'Mail',
        }),
      ).toBeVisible();
      expect(screen.queryByRole('button', { name: 'Mail' })).not.toBeInTheDocument();
    });

    it('reads another of Mail’s accounts and starts that inbox unfiltered', async () => {
      pretendDesktop();
      const user = userEvent.setup();
      renderApp('/inbox');
      await row(/Blatt 4/);
      await user.click(panel().getByRole('button', { name: 'Unread 1' }));

      const title = panel().getByRole('button', { name: 'Mail' });
      expect(title).toHaveAttribute('aria-haspopup', 'menu');
      expect(title).toHaveAttribute('aria-expanded', 'false');
      await user.click(title);
      const menu = screen.getByRole('menu', { name: 'Mail accounts' });
      expect(
        within(menu).getByRole('menuitemradio', { name: 'stud.hs-heilbronn.de' }),
      ).toBeChecked();
      expect(within(menu).getByRole('menuitemradio', { name: 'iCloud' })).not.toBeChecked();

      await user.click(within(menu).getByRole('menuitemradio', { name: 'iCloud' }));
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      expect(invoke).toHaveBeenCalledWith('mail_inbox', { account: 'iCloud' });
      expect(useMailStore.getState().account).toBe('iCloud');
      await row(/Blatt 4/);
      expect(screen.queryByRole('button', { name: /^Clear filter/ })).not.toBeInTheDocument();
      expect(
        within(screen.getByRole('region', { name: 'Messages' })).getAllByRole('button'),
      ).toHaveLength(3);
    });

    it('closes with Escape and gives the focus back, and stays put on the account it has', async () => {
      pretendDesktop();
      const user = userEvent.setup();
      renderApp('/inbox');
      await row(/Blatt 4/);

      const title = panel().getByRole('button', { name: 'Mail' });
      await user.click(title);
      expect(screen.getByRole('menuitemradio', { name: 'stud.hs-heilbronn.de' })).toHaveFocus();
      await user.keyboard('{ArrowUp}');
      expect(screen.getByRole('menuitemradio', { name: 'iCloud' })).toHaveFocus();
      await user.keyboard('{Escape}');
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      expect(title).toHaveFocus();

      await user.click(title);
      await user.click(screen.getByRole('menuitemradio', { name: 'stud.hs-heilbronn.de' }));
      expect(invoke.mock.calls.filter(([command]) => command === 'mail_inbox')).toHaveLength(1);
    });
  });

  it('starts a different message with a fresh reply and folded quote', async () => {
    pretendDesktop();
    const user = userEvent.setup();
    renderApp('/inbox');
    await user.click(await row(/Blatt 4/));
    await user.type(
      await screen.findByRole('textbox', { name: 'Reply to Prof. Beispiel' }),
      'A reply for this message only.',
    );
    await user.click(screen.getByRole('button', { name: 'Show earlier messages' }));
    await user.click(await row(/Lerngruppe/));
    expect(await screen.findByRole('textbox', { name: 'Reply to Prof. Beispiel' })).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Show earlier messages' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('hands a new message to Mail as a draft from the university address', async () => {
    pretendDesktop();
    const user = userEvent.setup();
    renderApp('/inbox');

    await user.click(await screen.findByRole('button', { name: 'New message' }));
    const dialog = screen.getByRole('dialog', { name: 'New message' });
    expect(dialog).toHaveTextContent('From student@stud.hs-heilbronn.de');
    await user.type(within(dialog).getByLabelText('To'), 'prof@hs-heilbronn.de');
    await user.type(within(dialog).getByLabelText('Subject'), 'Frage zu Blatt 4');
    await user.type(within(dialog).getByLabelText('Message'), 'Guten Tag,');
    await user.click(screen.getByRole('button', { name: 'Open draft in Mail' }));

    expect(invoke).toHaveBeenCalledWith('mail_compose', {
      draft: {
        from: 'student@stud.hs-heilbronn.de',
        to: ['prof@hs-heilbronn.de'],
        subject: 'Frage zu Blatt 4',
        body: 'Guten Tag,',
      },
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('sends a new message through Mail once the student confirms it', async () => {
    pretendDesktop();
    const user = userEvent.setup();
    renderApp('/inbox');

    await user.click(await screen.findByRole('button', { name: 'New message' }));
    const dialog = screen.getByRole('dialog', { name: 'New message' });
    expect(screen.getByRole('button', { name: 'Send email' })).toBeDisabled();
    await user.type(within(dialog).getByLabelText('To'), 'prof@hs-heilbronn.de');
    await user.type(within(dialog).getByLabelText('Subject'), 'Frage zu Blatt 4');
    await user.type(within(dialog).getByLabelText('Message'), 'Guten Tag,');
    await user.click(screen.getByRole('button', { name: 'Send email' }));

    expect(dialog).toHaveTextContent(
      'Send to prof@hs-heilbronn.de now? Apple Mail sends it from student@stud.hs-heilbronn.de right away.',
    );
    expect(within(dialog).getByLabelText('Message')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Send now' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(within(dialog).getByLabelText('Message')).toBeEnabled();
    expect(invoke).not.toHaveBeenCalledWith('mail_send', expect.anything());

    await user.click(screen.getByRole('button', { name: 'Send email' }));
    await user.click(screen.getByRole('button', { name: 'Send now' }));

    expect(invoke).toHaveBeenCalledWith('mail_send', {
      draft: {
        from: 'student@stud.hs-heilbronn.de',
        to: ['prof@hs-heilbronn.de'],
        subject: 'Frage zu Blatt 4',
        body: 'Guten Tag,',
      },
    });
    expect(invoke).not.toHaveBeenCalledWith('mail_compose', expect.anything());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('says so when Mail did not send the message, and leaves it there as a draft', async () => {
    pretendDesktop();
    const listed = invoke.getMockImplementation()!;
    invoke.mockImplementation((command, args) =>
      command === 'mail_send' ? Promise.resolve(false) : listed(command, args),
    );
    const user = userEvent.setup();
    renderApp('/inbox');

    await user.click(await screen.findByRole('button', { name: 'New message' }));
    const dialog = screen.getByRole('dialog', { name: 'New message' });
    await user.type(within(dialog).getByLabelText('To'), 'prof@hs-heilbronn.de');
    await user.click(screen.getByRole('button', { name: 'Send email' }));
    expect(dialog).toHaveTextContent('It has no subject.');
    await user.click(screen.getByRole('button', { name: 'Send now' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Apple Mail did not send it. It is open in Mail as a draft',
    );
    expect(screen.queryByRole('button', { name: /Send/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('warns that a message may have gone out when Mail stopped answering', async () => {
    pretendDesktop();
    answerLikeRust({ mail_send: 'failed' });
    const user = userEvent.setup();
    renderApp('/inbox');

    await user.click(await screen.findByRole('button', { name: 'New message' }));
    const dialog = screen.getByRole('dialog', { name: 'New message' });
    await user.type(within(dialog).getByLabelText('To'), 'prof@hs-heilbronn.de');
    await user.click(screen.getByRole('button', { name: 'Send email' }));
    await user.click(screen.getByRole('button', { name: 'Send now' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'It may have gone out anyway: look in Sent in Mail before sending it again.',
    );
    expect(within(dialog).getByLabelText('To')).toBeEnabled();
  });

  it('asks which account to read when none has a university address', async () => {
    pretendDesktop();
    answerLikeRust({}, [{ name: 'Gmail', addresses: ['me@gmail.com'] }]);
    const user = userEvent.setup();
    renderApp('/inbox');

    const choice = await screen.findByRole('button', { name: 'Gmail · me@gmail.com' });
    expect(screen.queryByRole('complementary', { name: 'Mail' })).not.toBeInTheDocument();
    await user.click(choice);
    expect(await screen.findByRole('region', { name: 'Messages' })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Mail' })).toBeVisible();
    expect(invoke).toHaveBeenCalledWith('mail_inbox', { account: 'Gmail' });
  });
});

describe('when Mail cannot help', () => {
  it('sends a browser tab to the desktop app', () => {
    renderApp('/inbox');
    expect(
      screen.getByRole('heading', { name: 'Your mail comes through the desktop app' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: 'Mail' })).not.toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalledWith('mail_accounts', expect.anything());
  });

  it('explains how to allow Uni Pilot to ask Mail', async () => {
    pretendDesktop();
    answerLikeRust({ mail_accounts: 'notAllowed' });
    renderApp('/inbox');
    expect(
      await screen.findByRole('heading', { name: 'Allow Uni Pilot to ask Apple Mail' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: 'Mail' })).not.toBeInTheDocument();
  });

  it('offers to open Mail rather than starting it unasked', async () => {
    pretendDesktop();
    answerLikeRust({ mail_accounts: 'notRunning' });
    const user = userEvent.setup();
    renderApp('/inbox');

    await user.click(await screen.findByRole('button', { name: 'Open Mail' }));
    expect(invoke).toHaveBeenCalledWith('mail_launch', {});
  });
});
