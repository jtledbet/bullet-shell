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

    // The core: a cool violet, well clear of the enemies' reds.
    g.fillStyle(0xa78bfa).fillCircle(16 * S, 16 * S, 13 * S);
    g.lineStyle(3 * S, 0xffffff).strokeCircle(16 * S, 16 * S, 13 * S);
    tex('player', 32);

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
}
