let audioContext: AudioContext | null = null;
let lastPlayTime = 0;
const MIN_PLAY_INTERVAL_MS = 25;

/**
 * Initializes or unlocks the shared AudioContext after a user gesture.
 */
export function prepareCalendarSound() {
  try {
    if (typeof window === 'undefined') return;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    audioContext ??= new AudioCtx();
    if (audioContext.state === 'suspended') {
      void audioContext.resume().catch(() => {});
    }
  } catch {
    // Audio is best-effort; silent fallback in environments without audio support.
  }
}

// Unlock audio context on the earliest user interaction
if (typeof window !== 'undefined') {
  const unlock = () => {
    prepareCalendarSound();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock, { passive: true, once: true });
  window.addEventListener('keydown', unlock, { passive: true, once: true });
}

/**
 * Plays a tactile, subtle micro-pop sound when hovering over a day in the monthly calendar.
 *
 * Designed with a quick frequency drop and exponential decay to feel like a crisp,
 * satisfying physical tick or bubble pop without being harsh or loud.
 */
export function playDayHoverSound(dayNumber?: number) {
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  if (now - lastPlayTime < MIN_PLAY_INTERVAL_MS) {
    return;
  }
  lastPlayTime = now;

  try {
    prepareCalendarSound();
    if (!audioContext || audioContext.state !== 'running') return;

    const ctx = audioContext;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    // Base frequency around 560Hz with slight melodic step per day
    const baseFreq = 560;
    const freq = dayNumber ? baseFreq + (dayNumber % 7) * 18 : baseFreq;

    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.72, t + 0.028);

    // Fast linear attack to eliminate digital click, followed by rapid exponential decay
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(0.045, t + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.032);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(t);
    osc.stop(t + 0.035);

    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  } catch {
    // Audio is best-effort; never crash UI on audio failure.
  }
}

/** Resets internal audio state for test isolation. */
export function resetCalendarSoundForTesting() {
  audioContext = null;
  lastPlayTime = 0;
}
