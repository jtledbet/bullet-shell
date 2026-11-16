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
});

export interface UpgradeContext {
  heal(amount: number): void;
}

export interface Upgrade {
  name: string;
  desc: string;
  apply(stats: Stats, ctx: UpgradeContext): void;
}

export const UPGRADES: Upgrade[] = [
  { name: 'Quick Trigger', desc: '+25% fire rate', apply: (s) => (s.fireRate *= 1.25) },
  { name: 'Heavy Rounds', desc: '+50% damage', apply: (s) => (s.damage *= 1.5) },
  { name: 'Split Shot', desc: '+1 projectile', apply: (s) => (s.multishot += 1) },
  { name: 'Piercing', desc: 'Shots pass through +1 enemy', apply: (s) => (s.pierce += 1) },
  { name: 'Fleet Foot', desc: '+12% move speed', apply: (s) => (s.speed *= 1.12) },
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
];

export function rollUpgrades(count: number): Upgrade[] {
  const pool = [...UPGRADES];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}
