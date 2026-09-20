let audio: AudioContext | null = null;
let tickTimer: number | null = null;

export const FOCUS_COMPLETION_SOUND_DURATION_MS = 1200;

/** Called by a user gesture so later timer sounds are allowed to play. */
export function prepareFocusAudio() {
  try {
    audio ??= new AudioContext();
    void audio.resume().catch(() => {});
  } catch {
    // Timer state remains authoritative when audio is unavailable or blocked.
  }
}

function playFocusTick() {
  if (!audio || audio.state !== 'running') return;
  try {
    const context = audio;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const start = context.currentTime;
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(1250, start);
    oscillator.frequency.exponentialRampToValueAtTime(850, start + 0.035);
    gain.gain.setValueAtTime(0.035, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.04);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.045);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
  } catch {
    // A failed tick must never affect the timer.
  }
}

/** Starts a one-second cadence. Repeated calls preserve the current cadence. */
export function startFocusTicking() {
  if (tickTimer !== null) return;
  tickTimer = window.setInterval(playFocusTick, 1000);
}

export function stopFocusTicking() {
  if (tickTimer === null) return;
  window.clearInterval(tickTimer);
  tickTimer = null;
}

export function playFocusCompletionSound() {
  if (!audio || audio.state !== 'running') return;
  try {
    const context = audio;
    [523.25, 659.25, 783.99].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = context.currentTime + index * 0.2;
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.12, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.7);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.75);
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
      };
    });
  } catch {
    // Audio is best-effort; never interrupt saving a completed session.
  }
}
