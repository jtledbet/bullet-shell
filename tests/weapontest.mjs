import { open } from './cdp.mjs';
const t = await open({ out: process.argv[2], port: 9352, url: 'http://127.0.0.1:5173/?fullres&dev', dsf: 2 });
const { evaluate, shot, check, sleep, click, G, uiPoint, menuTexts } = t;
const numbers = () => evaluate(`${G}.damageTexts.filter(x => x.visible).map(x => x.text)`);
const run = () => evaluate(`(() => { const s = ${G}; s.endTutorial('absorbed'); s.traits = { hard: 0, calm: 0, rage: 0 }; s.spawnTimer = 1e9; s.fireCooldown = 1e9; s.stats.maxHp = 1000; s.hp = 1000; return true; })()`);
// One enemy held still at a given offset, with plenty of health.
const dummy = (dx, dy, hp = 500) => evaluate(`(() => { const s = ${G}; s.spawnEnemy(); const e = s.enemies.getChildren().filter(o => o.active).pop(); e.setPosition(s.player.x + ${dx}, s.player.y + ${dy}); e.setData('hp', ${hp}); e.setData('speed', 0); return true; })()`);
const foes = () => evaluate(`(() => { const s = ${G}; return s.enemies.getChildren().filter(e => e.active).map(e => ({ dx: Math.round(e.x - s.player.x), hp: +e.getData('hp').toFixed(1), speed: Math.round(Math.hypot(e.body.velocity.x, e.body.velocity.y)) })); })()`);
const clear = () => evaluate(`(() => { const s = ${G}; s.enemies.getChildren().forEach(e => e.disableBody(true, true)); s.bullets.getChildren().forEach(b => b.disableBody(true, true)); s.flares.getChildren().forEach(b => b.disableBody(true, true)); s.damageTexts.forEach(x => x.setVisible(false)); return true; })()`);

await run(); await sleep(200);
// --- Base shots hit harder, and jolt what they hit.
await dummy(80, 0);
// Watch the enemy frame by frame: the fastest it is thrown, and what the hit left it with.
const hit = await evaluate(`new Promise(r => { const s = ${G}; const e = s.enemies.getChildren().find(o => o.active); s.shoot(0, 600, 1, false); let top = 0, n = 0;
  const fr = () => { top = Math.max(top, Math.hypot(e.body.velocity.x, e.body.velocity.y)); if (++n < 30) requestAnimationFrame(fr); else r({ top: Math.round(top), hp: +e.getData('hp').toFixed(1), shown: s.damageTexts.filter(x => x.visible).map(x => x.text) }); }; requestAnimationFrame(fr); })`);
let f = await foes();
check('a base bolt does 1.4 (shows 14)', hit.hp === 498.6 && hit.shown.includes('14'), hit);
check('and jolts its target back', hit.top === 110, hit);
await clear();

// --- Shots grow with level: damage and size.
await dummy(80, 0);
await evaluate(`(() => { const s = ${G}; s.level = 6; s.shoot(0, 600, 1, false); window.__scale = s.bullets.getChildren().find(b => b.active).scaleX * 4; })()`); await sleep(120);
f = await foes();
check('at level 6 the same bolt does 1.68 (shows 17) and is 20% bigger', f[0].hp === 498.3 && (await numbers()).includes('17') && Math.abs((await evaluate(`window.__scale`)) - 1.2) < 0.01, { f, n: await numbers(), scale: await evaluate(`window.__scale`) });
await evaluate(`${G}.level = 1`); await clear();

// --- The flare.
check('no flare until its card', (await evaluate(`${G}.stats.flareEvery`)) === 0);
check('the shop sells both flare items, the second only once you have the first', await evaluate(`Promise.all([import('/src/upgrades.ts'), import('/src/shop.ts')]).then(([u, m]) => { const base = u.baseStats(); const names = (s) => new Set(m.shopStock(s, null).map(x => x.name)); const a = names(base); const b = names({ ...base, flareEvery: 3.5 }); return a.has('Flare') && !a.has('Brighter Flares') && !b.has('Flare') && b.has('Brighter Flares'); })`));
await evaluate(`(() => { const s = ${G}; s.stats.flareEvery = 3.5; s.flareCooldown = 0; window.__hp0 = s.hp; })()`);
// A clump 200 away, one enemy off to the side out of the blast, one right behind you.
await dummy(200, 0); await dummy(230, 30); await dummy(215, -40); await dummy(200, 170); await dummy(-120, 0);
await sleep(250);
const flying = await evaluate(`(() => { const s = ${G}; const fl = s.flares.getChildren().find(o => o.active); return fl ? { vx: Math.round(fl.body.velocity.x), tint: fl.tintTopLeft !== 0xffffff || true } : null; })()`);
check('with the card it lobs a flare at the nearest enemy', flying && Math.abs(flying.vx) > 150, flying);
await shot('flare-flying.png');
await sleep(900);
f = await foes();
const clump = f.filter((e) => e.dx > 150 && Math.abs(e.hp - 500) > 0.01), spared = f.filter((e) => Math.abs(e.hp - 500) < 0.01);
check('it bursts in the clump: all three take 8.4 (shows 84)', clump.length === 3 && clump.every((e) => Math.abs(e.hp - 491.6) < 0.01), f);
check('the two outside the blast are untouched', spared.length === 2, spared);
check('lobbing it spent 0.4 energy', Math.abs((await evaluate(`window.__hp0 - ${G}.hp`)) - 0.4) < 0.001, await evaluate(`window.__hp0 - ${G}.hp`));
await clear();
// A flare that meets nothing still bursts at the end of its reach.
await evaluate(`(() => { const s = ${G}; s.stats.flareEvery = 0; const fl = s.flares.get(); fl.enableBody(true, s.player.x, s.player.y, true, true); fl.body.velocity.set(300, 0); fl.setData('life', 0.2); })()`);
await dummy(60, 0); await sleep(450);
check('a flare that reaches the end of its range bursts there', (await evaluate(`${G}.flares.getChildren().filter(o => o.active).length`)) === 0 && (await foes())[0].hp < 500, await foes());
await clear();

// --- Brighter flares.
await evaluate(`(() => { const s = ${G}; s.stats.flareEvery = 3.5; s.stats.flarePower = 1.4; s.flareCooldown = 0; })()`);
await dummy(150, 0); await dummy(150 + 72, 0);
await sleep(900);
f = await foes();
check('brighter flares: 40% more damage and a wider reach (one just past the old reach is now caught)', f.length === 2 && f.every((e) => Math.abs(e.hp - (500 - 8.4 * 1.4)) < 0.06), f);
await clear();

// --- Dev switch.
await evaluate(`(() => { const s = ${G}; s.stats.flareEvery = 0; s.stats.flarePower = 1; s.pauseGame(); })()`); await sleep(600);
check('dev: a flare switch beside the shotgun switch', (await menuTexts()).includes('flare: off') && (await menuTexts()).includes('shotgun: off'), await menuTexts());
const p = await uiPoint(`u.menu.list.find(o => o.type === 'Text' && o.text.startsWith('flare'))`);
await click(p.x, p.y); await sleep(400);
check('flip it: flares every 2 seconds, at once', (await menuTexts()).includes('flare: on') && (await evaluate(`${G}.stats.flareEvery`)) === 2);
await shot('dev-pause.png');
await evaluate(`${G}.resumeGame()`);
await dummy(160, 0); await dummy(180, 20); await dummy(170, -20);
await sleep(700);
await shot('flare-burst.png');
await evaluate(`import('/src/storage.ts').then(m => { m.setDevFlare(false); m.setDev(false); return true; })`);
t.done();
