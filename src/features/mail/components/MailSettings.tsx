import { Inbox } from 'lucide-react';
import { isDesktopRuntime } from '@/lib/icsFetch';
import { LIST_KEPT, TEXTS_KEPT } from '@/features/mail/lib/mailCache';
import { useMailStore } from '@/features/mail/store/mailStore';

/** Whether the newest mail is kept on this Mac, so the Inbox opens at once. */
export function MailSettings() {
  const keepOnMac = useMailStore((state) => state.keepOnMac);
  const setKeepOnMac = useMailStore((state) => state.setKeepOnMac);
  // University mail comes through Apple Mail, on the desktop app only.
  if (!isDesktopRuntime()) return null;
  return (
    <section className="mt-5 max-w-3xl rounded-2xl border border-line p-6 sm:p-8">
      <div className="flex items-center gap-2">
        <Inbox size={19} className="text-accent" aria-hidden />
        <h2 className="text-lg font-semibold tracking-tight">Your mail, ready at once</h2>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-secondary">
        The Inbox shows what it had last time straight away, and asks Apple Mail for what is new
        behind it. The newest messages open without waiting.
      </p>
      <label className="mt-5 flex items-center gap-3 text-sm font-medium">
        <input
          type="checkbox"
          checked={keepOnMac}
          onChange={(event) => setKeepOnMac(event.target.checked)}
          className="accent-accent"
        />{' '}
        Keep the newest mail on this Mac
      </label>
      <p className="mt-5 rounded-xl bg-surface-secondary p-3 text-xs leading-relaxed text-secondary">
        Kept: the list of your newest {LIST_KEPT} messages and the text of the newest {TEXTS_KEPT},
        encrypted with a key in your Keychain. macOS may ask once whether Uni Pilot can use that
        key, and again after an update. Deleted after 30 days without the Inbox, and right away when
        you turn this off or switch account.
      </p>
    </section>
  );
}
