import { open } from './cdp.mjs';
const t = await open({ out: process.argv[2], port: 9354, url: 'http://127.0.0.1:5173/?fullres', dsf: 2 });
const { evaluate, shot, check, sleep, click, G, U, uiPoint, menuTexts } = t;
// A fresh browser profile: no best run saved, so this player counts as new.
const run = () => evaluate(`(() => { const s = ${G}; s.endTutorial('absorbed'); s.traits = { hard: 0, calm: 0, rage: 0 }; s.spawnTimer = 1e9; s.fireCooldown = 1e9; s.xpToNext = () => 1e9; return true; })()`);
const crowd = (n) => evaluate(`(() => { const s = ${G}; for (let i = 0; i < ${n}; i++) { s.spawnEnemy(); const e = s.enemies.getChildren().filter(o => o.active).pop(); e.setPosition(s.player.x + Math.cos(i) * (120 + i * 12), s.player.y + Math.sin(i) * (90 + i * 6)); e.setData('speed', 0); } return true; })()`);
const hit = () => evaluate(`(() => { const s = ${G}; s.invuln = 0; s.onPlayerHit(); return +s.hp.toFixed(1); })()`);
const me = () => evaluate(`(() => { const s = ${G}; return { hp: +s.hp.toFixed(1), frozen: s.frozen, rescued: s.rescued, shield: +s.shield.toFixed(1), foes: s.enemies.getChildren().filter(e => e.active).length }; })()`);
const pick = async (name) => { const p = await uiPoint(`u.menu.list.find(o => o.type === 'Text' && o.text === '${name}')`); await sleep(450); await click(p.x, p.y + 40); await sleep(500); };

await run(); await crowd(8); await sleep(300);
await evaluate(`${G}.hp = 45`);
check('a hit that leaves you above 30%: no rescue', (await hit()) === 35 && !(await me()).frozen, await me());
await hit(); await sleep(500);
let texts = await menuTexts();
check('new player, early, at 25%: the second wind is offered', texts.includes('second wind') && texts.includes('clean slate') && texts.includes('untouchable') && (await me()).frozen, texts);
await shot('rescue.png');
await pick('clean slate');
let m = await me();
check('clean slate: everything on screen is gone, and half your health is back', m.foes === 0 && m.hp === 75 && !m.frozen, m);
await crowd(3); await evaluate(`${G}.hp = 20`); await hit(); await sleep(300);
check('it is only offered once a run', !(await me()).frozen && !(await evaluate(`!!${U}.menu`)), await me());

// Next run: the shield.
await evaluate(`${G}.scene.restart({})`); await sleep(1300);
await run(); await crowd(4); await sleep(200);
await evaluate(`${G}.hp = 12`); await hit(); await sleep(500);
check('a hit that would have killed still leaves you alive to choose', (await me()).frozen && (await me()).hp >= 1, await me());
await pick('untouchable');
m = await me();
check('untouchable: a 30 second shield', m.shield > 29 && !m.frozen && m.hp > 50, m);
const before = m.hp;
await sleep(1100);
await hit(); await hit();
check('nothing hurts you while it lasts', (await me()).hp === before, await me());
await shot('shield.png');
await evaluate(`${G}.shield = 0.05`); await sleep(300);
check('and then it ends', (await hit()) < before, await me());

// Not for someone who has already lasted two minutes, and not late in a run.
await evaluate(`import('/src/storage.ts').then(m => { m.recordRun({ time: 200, level: 5, kills: 40 }); return true; })`);
await evaluate(`${G}.scene.restart({})`); await sleep(1300);
await run(); await evaluate(`${G}.hp = 25`); await hit(); await sleep(300);
check('a player with a 3-minute best is not offered it', !(await me()).frozen && !(await me()).rescued, await me());
t.done();
