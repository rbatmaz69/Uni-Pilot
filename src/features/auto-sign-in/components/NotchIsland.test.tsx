import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotchIsland, type NotchPainting } from './NotchIsland';

let deliver: (payload: NotchPainting | null) => void = () => undefined;
const emit = vi.fn<(event: string, payload?: unknown) => Promise<void>>();

vi.mock('@tauri-apps/api/event', () => ({
  listen: (_event: string, handler: (event: { payload: NotchPainting | null }) => void) => {
    deliver = (payload) => handler({ payload });
    return Promise.resolve(() => undefined);
  },
  emit: (event: string, payload?: unknown) => emit(event, payload),
}));

const painting = (extra: Partial<NotchPainting> = {}): NotchPainting => ({
  phase: 'looking',
  text: 'Look at the camera to sign in to ILIAS again.',
  again: false,
  camera: true,
  notchWidth: 185,
  notchHeight: 32,
  ...extra,
});

const sent = (event: string) => emit.mock.calls.filter(([name]) => name === event);

beforeEach(() => {
  emit.mockReset().mockResolvedValue(undefined);
});

describe('the island in the notch', () => {
  it('asks for the last state, and shows nothing until it has one', async () => {
    render(<NotchIsland />);
    await waitFor(() => expect(sent('notch-ready')).toHaveLength(1));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows the sentence, the face and the camera mark — nothing more', async () => {
    render(<NotchIsland />);
    await waitFor(() => expect(sent('notch-ready')).toHaveLength(1));
    act(() => deliver(painting()));

    expect(screen.getByRole('status')).toHaveTextContent('Look at the camera');
    expect(screen.getByText('Camera on')).toBeInTheDocument();
    expect(document.querySelector('img, video, canvas')).toBeNull();
  });

  it('reports a click as an action, and nothing else', async () => {
    const user = userEvent.setup();
    render(<NotchIsland />);
    await waitFor(() => expect(sent('notch-ready')).toHaveLength(1));
    act(() => deliver(painting()));

    await user.click(screen.getByRole('button', { name: 'Use password' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(sent('notch-action').map(([, payload]) => payload)).toEqual([
      { action: 'password' },
      { action: 'cancel' },
    ]);
  });

  it('offers another try only when Uni Pilot says it could help', async () => {
    render(<NotchIsland />);
    await waitFor(() => expect(sent('notch-ready')).toHaveLength(1));
    act(() => deliver(painting({ phase: 'stopped', text: 'Not recognised.', again: true })));
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();

    act(() => deliver(painting({ phase: 'stopped', text: 'Paused after three tries.' })));
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  it('asks nothing while signing in, and folds away after', async () => {
    render(<NotchIsland />);
    await waitFor(() => expect(sent('notch-ready')).toHaveLength(1));
    act(() => deliver(painting({ phase: 'signingIn', text: 'Signing in…', camera: false })));
    expect(screen.queryByRole('button')).not.toBeInTheDocument();

    act(() => deliver(null));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    // Nothing to click any more: every click goes through to the menu bar.
    expect(sent('notch-hit').at(-1)?.[1]).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });

  it('offers to bring Uni Pilot back while the camera is paused', async () => {
    const user = userEvent.setup();
    render(<NotchIsland />);
    await waitFor(() => expect(sent('notch-ready')).toHaveLength(1));
    act(() => deliver(painting({ phase: 'paused', text: 'Paused.', camera: false })));
    await user.click(screen.getByRole('button', { name: 'Open Uni Pilot' }));
    expect(sent('notch-action').at(-1)?.[1]).toEqual({ action: 'open' });
  });
});
