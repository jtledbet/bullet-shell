import { open } from './cdp.mjs';
const out = process.argv[2];
// --- Desktop: the economy, the lull's end, and the shop.
const t = await open({ out: out + '-desktop', port: 9370, url: 'http://127.0.0.1:5173/?fullres', width: 844, height: 390, dsf: 1 });
{
  const { evaluate, shot, check, sleep, click, G, U, uiPoint, menuTexts } = t;
  // A high level, so kills here don't bring up a level-up card.
  await evaluate(`(() => { const s = ${G}; s.traits = { hard: 2, calm: 0, rage: 0 }; s.lastTrait = 'hard'; s.endTutorial('killed'); s.traits = { hard: 2, calm: 0, rage: 0 }; s.lastTrait = 'hard';
    s.spawnTimer = 1e9; s.fireCooldown = 1e9; s.rescued = true; s.level = 40; s.stats.maxHp = s.hp = 1e9; return true; })()`);
  await sleep(600);

  // ---- The economy: a kill gives experience at once; its gem is money.
  const kill = await evaluate(`(() => { const s = ${G}; const xp = s.xp, purse = s.purse; s.spawnEnemy(); const e = s.enemies.getChildren().find(o => o.active); e.setPosition(s.player.x + 1500, s.player.y); e.setData('hp', 1); s.strike(e, 1);
    const g = s.gems.getChildren().find(o => o.active); return { xp: s.xp - xp, purse: s.purse - purse, gem: !!g }; })()`);
  check('a kill gives 1 experience straight away, and nothing to the purse yet', kill.xp === 1 && kill.purse === 0 && kill.gem, kill);
  const pick = await evaluate(`(() => { const s = ${G}; const g = s.gems.getChildren().find(o => o.active); g.setData('worth', 5); const xp = s.xp, purse = s.purse; s.onGem(g); return { xp: s.xp - xp, purse: s.purse - purse }; })()`);
  check('picking up a gem worth 5 adds 5 gems and no experience', pick.xp === 0 && pick.purse === 5, pick);
  await sleep(200);
  check('the info line counts gems', (await evaluate(`${U}.info.text`)).endsWith('5 gems'), await evaluate(`${U}.info.text`));

  // ---- Weapons left the level-up cards for the shop.
  const pools = await evaluate(`Promise.all([import('/src/upgrades.ts'), import('/src/shop.ts')]).then(([u, sh]) => ({ levelUp: u.UPGRADES.map(c => c.name), shop: sh.SHOP_ITEMS.map(c => c.name) }))`);
  const weapons = ['Flare', 'Brighter Flares', 'Shotgun', 'Buckshot'];
  check('level-up cards offer no weapons', weapons.every((n) => !pools.levelUp.includes(n)), pools.levelUp);
  check('the shop sells all four', weapons.every((n) => pools.shop.includes(n)), pools.shop);

  // ---- Stock leans toward the core's trait, never repeats within a visit, and charm items only reach a calm core.
  const lean = await evaluate(`import('/src/shop.ts').then(sh => import('/src/upgrades.ts').then(u => {
    const s = u.baseStats(); let own = 0, dupes = 0, charmNotCalm = 0, charmCalm = 0; const N = 4000;
    for (let i = 0; i < N; i++) {
      const o = sh.rollShop(4, s, 'hard'); if (o[0].trait === 'hard') own++; if (new Set(o).size !== o.length) dupes++;
      if (sh.rollShop(4, s, 'rage').some(x => x.name === 'Lingering Charm')) charmNotCalm++;
      if (sh.rollShop(4, s, 'calm').some(x => x.name === 'Lingering Charm')) charmCalm++;
    }
    return { firstOwn: +(own / N).toFixed(3), dupes, charmNotCalm, charmCalm, size: sh.rollShop(4, s, null).length };
  }))`);
  check('about 60% of offers come from the core\'s own trait', lean.firstOwn > 0.56 && lean.firstOwn < 0.64, lean);
  check('no offer twice in one visit, and always four', lean.dupes === 0 && lean.size === 4, lean);
  check('Lingering Charm is offered to a calm core only', lean.charmNotCalm === 0 && lean.charmCalm > 0, lean);
  const prices = await evaluate(`import('/src/shop.ts').then(sh => { const f = sh.SHOP_ITEMS.find(x => x.name === 'Flare'); return [sh.priceOf(f, 1), sh.priceOf(f, 3), sh.rerollPrice(1, 0), sh.rerollPrice(1, 1), sh.rerollPrice(3, 0)]; })`);
  check('prices grow by a quarter each shop, rerolls by their count', JSON.stringify(prices) === '[40,60,5,10,8]', prices);

  // ---- The lull's last five seconds are counted under the core, numbers only (Max, 2026-11-25).
  const count = (at) => evaluate(`(() => { const s = ${G}; s.elapsed = ${at}; s.waves(0); const c = s.countdown; return { shown: c.visible, text: c.text, below: c.y > s.player.y, centred: Math.abs(c.x - s.player.x) < 1, alpha: +c.alpha.toFixed(2) }; })()`);
  const early = await count(64), five = await count(65.2), one = await count(69.4);
  check('six seconds before the offers, no countdown yet', !early.shown, early);
  check('then 5 down to 1, faint, under the core', five.shown && five.text === '5' && one.shown && one.text === '1' && five.below && five.centred && five.alpha <= 0.8 && one.alpha <= 0.8, { five, one });

  // ---- The lull's last seconds: gems left on the ground fade, then the shop opens and they're gone. Purse keeps half.
  await evaluate(`(() => { const s = ${G}; s.gems.getChildren().forEach(g => g.disableBody(true, true)); s.purse = 100; s.stats.keepGems = 0.5;
    for (let i = 0; i < 9; i++) s.dropGem(s.player.x + 2000 + i * 20, s.player.y); s.elapsed = 68.6; return true; })()`);
  await sleep(700);
  const fading = await evaluate(`(() => { const s = ${G}; const g = s.gems.getChildren().find(o => o.active); return { alpha: g && +g.alpha.toFixed(2), lull: s.inLull(), elapsed: +s.elapsed.toFixed(2) }; })()`);
  check('in the lull\'s last two seconds the gems on the ground fade', fading.lull && fading.alpha < 0.9 && fading.alpha > 0, fading);
  for (let i = 0; i < 40 && !(await evaluate(`${G}.frozen`)); i++) await sleep(100);
  await sleep(500);
  const opened = await evaluate(`(() => { const s = ${G}; return { frozen: s.frozen, purse: s.purse, ground: s.gems.getChildren().filter(g => g.active).length, offers: s.offers.length, elapsed: +s.elapsed.toFixed(2), shops: s.shops }; })()`);
  check('when the lull ends the game holds for the shop', opened.frozen && opened.shops === 1 && opened.elapsed >= 70 && opened.elapsed < 70.5, opened);
  check('the gems left behind are gone, and Purse kept half their worth (4 of 9)', opened.ground === 0 && opened.purse === 104, opened);
  const texts = await menuTexts();
  check('the countdown is gone once the offers are up', !(await evaluate(`${G}.countdown.visible`)));
  check('the offers screen: four offers, the purse, a reroll and the next wave, and no "shop" title', opened.offers === 4 && !texts.some((x) => /shop/.test(x)) && texts.includes('104 gems') && texts.includes('reroll · 5 gems') && texts.includes('next wave'), texts);
  await shot('shop.png');

  // ---- Buying: click a card. With too few gems, nothing happens.
  const cardAt = (i) => uiPoint(`${U}.menu.list.filter(o => o.type === 'Rectangle' && o.input && o.height > 100)[${i}]`);
  const first = await evaluate(`(() => { const s = ${G}; const o = s.offers[0]; return { name: o.name, price: s.shopView().offers[0].price }; })()`);
  let p = await cardAt(0);
  await click(p.x, p.y); await sleep(250);
  const bought = await evaluate(`(() => { const s = ${G}; return { purse: s.purse, gone: s.offers[0] === null, open: !!${U}.menu }; })()`);
  check(`clicking a card buys it (${first.name}, ${first.price} gems) and the shop stays open`, bought.gone && bought.purse === 104 - first.price && bought.open, { bought, first });
  await evaluate(`(() => { const s = ${G}; s.purse = 0; ${U}.buildMenu(); return true; })()`);
  p = await cardAt(0);
  await click(p.x, p.y); await sleep(250);
  check('with too few gems a click buys nothing', await evaluate(`${G}.offers.filter(o => o).length === 3 && ${G}.purse === 0`));

  // ---- Reroll: new offers, and the next one costs more.
  await evaluate(`(() => { const s = ${G}; s.purse = 50; ${U}.buildMenu(); return true; })()`);
  // The button under a label: same place as the label's text.
  const btnAt = (label) => uiPoint(`(() => { const l = ${U}.menu.list.find(t => t.type === 'Text' && t.text === '${label}'); return ${U}.menu.list.find(o => o.type === 'Rectangle' && o.input && Math.abs(o.y - l.y) < 2 && Math.abs(o.x - l.x) < 2); })()`);
  p = await btnAt('reroll · 5 gems');
  await click(p.x, p.y); await sleep(250);
  const rerolled = await evaluate(`(() => { const s = ${G}; return { purse: s.purse, full: s.offers.filter(o => o).length, rerolls: s.rerolls }; })()`);
  check('a reroll costs 5, and brings four fresh offers', rerolled.purse === 45 && rerolled.full === 4 && rerolled.rerolls === 1, rerolled);
  check('the next reroll costs 10', (await menuTexts()).includes('reroll · 10 gems'));

  // ---- Next wave: the shop closes and the game goes on.
  p = await btnAt('next wave');
  await click(p.x, p.y); await sleep(400);
  const after = await evaluate(`(() => { const s = ${G}; const t0 = s.elapsed; return { frozen: s.frozen, menu: !!${U}.menu, lull: s.inLull(), t0 }; })()`);
  await sleep(400);
  const t1 = await evaluate(`${G}.elapsed`);
  check('"next wave" closes the shop and the clock runs again, out of the lull', !after.frozen && !after.menu && !after.lull && t1 > after.t0, { after, t1 });

  // ---- The new items do what they say.
  const items = await evaluate(`(() => { const s = ${G}; const real = Math.random; Math.random = () => 0.99; const r = {};
    s.stats.maxHp = 100; s.hp = 50; s.stats.gemHeal = 1; s.dropGem(s.player.x + 3000, s.player.y); const g = s.gems.getChildren().find(o => o.active); g.setData('worth', 3); s.onGem(g); r.mend = s.hp;
    s.stats.gemHeal = 0; s.hp = 100; const full = s.shotDamage(); s.stats.spite = 0.05; s.hp = 50; r.spite = +(s.shotDamage() / full).toFixed(3); s.stats.spite = 0;
    s.traits = { hard: 0, calm: 0, rage: 0 }; s.elapsed = 480; s.invuln = 0; s.hp = 100; s.stats.toughness = 0.85; s.onPlayerHit(); r.skin = +s.hp.toFixed(2); s.stats.toughness = 1;
    s.traits = { hard: 2, calm: 0, rage: 0 }; s.elapsed = 75; s.invuln = 0; s.hp = s.stats.maxHp = 1e9; Math.random = real; return r; })()`);
  check('Mending Gems: a gem worth 3 heals 3', items.mend === 53, items);
  check('Spite: at half energy, shots do 25% more', items.spite === 1.25, items);
  check('Thick Skin: a hit that takes 30 takes 25.5', items.skin === 74.5, items);
}
// --- Phone, two sizes: each in its own process, since each harness ends its own process when done.
const { spawnSync } = await import('node:child_process');
for (const [w, h] of [[844, 390], [667, 375]]) {
  const r = spawnSync(process.execPath, [new URL('./shopphone.mjs', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), `${out}-phone${w}`, String(w), String(h)], { encoding: 'utf-8' });
  process.stdout.write(r.stdout + r.stderr);
}
t.done();
