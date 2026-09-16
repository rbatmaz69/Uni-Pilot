import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  playDayHoverSound,
  prepareCalendarSound,
  resetCalendarSoundForTesting,
} from './calendarSound';

describe('calendar day hover sound', () => {
  let mockOscillator: {
    type: string;
    frequency: {
      setValueAtTime: ReturnType<typeof vi.fn>;
      exponentialRampToValueAtTime: ReturnType<typeof vi.fn>;
    };
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    onended: (() => void) | null;
  };
  let mockGain: {
    gain: {
      setValueAtTime: ReturnType<typeof vi.fn>;
      linearRampToValueAtTime: ReturnType<typeof vi.fn>;
      exponentialRampToValueAtTime: ReturnType<typeof vi.fn>;
    };
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
  };
  let mockAudioContext: {
    state: string;
    currentTime: number;
    destination: Record<string, unknown>;
    createOscillator: ReturnType<typeof vi.fn>;
    createGain: ReturnType<typeof vi.fn>;
    resume: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    resetCalendarSoundForTesting();
    mockOscillator = {
      type: 'sine',
      frequency: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      onended: null,
    };

    mockGain = {
      gain: {
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
      disconnect: vi.fn(),
    };

    mockAudioContext = {
      state: 'running',
      currentTime: 0.1,
      destination: {},
      createOscillator: vi.fn(() => mockOscillator),
      createGain: vi.fn(() => mockGain),
      resume: vi.fn(() => Promise.resolve()),
    };

    // Provide AudioContext on window
    const MockAudioContext = vi.fn(function () {
      return mockAudioContext;
    });
    (window as unknown as { AudioContext: unknown }).AudioContext = MockAudioContext;
  });

  it('runs safely without error when audio context is unavailable', () => {
    (window as unknown as { AudioContext: unknown }).AudioContext = undefined;
    expect(() => prepareCalendarSound()).not.toThrow();
    expect(() => playDayHoverSound(5)).not.toThrow();
  });

  it('initializes and creates sound nodes when playing hover sound', () => {
    playDayHoverSound(5);
    expect(mockAudioContext.createOscillator).toHaveBeenCalled();
    expect(mockAudioContext.createGain).toHaveBeenCalled();
    expect(mockOscillator.start).toHaveBeenCalled();
    expect(mockOscillator.stop).toHaveBeenCalled();
  });

  it('cleans up audio nodes when sound ends', () => {
    playDayHoverSound(6);
    if (mockOscillator.onended) {
      mockOscillator.onended();
    }
    expect(mockOscillator.disconnect).toHaveBeenCalled();
    expect(mockGain.disconnect).toHaveBeenCalled();
  });
});
