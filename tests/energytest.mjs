import { open } from './cdp.mjs';
const t = await open({ out: process.argv[2], port: 9350, url: 'http://127.0.0.1:5173/?fullres', dsf: 2 });
const { evaluate, shot, check, sleep, press, G } = t;
// Unlock sound so the heal sound can be counted.
for (let i = 0; i < 20 && (await evaluate(`audioDebug().state`)) !== 'running'; i++) { await press('a', 'KeyA', 65); await sleep(400); }
const hp = () => evaluate(`+${G}.hp.toFixed(3)`);
const size = () => evaluate(`+(${G}.player.scaleX * 4).toFixed(3)`);

// --- Orientation: firing is free.
await evaluate(`(() => { const s = ${G}; s.enemies.getChildren().forEach(e => e.disableBody(true, true)); s.spawnSeed('curious', s.player.x + 900, s.player.y, 0); for (let i = 0; i < 20; i++) s.spend(0.06); })()`);
check('orientation: firing costs nothing', (await hp()) === 100, await hp());

// --- The run: every volley and blast spends a little.
await evaluate(`(() => { const s = ${G}; s.endTutorial('absorbed'); s.traits = { hard: 0, calm: 0, rage: 0 }; s.spawnTimer = 1e9; })()`); await sleep(300);
await evaluate(`(() => { const s = ${G}; s.spawnEnemy(); const e = s.enemies.getChildren().find(o => o.active); e.setData('hp', 1e9); e.setData('speed', 0); e.setPosition(s.player.x + 200, s.player.y); window.__f0 = s.hp; })()`);
await sleep(3000);
const spent = await evaluate(`+(window.__f0 - ${G}.hp).toFixed(2)`);
check('three seconds of auto-fire spends about half a point', spent > 0.3 && spent < 0.8, spent);
check('at full energy the core is full size', (await size()) > 0.99, await size());
await evaluate(`(() => { const s = ${G}; s.hp = 15.02; for (let i = 0; i < 50; i++) s.spend(0.06); })()`); await sleep(200);
check('firing never takes you below 15%', (await hp()) === 15, await hp());
check('a drained core is smaller', Math.abs((await size()) - 0.83) < 0.01, await size());
await shot('drained.png');

// --- Motes and the siphon card give it back.
await evaluate(`(() => { const s = ${G}; s.enemies.getChildren().forEach(e => e.disableBody(true, true)); s.fireCooldown = 1e9; s.hp = 50; s.dropMote(s.player.x + 60, s.player.y); })()`); await sleep(120);
await shot('mote.png');
await sleep(900);
const c = await evaluate(`audioDebug().counts.heal`);
check('a mote within reach flies in and restores 6', (await hp()) === 56 && c >= 1, { hp: await hp(), heals: c });
await evaluate(`(() => { const s = ${G}; s.stats.leech = 1; s.spawnEnemy(); const e = s.enemies.getChildren().find(o => o.active); e.setData('hp', 1); window.__m0 = s.motes.getChildren().filter(m => m.active).length; Math.random = () => 0.99; s.strike(e, 1); })()`);
check('siphon: a kill restores 1', (await hp()) === 57, await hp());
check('the siphon card exists', await evaluate(`import('/src/upgrades.ts').then(m => { let found = false; for (let i = 0; i < 30 && !found; i++) found = m.rollUpgrades(50, m.baseStats()).some(u => u.name === 'Siphon'); return found; })`));
check('motes drop on about 7% of kills', await evaluate(`(() => { const s = ${G}; let n = 0; const real = [0.01, 0.5, 0.069, 0.071]; for (const r of real) { Math.random = () => r; s.spawnEnemy(); const e = s.enemies.getChildren().find(o => o.active); const before = s.motes.getChildren().filter(m => m.active).length; e.setData('hp', 1); s.strike(e, 1); if (s.motes.getChildren().filter(m => m.active).length > before) n++; } return n; })()`) === 2);
await evaluate(`location.reload()`); await sleep(4000);

// --- The red power: a shockwave that throws everything close off you.
await evaluate(`(() => { const s = ${G}; s.traits = { hard: 0, calm: 0, rage: 3 }; s.lastTrait = 'rage'; s.endTutorial('absorbed'); s.spawnTimer = 1e9; s.fireCooldown = 1e9; s.mode = 'hell'; s.stats.maxHp = s.hp = 1e9;
  for (let i = 0; i < 8; i++) s.spawnEnemy();
  s.enemies.getChildren().filter(e => e.active).forEach((e, i) => { const d = i < 5 ? 40 + i * 13 : 260; e.setPosition(s.player.x + Math.cos(i * 1.3) * d, s.player.y + Math.sin(i * 1.3) * d); e.setData('hp', i === 0 ? 2 : 50); e.setData('speed', 0); e.setData('shootCd', 99); e.setData('tag', i); });
  for (let i = 0; i < 4; i++) { const b = s.enemyBullets.get(); b.enableBody(true, s.player.x + (i < 2 ? 80 : 300), s.player.y + i * 5, true, true); b.setData('life', 9); }
  window.__k0 = s.kills; })()`); await sleep(200);
await evaluate(`${G}.useAbility()`); await sleep(120);
const r = await evaluate(`(() => { const s = ${G}; const es = s.enemies.getChildren().filter(e => e.active).map(e => { const v = e.body.velocity, a = Math.atan2(v.y, v.x) - Math.atan2(e.y - s.player.y, e.x - s.player.x); return { tag: e.getData('tag'), hp: e.getData('hp'), speed: Math.round(Math.hypot(v.x, v.y)), away: Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.1 }; });
  return { es, kills: s.kills - window.__k0, shots: s.enemyBullets.getChildren().filter(b => b.active).length, numbers: s.damageTexts.filter(x => x.visible).map(x => x.text), own: s.bullets.getChildren().filter(b => b.active).length }; })()`);
const near = r.es.filter((e) => e.tag >= 1 && e.tag <= 4), far = r.es.filter((e) => e.tag >= 5);
check('the weak one beside you dies', r.kills === 1 && !r.es.some((e) => e.tag === 0), r.kills);
check('the four others in reach are hit hard and hurled away, nearest hardest', near.length === 4 && near.every((e) => Math.abs(e.hp - 29.7) < 0.01 && e.away && e.speed > 500) && near[0].speed > near[3].speed, near);
check('the three out of reach are untouched', far.length === 3 && far.every((e) => e.hp === 50 && e.speed === 0), far);
check('their shots in reach are snuffed, the far ones fly on', r.shots === 2, r.shots);
check('it no longer fires a ring of your own shots', r.own === 0, r.own);
check('each hit shows its damage (203 with three rage)', r.numbers.filter((x) => x === "203").length === 5, r.numbers);
await shot('burst.png');
t.done();
