import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '@/test/render';
import { useFocusStore } from '@/features/focus/store/focusStore';
import { playFocusSound, prepareFocusSound } from '@/features/focus/lib/sound';
import type { FocusBackground } from '@/features/focus/lib/backgrounds';

const backgroundMocks = vi.hoisted(() => {
  const rows: FocusBackground[] = [];
  return {
    rows,
    list: vi.fn(() => Promise.resolve([...rows])),
    add: vi.fn((file: File) => {
      const id = `image-${rows.length + 1}`;
      rows.push({ id, name: file.name, image: file, addedAt: rows.length });
      return Promise.resolve(id);
    }),
    remove: vi.fn((id: string) => {
      const index = rows.findIndex((row) => row.id === id);
      if (index !== -1) rows.splice(index, 1);
      return Promise.resolve();
    }),
  };
});

const mediaMocks = vi.hoisted(() => ({
  play: vi.fn<() => Promise<void>>(() => Promise.resolve()),
  pause: vi.fn(),
}));

vi.mock('@/features/focus/lib/backgrounds', () => ({
  ACCEPTED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif'],
  listFocusBackgrounds: backgroundMocks.list,
  addFocusBackground: backgroundMocks.add,
  removeFocusBackground: backgroundMocks.remove,
}));

vi.mock('@/features/focus/lib/sound', () => ({
  playFocusSound: vi.fn(),
  prepareFocusSound: vi.fn(),
}));

beforeEach(() => {
  backgroundMocks.rows.length = 0;
  Object.defineProperty(HTMLMediaElement.prototype, 'play', {
    configurable: true,
    value: mediaMocks.play,
  });
  Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
    configurable: true,
    value: mediaMocks.pause,
  });
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn((file: File) => `blob:${file.name}`),
  });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-12T10:00:00'));
  vi.clearAllMocks();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('Focus workspace', () => {
  it('paints the ring on animation frames and reconciles pause, resume, tab return and reset', () => {
    const frames = new Map<number, FrameRequestCallback>();
    let nextFrame = 0;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.set(++nextFrame, callback);
      return nextFrame;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
    const paintFrame = () => {
      const callbacks = [...frames.values()];
      frames.clear();
      act(() => callbacks.forEach((callback) => callback(0)));
    };

    renderApp('/focus');
    fireEvent.click(screen.getByRole('button', { name: 'Set Pomodoro times' }));
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Pomodoro minutes' }), {
      target: { value: '1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save times' }));
    const ring = screen
      .getByRole('region', { name: 'Focus timer' })
      .querySelector('circle[stroke-dasharray="1"]');
    expect(ring).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Start focus' }));
    const startedAt = Date.now();
    vi.setSystemTime(startedAt + 125);
    paintFrame();
    expect(Number(ring?.getAttribute('stroke-dashoffset'))).toBeCloseTo(125 / 60_000);
    expect(screen.getByRole('timer')).toHaveTextContent('01:00');

    vi.setSystemTime(startedAt + 250);
    paintFrame();
    expect(Number(ring?.getAttribute('stroke-dashoffset'))).toBeCloseTo(250 / 60_000);

    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(frames.size).toBe(0);
    const pausedOffset = ring?.getAttribute('stroke-dashoffset');
    vi.setSystemTime(startedAt + 10_250);
    expect(ring).toHaveAttribute('stroke-dashoffset', pausedOffset);

    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    vi.setSystemTime(startedAt + 10_375);
    paintFrame();
    expect(Number(ring?.getAttribute('stroke-dashoffset'))).toBeCloseTo(375 / 60_000);

    vi.setSystemTime(startedAt + 20_375);
    fireEvent(document, new Event('visibilitychange'));
    expect(Number(ring?.getAttribute('stroke-dashoffset'))).toBeCloseTo(10_375 / 60_000);

    fireEvent.click(screen.getByRole('button', { name: 'Reset timer' }));
    expect(frames.size).toBe(0);
    expect(ring).toHaveAttribute('stroke-dashoffset', '0');
  });

  it('runs a custom work session, pauses, resumes and starts its break automatically', async () => {
    renderApp('/focus');
    fireEvent.click(screen.getByRole('button', { name: 'Set Pomodoro times' }));
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Pomodoro minutes' }), {
      target: { value: '1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save times' }));
    expect(screen.getByText('Pomodoro 1:00')).toBeInTheDocument();
    expect(screen.getByText('Break 5:00')).toBeInTheDocument();
    expect(screen.queryByText('A little room to focus')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /What’s your focus/ })).not.toBeInTheDocument();
    expect(screen.queryByText('One thing at a time')).not.toBeInTheDocument();
    expect(screen.queryByText('Settle in. Start when you’re ready.')).not.toBeInTheDocument();
    const startButton = screen.getByRole('button', { name: 'Start focus' });
    expect(startButton).toHaveClass('focus-transport-main');
    fireEvent.click(startButton);
    expect(prepareFocusSound).toHaveBeenCalledOnce();
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Focus progress' })).not.toBeInTheDocument();
    expect(screen.queryByText('In the flow')).not.toBeInTheDocument();
    expect(screen.queryByText('You’ve got this. Stay with it.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pause' })).toHaveClass('focus-transport-main');
    await act(() => vi.advanceTimersByTime(10_000));
    expect(screen.getByRole('timer')).toHaveTextContent('00:50');
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(screen.queryByText('Take a breath')).not.toBeInTheDocument();
    expect(screen.queryByText('Paused · resume when you’re ready')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resume' })).toHaveClass('focus-transport-main');
    expect(screen.getByRole('banner')).toBeInTheDocument();
    await act(() => vi.advanceTimersByTime(20_000));
    expect(screen.getByRole('timer')).toHaveTextContent('00:50');
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    await act(() => vi.advanceTimersByTime(50_000));
    expect(screen.getByRole('timer')).toHaveTextContent('05:00');
    expect(useFocusStore.getState()).toMatchObject({ phase: 'break', status: 'running' });
    expect(screen.queryByText('Nicely done')).not.toBeInTheDocument();
    expect(screen.queryByText('Make space for a little break.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pause' })).toHaveClass('focus-transport-main');
    expect(screen.queryByText('Focus complete. Well done!')).not.toBeInTheDocument();
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(playFocusSound).toHaveBeenCalledOnce();
    expect(useFocusStore.getState().sessions[0]?.focusedMs).toBe(60_000);
    await act(() => vi.advanceTimersByTime(5 * 60_000));
    expect(screen.getByRole('timer')).toHaveTextContent('01:00');
    expect(useFocusStore.getState()).toMatchObject({ phase: 'work', status: 'idle' });
    expect(playFocusSound).toHaveBeenCalledOnce();
  });

  it('continues after navigation and finishes silently on another page', async () => {
    renderApp('/focus');
    fireEvent.click(screen.getByRole('button', { name: 'Start focus' }));
    fireEvent.click(screen.getByRole('link', { name: 'Tasks' }));
    await act(() => vi.advanceTimersByTime(25 * 60_000));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Tasks');
    expect(screen.queryByText('Focus complete. Well done!')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'Focus' }));
    expect(screen.getByRole('timer')).toHaveTextContent('05:00');
    expect(useFocusStore.getState()).toMatchObject({ phase: 'break', status: 'running' });
    expect(useFocusStore.getState().sessions).toHaveLength(1);
    await act(() => vi.advanceTimersByTime(5 * 60_000));
    expect(screen.getByRole('timer')).toHaveTextContent('25:00');
  });

  it('starts at 25/5 and edits both durations in the compact settings dialog', () => {
    renderApp('/focus');
    expect(screen.getByText('Pomodoro 25:00')).toBeInTheDocument();
    expect(screen.getByText('Break 5:00')).toBeInTheDocument();
    expect(screen.queryByText('Make a little time')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Set Pomodoro times' }));
    const input = screen.getByRole('spinbutton', { name: 'Pomodoro minutes' });
    for (const value of ['', '0', '241', '1.5']) {
      fireEvent.change(input, { target: { value } });
      expect(screen.getByRole('button', { name: 'Save times' })).toBeDisabled();
      expect(input).toHaveAttribute('aria-invalid', 'true');
    }
    fireEvent.change(input, { target: { value: '40' } });
    const breakInput = screen.getByRole('spinbutton', { name: 'Break minutes' });
    fireEvent.change(breakInput, { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save times' }));
    expect(screen.getByRole('timer')).toHaveTextContent('40:00');
    expect(screen.getByText('Pomodoro 40:00')).toBeInTheDocument();
    expect(screen.getByText('Break 7:00')).toBeInTheDocument();
  });

  it('resets without saving and ends early with actual elapsed time but no end notice', async () => {
    renderApp('/focus');
    expect(
      screen.queryByRole('combobox', { name: 'Use an existing task as focus goal' }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Start focus' }));
    await act(() => vi.advanceTimersByTime(30_000));
    fireEvent.click(screen.getByRole('button', { name: 'Reset timer' }));
    expect(screen.getByRole('timer')).toHaveTextContent('25:00');
    expect(useFocusStore.getState().sessions).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Start focus' }));
    await act(() => vi.advanceTimersByTime(90_000));
    act(() => {
      useFocusStore.getState().finish();
    });
    expect(useFocusStore.getState().sessions[0]).toMatchObject({
      focusedMs: 90_000,
      outcome: 'ended',
      goal: '',
    });
    expect(screen.queryByText('Session ended.')).not.toBeInTheDocument();
    expect(screen.getByRole('timer')).toHaveTextContent('05:00');
    fireEvent.click(screen.getByRole('button', { name: 'Show statistics' }));
    expect(
      within(screen.getByRole('region', { name: 'Recent focus sessions' })).getByText(
        'Focus session',
      ),
    ).toBeInTheDocument();
  });

  it('fades all controls while running and reveals them on movement or Space pause', async () => {
    renderApp('/focus');
    const cover = screen.getByRole('region', { name: 'Focus timer' });
    const times = screen.getByText('Pomodoro 25:00').parentElement;
    fireEvent.click(screen.getByRole('button', { name: 'Start focus' }));
    expect(screen.getByRole('button', { name: 'Cover toolbar' })).not.toHaveTextContent(
      'Cover toolbar',
    );
    expect(screen.getByText('Space · pause')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show statistics' })).toHaveClass('focus-control');
    expect(screen.getByRole('button', { name: 'Cover toolbar' })).toHaveClass('focus-control');
    expect(screen.getByRole('button', { name: 'Pause' }).parentElement).toHaveClass(
      'focus-control',
    );
    expect(times).toHaveClass('focus-control');
    await act(() => vi.advanceTimersByTime(119));
    expect(cover).not.toHaveClass('focus-controls-fading');
    await act(() => vi.advanceTimersByTime(1));
    expect(cover).toHaveClass('focus-controls-fading');
    fireEvent.pointerMove(cover);
    expect(cover).not.toHaveClass('focus-controls-fading');
    await act(() => vi.advanceTimersByTime(120));
    expect(cover).toHaveClass('focus-controls-fading');
    fireEvent.keyDown(cover, { key: 'Tab' });
    expect(cover).not.toHaveClass('focus-controls-fading');
    await act(() => vi.advanceTimersByTime(5_000));
    expect(cover).toHaveClass('focus-controls-fading');
    expect(screen.getByText('Space · pause')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: ' ', code: 'Space' });
    expect(screen.getByRole('button', { name: 'Resume' })).toBeInTheDocument();
    expect(cover).not.toHaveClass('focus-controls-fading');
    expect(screen.queryByText('Space · pause')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    fireEvent.click(screen.getByRole('button', { name: 'Show statistics' }));
    await act(() => vi.advanceTimersByTime(5_000));
    expect(cover).not.toHaveClass('focus-controls-fading');
    fireEvent.click(screen.getByRole('button', { name: 'Close statistics' }));
    await act(() => vi.advanceTimersByTime(120));
    expect(cover).toHaveClass('focus-controls-fading');
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(cover).not.toHaveClass('focus-controls-fading');
  });

  it('respects the sound toggle and completes without a notification', async () => {
    renderApp('/focus');
    fireEvent.click(screen.getByRole('button', { name: 'Mute completion sound' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start focus' }));
    await act(() => vi.advanceTimersByTime(25 * 60_000));
    expect(playFocusSound).not.toHaveBeenCalled();
    expect(screen.queryByText('Focus complete. Well done!')).not.toBeInTheDocument();
  });

  it('opens the shared Focus page from the dashboard', () => {
    renderApp('/dashboard');
    fireEvent.click(screen.getByRole('button', { name: 'Start focus' }));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Focus');
    expect(screen.getByRole('timer')).toBeInTheDocument();
  });

  it('keeps the app header in normal mode and restores it when a covered session pauses', () => {
    renderApp('/focus');
    const cover = screen.getByRole('region', { name: 'Focus timer' });
    expect(screen.getByRole('banner')).toHaveTextContent('Focus');
    expect(cover).toContainElement(screen.getByRole('heading', { level: 1 }));
    expect(screen.queryByRole('region', { name: 'Session settings' })).not.toBeInTheDocument();
    expect(cover).toContainElement(screen.getByRole('button', { name: 'Show statistics' }));
    expect(screen.queryByRole('region', { name: 'Focus progress' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Recent focus sessions' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Start focus' }));
    expect(screen.getByRole('banner')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cover toolbar' }));
    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('complementary', { name: 'Main navigation' }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Main navigation' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    expect(screen.getByRole('banner')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cover toolbar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Show toolbar' }));
    expect(screen.getByRole('banner')).toBeInTheDocument();
  });

  it('places display size last in the lower-right tool rail and allows cover mode before starting', () => {
    renderApp('/focus');
    const tools = screen.getByRole('toolbar', { name: 'Focus tools' });
    expect(tools).toHaveClass('bottom-5', 'right-5', 'flex-col');
    expect(
      within(tools)
        .getAllByRole('button')
        .map((button) => button.getAttribute('aria-label')),
    ).toEqual(['Show statistics', 'Choose background', 'Mute completion sound', 'Cover toolbar']);
    fireEvent.click(within(tools).getByRole('button', { name: 'Cover toolbar' }));
    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Start focus' }));
    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
    fireEvent.click(within(tools).getByRole('button', { name: 'Show toolbar' }));
    expect(screen.getByRole('banner')).toBeInTheDocument();
  });

  it('opens statistics over the cover and returns keyboard focus when closed', () => {
    renderApp('/focus');
    const trigger = screen.getByRole('button', { name: 'Show statistics' });
    const persistentPanel = document.getElementById('focus-statistics');
    const statisticsLayer = persistentPanel?.parentElement;
    const closeButton = persistentPanel?.querySelector<HTMLButtonElement>(
      'button[aria-label="Close statistics"]',
    );
    const stage = document.querySelector('.focus-stage');
    expect(persistentPanel).not.toBeNull();
    expect(closeButton).not.toBeNull();
    expect(stage).not.toHaveClass('focus-stage-obscured');
    expect(statisticsLayer).toHaveAttribute('data-open', 'false');
    expect(screen.queryByRole('dialog', { name: 'Focus statistics' })).not.toBeInTheDocument();
    trigger.focus();
    const triggerFocus = vi.spyOn(trigger, 'focus');
    const closeFocus = vi.spyOn(closeButton as HTMLButtonElement, 'focus');
    fireEvent.click(trigger);
    const panel = screen.getByRole('dialog', { name: 'Focus statistics' });
    expect(panel).toBe(persistentPanel);
    expect(document.querySelector('.focus-stage')).toBe(stage);
    expect(stage).toHaveClass('focus-stage-obscured');
    expect(statisticsLayer).toHaveAttribute('data-open', 'true');
    expect(screen.getByRole('region', { name: 'Focus timer' })).toContainElement(panel);
    expect(closeButton).toHaveFocus();
    expect(closeFocus).toHaveBeenCalledWith({ preventScroll: true });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(within(panel).getByRole('region', { name: 'Focus progress' })).toBeInTheDocument();
    expect(
      within(panel).getByRole('region', { name: 'Recent focus sessions' }),
    ).toBeInTheDocument();
    fireEvent.keyDown(panel, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.getElementById('focus-statistics')).toBe(persistentPanel);
    expect(statisticsLayer).toHaveAttribute('data-open', 'false');
    expect(document.querySelector('.focus-stage')).toBe(stage);
    expect(stage).not.toHaveClass('focus-stage-obscured');
    expect(trigger).toHaveFocus();
    expect(triggerFocus).toHaveBeenCalledWith({ preventScroll: true });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(trigger);
    fireEvent.mouseDown(document.querySelector('.focus-statistics-backdrop') as HTMLElement);
    expect(statisticsLayer).toHaveAttribute('data-open', 'false');
    expect(trigger).toHaveFocus();
    fireEvent.click(trigger);
    fireEvent.click(trigger);
    expect(statisticsLayer).toHaveAttribute('data-open', 'false');
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('button', { name: 'Close statistics' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    triggerFocus.mockRestore();
    closeFocus.mockRestore();
  });

  it('keeps the timer running while statistics are open and closes them without exiting focus mode', async () => {
    renderApp('/focus');
    const stage = document.querySelector('.focus-stage');
    fireEvent.click(screen.getByRole('button', { name: 'Start focus' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cover toolbar' }));
    const statisticsTrigger = screen.getByRole('button', { name: 'Show statistics' });
    fireEvent.click(statisticsTrigger);
    expect(stage).toHaveClass('focus-stage-obscured');
    fireEvent.click(statisticsTrigger);
    expect(stage).not.toHaveClass('focus-stage-obscured');
    fireEvent.click(statisticsTrigger);
    expect(stage).toHaveClass('focus-stage-obscured');
    await act(() => vi.advanceTimersByTime(10_000));
    expect(screen.getByRole('timer')).toHaveTextContent('24:50');
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Focus statistics' }), { key: 'Escape' });
    expect(useFocusStore.getState()).toMatchObject({ status: 'running', focusMode: true });
    expect(stage).not.toHaveClass('focus-stage-obscured');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows image choices only after the background icon is opened', async () => {
    renderApp('/focus');
    await act(async () => {});
    expect(screen.queryByRole('dialog', { name: 'Choose background' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Choose background' }));
    const panel = screen.getByRole('dialog', { name: 'Choose background' });
    expect(screen.getByRole('region', { name: 'Focus timer' })).toContainElement(panel);
    expect(within(panel).getByRole('button', { name: 'Wasserfall' })).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Regen' })).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Piano' })).toBeInTheDocument();
    expect(within(panel).getByText('No image')).toBeInTheDocument();
    expect(within(panel).getByText('No images added yet.')).toBeInTheDocument();
    expect(within(panel).getByLabelText('Add your images')).toHaveAttribute('type', 'file');
    fireEvent.keyDown(panel, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Choose background' })).not.toBeInTheDocument();
  });

  it('adds and switches between user-supplied images and keeps the choice', async () => {
    renderApp('/focus');
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: 'Choose background' }));
    const first = new File(['photo one'], 'library.png', { type: 'image/png' });
    const second = new File(['photo two'], 'mountain.jpg', { type: 'image/jpeg' });
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Add your images'), {
        target: { files: [first, second] },
      });
      await Promise.resolve();
    });
    await act(async () => {});
    expect(backgroundMocks.add).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button', { name: 'library.png' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'mountain.jpg' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(useFocusStore.getState().backgroundId).toBe('image-2');
    fireEvent.click(screen.getByRole('button', { name: 'library.png' }));
    expect(useFocusStore.getState().backgroundId).toBe('image-1');
    const savedState: unknown = JSON.parse(localStorage.getItem('uni-pilot.focus') ?? '{}');
    expect(savedState).toMatchObject({ state: { backgroundId: 'image-1' } });
    expect(screen.getByRole('region', { name: 'Focus timer' })).toHaveStyle({
      backgroundImage: expect.stringContaining('blob:library.png'),
    });
    fireEvent.click(screen.getByRole('button', { name: 'No image' }));
    expect(useFocusStore.getState().backgroundId).toBeNull();
    expect(screen.getByRole('region', { name: 'Focus timer' }).style.backgroundImage).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'library.png' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove library.png' }));
      await Promise.resolve();
    });
    await act(async () => {});
    expect(backgroundMocks.remove).toHaveBeenCalledWith('image-1');
    expect(useFocusStore.getState().backgroundId).toBeNull();
    expect(screen.queryByRole('button', { name: 'library.png' })).not.toBeInTheDocument();
  });

  it('selects and persists a built-in video with original audio and loop playback', async () => {
    renderApp('/focus');
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: 'Choose background' }));
    fireEvent.click(screen.getByRole('button', { name: 'Regen' }));

    expect(useFocusStore.getState().backgroundId).toBe('video:focus-2');
    expect(JSON.parse(localStorage.getItem('uni-pilot.focus') ?? '{}')).toMatchObject({
      state: { backgroundId: 'video:focus-2' },
    });
    const video = document.querySelector<HTMLVideoElement>('main > .focus-video-backdrop video');
    expect(video).not.toBeNull();
    expect(video?.getAttribute('src')).toBe('/focus/videos/focus-2.mp4');
    expect(video).toHaveAttribute('loop');
    expect(video?.muted).toBe(false);
    expect(video).not.toHaveAttribute('controls');

    mediaMocks.play.mockClear();
    mediaMocks.pause.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Start focus' }));
    await act(async () => {});
    expect(mediaMocks.play).toHaveBeenCalledOnce();

    if (video) video.currentTime = 12;
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(mediaMocks.pause).toHaveBeenCalled();
    expect(video?.currentTime).toBe(12);
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    await act(async () => {});
    expect(mediaMocks.play).toHaveBeenCalledTimes(2);
    expect(video?.currentTime).toBe(12);
    fireEvent.click(screen.getByRole('button', { name: 'Reset timer' }));
    expect(video?.currentTime).toBe(0);
  });

  it('keeps one video playing with original audio while navigating away', async () => {
    renderApp('/focus');
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: 'Choose background' }));
    fireEvent.click(screen.getByRole('button', { name: 'Wasserfall' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start focus' }));
    await act(async () => {});
    const video = document.querySelector<HTMLVideoElement>('main > .focus-video-backdrop video');
    const backdrop = video?.parentElement;
    mediaMocks.pause.mockClear();

    fireEvent.click(screen.getByRole('link', { name: 'Tasks' }));

    expect(document.querySelector('main > .focus-video-backdrop video')).toBe(video);
    expect(backdrop).toHaveClass('invisible', 'opacity-0');
    expect(video).not.toHaveAttribute('muted');
    expect(mediaMocks.pause).not.toHaveBeenCalled();
    expect(useFocusStore.getState()).toMatchObject({ status: 'running', phase: 'work' });
  });

  it('stops and rewinds video for the break and starts a newly selected video at zero', async () => {
    renderApp('/focus');
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: 'Set Pomodoro times' }));
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Pomodoro minutes' }), {
      target: { value: '1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save times' }));
    fireEvent.click(screen.getByRole('button', { name: 'Choose background' }));
    fireEvent.click(screen.getByRole('button', { name: 'Wasserfall' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start focus' }));
    const video = document.querySelector<HTMLVideoElement>('main > .focus-video-backdrop video');
    if (video) video.currentTime = 18;

    fireEvent.click(screen.getByRole('button', { name: 'Piano' }));
    await act(async () => {});
    expect(video?.currentTime).toBe(0);
    if (video) video.currentTime = 22;

    await act(() => vi.advanceTimersByTime(60_000));
    expect(useFocusStore.getState()).toMatchObject({ phase: 'break', status: 'running' });
    expect(mediaMocks.pause).toHaveBeenCalled();
    expect(video?.currentTime).toBe(0);
  });

  it('offers a retry when restored audio playback is blocked and falls back on media errors', async () => {
    mediaMocks.play.mockRejectedValueOnce(new DOMException('Blocked', 'NotAllowedError'));
    useFocusStore.setState({
      backgroundId: 'video:focus-3',
      phase: 'work',
      status: 'running',
      sessionId: 'restored-session',
      deadline: Date.now() + 60_000,
      remainingMs: 60_000,
    });
    renderApp('/focus');
    await act(async () => {});

    const retry = screen.getByRole('button', { name: 'Video fortsetzen' });
    fireEvent.click(retry);
    await act(async () => {});
    expect(screen.queryByRole('button', { name: 'Video fortsetzen' })).not.toBeInTheDocument();

    const video = document.querySelector<HTMLVideoElement>('main > .focus-video-backdrop video');
    fireEvent.error(video!);
    expect(video).toHaveClass('opacity-0');
    expect(screen.getByRole('timer')).toBeInTheDocument();
    expect(useFocusStore.getState().status).toBe('running');
  });
});
