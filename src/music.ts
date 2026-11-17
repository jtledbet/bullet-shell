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
      if (pos === 0) v.tone(t, roots[bar], eighth * 2.6, 0.24, 'sine', 500);
      if (pos === 3 || pos === 4) v.tone(t, fifths[bar], eighth * 0.9, 0.2, 'sine', 500);
      if (pos === 7) v.tone(t, roots[bar], eighth * 0.9, 0.18, 'sine', 500);
      if (pos === 0 || pos === 4) v.kick(t, 0.12);
      if (comp.has(step % 16)) v.chord(t, chords[bar], 0.3, 0.04, 'triangle', 2000, 0.014);
      v.tick(t, 0.04, pos % 2 ? 0.03 : 0.018, 'highpass', 7000);
    },
  };
})();

/** Pause music. SPY is kept above for later use. */
const TRACKS = [BOSSA];

let wanted = false;
let pauses = 0;
let current: Track = TRACKS[0];
let playing: { gain: GainNode; voices: Voices; timer: number; next: number; step: number } | undefined;

/** Starts or stops whichever loop should be playing now. */
export function refreshMusic() {
  const out = audioOut();
  const should = wanted && !isMuted() && document.visibilityState === 'visible' && out !== null;
  if (should && !playing) start(out!.ctx, out!.master);
  else if (!should && playing) stop();
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
export const musicState = () => ({ playing: !!playing, track: playing ? current.name : null, notes: playing?.voices.notes ?? 0 });

onUnlock(refreshMusic);
document.addEventListener('visibilitychange', refreshMusic);
