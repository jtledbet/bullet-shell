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
}

export const baseStats = (): Stats => ({
  speed: 200,
  fireRate: 3,
  damage: 1,
  bulletSpeed: 520,
  range: 380,
  multishot: 1,
  pierce: 0,
  magnet: 90,
  maxHp: 100,
  shotgunPellets: 0,
  shotgunRate: 0.9,
  leech: 0,
});

export interface UpgradeContext {
  heal(amount: number): void;
}

export interface Upgrade {
  name: string;
  desc: string;
  apply(stats: Stats, ctx: UpgradeContext): void;
  /** Offered only when this returns true (default: always). */
  available?(stats: Stats): boolean;
}

export const UPGRADES: Upgrade[] = [
  { name: 'Quick Trigger', desc: '+25% fire rate', apply: (s) => (s.fireRate *= 1.25) },
  { name: 'Heavy Rounds', desc: '+50% damage', apply: (s) => (s.damage *= 1.5) },
  { name: 'Split Shot', desc: '+1 projectile', apply: (s) => (s.multishot += 1) },
  { name: 'Piercing', desc: 'Shots pass through +1 enemy', apply: (s) => (s.pierce += 1) },
  { name: 'Fleet of Foot', desc: '+12% move speed', apply: (s) => (s.speed *= 1.12) },
  {
    name: 'Plating',
    desc: '+20 max HP and heal 20',
    apply: (s, ctx) => {
      s.maxHp += 20;
      ctx.heal(20);
    },
  },
  { name: 'Magnet', desc: '+40% pickup radius', apply: (s) => (s.magnet *= 1.4) },
  {
    name: 'Long Barrel',
    desc: '+20% range and shot speed',
    apply: (s) => {
      s.range *= 1.2;
      s.bulletSpeed *= 1.2;
    },
  },
  { name: 'Field Medic', desc: 'Heal 40 HP', apply: (_s, ctx) => ctx.heal(40) },
  { name: 'Siphon', desc: 'Each kill restores 1 HP', apply: (s) => (s.leech += 1) },
  {
    name: 'Shotgun',
    desc: 'New weapon: a close-range blast of 5 pellets that knocks enemies back',
    apply: (s) => (s.shotgunPellets = 5),
    available: (s) => s.shotgunPellets === 0,
  },
  {
    name: 'Buckshot',
    desc: 'Shotgun: +2 pellets and +20% fire rate',
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
