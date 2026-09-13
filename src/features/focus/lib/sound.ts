let audio: AudioContext | null = null;

/** Called by a user gesture so browsers can play the later completion chime. */
export function prepareFocusSound() {
  try {
    audio ??= new AudioContext();
    void audio.resume().catch(() => {});
  } catch {
    // The persistent in-app completion message also works without audio support.
  }
}

export function playFocusSound() {
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
