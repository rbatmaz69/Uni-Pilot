import { useEffect, useState } from 'react';
import { KeyRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';
import { NAV_ITEMS } from '@/lib/navigation';
import { isDesktopRuntime } from '@/lib/icsFetch';
import { useIliasStore } from '@/features/integrations/store/iliasStore';
import { installationHost, vaultFailureText } from '@/features/auto-sign-in/lib/autoSignIn';
import {
  useAutoSignInStore,
  type KnownSignIn,
} from '@/features/auto-sign-in/store/autoSignInStore';
import { CredentialsDialog } from '@/features/auto-sign-in/components/CredentialsDialog';
import { FaceEnrollDialog } from '@/features/auto-sign-in/components/FaceEnrollDialog';

function describe(known: KnownSignIn | undefined): string | null {
  if (!known) return null;
  if (!known.credentials) return 'Not set up.';
  if (known.stale) {
    return 'HHN did not accept the stored password. Set up again with your current one.';
  }
  const who = known.username ? ` for ${known.username}` : '';
  const device = known.device ? `, with the authenticator “${known.device}”` : '';
  return `Set up${who}${device}.`;
}

/**
 * Settings for signing in to ILIAS automatically: what it does, what is kept
 * and where, and Set up, Test sign-in and Forget. Asks the credential store
 * only while it knows nothing about this ILIAS yet (`autoSignInStore`).
 */
export function AutoSignInSettings() {
  const connection = useIliasStore((state) => state.connection);
  const host = connection ? installationHost(connection) : null;
  const known = useAutoSignInStore((state) => (host ? state.byHost[host] : undefined));
  const load = useAutoSignInStore((state) => state.load);
  const forget = useAutoSignInStore((state) => state.forget);
  const signIn = useAutoSignInStore((state) => state.signIn);
  const signingIn = useAutoSignInStore((state) => state.signingIn);
  const autoUnlock = useAutoSignInStore((state) => state.autoUnlock);
  const setAutoUnlock = useAutoSignInStore((state) => state.setAutoUnlock);
  const [settingUp, setSettingUp] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const desktop = isDesktopRuntime();

  useEffect(() => {
    if (!desktop || !connection || known) return;
    load(connection).catch((failure: unknown) => setSaid(vaultFailureText(failure)));
  }, [connection, desktop, known, load]);

  const usable = Boolean(known?.credentials && !known.stale);

  const test = async () => {
    if (!connection) return;
    setSaid(null);
    setSaid((await signIn(connection)).message);
  };

  const remove = async () => {
    if (!connection) return;
    setSaid(null);
    try {
      await forget(connection);
      setSaid('Forgotten. Nothing is stored for this ILIAS any more.');
    } catch (failure) {
      setSaid(vaultFailureText(failure));
    }
  };

  return (
    <section
      aria-labelledby="auto-sign-in-heading"
      className="mt-5 max-w-3xl rounded-2xl border border-line p-6 sm:p-8"
    >
      <div className="flex items-center gap-2">
        <KeyRound size={19} className="text-accent" aria-hidden />
        <h2 id="auto-sign-in-heading" className="text-lg font-semibold tracking-tight">
          Sign in to ILIAS automatically
        </h2>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-secondary">
        When ILIAS asks you to sign in again, Uni Pilot can do it for you: with your HHN password
        and an authenticator of its own, the way you would — one try, and none again if HHN says no.
      </p>
      <h3 className="mt-5 text-sm font-medium">What is kept, and where</h3>
      <p className="mt-1 text-xs leading-relaxed text-secondary">
        Your HHN user name and password and Uni Pilot’s authenticator, in this computer’s credential
        store — the Keychain on a Mac. Not in a file and not on this page, and sent nowhere but to
        HHN’s sign-in. With face unlock, also 128 numbers that describe your face — never a picture.
        Forget removes all of it from this computer.
      </p>

      <div className="mt-5 border-t border-line-soft pt-5">
        {!desktop ? (
          <p className="text-sm text-secondary">Available in the Uni Pilot desktop app.</p>
        ) : !connection ? (
          <p className="text-sm text-secondary">
            The sign-in belongs to your ILIAS.{' '}
            <Link to={NAV_ITEMS.ilias.path} className="text-accent hover:underline">
              Connect ILIAS
            </Link>{' '}
            first.
          </p>
        ) : (
          <>
            <p className="text-sm text-primary">{describe(known)}</p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button
                variant={known?.credentials ? 'secondary' : 'primary'}
                size="sm"
                onClick={() => setSettingUp(true)}
              >
                Set up
              </Button>
              <Button size="sm" onClick={() => void test()} disabled={!usable || signingIn}>
                {signingIn ? 'Signing in…' : 'Test sign-in'}
              </Button>
              <Button
                size="sm"
                onClick={() => void remove()}
                disabled={!known?.credentials || signingIn}
              >
                Forget
              </Button>
            </div>
            {said ? (
              <p role="status" className="mt-3 text-xs leading-relaxed text-secondary">
                {said}
              </p>
            ) : null}
            {usable ? (
              <div className="mt-5 border-t border-line-soft pt-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-medium">Face unlock</h3>
                    <p className="mt-1 text-xs leading-relaxed text-secondary">
                      {known?.face
                        ? 'Set up. When ILIAS asks you to sign in, a look into the camera will do.'
                        : 'Instead of a click, a look into the camera before Uni Pilot signs in.'}
                    </p>
                  </div>
                  <Button size="sm" onClick={() => setEnrolling(true)}>
                    {known?.face ? 'Set up face unlock again' : 'Set up face unlock'}
                  </Button>
                </div>
                <div className="mt-4 flex items-center justify-between gap-4">
                  <div>
                    <h4 className="text-sm font-medium">Unlock as soon as ILIAS signs you out</h4>
                    <p className="mt-1 text-xs leading-relaxed text-secondary">
                      {known?.face
                        ? 'The camera turns on by itself, in a thin bar at the top — only while ILIAS wants a sign-in and the bar shows. Off until you turn it on.'
                        : 'Set up face unlock first.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={Boolean(known?.face) && autoUnlock}
                    aria-label="Unlock as soon as ILIAS signs you out"
                    disabled={!known?.face}
                    onClick={() => setAutoUnlock(!autoUnlock)}
                    className={cn(
                      'flex h-6 w-10 flex-none items-center rounded-full p-1 transition-colors disabled:opacity-50',
                      known?.face && autoUnlock ? 'bg-accent' : 'bg-line-strong',
                    )}
                  >
                    <span
                      className={cn(
                        'h-4 w-4 rounded-full bg-surface shadow-soft transition-transform',
                        known?.face && autoUnlock && 'translate-x-4',
                      )}
                    />
                  </button>
                </div>
              </div>
            ) : null}
            {enrolling ? (
              <FaceEnrollDialog connection={connection} onClose={() => setEnrolling(false)} />
            ) : null}
            {settingUp ? (
              <CredentialsDialog
                connection={connection}
                onClose={() => setSettingUp(false)}
                onSaved={() => {
                  setSettingUp(false);
                  setSaid('Saved. Uni Pilot will offer to sign in for you when ILIAS asks.');
                }}
              />
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
