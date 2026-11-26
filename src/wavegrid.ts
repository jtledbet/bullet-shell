import Phaser from 'phaser';

/**
 * The ruled background, and the waves that run through it (Max, 2026-11-25: the double-slit idea,
 * step 2, "at least bend"). Explosives send a ring out from where they go off; the lines it crosses
 * bend and settle, and where two rings cross they add up and cancel. Visual only.
 *
 * WebGL: while rings are out, one shader over the grid's square draws the ruling itself (one pass
 * over the screen however many rings there are); the rest of the time it's the plain lines. Canvas
 * (or `?plaingrid`, for tests): the plain lines only, no waves. See docs/wave-grid-2026-11-25.md.
 */

/** How strong each kind of ring starts (how far the lines move, in world px) and how fast it fades (per second). */
export const RIPPLES = {
  flare: { strength: 8, fade: 1.1 },
  burst: { strength: 10, fade: 0.9 },
  clear: { strength: 13, fade: 0.7 },
  // Shotgun hits come several a second, so theirs are small and brief ("sparingly").
  shot: { strength: 3, fade: 2.8 },
} as const;
export type RippleKind = keyof typeof RIPPLES;

/** Rings out at once; a new one replaces the oldest. */
export const MAX_RINGS = 8;
/** World px a second. */
const RING_SPEED = 320;
const RING_WAVELENGTH = 84;
/** How wide the band of crests is (world px): a crest or two either side of the front. */
const RING_SPREAD = 45;
/** A ring is dropped once its lines move less than this (world px). */
const RING_GONE = 0.25;

const VERT = `
precision highp float;
uniform mat4 uProjectionMatrix;
uniform mat4 uViewMatrix;
attribute vec2 inPosition;
varying vec2 vLocal;
void main () {
  gl_Position = uProjectionMatrix * uViewMatrix * vec4(inPosition, 1.0, 1.0);
  vLocal = inPosition;
}`;

const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 vLocal;
uniform vec4 uRings[${MAX_RINGS}];
uniform float uPix;
uniform float uTile;
uniform vec3 uColour;
const float K = ${((2 * Math.PI) / RING_WAVELENGTH).toFixed(6)};
const float SPEED = ${RING_SPEED.toFixed(1)};
const float SPREAD = ${RING_SPREAD.toFixed(1)};
const float INV2S2 = ${(1 / (2 * RING_SPREAD * RING_SPREAD)).toExponential(6)};

// Box-filtered coverage of a 1 px line by a pixel uPix wide, at distance d from the line's middle.
float cover (float d) {
  float lo = max(d - 0.5 * uPix, -0.5);
  float hi = min(d + 0.5 * uPix, 0.5);
  return clamp((hi - lo) / uPix, 0.0, 1.0);
}

void main () {
  vec2 p = vLocal;
  // h: how far the lines here have moved. dh: how that changes across the screen, to keep lines 1 px wide where they bend.
  float h = 0.0;
  vec2 dh = vec2(0.0);
  for (int i = 0; i < ${MAX_RINGS}; i++) {
    vec4 r = uRings[i];
    if (r.w <= 0.0) continue;
    vec2 off = p - r.xy;
    float dist = length(off);
    float d = dist - r.z * SPEED;
    if (abs(d) > 3.0 * SPREAD) continue;
    float g = r.w * exp(-d * d * INV2S2);
    float s = sin(K * d);
    h += g * s;
    float slope = g * (K * cos(K * d) - 2.0 * d * INV2S2 * s);
    dh += slope * off / max(dist, 0.001);
  }
  // Up-and-down lines move sideways by h; across lines move down by h. The 0.5: Phaser's plain
  // 1 px lines sit half a pixel right of and below their coordinate, so these match them.
  float fx = p.x - 0.5 - h;
  float fy = p.y - 0.5 - h;
  float dx = abs(fx - uTile * floor(fx / uTile + 0.5)) / max(length(vec2(1.0 - dh.x, -dh.y)), 0.25);
  float dy = abs(fy - uTile * floor(fy / uTile + 0.5)) / max(length(vec2(-dh.x, 1.0 - dh.y)), 0.25);
  float a = max(cover(dx), cover(dy));
  gl_FragColor = vec4(uColour * a, a);
}`;

interface Ring { x: number; y: number; age: number; strength: number; fade: number; }

export class WaveGrid {
  /** The plain lines: always there, and what's shown while no ring is out. */
  readonly lines: Phaser.GameObjects.Graphics;
  /** The wave shader (WebGL only), shown instead of the lines while rings are out. */
  readonly shader: Phaser.GameObjects.Shader | null = null;
  /** False on the plain-lines fallback: ripples are ignored. */
  readonly waves: boolean;
  /** Rings in world coordinates, newest last. */
  readonly rings: Ring[] = [];
  private readonly packed = new Float32Array(MAX_RINGS * 4);

  constructor(scene: Phaser.Scene, tile: number, size: number, colour: number) {
    const plain = new URLSearchParams(window.location.search).has('plaingrid');
    this.waves = scene.game.renderer.type === Phaser.WEBGL && !plain;
    this.lines = scene.add.graphics();
    this.lines.lineStyle(1, colour);
    for (let p = 0; p <= size; p += tile) this.lines.lineBetween(p, 0, p, size).lineBetween(0, p, size, p);
    if (!this.waves) return;
    const rgb = Phaser.Display.Color.IntegerToRGB(colour);
    const base = new Phaser.Display.BaseShader('wave-grid', FRAG, VERT, {
      uRings: { type: '4fv', value: this.packed },
      uPix: { type: '1f', value: 1 },
      uTile: { type: '1f', value: tile },
      uColour: { type: '3f', value: { x: rgb.r / 255, y: rgb.g / 255, z: rgb.b / 255 } },
    });
    // One px past the last line, as the plain lines reach to `size` inclusive.
    this.shader = scene.add.shader(base, 0, 0, size + 1, size + 1).setOrigin(0).setVisible(false);
  }

  /** Whichever is showing: the shader while rings are out, otherwise the plain lines. */
  get view(): Phaser.GameObjects.Shader | Phaser.GameObjects.Graphics {
    return this.shader?.visible ? this.shader : this.lines;
  }

  /** Starts a ring at a world point. */
  ripple(x: number, y: number, kind: RippleKind) {
    if (!this.waves) return;
    const { strength, fade } = RIPPLES[kind];
    if (this.rings.length >= MAX_RINGS) this.rings.shift();
    this.rings.push({ x, y, age: 0, strength, fade });
  }

  clear() {
    this.rings.length = 0;
  }

  /**
   * Places the grid's square (top-left, world px) and ages the rings by dt seconds. The shader is a
   * pass over the whole screen, so it only runs while a ring is out; the rest of the time it's the
   * plain lines, which cost what they always did.
   */
  place(x: number, y: number, dt: number, zoom: number) {
    this.lines.setPosition(x, y);
    const shader = this.shader;
    if (!shader) return;
    for (const r of this.rings) r.age += dt;
    for (let i = this.rings.length - 1; i >= 0; i--) if (this.strength(this.rings[i]) < RING_GONE) this.rings.splice(i, 1);
    const on = this.rings.length > 0;
    shader.setVisible(on);
    this.lines.setVisible(!on);
    if (!on) return;
    shader.setPosition(x, y);
    const out = this.packed;
    out.fill(0);
    this.rings.forEach((r, i) => {
      // The shader works in the square's own coordinates.
      out[i * 4] = r.x - x;
      out[i * 4 + 1] = r.y - y;
      out[i * 4 + 2] = r.age;
      out[i * 4 + 3] = this.strength(r);
    });
    shader.setUniform('uRings.value', out);
    shader.setUniform('uPix.value', 1 / zoom);
  }

  /** How far a ring moves the lines right now (world px). */
  strength(r: Ring) {
    return r.strength * Math.exp(-r.fade * r.age);
  }
}
