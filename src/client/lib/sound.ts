import { prefs } from './prefs';
import { createStore } from './store';

/** Sound effects synthesised with Web Audio, so there are no audio files to load. */

export const soundSettings = createStore({ muted: prefs.muted });

let ctx: AudioContext | null = null;
let noiseBuffer: AudioBuffer | null = null;

/** Browsers (iOS especially) only allow audio after a tap; call this from one. */
export function unlockAudio(): void {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    ctx = null;
  }
}

export function setMuted(muted: boolean): void {
  prefs.muted = muted;
  soundSettings.set({ muted });
}

function audio(): AudioContext | null {
  if (soundSettings.get().muted || !ctx || ctx.state !== 'running') return null;
  return ctx;
}

interface ToneOptions {
  freq: number;
  to?: number;
  type?: OscillatorType;
  at?: number;
  duration?: number;
  gain?: number;
}

function tone({ freq, to, type = 'sine', at = 0, duration = 0.15, gain = 0.18 }: ToneOptions): void {
  const c = audio();
  if (!c) return;
  const start = c.currentTime + at;
  const osc = c.createOscillator();
  const amp = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, start + duration);
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.exponentialRampToValueAtTime(gain, start + 0.01);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(amp).connect(c.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

function noise({ at = 0, duration = 0.12, gain = 0.25, from = 3000, to = 800 } = {}): void {
  const c = audio();
  if (!c) return;
  if (!noiseBuffer) {
    noiseBuffer = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  const start = c.currentTime + at;
  const source = c.createBufferSource();
  const filter = c.createBiquadFilter();
  const amp = c.createGain();
  source.buffer = noiseBuffer;
  filter.type = 'bandpass';
  filter.Q.value = 0.9;
  filter.frequency.setValueAtTime(from, start);
  filter.frequency.exponentialRampToValueAtTime(to, start + duration);
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.exponentialRampToValueAtTime(gain, start + 0.015);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  source.connect(filter).connect(amp).connect(c.destination);
  source.start(start, Math.random() * 0.5);
  source.stop(start + duration + 0.02);
}

export const sfx = {
  play() {
    noise({ duration: 0.11, from: 4000, to: 1200 });
    tone({ freq: 220, to: 120, type: 'triangle', at: 0.06, duration: 0.08, gain: 0.2 });
  },
  draw() {
    noise({ duration: 0.09, gain: 0.14, from: 1500, to: 3500 });
  },
  deal() {
    for (let i = 0; i < 5; i++) noise({ at: i * 0.07, duration: 0.06, gain: 0.12, from: 2500, to: 4000 });
  },
  turn() {
    tone({ freq: 784, duration: 0.14, gain: 0.16 });
    tone({ freq: 1175, at: 0.11, duration: 0.25, gain: 0.16 });
  },
  tick() {
    tone({ freq: 1400, type: 'square', duration: 0.03, gain: 0.05 });
  },
  skip() {
    tone({ freq: 260, to: 90, type: 'square', duration: 0.22, gain: 0.1 });
  },
  reverse() {
    tone({ freq: 300, to: 900, type: 'triangle', duration: 0.16, gain: 0.14 });
    tone({ freq: 900, to: 300, type: 'triangle', at: 0.16, duration: 0.16, gain: 0.14 });
  },
  color() {
    [523, 659, 784, 1047].forEach((freq, i) => tone({ freq, at: i * 0.05, duration: 0.18, gain: 0.12 }));
  },
  hit() {
    tone({ freq: 400, to: 140, type: 'sawtooth', duration: 0.3, gain: 0.1 });
    tone({ freq: 300, to: 100, type: 'sawtooth', at: 0.25, duration: 0.4, gain: 0.1 });
  },
  whoosh() {
    noise({ duration: 0.45, gain: 0.3, from: 300, to: 5000 });
  },
  jump() {
    tone({ freq: 200, to: 1800, type: 'square', duration: 0.12, gain: 0.08 });
    tone({ freq: 1800, type: 'triangle', at: 0.12, duration: 0.15, gain: 0.1 });
  },
  lastCard() {
    for (let i = 0; i < 3; i++) tone({ freq: 1320, type: 'square', at: i * 0.12, duration: 0.08, gain: 0.07 });
  },
  win() {
    [523, 659, 784, 1047, 784, 1047].forEach((freq, i) =>
      tone({ freq, type: 'triangle', at: i * 0.11, duration: i === 5 ? 0.6 : 0.16, gain: 0.16 }),
    );
  },
  pop() {
    tone({ freq: 600, to: 1200, duration: 0.08, gain: 0.12 });
  },
  nope() {
    tone({ freq: 150, type: 'square', duration: 0.1, gain: 0.06 });
  },
};
