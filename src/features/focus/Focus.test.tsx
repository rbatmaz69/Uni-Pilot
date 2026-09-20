import { act, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '@/test/render';
import { useFocusStore } from '@/features/focus/store/focusStore';
import {
  playFocusCompletionSound,
  prepareFocusAudio,
  startFocusTicking,
  stopFocusTicking,
} from '@/features/focus/lib/sound';
import type { FocusMediaKind, StoredFocusMedia } from '@/features/focus/lib/media';
import { detectVideoHasAudio } from '@/features/focus/lib/videoMetadata';

const storageMocks = vi.hoisted(() => {
  const rows: StoredFocusMedia[] = [];
  return {
    rows,
    list: vi.fn((kind: FocusMediaKind) => Promise.resolve(rows.filter((row) => row.kind === kind))),
    add: vi.fn(
      (
        kind: FocusMediaKind,
        file: File,
        options: { hasAudio?: boolean; audioSource?: 'detected' | 'fallback' } = {},
      ) => {
        const id = `${kind}-${rows.filter((row) => row.kind === kind).length + 1}`;
        const row: StoredFocusMedia = {
          id,
          kind,
          name: file.name,
          file,
          addedAt: rows.length,
          ...(kind === 'video'
            ? {
                hasAudio: options.hasAudio ?? false,
                audioSource: options.audioSource ?? ('detected' as const),
              }
            : {}),
        };
        rows.push(row);
        return Promise.resolve(row);
      },
    ),
    remove: vi.fn((kind: FocusMediaKind, id: string) => {
      const index = rows.findIndex((row) => row.kind === kind && row.id === id);
      if (index !== -1) rows.splice(index, 1);
      return Promise.resolve();
    }),
    updateAudio: vi.fn((id: string, hasAudio: boolean) => {
      const row = rows.find((item) => item.id === id);
      if (!row) return Promise.reject(new Error('Missing video'));
      row.hasAudio = hasAudio;
      row.audioSource = 'manual';
      return Promise.resolve(row);
    }),
  };
});

const playbackMocks = vi.hoisted(() => ({
  play: vi.fn<() => Promise<void>>(() => Promise.resolve()),
  pause: vi.fn(),
}));

vi.mock('@/features/focus/lib/media', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/focus/lib/media')>()),
  listFocusMedia: storageMocks.list,
  addFocusMedia: storageMocks.add,
  removeFocusMedia: storageMocks.remove,
  updateFocusVideoAudio: storageMocks.updateAudio,
}));

vi.mock('@/features/focus/lib/videoMetadata', () => ({
  detectVideoHasAudio: vi.fn(() => Promise.resolve(false)),
}));

vi.mock('@/features/focus/lib/sound', () => ({
  FOCUS_COMPLETION_SOUND_DURATION_MS: 1200,
  playFocusCompletionSound: vi.fn(),
  prepareFocusAudio: vi.fn(),
  startFocusTicking: vi.fn(),
  stopFocusTicking: vi.fn(),
}));

beforeEach(() => {
  storageMocks.rows.length = 0;
  Object.defineProperty(HTMLMediaElement.prototype, 'play', {
    configurable: true,
    value: playbackMocks.play,
  });
  Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
    configurable: true,
    value: playbackMocks.pause,
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
    expect(prepareFocusAudio).toHaveBeenCalledOnce();
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
    expect(playFocusCompletionSound).toHaveBeenCalledOnce();
    expect(useFocusStore.getState().sessions[0]?.focusedMs).toBe(60_000);
    fireEvent.click(screen.getByRole('button', { name: 'Show statistics' }));
    const sessionCard = screen.getByText('Sessions').closest('.focus-stat-card');
    expect(sessionCard).not.toBeNull();
    expect(within(sessionCard as HTMLElement).getByText('1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close statistics' }));
    await act(() => vi.advanceTimersByTime(5 * 60_000));
    expect(screen.getByRole('timer')).toHaveTextContent('01:00');
    expect(useFocusStore.getState()).toMatchObject({ phase: 'work', status: 'idle' });
    expect(playFocusCompletionSound).toHaveBeenCalledTimes(2);
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
    const dialog = screen.getByRole('dialog', { name: 'Pomodoro settings' });
    expect(dialog).toHaveClass('focus-duration-dialog');
    expect(dialog.parentElement).toHaveClass('focus-duration-positioner', 'fixed');
    expect(dialog.parentElement?.parentElement).toHaveClass(
      'focus-duration-overlay',
      'fixed',
      'z-50',
    );
    expect(dialog.parentElement?.parentElement?.parentElement).toBe(document.body);
    const input = screen.getByRole('spinbutton', { name: 'Pomodoro minutes' });
    expect(input).toHaveClass('focus-duration-input');
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

  it('uses liquid glass timer controls and edits future times while running', () => {
    renderApp('/focus');
    const reset = screen.getByRole('button', { name: 'Reset timer' });
    const start = screen.getByRole('button', { name: 'Start focus' });
    const settings = screen.getByRole('button', { name: 'Set Pomodoro times' });
    expect(reset).toHaveClass('focus-transport-button', 'focus-transport-side');
    expect(start).toHaveClass('focus-transport-button', 'focus-transport-main');
    expect(settings).toHaveClass('focus-transport-button', 'focus-transport-side');

    fireEvent.click(start);
    const deadline = useFocusStore.getState().deadline;
    expect(settings).toBeEnabled();
    fireEvent.click(settings);
    expect(screen.getByText('Changes apply to the next timer.')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Pomodoro minutes' }), {
      target: { value: '40' },
    });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Break minutes' }), {
      target: { value: '7' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save times' }));

    expect(useFocusStore.getState()).toMatchObject({
      status: 'running',
      durationMinutes: 40,
      breakMinutes: 7,
      remainingMs: 25 * 60_000,
      segmentDurationMs: 25 * 60_000,
      deadline,
    });
    expect(screen.getByRole('timer')).toHaveTextContent('25:00');

    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(screen.getByRole('button', { name: 'Set Pomodoro times' })).toBeEnabled();
  });

  it('centers Pomodoro settings on the focus scene and updates the anchor after resize', () => {
    renderApp('/focus');
    const scene = screen.getByRole('region', { name: 'Focus timer' });
    const stage = scene.querySelector('.focus-stage');
    let bounds = {
      left: 280,
      top: 120,
      width: 1500,
      height: 820,
      right: 1780,
      bottom: 940,
      x: 280,
      y: 120,
      toJSON: () => ({}),
    };
    vi.spyOn(scene, 'getBoundingClientRect').mockImplementation(() => bounds);

    fireEvent.click(screen.getByRole('button', { name: 'Set Pomodoro times' }));
    const positioner = screen.getByRole('dialog', { name: 'Pomodoro settings' }).parentElement;
    expect(positioner).toHaveStyle({
      left: '280px',
      top: '120px',
      width: '1500px',
      height: '820px',
    });
    expect(stage).toHaveClass('focus-stage-settings-obscured');

    bounds = {
      left: 18,
      top: 18,
      width: 1900,
      height: 1040,
      right: 1918,
      bottom: 1058,
      x: 18,
      y: 18,
      toJSON: () => ({}),
    };
    fireEvent(window, new Event('resize'));
    expect(positioner).toHaveStyle({
      left: '18px',
      top: '18px',
      width: '1900px',
      height: '1040px',
    });

    fireEvent.click(screen.getByRole('button', { name: 'Close Pomodoro settings' }));
    expect(stage).not.toHaveClass('focus-stage-settings-obscured');
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
    const panel = screen.getByRole('dialog', { name: 'Focus statistics' });
    expect(
      within(panel).getByRole('region', { name: 'Last 28 days of focus' }),
    ).toBeInTheDocument();
    expect(within(panel).queryByText('Recent sessions')).not.toBeInTheDocument();
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
    fireEvent.keyUp(window, { key: ' ', code: 'Space' });
    await act(() => vi.advanceTimersByTime(0));
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

  it('mutes ambient audio while keeping the completion sound enabled', async () => {
    renderApp('/focus');
    fireEvent.click(screen.getByRole('button', { name: 'Mute focus audio' }));
    expect(useFocusStore.getState().ambientAudioEnabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Start focus' }));
    await act(() => vi.advanceTimersByTime(25 * 60_000));
    expect(startFocusTicking).not.toHaveBeenCalled();
    expect(playFocusCompletionSound).toHaveBeenCalledOnce();
    expect(screen.queryByText('Focus complete. Well done!')).not.toBeInTheDocument();
  });

  it('starts and stops ticking with the running timer', () => {
    renderApp('/focus');
    fireEvent.click(screen.getByRole('button', { name: 'Start focus' }));
    expect(startFocusTicking).toHaveBeenCalled();

    vi.mocked(startFocusTicking).mockClear();
    vi.mocked(stopFocusTicking).mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(stopFocusTicking).toHaveBeenCalled();
    expect(startFocusTicking).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    expect(prepareFocusAudio).toHaveBeenCalledTimes(2);
    expect(startFocusTicking).toHaveBeenCalled();

    vi.mocked(stopFocusTicking).mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Reset timer' }));
    expect(stopFocusTicking).toHaveBeenCalled();
  });

  it('mutes playing and newly added media without pausing and restores prior mute states', async () => {
    storageMocks.rows.push({
      id: 'video-1',
      kind: 'video',
      name: 'rain.mp4',
      file: new File(['video'], 'rain.mp4', { type: 'video/mp4' }),
      addedAt: 1,
      hasAudio: true,
      audioSource: 'detected',
    });
    renderApp('/focus');
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: 'Choose background' }));
    fireEvent.click(screen.getByRole('button', { name: 'rain.mp4' }));
    const panel = screen.getByRole('dialog', { name: 'Focus backgrounds' });
    const previews = Array.from(panel.querySelectorAll('video'));
    expect(previews.every((video) => video.muted)).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Close backgrounds' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start focus' }));

    const video = document.querySelector<HTMLVideoElement>('main > .focus-video-backdrop video');
    expect(video).not.toBeNull();
    fireEvent(video!, new Event('playing'));
    vi.mocked(startFocusTicking).mockClear();
    vi.mocked(stopFocusTicking).mockClear();
    playbackMocks.pause.mockClear();
    if (video) video.currentTime = 12;

    fireEvent.click(screen.getByRole('button', { name: 'Mute focus audio' }));
    expect(video?.muted).toBe(true);
    expect(video?.currentTime).toBe(12);
    expect(playbackMocks.pause).not.toHaveBeenCalled();
    expect(stopFocusTicking).toHaveBeenCalled();

    const music = document.createElement('audio');
    document.body.append(music);
    await act(async () => {});
    expect(music.muted).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Enable focus audio' }));
    expect(video?.muted).toBe(false);
    expect(music.muted).toBe(false);
    expect(previews.every((preview) => preview.muted)).toBe(true);
    expect(startFocusTicking).not.toHaveBeenCalled();

    fireEvent(video!, new Event('pause'));
    expect(startFocusTicking).toHaveBeenCalled();
    music.remove();
  });

  it('reconciles an overdue Pomodoro and break with one completion sound', () => {
    renderApp('/focus');
    act(() => {
      useFocusStore.getState().configureTimes(1, 1);
      useFocusStore.getState().start();
    });
    vi.mocked(playFocusCompletionSound).mockClear();
    vi.setSystemTime(Date.now() + 2 * 60_000);

    fireEvent(document, new Event('visibilitychange'));

    expect(useFocusStore.getState()).toMatchObject({ phase: 'work', status: 'idle' });
    expect(playFocusCompletionSound).toHaveBeenCalledOnce();
  });

  it('opens the shared Focus page from the dashboard', () => {
    renderApp('/dashboard');
    fireEvent.click(screen.getByRole('button', { name: 'Start focus' }));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Focus');
    expect(screen.getByRole('timer')).toBeInTheDocument();
  });

  it('keeps the app header covered while a session pauses and resumes', () => {
    renderApp('/focus');
    const cover = screen.getByRole('region', { name: 'Focus timer' });
    expect(screen.getByRole('banner')).toHaveTextContent('Focus');
    expect(cover).toContainElement(screen.getByRole('heading', { level: 1 }));
    expect(screen.queryByRole('region', { name: 'Session settings' })).not.toBeInTheDocument();
    expect(cover).toContainElement(screen.getByRole('button', { name: 'Show statistics' }));
    expect(screen.queryByRole('region', { name: 'Focus progress' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Last 28 days of focus' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Start focus' }));
    expect(screen.getByRole('banner')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cover toolbar' }));
    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('complementary', { name: 'Main navigation' }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('complementary', { name: 'Main navigation' }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show toolbar' }));
    expect(screen.getByRole('banner')).toBeInTheDocument();
  });

  it('reserves Space for pause and resume after the display-size control was focused', async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    renderApp('/focus');
    fireEvent.click(screen.getByRole('button', { name: 'Start focus' }));
    const displaySizeButton = screen.getByRole('button', { name: 'Cover toolbar' });
    fireEvent.click(displaySizeButton);
    displaySizeButton.focus();
    const displaySizeClicks = vi.fn();
    displaySizeButton.addEventListener('click', displaySizeClicks);

    expect(displaySizeButton).toHaveFocus();
    expect(useFocusStore.getState()).toMatchObject({ status: 'running', focusMode: true });

    await user.keyboard(' ');
    expect(useFocusStore.getState()).toMatchObject({ status: 'paused', focusMode: true });
    expect(displaySizeButton).toHaveFocus();
    expect(displaySizeClicks).not.toHaveBeenCalled();

    await user.keyboard(' ');
    expect(useFocusStore.getState()).toMatchObject({ status: 'running', focusMode: true });
    expect(screen.getByRole('button', { name: 'Show toolbar' })).toBe(displaySizeButton);
    expect(displaySizeClicks).not.toHaveBeenCalled();

    displaySizeButton.removeEventListener('click', displaySizeClicks);
  });

  it('places display size last in the lower-right tool rail and allows cover mode before starting', () => {
    renderApp('/focus');
    const tools = screen.getByRole('toolbar', { name: 'Focus tools' });
    expect(tools).toHaveClass('bottom-5', 'right-5', 'flex-col');
    expect(
      within(tools)
        .getAllByRole('button')
        .map((button) => button.getAttribute('aria-label')),
    ).toEqual(['Show statistics', 'Choose background', 'Mute focus audio', 'Cover toolbar']);
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
    expect(trigger).toHaveClass('focus-tool-hidden');
    expect(trigger).toHaveAttribute('aria-hidden', 'true');
    expect(trigger).toHaveAttribute('tabindex', '-1');
    const progress = within(panel).getByRole('region', { name: 'Focus progress' });
    expect(progress).toBeInTheDocument();
    expect(within(progress).getByText('Sessions')).toBeInTheDocument();
    expect(
      within(panel).getByRole('region', { name: 'Last 28 days of focus' }),
    ).toBeInTheDocument();
    expect(within(panel).queryByText('Recent sessions')).not.toBeInTheDocument();
    fireEvent.mouseDown(within(panel).getByRole('heading', { name: 'Focus statistics' }));
    expect(statisticsLayer).toHaveAttribute('data-open', 'true');
    fireEvent.mouseDown(panel.querySelector('.focus-stat-card') as HTMLElement);
    expect(statisticsLayer).toHaveAttribute('data-open', 'true');
    fireEvent.mouseDown(panel.querySelector('.focus-side-panel-content') as HTMLElement);
    expect(statisticsLayer).toHaveAttribute('data-open', 'false');
    expect(trigger).toHaveFocus();
    fireEvent.click(trigger);
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
    fireEvent.mouseDown(
      statisticsLayer?.querySelector('.focus-side-panel-backdrop') as HTMLElement,
    );
    expect(statisticsLayer).toHaveAttribute('data-open', 'false');
    expect(trigger).toHaveFocus();
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
    fireEvent.click(screen.getByRole('button', { name: 'Close statistics' }));
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

  it('opens backgrounds in the shared side panel and restores focus when closed', async () => {
    renderApp('/focus');
    await act(async () => {});
    const trigger = screen.getByRole('button', { name: 'Choose background' });
    const persistentPanel = document.getElementById('focus-backgrounds');
    const backgroundLayer = persistentPanel?.parentElement;
    const closeButton = persistentPanel?.querySelector<HTMLButtonElement>(
      'button[aria-label="Close backgrounds"]',
    );
    const stage = document.querySelector('.focus-stage');
    expect(persistentPanel).not.toBeNull();
    expect(closeButton).not.toBeNull();
    expect(backgroundLayer).toHaveAttribute('data-open', 'false');
    expect(screen.queryByRole('dialog', { name: 'Focus backgrounds' })).not.toBeInTheDocument();
    trigger.focus();
    const triggerFocus = vi.spyOn(trigger, 'focus');
    const closeFocus = vi.spyOn(closeButton as HTMLButtonElement, 'focus');
    fireEvent.click(trigger);
    const panel = screen.getByRole('dialog', { name: 'Focus backgrounds' });
    expect(panel).toBe(persistentPanel);
    expect(backgroundLayer).toHaveAttribute('data-open', 'true');
    expect(stage).toHaveClass('focus-stage-obscured');
    expect(closeButton).toHaveFocus();
    expect(closeFocus).toHaveBeenCalledWith({ preventScroll: true });
    expect(trigger).toHaveClass('focus-scene-button-active');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(trigger).toHaveClass('focus-tool-hidden');
    expect(trigger).toHaveAttribute('aria-hidden', 'true');
    expect(trigger).toHaveAttribute('tabindex', '-1');
    expect(screen.queryByRole('button', { name: 'Show statistics' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mute focus audio' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Focus timer' })).toContainElement(panel);
    expect(within(panel).getByText('No images added yet.')).toBeInTheDocument();
    expect(within(panel).getByText('No videos added yet.')).toBeInTheDocument();
    expect(within(panel).getByText('No music added yet.')).toBeInTheDocument();
    expect(within(panel).getByLabelText('Add your images')).toHaveAttribute('type', 'file');
    expect(within(panel).getByLabelText('Add your videos')).toHaveAttribute('type', 'file');
    expect(within(panel).getByLabelText('Add your music')).toHaveAttribute('type', 'file');
    fireEvent.mouseDown(panel.querySelector('.focus-side-panel-content') as HTMLElement);
    expect(backgroundLayer).toHaveAttribute('data-open', 'false');
    expect(trigger).toHaveFocus();
    fireEvent.click(trigger);
    fireEvent.keyDown(panel, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Focus backgrounds' })).not.toBeInTheDocument();
    expect(document.getElementById('focus-backgrounds')).toBe(persistentPanel);
    expect(backgroundLayer).toHaveAttribute('data-open', 'false');
    expect(stage).not.toHaveClass('focus-stage-obscured');
    expect(trigger).toHaveFocus();
    expect(triggerFocus).toHaveBeenCalledWith({ preventScroll: true });

    fireEvent.click(trigger);
    fireEvent.mouseDown(
      backgroundLayer?.querySelector('.focus-side-panel-backdrop') as HTMLElement,
    );
    expect(backgroundLayer).toHaveAttribute('data-open', 'false');
    expect(trigger).toHaveFocus();

    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('button', { name: 'Close backgrounds' }));
    expect(backgroundLayer).toHaveAttribute('data-open', 'false');
    triggerFocus.mockRestore();
    closeFocus.mockRestore();
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
    expect(storageMocks.add).toHaveBeenCalledTimes(2);
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
    fireEvent.click(
      within(screen.getByRole('region', { name: 'Images' })).getByRole('button', {
        name: 'Clear',
      }),
    );
    expect(useFocusStore.getState().backgroundId).toBeNull();
    expect(screen.getByRole('region', { name: 'Focus timer' }).style.backgroundImage).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'library.png' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove library.png' }));
      await Promise.resolve();
    });
    await act(async () => {});
    expect(storageMocks.remove).toHaveBeenCalledWith('image', 'image-1');
    expect(useFocusStore.getState().backgroundId).toBeNull();
    expect(screen.queryByRole('button', { name: 'library.png' })).not.toBeInTheDocument();
  });

  it('keeps three media rows visible and scrolls only the selected media library vertically', async () => {
    for (let index = 1; index <= 4; index += 1) {
      storageMocks.rows.push({
        id: `image-${index}`,
        kind: 'image',
        name: `image-${index}.png`,
        file: new File([String(index)], `image-${index}.png`, { type: 'image/png' }),
        addedAt: index,
      });
    }
    renderApp('/focus');
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: 'Choose background' }));
    const images = screen.getByRole('region', { name: 'Images' });
    const imageLibrary = within(images).getByRole('list', { name: 'Images library' });

    expect(imageLibrary).toHaveClass('focus-media-list', 'overflow-y-auto');
    expect(within(imageLibrary).getAllByRole('listitem')).toHaveLength(4);
    expect(within(imageLibrary).getAllByRole('listitem')[0]).toHaveClass('focus-media-row');

    const focusScene = screen.getByRole('region', { name: 'Focus timer' });
    const fourthRow = within(imageLibrary).getAllByRole('listitem')[3];
    if (!fourthRow) throw new Error('Expected a fourth image row.');
    const globalScroll = vi.fn();
    Object.defineProperty(fourthRow, 'scrollIntoView', {
      configurable: true,
      value: globalScroll,
    });
    vi.spyOn(imageLibrary, 'getBoundingClientRect').mockReturnValue({
      top: 0,
      bottom: 208,
    } as DOMRect);
    vi.spyOn(fourthRow, 'getBoundingClientRect').mockReturnValue({
      top: 216,
      bottom: 280,
    } as DOMRect);

    fireEvent.click(within(fourthRow).getByRole('button', { name: 'image-1.png' }));

    expect(globalScroll).not.toHaveBeenCalled();
    expect(imageLibrary.scrollTop).toBe(72);
    expect(focusScene.scrollLeft).toBe(0);
    expect(focusScene).toHaveClass('overflow-clip');
  });

  it('combines silent video with music and clears music when video audio is enabled', async () => {
    vi.mocked(detectVideoHasAudio).mockResolvedValue(false);
    renderApp('/focus');
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: 'Choose background' }));
    const silentVideo = new File(['silent video'], 'silent.mp4', { type: 'video/mp4' });
    const track = new File(['music'], 'lofi.mp3', { type: 'audio/mpeg' });

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Add your videos'), {
        target: { files: [silentVideo] },
      });
      await Promise.resolve();
    });
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Add your music'), { target: { files: [track] } });
      await Promise.resolve();
    });

    expect(useFocusStore.getState()).toMatchObject({
      backgroundId: 'video-1',
      musicId: 'music-1',
    });
    expect(screen.getByRole('button', { name: 'silent.mp4' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'lofi.mp3' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    playbackMocks.play.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Close backgrounds' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start focus' }));
    await act(async () => {});
    expect(playbackMocks.play).toHaveBeenCalledTimes(2);
    expect(document.querySelector('main > audio')).toHaveAttribute('src', 'blob:lofi.mp3');
    expect(document.querySelector('.focus-video-backdrop video')).toHaveAttribute(
      'src',
      'blob:silent.mp4',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Choose background' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'silent.mp4: mark as with audio' }));
      await Promise.resolve();
    });
    expect(storageMocks.updateAudio).toHaveBeenCalledWith('video-1', true);
    expect(useFocusStore.getState().musicId).toBeNull();
    expect(screen.getByRole('button', { name: 'lofi.mp3' })).toBeDisabled();
    expect(
      screen.getByText('Music is unavailable while the selected video uses its own audio.'),
    ).toBeInTheDocument();
  });

  it('removes selected custom music and video', async () => {
    storageMocks.rows.push(
      {
        id: 'video-1',
        kind: 'video',
        name: 'silent.webm',
        file: new File(['video'], 'silent.webm', { type: 'video/webm' }),
        addedAt: 2,
        hasAudio: false,
        audioSource: 'detected',
      },
      {
        id: 'music-1',
        kind: 'music',
        name: 'focus.ogg',
        file: new File(['music'], 'focus.ogg', { type: 'audio/ogg' }),
        addedAt: 1,
      },
    );
    useFocusStore.setState({ backgroundId: 'video-1', musicId: 'music-1' });
    renderApp('/focus');
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: 'Choose background' }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove focus.ogg' }));
      await Promise.resolve();
    });
    expect(useFocusStore.getState().musicId).toBeNull();
    expect(screen.queryByRole('button', { name: 'focus.ogg' })).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove silent.webm' }));
      await Promise.resolve();
    });
    expect(useFocusStore.getState().backgroundId).toBeNull();
    expect(storageMocks.remove).toHaveBeenCalledWith('video', 'video-1');
  });

  it('selects and persists a locally stored video with original audio and loop playback', async () => {
    storageMocks.rows.push({
      id: 'video-1',
      kind: 'video',
      name: 'rain.mp4',
      file: new File(['video'], 'rain.mp4', { type: 'video/mp4' }),
      addedAt: 1,
      hasAudio: true,
      audioSource: 'detected',
    });
    renderApp('/focus');
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: 'Choose background' }));
    fireEvent.click(screen.getByRole('button', { name: 'rain.mp4' }));

    expect(useFocusStore.getState().backgroundId).toBe('video-1');
    expect(JSON.parse(localStorage.getItem('uni-pilot.focus') ?? '{}')).toMatchObject({
      state: { backgroundId: 'video-1' },
    });
    const video = document.querySelector<HTMLVideoElement>('main > .focus-video-backdrop video');
    expect(video).not.toBeNull();
    expect(video?.getAttribute('src')).toBe('blob:rain.mp4');
    expect(video).toHaveAttribute('loop');
    expect(video?.muted).toBe(false);
    expect(video).not.toHaveAttribute('controls');

    playbackMocks.play.mockClear();
    playbackMocks.pause.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Start focus' }));
    await act(async () => {});
    expect(playbackMocks.play).toHaveBeenCalledOnce();

    if (video) video.currentTime = 12;
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(playbackMocks.pause).toHaveBeenCalled();
    expect(video?.currentTime).toBe(12);
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    await act(async () => {});
    expect(playbackMocks.play).toHaveBeenCalledTimes(2);
    expect(video?.currentTime).toBe(12);
    fireEvent.click(screen.getByRole('button', { name: 'Reset timer' }));
    expect(video?.currentTime).toBe(0);
  });

  it('keeps one video playing with original audio while navigating away', async () => {
    storageMocks.rows.push({
      id: 'video-1',
      kind: 'video',
      name: 'waterfall.mp4',
      file: new File(['video'], 'waterfall.mp4', { type: 'video/mp4' }),
      addedAt: 1,
      hasAudio: true,
      audioSource: 'detected',
    });
    renderApp('/focus');
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: 'Choose background' }));
    fireEvent.click(screen.getByRole('button', { name: 'waterfall.mp4' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start focus' }));
    await act(async () => {});
    const video = document.querySelector<HTMLVideoElement>('main > .focus-video-backdrop video');
    const backdrop = video?.parentElement;
    playbackMocks.pause.mockClear();

    fireEvent.click(screen.getByRole('link', { name: 'Tasks' }));

    expect(document.querySelector('main > .focus-video-backdrop video')).toBe(video);
    expect(backdrop).toHaveClass('invisible', 'opacity-0');
    expect(video).not.toHaveAttribute('muted');
    expect(playbackMocks.pause).not.toHaveBeenCalled();
    expect(useFocusStore.getState()).toMatchObject({ status: 'running', phase: 'work' });
  });

  it('stops and rewinds video for the break and starts a newly selected video at zero', async () => {
    storageMocks.rows.push(
      {
        id: 'video-1',
        kind: 'video',
        name: 'waterfall.mp4',
        file: new File(['video'], 'waterfall.mp4', { type: 'video/mp4' }),
        addedAt: 1,
        hasAudio: true,
        audioSource: 'detected',
      },
      {
        id: 'video-2',
        kind: 'video',
        name: 'piano.mp4',
        file: new File(['video'], 'piano.mp4', { type: 'video/mp4' }),
        addedAt: 2,
        hasAudio: true,
        audioSource: 'detected',
      },
    );
    renderApp('/focus');
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: 'Set Pomodoro times' }));
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Pomodoro minutes' }), {
      target: { value: '1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save times' }));
    fireEvent.click(screen.getByRole('button', { name: 'Choose background' }));
    fireEvent.click(screen.getByRole('button', { name: 'waterfall.mp4' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start focus' }));
    const video = document.querySelector<HTMLVideoElement>('main > .focus-video-backdrop video');
    if (video) video.currentTime = 18;

    fireEvent.click(screen.getByRole('button', { name: 'piano.mp4' }));
    await act(async () => {});
    expect(video?.currentTime).toBe(0);
    if (video) video.currentTime = 22;

    await act(() => vi.advanceTimersByTime(60_000));
    expect(useFocusStore.getState()).toMatchObject({ phase: 'break', status: 'running' });
    expect(playbackMocks.pause).toHaveBeenCalled();
    expect(video?.currentTime).toBe(0);
  });

  it('offers a retry when restored audio playback is blocked and falls back on media errors', async () => {
    playbackMocks.play.mockRejectedValueOnce(new DOMException('Blocked', 'NotAllowedError'));
    storageMocks.rows.push({
      id: 'video-3',
      kind: 'video',
      name: 'restored.mp4',
      file: new File(['video'], 'restored.mp4', { type: 'video/mp4' }),
      addedAt: 1,
      hasAudio: true,
      audioSource: 'detected',
    });
    useFocusStore.setState({
      backgroundId: 'video-3',
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
