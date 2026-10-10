import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AccountSwitcher } from '@/features/mail/components/AccountSwitcher';

const ACCOUNTS = [
  { name: 'iCloud', addresses: ['me@icloud.com'] },
  { name: 'Uni', addresses: ['me@stud.hs-heilbronn.de'] },
  { name: 'Spare', addresses: [] },
];

function setup(account: string | null = 'Uni') {
  const onPick = vi.fn<(name: string) => void>();
  render(
    <div>
      <AccountSwitcher accounts={ACCOUNTS} account={account} onPick={onPick} />
      <button type="button">Elsewhere</button>
    </div>,
  );
  return { onPick, title: screen.getByRole('button', { name: 'Mail' }) };
}

describe('AccountSwitcher', () => {
  it('is a heading with a menu button, closed at first', () => {
    const { title } = setup();

    expect(screen.getByRole('heading', { level: 2, name: 'Mail' })).toContainElement(title);
    expect(title).toHaveAttribute('aria-haspopup', 'menu');
    expect(title).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('lists the accounts with their addresses and marks the one being read', async () => {
    const user = userEvent.setup();
    const { title } = setup();

    await user.click(title);

    expect(title).toHaveAttribute('aria-expanded', 'true');
    const menu = screen.getByRole('menu', { name: 'Mail accounts' });
    expect(menu).toHaveTextContent('me@icloud.com');
    expect(screen.getByRole('menuitemradio', { name: 'Uni' })).toBeChecked();
    expect(screen.getByRole('menuitemradio', { name: 'iCloud' })).not.toBeChecked();
    expect(screen.getByRole('menuitemradio', { name: 'Spare' })).toBeVisible();
  });

  it('starts the keyboard on the account being read', async () => {
    const user = userEvent.setup();
    const { title } = setup();
    await user.click(title);
    expect(screen.getByRole('menuitemradio', { name: 'Uni' })).toHaveFocus();
  });

  it('picks another account, closes, and gives the focus back', async () => {
    const user = userEvent.setup();
    const { title, onPick } = setup();

    await user.click(title);
    await user.click(screen.getByRole('menuitemradio', { name: 'iCloud' }));

    expect(onPick).toHaveBeenCalledWith('iCloud');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(title).toHaveFocus();
  });

  it('does nothing about the account it already reads', async () => {
    const user = userEvent.setup();
    const { title, onPick } = setup();

    await user.click(title);
    await user.click(screen.getByRole('menuitemradio', { name: 'Uni' }));

    expect(onPick).not.toHaveBeenCalled();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('opens with the arrow keys and walks the accounts around', async () => {
    const user = userEvent.setup();
    const { title } = setup(null);

    title.focus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitemradio', { name: 'iCloud' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitemradio', { name: 'Uni' })).toHaveFocus();
    await user.keyboard('{End}');
    expect(screen.getByRole('menuitemradio', { name: 'Spare' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitemradio', { name: 'iCloud' })).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(screen.getByRole('menuitemradio', { name: 'Spare' })).toHaveFocus();
    await user.keyboard('{Home}');
    expect(screen.getByRole('menuitemradio', { name: 'iCloud' })).toHaveFocus();
  });

  it('closes with Escape, back on its button', async () => {
    const user = userEvent.setup();
    const { title } = setup();

    await user.click(title);
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('menu')).toBeNull();
    expect(title).toHaveFocus();
  });

  it('closes when the student clicks elsewhere or tabs away', async () => {
    const user = userEvent.setup();
    const { title } = setup();

    await user.click(title);
    await user.click(screen.getByRole('button', { name: 'Elsewhere' }));
    expect(screen.queryByRole('menu')).toBeNull();

    await user.click(title);
    await user.keyboard('{Tab}');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('closes when its own button is pressed again', async () => {
    const user = userEvent.setup();
    const { title } = setup();

    await user.click(title);
    await user.click(title);

    expect(screen.queryByRole('menu')).toBeNull();
  });
});
