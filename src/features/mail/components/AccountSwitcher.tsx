import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import type { MailAccount } from '@/features/mail/lib/appleMail';
import { cn } from '@/lib/utils';

interface Props {
  accounts: readonly MailAccount[];
  /** The Mail account being read, by name. */
  account: string | null;
  onPick: (name: string) => void;
  /**
   * Where it sits. `panel` (default) is the Mail panel's title, with the heading
   * `PanelHeader`'s `switcher` asks for. `card` is the compact stand-in the
   * inbox shows in its own header while the panel is hidden: the account being
   * read, no heading, and its menu opens under the button.
   */
  placement?: 'panel' | 'card';
}

/**
 * The way to another of Apple Mail's accounts when it has more than one: the
 * Mail panel's title ("Mail"), or while the panel is hidden a button in the
 * card naming the account being read. Both open a small menu of the accounts
 * with the one being read marked.
 */
export function AccountSwitcher({ accounts, account, onPick, placement = 'panel' }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    // The account being read is where the keyboard starts.
    const items = rootRef.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]');
    (rootRef.current?.querySelector<HTMLElement>('[aria-checked="true"]') ?? items?.[0])?.focus();
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open]);

  function close(restoreFocus: boolean) {
    setOpen(false);
    if (restoreFocus) buttonRef.current?.focus();
  }

  function onButtonKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (open || (event.key !== 'ArrowDown' && event.key !== 'ArrowUp')) return;
    event.preventDefault();
    setOpen(true);
  }

  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const items = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitemradio"]'),
    );
    const index = items.indexOf(document.activeElement as HTMLElement);
    const focus = (next: number) => {
      event.preventDefault();
      items[(next + items.length) % items.length]?.focus();
    };
    switch (event.key) {
      case 'ArrowDown':
        return focus(index + 1);
      case 'ArrowUp':
        return focus(index === -1 ? items.length - 1 : index - 1);
      case 'Home':
        return focus(0);
      case 'End':
        return focus(items.length - 1);
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        return close(true);
      case 'Tab':
        return close(false);
    }
  }

  const trigger = (
    <button
      ref={buttonRef}
      type="button"
      title="Switch account"
      aria-haspopup="menu"
      aria-expanded={open}
      aria-controls={open ? menuId : undefined}
      onClick={() => setOpen(!open)}
      onKeyDown={onButtonKeyDown}
    >
      <span>{placement === 'card' ? (account ?? 'Account') : 'Mail'}</span>
      <ChevronsUpDown size={13} aria-hidden />
    </button>
  );

  return (
    <div ref={rootRef} className={cn(placement === 'card' && 'mail-account--card')}>
      {placement === 'card' ? (
        <div className="mail-account-title">{trigger}</div>
      ) : (
        <h2 className="mail-account-title">{trigger}</h2>
      )}
      {open ? (
        <div
          id={menuId}
          className="mail-account-menu"
          role="menu"
          aria-label="Mail accounts"
          onKeyDown={onMenuKeyDown}
        >
          {accounts.map((known) => {
            const current = known.name === account;
            return (
              <button
                key={known.name}
                type="button"
                role="menuitemradio"
                aria-checked={current}
                aria-label={known.name}
                tabIndex={-1}
                className={cn('mail-account-item', current && 'is-current')}
                onClick={() => {
                  close(true);
                  if (!current) onPick(known.name);
                }}
              >
                <span className="mail-account-name">
                  {known.name}
                  {known.addresses[0] ? (
                    <span className="mail-account-address">{known.addresses[0]}</span>
                  ) : null}
                </span>
                {current ? <Check size={14} className="mail-account-check" aria-hidden /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
