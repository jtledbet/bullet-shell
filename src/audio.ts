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

/** Fades a gain in (over a few ms by default, so no click; longer for a swell) and out by the end. */
function envelope(at: number, dur: number, vol: number, attack = 0.004) {
  const g = ctx!.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.linearRampToValueAtTime(vol, at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  g.connect(master!);
  return g;
}

/** A pitch sweep from `from` to `to` Hz. */
function tone(at: number, type: OscillatorType, from: number, to: number, dur: number, vol: number, attack?: number) {
  const osc = ctx!.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(from, at);
  osc.frequency.exponentialRampToValueAtTime(to, at + dur);
  osc.connect(envelope(at, dur, vol, attack));
  osc.start(at);
  osc.stop(at + dur + 0.02);
}

/** A burst of filtered white noise: low-passed by default, or high-passed for a crisp click or sizzle. */
function noise(at: number, dur: number, vol: number, cutoff: number, type: BiquadFilterType = 'lowpass', attack?: number) {
  const c = ctx!;
  const src = c.createBufferSource();
  src.buffer = noiseSamples(c);
  // Longer than the shared half second: loop it.
  src.loop = true;
  const filter = c.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = cutoff;
  src.connect(filter).connect(envelope(at, dur, vol, attack));
  src.start(at, Math.random() * 0.3, dur + 0.02);
}

const vary = (hz: number, amount = 0.06) => hz * (1 + (Math.random() * 2 - 1) * amount);

export const sfx = {
  /** Pew: a crisp click, a falling zap, and a small thump underneath. */
  shoot() {
    const t = begin('shoot', 0.05);
    if (t === null) return;
    noise(t, 0.02, 0.07, 4500, 'highpass');
    tone(t, 'square', vary(900), 210, 0.065, 0.045);
    tone(t, 'triangle', vary(450), 120, 0.08, 0.07);
    tone(t, 'sine', vary(160, 0.04), 55, 0.06, 0.12);
  },
  /** A shot landing without killing: a short, dull thwack. */
  hit() {
    const t = begin('hit', 0.04);
    if (t === null) return;
    noise(t, 0.04, 0.14, 1500, 'bandpass');
    tone(t, 'triangle', vary(300), 120, 0.06, 0.12);
    tone(t, 'sine', vary(95, 0.04), 50, 0.05, 0.1);
  },
  /** A kill: a deep pop with a sizzle and a little upward sparkle. */
  kill() {
    const t = begin('kill', 0.05);
    if (t === null) return;
    noise(t, 0.14, 0.18, 2200);
    noise(t, 0.05, 0.08, 5000, 'highpass');
    tone(t, 'sine', vary(260), 60, 0.16, 0.2);
    tone(t + 0.01, 'triangle', vary(660), 990, 0.05, 0.05);
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
  /** Tutorial: a seed appears, a faint breath. */
  seed() {
    const t = begin('seed', 0.3);
    if (t === null) return;
    noise(t, 0.9, 0.05, 900, 'bandpass', 0.35);
  },
  /** Tutorial: a brood seed pops in. */
  pop() {
    const t = begin('pop', 0.08);
    if (t === null) return;
    noise(t, 0.015, 0.04, 3000, 'highpass');
    tone(t, 'sine', vary(500), 900, 0.07, 0.08);
  },
  /** Tutorial: a seed starts sinking into you, a soft hum drawn inward. */
  absorbing() {
    const t = begin('absorbing', 0.3);
    if (t === null) return;
    tone(t, 'sine', 110, 220, 0.7, 0.06, 0.3);
    tone(t, 'triangle', 220, 440, 0.7, 0.025, 0.3);
  },
  /** Tutorial: a calm seed absorbed, a warm exhale. */
  absorbedCalm() {
    const t = begin('absorbedCalm', 0.2);
    if (t === null) return;
    noise(t, 0.8, 0.06, 700, 'lowpass', 0.05);
    tone(t, 'sine', 330, 220, 0.9, 0.05, 0.05);
    tone(t, 'sine', 495, 330, 0.9, 0.03, 0.05);
  },
  /** Tutorial: an angry seed absorbed, a low throb under a sour interval. */
  absorbedAngry() {
    const t = begin('absorbedAngry', 0.2);
    if (t === null) return;
    tone(t, 'sine', 70, 45, 0.35, 0.22);
    tone(t + 0.28, 'sine', 70, 45, 0.35, 0.18);
    tone(t, 'sawtooth', 233, 233, 0.9, 0.025, 0.1);
    tone(t, 'sawtooth', 247, 247, 0.9, 0.025, 0.1);
  },
  /** Tutorial: an irritated seed bumps you, a soft thud. */
  bump() {
    const t = begin('bump', 0.1);
    if (t === null) return;
    tone(t, 'sine', 120, 60, 0.12, 0.14);
  },
  /** The tutorial ends: a low swell, darker for bullet hell, more open for bullet heaven. */
  tutorialEnd(hell: boolean) {
    const t = begin('tutorialEnd', 1);
    if (t === null) return;
    if (hell) {
      tone(t, 'sine', 41.2, 41.2, 2.4, 0.14, 0.9);
      tone(t, 'sawtooth', 55, 52, 2.4, 0.04, 0.9);
      tone(t, 'sine', 65.4, 65.4, 2.4, 0.05, 0.9);
    } else {
      for (const [hz, vol] of [[110, 0.07], [165, 0.05], [220, 0.04], [330, 0.025]]) tone(t, 'triangle', hz, hz, 2.6, vol, 0.9);
    }
  },
  /** Energy coming back: two soft rising notes. */
  heal() {
    const t = begin('heal', 0.12);
    if (t === null) return;
    tone(t, 'sine', 660, 700, 0.22, 0.06, 0.02);
    tone(t + 0.07, 'sine', 990, 1040, 0.3, 0.045, 0.02);
  },
  /** Using your power. Brace: a heavy clank. Phase: a breath of air. Burst: a snarl under the shots. */
  power(kind: 'brace' | 'phase' | 'burst') {
    const t = begin('power', 0.2);
    if (t === null) return;
    if (kind === 'brace') {
      noise(t, 0.05, 0.12, 2600, 'bandpass');
      tone(t, 'triangle', 190, 85, 0.3, 0.16);
      tone(t, 'sine', 880, 860, 0.5, 0.03);
    } else if (kind === 'phase') {
      noise(t, 0.6, 0.06, 1800, 'bandpass', 0.2);
      tone(t, 'sine', 520, 1040, 0.5, 0.04, 0.15);
    } else {
      noise(t, 0.05, 0.1, 4000, 'highpass');
      tone(t, 'sawtooth', 240, 70, 0.3, 0.07);
      tone(t, 'sine', 130, 50, 0.25, 0.16);
    }
  },
  /** The ability, first showing after the tutorial: a quiet two-note chime. */
  ready() {
    const t = begin('ready', 0.5);
    if (t === null) return;
    tone(t, 'sine', 1319, 1319, 0.35, 0.06);
    tone(t + 0.09, 'sine', 1976, 1976, 0.45, 0.045);
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
