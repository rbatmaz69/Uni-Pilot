/**
 * Small, file-free notebook sounds synthesised with Web Audio: filtered noise
 * for paper, short sine tones for clicks. The audio context is created on the
 * first sound, which always follows a user gesture, so autoplay rules hold.
 */
export type PaperSound = 'turn' | 'riffle' | 'cover' | 'tab' | 'tick' | 'ribbon';

type AudioContextConstructor = typeof AudioContext;

function createContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Context =
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: AudioContextConstructor }).webkitAudioContext;
  if (!Context) return null;
  try {
    return new Context();
  } catch {
    return null;
  }
}

function tone(
  context: AudioContext,
  start: number,
  frequency: number,
  duration: number,
  volume: number,
  type: OscillatorType = 'sine',
) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

/** One fibrous burst of paper noise, swept down in pitch as the sheet settles. */
function paper(
  context: AudioContext,
  start: number,
  duration: number,
  frequency: number,
  volume: number,
) {
  const length = Math.ceil(context.sampleRate * duration);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < length; index += 1) {
    data[index] = (Math.random() * 2 - 1) * Math.sin((index / length) * Math.PI);
  }
  const source = context.createBufferSource();
  const band = context.createBiquadFilter();
  const soften = context.createBiquadFilter();
  const gain = context.createGain();
  source.buffer = buffer;
  band.type = 'bandpass';
  band.frequency.setValueAtTime(frequency * 1.25, start);
  band.frequency.exponentialRampToValueAtTime(frequency * 0.7, start + duration);
  band.Q.value = 0.7;
  soften.type = 'lowpass';
  soften.frequency.value = 4200;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + Math.min(0.018, duration * 0.22));
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  source.connect(band).connect(soften).connect(gain).connect(context.destination);
  source.start(start);
}

const PLAYERS: Record<PaperSound, (context: AudioContext, now: number) => void> = {
  // A sheet lifting, flexing, then settling.
  turn: (context, now) => {
    paper(context, now, 0.075, 1850, 0.025);
    paper(context, now + 0.052, 0.16, 950, 0.048);
    paper(context, now + 0.16, 0.11, 1350, 0.027);
  },
  // Several sheets slipping past the thumb.
  riffle: (context, now) => {
    for (let sheet = 0; sheet < 5; sheet += 1)
      paper(context, now + sheet * 0.055, 0.07, 1500 + sheet * 90, 0.03 - sheet * 0.003);
  },
  // The cover swinging open, landing with a soft thud.
  cover: (context, now) => {
    paper(context, now, 0.22, 700, 0.035);
    tone(context, now + 0.2, 92, 0.16, 0.05, 'triangle');
  },
  tab: (context, now) => tone(context, now, 780, 0.05, 0.03),
  tick: (context, now) => {
    tone(context, now, 520, 0.045, 0.03);
    tone(context, now + 0.042, 780, 0.07, 0.024);
  },
  ribbon: (context, now) => {
    paper(context, now, 0.09, 2400, 0.018);
    tone(context, now + 0.05, 360, 0.04, 0.016, 'triangle');
  },
};

export type PaperSounds = { play: (sound: PaperSound) => void };

export function createPaperSounds(enabled: () => boolean): PaperSounds {
  let context: AudioContext | null = null;
  return {
    play(sound) {
      if (!enabled()) return;
      context ??= createContext();
      if (!context) return;
      if (context.state === 'suspended') void context.resume();
      try {
        PLAYERS[sound](context, context.currentTime);
      } catch {
        // Sound is decoration; never let it interrupt writing.
      }
    },
  };
}
