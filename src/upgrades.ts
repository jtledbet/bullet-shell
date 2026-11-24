import type { Trait } from './traits';

export interface Stats {
  speed: number;
  fireRate: number;
  damage: number;
  bulletSpeed: number;
  range: number;
  multishot: number;
  pierce: number;
  magnet: number;
  maxHp: number;
  /** Shotgun pellets per blast; 0 until the Shotgun card is taken. */
  shotgunPellets: number;
  /** Shotgun blasts per second. */
  shotgunRate: number;
  /** Health restored by each kill. */
  leech: number;
  /** Seconds between flares; 0 until the Flare card is taken. */
  flareEvery: number;
  /** Multiplies a flare's blast damage; its reach grows with the square root of this. */
  flarePower: number;
  /** Shop: the share of the gems still on the ground that you keep when a wave's lull ends. */
  keepGems: number;
  /** Shop: health each gem restores, per point of its worth. */
  gemHeal: number;
  /** Shop: extra damage for every 10% of energy missing (0.05 is +5%). */
  spite: number;
  /** Shop: what a hit still takes after every other cut (1 is all of it). */
  toughness: number;
  /** Shop: seconds added to how long a charm holds. */
  charmLonger: number;
}

export const baseStats = (): Stats => ({
  speed: 200,
  fireRate: 3,
  damage: 1.4,
  bulletSpeed: 520,
  range: 380,
  multishot: 1,
  pierce: 0,
  magnet: 90,
  maxHp: 100,
  shotgunPellets: 0,
  shotgunRate: 0.9,
  leech: 0,
  flareEvery: 0,
  flarePower: 1,
  keepGems: 0,
  gemHeal: 0,
  spite: 0,
  toughness: 1,
  charmLonger: 0,
});

export interface UpgradeContext {
  heal(amount: number): void;
}

/**
 * What a card does, at a glance: a small icon on its card (drawn in BootScene as `icon-<name>`),
 * so a card can be told apart before it is read. Cards that do the same sort of thing share one.
 */
export type CardIcon = 'damage' | 'rate' | 'shot' | 'speed' | 'guard' | 'health' | 'pickup' | 'weapon' | 'charm';

export interface Upgrade {
  name: string;
  /** What it does, at a glance. */
  desc: string;
  /** What it is, in plain words, for someone who has never seen it. Shown under the description. */
  tip: string;
  /** The tree it grows (hard, calm or rage), and so the colour its card wears. Weapons get theirs in the shop. */
  trait?: Trait | null;
  /** What it does, shown as a small icon on its card. */
  icon?: CardIcon;
  apply(stats: Stats, ctx: UpgradeContext): void;
  /** Offered only when this returns true (default: always). */
  available?(stats: Stats): boolean;
}

/** Damage and fire-rate cards add a share of where you started, so stacking them grows steadily rather than without end. */
const BASE = baseStats();

/**
 * The level-up cards. Each grows one of the three trees and wears its colour: rage hits harder
 * and faster, hard stands its ground and reaches through, calm moves and gathers.
 */
export const UPGRADES: Upgrade[] = [
  {
    name: 'Quick Trigger',
    trait: 'rage',
    icon: 'rate',
    desc: '+25% of starting fire rate',
    tip: 'Your bolts come faster. Each one still costs a sliver of your own energy, so you spend yourself faster too.',
    apply: (s) => (s.fireRate += BASE.fireRate * 0.25),
  },
  {
    name: 'Heavy Rounds',
    trait: 'rage',
    icon: 'damage',
    desc: '+50% of starting damage',
    tip: 'More of you goes into every shot. Bolts, sparks, flares and your blast all hit harder.',
    apply: (s) => (s.damage += BASE.damage * 0.5),
  },
  {
    name: 'Split Shot',
    trait: 'rage',
    icon: 'shot',
    desc: '+1 projectile',
    tip: 'One more bolt in every volley, fanned out beside the others. The volley costs you no more than before.',
    apply: (s) => (s.multishot += 1),
  },
  {
    name: 'Piercing',
    trait: 'hard',
    icon: 'shot',
    desc: 'Shots pass through +1 enemy',
    tip: 'A bolt keeps going through the first enemy it hits and strikes the one behind it.',
    apply: (s) => (s.pierce += 1),
  },
  {
    name: 'Fleet of Foot',
    trait: 'calm',
    icon: 'speed',
    desc: '+12% move speed',
    tip: 'You move faster. Getting away is always allowed.',
    apply: (s) => (s.speed *= 1.12),
  },
  {
    name: 'Plating',
    trait: 'hard',
    icon: 'guard',
    desc: '+20 max HP and heal 20',
    tip: 'You can hold more energy, and some comes back at once. Remember that your energy is also what you fire with.',
    apply: (s, ctx) => {
      s.maxHp += 20;
      ctx.heal(20);
    },
  },
  {
    name: 'Magnet',
    trait: 'calm',
    icon: 'pickup',
    desc: '+40% pickup radius',
    tip: 'Gems and motes of energy fly to you from farther away, so you can stay out of the crowd.',
    apply: (s) => (s.magnet *= 1.4),
  },
  {
    name: 'Long Barrel',
    trait: 'hard',
    icon: 'shot',
    desc: '+20% range and shot speed',
    tip: 'Bolts fly faster and reach farther, so you start hitting enemies sooner.',
    apply: (s) => {
      s.range *= 1.2;
      s.bulletSpeed *= 1.2;
    },
  },
  {
    name: 'Field Medic',
    trait: 'calm',
    icon: 'health',
    desc: 'Heal 40 HP',
    tip: 'A large part of your energy back, right now. It does nothing else.',
    apply: (_s, ctx) => ctx.heal(40),
  },
  {
    name: 'Siphon',
    trait: 'rage',
    icon: 'health',
    desc: 'Each kill restores 1 HP, up to 2 a second',
    tip: 'Whatever you destroy gives a little of itself back to you, though only so much each second. Take it again to draw more.',
    apply: (s) => (s.leech += 1),
  },
];

/** The weapons and what improves them. Sold in the shop between waves, not offered on level-up. */
export const WEAPON_CARDS: Upgrade[] = [
  {
    name: 'Flare',
    icon: 'weapon',
    desc: 'New weapon: a bursting flare',
    tip: 'A slow, heavy knot of your energy, lobbed at your target every few seconds. It bursts on the first enemy it meets and throws back everything nearby.',
    apply: (s) => (s.flareEvery = 3.5),
    available: (s) => s.flareEvery === 0,
  },
  {
    name: 'Brighter Flares',
    icon: 'weapon',
    desc: 'Flares: +40% blast, and 15% sooner',
    tip: 'Each flare bursts harder and wider, and you lob them more often.',
    apply: (s) => {
      s.flarePower *= 1.4;
      s.flareEvery *= 0.85;
    },
    available: (s) => s.flareEvery > 0,
  },
  {
    name: 'Shotgun',
    icon: 'weapon',
    desc: 'New weapon: a close blast of 5 sparks',
    tip: 'When enemies get close, you throw a fan of sparks at them. It fires on its own and shoves back whatever it hits.',
    apply: (s) => (s.shotgunPellets = 5),
    available: (s) => s.shotgunPellets === 0,
  },
  {
    name: 'Buckshot',
    icon: 'weapon',
    desc: 'Shotgun: +2 sparks and +20% fire rate',
    tip: 'A wider, busier blast. More sparks means more of the crowd pushed off you.',
    apply: (s) => {
      s.shotgunPellets += 2;
      s.shotgunRate *= 1.2;
    },
    available: (s) => s.shotgunPellets > 0,
  },
];

export function rollUpgrades(count: number, stats: Stats): Upgrade[] {
  const pool = UPGRADES.filter((u) => u.available?.(stats) ?? true);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}
