import Phaser from 'phaser';
import { TEX_SCALE as S } from '../display';

/** Generates placeholder textures so the prototype needs no art files. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  create() {
    const g = this.make.graphics({}, false);
    // Sizes below are world units; everything is drawn S times larger (see TEX_SCALE).
    const tex = (key: string, size: number) => g.generateTexture(key, size * S, size * S).clear();

    // The player: a ball of violet plasma, white-hot at the centre, no outline.
    this.glow('player', 32, [
      [0, 'rgba(255,255,255,1)'],
      [0.1, 'rgba(237,233,254,1)'],
      [0.4, 'rgba(167,139,250,1)'],
      [0.78, 'rgba(139,92,246,0.5)'],
      [1, 'rgba(124,58,237,0)'],
    ]);
    // Softer wisps that roil around it and trail behind it.
    this.glow('plasma', 32, [
      [0, 'rgba(167,139,250,0.75)'],
      [0.5, 'rgba(139,92,246,0.3)'],
      [1, 'rgba(124,58,237,0)'],
    ]);

    g.fillStyle(0xf43f5e).fillCircle(16 * S, 16 * S, 12 * S);
    g.fillStyle(0x020617).fillCircle(12 * S, 13 * S, 2.5 * S).fillCircle(20 * S, 13 * S, 2.5 * S);
    tex('enemy', 32);

    g.fillStyle(0xfde047).fillCircle(8 * S, 8 * S, 5 * S);
    tex('bullet', 16);

    const gem = [[8, 2], [14, 8], [8, 14], [2, 8]].map(([x, y]) => new Phaser.Math.Vector2(x * S, y * S));
    g.fillStyle(0x4ade80).fillPoints(gem, true);
    tex('gem', 16);

    g.fillStyle(0x0b1222).fillRect(0, 0, 64 * S, 64 * S);
    g.lineStyle(S, 0x1e293b).strokeRect(0, 0, 64 * S, 64 * S);
    tex('grid', 64);

    g.destroy();
    this.scene.start('game');
  }

  /** A soft round glow (radial gradient), `size` world units across. */
  private glow(key: string, size: number, stops: [number, string][]) {
    const px = size * S;
    const canvas = this.textures.createCanvas(key, px, px)!;
    const ctx = canvas.getContext();
    const grad = ctx.createRadialGradient(px / 2, px / 2, 0, px / 2, px / 2, px / 2);
    for (const [at, colour] of stops) grad.addColorStop(at, colour);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, px, px);
    canvas.refresh();
  }
}
