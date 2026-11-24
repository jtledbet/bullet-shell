import Phaser from 'phaser';
import { TEX_SCALE as S } from '../display';

/** An ember's colours: its haze (inner, outer), body (centre to rim) and eyes (centre to edge). */
interface EmberLook {
  haze: [string, string];
  body: [string, string, string, string];
  eyes: [string, string, string];
}
const EMBER: EmberLook = {
  haze: ['rgba(255,90,40,0.5)', 'rgba(255,60,30,0)'],
  body: ['#2a0806', '#5c0f0a', '#c2321a', '#ff7a3d'],
  eyes: ['rgba(255,240,190,1)', 'rgba(255,190,90,1)', 'rgba(255,120,40,0)'],
};
const CHARMED: EmberLook = {
  haze: ['rgba(125,211,252,0.55)', 'rgba(96,165,250,0)'],
  body: ['#0b2545', '#1e4fa8', '#38bdf8', '#bae6fd'],
  eyes: ['rgba(255,255,255,1)', 'rgba(224,242,254,1)', 'rgba(186,230,253,0)'],
};

/** Generates placeholder textures so the prototype needs no art files. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  create() {
    const g = this.make.graphics({}, false);
    // Sizes below are world units; everything is drawn S times larger (see TEX_SCALE).
    const tex = (key: string, size: number) => g.generateTexture(key, size * S, size * S).clear();

    // The core: a plain white orb with a soft edge. It takes its colour from what it does.
    this.glow('player', 32, [
      [0, 'rgba(255,255,255,1)'],
      [0.55, 'rgba(250,250,252,1)'],
      [0.74, 'rgba(232,234,242,1)'],
      [0.82, 'rgba(214,218,232,0.85)'],
      [0.9, 'rgba(200,206,226,0.3)'],
      [1, 'rgba(200,206,226,0)'],
    ]);
    // What trails behind it as it moves. White, so it takes the core's colour.
    this.glow('plasma', 32, [
      [0, 'rgba(255,255,255,0.6)'],
      [0.5, 'rgba(255,255,255,0.22)'],
      [1, 'rgba(255,255,255,0)'],
    ]);

    // The pause menu's build orb: a soft white glow that takes a tint.
    this.glow('orb', 16, [
      [0, 'rgba(255,255,255,1)'],
      [0.22, 'rgba(255,255,255,0.95)'],
      [0.55, 'rgba(255,255,255,0.4)'],
      [1, 'rgba(255,255,255,0)'],
    ]);

    // A mote of energy an enemy sometimes leaves behind: the same stuff as the core.
    this.glow('mote', 12, [
      [0, 'rgba(255,255,255,1)'],
      [0.3, 'rgba(226,240,255,0.95)'],
      [0.6, 'rgba(150,200,255,0.4)'],
      [1, 'rgba(120,180,255,0)'],
    ]);

    this.ember('enemy', EMBER);
    // A charmed enemy turns blue, like a ghost in Pac-Man that you can eat.
    this.ember('enemy-charmed', CHARMED);
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
    // Enemy shots: hot magenta, a colour nothing else in the game wears, so they never pass for an enemy.
    this.enemyShot();
    // The flare: a slow, heavy knot of the core's energy that bursts among enemies. White, so it takes the core's colour.
    this.glow('flare', 24, [
      [0, 'rgba(255,255,255,1)'],
      [0.3, 'rgba(255,255,255,0.95)'],
      [0.55, 'rgba(255,255,255,0.45)'],
      [1, 'rgba(255,255,255,0)'],
    ]);

    const gem = [[8, 2], [14, 8], [8, 14], [2, 8]].map(([x, y]) => new Phaser.Math.Vector2(x * S, y * S));
    g.fillStyle(0x4ade80).fillPoints(gem, true);
    tex('gem', 16);

    this.icons();

    g.destroy();
    this.scene.start('game');
  }

  /**
   * Enemies: a smouldering ember. A dark coal body that runs hot toward its rim, a faint
   * heat haze around it, and two glowing eyes. Toughness darkens it further with a tint.
   */
  private ember(key: string, look: EmberLook) {
    const px = 32 * S;
    const c = px / 2;
    const canvas = this.textures.createCanvas(key, px, px)!;
    const ctx = canvas.getContext();
    const haze = ctx.createRadialGradient(c, c, 10 * S, c, c, 16 * S);
    haze.addColorStop(0, look.haze[0]);
    haze.addColorStop(1, look.haze[1]);
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, px, px);
    // Slightly off-centre, so the coal looks lit from within rather than flat.
    const body = ctx.createRadialGradient(c - 2 * S, c + 1 * S, 0, c, c, 12 * S);
    body.addColorStop(0, look.body[0]);
    body.addColorStop(0.6, look.body[1]);
    body.addColorStop(0.86, look.body[2]);
    body.addColorStop(1, look.body[3]);
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(c, c, 12 * S, 0, Math.PI * 2);
    ctx.fill();
    for (const ex of [12, 20]) {
      const eye = ctx.createRadialGradient(ex * S, 13 * S, 0, ex * S, 13 * S, 3.2 * S);
      eye.addColorStop(0, look.eyes[0]);
      eye.addColorStop(0.55, look.eyes[1]);
      eye.addColorStop(1, look.eyes[2]);
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

  /** An enemy's shot: a white-hot centre in a magenta shell and haze. */
  private enemyShot() {
    const px = 16 * S;
    const c = px / 2;
    const canvas = this.textures.createCanvas('enemy-shot', px, px)!;
    const ctx = canvas.getContext();
    const haze = ctx.createRadialGradient(c, c, 3 * S, c, c, 8 * S);
    haze.addColorStop(0, 'rgba(240,80,220,0.7)');
    haze.addColorStop(1, 'rgba(217,70,239,0)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, px, px);
    const body = ctx.createRadialGradient(c, c, 0, c, c, 4.5 * S);
    body.addColorStop(0, '#fff2fb');
    body.addColorStop(0.4, '#ff8ae0');
    body.addColorStop(0.8, '#ec38d0');
    body.addColorStop(1, '#c026d3');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(c, c, 4.5 * S, 0, Math.PI * 2);
    ctx.fill();
    canvas.refresh();
  }

  /**
   * The small icons on cards (see CardIcon): `icon-<name>`, 16 units square, drawn
   * white so each card tints its icon with its tree's colour.
   */
  private icons() {
    const line = (ctx: CanvasRenderingContext2D, ...pts: number[]) => {
      ctx.beginPath();
      ctx.moveTo(pts[0], pts[1]);
      for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    };
    const draw: Record<string, (ctx: CanvasRenderingContext2D) => void> = {
      // Damage: an impact, a sharp eight-pointed star.
      damage: (ctx) => {
        ctx.beginPath();
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * Math.PI * 2 - Math.PI / 2;
          const r = i % 2 ? 3 : 7.2;
          ctx.lineTo(8 + Math.cos(a) * r, 8 + Math.sin(a) * r);
        }
        ctx.fill();
      },
      // Fire rate: a bolt of lightning.
      rate: (ctx) => {
        line(ctx, 10, 0.8, 3.2, 9, 7.4, 9, 5.8, 15.2, 12.8, 6.8, 8.6, 6.8);
        ctx.closePath();
        ctx.fill();
      },
      // Your shots (more, through, farther): an arrow in flight.
      shot: (ctx) => {
        line(ctx, 2.5, 13.5, 13, 3);
        ctx.stroke();
        line(ctx, 6.5, 3, 13, 3, 13, 9.5);
        ctx.stroke();
      },
      // Moving: a double chevron.
      speed: (ctx) => {
        line(ctx, 2.5, 2.5, 7.5, 8, 2.5, 13.5);
        ctx.stroke();
        line(ctx, 8.5, 2.5, 13.5, 8, 8.5, 13.5);
        ctx.stroke();
      },
      // Standing your ground: a shield.
      guard: (ctx) => {
        ctx.beginPath();
        ctx.moveTo(8, 1);
        ctx.lineTo(14.2, 3.4);
        ctx.lineTo(14.2, 7.6);
        ctx.quadraticCurveTo(14.2, 12.6, 8, 15.2);
        ctx.quadraticCurveTo(1.8, 12.6, 1.8, 7.6);
        ctx.lineTo(1.8, 3.4);
        ctx.closePath();
        ctx.fill();
      },
      // Energy back: a plus.
      health: (ctx) => {
        ctx.fillRect(6, 1.5, 4, 13);
        ctx.fillRect(1.5, 6, 13, 4);
      },
      // Gems: the gem itself.
      pickup: (ctx) => {
        line(ctx, 8, 1, 15, 8, 8, 15, 1, 8);
        ctx.closePath();
        ctx.fill();
      },
      // A weapon: the sights, like the reticle in the run.
      weapon: (ctx) => {
        ctx.beginPath();
        ctx.arc(8, 8, 4.6, 0, Math.PI * 2);
        ctx.stroke();
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          line(ctx, 8 + dx * 2.6, 8 + dy * 2.6, 8 + dx * 7.4, 8 + dy * 7.4);
          ctx.stroke();
        }
      },
      // Charm: a spiral.
      charm: (ctx) => {
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        for (let i = 0; i <= 80; i++) {
          const t = i / 80;
          const a = t * Math.PI * 2 * 2.25;
          ctx.lineTo(8 + Math.cos(a) * t * 6.6, 8 + Math.sin(a) * t * 6.6);
        }
        ctx.stroke();
      },
    };
    for (const [name, paint] of Object.entries(draw)) {
      const canvas = this.textures.createCanvas(`icon-${name}`, 16 * S, 16 * S)!;
      const ctx = canvas.getContext();
      ctx.scale(S, S);
      ctx.fillStyle = ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.2;
      ctx.lineCap = ctx.lineJoin = 'round';
      paint(ctx);
      canvas.refresh();
    }
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
