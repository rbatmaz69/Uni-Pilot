import type { ComponentProps } from 'react';
import { RefreshCw, Settings, SquarePen } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PanelAction, PanelHeader } from '@/components/layout/Panel';
import { SectionPanel, type PanelResize } from '@/components/layout/SectionPanel';
import { cn } from '@/lib/utils';
import { AccountSwitcher } from '@/features/mail/components/AccountSwitcher';
import { MailList } from '@/features/mail/components/MailList';
import { useMailStore } from '@/features/mail/store/mailStore';

/** Wide enough for a sender, a date and a subject line; the student can drag it wider. */
const MAIL_PANEL_WIDTH: PanelResize = { id: 'mail', defaultWidth: 380, min: 300, max: 640 };

interface Props extends ComponentProps<typeof MailList> {
  onRefresh: () => void;
  onCompose: () => void;
  /** Reads another of Apple Mail's accounts. */
  onAccount: (name: string) => void;
}

/**
 * The Inbox's own sidebar is the inbox itself: the account and the things to
 * do (ask Mail again, write, the mail settings) on top, then the search, the
 * views and filters, and the messages. The open message fills the card beside
 * it. The edge can be dragged to make the list wider or narrower.
 */
export function MailPanel({ onRefresh, onCompose, onAccount, ...list }: Props) {
  const accounts = useMailStore((state) => state.accounts);
  const account = useMailStore((state) => state.account);

  return (
    <SectionPanel label="Mail" resize={MAIL_PANEL_WIDTH} className="mail-panel">
      <PanelHeader
        title="Mail"
        switcher={
          accounts && accounts.length > 1 ? (
            <AccountSwitcher accounts={accounts} account={account} onPick={onAccount} />
          ) : undefined
        }
        actions={
          <>
            <PanelAction label="Refresh" disabled={list.loading} onClick={onRefresh}>
              <RefreshCw
                size={15}
                strokeWidth={1.8}
                aria-hidden
                className={cn(list.loading && 'animate-spin')}
              />
            </PanelAction>
            <PanelAction label="New message" onClick={onCompose}>
              <SquarePen size={16} strokeWidth={1.8} aria-hidden />
            </PanelAction>
            <Link
              to="/settings?section=mail"
              className="panel-action"
              aria-label="Mail settings"
              title="Mail settings"
            >
              <Settings size={15} strokeWidth={1.8} aria-hidden />
            </Link>
          </>
        }
      />
      <MailList {...list} />
    </SectionPanel>
  );
}
