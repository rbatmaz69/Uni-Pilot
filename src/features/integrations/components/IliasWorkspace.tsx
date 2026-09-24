import { useId, useState, type FormEvent, type ReactNode } from 'react';
import {
  AppWindow,
  CircleCheck,
  LogOut,
  RefreshCw,
  School,
  ShieldCheck,
  TriangleAlert,
  Unplug,
} from 'lucide-react';
import { Button } from '@/components/ui';
import type { IliasConnection, IliasSignIn } from '@/features/integrations/lib/ilias/connection';
import { KNOWN_INSTALLATIONS } from '@/features/integrations/lib/ilias/knownInstallations';
import { canOpenIliasWindow, openIlias } from '@/features/integrations/lib/iliasWindow';
import { canEmbedIlias } from '@/features/integrations/lib/iliasView';
import { IliasStrip } from './IliasStrip';
import { useIliasStore } from '@/features/integrations/store/iliasStore';

const FIELD =
  'w-full rounded-xl border border-line bg-surface-secondary px-3 py-2 text-[13px] text-primary transition-colors placeholder:text-muted focus:border-accent focus:outline-none';

/** Tauri rejects a command with the Rust `Err` string itself, not an Error. */
function messageOf(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  if (typeof cause === 'string' && cause) return cause;
  return 'That did not work.';
}

interface IliasWorkspaceProps {
  /** A deep link to open on arrival, from "Open in ILIAS" in the calendar. */
  target?: string | undefined;
}

/**
 * ILIAS inside Uni Pilot.
 *
 * At Heilbronn the university's ILIAS offers Uni Pilot one data channel — the
 * calendar — and nothing for courses, materials, submissions or forums. So this
 * page does not try to rebuild ILIAS; it shows ILIAS itself, and is honest
 * about what that is.
 *
 * In the desktop app, once connected, the page becomes ILIAS mode: Uni Pilot a
 * strip at the top, ILIAS filling the window below. A browser tab cannot hold
 * ILIAS — it forbids framing — so there the page offers to open it in a tab.
 */
export function IliasWorkspace({ target }: IliasWorkspaceProps = {}) {
  const connection = useIliasStore((state) => state.connection);
  const busy = useIliasStore((state) => state.busy);
  const connect = useIliasStore((state) => state.connect);
  const recheck = useIliasStore((state) => state.recheck);
  const disconnect = useIliasStore((state) => state.disconnect);

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const run = async (work: () => Promise<string | null>) => {
    setError(null);
    setNotice(null);
    try {
      setNotice(await work());
    } catch (cause) {
      setError(messageOf(cause));
    }
  };

  const banners = (
    <>
      {error ? (
        <p
          role="alert"
          className="mt-4 flex items-start gap-2 rounded-xl border border-coral/40 bg-coral-soft px-3 py-2.5 text-[12px] leading-relaxed text-primary"
        >
          <TriangleAlert size={14} aria-hidden className="mt-0.5 flex-none text-coral" />
          {error}
        </p>
      ) : null}
      {notice ? (
        <p
          role="status"
          className="mt-4 flex items-start gap-2 rounded-xl border border-green/40 bg-green-soft px-3 py-2.5 text-[12px] leading-relaxed text-primary"
        >
          <CircleCheck size={14} aria-hidden className="mt-0.5 flex-none text-green" />
          {notice}
        </p>
      ) : null}
    </>
  );

  if (connection && canEmbedIlias()) {
    return (
      <IliasStrip
        connection={connection}
        initialTarget={target}
        onDisconnect={() => {
          const name = connection.name;
          disconnect();
          setError(null);
          setNotice(`Disconnected from ${name}.`);
        }}
      />
    );
  }

  if (!connection) {
    return (
      <NotConnected
        busy={busy}
        onConnect={(rawUrl) =>
          void run(async () => {
            const connected = await connect(rawUrl);
            return `Connected to ${connected.name}.`;
          })
        }
      >
        {banners}
      </NotConnected>
    );
  }

  return (
    <Connected
      connection={connection}
      busy={busy}
      onOpen={() =>
        void run(async () => {
          await openIlias(connection);
          return null;
        })
      }
      onRecheck={() =>
        void run(async () => {
          await recheck();
          return 'ILIAS answered. Everything is up to date.';
        })
      }
      onSignOut={() =>
        void run(async () => {
          // ILIAS's own sign-out, in the ILIAS window. Portable where clearing
          // the webview's storage is not, and it ends the session ILIAS knows
          // about rather than just hiding it from us.
          await openIlias(connection, `${connection.baseUrl}/logout.php`);
          return 'ILIAS is signing you out in its window.';
        })
      }
      onDisconnect={() => {
        const name = connection.name;
        disconnect();
        setError(null);
        setNotice(`Disconnected from ${name}.`);
      }}
    >
      {banners}
    </Connected>
  );
}

interface NotConnectedProps {
  busy: boolean;
  onConnect: (rawUrl: string) => void;
  children: ReactNode;
}

function NotConnected({ busy, onConnect, children }: NotConnectedProps) {
  const [url, setUrl] = useState('');
  const urlId = useId();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onConnect(url);
  };

  return (
    <section
      className="max-w-3xl rounded-2xl border border-line p-6 sm:p-8"
      aria-labelledby={`${urlId}-title`}
    >
      <div className="flex items-center gap-2">
        <School size={19} className="text-accent" aria-hidden />
        <h2 id={`${urlId}-title`} className="text-lg font-semibold tracking-tight">
          Bring your ILIAS along
        </h2>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-secondary">
        Courses, materials, submissions and forums stay in ILIAS. Uni Pilot opens it for you, one
        click away, and signs you in the way your university does.
      </p>

      <div className="mt-5 flex flex-col gap-2">
        {KNOWN_INSTALLATIONS.map((known) => (
          <Button
            key={known.id}
            variant="primary"
            disabled={busy}
            onClick={() => onConnect(known.baseUrl)}
            leadingIcon={<School size={15} aria-hidden />}
            className="self-start"
          >
            {busy ? 'Checking…' : `Connect ${known.name}`}
          </Button>
        ))}
      </div>

      <form
        onSubmit={handleSubmit}
        className="mt-6 flex flex-col gap-2 border-t border-line-soft pt-5"
      >
        <label htmlFor={urlId} className="text-[12px] font-medium text-secondary">
          Another ILIAS
        </label>
        <div className="flex items-center gap-2">
          <input
            id={urlId}
            type="text"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://ilias.your-university.edu"
            className={FIELD}
          />
          <Button variant="secondary" size="sm" type="submit" disabled={busy} className="flex-none">
            {busy ? 'Checking…' : 'Connect'}
          </Button>
        </div>
        <p className="text-[11.5px] leading-relaxed text-muted">
          Uni Pilot asks the address what it is before keeping it. No password is involved.
        </p>
      </form>

      {children}
    </section>
  );
}

interface ConnectedProps {
  connection: IliasConnection;
  busy: boolean;
  onOpen: () => void;
  onRecheck: () => void;
  onSignOut: () => void;
  onDisconnect: () => void;
  children: ReactNode;
}

/**
 * The sign-in sentence follows what the login page offers. Heilbronn offers a
 * password form *and* its single sign-on, but students have no local password
 * there — so anything that includes SSO is described as the university account,
 * and a password is never promised where it would not work.
 */
function signInSentence(signIn: IliasSignIn): string {
  switch (signIn) {
    case 'sso':
    case 'both':
      return 'You sign in with your university account, as on the ILIAS website.';
    case 'password':
      return 'You sign in with your ILIAS username and password, as on the website.';
    case 'unknown':
      return 'You sign in the same way you do on the ILIAS website.';
  }
}

function Connected({
  connection,
  busy,
  onOpen,
  onRecheck,
  onSignOut,
  onDisconnect,
  children,
}: ConnectedProps) {
  const titleId = useId();
  const inWindow = canOpenIliasWindow();

  return (
    <section
      className="max-w-3xl rounded-2xl border border-line p-6 sm:p-8"
      aria-labelledby={titleId}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id={titleId} className="text-lg font-semibold tracking-tight">
            {connection.name}
          </h2>
          <p className="mt-1 text-[12px] text-muted">
            {connection.version ? `ILIAS ${connection.version}` : 'ILIAS'} · client{' '}
            {connection.clientId}
          </p>
        </div>
        <School size={24} className="flex-none text-accent" strokeWidth={1.5} aria-hidden />
      </div>

      <p className="mt-4 text-sm leading-relaxed text-secondary">
        {signInSentence(connection.signIn)}
      </p>

      <Button
        variant="primary"
        onClick={onOpen}
        leadingIcon={<AppWindow size={15} aria-hidden />}
        className="mt-5"
      >
        Open ILIAS
      </Button>

      <div className="mt-6 flex flex-wrap gap-2 border-t border-line-soft pt-5">
        <Button
          variant="ghost"
          size="sm"
          onClick={onRecheck}
          disabled={busy}
          leadingIcon={<RefreshCw size={13} aria-hidden />}
        >
          {busy ? 'Checking…' : 'Check again'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onSignOut}
          leadingIcon={<LogOut size={13} aria-hidden />}
        >
          Sign out of ILIAS
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onDisconnect}
          leadingIcon={<Unplug size={13} aria-hidden />}
        >
          Disconnect
        </Button>
      </div>
      <p className="mt-2 text-[11.5px] leading-relaxed text-muted">
        Disconnecting only makes Uni Pilot forget this ILIAS. To end your session there, sign out of
        ILIAS first.
      </p>

      <p className="mt-5 flex items-start gap-2 rounded-xl bg-surface-secondary p-3 text-xs leading-relaxed text-secondary">
        <ShieldCheck size={14} aria-hidden className="mt-0.5 flex-none text-green" />
        <span>
          {inWindow
            ? 'ILIAS opens in a window of its own. '
            : 'In a browser tab, ILIAS opens in a new tab; the desktop app keeps it inside Uni Pilot. '}
          The sign-in stays on this computer. Uni Pilot does not read what you type there and never
          sees your password — the window is a browser and nothing else.
        </span>
      </p>

      {children}
    </section>
  );
}
