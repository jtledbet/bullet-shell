import { isMuted } from './storage';

/**
 * Synthesised sound effects on raw Web Audio: no asset files. Browsers only allow audio
 * after a user gesture, so the context is created and resumed on the first touch or key.
 */
const VOLUME = 0.5;

let ctx: AudioContext | undefined;
let master: GainNode | undefined;
let noiseBuffer: AudioBuffer | undefined;
const lastPlayed = new Map<string, number>();
/** How many times each sound has actually played; read by test scripts. */
export const playCounts: Record<string, number> = {};
const unlockListeners: (() => void)[] = [];

/** Runs `fn` after every first-gesture unlock, e.g. to start music requested before audio was allowed. */
export function onUnlock(fn: () => void) {
  unlockListeners.push(fn);
}

/** The context and master output, once a gesture has created them. */
export const audioOut = () => (ctx && master ? { ctx, master } : null);

/** Half a second of white noise, shared by every noise burst. */
export function noiseSamples(c: AudioContext) {
  if (!noiseBuffer) {
    noiseBuffer = c.createBuffer(1, Math.floor(c.sampleRate / 2), c.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  return noiseBuffer;
}

function unlock() {
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = VOLUME;
    master.connect(ctx.destination);
    for (const fn of unlockListeners) fn();
  }
  // Phones suspend the context again after calls or app switches.
  if (ctx.state !== 'running') void ctx.resume().catch(() => {});
}
for (const type of ['pointerdown', 'touchend', 'keydown']) {
  window.addEventListener(type, unlock, { capture: true, passive: true });
}

export const audioState = () => ctx?.state ?? 'none';

/** Returns the start time if the sound may play now. `gap` (seconds) stops rapid repeats stacking up. */
function begin(name: string, gap: number): number | null {
  if (!ctx || !master || ctx.state !== 'running' || isMuted()) return null;
  const now = ctx.currentTime;
  if (now - (lastPlayed.get(name) ?? -1) < gap) return null;
  lastPlayed.set(name, now);
  playCounts[name] = (playCounts[name] ?? 0) + 1;
  return now;
}

/** Fades a gain in over a few ms (no click) and out by the end. */
function envelope(at: number, dur: number, vol: number) {
  const g = ctx!.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.linearRampToValueAtTime(vol, at + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  g.connect(master!);
  return g;
}

/** A pitch sweep from `from` to `to` Hz. */
function tone(at: number, type: OscillatorType, from: number, to: number, dur: number, vol: number) {
  const osc = ctx!.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(from, at);
  osc.frequency.exponentialRampToValueAtTime(to, at + dur);
  osc.connect(envelope(at, dur, vol));
  osc.start(at);
  osc.stop(at + dur + 0.02);
}

/** A burst of low-passed white noise. */
function noise(at: number, dur: number, vol: number, cutoff: number) {
  const c = ctx!;
  const src = c.createBufferSource();
  src.buffer = noiseSamples(c);
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = cutoff;
  src.connect(filter).connect(envelope(at, dur, vol));
  src.start(at, Math.random() * 0.3, dur + 0.02);
}

const vary = (hz: number, amount = 0.06) => hz * (1 + (Math.random() * 2 - 1) * amount);

export const sfx = {
  shoot() {
    const t = begin('shoot', 0.05);
    if (t !== null) tone(t, 'square', vary(720), 240, 0.07, 0.05);
  },
  hit() {
    const t = begin('hit', 0.04);
    if (t !== null) tone(t, 'triangle', vary(330), 180, 0.05, 0.1);
  },
  kill() {
    const t = begin('kill', 0.05);
    if (t === null) return;
    noise(t, 0.12, 0.16, 1800);
    tone(t, 'sine', vary(220), 70, 0.12, 0.16);
  },
  gem() {
    const t = begin('gem', 0.04);
    if (t !== null) tone(t, 'sine', vary(1040, 0.1), 1560, 0.07, 0.09);
  },
  hurt() {
    const t = begin('hurt', 0.2);
    if (t === null) return;
    tone(t, 'sawtooth', 180, 55, 0.28, 0.22);
    noise(t, 0.2, 0.2, 900);
  },
  shotgun() {
    const t = begin('shotgun', 0.1);
    if (t === null) return;
    // Crack, body, and a low boom that rolls on after.
    noise(t, 0.05, 0.3, 6000);
    noise(t, 0.22, 0.3, 1600);
    tone(t, 'sine', vary(150), 45, 0.16, 0.25);
    tone(t, 'sine', vary(80, 0.04), 28, 0.42, 0.32);
  },
  levelUp() {
    const t = begin('levelUp', 0.3);
    if (t === null) return;
    [523, 659, 784, 1047].forEach((hz, i) => tone(t + i * 0.07, 'triangle', hz, hz, 0.16, 0.14));
  },
  gameOver() {
    const t = begin('gameOver', 1);
    if (t === null) return;
    [392, 311, 233, 147].forEach((hz, i) => tone(t + i * 0.16, 'sawtooth', hz, hz * 0.94, 0.3, 0.14));
  },
  click() {
    const t = begin('click', 0.05);
    if (t !== null) tone(t, 'square', 520, 780, 0.05, 0.07);
  },
};
