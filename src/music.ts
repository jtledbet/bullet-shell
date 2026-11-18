import { audioOut, noiseSamples, onUnlock } from './audio';
import { isMuted } from './storage';

/**
 * Pause music: short original loops synthesised on the fly and scheduled a little ahead of
 * the audio clock. Plays only while paused, unmuted, and with the page visible.
 */
const MUSIC_VOLUME = 0.55;
const FADE_IN = 0.4;
const FADE_OUT = 0.25;
/** How far ahead notes are scheduled (s) and how often the scheduler runs (ms). */
const LOOKAHEAD = 0.2;
const TICK_MS = 40;

type Wave = OscillatorType;

/** Plays the notes for one eighth-note step of a loop, starting at time `t`. */
interface Track {
  name: string;
  bpm: number;
  /** Loop length in eighth notes. */
  steps: number;
  play(v: Voices, step: number, t: number, eighth: number): void;
}

/** Instrument helpers bound to one music output. */
class Voices {
  notes = 0;
  constructor(private c: AudioContext, private out: AudioNode) {}

  private env(t: number, dur: number, vol: number, attack: number) {
    const g = this.c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(this.out);
    return g;
  }

  /** A pitched note (MIDI number) through a low-pass filter. */
  tone(t: number, midi: number, dur: number, vol: number, wave: Wave, cutoff: number, attack = 0.006) {
    const osc = this.c.createOscillator();
    osc.type = wave;
    osc.frequency.value = 440 * 2 ** ((midi - 69) / 12);
    const filter = this.c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    osc.connect(filter).connect(this.env(t, dur, vol, attack));
    osc.start(t);
    osc.stop(t + dur + 0.05);
    this.notes++;
  }

  /** A filtered noise tick (brushes, shaker, rim). */
  tick(t: number, dur: number, vol: number, type: BiquadFilterType, freq: number) {
    const src = this.c.createBufferSource();
    src.buffer = noiseSamples(this.c);
    const filter = this.c.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    src.connect(filter).connect(this.env(t, dur, vol, 0.002));
    src.start(t, Math.random() * 0.3, dur + 0.02);
    this.notes++;
  }

  /** A soft kick: a sine dropping in pitch. */
  kick(t: number, vol: number) {
    const osc = this.c.createOscillator();
    osc.frequency.setValueAtTime(110, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    osc.connect(this.env(t, 0.18, vol, 0.004));
    osc.start(t);
    osc.stop(t + 0.25);
    this.notes++;
  }

  /** A chord, lightly strummed from the lowest note up. */
  chord(t: number, notes: number[], dur: number, vol: number, wave: Wave, cutoff: number, strum = 0) {
    notes.forEach((n, i) => this.tone(t + i * strum, n, dur, vol, wave, cutoff));
  }
}

/**
 * Tucked away for later (not played): Max liked it but chose the bossa nova for pause.
 * Spy thriller: A minor, swung, with a descending line under the minor chord, a walking
 * triangle bass, muted square-wave chords on the off-beats, and brushes.
 */
export const SPY: Track = (() => {
  // Eight bars: Am, Am(maj7), Am7, Am6, Dm7, Dm6, E7, E7(b9).
  const chords = [
    [57, 60, 64], [56, 60, 64], [55, 60, 64], [54, 60, 64],
    [53, 57, 60], [53, 57, 59], [56, 62, 64], [56, 62, 65],
  ];
  // Walking bass, one note per beat.
  const bass = [
    [45, 48, 52, 50], [45, 48, 52, 56], [45, 48, 55, 52], [45, 47, 48, 49],
    [50, 53, 57, 53], [50, 47, 45, 44], [40, 44, 47, 50], [52, 50, 47, 44],
  ];
  return {
    name: 'spy',
    bpm: 116,
    steps: 64,
    play(v, step, t, eighth) {
      const bar = Math.floor(step / 8);
      const pos = step % 8;
      // Swing: off-beat eighths land a third of an eighth late.
      const at = pos % 2 ? t + eighth / 3 : t;
      if (pos % 2 === 0) v.tone(t, bass[bar][pos / 2], eighth * 1.8, 0.22, 'triangle', 700);
      if (pos === 3 || pos === 7) v.chord(at, chords[bar], 0.14, 0.045, 'square', 1300);
      v.tick(at, 0.05, pos % 2 ? 0.035 : 0.02, 'highpass', 6500);
      if (pos === 2 || pos === 6) v.tick(t, 0.03, 0.05, 'bandpass', 1800);
    },
  };
})();

/**
 * Bossa nova: a ii-V-I-VI in C with a nylon-ish guitar on a syncopated two-bar pattern,
 * root-fifth bass, soft kick, and shaker.
 */
const BOSSA: Track = (() => {
  // Four bars: Dm9, G13, Cmaj9, A7(b9).
  const chords = [
    [53, 57, 60, 64], [53, 59, 64], [52, 59, 62, 67], [55, 61, 64, 70],
  ];
  const roots = [38, 43, 36, 45];
  const fifths = [45, 50, 43, 52];
  /** Guitar hits within a two-bar cycle, in eighths. */
  const comp = new Set([0, 3, 6, 10, 13]);
  return {
    name: 'bossa',
    bpm: 132,
    steps: 32,
    play(v, step, t, eighth) {
      const bar = Math.floor(step / 8);
      const pos = step % 8;
      // Each bass note is doubled an octave up, quietly: phone speakers can't sound the low one at all.
      const bass = (note: number, len: number, vol: number) => {
        v.tone(t, note, eighth * len, vol, 'sine', 500);
        v.tone(t, note + 12, eighth * len, vol * 0.4, 'triangle', 1100);
      };
      if (pos === 0) bass(roots[bar], 2.6, 0.24);
      if (pos === 3 || pos === 4) bass(fifths[bar], 0.9, 0.2);
      if (pos === 7) bass(roots[bar], 0.9, 0.18);
      if (pos === 0 || pos === 4) v.kick(t, 0.12);
      if (comp.has(step % 16)) v.chord(t, chords[bar], 0.3, 0.085, 'triangle', 2000, 0.014);
      v.tick(t, 0.04, pos % 2 ? 0.045 : 0.028, 'highpass', 7000);
    },
  };
})();

/** Pause music. SPY is kept above for later use. */
const TRACKS = [BOSSA];

let wanted = false;
let pauses = 0;
let current: Track = TRACKS[0];
let playing: { gain: GainNode; voices: Voices; timer: number; next: number; step: number } | undefined;

/** Starts or stops whichever loop should be playing now, and the in-game hum. */
export function refreshMusic() {
  const out = audioOut();
  const audible = !isMuted() && document.visibilityState === 'visible' && out !== null;
  const should = wanted && audible;
  if (should && !playing) start(out!.ctx, out!.master);
  else if (!should && playing) stop();
  // The hum gives way to the pause music.
  const shouldHum = humWanted && !humResting && !wanted && audible;
  if (shouldHum && !hum) startHum(out!.ctx, out!.master);
  else if (!shouldHum && hum) stopHum();
}

/**
 * In-game hum: a low, slightly detuned drone that swells as you lose health. Quiet at full
 * health; lower health opens the filter, adds a dissonant note a semitone up, and quickens
 * a slow throb toward a heartbeat.
 */
const HUM_ROOT = 55;
const HUM_QUIET = 0.05;
const HUM_LOUD = 0.26;
const HUM_FADE = 0.6;
/** Seconds for the hum to settle on a new danger level. */
const HUM_GLIDE = 0.35;

let humWanted = false;
let humResting = false;
let danger = 0;
let hum: { out: GainNode; filter: BiquadFilterNode; rumble: GainNode; dissonance: GainNode; lfo: OscillatorNode; depth: GainNode; oscs: OscillatorNode[] } | undefined;

/** Called with true when a game starts and false when it ends. */
export function setHum(on: boolean) {
  humWanted = on;
  humResting = false;
  if (on) danger = 0;
  refreshMusic();
}

/** The hum rests while a level-up choice is on screen, and comes back where it left off. */
export function restHum(on: boolean) {
  humResting = on;
  refreshMusic();
}

/** 0 at full health, 1 at none. Cheap to call every frame. */
export function setDanger(d: number) {
  d = Math.min(1, Math.max(0, d));
  if (Math.abs(d - danger) < 0.005) return;
  danger = d;
  if (hum) shapeHum();
}

function shapeHum() {
  const h = hum!;
  const now = h.out.context.currentTime;
  const d = danger;
  h.out.gain.setTargetAtTime(HUM_QUIET + (HUM_LOUD - HUM_QUIET) * d ** 1.5, now, HUM_GLIDE);
  h.filter.frequency.setTargetAtTime(120 + 900 * d * d, now, HUM_GLIDE);
  h.dissonance.gain.setTargetAtTime(0.7 * d * d, now, HUM_GLIDE);
  h.lfo.frequency.setTargetAtTime(0.18 + 1.9 * d, now, HUM_GLIDE);
  // The throb dips the drone by up to this much.
  const depth = 0.15 + 0.4 * d;
  h.rumble.gain.setTargetAtTime(1 - depth, now, HUM_GLIDE);
  h.depth.gain.setTargetAtTime(depth, now, HUM_GLIDE);
}

function startHum(c: AudioContext, master: GainNode) {
  const out = c.createGain();
  out.gain.value = 0;
  out.connect(master);
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = 3;
  filter.connect(out);
  const rumble = c.createGain();
  rumble.connect(filter);
  const dissonance = c.createGain();
  dissonance.gain.value = 0;
  dissonance.connect(rumble);
  const osc = (type: OscillatorType, hz: number, to: AudioNode) => {
    const o = c.createOscillator();
    o.type = type;
    o.frequency.value = hz;
    o.connect(to);
    o.start();
    return o;
  };
  // A slow sine wobbling the drone's level: the throb.
  const depth = c.createGain();
  depth.connect(rumble.gain);
  const lfo = osc('sine', 0.2, depth);
  const oscs = [
    osc('sawtooth', HUM_ROOT, rumble),
    osc('sawtooth', HUM_ROOT * 1.006, rumble),
    osc('sine', HUM_ROOT / 2, rumble),
    osc('sawtooth', HUM_ROOT * 2 ** (1 / 12), dissonance),
    lfo,
  ];
  hum = { out, filter, rumble, dissonance, lfo, depth, oscs };
  shapeHum();
  // Fade in rather than jump to the level shapeHum set.
  out.gain.cancelScheduledValues(c.currentTime);
  out.gain.setValueAtTime(0, c.currentTime);
  out.gain.linearRampToValueAtTime(HUM_QUIET + (HUM_LOUD - HUM_QUIET) * danger ** 1.5, c.currentTime + HUM_FADE);
}

function stopHum() {
  const h = hum!;
  hum = undefined;
  const now = h.out.context.currentTime;
  h.out.gain.cancelScheduledValues(now);
  h.out.gain.setValueAtTime(h.out.gain.value, now);
  h.out.gain.linearRampToValueAtTime(0, now + FADE_OUT);
  for (const o of h.oscs) o.stop(now + FADE_OUT + 0.05);
  window.setTimeout(() => h.out.disconnect(), (FADE_OUT + 0.1) * 1000);
}

/** Called with true when the game pauses and false when it resumes or restarts. */
export function setPauseMusic(on: boolean) {
  if (on && !wanted) current = TRACKS[pauses++ % TRACKS.length];
  wanted = on;
  refreshMusic();
}

function start(c: AudioContext, master: GainNode) {
  const gain = c.createGain();
  gain.gain.setValueAtTime(0, c.currentTime);
  gain.gain.linearRampToValueAtTime(MUSIC_VOLUME, c.currentTime + FADE_IN);
  gain.connect(master);
  const state = { gain, voices: new Voices(c, gain), timer: 0, next: c.currentTime + 0.05, step: 0 };
  const eighth = 30 / current.bpm;
  const track = current;
  const schedule = () => {
    while (state.next < c.currentTime + LOOKAHEAD) {
      track.play(state.voices, state.step, state.next, eighth);
      state.next += eighth;
      state.step = (state.step + 1) % track.steps;
    }
  };
  schedule();
  state.timer = window.setInterval(schedule, TICK_MS);
  playing = state;
}

function stop() {
  const p = playing!;
  playing = undefined;
  window.clearInterval(p.timer);
  const now = p.gain.context.currentTime;
  p.gain.gain.cancelScheduledValues(now);
  p.gain.gain.setValueAtTime(p.gain.gain.value, now);
  p.gain.gain.linearRampToValueAtTime(0, now + FADE_OUT);
  // Disconnecting also silences notes already scheduled past the fade.
  window.setTimeout(() => p.gain.disconnect(), (FADE_OUT + 0.1) * 1000);
}

/** For test scripts: what is playing and how many notes it has scheduled. */
export const musicState = () => ({
  playing: !!playing,
  track: playing ? current.name : null,
  notes: playing?.voices.notes ?? 0,
  hum: !!hum,
  danger,
  humLevel: hum ? hum.out.gain.value : 0,
});

onUnlock(refreshMusic);
document.addEventListener('visibilitychange', refreshMusic);
