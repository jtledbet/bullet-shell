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

    // The pause menu's build orb: a soft white glow that takes a tint.
    this.glow('orb', 16, [
      [0, 'rgba(255,255,255,1)'],
      [0.22, 'rgba(255,255,255,0.95)'],
      [0.55, 'rgba(255,255,255,0.4)'],
      [1, 'rgba(255,255,255,0)'],
    ]);

    this.ember();
    // A spark that drifts off the embers.
    this.glow('fleck', 4, [
      [0, 'rgba(255,236,170,1)'],
      [0.4, 'rgba(255,140,60,0.8)'],
      [1, 'rgba(255,80,30,0)'],
    ]);

    // Shots are made of whoever fires them. Yours: a bolt of the core's plasma, drawn white so it takes the core's colour.
    this.bolt('bolt', ['rgba(255,255,255,1)', 'rgba(255,255,255,0.85)', 'rgba(255,255,255,0)'], 'rgba(255,255,255,0.55)');
    // Shotgun pellets: hot sparks.
    this.bolt('spark', ['rgba(255,255,235,1)', 'rgba(255,190,90,0.9)', 'rgba(255,110,40,0)'], 'rgba(255,140,60,0.6)');
    // Enemy shots: small embers.
    this.emberShot();

    const gem = [[8, 2], [14, 8], [8, 14], [2, 8]].map(([x, y]) => new Phaser.Math.Vector2(x * S, y * S));
    g.fillStyle(0x4ade80).fillPoints(gem, true);
    tex('gem', 16);

    g.destroy();
    this.scene.start('game');
  }

  /**
   * Enemies: a smouldering ember. A dark coal body that runs hot toward its rim, a faint
   * heat haze around it, and two glowing eyes. Toughness darkens it further with a tint.
   */
  private ember() {
    const px = 32 * S;
    const c = px / 2;
    const canvas = this.textures.createCanvas('enemy', px, px)!;
    const ctx = canvas.getContext();
    const haze = ctx.createRadialGradient(c, c, 10 * S, c, c, 16 * S);
    haze.addColorStop(0, 'rgba(255,90,40,0.5)');
    haze.addColorStop(1, 'rgba(255,60,30,0)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, px, px);
    // Slightly off-centre, so the coal looks lit from within rather than flat.
    const body = ctx.createRadialGradient(c - 2 * S, c + 1 * S, 0, c, c, 12 * S);
    body.addColorStop(0, '#2a0806');
    body.addColorStop(0.6, '#5c0f0a');
    body.addColorStop(0.86, '#c2321a');
    body.addColorStop(1, '#ff7a3d');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(c, c, 12 * S, 0, Math.PI * 2);
    ctx.fill();
    for (const ex of [12, 20]) {
      const eye = ctx.createRadialGradient(ex * S, 13 * S, 0, ex * S, 13 * S, 3.2 * S);
      eye.addColorStop(0, 'rgba(255,240,190,1)');
      eye.addColorStop(0.55, 'rgba(255,190,90,1)');
      eye.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.fillStyle = eye;
      ctx.beginPath();
      ctx.arc(ex * S, 13 * S, 3.2 * S, 0, Math.PI * 2);
      ctx.fill();
    }
    canvas.refresh();
  }

  /**
   * A shot flying to the right, in a 32x16 frame: a round glowing head at (22, 8) with a tail
   * tapering away behind it. `head` is the glow from centre to edge; `tail` the streak's colour.
   */
  private bolt(key: string, head: [string, string, string], tail: string) {
    const canvas = this.textures.createCanvas(key, 32 * S, 16 * S)!;
    const ctx = canvas.getContext();
    const hx = 22 * S;
    const hy = 8 * S;
    // The tail: the back half of a glow stretched along the flight path.
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, hx, 16 * S);
    ctx.clip();
    ctx.translate(hx, hy);
    ctx.scale(4, 1);
    const streak = ctx.createRadialGradient(0, 0, 0, 0, 0, 5 * S);
    streak.addColorStop(0, tail);
    streak.addColorStop(1, tail.replace(/[\d.]+\)$/, '0)'));
    ctx.fillStyle = streak;
    ctx.fillRect(-5 * S, -5 * S, 10 * S, 10 * S);
    ctx.restore();
    const glow = ctx.createRadialGradient(hx, hy, 0, hx, hy, 6.5 * S);
    glow.addColorStop(0, head[0]);
    glow.addColorStop(0.35, head[1]);
    glow.addColorStop(1, head[2]);
    ctx.fillStyle = glow;
    ctx.fillRect(hx - 6.5 * S, hy - 6.5 * S, 13 * S, 13 * S);
    canvas.refresh();
  }

  /** An enemy's shot: a chip off the ember, dark at the core, hot at the rim, in a faint haze. */
  private emberShot() {
    const px = 16 * S;
    const c = px / 2;
    const canvas = this.textures.createCanvas('ember-shot', px, px)!;
    const ctx = canvas.getContext();
    const haze = ctx.createRadialGradient(c, c, 3 * S, c, c, 8 * S);
    haze.addColorStop(0, 'rgba(255,90,40,0.6)');
    haze.addColorStop(1, 'rgba(255,60,30,0)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, px, px);
    const body = ctx.createRadialGradient(c, c, 0, c, c, 4.5 * S);
    body.addColorStop(0, '#3a0a07');
    body.addColorStop(0.55, '#8a1a0e');
    body.addColorStop(0.85, '#e0461f');
    body.addColorStop(1, '#ffb066');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(c, c, 4.5 * S, 0, Math.PI * 2);
    ctx.fill();
    canvas.refresh();
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
