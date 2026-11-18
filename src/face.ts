import Phaser from 'phaser';

/** What the face responds to each frame. Everything is 0..1 unless noted. */
export interface FaceState {
  x: number;
  y: number;
  /** The core's size relative to normal, and its opacity. */
  size: number;
  alpha: number;
  /** The core's colour (0xRRGGBB): the face picks ink that shows against it. */
  colour: number;
  /** How frightened it is right now: low health, a crowd, something angry coming. */
  fear: number;
  /** How far the core has gone down each path. These move very slowly. */
  gentle: number;
  dark: number;
  stern: number;
  /** Unit vector toward whatever it is looking at; zero looks straight ahead. */
  lookX: number;
  lookY: number;
  /** Eyes closing while it takes a seed in. */
  shut: number;
}

const INK = 0x1e1b2e;
const PALE_INK = 0xffe8d2;
const EYE_GLOW = 0xffd08a;

/**
 * The core's face: two eyes, two brows and a mouth, drawn fresh each frame from a handful of
 * numbers that ease toward where they should be. It starts flat and a little scared. Fear
 * widens the eyes and tightens the mouth; the gentle path softens it into a small smile; the
 * dark path narrows the eyes, lowers the brows and, once the core itself has gone dark, makes
 * the eyes glow. Moments (a hit, a level-up) pass across it briefly.
 */
export class Face {
  private readonly g: Phaser.GameObjects.Graphics;
  private eye = 1.08;
  private brow = 0.35;
  private curve = 0;
  private width = 1;
  private open = 0;
  private sweat = 0;
  private smirk = 0;
  private lx = 0;
  private ly = 0;
  private blinkIn = 2.5;
  private blinking = 0;
  private wince = 0;
  private joy = 0;
  private paleInk = false;

  constructor(scene: Phaser.Scene, depth: number) {
    this.g = scene.add.graphics().setDepth(depth);
  }

  /** A passing moment: a wince when hit, a brief smile at something good. */
  react(kind: 'hit' | 'joy') {
    if (kind === 'hit') this.wince = 0.35;
    else this.joy = 0.9;
  }

  /** What the face is doing, for test scripts. */
  get look() {
    return { eye: this.eye, brow: this.brow, curve: this.curve, open: this.open, sweat: this.sweat, paleInk: this.paleInk };
  }

  update(dt: number, s: FaceState) {
    this.wince = Math.max(0, this.wince - dt);
    this.joy = Math.max(0, this.joy - dt);
    this.blinking = Math.max(0, this.blinking - dt);
    this.blinkIn -= dt;
    if (this.blinkIn <= 0) {
      this.blinking = 0.11;
      // Frightened things blink more.
      this.blinkIn = Phaser.Math.FloatBetween(2.2, 5.5) * (1 - 0.4 * s.fear);
    }

    const { fear, gentle, dark, stern } = s;
    // Brow: positive is worried (inner ends up), negative is angry (inner ends down).
    let eye = 1.08 + 0.3 * fear - 0.32 * dark - 0.14 * stern - 0.1 * gentle;
    let brow = 0.35 + 0.6 * fear - 1.3 * dark - 0.55 * stern - 0.3 * gentle;
    // Mouth curve: positive smiles, negative frowns.
    let curve = -0.05 - 0.45 * fear * (1 - gentle) * (1 - dark) + 0.8 * gentle + 0.35 * dark;
    let width = 1 - 0.35 * fear + 0.12 * dark;
    let open = Math.max(0, fear - 0.72) * 2.4;
    const sweat = Math.max(0, fear - 0.5) * 2 * (1 - dark);
    if (this.joy > 0) {
      curve = Math.max(curve, 0.9);
      brow = Math.min(brow, 0.15);
      open = 0;
    }
    if (s.shut > 0) eye = Phaser.Math.Linear(eye, 0.14, s.shut);
    if (this.wince > 0) {
      eye = 0.12;
      brow = 0.9;
      open = 0.45;
      width = 0.8;
    }
    const k = 1 - Math.exp(-dt * 9);
    this.eye += (eye - this.eye) * k;
    this.brow += (brow - this.brow) * k;
    this.curve += (curve - this.curve) * k;
    this.width += (width - this.width) * k;
    this.open += (open - this.open) * k;
    this.sweat += (sweat - this.sweat) * k;
    this.smirk += (dark - this.smirk) * k;
    const kl = 1 - Math.exp(-dt * 5);
    this.lx += (s.lookX - this.lx) * kl;
    this.ly += (s.lookY - this.ly) * kl;

    // Dark ink on a light core, pale ink (and glowing eyes) on a dark one. The gap between the
    // two thresholds stops it flickering while the colour drifts past.
    const lum = (0.299 * ((s.colour >> 16) & 0xff) + 0.587 * ((s.colour >> 8) & 0xff) + 0.114 * (s.colour & 0xff)) / 255;
    if (this.paleInk ? lum > 0.5 : lum < 0.4) this.paleInk = !this.paleInk;
    this.draw(s);
  }

  private draw(s: FaceState) {
    const g = this.g.clear();
    const u = s.size;
    const a = s.alpha;
    const ink = this.paleInk ? PALE_INK : INK;
    const eyeNow = this.blinking > 0 ? 0.08 : this.eye;
    // The whole face leans a little toward what it is watching.
    const fx = s.x + this.lx * 1.3 * u;
    const fy = s.y + this.ly * 1.0 * u;

    for (const side of [-1, 1]) {
      const cx = fx + side * 4.5 * u;
      const cy = fy - 2.2 * u;
      const rx = 1.5 * u * (0.85 + 0.25 * eyeNow);
      const ry = 2.3 * u * eyeNow;
      if (eyeNow < 0.3) {
        // Shut: a line.
        g.lineStyle(1.1 * u, ink, a).lineBetween(cx - 2.1 * u, cy, cx + 2.1 * u, cy);
      } else {
        if (this.paleInk) g.fillStyle(EYE_GLOW, a * 0.25).fillEllipse(cx, cy, rx * 3.4, ry * 3);
        g.fillStyle(this.paleInk ? EYE_GLOW : INK, a).fillEllipse(cx, cy, rx * 2, ry * 2);
        if (!this.paleInk && eyeNow > 0.55) g.fillStyle(0xffffff, a * 0.9).fillCircle(cx - 0.45 * u, cy - 0.75 * u * eyeNow, 0.5 * u);
      }
      // Brow: the inner end rises when worried and drops when angry.
      const by = cy - (3.9 + 0.9 * eyeNow) * u;
      const strength = Math.min(1, 0.4 + Math.abs(this.brow) * 0.7);
      g.lineStyle(1.15 * u, ink, a * strength).lineBetween(cx + side * 2.7 * u, by + this.brow * 0.9 * u, cx - side * 2.5 * u, by - this.brow * 1.7 * u);
    }

    const my = fy + 5.4 * u;
    if (this.open > 0.08) {
      g.fillStyle(ink, a).fillEllipse(fx, my, 3.4 * u * (0.7 + 0.3 * this.width), 4.4 * u * Math.min(1, this.open));
    } else {
      // A curve from corner to corner; on the dark path one corner lifts into a smirk.
      const half = 2.7 * u * this.width;
      const steps = 8;
      g.lineStyle(1.2 * u, ink, a).beginPath();
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = fx - half + 2 * half * t;
        const sag = this.curve * 1.9 * u * (1 - (2 * t - 1) ** 2);
        const lift = this.curve * 0.5 * u + this.smirk * 1.1 * u * t;
        if (i === 0) g.moveTo(x, my + sag - lift);
        else g.lineTo(x, my + sag - lift);
      }
      g.strokePath();
    }

    if (this.sweat > 0.05) g.fillStyle(0xbfe3ff, a * Math.min(1, this.sweat)).fillEllipse(fx + 9.4 * u, fy - 6.6 * u, 1.8 * u, 2.9 * u);
  }
}
