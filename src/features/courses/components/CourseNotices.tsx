import { useState, type ComponentType, type ReactNode } from 'react';
import { LogIn, RefreshCw, TriangleAlert } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui';
import { formatTimeAgo } from '@/lib/date';
import { cn } from '@/lib/utils';
import { NAV_ITEMS } from '@/lib/navigation';
import { useCourseStore } from '@/features/courses/store/courseStore';
import { signInFailureText, testIliasSignIn } from '@/features/integrations/lib/iliasSync';
import { useIliasStore } from '@/features/integrations/store/iliasStore';

interface EmptyStateProps {
  icon: ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}

/** A whole-page state: not connected, no desktop app, nothing read yet. */
export function EmptyState({ icon: Icon, title, children, action }: EmptyStateProps) {
  return (
    <div className="flex min-h-[320px] flex-col items-center justify-center rounded-2xl border border-line-soft bg-surface-secondary/50 px-6 py-14 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-2xl border border-line bg-surface text-accent shadow-soft">
        <Icon size={24} strokeWidth={1.4} />
      </span>
      <h2 className="mt-6 text-lg font-semibold tracking-tight">{title}</h2>
      <p className="mt-2 max-w-md text-[13px] leading-relaxed text-secondary">{children}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

interface SyncBarProps {
  label: string;
  loadedAt: string | null;
  loading: boolean;
  onRefresh: () => void;
}

/** Where the list came from and how fresh it is, with a way to ask again. */
export function SyncBar({ label, loadedAt, loading, onRefresh }: SyncBarProps) {
  const freshness = loading
    ? 'Reading ILIAS…'
    : loadedAt
      ? `Updated ${formatTimeAgo(new Date(loadedAt), new Date())}`
      : 'Not read yet';
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-[12px] text-muted">
        {label} · <span aria-live="polite">{freshness}</span>
      </p>
      <Button
        size="sm"
        onClick={onRefresh}
        disabled={loading}
        leadingIcon={
          <RefreshCw
            size={14}
            strokeWidth={1.8}
            aria-hidden
            className={cn(loading && 'animate-spin')}
          />
        }
      >
        Refresh
      </Button>
    </div>
  );
}

/**
 * Development builds only: Rust signs in with the password and authenticator
 * stored for this ILIAS — one password, one code, nothing retried — and the
 * read runs again once ILIAS has a session (`docs/face-unlock-plan.md`,
 * Phase 2, checked against a real account by hand).
 */
function TestSignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const connection = useIliasStore((state) => state.connection);
  const [running, setRunning] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  if (!connection) return null;

  const run = async () => {
    setRunning(true);
    setSaid(null);
    try {
      const signedIn = await testIliasSignIn(connection);
      setSaid(signedIn ? 'Signed in.' : 'Signed in at the sign-on, but ILIAS did not take it.');
      if (signedIn) onSignedIn();
    } catch (failure) {
      setSaid(signInFailureText(failure));
    } finally {
      setRunning(false);
    }
  };

  return (
    <>
      <Button size="sm" onClick={() => void run()} disabled={running}>
        Test sign-in
      </Button>
      {said ? (
        <p role="status" className="order-last basis-full text-right text-[12px] text-secondary">
          {said}
        </p>
      ) : null}
    </>
  );
}

/**
 * Why ILIAS gave nothing this time. What was read before stays on the page
 * underneath: a failure never empties it.
 */
export function FailureNotice({ onRetry }: { onRetry: () => void }) {
  const failure = useCourseStore((state) => state.failure);
  const navigate = useNavigate();
  if (!failure) return null;

  if (failure.kind === 'session-expired') {
    return (
      <div
        role="alert"
        className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-line bg-accent-soft px-5 py-4"
      >
        <div className="max-w-xl">
          <p className="text-[13px] font-semibold text-primary">Sign in to ILIAS to update</p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-secondary">
            ILIAS ends its sign-in when Uni Pilot quits. Sign in once with your password and
            authenticator code — while Uni Pilot runs, it keeps the sign-in alive.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {import.meta.env.DEV ? <TestSignIn onSignedIn={onRetry} /> : null}
          <Button
            variant="primary"
            size="sm"
            onClick={() => void navigate(NAV_ITEMS.ilias.path)}
            leadingIcon={<LogIn size={14} strokeWidth={1.8} aria-hidden />}
          >
            Sign in to ILIAS
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-line bg-coral-soft px-5 py-4"
    >
      <p className="flex items-center gap-2 text-[12.5px] text-primary">
        <TriangleAlert size={15} strokeWidth={1.8} aria-hidden className="shrink-0 text-coral" />
        {failure.message}
      </p>
      <Button size="sm" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
