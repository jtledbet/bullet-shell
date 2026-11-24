import { open } from './cdp.mjs';
const t = await open({ out: process.argv[2], port: 9348, url: 'http://127.0.0.1:5173/?fullres', dsf: 2 });
const { evaluate, shot, check, sleep, G } = t;
const setLabels = (on) => evaluate(`import('/src/storage.ts').then(m => { m.setLabels(${on}); return true; })`);
const core = () => evaluate(`(() => { const s = ${G}; return { tint: s.player.tintTopLeft, steep: +s.steep.toFixed(2), fear: +s.fear.toFixed(2), ...Object.fromEntries(Object.entries(s.face.look).map(([k, v]) => [k, typeof v === 'number' ? +v.toFixed(2) : v])) }; })()`);
const thoughts = () => evaluate(`${G}.thoughts.filter(x => x.on && x.text.visible).map(x => x.text.text)`);
const oneSeed = (mood, d) => evaluate(`(() => { const s = ${G}; s.enemies.getChildren().forEach(e => e.disableBody(true, true)); s.spawnSeed('${mood}', s.player.x + ${d}, s.player.y, 0); return true; })()`);
const fresh = async () => { await evaluate(`${G}.scene.restart({})`); await sleep(1300); };
await setLabels(false);

// --- The core starts plain white, flat and a little scared.
await oneSeed('curious', 260); await sleep(900);
let c = await core();
check('starts white, with a flat and slightly worried face', c.tint === 0xf8fafc && c.steep === 0 && Math.abs(c.curve) < 0.2 && c.brow > 0.2 && !c.paleInk, c);
await shot('core-start.png');

// --- Each decision tints it a little at once.
await evaluate(`${G}.gainTrait('calm')`); await sleep(300);
c = await core();
check('one calm point: a faint tint, no more', c.steep === 0.1 && c.tint !== 0xf8fafc && ((c.tint >> 16) & 0xff) > 0xe0, c);

// --- Far down each path.
const path = async (traits, name) => {
  await evaluate(`(() => { const s = ${G}; s.traits = ${JSON.stringify(traits)}; s.steep = 1; })()`); await sleep(900);
  const r = await core(); await shot(`core-${name}.png`); return r;
};
c = await path({ hard: 0, calm: 4, rage: 0 }, 'gentle');
check('gentle path: soft blue, a small smile, dark ink', (c.tint & 0xff) > ((c.tint >> 16) & 0xff) + 60 && c.curve > 0.5 && !c.paleInk, c);
c = await path({ hard: 0, calm: 0, rage: 4 }, 'dark');
check('dark path: deep red, lowered brows, narrowed glowing eyes', ((c.tint >> 16) & 0xff) > (c.tint & 0xff) + 90 && c.brow < -0.5 && c.eye < 0.9 && c.paleInk, c);
c = await path({ hard: 4, calm: 0, rage: 0 }, 'stern');
check('hard path: steel, stern', c.brow < 0.1 && c.curve < 0.2 && !c.paleInk, c);

// --- Fear: low health widens the eyes, opens the mouth, brings sweat. A hit makes it wince.
await evaluate(`(() => { const s = ${G}; s.traits = { hard: 0, calm: 0, rage: 0 }; s.steep = 0; s.endTutorial('absorbed'); s.traits = { hard: 0, calm: 0, rage: 0 }; s.steep = 0; s.hp = 6; })()`); await sleep(1500);
c = await core();
check('nearly dead: wide eyes, open mouth, sweat', c.fear > 0.85 && c.eye > 1.25 && c.open > 0.2 && c.sweat > 0.5, c);
await shot('core-scared.png');
// Watched frame by frame through the wince (0.35 s), taking its deepest point: the eyes ease shut,
// so one fixed moment early on can catch them still on the way down after a slow frame.
const wince = await evaluate(`new Promise(r => { const s = ${G}; s.hp = s.stats.maxHp; s.invuln = 0; s.onPlayerHit(); const t0 = performance.now(); let min = 9, n = 0;
  const f = () => { min = Math.min(min, s.face.look.eye); if (performance.now() - t0 < 500 && ++n < 300) requestAnimationFrame(f); else r({ min: +min.toFixed(2), frames: n }); }; requestAnimationFrame(f); })`);
check('hit: it winces', wince.min < 0.6, wince);

// --- Damage numbers.
await evaluate(`(() => { const s = ${G}; s.hp = s.stats.maxHp = 1e9; s.spawnTimer = 1e9; s.fireCooldown = 1e9; s.spawnEnemy(); const e = s.enemies.getChildren().find(o => o.active); e.setPosition(s.player.x + 60, s.player.y); e.setData('hp', 99); e.setData('speed', 0); s.shoot(0, 600, 1, false); })()`); await sleep(250);
const dmg = await evaluate(`${G}.damageTexts.filter(x => x.visible).map(x => x.text)`);
check('a hit shows its damage floating up', dmg.length === 1 && dmg[0] === '14', dmg);
await shot('damage.png');
await sleep(900);
check('and the number fades away', (await evaluate(`${G}.damageTexts.filter(x => x.visible).length`)) === 0);

// --- Ghost mode: near enemies are baffled, far ones wander off, both come back.
await evaluate(`(() => { const s = ${G}; s.enemies.getChildren().forEach(e => e.disableBody(true, true)); s.traits = { hard: 0, calm: 3, rage: 0 }; s.lastTrait = 'calm'; s.abilityCooldown = 0;
  for (let i = 0; i < 6; i++) s.spawnEnemy(); s.enemies.getChildren().filter(e => e.active).forEach((e, i) => { const d = i < 3 ? 120 : 420; e.setPosition(s.player.x + Math.cos(i * 2.1) * d, s.player.y + Math.sin(i * 2.1) * d); e.setData('hp', 1e9); e.setData('speed', 70); }); })()`); await sleep(400);
const foes = () => evaluate(`(() => { const s = ${G}; return s.enemies.getChildren().filter(e => e.active).map(e => { const d = Math.hypot(e.x - s.player.x, e.y - s.player.y), v = e.body.velocity, a = Math.atan2(v.y, v.x) - Math.atan2(s.player.y - e.y, s.player.x - e.x); return { d: Math.round(d), speed: Math.round(Math.hypot(v.x, v.y)), off: +Math.abs(Math.atan2(Math.sin(a), Math.cos(a))).toFixed(2), charmed: !!e.getData('charmed'), lost: e.getData('lost') > 0 }; }); })()`);
await evaluate(`${G}.useAbility()`); await sleep(350);
let f = await foes();
const near = f.filter((e) => e.charmed), far = f.filter((e) => !e.charmed);
check('ghosting: the three near ones are charmed and come gently closer', near.length === 3 && near.every((e) => e.lost && e.d <= 100), near);
check('each charmed one thinks "?" (labels are off)', (await thoughts()).filter((x) => x === '?').length === 3, await thoughts());
check('the three far ones wander off slowly', far.length === 3 && far.every((e) => e.lost && e.speed === 28), far);
await shot('ghost.png');
await sleep(5200);
f = await foes();
check('afterwards they all come for you again', f.every((e) => !e.lost && e.off < 0.05 && e.speed === 70), f);

// --- Thoughts in orientation.
await fresh(); await oneSeed('curious', 260); await sleep(500);
check('labels off: a calm seed keeps its thoughts to itself', (await thoughts()).length === 0, await thoughts());
await evaluate(`(() => { const s = ${G}; const e = s.enemies.getChildren().find(o => o.active); s.shoot(0, 900, 1, false); })()`); await sleep(350);
check('shoot it: "!"', (await thoughts()).includes('!'), await thoughts());
await sleep(700);
check('then it swears', (await thoughts()).includes('#@!%'), await thoughts());
await shot('thought-angry.png');
await fresh(); await oneSeed('curious', 260); await sleep(300);
await evaluate(`${G}.idleTime = 17.9`); await sleep(500);
check('ignored for 18s: "hey"', (await thoughts()).includes('hey'), await thoughts());
await evaluate(`${G}.idleTime = 24.9`); await sleep(500);
check('at 25s: "HEY", and it turns on you', (await thoughts()).includes('HEY') && (await evaluate(`${G}.irritated`)), await thoughts());
await shot('thought-hey.png');
await fresh(); await setLabels(true);
await evaluate(`(() => { const s = ${G}; s.enemies.getChildren().forEach(e => e.disableBody(true, true)); s.spawnSeed('curious', s.player.x + 260, s.player.y - 60, 0); s.spawnSeed('skeptical', s.player.x - 300, s.player.y, 1); s.spawnSeed('aggro', s.player.x, s.player.y + 320, 1); })()`); await sleep(600);
const all = (await thoughts()).sort();
check('labels on: every seed always shows its mind', all.join(' ') === '#@!% ... ?', all);
await shot('thoughts-labels.png');
await evaluate(`(() => { const s = ${G}; s.enemies.getChildren().forEach(e => e.disableBody(true, true)); s.spawnSeed('curious', s.player.x + 120, s.player.y, 0); })()`); await sleep(400);
check('a curious seed up close: "what is that"', (await thoughts()).includes('what is that'), await thoughts());
await setLabels(false);
t.done();
