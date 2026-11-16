import Phaser from 'phaser';
import { TwinStick } from '../input/TwinStick';
import { pixelRatio } from '../display';
import type { HudState } from './GameScene';
import type { Upgrade } from '../upgrades';

const PAD = 32; // clears rounded corners and notches in landscape
/** Ignore taps on a fresh menu briefly, so a thumb lifting mid-fight can't pick for you. */
const MENU_ARM_MS = 400;
const FONT = 'system-ui, sans-serif';

/**
 * Screen-space layer: HUD, touch sticks, and menus. Laid out in CSS pixels; the camera
 * zooms by the device pixel ratio so it stays sharp on dense screens.
 */
export class UIScene extends Phaser.Scene {
  sticks?: TwinStick;
  onPauseRequested?: () => void;
  private hud!: Phaser.GameObjects.Graphics;
  private pauseBtn!: Phaser.GameObjects.Container;
  private info!: Phaser.GameObjects.Text;
  private hint?: Phaser.GameObjects.Text;
  private menu?: Phaser.GameObjects.Container;
  /** Rebuilds the open menu's contents for the current screen size. */
  private menuBuild?: () => Phaser.GameObjects.GameObject[];
  private menuOpenedAt = 0;

  constructor() {
    super('ui');
  }

  /** Screen size in CSS pixels. */
  private get w() {
    return this.scale.width / this.cameras.main.zoom;
  }

  private get h() {
    return this.scale.height / this.cameras.main.zoom;
  }

  create() {
    this.menu = this.menuBuild = undefined;
    this.cameras.main.setOrigin(0, 0).setZoom(pixelRatio());
    this.scale.on('resize', this.onResize, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.onResize, this));
    this.sticks = new TwinStick(this);
    this.hud = this.add.graphics();
    this.info = this.label(PAD, PAD + 22, '', { fontSize: '15px', color: '#cbd5e1' });

    const pauseBg = this.add.rectangle(0, 0, 44, 44, 0x1e293b, 0.7).setStrokeStyle(2, 0x334155);
    const pauseIcon = this.add.graphics().fillStyle(0xe2e8f0).fillRect(-8, -10, 5, 20).fillRect(3, -10, 5, 20);
    pauseBg.setInteractive({ useHandCursor: true }).on('pointerup', () => this.onPauseRequested?.());
    this.pauseBtn = this.add.container(0, 0, [pauseBg, pauseIcon]).setDepth(150);

    const touch = this.sys.game.device.input.touch;
    this.hint = this
      .label(
        this.w / 2,
        this.h - PAD,
        touch
          ? 'Left thumb: move   ·   Right thumb: aim (or let it auto-aim)'
          : 'WASD: move   ·   Hold mouse: aim (or let it auto-aim)   ·   Esc: pause',
        { fontSize: '15px', color: '#94a3b8' },
      )
      .setOrigin(0.5, 1);
    this.time.delayedCall(6000, () => this.dismissHint());
  }

  update() {
    if (this.hint && this.sticks?.touched) this.dismissHint();
  }

  private onResize() {
    this.cameras.main.setZoom(pixelRatio());
    this.hint?.setPosition(this.w / 2, this.h - PAD);
    if (this.menu) this.buildMenu();
  }

  updateHud(s: HudState) {
    const w = this.w;
    const g = this.hud.clear();
    const barW = Math.min(260, w * 0.3);
    this.pauseBtn.setPosition(w - PAD - 22, PAD + 14);

    g.fillStyle(0x1e293b).fillRoundedRect(PAD, PAD, barW, 12, 6);
    const hpW = Math.max(0, (s.hp / s.maxHp) * barW);
    // Rounded rects glitch when narrower than their corner radius.
    if (hpW > 0) g.fillStyle(0xf43f5e).fillRoundedRect(PAD, PAD, hpW, 12, Math.min(6, hpW / 2));

    g.fillStyle(0x1e293b).fillRect(0, 0, w, 5);
    g.fillStyle(0x4ade80).fillRect(0, 0, (s.xp / s.xpNext) * w, 5);

    const t = Math.floor(s.elapsed);
    const clock = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    this.info.setText(`Lv ${s.level}   ${clock}   ${s.kills} kills`);
  }

  showLevelUp(choices: Upgrade[], onPick: (u: Upgrade) => void) {
    this.openMenu(() => this.levelUpItems(choices, onPick));
  }

  private levelUpItems(choices: Upgrade[], onPick: (u: Upgrade) => void) {
    const { w, h } = this;
    const items: Phaser.GameObjects.GameObject[] = [this.title('Level up!', h * 0.2)];
    const cardW = Math.min(220, (w - PAD * 2 - 32) / 3);
    const cardH = Math.min(160, h * 0.45);
    choices.forEach((u, i) => {
      const x = w / 2 + (i - 1) * (cardW + 16);
      const card = this.add.rectangle(x, h * 0.55, cardW, cardH, 0x1e293b).setStrokeStyle(2, 0x5eead4);
      const name = this
        .label(x, h * 0.55 - cardH / 2 + 22, u.name, { fontSize: '19px', fontStyle: 'bold', color: '#f8fafc' })
        .setOrigin(0.5, 0);
      const desc = this
        .label(x, h * 0.55 + 6, u.desc, { fontSize: '15px', color: '#cbd5e1', align: 'center', wordWrap: { width: cardW - 24 } })
        .setOrigin(0.5, 0);
      this.makeButton(card, () => onPick(u));
      items.push(card, name, desc);
    });
    return items;
  }

  showGameOver(s: HudState, onRestart: () => void) {
    const t = Math.floor(s.elapsed);
    const text = `Survived ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}  ·  Level ${s.level}  ·  ${s.kills} kills`;
    this.openMenu(() => {
      const { w, h } = this;
      const summary = this.label(w / 2, h * 0.45, text, { fontSize: '18px', color: '#cbd5e1' }).setOrigin(0.5);
      return [this.title('Game over', h * 0.28), summary, ...this.menuButton('Play again', h * 0.62, onRestart)];
    });
  }

  showPause(onResume: () => void, onRestart: () => void) {
    this.openMenu(() => {
      const h = this.h;
      return [
        this.title('Paused', h * 0.25),
        ...this.menuButton('Resume', h * 0.47, onResume),
        ...this.menuButton('Restart', h * 0.68, onRestart),
      ];
    });
  }

  closeMenu() {
    this.menu?.destroy();
    this.menu = this.menuBuild = undefined;
    this.pauseBtn.setVisible(true);
    if (this.sticks) this.sticks.enabled = true;
  }

  private menuButton(text: string, y: number, action: () => void) {
    const x = this.w / 2;
    const btn = this.add.rectangle(x, y, 200, 56, 0x1e293b).setStrokeStyle(2, 0x5eead4);
    const label = this.label(x, y, text, { fontSize: '20px', color: '#f8fafc' }).setOrigin(0.5);
    this.makeButton(btn, action);
    return [btn, label];
  }

  /** Text rasterised at device resolution, so the zoomed camera doesn't blur it. */
  private label(x: number, y: number, text: string, style: Phaser.Types.GameObjects.Text.TextStyle) {
    return this.add.text(x, y, text, { fontFamily: FONT, resolution: pixelRatio(), ...style });
  }

  private title(text: string, y: number) {
    return this
      .label(this.w / 2, y, text, { fontSize: '32px', fontStyle: 'bold', color: '#f8fafc' })
      .setOrigin(0.5);
  }

  private openMenu(build: () => Phaser.GameObjects.GameObject[]) {
    this.dismissHint();
    this.sticks?.reset();
    if (this.sticks) this.sticks.enabled = false;
    this.pauseBtn.setVisible(false);
    this.menuBuild = build;
    this.menuOpenedAt = this.time.now;
    this.buildMenu();
  }

  private buildMenu() {
    if (!this.menuBuild) return;
    this.menu?.destroy();
    const dim = this.add.rectangle(0, 0, this.w, this.h, 0x020617, 0.75).setOrigin(0);
    this.menu = this.add.container(0, 0, [dim, ...this.menuBuild()]).setDepth(200);
  }

  /** Fires only when a press both starts and ends on the button, after the arm delay. */
  private makeButton(target: Phaser.GameObjects.Rectangle, action: () => void) {
    let armed = false;
    target.setInteractive({ useHandCursor: true });
    target.on('pointerdown', () => {
      armed = this.time.now - this.menuOpenedAt > MENU_ARM_MS;
    });
    target.on('pointerout', () => (armed = false));
    target.on('pointerup', () => {
      if (!armed) return;
      this.closeMenu();
      action();
    });
  }

  private dismissHint() {
    if (!this.hint) return;
    const hint = this.hint;
    this.hint = undefined;
    this.tweens.add({ targets: hint, alpha: 0, duration: 400, onComplete: () => hint.destroy() });
  }
}
