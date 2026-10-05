import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMailStore } from '@/features/mail/store/mailStore';
import { MailSettings } from './MailSettings';

const invoke = vi.fn<(command: string, args: Record<string, unknown>) => Promise<unknown>>();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (command: string, args: Record<string, unknown>) => invoke(command, args),
}));

const pretendDesktop = () =>
  Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {}, configurable: true });

beforeEach(() => {
  invoke.mockReset().mockResolvedValue(undefined);
  useMailStore.setState({ keepOnMac: true });
});

afterEach(() => {
  Reflect.deleteProperty(window, '__TAURI_INTERNALS__');
});

describe('keeping mail on this Mac', () => {
  it('is on, says what is kept, and deletes the copy when turned off', async () => {
    pretendDesktop();
    const user = userEvent.setup();
    render(<MailSettings />);

    const keep = screen.getByRole('checkbox', { name: 'Keep the newest mail on this Mac' });
    expect(keep).toBeChecked();
    expect(screen.getByText(/newest 50 messages and the text of the newest 25/)).toBeVisible();

    await user.click(keep);
    expect(keep).not.toBeChecked();
    expect(useMailStore.getState().keepOnMac).toBe(false);
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledWith('mail_cache_clear', {}));
  });

  it('is not offered outside the desktop app, which has no mail', () => {
    const { container } = render(<MailSettings />);
    expect(container).toBeEmptyDOMElement();
  });
});
