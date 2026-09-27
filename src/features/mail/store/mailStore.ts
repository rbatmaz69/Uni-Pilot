/**
 * The Inbox: which Mail account is the university's, its newest messages, the
 * one the student opened, and how the student sorted them.
 *
 * Kept on this computer: the account's name, the view (list or board), and
 * the triage — "needs reply", "waiting", "done" — by Message-ID. Not kept:
 * any message. The list and the text of an opened message stay in Apple Mail
 * and are asked for again; a second copy of anyone's mail gains nothing.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  listMailAccounts,
  markRead,
  readInbox,
  readMessage,
  readPreviews,
  toMailFailure,
  type MailAccount,
  type MailBody,
  type MailFailure,
  type MailMessage,
} from '@/features/mail/lib/appleMail';
import { universityAccount, type TriageState } from '@/features/mail/lib/mail';

export type InboxView = 'list' | 'board';

/** Previews asked for at once — Mail fetches each text, so a few at a time. */
const PREVIEW_BATCH = 25;

interface MailState {
  /** The Mail account the Inbox reads, by name. Kept. */
  account: string | null;
  accounts: MailAccount[] | null;
  messages: MailMessage[] | null;
  /** ISO 8601, when Mail was last asked. */
  checkedAt: string | null;
  loading: boolean;
  failure: MailFailure | null;

  /** The message open in the reading pane. */
  selectedId: string | null;
  /** Texts of opened messages, this session only. */
  bodies: Record<string, MailBody>;
  bodyLoading: string | null;
  bodyFailure: MailFailure | null;

  /** How the student sorted messages, by Message-ID. Kept. */
  triage: Record<string, TriageState>;
  view: InboxView;

  /**
   * Asks Mail for its accounts and the chosen one's inbox. Without a choice
   * yet, takes the account with an address at `domain` — the university's.
   */
  refresh: (domain: string | null) => Promise<void>;
  /** Fills in previews for the newest listed messages, after the list is up. */
  loadPreviews: () => Promise<void>;
  chooseAccount: (name: string | null) => void;
  /** Opens a message in the reading pane; Mail marks it read, as it would. */
  select: (id: string | null) => Promise<void>;
  setRead: (id: string, read: boolean) => Promise<void>;
  setTriage: (id: string, state: TriageState | null) => void;
  setView: (view: InboxView) => void;
}

export const useMailStore = create<MailState>()(
  persist(
    (set, get) => {
      /** The list follows Mail at once, without asking again. */
      const noteRead = (id: string, read: boolean) =>
        set((state) => ({
          messages:
            state.messages?.map((message) =>
              message.id === id ? { ...message, read } : message,
            ) ?? null,
          bodies: state.bodies[id]
            ? { ...state.bodies, [id]: { ...state.bodies[id], read } }
            : state.bodies,
        }));

      return {
        account: null,
        accounts: null,
        messages: null,
        checkedAt: null,
        loading: false,
        failure: null,
        selectedId: null,
        bodies: {},
        bodyLoading: null,
        bodyFailure: null,
        triage: {},
        view: 'list',

        refresh: async (domain) => {
          if (get().loading) return;
          set({ loading: true });
          try {
            const accounts = await listMailAccounts();
            const chosen = accounts.find((known) => known.name === get().account);
            const account = chosen ?? universityAccount(accounts, domain);
            set({ accounts, account: account?.name ?? null });
            const messages = account ? await readInbox(account.name) : null;
            set((state) => ({
              // A refresh keeps previews already fetched for messages still listed.
              messages:
                messages?.map((message) => {
                  const known = state.messages?.find((old) => old.id === message.id);
                  return known?.snippet
                    ? { ...message, snippet: known.snippet, attachments: known.attachments }
                    : message;
                }) ?? null,
              checkedAt: new Date().toISOString(),
              failure: null,
            }));
            void get().loadPreviews();
          } catch (cause) {
            set({ failure: toMailFailure(cause) });
          } finally {
            set({ loading: false });
          }
        },

        loadPreviews: async () => {
          const { account, messages } = get();
          const ids = (messages ?? [])
            .filter((message) => !message.snippet)
            .slice(0, PREVIEW_BATCH)
            .map((message) => message.id);
          if (!account || ids.length === 0) return;
          try {
            const previews = await readPreviews(account, ids);
            set((state) => ({
              messages:
                state.messages?.map((message) =>
                  previews[message.id] ? { ...message, ...previews[message.id] } : message,
                ) ?? null,
            }));
          } catch {
            // A preview is a nicety; the list stands without it.
          }
        },

        chooseAccount: (name) =>
          set({ account: name, messages: null, checkedAt: null, selectedId: null, bodies: {} }),

        select: async (id) => {
          set({ selectedId: id, bodyFailure: null });
          const account = get().account;
          if (!id || !account) return;

          if (!get().bodies[id]) {
            set({ bodyLoading: id });
            try {
              const body = await readMessage(account, id);
              set((state) => ({ bodies: { ...state.bodies, [id]: body } }));
            } catch (cause) {
              set({ bodyFailure: toMailFailure(cause) });
              return;
            } finally {
              set((state) => ({
                bodyLoading: state.bodyLoading === id ? null : state.bodyLoading,
              }));
            }
          }

          const listed = get().messages?.find((message) => message.id === id);
          if (listed && !listed.read) await get().setRead(id, true);
        },

        setRead: async (id, read) => {
          const account = get().account;
          if (!account) return;
          try {
            await markRead(account, id, read);
            noteRead(id, read);
          } catch (cause) {
            set({ bodyFailure: toMailFailure(cause) });
          }
        },

        setTriage: (id, state) =>
          set((current) => {
            const triage = { ...current.triage };
            if (state) triage[id] = state;
            else delete triage[id];
            return { triage };
          }),

        setView: (view) => set({ view }),
      };
    },
    {
      name: 'uni-pilot.mail',
      version: 2,
      partialize: (state) => ({
        account: state.account,
        triage: state.triage,
        view: state.view,
      }),
      // Version 1 kept the account only; it stays, and sorting starts empty.
      migrate: (persisted) => ({
        account: (persisted as { account?: string | null } | null)?.account ?? null,
        triage: {},
        view: 'list' as const,
      }),
    },
  ),
);
