import Phaser from 'phaser';
import type { UIScene } from './UIScene';
import { sfx } from '../audio';
import { pixelRatio, TEX_SCALE } from '../display';
import { setPauseMusic } from '../music';
import { recordRun } from '../storage';
import { baseStats, rollUpgrades, type Stats } from '../upgrades';

type Sprite = Phaser.Physics.Arcade.Sprite;
type Vec = Phaser.Math.Vector2;

/** Where the player starts. Space is endless: there are no walls. */
const START = 1200;
/** Background grid: one tile is 64 world px; the tiled area is recentred on the view so it never runs out. */
const GRID_TILE = 64;
const GRID_SIZE = 4096;
/** Visible world area held constant across screen sizes, so no device sees more of the arena. */
const VIEW_AREA = 960 * 540;
/**
 * Auto zoom (tutorial only for now), as a multiple of the base zoom: close in on the player while no enemy is around,
 * otherwise zoom out just enough to frame the player and the nearest enemy (down to ZOOM_FAR).
 */
const ZOOM_CLOSE = 1.6;
const ZOOM_FAR = 0.6;
/** World px kept between the nearest enemy and the screen edge. */
const ZOOM_MARGIN = 60;
/** How quickly the zoom eases toward its target (per second). */
const ZOOM_RATE = 2.5;
const CONTACT_DAMAGE = 10;
const INVULN_SECONDS = 0.7;
/** Draw scale for the oversized textures. Body sizes passed to setCircle are in texture pixels. */
const SPRITE_SCALE = 1 / TEX_SCALE;
const T = TEX_SCALE;
/** Shotgun reach (world px) and how far apart its outermost pellets fly (radians). */
const SHOTGUN_RANGE = 230;
const SHOTGUN_SPREAD = 0.75;
const SHOTGUN_SPEED = 620;
/** Seconds an enemy hit by a pellet is pushed back instead of chasing. */
const KNOCKBACK_SECONDS = 0.12;
const KNOCKBACK_SPEED = 260;
/** Tutorial: how far from the player its one enemy appears. */
const TUTORIAL_DISTANCE = 260;
/** `?tutorial` in the URL: a tutorial-only sandbox. Each kill starts a fresh tutorial instead of the game. */
const TUTORIAL_ONLY = new URLSearchParams(window.location.search).has('tutorial');
/** Sandbox: pause between the kill and the next tutorial (ms). */
const TUTORIAL_REPEAT_MS = 1200;
/** Skeptical seeds flee inside this radius, otherwise wander, drifting back past the leash. */
const SKEPTICAL_FLEE_RADIUS = 220;
const SKEPTICAL_FLEE_SPEED = 90;
const WANDER_SPEED = 35;
const WANDER_LEASH = 400;
/** Aggro tutorial enemy's chase speed, including one aggravated by being shot. */
const AGGRO_SPEED = 80;
/** Seed temperaments, equally likely for now. */
const TUTORIAL_MOODS = ['curious', 'skeptical', 'aggro'] as const;
/** When the first aggro seed is absorbed into the core, a brood of smaller seeds pops up, one of each temperament. */
const BROOD_DELAYS_MS = [350, 900, 1500];
const BROOD_DISTANCE: [number, number] = [110, 170];
const BROOD_SIZE = 0.7;
const BROOD_HP = 2;
const POP_MS = 260;

/** How an enemy moves. Normal enemies chase; the tutorial enemy has a temperament, and turns aggro when shot. */
type Mood = 'chase' | (typeof TUTORIAL_MOODS)[number];

/**
 * Subtle tells for a tutorial enemy's temperament: a tint multiplied over the sprite and a
 * size relative to normal. Aggro is a little redder, skeptical (timid) a little smaller.
 */
const MOOD_LOOK: Record<Mood, { tint: number; size: number }> = {
  chase: { tint: 0xffffff, size: 1 },
  curious: { tint: 0xffffff, size: 1 },
  skeptical: { tint: 0xffffff, size: 0.85 },
  aggro: { tint: 0xffa8a8, size: 1 },
};
/** How long a change of temperament takes to show (ms). */
const MOOD_EASE_MS = 500;

/** Seconds a tutorial sprite has to stay inside you to be absorbed. */
const ABSORB_SECONDS = 1.5;
/** Absorbing an aggro sprite: how much you swell, and how red you turn (overlay opacity), at full anger. */
const ANGER_SWELL = 0.25;
const ANGER_RED = 0.55;
/** Bullet hell: enemies on screen fire a slow aimed shot every few seconds. */
const ENEMY_SHOT_SPEED = 170;
const ENEMY_SHOT_LIFE = 4;
const ENEMY_SHOT_GAP: [number, number] = [1.8, 3.6];

/** What the tutorial noticed about how it was played. */
interface TutorialNotes {
  startMood: Mood;
  /** Seconds into the tutorial of the first shot, or null if none. */
  firstShot: number | null;
  shots: number;
  shotWhileCalm: boolean;
  seconds: number;
  killed: number;
  absorbed: number;
}

export interface HudState {
  hp: number;
  maxHp: number;
  xp: number;
  xpNext: number;
  level: number;
  kills: number;
  elapsed: number;
}

export class GameScene extends Phaser.Scene {
  private ui!: UIScene;
  private player!: Sprite;
  private enemies!: Phaser.Physics.Arcade.Group;
  private bullets!: Phaser.Physics.Arcade.Group;
  private gems!: Phaser.Physics.Arcade.Group;
  private grid!: Phaser.GameObjects.TileSprite;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private readonly aimVec = new Phaser.Math.Vector2();
  private readonly moveVec = new Phaser.Math.Vector2();

  // Reset in create(): scene.restart() reuses this instance.
  private stats!: Stats;
  private hp = 0;
  private xp = 0;
  private level = 1;
  private kills = 0;
  private elapsed = 0;
  private fireCooldown = 0;
  private shotgunCooldown = 0;
  private spawnTimer = 0;
  private invuln = 0;
  private pendingLevels = 0;
  /** True whenever play is halted: pause, level-up, or game over. */
  private frozen = false;
  private paused = false;
  /** Zoom that keeps the visible world area constant across screens; auto zoom multiplies it. */
  private baseZoom = 1;
  private zoomFactor = ZOOM_CLOSE;
  /** The opening tutorial: black screen, one enemy, no auto-fire until it dies. */
  private tutorial = false;
  /** Decided by the tutorial: killing the sprite leads to bullet hell, absorbing it to bullet heaven. */
  private mode: 'heaven' | 'hell' = 'heaven';
  private notes!: TutorialNotes;
  /** 0..1: how much of an aggro sprite's anger you've absorbed. Shown as swelling and a red overlay. */
  private anger = 0;
  private angerOverlay!: Phaser.GameObjects.Image;
  private enemyBullets!: Phaser.Physics.Arcade.Group;
  /** Dev builds only: names the tutorial enemy's temperament above it. */
  private moodLabels: Phaser.GameObjects.Text[] = [];
  /** Brood seeds scheduled to pop up but not out yet; the tutorial can't end while any are pending. */
  private pendingSeeds = 0;
  private hadFocus = true;
  /** Same media query that shows #rotate in index.html. */
  private readonly rotatePrompt = window.matchMedia('(orientation: portrait) and (pointer: coarse)');

  constructor() {
    super('game');
  }

  create() {
    this.stats = baseStats();
    this.hp = this.stats.maxHp;
    this.xp = this.kills = this.elapsed = this.fireCooldown = this.shotgunCooldown = this.invuln = this.pendingLevels = 0;
    this.level = 1;
    this.spawnTimer = 1;
    this.frozen = this.paused = false;
    // Every new game opens with the tutorial.
    this.tutorial = true;
    this.mode = 'heaven';
    this.notes = { startMood: 'curious', firstShot: null, shots: 0, shotWhileCalm: false, seconds: 0, killed: 0, absorbed: 0 };
    this.pendingSeeds = 0;
    this.moodLabels = [];
    setPauseMusic(false);
    this.physics.resume();
    this.time.paused = false;

    this.grid = this.add.tileSprite(0, 0, GRID_SIZE, GRID_SIZE, 'grid').setOrigin(0).setTileScale(SPRITE_SCALE);
    this.grid.setVisible(!this.tutorial);

    this.player = this.physics.add.sprite(START, START, 'player').setDepth(10).setScale(SPRITE_SCALE);
    this.player.setCircle(13 * T, 3 * T, 3 * T);
    this.angerOverlay = this.add.image(START, START, 'player').setTintFill(0xf43f5e).setDepth(11).setAlpha(0);
    this.setAnger(0);

    this.enemies = this.physics.add.group({ defaultKey: 'enemy', maxSize: 400 });
    this.bullets = this.physics.add.group({ defaultKey: 'bullet', maxSize: 300 });
    this.enemyBullets = this.physics.add.group({ defaultKey: 'bullet', maxSize: 300 });
    this.gems = this.physics.add.group({ defaultKey: 'gem', maxSize: 600 });

    this.physics.add.collider(this.enemies, this.enemies);
    this.physics.add.overlap(this.bullets, this.enemies, (b, e) => this.onBulletHit(b as Sprite, e as Sprite));
    this.physics.add.overlap(this.player, this.enemies, (_p, e) => this.onPlayerTouch(e as Sprite));
    this.physics.add.overlap(this.player, this.enemyBullets, (_p, b) => this.onEnemyBullet(b as Sprite));
    this.physics.add.overlap(this.player, this.gems, (_p, g) => this.onGem(g as Sprite));

    const cam = this.cameras.main;
    cam.setBackgroundColor(this.tutorial ? 0x000000 : 'rgba(0,0,0,0)');
    cam.startFollow(this.player, true, 0.15, 0.15);
    this.zoomFactor = this.tutorial ? ZOOM_CLOSE : 1;
    this.fitZoom();
    this.scale.on('resize', this.fitZoom, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.fitZoom, this));

    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT') as Record<string, Phaser.Input.Keyboard.Key>;
    kb.on('keydown-ESC', this.togglePause, this);
    kb.on('keydown-P', this.togglePause, this);
    kb.on('keydown-M', () => this.ui.toggleSound());

    // Alt-tab or a hidden tab swallows keyup/touchend, which leaves inputs stuck down.
    // Blur events aren't delivered everywhere, so update() also polls document.hasFocus(),
    // and keys are cleared again on return in case the loss was missed entirely.
    this.hadFocus = document.hasFocus();
    this.game.events.on(Phaser.Core.Events.BLUR, this.onFocusLost, this);
    this.game.events.on(Phaser.Core.Events.HIDDEN, this.onFocusLost, this);
    this.game.events.on(Phaser.Core.Events.FOCUS, this.releaseKeys, this);
    this.events.once('shutdown', () => {
      this.game.events.off(Phaser.Core.Events.BLUR, this.onFocusLost, this);
      this.game.events.off(Phaser.Core.Events.HIDDEN, this.onFocusLost, this);
      this.game.events.off(Phaser.Core.Events.FOCUS, this.releaseKeys, this);
    });

    if (this.tutorial) this.spawnTutorialEnemy();

    this.scene.launch('ui');
    this.ui = this.scene.get('ui') as UIScene;
    this.ui.onPauseRequested = () => this.pauseGame();
  }

  private releaseKeys() {
    this.input.keyboard?.resetKeys();
  }

  private onFocusLost() {
    this.releaseKeys();
    this.pauseGame();
  }

  /** Pauses on a focused -> unfocused transition only, so a page that never reports focus stays playable. */
  private pollFocus() {
    const focused = document.hasFocus();
    if (this.hadFocus && !focused) this.onFocusLost();
    this.hadFocus = focused;
  }

  private togglePause() {
    if (this.paused) this.resumeGame();
    else this.pauseGame();
  }

  private pauseGame() {
    if (this.frozen) return;
    this.frozen = this.paused = true;
    this.physics.pause();
    this.time.paused = true;
    setPauseMusic(true);
    this.ui.showPause(
      () => this.resumeGame(),
      () => this.scene.restart(),
    );
  }

  private resumeGame() {
    if (!this.paused) return;
    this.ui.closeMenu();
    setPauseMusic(false);
    this.frozen = this.paused = false;
    this.physics.resume();
    this.time.paused = false;
  }

  update(_time: number, delta: number) {
    this.pollFocus();
    if (this.frozen) return;
    // The "turn your phone sideways" overlay covers the game; don't play on underneath it.
    if (this.rotatePrompt.matches) return this.pauseGame();
    const dt = delta / 1000;
    // The run clock (and so difficulty) starts after the tutorial.
    if (!this.tutorial) this.elapsed += dt;
    else this.notes.seconds += dt;

    this.movePlayer();
    this.steerEnemies(dt);
    this.pullGems();
    this.updateZoom(dt);
    this.ageBullets(this.bullets, dt);
    this.ageBullets(this.enemyBullets, dt);
    this.enemiesShoot(dt);
    this.fire(dt);
    this.fireShotgun(dt);
    this.spawn(dt);

    if (this.invuln > 0) this.invuln -= dt;
    this.player.setAlpha(this.invuln > 0 && Math.floor(this.invuln * 12) % 2 ? 0.35 : 1);
    this.angerOverlay.setPosition(this.player.x, this.player.y).setAlpha(ANGER_RED * this.anger * this.player.alpha);

    this.ui.updateHud(this.hudState());
    this.updateMoodLabel();
    this.followGrid();
  }

  /** Recentres the tiled background on the view, snapped to whole tiles so the pattern doesn't shift. */
  private followGrid() {
    const v = this.cameras.main.worldView;
    const snap = (n: number) => Math.floor((n - GRID_SIZE / 2) / GRID_TILE) * GRID_TILE;
    this.grid.setPosition(snap(v.centerX), snap(v.centerY));
  }

  /** Dev only: keeps the temperament label over the tutorial enemy. */
  private updateMoodLabel() {
    if (!import.meta.env.DEV) return;
    const seeds = this.tutorial ? (this.enemies.getChildren().filter((o) => o.active) as Sprite[]) : [];
    while (this.moodLabels.length < seeds.length) {
      const style = { fontFamily: 'system-ui, sans-serif', fontSize: '9px', color: '#94a3b8', resolution: pixelRatio() * 2 };
      this.moodLabels.push(this.add.text(0, 0, '', style).setOrigin(0.5, 1).setDepth(20));
    }
    this.moodLabels.forEach((label, i) => {
      const e = seeds[i];
      label.setVisible(!!e);
      if (e) label.setText(e.getData('mood')).setPosition(e.x, e.y - 16 * (e.scaleX / SPRITE_SCALE));
    });
  }

  private fitZoom() {
    const { width, height } = this.scale;
    this.baseZoom = Math.sqrt((width * height) / VIEW_AREA);
    this.cameras.main.setZoom(this.baseZoom * this.zoomFactor);
  }

  private hudState(): HudState {
    return {
      hp: this.hp,
      maxHp: this.stats.maxHp,
      xp: this.xp,
      xpNext: this.xpToNext(),
      level: this.level,
      kills: this.kills,
      elapsed: this.elapsed,
    };
  }

  private xpToNext() {
    return Math.floor(5 * Math.pow(this.level, 1.35));
  }

  private movePlayer() {
    const k = this.keys;
    const kx = (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0);
    const ky = (k.S.isDown || k.DOWN.isDown ? 1 : 0) - (k.W.isDown || k.UP.isDown ? 1 : 0);
    const v = this.moveVec;
    if (kx || ky) v.set(kx, ky).normalize();
    else if (this.ui.sticks) v.copy(this.ui.sticks.move);
    else v.reset();
    this.player.setVelocity(v.x * this.stats.speed, v.y * this.stats.speed);
  }

  /** Manual aim (right stick or held mouse) wins; otherwise auto-aim at the nearest enemy in range. */
  private aimDirection(range: number): Vec | null {
    const sticks = this.ui.sticks;
    if (sticks?.aiming && sticks.aim.lengthSq() > 0) return this.aimVec.copy(sticks.aim).normalize();

    const p = this.input.activePointer;
    // Left button only: right-click does nothing (for now).
    if (!p.wasTouch && p.leftButtonDown()) {
      const world = p.positionToCamera(this.cameras.main) as Vec;
      return this.aimVec.set(world.x - this.player.x, world.y - this.player.y).normalize();
    }

    // No auto-aim during the tutorial (the first enemy is shot by hand) or in bullet hell (always by hand).
    if (this.tutorial || this.mode === 'hell') return null;
    // Never auto-fire at something the player can't see.
    const target = this.nearestEnemy(range, this.cameras.main.worldView);
    if (!target) return null;
    return this.aimVec.set(target.x - this.player.x, target.y - this.player.y).normalize();
  }

  /**
   * Tutorial only for now: eases the zoom toward framing the player and the nearest enemy, or close in
   * when there is none. After the tutorial it eases back to the normal zoom and stays there.
   */
  private updateZoom(dt: number) {
    let target = this.tutorial ? ZOOM_CLOSE : 1;
    const e = this.tutorial ? this.nearestEnemy(Infinity) : null;
    if (e) {
      const { width, height } = this.scale;
      const dx = Math.abs(e.x - this.player.x) + ZOOM_MARGIN;
      const dy = Math.abs(e.y - this.player.y) + ZOOM_MARGIN;
      const fit = Math.min(width / 2 / (this.baseZoom * dx), height / 2 / (this.baseZoom * dy));
      target = Phaser.Math.Clamp(fit, ZOOM_FAR, ZOOM_CLOSE);
    }
    this.zoomFactor += (target - this.zoomFactor) * (1 - Math.exp(-ZOOM_RATE * dt));
    this.cameras.main.setZoom(this.baseZoom * this.zoomFactor);
  }

  /** Nearest active enemy within range, optionally only those inside `view`. */
  private nearestEnemy(range: number, view?: Phaser.Geom.Rectangle): Sprite | null {
    let best: Sprite | null = null;
    let bestD = range * range;
    for (const obj of this.enemies.getChildren()) {
      const e = obj as Sprite;
      if (!e.active || (view && !view.contains(e.x, e.y))) continue;
      const d = Phaser.Math.Distance.Squared(e.x, e.y, this.player.x, this.player.y);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  private fire(dt: number) {
    this.fireCooldown -= dt;
    if (this.fireCooldown > 0) return;
    const dir = this.aimDirection(this.stats.range);
    if (!dir) return;
    this.fireCooldown = 1 / this.stats.fireRate;
    if (this.tutorial) {
      this.notes.shots++;
      this.notes.firstShot ??= this.notes.seconds;
    }

    sfx.shoot();
    const n = this.stats.multishot;
    const base = dir.angle();
    for (let i = 0; i < n; i++) {
      const angle = base + (i - (n - 1) / 2) * 0.18;
      if (!this.shoot(angle, this.stats.bulletSpeed, this.stats.range / this.stats.bulletSpeed + 0.15, false)) break;
    }
  }

  /** The shotgun fires on its own cooldown, only at enemies within its short reach unless aimed by hand. */
  private fireShotgun(dt: number) {
    const n = this.stats.shotgunPellets;
    if (n === 0) return;
    this.shotgunCooldown -= dt;
    if (this.shotgunCooldown > 0) return;
    const dir = this.aimDirection(SHOTGUN_RANGE);
    if (!dir) return;
    this.shotgunCooldown = 1 / this.stats.shotgunRate;

    sfx.shotgun();
    const base = dir.angle();
    for (let i = 0; i < n; i++) {
      // Evenly fanned, with a little jitter so blasts don't look stamped.
      const angle = base + (i / (n - 1) - 0.5) * SHOTGUN_SPREAD + Phaser.Math.FloatBetween(-0.04, 0.04);
      const speed = SHOTGUN_SPEED * Phaser.Math.FloatBetween(0.85, 1.1);
      if (!this.shoot(angle, speed, SHOTGUN_RANGE / speed, true)) break;
    }
  }

  /** Launches one pooled projectile. Returns false when the pool is exhausted. */
  private shoot(angle: number, speed: number, life: number, pellet: boolean) {
    const b = this.bullets.get() as Sprite | null;
    if (!b) return false;
    b.enableBody(true, this.player.x, this.player.y, true, true);
    b.setScale(pellet ? SPRITE_SCALE * 0.7 : SPRITE_SCALE).setCircle(5 * T, 3 * T, 3 * T).setDepth(5);
    if (pellet) b.setTint(0xfb923c);
    else b.clearTint();
    this.physics.velocityFromRotation(angle, speed, (b.body as Phaser.Physics.Arcade.Body).velocity);
    // Reuse the pooled bullet's hit set rather than allocating one per shot.
    const hits = (b.getData('hits') as Set<Sprite> | undefined) ?? new Set<Sprite>();
    hits.clear();
    b.setData({ pierce: this.stats.pierce, life, hits, pellet });
    return true;
  }

  private ageBullets(group: Phaser.Physics.Arcade.Group, dt: number) {
    for (const obj of group.getChildren()) {
      const b = obj as Sprite;
      if (!b.active) continue;
      const life = b.getData('life') - dt;
      if (life <= 0) b.disableBody(true, true);
      else b.setData('life', life);
    }
  }

  private spawn(dt: number) {
    if (this.tutorial) return;
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    this.spawnTimer = Math.max(0.15, 1.1 - this.elapsed * 0.006);
    const count = 1 + Math.floor(this.elapsed / 40);
    for (let i = 0; i < count; i++) this.spawnEnemy();
  }

  /** Spawns just outside the camera view, relative to the camera rather than fixed points. */
  private spawnEnemy() {
    const view = this.cameras.main.worldView;
    const r = Math.hypot(view.width, view.height) / 2 + 40;
    const a = Math.random() * Math.PI * 2;
    const x = view.centerX + Math.cos(a) * r;
    const y = view.centerY + Math.sin(a) * r;

    const e = this.enemies.get() as Sprite | null;
    if (!e) return;
    e.enableBody(true, x, y, true, true);
    e.setScale(SPRITE_SCALE).setCircle(12 * T, 4 * T, 4 * T).clearTint().setDepth(4).setCollideWorldBounds(false).setAlpha(1);
    e.setData({
      mood: 'chase',
      tint: 0xffffff,
      absorb: 0,
      shootCd: Phaser.Math.FloatBetween(...ENEMY_SHOT_GAP),
      hp: 3 + this.elapsed / 25,
      speed: Math.min(170, Phaser.Math.Between(70, 100) + this.elapsed * 0.3),
      knock: 0,
    });
  }

  private steerEnemies(dt: number) {
    for (const obj of this.enemies.getChildren()) {
      const e = obj as Sprite;
      if (!e.active) continue;
      // While knocked back, keep the shove velocity instead of chasing.
      const knock = e.getData('knock') as number;
      const mood = e.getData('mood') as Mood;
      if (knock > 0) e.setData('knock', knock - dt);
      else if (mood === 'curious') e.setVelocity(0, 0);
      else if (mood === 'skeptical') this.steerWander(e, dt, true);
      else this.physics.moveToObject(e, this.player, e.getData('speed'));
    }
  }

  /** Ambles about, heading back toward the player if it strays too far. With `flee`, runs from the player when close. */
  private steerWander(e: Sprite, dt: number, flee: boolean) {
    const body = e.body as Phaser.Physics.Arcade.Body;
    const d = Phaser.Math.Distance.Between(e.x, e.y, this.player.x, this.player.y);
    if (flee && d < SKEPTICAL_FLEE_RADIUS) {
      const away = Phaser.Math.Angle.Between(this.player.x, this.player.y, e.x, e.y);
      this.physics.velocityFromRotation(away, SKEPTICAL_FLEE_SPEED, body.velocity);
      e.setData('wander', 0);
      return;
    }
    let t = (e.getData('wander') as number) - dt;
    if (t <= 0) {
      t = Phaser.Math.FloatBetween(1, 2);
      const heading =
        d > WANDER_LEASH
          ? Phaser.Math.Angle.Between(e.x, e.y, this.player.x, this.player.y) + Phaser.Math.FloatBetween(-0.6, 0.6)
          : Math.random() * Math.PI * 2;
      this.physics.velocityFromRotation(heading, WANDER_SPEED, body.velocity);
    }
    e.setData('wander', t);
  }

  /** Shows an enemy's temperament through its tint and size, eased in when `animate` is set. */
  private showMood(e: Sprite, animate: boolean) {
    const look = MOOD_LOOK[e.getData('mood') as Mood];
    const size = look.size * ((e.getData('baseSize') as number | undefined) ?? 1);
    const fromSize = e.scaleX / SPRITE_SCALE;
    const fromTint = (e.getData('tint') as number | undefined) ?? 0xffffff;
    const apply = (p: number) => {
      e.setScale(SPRITE_SCALE * Phaser.Math.Linear(fromSize, size, p));
      e.setData('tint', lerpColor(fromTint, look.tint, p));
      this.restoreTint(e);
    };
    if (!animate) return apply(1);
    this.tweens.addCounter({ from: 0, to: 1, duration: MOOD_EASE_MS, onUpdate: (tw) => apply(tw.getValue() ?? 1) });
  }

  /** Puts back the enemy's temperament tint (after a hit flash, for instance). */
  private restoreTint(e: Sprite) {
    const tint = (e.getData('tint') as number | undefined) ?? 0xffffff;
    if (tint === 0xffffff) e.clearTint();
    else e.setTint(tint);
  }

  /** The tutorial's first seed: on screen, with a random temperament. */
  private spawnTutorialEnemy() {
    const mood: Mood = Phaser.Utils.Array.GetRandom([...TUTORIAL_MOODS]);
    const a = Math.random() * Math.PI * 2;
    this.spawnSeed(mood, this.player.x + Math.cos(a) * TUTORIAL_DISTANCE, this.player.y + Math.sin(a) * TUTORIAL_DISTANCE, 0);
    this.notes.startMood = mood;
  }

  /** A tutorial seed. Generation 0 is the first seed; generation 1 is a smaller brood seed that pops in. */
  private spawnSeed(mood: Mood, x: number, y: number, gen: number) {
    const e = this.enemies.get() as Sprite | null;
    if (!e) return;
    e.enableBody(true, x, y, true, true);
    e.setScale(SPRITE_SCALE).setCircle(12 * T, 4 * T, 4 * T).clearTint().setDepth(4).setCollideWorldBounds(false).setAlpha(1);
    e.setData({ mood, gen, baseSize: gen ? BROOD_SIZE : 1, hp: gen ? BROOD_HP : 3, speed: AGGRO_SPEED, knock: 0, wander: 0, absorb: 0, tint: 0xffffff });
    this.showMood(e, false);
    if (!gen) return;
    const size = e.scaleX;
    e.setScale(0);
    this.tweens.add({ targets: e, scale: size, duration: POP_MS, ease: 'Back.Out' });
  }

  /** The first aggro seed, absorbed: three smaller seeds pop up around the core one at a time, one of each temperament. */
  private spawnBrood() {
    const moods = Phaser.Utils.Array.Shuffle([...TUTORIAL_MOODS]);
    const start = Math.random() * Math.PI * 2;
    this.pendingSeeds += moods.length;
    moods.forEach((mood, i) => {
      this.time.delayedCall(BROOD_DELAYS_MS[i], () => {
        this.pendingSeeds--;
        if (!this.tutorial) return;
        const a = start + (i * Math.PI * 2) / moods.length + Phaser.Math.FloatBetween(-0.4, 0.4);
        const d = Phaser.Math.FloatBetween(...BROOD_DISTANCE);
        this.spawnSeed(mood, this.player.x + Math.cos(a) * d, this.player.y + Math.sin(a) * d, 1);
      });
    });
  }

  /** The tutorial ends once every seed is killed or absorbed. Mostly killed: bullet hell; otherwise bullet heaven. */
  private checkTutorialDone() {
    if (!this.tutorial || this.pendingSeeds > 0) return;
    if (this.enemies.getChildren().some((o) => o.active)) return;
    this.endTutorial(this.notes.killed > this.notes.absorbed ? 'killed' : 'absorbed');
  }

  /** First kill: auto-fire on, the grid fades in, and the normal run begins. */
  private endTutorial(outcome: 'killed' | 'absorbed' = 'absorbed') {
    const n = this.notes;
    const readout = [
      outcome === 'killed' ? 'killed: bullet hell' : 'absorbed: bullet heaven',
      `was ${n.startMood}`,
      `first shot ${n.firstShot === null ? 'never' : n.firstShot.toFixed(1) + 's'}`,
      `${n.shots} shots`,
      `killed ${n.killed}, absorbed ${n.absorbed}`,
      ...(n.shotWhileCalm ? ['shot it while calm'] : []),
      `${n.seconds.toFixed(1)}s`,
    ].join('   ·   ');
    this.ui.showDebug(readout);
    if (TUTORIAL_ONLY) {
      this.time.delayedCall(TUTORIAL_REPEAT_MS, () => this.scene.restart());
      return;
    }
    this.tutorial = false;
    this.mode = outcome === 'killed' ? 'hell' : 'heaven';
    this.cameras.main.setBackgroundColor('rgba(0,0,0,0)');
    this.grid.setVisible(true).setAlpha(0);
    this.tweens.add({ targets: this.grid, alpha: 1, duration: 1200 });
    this.spawnTimer = 1.5;
  }

  private onBulletHit(b: Sprite, e: Sprite) {
    if (!b.active || !e.active) return;
    const hits = b.getData('hits') as Set<Sprite>;
    if (hits.has(e)) return;
    hits.add(e);

    const hp = e.getData('hp') - this.stats.damage;
    e.setData('hp', hp);
    if (hp <= 0) {
      this.kills++;
      sfx.kill();
      this.dropGem(e.x, e.y);
      e.disableBody(true, true);
      if (this.tutorial) {
        this.notes.killed++;
        this.checkTutorialDone();
      }
    } else {
      sfx.hit();
      // Shooting the tutorial enemy aggravates it.
      if (this.tutorial && e.getData('mood') !== 'aggro') {
        this.notes.shotWhileCalm = true;
        e.setData('mood', 'aggro');
        this.showMood(e, true);
      }
      e.setTintFill(0xffffff);
      this.time.delayedCall(60, () => this.restoreTint(e));
      if (b.getData('pellet')) {
        const body = b.body as Phaser.Physics.Arcade.Body;
        this.physics.velocityFromRotation(body.velocity.angle(), KNOCKBACK_SPEED, (e.body as Phaser.Physics.Arcade.Body).velocity);
        e.setData('knock', KNOCKBACK_SECONDS);
      }
    }

    const pierce = b.getData('pierce');
    if (pierce <= 0) b.disableBody(true, true);
    else b.setData('pierce', pierce - 1);
  }

  /** In the tutorial a sprite inside you is slowly absorbed; afterwards, contact hurts. */
  private onPlayerTouch(e: Sprite) {
    if (this.tutorial) this.absorb(e);
    else this.onPlayerHit();
  }

  /** Progresses absorbing a tutorial sprite while it's inside you. An angry one swells and reddens you. */
  private absorb(e: Sprite) {
    if (this.frozen || !e.active) return;
    const p = Math.min(1, (e.getData('absorb') as number) + this.game.loop.delta / 1000 / ABSORB_SECONDS);
    e.setData('absorb', p).setAlpha(1 - 0.7 * p);
    if (e.getData('mood') === 'aggro') this.setAnger(Math.max(this.anger, p));
    if (p < 1) return;
    e.disableBody(true, true);
    this.notes.absorbed++;
    if (e.getData('mood') === 'aggro' && e.getData('gen') === 0) this.spawnBrood();
    this.checkTutorialDone();
  }

  private setAnger(a: number) {
    this.anger = a;
    const scale = SPRITE_SCALE * (1 + ANGER_SWELL * a);
    this.player.setScale(scale);
    this.angerOverlay.setScale(scale);
  }

  /** Bullet hell only: each enemy on screen fires a slow shot at the player every few seconds. */
  private enemiesShoot(dt: number) {
    if (this.mode !== 'hell' || this.tutorial) return;
    const view = this.cameras.main.worldView;
    for (const obj of this.enemies.getChildren()) {
      const e = obj as Sprite;
      if (!e.active) continue;
      let cd = (e.getData('shootCd') as number) - dt;
      if (cd <= 0 && view.contains(e.x, e.y)) {
        cd = Phaser.Math.FloatBetween(...ENEMY_SHOT_GAP);
        const b = this.enemyBullets.get() as Sprite | null;
        if (b) {
          b.enableBody(true, e.x, e.y, true, true);
          b.setScale(SPRITE_SCALE).setCircle(5 * T, 3 * T, 3 * T).setDepth(5).setTint(0xf43f5e);
          const angle = Phaser.Math.Angle.Between(e.x, e.y, this.player.x, this.player.y);
          this.physics.velocityFromRotation(angle, ENEMY_SHOT_SPEED, (b.body as Phaser.Physics.Arcade.Body).velocity);
          b.setData('life', ENEMY_SHOT_LIFE);
        }
      }
      e.setData('shootCd', cd);
    }
  }

  private onEnemyBullet(b: Sprite) {
    if (!b.active || this.frozen) return;
    b.disableBody(true, true);
    this.onPlayerHit();
  }

  private onPlayerHit() {
    if (this.invuln > 0 || this.frozen || this.tutorial) return;
    this.hp -= CONTACT_DAMAGE;
    this.invuln = INVULN_SECONDS;
    this.cameras.main.shake(120, 0.006);
    if (this.hp <= 0) this.gameOver();
    else sfx.hurt();
  }

  private dropGem(x: number, y: number) {
    const g = this.gems.get() as Sprite | null;
    if (!g) return;
    g.enableBody(true, x, y, true, true);
    g.setScale(SPRITE_SCALE).setDepth(3);
  }

  private pullGems() {
    const reach = this.stats.magnet * this.stats.magnet;
    for (const obj of this.gems.getChildren()) {
      const g = obj as Sprite;
      if (!g.active) continue;
      if (Phaser.Math.Distance.Squared(g.x, g.y, this.player.x, this.player.y) < reach) {
        this.physics.moveToObject(g, this.player, 450);
      } else {
        g.setVelocity(0, 0);
      }
    }
  }

  private onGem(g: Sprite) {
    if (!g.active) return;
    g.disableBody(true, true);
    sfx.gem();
    this.xp++;
    while (this.xp >= this.xpToNext()) {
      this.xp -= this.xpToNext();
      this.level++;
      this.pendingLevels++;
    }
    if (this.pendingLevels > 0 && !this.frozen) this.offerUpgrade();
  }

  private offerUpgrade() {
    this.frozen = true;
    this.physics.pause();
    this.ui.updateHud(this.hudState());
    sfx.levelUp();
    this.ui.showLevelUp(rollUpgrades(3, this.stats), (upgrade) => {
      upgrade.apply(this.stats, { heal: (n) => (this.hp = Math.min(this.stats.maxHp, this.hp + n)) });
      this.pendingLevels--;
      if (this.pendingLevels > 0) {
        this.offerUpgrade();
      } else {
        this.frozen = false;
        this.physics.resume();
      }
    });
  }

  private gameOver() {
    this.frozen = true;
    this.physics.pause();
    this.hp = 0;
    this.ui.updateHud(this.hudState());
    sfx.gameOver();
    const newBest = recordRun({ time: this.elapsed, level: this.level, kills: this.kills });
    this.ui.showGameOver(this.hudState(), newBest, () => this.scene.restart());
  }
}

/** Blends two 0xRRGGBB colours; p = 0 gives `a`, 1 gives `b`. */
function lerpColor(a: number, b: number, p: number) {
  const ch = (shift: number) => Math.round(Phaser.Math.Linear((a >> shift) & 0xff, (b >> shift) & 0xff, p)) << shift;
  return ch(16) | ch(8) | ch(0);
}
