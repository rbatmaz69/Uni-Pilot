import { isDesktopRuntime } from '@/lib/icsFetch';
import { useCourseStore } from '@/features/courses/store/courseStore';
import { useIliasStore } from '@/features/integrations/store/iliasStore';
import { installationHost } from '@/features/auto-sign-in/lib/autoSignIn';
import { useAutoSignInStore } from '@/features/auto-sign-in/store/autoSignInStore';

/**
 * Whether the face bar is up for the current sign-out — for the bar, and for
 * the notice that would otherwise offer it.
 *
 * Up only when ILIAS has signed the student out (a read said so, and no read
 * is under way that might say otherwise), a sign-in and a face are stored and
 * not refused, and either the student allowed it in Settings or asked for it
 * just now. Never at start while the session holds: nothing has said
 * otherwise then.
 */
export function useFaceBar() {
  const connection = useIliasStore((state) => state.connection);
  const failure = useCourseStore((state) => state.failure);
  const reading = useCourseStore((state) => state.loading['courses'] === true);
  const host = connection ? installationHost(connection) : null;
  const known = useAutoSignInStore((state) => (host ? state.byHost[host] : undefined));
  const autoUnlock = useAutoSignInStore((state) => state.autoUnlock);
  const faceBar = useAutoSignInStore((state) => state.faceBar);

  const signedOut = failure?.kind === 'session-expired' ? failure : null;
  const ready = Boolean(connection && known?.credentials && !known.stale && known.face);
  const bar = signedOut && faceBar?.for === signedOut ? faceBar : null;
  const wanted = bar ? bar.state === 'requested' || bar.state === 'stopped' : autoUnlock;
  const showing = Boolean(isDesktopRuntime() && signedOut && !reading && ready && wanted);
  return { connection, failure: signedOut, ready, showing, bar };
}
