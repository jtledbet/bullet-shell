import Phaser from 'phaser';
import type { UIScene } from './UIScene';
import { Face } from '../face';
import { sfx } from '../audio';
import { pixelRatio, TEX_SCALE } from '../display';
import { restHum, setDanger, setHum, setPauseMusic } from '../music';
import { labelsOn, recordRun, setLabels } from '../storage';
import { CORE_COLOURS, CORE_WHITE, POWER_NAMES, TRAIT_COLOURS, type Trait } from '../traits';
import { baseStats, rollUpgrades, type Stats } from '../upgrades';

type Sprite = Phaser.Physics.Arcade.Sprite;
type Vec = Phaser.Math.Vector2;

/** Where the player starts. Space is endless: there are no walls. */
const START = 1200;
/**
 * Background grid: lines every 64 world px over an area recentred on the view, so it never runs
 * out. Drawn as lines over a plain backdrop colour: a full-screen textured layer cost about half
 * of every frame on machines without a fast graphics card.
 */
const GRID_TILE = 64;
const GRID_SIZE = 2048;
const GRID_COLOUR = 0x1e293b;
/** The backdrop: black during orientation, this once the run begins. */
const FIELD_COLOUR = 0x0b1222;
/** The first level-up comes quickly; after that the curve takes over. */
const FIRST_LEVEL_XP = 3;
/**
 * The core starts plain white. Each trait point tints it a little at once (and shifts its
 * face); the rest of the way comes very slowly, over this many seconds of a run.
 */
const STEEP_PER_POINT = 0.1;
const STEEP_SECONDS = 240;
/** How scared the core's face is with nothing wrong: flat, a little wide-eyed. */
const BASE_FEAR = 0.22;
/** Fear: enemies within this range crowd you, and this many is as crowded as it gets. It looks at the nearest enemy within LOOK_RADIUS. */
const CROWD_RADIUS = 150;
const CROWD_FULL = 8;
const LOOK_RADIUS = 420;
/**
 * What seeds and enemies think: a tiny vocabulary, shown over their heads.
 * Curious and wary are standing thoughts; the rest come at moments.
 */
const THOUGHTS = {
  curious: '?',
  closer: 'what is that',
  wary: '...',
  flinch: 'no no no',
  angry: '#@!%',
  shot: '!',
  ignored: 'hey',
  fedUp: 'HEY',
  baffled: '?',
} as const;
const THOUGHT_SECONDS = 1.6;
const THOUGHT_POOL = 24;
/** Standing idle this long gets a "hey" from the seeds, before they lose patience at IDLE_IRRITATE_SECONDS. */
const IDLE_HEY_SECONDS = 18;
/** A curious seed wonders aloud once you come this close. An angry one swears once it is this close. */
const CURIOUS_CLOSER = 150;
const ANGRY_CLOSE = 200;
/**
 * Phasing: enemies this close are baffled (they stop, puzzled); farther ones wander off.
 * Both find you again a little after you come back.
 */
const BAFFLE_RADIUS = 280;
/** Damage numbers: how many at once, how far they rise, how long they last. Damage shows times ten (a base hit reads "10"). */
const DAMAGE_POOL = 24;
const DAMAGE_RISE = 26;
const DAMAGE_SECONDS = 0.7;
const DAMAGE_SHOWN_TIMES = 10;
/** Visible world area held constant across screen sizes, so no device sees more of the arena. */
const VIEW_AREA = 960 * 540;
/**
 * Tutorial auto zoom, as a multiple of the base zoom: close in on the player while no enemy is around,
 * otherwise zoom out just enough to frame the player and the nearest enemy (down to ZOOM_FAR).
 */
const ZOOM_CLOSE = 1.6;
const ZOOM_FAR = 0.6;
/** World px kept between the nearest enemy and the screen edge. */
const ZOOM_MARGIN = 60;
/** How quickly the zoom eases toward its target (per second). */
const ZOOM_RATE = 2.5;
/**
 * Main game: the zoom breathes with pressure, the number of enemies within PRESSURE_RADIUS.
 * Quiet sits close in; PRESSURE_FULL or more enemies widens to ZOOM_SWARM. Eases slowly, never jumpy.
 */
const ZOOM_QUIET = 1.25;
const ZOOM_SWARM = 0.75;
const PRESSURE_RADIUS = 500;
const PRESSURE_FULL = 25;
const PRESSURE_ZOOM_RATE = 0.6;
const CONTACT_DAMAGE = 10;
const INVULN_SECONDS = 0.7;
/** Draw scale for the oversized textures. Body sizes passed to setCircle are in texture pixels. */
const SPRITE_SCALE = 1 / TEX_SCALE;
const T = TEX_SCALE;
/** Shotgun reach (world px) and how far apart its outermost pellets fly (radians). */
const SHOTGUN_RANGE = 230;
const SHOTGUN_SPREAD = 0.75;
const SHOTGUN_SPEED = 620;
/** Embers shed sparks: about this many per enemy per second, and a burst when one dies. */
const FLECKS_PER_SECOND = 0.8;
const FLECKS_ON_KILL = 9;

/** The core leaves a faint trail while moving faster than this. */
const TRAIL_MIN_SPEED = 20;

/** Enemies vary in toughness around the current base health, by up to this factor either way. */
const TOUGHNESS_SPREAD: [number, number] = [0.75, 1.35];
/** Shading by toughness: the base red at this much health or less, darkest at HP_DARKEST and up. */
const HP_LIGHTEST = 2.5;
const HP_DARKEST = 16;
/** Multiplied over the red texture: white leaves it bright, this turns it a deep blood red. */
const DARKEST_TINT = 0x7a2a35;

/** Seconds an enemy hit by a pellet is shoved away from you instead of chasing. */
const KNOCKBACK_SECONDS = 0.22;
/** Shove speed at point blank and at the edge of the shotgun's reach; pellets landing together add up, to a cap. */
const KNOCKBACK_NEAR = 560;
const KNOCKBACK_FAR = 200;
const KNOCKBACK_MAX = 900;
/** Each pellet passes through this many enemies before stopping (on top of any pierce upgrades). */
const SHOTGUN_PIERCE = 1;
/**
 * A blast that connects: the background (not you, not the enemies) jolts a few pixels along
 * the blast and settles, and the world holds still for a moment. The camera itself stays put.
 */
const BLAST_KICK_MS = 110;
const BLAST_KICK_PX = 3;
const HIT_STOP_MS = 50;
/** Tutorial: how far from the player its one enemy appears. */
const TUTORIAL_DISTANCE = 260;
/** `?tutorial` in the URL: a tutorial-only sandbox. Each kill starts a fresh tutorial instead of the game. */
const TUTORIAL_ONLY = new URLSearchParams(window.location.search).has('tutorial');
// `?labels` in the URL turns the seeds' name plates on (and remembers it, like the pause-menu toggle).
if (new URLSearchParams(window.location.search).has('labels')) setLabels(true);
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
/**
 * Tutorial dead ends. Standing still (no moving, no shooting) this long irritates every seed:
 * they turn aggro and bump you (a shove, no damage) instead of sinking in. A few bumps end the
 * tutorial in bullet hell. Getting this far from every seed ends it in bullet heaven.
 */
const IDLE_IRRITATE_SECONDS = 25;
const IDLE_BUMPS_TO_END = 3;
const BUMP_SPEED = 380;
const BUMP_SECONDS = 0.18;
const BUMP_GAP_SECONDS = 0.6;
const RUN_AWAY_DISTANCE = 1100;
/** Temperament tells. Curious seeds bob toward you (drifting closer while far); skeptical ones flinch when you come near; aggro ones tremble. */
const CURIOUS_BOB = 22;
const CURIOUS_DRIFT = 8;
const CURIOUS_NEAR = 160;
const FLINCH_SPEED = 260;
const FLINCH_SECONDS = 0.15;
const TREMBLE_DEG = 4;
/**
 * Orientation, before the player has ever done anything: gentle nudges at these idle seconds.
 * The control hint glows again, then the nearest seed gives a small pulse, then one quiet word.
 * They stop for good at the first input, and all come before the seeds get irritated.
 */
const NUDGE_SECONDS = [8, 16, 22];

/** How an enemy moves. Normal enemies chase; the tutorial enemy has a temperament, and turns aggro when shot. */
type Mood = 'chase' | (typeof TUTORIAL_MOODS)[number];

/**
 * Subtle tells for a tutorial enemy's temperament: a tint multiplied over the sprite and a
 * size relative to normal. Aggro is a little redder, skeptical (timid) a little smaller.
 */
/**
 * How each temperament burns. Curious: a warm, steady glow. Skeptical: small, banked coals
 * that barely spark. Aggro: flaring at full heat, a little bigger, throwing sparks. (Tints
 * multiply, so white is the brightest the ember gets.) `sparks` is per second.
 */
const MOOD_LOOK: Record<Mood, { tint: number; size: number; sparks: number }> = {
  chase: { tint: 0xffffff, size: 1, sparks: FLECKS_PER_SECOND },
  curious: { tint: 0xe6c8b8, size: 1, sparks: 0.6 },
  skeptical: { tint: 0x9a7a78, size: 0.85, sparks: 0.25 },
  aggro: { tint: 0xffffff, size: 1.08, sparks: 3 },
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

/**
 * What the core becomes from the tutorial, one point per seed:
 * hard (seeds killed), calm (curious or skeptical seeds let in), rage (aggro seeds let in).
 */
/** Hard: each point cuts damage taken by this fraction. */
const HARD_ARMOR = 0.12;
/** Hard: width (world px) of the dark edge per point, capped. */
const HARD_EDGE = 1.2;
const HARD_EDGE_MAX = 5;
/** Calm: each point is this chance for a hit to pass straight through, and fades the core this much. */
const CALM_DODGE = 0.12;
const CALM_FADE = 0.12;
const CALM_MIN_ALPHA = 0.45;
/** After a hit passes through, a short grace so contact isn't re-rolled every frame. */
const DODGE_GRACE = 0.3;
/** Rage: each point adds this much to your shot damage. */
const RAGE_DAMAGE = 0.15;
/** Trait points stop adding effect past this many. */
const TRAIT_CAP = 4;
/** Right-click uses the strongest trait: phase (calm), brace (hard) or burst (rage). */
const PHASE_SECONDS = 1.2;
const BRACE_SECONDS = 1.5;
const BRACE_DAMAGE = 0.2;
const BURST_SHOTS = 12;
const ABILITY_COOLDOWN = 6;

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
  /**
   * Gem radar: when no gem is on screen, where the player sits in the view (0..1 across and
   * down) and the direction to the nearest gem. Null while a gem is visible, or there are none.
   */
  gemArrow: { px: number; py: number; angle: number } | null;
  /** The HUD stays hidden during the tutorial. */
  tutorial: boolean;
  /** The right-click ability: which trait drives it and how recharged it is (1 = ready). Null without traits. */
  ability: { trait: Trait; charge: number } | null;
}

/** A thought over a seed's or enemy's head. */
interface Thought {
  text: Phaser.GameObjects.Text;
  on: Sprite | null;
  left: number;
  shake: boolean;
  held: boolean;
  colour: string;
}

/** What orientation decided. Kept so the next run can start right after it. */
interface Outcome {
  mode: 'heaven' | 'hell';
  traits: Record<Trait, number>;
  lastTrait: Trait | null;
}

export class GameScene extends Phaser.Scene {
  /** Whether the player has ever moved or shot, in any run this visit. Nudges are only for someone who hasn't. */
  private static acted = false;
  private ui!: UIScene;
  private player!: Sprite;
  private enemies!: Phaser.Physics.Arcade.Group;
  private bullets!: Phaser.Physics.Arcade.Group;
  private gems!: Phaser.Physics.Arcade.Group;
  private grid!: Phaser.GameObjects.Graphics;
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
  /** Counts shotgun blasts, so only the first pellet of each to connect triggers the shake and hit-stop. */
  private blastId = 0;
  private impactBlast = -1;
  /** Seconds left in a hit-stop: the world holds still. */
  private hitStop = 0;
  /** Seconds left in the background's jolt, and which way it goes. */
  private gridKick = 0;
  private blastAngle = 0;
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
  private thoughts: Thought[] = [];
  private damageTexts: Phaser.GameObjects.Text[] = [];
  private face!: Face;
  /** 0..1: how far the core's colour and face have moved from plain white toward what it has become. */
  private steep = 0;
  private fear = BASE_FEAR;
  private coreColour = CORE_WHITE;
  /** How far along the seed being taken in is, this frame (the core closes its eyes). */
  private absorbing = 0;
  /** Whether the seeds have said "hey" during this idle spell. */
  private heyed = false;
  /** Brood seeds scheduled to pop up but not out yet; the tutorial can't end while any are pending. */
  private pendingSeeds = 0;
  /** Tutorial: seconds standing idle, whether that has irritated the seeds, bumps taken, and the current bump. */
  private idleTime = 0;
  private nudges = 0;
  private outcome: Outcome | null = null;
  private powerFx!: Phaser.GameObjects.Graphics;
  private irritated = false;
  private bumps = 0;
  private bumpLeft = 0;
  private bumpGap = 0;
  private readonly bumpVec = new Phaser.Math.Vector2();
  private traits: Record<Trait, number> = { hard: 0, calm: 0, rage: 0 };
  /** Breaks ties for the strongest trait. */
  private lastTrait: Trait | null = null;
  private abilityCooldown = 0;
  private phaseLeft = 0;
  private braceLeft = 0;
  /** Last ability used, for test scripts and the dev readout. */
  lastAbility: 'phase' | 'brace' | 'burst' | null = null;
  private hardEdge!: Phaser.GameObjects.Graphics;
  private trail!: Phaser.GameObjects.Particles.ParticleEmitter;
  private flecks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private hadFocus = true;
  /** Same media query that shows #rotate in index.html. */
  private readonly rotatePrompt = window.matchMedia('(orientation: portrait) and (pointer: coarse)');

  constructor() {
    super('game');
  }

  /** `resume` starts the run right after orientation. (Phaser keeps a scene's old data unless a restart passes new data, so restarts always pass some.) */
  create(data?: { resume?: Outcome }) {
    const resume = data?.resume ?? null;
    this.stats = baseStats();
    this.hp = this.stats.maxHp;
    this.xp = this.kills = this.elapsed = this.fireCooldown = this.shotgunCooldown = this.invuln = this.pendingLevels = 0;
    this.blastId = this.hitStop = this.gridKick = 0;
    this.impactBlast = -1;
    this.level = 1;
    this.spawnTimer = 1;
    this.frozen = this.paused = false;
    // A new game opens with orientation, unless it picks up right after the last one.
    this.tutorial = !resume;
    this.mode = resume?.mode ?? 'heaven';
    this.outcome = resume;
    this.notes = { startMood: 'curious', firstShot: null, shots: 0, shotWhileCalm: false, seconds: 0, killed: 0, absorbed: 0 };
    this.pendingSeeds = 0;
    this.idleTime = this.nudges = this.bumps = this.bumpLeft = this.bumpGap = 0;
    this.irritated = false;
    this.traits = resume ? { ...resume.traits } : { hard: 0, calm: 0, rage: 0 };
    this.lastTrait = resume?.lastTrait ?? null;
    this.lastAbility = null;
    if (resume) this.stats.damage *= 1 + RAGE_DAMAGE * this.trait('rage');
    this.steep = Math.min(1, STEEP_PER_POINT * (this.traits.hard + this.traits.calm + this.traits.rage));
    this.fear = BASE_FEAR;
    this.coreColour = CORE_WHITE;
    this.absorbing = 0;
    this.heyed = false;
    this.abilityCooldown = this.phaseLeft = this.braceLeft = 0;
    setPauseMusic(false);
    setHum(true);
    this.physics.resume();
    this.time.paused = false;

    this.grid = this.add.graphics().setVisible(!this.tutorial);
    this.grid.lineStyle(1, GRID_COLOUR);
    for (let p = 0; p <= GRID_SIZE; p += GRID_TILE) this.grid.lineBetween(p, 0, p, GRID_SIZE).lineBetween(0, p, GRID_SIZE, p);
    this.setBackdrop(this.tutorial ? 0x000000 : FIELD_COLOUR);
    this.powerFx = this.add.graphics().setDepth(12);

    this.player = this.physics.add.sprite(START, START, 'player').setDepth(10).setScale(SPRITE_SCALE);
    this.player.setCircle(13 * T, 3 * T, 3 * T);
    this.angerOverlay = this.add.image(START, START, 'player').setTintFill(0xf43f5e).setDepth(11).setAlpha(0);
    this.trail = this.add.particles(0, 0, 'plasma', {
      follow: this.player,
      lifespan: 300,
      frequency: 40,
      scale: { start: 0.6 * SPRITE_SCALE, end: 0.1 * SPRITE_SCALE },
      alpha: { start: 0.35, end: 0 },
      blendMode: Phaser.BlendModes.ADD,
      emitting: false,
    }).setDepth(9);
    this.flecks = this.add.particles(0, 0, 'fleck', {
      lifespan: { min: 350, max: 750 },
      speed: { min: 8, max: 38 },
      angle: { min: 0, max: 360 },
      gravityY: -25,
      scale: { start: SPRITE_SCALE * 1.1, end: 0 },
      alpha: { start: 0.9, end: 0 },
      blendMode: Phaser.BlendModes.ADD,
      emitting: false,
    }).setDepth(4.5);
    this.setAnger(0);
    this.hardEdge = this.add.graphics().setDepth(12);
    this.face = new Face(this, 10.6);
    const small = { fontFamily: 'system-ui, sans-serif', resolution: pixelRatio() * 2 };
    this.thoughts = Array.from({ length: THOUGHT_POOL }, () => ({
      text: this.add.text(0, 0, '', { ...small, fontSize: '9px', color: '#cbd5e1' }).setOrigin(0.5, 1).setDepth(20).setVisible(false),
      on: null,
      left: 0,
      shake: false,
      held: false,
      colour: '#cbd5e1',
    }));
    this.damageTexts = Array.from({ length: DAMAGE_POOL }, () =>
      this.add
        .text(0, 0, '', { ...small, fontSize: '10px', fontStyle: 'bold', color: '#ffffff', stroke: '#0b1222', strokeThickness: 2 })
        .setOrigin(0.5, 1)
        .setDepth(21)
        .setVisible(false),
    );

    this.enemies = this.physics.add.group({ defaultKey: 'enemy', maxSize: 400 });
    this.bullets = this.physics.add.group({ defaultKey: 'bolt', maxSize: 300 });
    this.enemyBullets = this.physics.add.group({ defaultKey: 'ember-shot', maxSize: 300 });
    this.gems = this.physics.add.group({ defaultKey: 'gem', maxSize: 600 });

    this.physics.add.collider(this.enemies, this.enemies);
    this.physics.add.overlap(this.bullets, this.enemies, (b, e) => this.onBulletHit(b as Sprite, e as Sprite));
    this.physics.add.overlap(this.player, this.enemies, (_p, e) => this.onPlayerTouch(e as Sprite));
    this.physics.add.overlap(this.player, this.enemyBullets, (_p, b) => this.onEnemyBullet(b as Sprite));
    this.physics.add.overlap(this.player, this.gems, (_p, g) => this.onGem(g as Sprite));

    const cam = this.cameras.main;
    cam.setBackgroundColor('rgba(0,0,0,0)');
    cam.startFollow(this.player, true, 0.15, 0.15);
    this.zoomFactor = this.tutorial ? ZOOM_CLOSE : ZOOM_QUIET;
    this.fitZoom();
    this.scale.on('resize', this.fitZoom, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.fitZoom, this));

    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT') as Record<string, Phaser.Input.Keyboard.Key>;
    kb.on('keydown-ESC', this.togglePause, this);
    kb.on('keydown-P', this.togglePause, this);
    kb.on('keydown-M', () => this.ui.toggleSound());
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.rightButtonDown()) this.useAbility();
    });

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
    this.ui.onAbilityRequested = () => this.useAbility();
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

  /** The colour behind everything. It is the canvas's own clear colour, so it costs nothing to draw. */
  private setBackdrop(colour: number) {
    this.game.config.backgroundColor.setTo((colour >> 16) & 0xff, (colour >> 8) & 0xff, colour & 0xff);
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
      () => this.scene.restart({}),
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
    setDanger(1 - this.hp / this.stats.maxHp);
    if (this.hitStop > 0) {
      this.hitStop -= delta / 1000;
      if (this.hitStop > 0) return;
      this.physics.resume();
    }
    // The "turn your phone sideways" overlay covers the game; don't play on underneath it.
    if (this.rotatePrompt.matches) return this.pauseGame();
    const dt = delta / 1000;
    // The run clock (and so difficulty) starts after the tutorial.
    if (!this.tutorial) this.elapsed += dt;
    else this.notes.seconds += dt;

    this.movePlayer(dt);
    this.watchTutorial(dt);
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
    this.abilityCooldown = Math.max(0, this.abilityCooldown - dt);
    this.phaseLeft = Math.max(0, this.phaseLeft - dt);
    this.braceLeft = Math.max(0, this.braceLeft - dt);
    const flicker = this.invuln > 0 && Math.floor(this.invuln * 12) % 2 ? 0.35 : 1;
    this.player.setAlpha(this.ghostAlpha() * flicker * (this.phaseLeft > 0 ? 0.35 : 1));
    this.drawHardEdge();
    this.updateCore(dt);
    this.shedFlecks(dt);
    this.angerOverlay.setPosition(this.player.x, this.player.y).setAlpha(ANGER_RED * this.anger * this.player.alpha);

    this.ui.updateHud(this.hudState());
    this.updateThoughts(dt);
    this.followGrid(dt);
  }

  /** Recentres the tiled background on the view, snapped to whole tiles so the pattern doesn't shift. */
  private followGrid(dt = 0) {
    const v = this.cameras.main.worldView;
    const snap = (n: number) => Math.floor((n - GRID_SIZE / 2) / GRID_TILE) * GRID_TILE;
    this.gridKick = Math.max(0, this.gridKick - dt);
    // The blast's jolt: pushed along the blast, easing back to rest.
    const k = BLAST_KICK_PX * (this.gridKick / (BLAST_KICK_MS / 1000)) ** 2;
    this.grid.setPosition(snap(v.centerX) + Math.cos(this.blastAngle) * k, snap(v.centerY) + Math.sin(this.blastAngle) * k);
  }

  /**
   * A seed or an enemy thinks something: a few small characters over its head for a moment.
   * With labels on, every thought shows. With them off, only the critical ones do: the ones
   * that tell you something has changed for you. `held` is a seed's standing thought, shown
   * steadily (labels on) and stepped aside for anything passing.
   */
  private think(e: Sprite, words: string, opts: { critical?: boolean; shake?: boolean; seconds?: number; held?: boolean } = {}) {
    if (!opts.critical && !labelsOn()) return;
    let t = this.thoughts.find((x) => x.on === e);
    if (t && !t.held && opts.held) return;
    t ??= this.thoughts.find((x) => !x.on);
    if (!t) return;
    t.on = e;
    t.left = opts.seconds ?? THOUGHT_SECONDS;
    t.shake = !!opts.shake;
    t.held = !!opts.held;
    t.text.setText(words).setVisible(true);
    const colour = opts.shake ? '#fda4af' : '#cbd5e1';
    if (t.colour !== colour) t.text.setColor((t.colour = colour));
  }

  /** Sprites are reused: a new seed or enemy must not inherit the last one's thought. */
  private forget(e: Sprite) {
    const t = this.thoughts.find((x) => x.on === e);
    if (!t) return;
    t.on = null;
    t.text.setVisible(false);
  }

  /** Keeps each thought over its owner's head, shaking the angry ones, and fades it out. */
  private updateThoughts(dt: number) {
    if (this.tutorial && labelsOn()) {
      for (const obj of this.enemies.getChildren()) {
        const e = obj as Sprite;
        if (!e.active) continue;
        const mood = e.getData('mood') as Mood;
        const words = mood === 'aggro' ? THOUGHTS.angry : mood === 'skeptical' ? THOUGHTS.wary : THOUGHTS.curious;
        this.think(e, words, { held: true, shake: mood === 'aggro', seconds: 0.25 });
      }
    }
    for (const t of this.thoughts) {
      const e = t.on;
      if (!e) continue;
      t.left -= dt;
      if (t.left <= 0 || !e.active) {
        t.on = null;
        t.text.setVisible(false);
        continue;
      }
      const j = t.shake ? 0.7 : 0;
      t.text
        .setPosition(e.x + Phaser.Math.FloatBetween(-j, j), e.y - 17 * (e.scaleY / SPRITE_SCALE) + Phaser.Math.FloatBetween(-j, j))
        .setAngle(t.shake ? Phaser.Math.FloatBetween(-5, 5) : 0)
        .setAlpha(t.held ? 0.9 : Math.min(1, t.left / 0.3));
    }
  }

  /** The damage a shot did, floating up off the enemy and fading. Not shown during orientation. */
  private showDamage(e: Sprite, amount: number) {
    if (this.tutorial) return;
    const t = this.damageTexts.find((x) => !x.visible);
    if (!t) return;
    // Bigger hits run hotter and larger.
    const hot = Phaser.Math.Clamp((amount - 1) / 3, 0, 1);
    const low = lerpColor(0xfde68a, 0xf97316, hot);
    t.setText(String(Math.round(amount * DAMAGE_SHOWN_TIMES)))
      .setTint(0xffffff, 0xffffff, low, low)
      .setPosition(e.x + Phaser.Math.FloatBetween(-7, 7), e.y - 10)
      .setAngle(Phaser.Math.FloatBetween(-9, 9))
      .setScale(1 + 0.5 * hot)
      .setAlpha(1)
      .setVisible(true);
    this.tweens.add({ targets: t, y: t.y - DAMAGE_RISE, alpha: 0, duration: DAMAGE_SECONDS * 1000, ease: 'Cubic.Out', onComplete: () => t.setVisible(false) });
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
      gemArrow: this.gemArrow(),
      tutorial: this.tutorial,
      ability: this.abilityHud(),
    };
  }

  private gemArrow(): HudState['gemArrow'] {
    const view = this.cameras.main.worldView;
    let nearest: Sprite | undefined;
    let best = Infinity;
    for (const obj of this.gems.getChildren()) {
      const g = obj as Sprite;
      if (!g.active) continue;
      if (view.contains(g.x, g.y)) return null;
      const d = Phaser.Math.Distance.Squared(this.player.x, this.player.y, g.x, g.y);
      if (d < best) [best, nearest] = [d, g];
    }
    if (!nearest) return null;
    return {
      px: (this.player.x - view.x) / view.width,
      py: (this.player.y - view.y) / view.height,
      angle: Phaser.Math.Angle.Between(this.player.x, this.player.y, nearest.x, nearest.y),
    };
  }

  private xpToNext() {
    if (this.level === 1) return FIRST_LEVEL_XP;
    return Math.floor(5 * Math.pow(this.level, 1.35));
  }

  private movePlayer(dt: number) {
    const k = this.keys;
    const kx = (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0);
    const ky = (k.S.isDown || k.DOWN.isDown ? 1 : 0) - (k.W.isDown || k.UP.isDown ? 1 : 0);
    const v = this.moveVec;
    if (kx || ky) v.set(kx, ky).normalize();
    else if (this.ui.sticks) v.copy(this.ui.sticks.move);
    else v.reset();
    this.bumpGap = Math.max(0, this.bumpGap - dt);
    if (this.bumpLeft > 0) {
      // Being bumped: the shove carries you, easing off.
      this.bumpLeft = Math.max(0, this.bumpLeft - dt);
      const k = this.bumpLeft / BUMP_SECONDS;
      this.player.setVelocity(this.bumpVec.x * k, this.bumpVec.y * k);
      return;
    }
    this.player.setVelocity(v.x * this.stats.speed, v.y * this.stats.speed);
  }

  /** One gentle nudge for a player who hasn't done anything yet. */
  private nudge(stage: number, seeds: Sprite[]) {
    if (stage === 0) return this.ui.nudgeHint();
    if (stage === 2) return this.ui.nudgeWord();
    // The nearest seed gives one small pulse, as if noticing you.
    const d = (e: Sprite) => Phaser.Math.Distance.Squared(e.x, e.y, this.player.x, this.player.y);
    const e = seeds.reduce((a, b) => (d(b) < d(a) ? b : a));
    this.tweens.add({ targets: e, scale: e.scaleX * 1.3, duration: 240, yoyo: true, ease: 'Sine.InOut' });
  }

  /** Tutorial: standing idle too long irritates the seeds; running far enough from all of them ends it. */
  private watchTutorial(dt: number) {
    if (!this.tutorial) return;
    const seeds = this.enemies.getChildren().filter((o) => o.active) as Sprite[];
    if (!seeds.length) return;
    const moving = this.moveVec.lengthSq() > 0.01;
    if (moving) {
      GameScene.acted = true;
      this.heyed = false;
    }
    this.idleTime = moving ? 0 : this.idleTime + dt;
    if (!GameScene.acted && this.nudges < NUDGE_SECONDS.length && this.idleTime >= NUDGE_SECONDS[this.nudges]) {
      this.nudge(this.nudges++, seeds);
    }
    if (this.idleTime >= IDLE_HEY_SECONDS && !this.heyed && !this.irritated) {
      this.heyed = true;
      for (const e of seeds) this.think(e, THOUGHTS.ignored, { critical: true });
    }
    if (this.idleTime >= IDLE_IRRITATE_SECONDS && !this.irritated) {
      this.irritated = true;
      for (const e of seeds) {
        e.setData('irritated', true);
        this.think(e, THOUGHTS.fedUp, { critical: true, shake: true, seconds: 2 });
        if (e.getData('mood') === 'aggro') continue;
        e.setData('mood', 'aggro');
        this.showMood(e, true);
      }
    }
    const nearest = Math.min(...seeds.map((e) => Phaser.Math.Distance.Between(this.player.x, this.player.y, e.x, e.y)));
    if (nearest > RUN_AWAY_DISTANCE && this.pendingSeeds === 0) this.endTutorial('ran');
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
   * Tutorial: eases the zoom toward framing the player and the nearest seed, or close in when there is
   * none. Main game: zooms out slowly as the swarm around the player thickens, and back in as it thins.
   */
  private updateZoom(dt: number) {
    if (!this.tutorial) {
      const near = PRESSURE_RADIUS * PRESSURE_RADIUS;
      let count = 0;
      for (const obj of this.enemies.getChildren()) {
        const e = obj as Sprite;
        if (e.active && Phaser.Math.Distance.Squared(e.x, e.y, this.player.x, this.player.y) < near) count++;
      }
      const target = Phaser.Math.Linear(ZOOM_QUIET, ZOOM_SWARM, Math.min(1, count / PRESSURE_FULL));
      this.zoomFactor += (target - this.zoomFactor) * (1 - Math.exp(-PRESSURE_ZOOM_RATE * dt));
      this.cameras.main.setZoom(this.baseZoom * this.zoomFactor);
      return;
    }
    let target = ZOOM_CLOSE;
    const e = this.nearestEnemy(Infinity);
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
      this.idleTime = 0;
      GameScene.acted = true;
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
    this.blastId++;

    sfx.shotgun();
    const base = dir.angle();
    this.blastAngle = base;
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
    // The sprite pivots on its glowing head, so the round body stays on the head whichever way it flies.
    b.setTexture(pellet ? 'spark' : 'bolt').setOrigin(22 / 32, 0.5).setRotation(angle).setBlendMode(Phaser.BlendModes.ADD);
    b.setScale(pellet ? SPRITE_SCALE * 0.7 : SPRITE_SCALE).setCircle(5 * T, 17 * T, 3 * T).setDepth(5);
    if (pellet) b.clearTint();
    else b.setTint(lerpColor(this.coreColour, 0xffffff, 0.3));
    this.physics.velocityFromRotation(angle, speed, (b.body as Phaser.Physics.Arcade.Body).velocity);
    // Reuse the pooled bullet's hit set rather than allocating one per shot.
    const hits = (b.getData('hits') as Set<Sprite> | undefined) ?? new Set<Sprite>();
    hits.clear();
    b.setData({ pierce: this.stats.pierce + (pellet ? SHOTGUN_PIERCE : 0), life, hits, pellet, blast: this.blastId });
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
    this.forget(e);
    e.setScale(SPRITE_SCALE).setCircle(12 * T, 4 * T, 4 * T).clearTint().setDepth(4).setCollideWorldBounds(false).setAlpha(1).setAngle(0);
    // Darker red means tougher.
    const hp = (3 + this.elapsed / 25) * Phaser.Math.FloatBetween(...TOUGHNESS_SPREAD);
    const tint = lerpColor(0xffffff, DARKEST_TINT, Phaser.Math.Clamp((hp - HP_LIGHTEST) / (HP_DARKEST - HP_LIGHTEST), 0, 1));
    this.restoreTint(e.setData('tint', tint));
    e.setData({
      mood: 'chase',
      tint,
      lost: 0,
      absorb: 0,
      shootCd: Phaser.Math.FloatBetween(...ENEMY_SHOT_GAP),
      hp,
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
      e.setAngle(mood === 'aggro' ? Phaser.Math.FloatBetween(-TREMBLE_DEG, TREMBLE_DEG) : 0);
      if (knock > 0) e.setData('knock', knock - dt);
      else if (mood === 'curious') this.steerCurious(e);
      else if (mood === 'skeptical') {
        if (!this.flinch(e)) this.steerWander(e, dt, true);
      } else this.steerChaser(e, dt, mood);
    }
  }

  /** Comes straight at you, unless it has lost you: a baffled one stands puzzled, the others keep wandering the way they turned. */
  private steerChaser(e: Sprite, dt: number, mood: Mood) {
    const lost = e.getData('lost') as number;
    if (lost > 0) {
      e.setData('lost', lost - dt);
      if (e.getData('baffled')) e.setVelocity(0, 0);
      return;
    }
    this.physics.moveToObject(e, this.player, e.getData('speed'));
    // An angry seed swears once, when it gets close.
    if (mood !== 'aggro' || e.getData('swore')) return;
    if (Phaser.Math.Distance.Squared(e.x, e.y, this.player.x, this.player.y) > ANGRY_CLOSE * ANGRY_CLOSE) return;
    e.setData('swore', true);
    this.think(e, THOUGHTS.angry, { critical: true, shake: true });
  }

  /** Phasing: nearby enemies are baffled, farther ones wander off. They find you again a little after you return. */
  private loseEnemies() {
    for (const obj of this.enemies.getChildren()) {
      const e = obj as Sprite;
      if (!e.active) continue;
      const near = Phaser.Math.Distance.Between(e.x, e.y, this.player.x, this.player.y) < BAFFLE_RADIUS;
      e.setData({ lost: PHASE_SECONDS + (near ? Phaser.Math.FloatBetween(0.3, 0.9) : Phaser.Math.FloatBetween(1, 2.2)), baffled: near });
      if (near) this.think(e, THOUGHTS.baffled, { critical: true, seconds: PHASE_SECONDS + 0.3 });
      else this.physics.velocityFromRotation(Math.random() * Math.PI * 2, (e.getData('speed') as number) * 0.4, (e.body as Phaser.Physics.Arcade.Body).velocity);
    }
  }

  /** Bobs toward and away from you, drifting closer while far off. */
  private steerCurious(e: Sprite) {
    const d = Phaser.Math.Distance.Between(e.x, e.y, this.player.x, this.player.y);
    const toward = Phaser.Math.Angle.Between(e.x, e.y, this.player.x, this.player.y);
    if (d < CURIOUS_CLOSER && !e.getData('noticed')) {
      e.setData('noticed', true);
      this.think(e, THOUGHTS.closer, { seconds: 2 });
    }
    const bob = CURIOUS_BOB * Math.sin((this.time.now / 1000) * 2.6 + (e.getData('phase') as number));
    this.physics.velocityFromRotation(toward, (d > CURIOUS_NEAR ? CURIOUS_DRIFT : 0) + bob, (e.body as Phaser.Physics.Arcade.Body).velocity);
  }

  /** The moment you come near, a skeptical seed jerks away and squashes. Returns true on that frame. */
  private flinch(e: Sprite) {
    const near = Phaser.Math.Distance.Between(e.x, e.y, this.player.x, this.player.y) < SKEPTICAL_FLEE_RADIUS;
    const was = e.getData('near') as boolean;
    e.setData('near', near);
    if (!near || was) return false;
    const away = Phaser.Math.Angle.Between(this.player.x, this.player.y, e.x, e.y);
    this.physics.velocityFromRotation(away, FLINCH_SPEED, (e.body as Phaser.Physics.Arcade.Body).velocity);
    e.setData({ knock: FLINCH_SECONDS, wander: 0 });
    this.think(e, THOUGHTS.flinch);
    this.tweens.add({ targets: e, scaleX: e.scaleX * 0.8, duration: 70, yoyo: true, ease: 'Sine.Out' });
    return true;
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
    this.forget(e);
    e.setScale(SPRITE_SCALE).setCircle(12 * T, 4 * T, 4 * T).clearTint().setDepth(4).setCollideWorldBounds(false).setAlpha(1);
    e.setData({
      mood, gen, baseSize: gen ? BROOD_SIZE : 1, hp: gen ? BROOD_HP : 3, speed: AGGRO_SPEED, knock: 0, wander: 0, absorb: 0, tint: 0xffffff,
      phase: Math.random() * Math.PI * 2, near: false, irritated: false, lost: 0, noticed: false, swore: false,
    });
    this.showMood(e, false);
    if (!gen) return sfx.seed();
    sfx.pop();
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

  /**
   * The tutorial is over: the grid fades in and the normal run begins. Killing or standing idle
   * leads to bullet hell; absorbing or running away, bullet heaven.
   */
  private endTutorial(outcome: 'killed' | 'absorbed' | 'idled' | 'ran' = 'absorbed') {
    const n = this.notes;
    const hell = outcome === 'killed' || outcome === 'idled';
    sfx.tutorialEnd(hell);
    // Idling ends as hard (you stood there and took it); running away, as calm.
    if (outcome === 'idled') this.gainTrait('hard');
    if (outcome === 'ran') this.gainTrait('calm');
    this.outcome = { mode: hell ? 'hell' : 'heaven', traits: { ...this.traits }, lastTrait: this.lastTrait };
    const readout = [
      `${outcome}: bullet ${hell ? 'hell' : 'heaven'}`,
      `was ${n.startMood}`,
      `first shot ${n.firstShot === null ? 'never' : n.firstShot.toFixed(1) + 's'}`,
      `${n.shots} shots`,
      `killed ${n.killed}, absorbed ${n.absorbed}`,
      `hard ${this.traits.hard}, calm ${this.traits.calm}, rage ${this.traits.rage}`,
      ...(n.shotWhileCalm ? ['shot it while calm'] : []),
      `${n.seconds.toFixed(1)}s`,
    ].join('   ·   ');
    this.ui.showDebug(readout);
    // Any seeds left (run from, or still bumping you) burn out.
    for (const e of this.enemies.getChildren().filter((o) => o.active) as Sprite[]) {
      this.flecks.explode(FLECKS_ON_KILL, e.x, e.y);
      e.disableBody(true, true);
    }
    if (TUTORIAL_ONLY) {
      this.time.delayedCall(TUTORIAL_REPEAT_MS, () => this.scene.restart({}));
      return;
    }
    this.tutorial = false;
    this.mode = hell ? 'hell' : 'heaven';
    this.stats.damage *= 1 + RAGE_DAMAGE * this.trait('rage');
    this.grid.setVisible(true).setAlpha(0);
    this.tweens.add({ targets: this.grid, alpha: 1, duration: 1200 });
    this.tweens.addCounter({ from: 0, to: 1, duration: 1200, onUpdate: (tw) => this.setBackdrop(lerpColor(0x000000, FIELD_COLOUR, tw.getValue() ?? 1)) });
    this.spawnTimer = 1.5;
  }

  private onBulletHit(b: Sprite, e: Sprite) {
    if (!b.active || !e.active) return;
    const hits = b.getData('hits') as Set<Sprite>;
    if (hits.has(e)) return;
    hits.add(e);

    const hp = e.getData('hp') - this.stats.damage;
    e.setData('hp', hp);
    this.showDamage(e, this.stats.damage);
    if (b.getData('pellet')) this.blastImpact(b.getData('blast'));
    if (hp <= 0) {
      this.kills++;
      sfx.kill();
      this.dropGem(e.x, e.y);
      this.flecks.explode(FLECKS_ON_KILL, e.x, e.y);
      e.disableBody(true, true);
      if (this.tutorial) {
        this.notes.killed++;
        this.gainTrait('hard');
        this.checkTutorialDone();
      }
    } else {
      sfx.hit();
      // Shooting the tutorial enemy aggravates it.
      if (this.tutorial && e.getData('mood') !== 'aggro') {
        this.notes.shotWhileCalm = true;
        e.setData({ mood: 'aggro', swore: true });
        this.showMood(e, true);
        // A startled "!", then it finds its words.
        this.think(e, THOUGHTS.shot, { critical: true, seconds: 0.7 });
        this.time.delayedCall(700, () => e.active && this.think(e, THOUGHTS.angry, { critical: true, shake: true }));
      }
      e.setTintFill(0xffffff);
      this.time.delayedCall(60, () => this.restoreTint(e));
      if (b.getData('pellet')) this.shove(e);
    }

    const pierce = b.getData('pierce');
    if (pierce <= 0) b.disableBody(true, true);
    else b.setData('pierce', pierce - 1);
  }

  /** Pushes an enemy straight away from you, harder the closer it is. Pellets from one blast stack, up to a cap. */
  private shove(e: Sprite) {
    const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, e.x, e.y);
    const speed = Phaser.Math.Linear(KNOCKBACK_NEAR, KNOCKBACK_FAR, Phaser.Math.Clamp(d / SHOTGUN_RANGE, 0, 1));
    const away = Phaser.Math.Angle.Between(this.player.x, this.player.y, e.x, e.y);
    const v = (e.body as Phaser.Physics.Arcade.Body).velocity;
    const push = new Phaser.Math.Vector2().setToPolar(away, speed);
    // A fresh shove replaces the chase; a second pellet in the same shove adds to it.
    if ((e.getData('knock') as number) > 0) v.add(push).limit(KNOCKBACK_MAX);
    else v.copy(push);
    e.setData('knock', KNOCKBACK_SECONDS);
  }

  /** The first pellet of a blast to connect: a camera kick and a brief hit-stop. */
  private blastImpact(blast: number) {
    if (blast === this.impactBlast) return;
    this.impactBlast = blast;
    this.gridKick = BLAST_KICK_MS / 1000;
    this.followGrid();
    if (this.hitStop > 0) return;
    this.hitStop = HIT_STOP_MS / 1000;
    this.physics.pause();
  }

  /** In the tutorial a sprite inside you is slowly absorbed; afterwards, contact hurts. */
  private onPlayerTouch(e: Sprite) {
    if (!this.tutorial) this.onPlayerHit();
    else if (e.getData('irritated')) this.bump(e);
    else this.absorb(e);
  }

  /** An irritated seed shoves you away (no damage) and bounces back. Enough bumps end the tutorial. */
  private bump(e: Sprite) {
    if (this.frozen || this.bumpGap > 0) return;
    const away = Phaser.Math.Angle.Between(e.x, e.y, this.player.x, this.player.y);
    this.bumpVec.setToPolar(away, BUMP_SPEED);
    this.bumpLeft = BUMP_SECONDS;
    this.bumpGap = BUMP_GAP_SECONDS;
    this.physics.velocityFromRotation(away + Math.PI, BUMP_SPEED / 2, (e.body as Phaser.Physics.Arcade.Body).velocity);
    e.setData('knock', BUMP_SECONDS);
    sfx.bump();
    if (++this.bumps >= IDLE_BUMPS_TO_END) this.endTutorial('idled');
  }

  /** Progresses absorbing a tutorial sprite while it's inside you. An angry one swells and reddens you. */
  private absorb(e: Sprite) {
    if (this.frozen || !e.active) return;
    const was = e.getData('absorb') as number;
    if (was === 0) sfx.absorbing();
    const p = Math.min(1, was + this.game.loop.delta / 1000 / ABSORB_SECONDS);
    e.setData('absorb', p).setAlpha(1 - 0.7 * p);
    this.absorbing = Math.max(this.absorbing, p);
    if (e.getData('mood') === 'aggro') this.setAnger(Math.max(this.anger, p));
    if (p < 1) return;
    e.disableBody(true, true);
    if (e.getData('mood') === 'aggro') sfx.absorbedAngry();
    else sfx.absorbedCalm();
    this.notes.absorbed++;
    this.gainTrait(e.getData('mood') === 'aggro' ? 'rage' : 'calm');
    if (e.getData('mood') === 'aggro' && e.getData('gen') === 0) this.spawnBrood();
    this.checkTutorialDone();
  }

  /** A trait's effective points, capped. */
  private trait(t: Trait) {
    return Math.min(TRAIT_CAP, this.traits[t]);
  }

  private gainTrait(t: Trait) {
    this.traits[t]++;
    this.lastTrait = t;
    this.steep = Math.min(1, this.steep + STEEP_PER_POINT);
  }

  /** Calm fades the core toward a ghost. */
  private ghostAlpha() {
    return Math.max(CALM_MIN_ALPHA, 1 - CALM_FADE * this.trait('calm'));
  }

  /** Sparks drift off the embers on screen, at a steady rate per enemy. */
  private shedFlecks(dt: number) {
    const view = this.cameras.main.worldView;
    const embers = (this.enemies.getChildren() as Sprite[]).filter((e) => e.active && view.contains(e.x, e.y));
    if (!embers.length) return;
    for (const e of embers) {
      // Each ember's chance this frame comes from how its temperament burns.
      if (Math.random() >= MOOD_LOOK[e.getData('mood') as Mood].sparks * dt) continue;
      const a = Math.random() * Math.PI * 2;
      const r = 10 * (e.scaleX / SPRITE_SCALE);
      this.flecks.emitParticleAt(e.x + Math.cos(a) * r, e.y + Math.sin(a) * r, 1);
    }
  }

  /** The core's colour and face follow what it has done and what is happening to it. */
  private updateCore(dt: number) {
    const p = this.player;
    const total = this.traits.hard + this.traits.calm + this.traits.rage;
    // The colour and the look deepen slowly over a run.
    if (!this.tutorial && total > 0) this.steep = Math.min(1, this.steep + dt / STEEP_SECONDS);
    const share = (t: Trait) => (total ? this.traits[t] / total : 0);
    let colour = CORE_WHITE;
    if (total) {
      const mix = (shift: number) =>
        Math.round((['hard', 'calm', 'rage'] as const).reduce((sum, t) => sum + share(t) * ((CORE_COLOURS[t] >> shift) & 0xff), 0)) << shift;
      colour = lerpColor(CORE_WHITE, mix(16) | mix(8) | mix(0), this.steep * 0.92);
    }
    this.coreColour = colour;
    p.setTint(colour);

    // Who is crowding it, and what it is looking at: the nearest enemy, or else where it is going.
    let crowd = 0;
    let threat = 0;
    let best = LOOK_RADIUS * LOOK_RADIUS;
    let lx = 0;
    let ly = 0;
    for (const obj of this.enemies.getChildren()) {
      const e = obj as Sprite;
      if (!e.active) continue;
      const d2 = Phaser.Math.Distance.Squared(e.x, e.y, p.x, p.y);
      if (d2 < CROWD_RADIUS * CROWD_RADIUS) crowd++;
      if (this.tutorial && e.getData('mood') === 'aggro' && d2 < 220 * 220) threat = 1;
      if (d2 < best) {
        best = d2;
        lx = e.x - p.x;
        ly = e.y - p.y;
      }
    }
    const v = (p.body as Phaser.Physics.Arcade.Body).velocity;
    const moving = v.length() > TRAIL_MIN_SPEED;
    if (!lx && !ly && moving) {
      lx = v.x;
      ly = v.y;
    }
    const len = Math.hypot(lx, ly) || 1;
    // It starts a little scared, and settles into itself as it becomes something.
    const want = Phaser.Math.Clamp(
      BASE_FEAR * (1 - 0.6 * this.steep) +
        0.75 * (1 - this.hp / this.stats.maxHp) +
        0.45 * Math.min(1, crowd / CROWD_FULL) +
        0.3 * threat +
        0.3 * this.anger +
        (this.bumpLeft > 0 ? 0.4 : 0),
      0,
      1,
    );
    this.fear += (want - this.fear) * (1 - Math.exp(-dt * 2.5));
    this.face.update(dt, {
      x: p.x,
      y: p.y,
      size: p.scaleX / SPRITE_SCALE,
      // A faded core (calm, or mid-phase) keeps its face a little clearer than its body.
      alpha: Math.sqrt(p.alpha),
      colour,
      fear: this.fear,
      gentle: share('calm') * this.steep,
      dark: share('rage') * this.steep,
      stern: share('hard') * this.steep,
      lookX: lx / len,
      lookY: ly / len,
      shut: this.absorbing,
    });
    this.absorbing = 0;

    this.trail.emitting = moving;
    this.trail.setAlpha(p.alpha * 0.8);
    this.trail.setParticleTint(colour);
  }

  /** Hard: a dark steel edge around the core, thicker with each kill; bright while braced. */
  private drawHardEdge() {
    const g = this.hardEdge.clear();
    const hard = this.trait('hard');
    if (!hard) return;
    const width = Math.min(HARD_EDGE_MAX, HARD_EDGE * hard);
    const r = 15 * (this.player.scaleX / SPRITE_SCALE) + width / 2;
    g.lineStyle(width, this.braceLeft > 0 ? 0xe2e8f0 : 0x64748b, 0.9 * this.player.alpha).strokeCircle(this.player.x, this.player.y, r);
  }

  /** The strongest trait; ties go to the one gained most recently. None until the core has any. */
  private abilityHud(): HudState['ability'] {
    const trait = this.tutorial ? null : this.strongestTrait();
    return trait ? { trait, charge: 1 - this.abilityCooldown / ABILITY_COOLDOWN } : null;
  }

  private strongestTrait(): Trait | null {
    const best = Math.max(this.traits.hard, this.traits.calm, this.traits.rage);
    if (best === 0) return null;
    if (this.lastTrait && this.traits[this.lastTrait] === best) return this.lastTrait;
    return (['hard', 'calm', 'rage'] as const).find((t) => this.traits[t] === best) ?? null;
  }

  /** Right-click, after the tutorial: phase (calm), brace (hard) or a ring of shots (rage), then a cooldown. */
  private useAbility() {
    if (this.tutorial || this.frozen || this.abilityCooldown > 0) return;
    const t = this.strongestTrait();
    if (!t) return;
    this.abilityCooldown = ABILITY_COOLDOWN;
    sfx.power(POWER_NAMES[t] as 'brace' | 'phase' | 'burst');
    this.powerRing(TRAIT_COLOURS[t]);
    if (labelsOn()) this.ui.floatWord(POWER_NAMES[t]);
    if (t === 'calm') {
      this.phaseLeft = PHASE_SECONDS;
      this.lastAbility = 'phase';
      this.loseEnemies();
    } else if (t === 'hard') {
      this.braceLeft = BRACE_SECONDS;
      this.lastAbility = 'brace';
    } else {
      for (let i = 0; i < BURST_SHOTS; i++) {
        this.shoot((i / BURST_SHOTS) * Math.PI * 2, this.stats.bulletSpeed, this.stats.range / this.stats.bulletSpeed + 0.15, false);
      }
      this.lastAbility = 'burst';
    }
  }

  /** Using a power: a ring in its colour swells out from the core and fades. */
  private powerRing(colour: number) {
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 480,
      ease: 'Cubic.Out',
      onUpdate: (tw) => {
        const p = tw.getValue() ?? 1;
        this.powerFx.clear().lineStyle(3 * (1 - p) + 1, colour, 0.85 * (1 - p)).strokeCircle(this.player.x, this.player.y, 18 + 80 * p);
      },
      onComplete: () => this.powerFx.clear(),
    });
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
      if (cd <= 0 && (e.getData('lost') as number) <= 0 && view.contains(e.x, e.y)) {
        cd = Phaser.Math.FloatBetween(...ENEMY_SHOT_GAP);
        const b = this.enemyBullets.get() as Sprite | null;
        if (b) {
          b.enableBody(true, e.x, e.y, true, true);
          b.setScale(SPRITE_SCALE).setCircle(5 * T, 3 * T, 3 * T).setDepth(5);
          const angle = Phaser.Math.Angle.Between(e.x, e.y, this.player.x, this.player.y);
          this.physics.velocityFromRotation(angle, ENEMY_SHOT_SPEED, (b.body as Phaser.Physics.Arcade.Body).velocity);
          b.setData('life', ENEMY_SHOT_LIFE);
        }
      }
      e.setData('shootCd', cd);
    }
  }

  private onEnemyBullet(b: Sprite) {
    // Phasing: shots pass straight through.
    if (!b.active || this.frozen || this.phaseLeft > 0) return;
    b.disableBody(true, true);
    this.onPlayerHit();
  }

  private onPlayerHit() {
    if (this.invuln > 0 || this.frozen || this.tutorial || this.phaseLeft > 0) return;
    // Calm: some hits pass straight through.
    if (Math.random() < CALM_DODGE * this.trait('calm')) {
      this.invuln = DODGE_GRACE;
      return;
    }
    // Hard: hits do less damage, and much less while braced.
    const armor = 1 - HARD_ARMOR * this.trait('hard');
    this.hp -= CONTACT_DAMAGE * armor * (this.braceLeft > 0 ? BRACE_DAMAGE : 1);
    this.invuln = INVULN_SECONDS;
    this.face.react('hit');
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
    restHum(true);
    sfx.levelUp();
    this.ui.showLevelUp(rollUpgrades(3, this.stats), (upgrade) => {
      upgrade.apply(this.stats, { heal: (n) => (this.hp = Math.min(this.stats.maxHp, this.hp + n)) });
      this.face.react('joy');
      this.pendingLevels--;
      if (this.pendingLevels > 0) {
        this.offerUpgrade();
      } else {
        this.frozen = false;
        this.physics.resume();
        restHum(false);
      }
    });
  }

  private gameOver() {
    this.frozen = true;
    setHum(false);
    this.physics.pause();
    this.hp = 0;
    this.ui.updateHud(this.hudState());
    sfx.gameOver();
    const newBest = recordRun({ time: this.elapsed, level: this.level, kills: this.kills });
    const outcome = this.outcome;
    this.ui.showGameOver(this.hudState(), newBest, outcome ? () => this.scene.restart({ resume: outcome }) : null, () => this.scene.restart({}));
  }
}

/** Blends two 0xRRGGBB colours; p = 0 gives `a`, 1 gives `b`. */
function lerpColor(a: number, b: number, p: number) {
  const ch = (shift: number) => Math.round(Phaser.Math.Linear((a >> shift) & 0xff, (b >> shift) & 0xff, p)) << shift;
  return ch(16) | ch(8) | ch(0);
}
