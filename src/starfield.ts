import type Phaser from 'phaser';

/**
 * The starfield: a few layers of distant points, the farther the smaller, dimmer and slower.
 * It filled the run from v0.16.0; since v0.26.0 the run is all grid (Max: "starfield is for the
 * pause menu"), and the stars drift behind the pause menu. The pattern repeats every STAR_SPAN
 * px, wider than the screen ever gets.
 */
export const STAR_SPAN = 1600;
export const STAR_LAYERS = [
  { drift: 0.04, count: 110, size: 0.9, colour: 0x8ea2c8, alpha: 0.55 },
  { drift: 0.1, count: 60, size: 1.2, colour: 0xc7d2fe, alpha: 0.75 },
  { drift: 0.2, count: 26, size: 1.7, colour: 0xffffff, alpha: 0.95 },
];

export class Starfield {
  /** Where each layer's stars sit within the repeating span. */
  readonly spots = STAR_LAYERS.map((l) => Array.from({ length: l.count }, () => ({ x: Math.random() * STAR_SPAN, y: Math.random() * STAR_SPAN })));

  /** Draws the stars that fall inside a w by h screen, each layer slid left by `travel` times its drift. */
  draw(g: Phaser.GameObjects.Graphics, w: number, h: number, travel: number) {
    const wrap = (n: number) => ((n % STAR_SPAN) + STAR_SPAN) % STAR_SPAN;
    STAR_LAYERS.forEach((layer, i) => {
      g.fillStyle(layer.colour, layer.alpha);
      for (const s of this.spots[i]) {
        const x = wrap(s.x - travel * layer.drift);
        const y = s.y;
        if (x < w + 2 && y < h + 2) g.fillRect(x, y, layer.size, layer.size);
      }
    });
  }
}
