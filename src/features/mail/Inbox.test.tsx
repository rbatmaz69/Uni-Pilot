/**
 * The Inbox across the shell: the university account found by its address,
 * messages sorted by sender and course, a message read in the pane and marked
 * read in Mail, a reply handed to Mail as a draft, triage and the board — and
 * what the page says when Mail cannot help. Rust and Mail are a stand-in
 * answering like `apple_mail.rs` does.
 */

import { screen, within } from '@testing-library/react';
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
    expect(screen.getByRole('button', { name: /Datenbanken 1\s*1/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
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
      '/courses?course=967849',
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

  it('filters by who wrote, and searches', async () => {
    pretendDesktop();
    const user = userEvent.setup();
    renderApp('/inbox');

    await row(/Blatt 4/);
    const chips = screen.getByRole('group', { name: 'Show' });
    await user.click(within(chips).getByRole('button', { name: /^ILIAS/ }));
    const list = screen.getByRole('region', { name: 'Messages' });
    expect(within(list).getAllByRole('button')).toHaveLength(1);
    expect(within(list).getByRole('button', { name: /Neue Datei/ })).toBeInTheDocument();

    await user.click(within(chips).getByRole('button', { name: 'All' }));
    await user.type(screen.getByRole('searchbox', { name: 'Search mail' }), 'lerngruppe');
    expect(within(list).getAllByRole('button')).toHaveLength(1);
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

  it('asks which account to read when none has a university address', async () => {
    pretendDesktop();
    answerLikeRust({}, [{ name: 'Gmail', addresses: ['me@gmail.com'] }]);
    const user = userEvent.setup();
    renderApp('/inbox');

    await user.click(await screen.findByRole('button', { name: 'Gmail · me@gmail.com' }));
    expect(await screen.findByRole('region', { name: 'Messages' })).toBeInTheDocument();
    expect(invoke).toHaveBeenCalledWith('mail_inbox', { account: 'Gmail' });
  });
});

describe('when Mail cannot help', () => {
  it('sends a browser tab to the desktop app', () => {
    renderApp('/inbox');
    expect(
      screen.getByRole('heading', { name: 'Your mail comes through the desktop app' }),
    ).toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalledWith('mail_accounts', expect.anything());
  });

  it('explains how to allow Uni Pilot to ask Mail', async () => {
    pretendDesktop();
    answerLikeRust({ mail_accounts: 'notAllowed' });
    renderApp('/inbox');
    expect(
      await screen.findByRole('heading', { name: 'Allow Uni Pilot to ask Apple Mail' }),
    ).toBeInTheDocument();
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
