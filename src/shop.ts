import type { Trait } from './traits';
import { WEAPON_CARDS, type Stats, type Upgrade } from './upgrades';

/**
 * The shop between waves. Gems are its money. It opens when a wave's lull ends, with the game
 * held, and sells the weapons and the items that lean toward what the core has become.
 */
export interface ShopItem extends Upgrade {
  /** Whose colour it wears and whose stock it leans into; null for anyone's. */
  trait: Trait | null;
  /** Its price in the first shop; later shops charge more. */
  cost: number;
  /** Offered only while the core's power is this trait's (it does nothing without it). */
  needs?: Trait;
}

/** How many offers each visit, and how often a slot comes from the core's own leaning (the rest come from the others or anyone's). */
export const SHOP_OFFERS = 4;
const SHOP_LEAN = 0.6;
/**
 * Each later shop charges this much more of the first shop's prices. Measured: a core standing
 * still on auto-aim has about 83 gems at the first shop and earns about 72 more by the second, so
 * the first shop affords two or three things, not everything.
 */
const PRICE_GROWTH = 0.25;
/** A reroll costs this much, times how many you've made this visit (counting this one), times the price growth. */
const REROLL_COST = 5;

const weapon = (name: string) => {
  const card = WEAPON_CARDS.find((u) => u.name === name);
  if (!card) throw new Error(`no weapon card named ${name}`);
  return card;
};

export const SHOP_ITEMS: ShopItem[] = [
  // Hard stands its ground: the close blast, and hits that take less.
  { ...weapon('Shotgun'), trait: 'hard', cost: 40 },
  { ...weapon('Buckshot'), trait: 'hard', cost: 30 },
  {
    name: 'Thick Skin',
    icon: 'guard',
    desc: 'Hits take 15% less',
    tip: 'What reaches you hurts less.',
    trait: 'hard',
    cost: 25,
    apply: (s) => (s.toughness *= 0.85),
  },
  // Calm takes in: gems that mend, and charm that holds.
  {
    name: 'Mending Gems',
    icon: 'health',
    desc: 'Each gem heals 1',
    tip: 'Gems give back a little energy. Stacks.',
    trait: 'calm',
    cost: 25,
    apply: (s) => (s.gemHeal += 1),
  },
  {
    name: 'Lingering Charm',
    icon: 'charm',
    desc: 'Charm lasts 2 s longer',
    tip: 'More time to take them in.',
    trait: 'calm',
    cost: 20,
    needs: 'calm',
    apply: (s) => (s.charmLonger += 2),
  },
  // Rage burns: the flare, and damage that grows with the hurt.
  { ...weapon('Flare'), trait: 'rage', cost: 40 },
  { ...weapon('Brighter Flares'), trait: 'rage', cost: 30 },
  {
    name: 'Spite',
    icon: 'damage',
    desc: '+5% damage per 10% energy missing',
    tip: 'Hurt more, hit harder. Stacks.',
    trait: 'rage',
    cost: 25,
    apply: (s) => (s.spite += 0.05),
  },
  // Anyone's.
  {
    name: 'Purse',
    icon: 'pickup',
    desc: 'Keep half the gems you miss',
    tip: 'Gems left behind at the end of a wave are half yours.',
    trait: null,
    cost: 20,
    apply: (s) => (s.keepGems = 0.5),
    available: (s) => s.keepGems === 0,
  },
];

/** How much dearer shop number `shop` (1 for the first) is than the first. */
const priceScale = (shop: number) => 1 + PRICE_GROWTH * (shop - 1);

export const priceOf = (item: ShopItem, shop: number) => Math.round(item.cost * priceScale(shop));

/** What the next reroll costs, after `rerolls` already made this visit. */
export const rerollPrice = (shop: number, rerolls: number) => Math.round(REROLL_COST * (rerolls + 1) * priceScale(shop));

/** What can be offered right now: available to these stats, and usable with this power. */
export function shopStock(stats: Stats, power: Trait | null) {
  return SHOP_ITEMS.filter((it) => (it.available?.(stats) ?? true) && (!it.needs || it.needs === power));
}

/**
 * `count` different offers. Each slot comes from the core's own leaning about 60% of the time,
 * otherwise from the rest; when one side runs out, the other fills in.
 */
export function rollShop(count: number, stats: Stats, lean: Trait | null): ShopItem[] {
  const stock = shopStock(stats, lean);
  const own = stock.filter((it) => lean && it.trait === lean);
  const rest = stock.filter((it) => !own.includes(it));
  const take = (from: ShopItem[]) => from.splice(Math.floor(Math.random() * from.length), 1)[0];
  const offers: ShopItem[] = [];
  while (offers.length < count && (own.length || rest.length)) {
    const fromOwn = own.length > 0 && (rest.length === 0 || Math.random() < SHOP_LEAN);
    offers.push(take(fromOwn ? own : rest));
  }
  return offers;
}
