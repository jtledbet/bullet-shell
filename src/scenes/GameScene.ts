import Phaser from 'phaser';
import type { UIScene } from './UIScene';
import { sfx } from '../audio';
import { TEX_SCALE } from '../display';
import { recordRun } from '../storage';
import { baseStats, rollUpgrades, type Stats } from '../upgrades';

type Sprite = Phaser.Physics.Arcade.Sprite;
type Vec = Phaser.Math.Vector2;

const WORLD = 2400;
/** Visible world area held constant across screen sizes, so no device sees more of the arena. */
const VIEW_AREA = 960 * 540;
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
    this.physics.resume();
    this.time.paused = false;

    this.physics.world.setBounds(0, 0, WORLD, WORLD);
    this.add.tileSprite(0, 0, WORLD, WORLD, 'grid').setOrigin(0).setTileScale(SPRITE_SCALE);

    this.player = this.physics.add.sprite(WORLD / 2, WORLD / 2, 'player').setDepth(10).setScale(SPRITE_SCALE);
    this.player.setCollideWorldBounds(true).setCircle(13 * T, 3 * T, 3 * T);

    this.enemies = this.physics.add.group({ defaultKey: 'enemy', maxSize: 400 });
    this.bullets = this.physics.add.group({ defaultKey: 'bullet', maxSize: 300 });
    this.gems = this.physics.add.group({ defaultKey: 'gem', maxSize: 600 });

    this.physics.add.collider(this.enemies, this.enemies);
    this.physics.add.overlap(this.bullets, this.enemies, (b, e) => this.onBulletHit(b as Sprite, e as Sprite));
    this.physics.add.overlap(this.player, this.enemies, () => this.onPlayerHit());
    this.physics.add.overlap(this.player, this.gems, (_p, g) => this.onGem(g as Sprite));

    const cam = this.cameras.main;
    cam.setBounds(0, 0, WORLD, WORLD);
    cam.startFollow(this.player, true, 0.15, 0.15);
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
    this.ui.showPause(
      () => this.resumeGame(),
      () => this.scene.restart(),
    );
  }

  private resumeGame() {
    if (!this.paused) return;
    this.ui.closeMenu();
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
    this.elapsed += dt;

    this.movePlayer();
    this.steerEnemies(dt);
    this.pullGems();
    this.ageBullets(dt);
    this.fire(dt);
    this.fireShotgun(dt);
    this.spawn(dt);

    if (this.invuln > 0) this.invuln -= dt;
    this.player.setAlpha(this.invuln > 0 && Math.floor(this.invuln * 12) % 2 ? 0.35 : 1);

    this.ui.updateHud(this.hudState());
  }

  private fitZoom() {
    const { width, height } = this.scale;
    this.cameras.main.setZoom(Math.sqrt((width * height) / VIEW_AREA));
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
    if (!p.wasTouch && p.isDown) {
      const world = p.positionToCamera(this.cameras.main) as Vec;
      return this.aimVec.set(world.x - this.player.x, world.y - this.player.y).normalize();
    }

    const target = this.nearestEnemy(range);
    if (!target) return null;
    return this.aimVec.set(target.x - this.player.x, target.y - this.player.y).normalize();
  }

  private nearestEnemy(range: number): Sprite | null {
    let best: Sprite | null = null;
    let bestD = range * range;
    for (const obj of this.enemies.getChildren()) {
      const e = obj as Sprite;
      if (!e.active) continue;
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

  private ageBullets(dt: number) {
    for (const obj of this.bullets.getChildren()) {
      const b = obj as Sprite;
      if (!b.active) continue;
      const life = b.getData('life') - dt;
      if (life <= 0) b.disableBody(true, true);
      else b.setData('life', life);
    }
  }

  private spawn(dt: number) {
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
    let x = 0;
    let y = 0;
    let onScreen = true;
    // Near a wall, clamping to the arena can pull a point back on screen (even onto the player); reroll those.
    for (let i = 0; i < 10 && onScreen; i++) {
      const a = Math.random() * Math.PI * 2;
      x = Phaser.Math.Clamp(view.centerX + Math.cos(a) * r, 20, WORLD - 20);
      y = Phaser.Math.Clamp(view.centerY + Math.sin(a) * r, 20, WORLD - 20);
      onScreen = view.contains(x, y);
    }
    if (onScreen) return;

    const e = this.enemies.get() as Sprite | null;
    if (!e) return;
    e.enableBody(true, x, y, true, true);
    e.setScale(SPRITE_SCALE).setCircle(12 * T, 4 * T, 4 * T).clearTint().setDepth(4);
    e.setData({
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
      if (knock > 0) e.setData('knock', knock - dt);
      else this.physics.moveToObject(e, this.player, e.getData('speed'));
    }
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
    } else {
      sfx.hit();
      e.setTintFill(0xffffff);
      this.time.delayedCall(60, () => e.clearTint());
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

  private onPlayerHit() {
    if (this.invuln > 0 || this.frozen) return;
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
