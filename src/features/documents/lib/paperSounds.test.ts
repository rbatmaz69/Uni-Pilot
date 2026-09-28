import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPaperSounds } from '@/features/documents/lib/paperSounds';

/** Just enough of Web Audio to count what a sound schedules. */
function fakeAudio() {
  const node = () => ({
    connect: vi.fn().mockImplementation((next: unknown) => next),
    start: vi.fn(),
    stop: vi.fn(),
    type: '',
    buffer: null,
    frequency: {
      value: 0,
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
    gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
    Q: { value: 0 },
  });
  const created = { contexts: 0, oscillators: 0, sources: 0 };
  class FakeContext {
    state = 'running';
    currentTime = 0;
    sampleRate = 8000;
    destination = {};
    constructor() {
      created.contexts += 1;
    }
    createOscillator() {
      created.oscillators += 1;
      return node();
    }
    createGain = node;
    createBiquadFilter = node;
    createBufferSource() {
      created.sources += 1;
      return node();
    }
    createBuffer(_channels: number, length: number) {
      return { getChannelData: () => new Float32Array(length) };
    }
    resume = vi.fn();
  }
  vi.stubGlobal('AudioContext', FakeContext);
  return created;
}

afterEach(() => vi.unstubAllGlobals());

describe('paper sounds', () => {
  it('stays silent, and creates no audio at all, while muted', () => {
    const created = fakeAudio();
    createPaperSounds(() => false).play('turn');
    expect(created.contexts).toBe(0);
  });

  it('creates one audio context on the first sound and reuses it', () => {
    const created = fakeAudio();
    const sounds = createPaperSounds(() => true);
    sounds.play('turn');
    sounds.play('tick');
    expect(created.contexts).toBe(1);
    expect(created.sources).toBe(3);
    expect(created.oscillators).toBe(2);
  });

  it('does nothing where Web Audio is unavailable', () => {
    vi.stubGlobal('AudioContext', undefined);
    expect(() => createPaperSounds(() => true).play('riffle')).not.toThrow();
  });
});
