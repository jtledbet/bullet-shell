import Phaser from 'phaser';
import { TwinStick } from '../input/TwinStick';
import { sfx } from '../audio';
import { POWER } from '../controls';
import { pixelRatio } from '../display';
import { canFullscreen, toggleFullscreen } from '../fullscreen';
import { refreshMusic } from '../music';
import { bestRun, devFlareOn, devOn, devShotgunOn, isMuted, labelsOn, setDevFlare, setDevShotgun, setLabels, setMuted } from '../storage';
import { POWER_NAMES, POWER_TIPS, TRAIT_COLOURS, type Trait } from '../traits';
import type { HudState } from './GameScene';
import type { Upgrade } from '../upgrades';

const PAD = 32; // clears rounded corners and notches in landscape
/** Gem radar: how far in from the screen edge the arrow sits, its size, and how strongly it shows. */
const RADAR_INSET = 22;
const RADAR_SIZE = 9;
const RADAR_ALPHA = 0.7;
/** Ignore taps on a fresh menu briefly, so a thumb lifting mid-fight can't pick for you. */
const MENU_ARM_MS = 400;
/** The HUD is hidden during the tutorial, then snaps in when the fight starts. */
const HUD_SNAP_MS = 140;
/** The build orb at the foot of the pause menu: ember-warm when it leads to the preview build, plasma-pale when it leads back. */
const ORB_SIZE = 26;
const ORB_TO_NEXT = 0xffb866;
const ORB_TO_LIVE = 0xd8ccff;
/** The pause and fullscreen buttons show plainly for this long, then fade back so they don't cover the field. */
const CORNER_AWAKE_MS = 3000;
const CORNER_REST_ALPHA = 0.2;
/** The power button's radius. Its colour comes from the trait driving it. */
const ABILITY_R = 22;
/** The third nudge for a player who hasn't done anything: one quiet word under the core. */
const NUDGE_WORD = 'move';
const FONT = 'system-ui, sans-serif';
/** Where "Exit to site" goes: the games page that links here. */
const SITE_URL = 'https://ledsec.dev/games/';
/** Half the centre-to-centre gap between two side-by-side menu buttons. */
const PAIR_OFFSET = 98;

/** Seconds as m:ss. */
function clock(seconds: number) {
  const t = Math.floor(seconds);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

/**
 * Screen-space layer: HUD, touch sticks, and menus. Laid out in CSS pixels; the camera
 * zooms by the device pixel ratio so it stays sharp on dense screens.
 */
export class UIScene extends Phaser.Scene {
  sticks?: TwinStick;
  onPauseRequested?: () => void;
  onAbilityRequested?: () => void;
  /** Developer extra: the pause menu's shotgun switch was flipped. */
  onDevShotgun?: (on: boolean) => void;
  onDevFlare?: (on: boolean) => void;
  private ability!: Phaser.GameObjects.Container;
  private abilityGfx!: Phaser.GameObjects.Graphics;
  /** The power's name beside its button: always on desktop, and on phones when labels are on. */
  private abilityCaption!: Phaser.GameObjects.Text;
  private abilityReady = false;
  /** Desktop: the "press e" hint shows once, the first time the power is ready. */
  private abilityHinted = false;
  private hud!: Phaser.GameObjects.Graphics;
  private radar!: Phaser.GameObjects.Graphics;
  private pauseBtn!: Phaser.GameObjects.Container;
  /** Only where fullscreen is supported. */
  private fsBtn?: Phaser.GameObjects.Container;
  private fsIcon?: Phaser.GameObjects.Graphics;
  private cornerTimer?: Phaser.Time.TimerEvent;
  private tipBox?: Phaser.GameObjects.Container;
  private tipTimer?: Phaser.Time.TimerEvent;
  /** The trait behind the power button right now, for its explanation, and whether this run has given it yet. */
  private abilityTrait?: Trait;
  private abilityExplained = false;
  /** Desktop: hover areas over the health bar and the experience strip. */
  private hpZone?: Phaser.GameObjects.Zone;
  private xpZone?: Phaser.GameObjects.Zone;
  private orb?: Phaser.GameObjects.Image;
  private info!: Phaser.GameObjects.Text;
  /** Whether the HUD (bars, info line, gem radar) is showing; off during the tutorial. */
  private hudShown = false;
  private hint?: Phaser.GameObjects.Text;
  private menu?: Phaser.GameObjects.Container;
  /** Rebuilds the open menu's contents for the current screen size. */
  private menuBuild?: () => Phaser.GameObjects.GameObject[];
  private menuOpenedAt = 0;
  /** Dev builds only: what the tutorial noticed. */
  private debugText?: Phaser.GameObjects.Text;

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
    // Right-click does nothing, including the browser's own menu.
    this.input.mouse?.disableContextMenu();
    this.scale.on('resize', this.onResize, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.onResize, this));
    this.sticks = new TwinStick(this);
    this.hud = this.add.graphics();
    this.radar = this.add.graphics();
    this.info = this.label(PAD, PAD + 22, '', { fontSize: '15px', color: '#cbd5e1' });

    const pauseBg = this.add.rectangle(0, 0, 44, 44, 0x1e293b, 0.7).setStrokeStyle(2, 0x334155);
    const pauseIcon = this.add.graphics().fillStyle(0xe2e8f0).fillRect(-8, -10, 5, 20).fillRect(3, -10, 5, 20);
    pauseBg.setInteractive({ useHandCursor: true }).on('pointerup', (p: Phaser.Input.Pointer) => {
      if (p.button === 0) this.onPauseRequested?.();
    });
    this.pauseBtn = this.add.container(0, 0, [pauseBg, pauseIcon]).setDepth(150);
    this.tip(pauseBg, 'Pause. Esc, P and Space do the same.');
    this.tipBox = this.tipTimer = undefined;
    this.abilityExplained = false;
    this.hpZone = this.xpZone = undefined;
    if (!this.sys.game.device.input.touch) {
      const shown = (text: string) => () => (this.hudShown && !this.menu ? text : '');
      this.hpZone = this.tip(this.add.zone(PAD, PAD - 6, 260, 24).setOrigin(0).setInteractive(), shown('Your energy. Hits take it, and so does every shot you fire. Firing alone can never take the last of it.'));
      this.xpZone = this.tip(this.add.zone(0, 0, 100, 10).setOrigin(0).setInteractive(), shown('Gems fill this. When it is full you gain a level and choose a card.'));
    }

    // The ability button: tap (or right-click anywhere on desktop). Hidden until the core has a trait.
    this.abilityGfx = this.add.graphics();
    const abilityZone = this.add.circle(0, 0, ABILITY_R + 10, 0x000000, 0.001).setInteractive({ useHandCursor: true });
    abilityZone.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.button === 0) this.onAbilityRequested?.();
    });
    this.tip(abilityZone, () => (this.abilityTrait ? POWER_TIPS[this.abilityTrait] : ''));
    // On desktop the button always carries the key that uses it.
    const abilityKey = this
      .label(0, 0, POWER.glyph, { fontSize: '16px', fontStyle: 'bold', color: '#f8fafc' })
      .setOrigin(0.5)
      .setAlpha(0.85)
      .setVisible(!this.sys.game.device.input.touch);
    this.ability = this.add.container(0, 0, [this.abilityGfx, abilityKey, abilityZone]).setDepth(150).setVisible(false);
    this.abilityCaption = this.label(0, 0, '', { fontSize: '13px', color: '#cbd5e1' }).setOrigin(1, 0.5).setDepth(150).setVisible(false);
    this.abilityReady = false;
    // The old scene's objects are gone after a restart.
    this.debugText = undefined;

    this.fsBtn = this.fsIcon = undefined;
    if (canFullscreen()) {
      const fsBg = this.add.rectangle(0, 0, 44, 44, 0x1e293b, 0.7).setStrokeStyle(2, 0x334155);
      this.fsIcon = this.add.graphics();
      fsBg.setInteractive({ useHandCursor: true }).on('pointerup', (p: Phaser.Input.Pointer) => {
        if (p.button !== 0) return;
        toggleFullscreen();
        this.wakeCorner();
      });
      this.tip(fsBg, 'Fullscreen, on or off.');
      this.fsBtn = this.add.container(0, 0, [fsBg, this.fsIcon]).setDepth(150);
      this.drawFsIcon();
      document.addEventListener('fullscreenchange', this.drawFsIcon);
      this.events.once('shutdown', () => document.removeEventListener('fullscreenchange', this.drawFsIcon));
    }

    this.wakeCorner();
    // A mouse coming near them brings them back.
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      const zoom = this.cameras.main.zoom;
      if (!p.wasTouch && p.x / zoom > this.w - 190 && p.y / zoom < 110) this.wakeCorner();
    });

    this.hud.setAlpha(0);
    this.info.setAlpha(0);
    this.hudShown = false;
    this.hint = this.label(this.w / 2, this.h - PAD, this.hintText(), { fontSize: '15px', color: '#94a3b8' }).setOrigin(0.5, 1);
    this.time.delayedCall(6000, () => this.dismissHint());
  }

  /** The controls, shown at the start of a game. */
  private hintText() {
    return this.sys.game.device.input.touch
      ? 'Left thumb: move   ·   Right thumb: aim'
      : 'WASD: move   ·   Hold mouse: aim   ·   Esc: pause';
  }

  /** First nudge: the control hint comes back a little brighter, then fades again. No new words. */
  nudgeHint() {
    if (this.menu || this.hint) return;
    const hint = this.label(this.w / 2, this.h - PAD, this.hintText(), { fontSize: '15px', color: '#e2e8f0' }).setOrigin(0.5, 1).setAlpha(0);
    this.hint = hint;
    this.tweens.add({
      targets: hint,
      alpha: 1,
      duration: 1200,
      hold: 2200,
      yoyo: true,
      onComplete: () => {
        if (this.hint === hint) this.hint = undefined;
        hint.destroy();
      },
    });
  }

  /** Third nudge: one quiet word under the core. */
  nudgeWord() {
    this.floatWord(NUDGE_WORD, 44);
  }

  /** A small word that fades in near the core (the middle of the screen) and out again. */
  floatWord(text: string, dy = -44) {
    if (this.menu) return;
    const word = this.label(this.w / 2, this.h / 2 + dy, text, { fontSize: '15px', color: '#94a3b8' }).setOrigin(0.5).setAlpha(0);
    this.tweens.add({ targets: word, alpha: 0.9, duration: dy > 0 ? 1000 : 180, hold: dy > 0 ? 2000 : 700, yoyo: true, onComplete: () => word.destroy() });
  }

  update() {
    if (this.hint && this.sticks?.touched) this.dismissHint();
    // The build orb breathes.
    if (this.orb?.active) {
      const breath = (Math.sin(this.time.now / 520) + 1) / 2;
      this.orb.setDisplaySize(ORB_SIZE + 5 * breath, ORB_SIZE + 5 * breath).setAlpha(0.7 + 0.3 * breath);
    }
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
    this.hpZone?.setSize(barW, 24);
    this.xpZone?.setSize(w, 10);
    this.pauseBtn.setPosition(w - PAD - 22, PAD + 14);
    this.fsBtn?.setPosition(w - PAD - 22 - 54, PAD + 14);

    // The tutorial is quiet: no bars, no numbers. When the fight starts, they snap in.
    if (s.tutorial) {
      this.hudShown = false;
      this.hud.clear().setAlpha(0);
      this.info.setAlpha(0);
      this.radar.clear();
      this.drawAbility(null);
      return;
    }
    if (!this.hudShown) {
      this.hudShown = true;
      this.tweens.add({ targets: [this.hud, this.info], alpha: { from: 0, to: 1 }, duration: HUD_SNAP_MS, ease: 'Cubic.Out' });
    }

    g.fillStyle(0x1e293b).fillRoundedRect(PAD, PAD, barW, 12, 6);
    const hpW = Math.max(0, (s.hp / s.maxHp) * barW);
    // Rounded rects glitch when narrower than their corner radius.
    if (hpW > 0) g.fillStyle(0xf43f5e).fillRoundedRect(PAD, PAD, hpW, 12, Math.min(6, hpW / 2));

    g.fillStyle(0x1e293b).fillRect(0, 0, w, 5);
    g.fillStyle(0x4ade80).fillRect(0, 0, (s.xp / s.xpNext) * w, 5);

    this.info.setText(`lv ${s.level}   ${clock(s.elapsed)}   ${s.kills} ${s.hell ? 'kills' : 'souls'}`);
    this.drawRadar(s.gemArrow);
    this.drawAbility(s.ability);
  }

  /** A round button in the trait's colour, with a ring that fills as it recharges and a pulse when ready. */
  private drawAbility(a: HudState['ability']) {
    if (!a) {
      this.ability.setVisible(false);
      this.abilityCaption.setVisible(false);
      this.abilityReady = false;
      return;
    }
    const touch = this.sys.game.device.input.touch;
    // Phones: just above where the right thumb rests. Desktop: top left, under the health bar, where the eye already goes.
    const x = touch ? this.w - PAD - 64 : PAD + ABILITY_R + 5;
    const y = touch ? this.h - PAD - 150 : PAD + 58 + ABILITY_R;
    const appearing = !this.ability.visible;
    this.abilityTrait = a.trait;
    const colour = TRAIT_COLOURS[a.trait];
    const ready = a.charge >= 1;
    // Once ready, the button carries its trait's temperament, like the seeds: rage trembles, calm bobs, hard holds still.
    const shake = ready && a.trait === 'rage' ? 0.8 : 0;
    const bob = ready && a.trait === 'calm' ? Math.sin(this.time.now / 450) * 2 : 0;
    this.ability.setVisible(true).setPosition(x + Phaser.Math.FloatBetween(-shake, shake), y + bob + Phaser.Math.FloatBetween(-shake, shake));
    // The power is named beside its button: always on desktop, and on phones when labels are on.
    this.abilityCaption
      .setVisible(labelsOn() || !touch)
      .setText(POWER_NAMES[a.trait])
      .setOrigin(touch ? 1 : 0, 0.5)
      .setPosition(touch ? x - ABILITY_R - 14 : x + ABILITY_R + 14, y + bob)
      .setAngle(Phaser.Math.FloatBetween(-shake, shake) * 2.5)
      .setAlpha(ready ? 1 : 0.5);
    const g = this.abilityGfx.clear();
    g.fillStyle(colour, ready ? 0.45 : 0.14).fillCircle(0, 0, ABILITY_R);
    g.lineStyle(3, colour, 0.2).strokeCircle(0, 0, ABILITY_R + 5);
    if (a.charge > 0) {
      g.lineStyle(3, colour, 0.9).beginPath();
      g.arc(0, 0, ABILITY_R + 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, a.charge), false);
      g.strokePath();
    }
    if (ready && (!this.abilityReady || appearing)) this.pulseAbility(appearing);
    this.abilityReady = ready;
  }

  /** One soft pulse. When the button first appears, also a quiet chime and (desktop, once) a hint. */
  private pulseAbility(appearing: boolean) {
    this.tweens.add({ targets: this.ability, scale: { from: 1, to: 1.25 }, duration: 160, yoyo: true, ease: 'Sine.Out' });
    if (!appearing) return;
    sfx.ready();
    // The first time it shows in a run, the power says what it does.
    if (this.abilityTrait && !this.abilityExplained) {
      this.abilityExplained = true;
      const touch = this.sys.game.device.input.touch;
      this.showTip(POWER_TIPS[this.abilityTrait], touch ? this.ability.x - 300 : this.ability.x - ABILITY_R - 14, this.ability.y + (touch ? -30 : ABILITY_R + 16), 7);
    }
    if (this.abilityHinted || this.sys.game.device.input.touch) return;
    this.abilityHinted = true;
    const hint = this
      .label(this.ability.x, this.ability.y + ABILITY_R + 12, `press ${POWER.glyph}`, { fontSize: '12px', color: '#94a3b8' })
      .setOrigin(0.5, 0)
      .setDepth(150);
    this.tweens.add({ targets: hint, alpha: 0, delay: 2500, duration: 600, onComplete: () => hint.destroy() });
  }

  /** A small green arrow at the screen edge, on the line from the player toward the nearest off-screen gem. */
  private drawRadar(arrow: HudState['gemArrow']) {
    const g = this.radar.clear();
    if (!arrow) return;
    const { w, h } = this;
    const m = RADAR_INSET;
    const ox = Phaser.Math.Clamp(arrow.px * w, m, w - m);
    const oy = Phaser.Math.Clamp(arrow.py * h, m, h - m);
    const dx = Math.cos(arrow.angle);
    const dy = Math.sin(arrow.angle);
    // Walk from the player along the direction until the inset edge.
    const tx = dx > 0 ? (w - m - ox) / dx : dx < 0 ? (m - ox) / dx : Infinity;
    const ty = dy > 0 ? (h - m - oy) / dy : dy < 0 ? (m - oy) / dy : Infinity;
    const t = Math.min(tx, ty);
    const x = ox + dx * t;
    const y = oy + dy * t;
    const s = RADAR_SIZE;
    const side = arrow.angle + Math.PI / 2;
    // Long and narrow, so the point reads clearly at any angle.
    const bx = x - dx * s;
    const by = y - dy * s;
    const half = s * 0.55;
    g.fillStyle(0x4ade80, RADAR_ALPHA).fillTriangle(
      x + dx * s, y + dy * s,
      bx + Math.cos(side) * half, by + Math.sin(side) * half,
      bx - Math.cos(side) * half, by - Math.sin(side) * half,
    );
  }

  showLevelUp(choices: Upgrade[], onPick: (u: Upgrade) => void) {
    this.showCards('Level up!', choices, onPick);
  }

  /** A row of cards under a title; picking one closes the screen. */
  showCards<T extends { name: string; desc: string; tip?: string }>(title: string, cards: T[], onPick: (card: T) => void) {
    this.openMenu(() => this.cardItems(title, cards, onPick));
  }

  private cardItems<T extends { name: string; desc: string; tip?: string }>(title: string, choices: T[], onPick: (card: T) => void) {
    const { w, h } = this;
    const items: Phaser.GameObjects.GameObject[] = [this.title(title, h * 0.13)];
    const cardW = Math.min(230, (w - PAD * 2 - 32) / 3);
    const cardH = Math.min(230, h * 0.62);
    const top = h * 0.57 - cardH / 2;
    choices.forEach((u, i) => {
      const x = w / 2 + (i - (choices.length - 1) / 2) * (cardW + 16);
      const card = this.add.rectangle(x, top + cardH / 2, cardW, cardH, 0x1e293b).setStrokeStyle(2, 0x5eead4);
      const name = this.label(x, top + 14, u.name, { fontSize: '19px', fontStyle: 'bold', color: '#f8fafc' }).setOrigin(0.5, 0);
      // What it does, then what it is in plain words.
      const desc = this
        .label(x, top + 46, u.desc, { fontSize: '15px', color: '#5eead4', align: 'center', wordWrap: { width: cardW - 24 } })
        .setOrigin(0.5, 0);
      const tip = this
        .label(x, desc.y + desc.height + 10, u.tip ?? '', { fontSize: '13px', color: '#cbd5e1', align: 'center', wordWrap: { width: cardW - 24 }, lineSpacing: 2 })
        .setOrigin(0.5, 0);
      this.makeButton(card, () => onPick(u));
      items.push(card, name, desc, tip);
    });
    return items;
  }

  /** `onAgain` starts the next run right after orientation, as the same core; `onStart` goes back to the very beginning. */
  showGameOver(s: HudState, newBest: boolean, onAgain: (() => void) | null, onStart: () => void) {
    const text = `Survived ${clock(s.elapsed)}  ·  Level ${s.level}  ·  ${s.kills} ${s.hell ? 'kills' : 'souls'}`;
    const best = bestRun();
    // The best run doesn't remember which way it went, so its count is left out.
    const bestText = newBest ? 'New best!' : best ? `Best ${clock(best.time)}  ·  Level ${best.level}` : '';
    this.openMenu(() => {
      const { w, h } = this;
      const summary = this.label(w / 2, h * 0.43, text, { fontSize: '18px', color: '#cbd5e1' }).setOrigin(0.5);
      const record = this
        .label(w / 2, h * 0.51, bestText, { fontSize: '15px', color: newBest ? '#fbbf24' : '#94a3b8' })
        .setOrigin(0.5);
      return [
        this.title('Game over', h * 0.28),
        summary,
        record,
        ...(onAgain
          ? [
              ...this.menuButton('again', h * 0.64, onAgain, { dx: -PAIR_OFFSET * 2, tip: 'Straight back in as the same core, skipping orientation.' }),
              ...this.menuButton('from the start', h * 0.64, onStart, { dx: 0.001, quiet: true, tip: 'Through orientation again. You could become something else.' }),
              ...this.exitButton(h * 0.64, PAIR_OFFSET * 2),
            ]
          : [...this.menuButton('again', h * 0.64, onStart, { dx: -PAIR_OFFSET }), ...this.exitButton(h * 0.64)]),
      ];
    });
  }

  showPause(onResume: () => void, onRestart: () => void) {
    this.openMenu(() => {
      const h = this.h;
      return [
        this.title('Paused', h * 0.25),
        ...this.menuButton('Resume', h * 0.47, onResume, { tip: 'Back to it. Esc, P and Space do the same.' }),
        ...this.menuButton('Restart', h * 0.68, onRestart, { dx: -PAIR_OFFSET, tip: 'Give up this run and start over from orientation.' }),
        ...this.exitButton(h * 0.68),
        ...this.resumeCorner(onResume),
        ...this.buildOrb(),
        ...this.soundButton(),
        ...this.labelsButton(),
        ...(devOn() ? [...this.devShotgunButton(), ...this.devFlareButton()] : []),
        this.label(this.w - PAD, this.h - 14, `v${__APP_VERSION__} · ${__APP_COMMIT__}`, { fontSize: '11px', color: '#475569' }).setOrigin(1, 1),
        // With labels on: how fast it's running and on what, for chasing down lag.
        ...(labelsOn() ? [this.label(PAD, this.h - 14, this.speedReadout(), { fontSize: '11px', color: '#475569' }).setOrigin(0, 1)] : []),
      ];
    });
  }

  /** Flips mute and saves it. Bound to M, and to the button on the pause menu. */
  toggleSound() {
    setMuted(!isMuted());
    refreshMusic();
    sfx.click();
    if (this.menu) this.buildMenu();
  }

  /**
   * A small glowing orb at the foot of the pause menu. On the live game it leads to the preview
   * build (/next/); on the preview build it leads back. With labels on, it says which.
   */
  private buildOrb() {
    const onNext = window.location.pathname.includes('/next/');
    const x = this.w / 2;
    const y = this.h - 30;
    const zone = this.add.rectangle(x, y, 48, 48, 0x000000, 0.001);
    this.orb = this.add.image(x, y, 'orb').setTint(onNext ? ORB_TO_LIVE : ORB_TO_NEXT).setDisplaySize(ORB_SIZE, ORB_SIZE);
    this.makeButton(zone, () => window.location.assign(new URL(onNext ? '../' : 'next/', window.location.href).href));
    this.tip(zone, onNext ? 'Back to the finished game.' : 'The next build: newer, and less tested.');
    const caption = labelsOn()
      ? [this.label(x + ORB_SIZE / 2 + 8, y, onNext ? 'live' : 'next', { fontSize: '13px', color: '#94a3b8' }).setOrigin(0, 0.5)]
      : [];
    return [zone, this.orb, ...caption];
  }

  /** Frames per second, the size being drawn, and the graphics device doing it. */
  private speedReadout() {
    const r = this.game.renderer;
    let device = 'canvas';
    if (r instanceof Phaser.Renderer.WebGL.WebGLRenderer) {
      const info = r.gl.getExtension('WEBGL_debug_renderer_info');
      device = String(r.gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : r.gl.RENDERER));
    }
    return `${Math.round(this.game.loop.actualFps)} fps  ·  ${this.scale.width}x${this.scale.height}  ·  ${device}`;
  }

  /** Top-right of the pause menu, exactly where the pause button sits: the thumb that paused resumes. */
  private resumeCorner(onResume: () => void) {
    const x = this.w - PAD - 22;
    const y = PAD + 14;
    const btn = this.add.rectangle(x, y, 44, 44, 0x1e293b, 0.7).setStrokeStyle(2, 0x5eead4);
    const icon = this.add.graphics().fillStyle(0xe2e8f0).fillTriangle(x - 6, y - 10, x - 6, y + 10, x + 10, y);
    this.makeButton(btn, onResume);
    this.tip(btn, 'Back to it.');
    return [btn, icon];
  }

  /** Top-left corner of the pause menu. */
  private soundButton() {
    const x = PAD + 60;
    const y = PAD + 14;
    const btn = this.add.rectangle(x, y, 120, 44, 0x1e293b).setStrokeStyle(2, 0x475569);
    const label = this.label(x, y, isMuted() ? 'Sound: off' : 'Sound: on', { fontSize: '16px', color: '#cbd5e1' }).setOrigin(0.5);
    this.makeButton(btn, () => this.toggleSound(), true);
    this.tip(btn, 'All sound, on or off. M does the same.');
    return [btn, label];
  }

  /** Right of the sound button: name plates over the seeds and the power button, on or off. Saved. */
  private labelsButton() {
    const x = PAD + 60 + 130;
    const y = PAD + 14;
    const btn = this.add.rectangle(x, y, 120, 44, 0x1e293b).setStrokeStyle(2, 0x475569);
    const label = this.label(x, y, labelsOn() ? 'Labels: on' : 'Labels: off', { fontSize: '16px', color: '#cbd5e1' }).setOrigin(0.5);
    this.makeButton(btn, () => this.toggleLabels(), true);
    this.tip(btn, 'With labels on, every seed and enemy shows what it is thinking, and your power is named when you use it.');
    return [btn, label];
  }

  /** Developer extra (only with `?dev`): right of the labels button, the auto shotgun on or off. Saved, so every run starts with it. */
  private devShotgunButton() {
    const x = PAD + 60 + 260;
    const y = PAD + 14;
    const btn = this.add.rectangle(x, y, 120, 44, 0x1e293b).setStrokeStyle(2, 0x475569);
    const label = this.label(x, y, devShotgunOn() ? 'Shotgun: on' : 'Shotgun: off', { fontSize: '16px', color: '#cbd5e1' }).setOrigin(0.5);
    this.makeButton(
      btn,
      () => {
        setDevShotgun(!devShotgunOn());
        this.onDevShotgun?.(devShotgunOn());
        sfx.click();
        if (this.menu) this.buildMenu();
      },
      true,
    );
    return [btn, label];
  }

  /** Developer extra (only with `?dev`): right of the shotgun switch, the flare on or off. Saved. */
  private devFlareButton() {
    const x = PAD + 60 + 390;
    const y = PAD + 14;
    const btn = this.add.rectangle(x, y, 120, 44, 0x1e293b).setStrokeStyle(2, 0x475569);
    const label = this.label(x, y, devFlareOn() ? 'Flare: on' : 'Flare: off', { fontSize: '16px', color: '#cbd5e1' }).setOrigin(0.5);
    this.makeButton(
      btn,
      () => {
        setDevFlare(!devFlareOn());
        this.onDevFlare?.(devFlareOn());
        sfx.click();
        if (this.menu) this.buildMenu();
      },
      true,
    );
    return [btn, label];
  }

  toggleLabels() {
    setLabels(!labelsOn());
    sfx.click();
    if (this.menu) this.buildMenu();
  }

  /** Dev builds only: a small line at the top showing what the tutorial noticed. */
  showDebug(text: string) {
    if (!import.meta.env.DEV) return;
    this.debugText ??= this.label(0, 12, '', { fontSize: '12px', color: '#94a3b8' }).setOrigin(0.5, 0).setDepth(300);
    this.debugText.setText(text).setPosition(this.w / 2, 12);
    console.info('[tutorial]', text);
  }

  /** Shows the pause and fullscreen buttons plainly, then lets them fade back. They still work while faded. */
  private wakeCorner() {
    // While a menu is open the fullscreen button simply stays lit.
    if (this.menu) return;
    const buttons = [this.pauseBtn, ...(this.fsBtn ? [this.fsBtn] : [])];
    this.tweens.killTweensOf(buttons);
    for (const b of buttons) b.setAlpha(1);
    this.cornerTimer?.remove();
    this.cornerTimer = this.time.delayedCall(CORNER_AWAKE_MS, () => this.tweens.add({ targets: buttons, alpha: CORNER_REST_ALPHA, duration: 700 }));
  }

  closeMenu() {
    this.hideTip();
    this.menu?.destroy();
    this.menu = this.menuBuild = undefined;
    this.pauseBtn.setVisible(true);
    this.fsBtn?.setDepth(150);
    this.wakeCorner();
    if (this.sticks) this.sticks.enabled = true;
  }

  /** Leaves the game for the site. Sits to the right of another button, styled quieter. */
  private exitButton(y: number, dx = PAIR_OFFSET) {
    return this.menuButton('Exit to site', y, () => window.location.assign(SITE_URL), { dx, quiet: true, tip: 'Leave the game for the games page.' });
  }

  private menuButton(text: string, y: number, action: () => void, opts: { dx?: number; quiet?: boolean; tip?: string } = {}) {
    const x = this.w / 2 + (opts.dx ?? 0);
    const width = opts.dx ? 180 : 200;
    const btn = this.add.rectangle(x, y, width, 56, 0x1e293b).setStrokeStyle(2, opts.quiet ? 0x475569 : 0x5eead4);
    const label = this.label(x, y, text, { fontSize: '20px', color: opts.quiet ? '#cbd5e1' : '#f8fafc' }).setOrigin(0.5);
    this.makeButton(btn, action);
    if (opts.tip) this.tip(btn, opts.tip);
    return [btn, label];
  }

  /** Desktop: resting the mouse on `target` explains it. (Phones have no hover; cards and the power carry their own explanations.) */
  private tip<T extends Phaser.GameObjects.GameObject>(target: T, text: string | (() => string)) {
    if (this.sys.game.device.input.touch) return target;
    target.on('pointerover', (p: Phaser.Input.Pointer) => {
      const zoom = this.cameras.main.zoom;
      this.showTip(typeof text === 'function' ? text() : text, p.x / zoom, p.y / zoom);
    });
    target.on('pointerout', () => this.hideTip());
    return target;
  }

  /** A small box of explanation just below (x, y), kept on screen. With `seconds` it goes away by itself. */
  showTip(text: string, x: number, y: number, seconds?: number) {
    this.hideTip();
    if (!text) return;
    const label = this.label(10, 7, text, { fontSize: '13px', color: '#e2e8f0', wordWrap: { width: 250 }, lineSpacing: 2 });
    const w = label.width + 20;
    const h = label.height + 14;
    const bg = this.add.rectangle(0, 0, w, h, 0x0b1222, 0.95).setOrigin(0).setStrokeStyle(1, 0x475569);
    const bx = Phaser.Math.Clamp(x + 14, 8, Math.max(8, this.w - w - 8));
    const by = y + 20 + h > this.h - 8 ? y - h - 12 : y + 20;
    this.tipBox = this.add.container(bx, by, [bg, label]).setDepth(400);
    if (seconds) this.tipTimer = this.time.delayedCall(seconds * 1000, () => this.hideTip());
  }

  hideTip() {
    this.tipTimer?.remove();
    this.tipTimer = undefined;
    this.tipBox?.destroy();
    this.tipBox = undefined;
  }

  /** Text rasterised at device resolution, so the zoomed camera doesn't blur it. */
  /** All in-game text is lowercase (a style choice), so it's lowered here rather than at each call. */
  private label(x: number, y: number, text: string, style: Phaser.Types.GameObjects.Text.TextStyle) {
    return this.add.text(x, y, text.toLowerCase(), { fontFamily: FONT, resolution: pixelRatio(), ...style });
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
    // Fullscreen stays in reach on every menu: shown plainly, above the dimmed screen.
    this.cornerTimer?.remove();
    if (this.fsBtn) {
      this.tweens.killTweensOf([this.pauseBtn, this.fsBtn]);
      this.fsBtn.setDepth(210).setAlpha(1);
    }
    this.ability.setVisible(false);
    this.abilityCaption.setVisible(false);
    this.menuBuild = build;
    this.menuOpenedAt = this.time.now;
    this.buildMenu();
  }

  private buildMenu() {
    if (!this.menuBuild) return;
    this.hideTip();
    this.menu?.destroy();
    const dim = this.add.rectangle(0, 0, this.w, this.h, 0x020617, 0.75).setOrigin(0);
    this.menu = this.add.container(0, 0, [dim, ...this.menuBuild()]).setDepth(200);
  }

  /** Fires only when a press both starts and ends on the button, after the arm delay. */
  private makeButton(target: Phaser.GameObjects.Rectangle, action: () => void, keepOpen = false) {
    let armed = false;
    target.setInteractive({ useHandCursor: true });
    target.on('pointerdown', (p: Phaser.Input.Pointer) => {
      // Left button or touch only.
      armed = p.button === 0 && this.time.now - this.menuOpenedAt > MENU_ARM_MS;
    });
    target.on('pointerout', () => (armed = false));
    target.on('pointerup', () => {
      if (!armed) return;
      // A keepOpen action rebuilds the menu itself.
      if (keepOpen) return action();
      sfx.click();
      this.closeMenu();
      action();
    });
  }

  /** Four corner brackets: pointing out to go fullscreen, pointing in to leave it. */
  private drawFsIcon = () => {
    const g = this.fsIcon?.clear();
    if (!g) return;
    const full = !!document.fullscreenElement;
    const r = 9;
    const arm = 6;
    g.lineStyle(2.5, 0xe2e8f0);
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      // The bracket's corner: at the box corner when expanding, pulled toward the centre when shrinking.
      const cx = sx * (full ? r - arm : r);
      const cy = sy * (full ? r - arm : r);
      const dx = full ? sx * arm : -sx * arm;
      const dy = full ? sy * arm : -sy * arm;
      g.beginPath();
      g.moveTo(cx + dx, cy);
      g.lineTo(cx, cy);
      g.lineTo(cx, cy + dy);
      g.strokePath();
    }
  };

  private dismissHint() {
    if (!this.hint) return;
    const hint = this.hint;
    this.hint = undefined;
    this.tweens.killTweensOf(hint);
    this.tweens.add({ targets: hint, alpha: 0, duration: 400, onComplete: () => hint.destroy() });
  }
}
