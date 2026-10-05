/**
 * The Inbox: which Mail account is the university's, its newest messages, the
 * one the student opened, and how the student sorted them.
 *
 * Kept on this computer: the account's name, the view (list or board), the
 * triage — "needs reply", "waiting", "done" — by Message-ID, and, unless the
 * student turned it off, an encrypted copy of the list and of the newest
 * texts (`lib/mailCache.ts`). At start that copy is shown at once, and Mail is
 * asked for what is new behind it.
 *
 * Mail answers one question at a time, so the store asks as little as it can:
 * the accounts once a session, a message's text once, previews a few at a
 * time, the newest texts after them — and none of it ahead of a message the
 * student is opening or sending.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  listMailAccounts,
  markRead,
  readInbox,
  readMessage,
  readPreviews,
  sendWithMail,
  toMailFailure,
  type MailAccount,
  type MailBody,
  type MailDraft,
  type MailFailure,
  type MailMessage,
  type MailPreview,
  type MessageRef,
} from '@/features/mail/lib/appleMail';
import {
  cacheOf,
  clearMailCache,
  previewsOf,
  readMailCache,
  textsToFetch,
  writeMailCache,
} from '@/features/mail/lib/mailCache';
import { universityAccount, type TriageState } from '@/features/mail/lib/mail';

export type InboxView = 'list' | 'board';

/**
 * Previews asked for at once. Mail fetches each text, and a message the
 * student opens waits behind whatever Mail is doing — so a few at a time,
 * with the student's click let in between.
 */
const PREVIEW_CHUNK = 5;
/** How long changes gather before the copy on this Mac is written again. */
const SAVE_DELAY_MS = 1500;

interface MailState {
  /** The Mail account the Inbox reads, by name. Kept. */
  account: string | null;
  /** Mail's accounts, asked for once a session. */
  accounts: MailAccount[] | null;
  messages: MailMessage[] | null;
  /** ISO 8601, when Mail was last asked. */
  checkedAt: string | null;
  loading: boolean;
  failure: MailFailure | null;

  /**
   * Previews Mail gave this session, by Message-ID — empty ones too, so a
   * message without text is not asked about again.
   */
  previews: Record<string, MailPreview>;

  /** The message open in the reading pane. */
  selectedId: string | null;
  /** Texts of messages: opened, fetched ahead for the newest, or kept from last time. */
  bodies: Record<string, MailBody>;
  bodyLoading: string | null;
  bodyFailure: MailFailure | null;

  /** How the student sorted messages, by Message-ID. Kept. */
  triage: Record<string, TriageState>;
  view: InboxView;
  /** Whether the list and the newest texts are kept on this Mac. Kept. */
  keepOnMac: boolean;
  /** A message on its way to Mail to be sent; everything else waits. */
  sending: boolean;

  /**
   * Asks Mail for the chosen account's inbox. Without a choice yet, takes the
   * account with an address at `domain` — the university's.
   */
  refresh: (domain: string | null) => Promise<void>;
  /**
   * Finds the account to send from, as `refresh` would, without reading its
   * inbox — for a message written away from the Inbox.
   */
  findAccount: (domain: string | null) => Promise<void>;
  /** Fills in previews for listed messages, a few at a time, after the list is up. */
  loadPreviews: () => Promise<void>;
  chooseAccount: (name: string | null) => void;
  /** Opens a message in the reading pane; Mail marks it read, as it would. */
  select: (id: string | null) => Promise<void>;
  setRead: (id: string, read: boolean) => Promise<void>;
  setTriage: (id: string, state: TriageState | null) => void;
  setView: (view: InboxView) => void;
  /** Turning it off deletes the copy at once. */
  setKeepOnMac: (keep: boolean) => void;
  /** Has Mail send a message the student confirmed; answers whether Mail took it. */
  send: (draft: MailDraft) => Promise<boolean>;
}

const withPreview = (message: MailMessage, previews: Record<string, MailPreview>) => {
  const preview = previews[message.id];
  return preview ? { ...message, ...preview } : message;
};

export const useMailStore = create<MailState>()(
  persist(
    (set, get, api) => {
      /** Texts on their way from Mail, so a second click waits for the first. */
      const opening = new Map<string, Promise<MailBody>>();
      /** Whether previews are being fetched; one run at a time. */
      let previewing = false;
      /** Whether the newest texts are being fetched; one run at a time. */
      let fetchingTexts = false;
      /** Texts asked for ahead this session — each once, whatever Mail answered. */
      const fetchedAhead = new Set<string>();
      let saveTimer: ReturnType<typeof setTimeout> | undefined;

      /** How to find a listed message again: with Mail's own number, if the list has it. */
      const refOf = (id: string): MessageRef => ({
        id,
        mailId: get().messages?.find((message) => message.id === id)?.mailId ?? null,
      });

      /** The list follows at once; Mail catches up. */
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

      /**
       * Resolves once Mail is free of what the student asked for — opening a
       * message, sending one — so background work goes after it.
       */
      const studentServed = () =>
        new Promise<void>((resolve) => {
          const busy = (state: MailState) => state.bodyLoading !== null || state.sending;
          if (!busy(get())) {
            resolve();
            return;
          }
          const stop = api.subscribe((state) => {
            if (busy(state)) return;
            stop();
            resolve();
          });
        });

      /** Shows the copy kept last time while Mail is asked — until Mail has answered. */
      const restore = async () => {
        if (!get().keepOnMac) return;
        const cache = await readMailCache();
        const { account, messages } = get();
        // Mail answered first, or this copy is another account's.
        if (!cache || messages !== null || cache.account !== account) return;
        set({
          messages: cache.messages,
          previews: previewsOf(cache.messages),
          bodies: Object.fromEntries(cache.bodies.map((body) => [body.id, body])),
        });
      };

      /** Writes the copy once changes have settled — only what Mail said this session. */
      const saveSoon = () => {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
          const { account, messages, bodies, checkedAt, keepOnMac } = get();
          if (!keepOnMac || !account || !messages || checkedAt === null) return;
          void writeMailCache(cacheOf(account, messages, bodies));
        }, SAVE_DELAY_MS);
      };
      api.subscribe((state, before) => {
        if (state.messages !== before.messages || state.bodies !== before.bodies) saveSoon();
      });

      /**
       * Fetches the newest texts ahead, one at a time, after the previews: a
       * click on one of them then opens it at once. A message the student opens
       * meanwhile goes first; one being fetched here is not fetched twice.
       */
      const loadTexts = async () => {
        if (fetchingTexts || !get().keepOnMac) return;
        fetchingTexts = true;
        try {
          for (;;) {
            await studentServed();
            const { account, messages, bodies } = get();
            const [next] = textsToFetch(messages ?? [], bodies).filter(
              (message) => !fetchedAhead.has(message.id),
            );
            if (!account || !next) return;
            fetchedAhead.add(next.id);
            let pending = opening.get(next.id);
            if (!pending) {
              pending = readMessage(account, refOf(next.id)).finally(() => opening.delete(next.id));
              opening.set(next.id, pending);
            }
            const body = await pending;
            if (get().account !== account) return;
            if (body) set((state) => ({ bodies: { ...state.bodies, [next.id]: body } }));
          }
        } catch {
          // Fetching ahead is a nicety; the next refresh tries again.
        } finally {
          fetchingTexts = false;
        }
      };

      /**
       * The account to read. Mail's accounts are asked for once a session,
       * and again when the chosen account is not among them.
       */
      const accountToRead = async (domain: string | null) => {
        const { account, accounts } = get();
        if (account && accounts?.some((known) => known.name === account)) return account;
        const fresh = await listMailAccounts();
        const chosen =
          fresh.find((known) => known.name === get().account) ?? universityAccount(fresh, domain);
        set({ accounts: fresh, account: chosen?.name ?? null });
        return chosen?.name ?? null;
      };

      return {
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
        keepOnMac: true,
        sending: false,

        refresh: async (domain) => {
          if (get().loading) return;
          set({ loading: true });
          try {
            if (get().messages === null) {
              // A list from scratch: its texts may be fetched ahead again.
              fetchedAhead.clear();
              await restore();
            }
            let account = await accountToRead(domain);
            let messages: MailMessage[] | null;
            try {
              messages = account ? await readInbox(account) : null;
            } catch (cause) {
              if ((cause as MailFailure).kind !== 'noAccount') throw cause;
              // Renamed or removed in Mail since the accounts were asked for.
              set({ accounts: null });
              account = await accountToRead(domain);
              messages = account ? await readInbox(account) : null;
            }
            set((state) => ({
              // A refresh keeps previews already fetched for messages still listed.
              messages: messages?.map((message) => withPreview(message, state.previews)) ?? null,
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

        findAccount: async (domain) => {
          try {
            await accountToRead(domain);
          } catch {
            // Without it the message can still go to Mail as a draft.
          }
        },

        loadPreviews: async () => {
          // A run already going picks up what a refresh added.
          if (previewing) return;
          previewing = true;
          try {
            for (;;) {
              await studentServed();
              const { account, messages, previews } = get();
              const wanted = (messages ?? [])
                .filter((message) => !(message.id in previews))
                .slice(0, PREVIEW_CHUNK);
              if (!account || wanted.length === 0) return;
              const answer = await readPreviews(account, wanted);
              // Nothing back, or another account by now: stop rather than ask again.
              if (Object.keys(answer).length === 0 || get().account !== account) return;
              set((state) => {
                const known = { ...state.previews, ...answer };
                return {
                  previews: known,
                  messages: state.messages?.map((message) => withPreview(message, known)) ?? null,
                };
              });
            }
          } catch {
            // A preview is a nicety; the list stands without it.
          } finally {
            previewing = false;
            // The newest texts follow the previews.
            void loadTexts();
          }
        },

        chooseAccount: (name) => {
          // The copy is the old account's.
          clearTimeout(saveTimer);
          void clearMailCache();
          set({
            account: name,
            messages: null,
            checkedAt: null,
            previews: {},
            selectedId: null,
            bodies: {},
          });
        },

        select: async (id) => {
          set({ selectedId: id, bodyFailure: null });
          const account = get().account;
          if (!id || !account) return;

          if (!get().bodies[id]) {
            set({ bodyLoading: id });
            try {
              let pending = opening.get(id);
              if (!pending) {
                pending = readMessage(account, refOf(id)).finally(() => opening.delete(id));
                opening.set(id, pending);
              }
              const body = await pending;
              set((state) => ({ bodies: { ...state.bodies, [id]: body } }));
            } catch (cause) {
              // Said only beside the message it is about.
              if (get().selectedId === id) set({ bodyFailure: toMailFailure(cause) });
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
          const before = get().messages?.find((message) => message.id === id)?.read;
          // At once, so a second look at the message does not mark it again.
          noteRead(id, read);
          try {
            await markRead(account, refOf(id), read);
          } catch (cause) {
            if (before !== undefined) noteRead(id, before);
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

        setKeepOnMac: (keep) => {
          set({ keepOnMac: keep });
          if (keep) {
            saveSoon();
            void loadTexts();
            return;
          }
          clearTimeout(saveTimer);
          void clearMailCache();
        },

        send: async (draft) => {
          set({ sending: true });
          try {
            return await sendWithMail(draft);
          } finally {
            set({ sending: false });
          }
        },
      };
    },
    {
      name: 'uni-pilot.mail',
      version: 3,
      partialize: (state) => ({
        account: state.account,
        triage: state.triage,
        view: state.view,
        keepOnMac: state.keepOnMac,
      }),
      // Version 1 kept the account only; it stays, and sorting starts empty.
      // Version 2 had no copy on this Mac; keeping one starts on.
      migrate: (persisted, version) => {
        const kept = (persisted ?? {}) as Partial<
          Pick<MailState, 'account' | 'triage' | 'view' | 'keepOnMac'>
        >;
        return {
          account: kept.account ?? null,
          triage: version >= 2 ? (kept.triage ?? {}) : {},
          view: version >= 2 ? (kept.view ?? 'list') : ('list' as const),
          keepOnMac: kept.keepOnMac ?? true,
        };
      },
    },
  ),
);
