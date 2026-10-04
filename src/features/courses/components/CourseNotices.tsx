import { useState, type ComponentType, type ReactNode } from 'react';
import { LogIn, RefreshCw, ScanFace, TriangleAlert } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui';
import { formatTimeAgo } from '@/lib/date';
import { cn } from '@/lib/utils';
import { NAV_ITEMS } from '@/lib/navigation';
import { installationHost, useAutoSignInStore, useFaceBar } from '@/features/auto-sign-in';
import { useCourseStore } from '@/features/courses/store/courseStore';
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
 * ILIAS wants a sign-in. When the student set up signing in automatically and
 * the university has not refused the stored password, Uni Pilot offers to do
 * it — with a face set up, through the face bar at the top of the window
 * (`FaceUnlockBar`), else at a click: one try, then the read runs again. Signing in with the password, in ILIAS
 * mode, is always on offer. Whether any of it is set up comes from
 * `autoSignInStore`, so this notice never asks the credential store itself.
 */
function SignInNotice({ onRetry }: { onRetry: () => void }) {
  const navigate = useNavigate();
  const connection = useIliasStore((state) => state.connection);
  const known = useAutoSignInStore((state) =>
    connection ? state.byHost[installationHost(connection)] : undefined,
  );
  const signIn = useAutoSignInStore((state) => state.signIn);
  const signingIn = useAutoSignInStore((state) => state.signingIn);
  const [said, setSaid] = useState<string | null>(null);
  const failure = useCourseStore((state) => state.failure);
  const faceBar = useFaceBar();
  const setFaceBar = useAutoSignInStore((state) => state.setFaceBar);
  const automatic = Boolean(connection && known?.credentials && !known.stale);
  const face = automatic && Boolean(known?.face);
  const signInYourself = () => void navigate(NAV_ITEMS.ilias.path);

  const signInAutomatically = async () => {
    if (!connection) return;
    setSaid(null);
    const result = await signIn(connection);
    if (result.signedIn) onRetry();
    else setSaid(result.message);
  };

  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-line bg-accent-soft px-5 py-4"
    >
      <div className="max-w-xl">
        <p className="text-[13px] font-semibold text-primary">Sign in to ILIAS to update</p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-secondary">
          {face && faceBar.showing
            ? 'ILIAS ends its sign-in when Uni Pilot quits. Look at the camera in the bar at the top, and Uni Pilot signs you in again.'
            : automatic
              ? 'ILIAS ends its sign-in when Uni Pilot quits. Uni Pilot can sign in again for you, as you set up in Settings.'
              : 'ILIAS ends its sign-in when Uni Pilot quits. Sign in once with your password and authenticator code — while Uni Pilot runs, it keeps the sign-in alive.'}
        </p>
        {known?.credentials && known.stale ? (
          <p className="mt-1 text-[12.5px] leading-relaxed text-secondary">
            HHN did not accept the stored password.{' '}
            <Link to={NAV_ITEMS.settings.path} className="text-accent hover:underline">
              Set it up again in Settings
            </Link>
            .
          </p>
        ) : null}
        {said ? (
          <p role="status" className="mt-1 text-[12.5px] leading-relaxed text-primary">
            {said}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {face ? (
          <>
            <Button size="sm" onClick={signInYourself}>
              Sign in with password instead
            </Button>
            {faceBar.showing || !failure ? null : (
              <Button
                variant="primary"
                size="sm"
                onClick={() => setFaceBar({ for: failure, state: 'requested' })}
                leadingIcon={<ScanFace size={14} strokeWidth={1.8} aria-hidden />}
              >
                Unlock with your face
              </Button>
            )}
          </>
        ) : automatic ? (
          <>
            <Button size="sm" onClick={signInYourself} disabled={signingIn}>
              Sign in yourself
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => void signInAutomatically()}
              disabled={signingIn}
              leadingIcon={<LogIn size={14} strokeWidth={1.8} aria-hidden />}
            >
              {signingIn ? 'Signing in…' : 'Sign in automatically'}
            </Button>
          </>
        ) : (
          <Button
            variant="primary"
            size="sm"
            onClick={signInYourself}
            leadingIcon={<LogIn size={14} strokeWidth={1.8} aria-hidden />}
          >
            Sign in to ILIAS
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Why ILIAS gave nothing this time. What was read before stays on the page
 * underneath: a failure never empties it.
 */
export function FailureNotice({ onRetry }: { onRetry: () => void }) {
  const failure = useCourseStore((state) => state.failure);
  if (!failure) return null;

  if (failure.kind === 'session-expired') return <SignInNotice onRetry={onRetry} />;

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
