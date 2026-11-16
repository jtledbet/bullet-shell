import Phaser from 'phaser';

const RADIUS = 56;
const DEADZONE = 0.15;

interface Stick {
  id: number;
  bx: number;
  by: number;
  x: number;
  y: number;
}

/**
 * Floating touch joysticks: a thumb landing on the left half of the screen
 * becomes the move stick, one on the right half becomes the aim stick.
 * Works in the scene's own units (CSS pixels in UIScene), assuming an unscrolled camera with a top-left origin.
 */
export class TwinStick {
  /** Analog movement, length 0..1. */
  readonly move = new Phaser.Math.Vector2();
  /** Raw aim offset; direction only. Zero when the aim thumb hasn't moved. */
  readonly aim = new Phaser.Math.Vector2();
  enabled = true;

  private left?: Stick;
  private right?: Stick;
  private gfx: Phaser.GameObjects.Graphics;

  constructor(private scene: Phaser.Scene) {
    this.gfx = scene.add.graphics().setDepth(100);
    scene.input.on('pointerdown', this.onDown, this);
    scene.input.on('pointermove', this.onMove, this);
    scene.input.on('pointerup', this.onUp, this);
    scene.input.on('pointerupoutside', this.onUp, this);
  }

  get aiming() {
    return this.right !== undefined;
  }

  get touched() {
    return this.left !== undefined || this.right !== undefined;
  }

  reset() {
    this.left = this.right = undefined;
    this.sync();
  }

  private onDown(p: Phaser.Input.Pointer) {
    if (!this.enabled || !p.wasTouch) return;
    // Touches that start on a button (e.g. pause) aren't sticks.
    if (this.scene.input.hitTestPointer(p).length > 0) return;
    const { x, y } = this.toScene(p);
    const stick = { id: p.id, bx: x, by: y, x, y };
    if (p.x < this.scene.scale.width / 2) {
      this.left ??= stick;
    } else {
      this.right ??= stick;
    }
    this.sync();
  }

  private onMove(p: Phaser.Input.Pointer) {
    const s = this.left?.id === p.id ? this.left : this.right?.id === p.id ? this.right : undefined;
    if (!s) return;
    const pos = this.toScene(p);
    s.x = pos.x;
    s.y = pos.y;
    // Drag the base along so reversing direction never needs a long swipe.
    const dx = s.x - s.bx;
    const dy = s.y - s.by;
    const d = Math.hypot(dx, dy);
    if (d > RADIUS) {
      s.bx = s.x - (dx / d) * RADIUS;
      s.by = s.y - (dy / d) * RADIUS;
    }
    this.sync();
  }

  private toScene(p: Phaser.Input.Pointer) {
    const zoom = this.scene.cameras.main.zoom;
    return { x: p.x / zoom, y: p.y / zoom };
  }

  private onUp(p: Phaser.Input.Pointer) {
    if (this.left?.id === p.id) this.left = undefined;
    if (this.right?.id === p.id) this.right = undefined;
    this.sync();
  }

  private sync() {
    this.move.reset();
    this.aim.reset();
    if (this.left) {
      this.move.set((this.left.x - this.left.bx) / RADIUS, (this.left.y - this.left.by) / RADIUS);
      if (this.move.length() < DEADZONE) this.move.reset();
    }
    if (this.right) {
      this.aim.set(this.right.x - this.right.bx, this.right.y - this.right.by);
      if (this.aim.length() < RADIUS * DEADZONE) this.aim.reset();
    }
    this.draw();
  }

  private draw() {
    const g = this.gfx.clear();
    for (const [s, color] of [[this.left, 0xe2e8f0], [this.right, 0xfbbf24]] as const) {
      if (!s) continue;
      g.lineStyle(3, color, 0.3).strokeCircle(s.bx, s.by, RADIUS);
      g.fillStyle(color, 0.35).fillCircle(s.x, s.y, 24);
    }
  }
}
