import { open } from './cdp.mjs';
const t = await open({ out: process.argv[2], port: 9351, url: 'http://127.0.0.1:5173/?fullres', dsf: 2 });
const { evaluate, shot, check, sleep, G, U, menuTexts } = t;
// A calm core in the run, with four enemies close by and nothing else going on.
const setup = (mode) => evaluate(`(() => { const s = ${G}; s.traits = { hard: 0, calm: 3, rage: 0 }; s.lastTrait = 'calm'; s.endTutorial('${mode === 'hell' ? 'killed' : 'absorbed'}'); s.traits = { hard: 0, calm: 3, rage: 0 }; s.lastTrait = 'calm';
  s.spawnTimer = 1e9; s.fireCooldown = 1e9; s.abilityCooldown = 0; s.hp = 60;
  // Freed enemies can wear the core down while a charm runs out. On a fresh profile that would offer
  // the second wind and freeze play partway through, so count it as already used.
  s.rescued = true;
  for (let i = 0; i < 4; i++) s.spawnEnemy();
  s.enemies.getChildren().filter(e => e.active).forEach((e, i) => { e.setPosition(s.player.x + Math.cos(i * 1.6) * 130, s.player.y + Math.sin(i * 1.6) * 130); e.setData('hp', 20); e.setData('speed', 70); e.setData('tag', i); });
  return true; })()`);
const foes = () => evaluate(`(() => { const s = ${G}; return s.enemies.getChildren().filter(e => e.active).map(e => ({ tag: e.getData('tag'), charmed: !!e.getData('charmed'), d: Math.round(Math.hypot(e.x - s.player.x, e.y - s.player.y)), alpha: +e.alpha.toFixed(2) })); })()`);
const me = () => evaluate(`(() => { const s = ${G}; return { hp: +s.hp.toFixed(1), xp: s.xp, count: s.kills, level: s.level }; })()`);

await setup('heaven'); await sleep(300);
check('heaven path: the count reads "souls"', (await evaluate(`${U}.info.text`)).endsWith('0 souls'), await evaluate(`${U}.info.text`));
await evaluate(`${G}.useAbility()`); await sleep(1800);
let f = await foes();
check('ghosting charms the four nearby', f.length === 4 && f.every((e) => e.charmed), f);
check('they come close and keep pace, not attacking', f.every((e) => e.d < 130) && (await me()).hp >= 59.9, { f, me: await me() });
check('each is ringed in blue', (await evaluate(`${G}.charmFx.commandBuffer.length`)) > 8);
await shot('charmed.png');

// Touch one: it is taken in.
const before = await me();
await evaluate(`(() => { const s = ${G}; const e = s.enemies.getChildren().find(o => o.active && o.getData('tag') === 0); window.__hold = () => { if (e.active) { e.setPosition(s.player.x + 6, s.player.y); } }; s.events.on('update', window.__hold); })()`);
await sleep(900);
await evaluate(`${G}.events.off('update', window.__hold)`);
const after = await me();
f = await foes();
check('holding against one takes it in', !f.some((e) => e.tag === 0) && after.count === before.count + 1, { before, after });
check('that gives back 3 energy and a point of experience', Math.abs(after.hp - before.hp - 3) < 0.2 && (after.xp === before.xp + 1 || after.level > before.level), { before, after });
if (await evaluate(`!!${U}.menu`)) { await evaluate(`(() => { const u = ${U}; const s = ${G}; s.pendingLevels = 0; s.frozen = false; s.physics.resume(); u.closeMenu(); })()`); }
check('the count now reads 1 soul(s)', (await evaluate(`${U}.info.text`)).endsWith('1 souls'), await evaluate(`${U}.info.text`));

// Charm is catching: a charmed enemy that bumps an uncharmed one passes it on, and that one peels away.
await evaluate(`(() => { const s = ${G}; s.spawnEnemy(); const fresh = s.enemies.getChildren().find(o => o.active && o.getData('tag') === undefined || o.active && !o.getData('charmed') && o.getData('tag') !== 1 && o.getData('tag') !== 2 && o.getData('tag') !== 3);
  fresh.setData('tag', 9); fresh.setData('speed', 70); fresh.setData('hp', 20); const src = s.enemies.getChildren().find(o => o.active && o.getData('tag') === 2);
  fresh.setPosition(s.player.x + 400, s.player.y); src.setPosition(s.player.x + 414, s.player.y); window.__src = src; })()`); await sleep(350);
const caught = await evaluate(`(() => { const s = ${G}; const e = s.enemies.getChildren().find(o => o.active && o.getData('tag') === 9); const v = e.body.velocity; return { charmed: !!e.getData('charmed'), step: e.getData('caught'), vx: Math.round(v.x), left: +e.getData('lost').toFixed(1), giverSpreads: window.__src.getData('spreads') }; })()`);
check('a charmed enemy bumping another passes the charm on', caught.charmed && caught.step === 1 && caught.giverSpreads === 1 && caught.left > 0.3, caught);
check('the one that caught it peels away from you', caught.vx > 10, caught);

// When a charm runs out, the enemy recoils from you for a moment.
const recoil = await evaluate(`new Promise(r => { const s = ${G}; const e = s.enemies.getChildren().find(o => o.active && o.getData('tag') === 3); e.setData('lost', 0.02); let n = 0;
  const f = () => { if (!e.getData('charmed')) { const v = e.body.velocity, a = Math.atan2(v.y, v.x) - Math.atan2(e.y - s.player.y, e.x - s.player.x); return r({ speed: Math.round(Math.hypot(v.x, v.y)), away: Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.1 }); } if (++n < 60) requestAnimationFrame(f); else r(null); }; requestAnimationFrame(f); })`);
check('a charm running out: it recoils from you first', recoil && recoil.speed === 150 && recoil.away, recoil);

// Shoot one: the charm breaks.
await evaluate(`(() => { const s = ${G}; const e = s.enemies.getChildren().find(o => o.active && o.getData('tag') === 1); s.strike(e, 1); })()`); await sleep(100);
f = await foes();
check('a shot breaks the charm on that one only', f.find((e) => e.tag === 1)?.charmed === false && f.find((e) => e.tag === 2)?.charmed === true, f);

// Auto-aim leaves charmed ones alone.
check('auto-aim never picks a charmed enemy', await evaluate(`(() => { const s = ${G}; const e = s.nearestEnemy(Infinity); return !e || !e.getData('charmed'); })()`));

// It wears off.
await sleep(3250);
f = await foes();
check('after about four seconds the charm wears off', f.every((e) => !e.charmed && e.alpha === 1), f);
const hpBefore = (await me()).hp;
await evaluate(`(() => { const s = ${G}; s.traits.calm = 0; s.hp = 50; })()`);
const hpNow = (await me()).hp;
await evaluate(`(() => { const s = ${G}; const e = s.enemies.getChildren().find(o => o.active); s.invuln = 0; s.phaseLeft = 0; e.setPosition(s.player.x + 4, s.player.y); })()`); await sleep(250);
check('and then touching one hurts again', (await me()).hp < hpNow, { hpNow, now: (await me()).hp, why: await evaluate(`(() => { const s = ${G}; const e = s.enemies.getChildren().find(o => o.active); return { frozen: s.frozen, invuln: +s.invuln.toFixed(2), phase: s.phaseLeft, shield: s.shield, levels: s.pendingLevels, xp: s.xp, menu: (${U}.menu?.list ?? []).filter(o => o.type === 'Text').map(o => o.text).slice(0, 3), paused: s.paused, rescued: s.rescued, maxHp: s.stats.maxHp, charmed: !!e?.getData('charmed'), gap: e ? Math.round(Math.hypot(e.x - s.player.x, e.y - s.player.y)) : null }; })()`) });

// Hell path wording.
await evaluate(`${G}.scene.restart({})`); await sleep(1300);
await setup('hell'); await sleep(300);
check('hell path: the count reads "kills"', (await evaluate(`${U}.info.text`)).endsWith('0 kills'), await evaluate(`${U}.info.text`));
await evaluate(`${G}.gameOver()`); await sleep(600);
check('game over uses the same word', (await menuTexts()).some((x) => x.endsWith('0 kills')), await menuTexts());
t.done();
