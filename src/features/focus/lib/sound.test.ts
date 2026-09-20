import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('focus audio', () => {
  const oscillators: Array<{
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
  }> = [];

  beforeEach(() => {
    vi.useFakeTimers();
    oscillators.length = 0;
    class AudioContextMock {
      state = 'running';
      currentTime = 0;
      destination = {};
      resume = vi.fn(() => Promise.resolve());
      createOscillator() {
        const oscillator = {
          type: 'sine',
          frequency: {
            value: 0,
            setValueAtTime: vi.fn(),
            exponentialRampToValueAtTime: vi.fn(),
          },
          connect: vi.fn(),
          disconnect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn(),
          onended: null as (() => void) | null,
        };
        oscillators.push(oscillator);
        return oscillator;
      }
      createGain() {
        return {
          gain: {
            setValueAtTime: vi.fn(),
            linearRampToValueAtTime: vi.fn(),
            exponentialRampToValueAtTime: vi.fn(),
          },
          connect: vi.fn(),
          disconnect: vi.fn(),
        };
      }
    }
    vi.stubGlobal('AudioContext', AudioContextMock);
    vi.resetModules();
  });

  afterEach(async () => {
    const { stopFocusTicking } = await import('@/features/focus/lib/sound');
    stopFocusTicking();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('waits one second for the first tick and keeps a one-second cadence', async () => {
    const { prepareFocusAudio, startFocusTicking, stopFocusTicking } =
      await import('@/features/focus/lib/sound');
    prepareFocusAudio();
    startFocusTicking();
    startFocusTicking();

    vi.advanceTimersByTime(999);
    expect(oscillators).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(oscillators).toHaveLength(1);
    vi.advanceTimersByTime(1000);
    expect(oscillators).toHaveLength(2);

    stopFocusTicking();
    vi.advanceTimersByTime(2000);
    expect(oscillators).toHaveLength(2);
  });

  it('plays the three-note completion sound independently of ticking', async () => {
    const { playFocusCompletionSound, prepareFocusAudio } =
      await import('@/features/focus/lib/sound');
    prepareFocusAudio();
    playFocusCompletionSound();

    expect(oscillators).toHaveLength(3);
    expect(oscillators.every((oscillator) => oscillator.start.mock.calls.length === 1)).toBe(true);
  });
});
