import { open } from './cdp.mjs';
// The powers grow with level, and a braced core knocks away whatever touches it.
const t = await open({ out: process.argv[2], port: 9365, url: 'http://127.0.0.1:5173/?fullres', dsf: 1 });
const { evaluate, check, sleep, shot, G } = t;
const start = (trait) => evaluate(`(() => { const s = ${G}; s.traits = { hard: 0, calm: 0, rage: 0 }; s.traits.${trait} = 1; s.lastTrait = '${trait}'; s.endTutorial('absorbed'); s.traits = { hard: 0, calm: 0, rage: 0 }; s.traits.${trait} = 1; s.lastTrait = '${trait}';
  s.spawnTimer = 1e9; s.fireCooldown = 1e9; s.rescued = true; s.enemies.getChildren().forEach(e => e.disableBody(true, true)); s.abilityCooldown = 0; return true; })()`);
await start('rage');
await sleep(500);

const at = (level) => evaluate(`(() => { const s = ${G}; const was = s.level; s.level = ${level}; const r = { cd: +s.cooldownSeconds().toFixed(2), burst: s.burstRadius(), brace: +s.braceSeconds().toFixed(2), lets: +s.braceLets().toFixed(3), phase: +s.phaseSeconds().toFixed(2), charm: s.charmRadius() }; s.level = was; return r; })()`);
const l1 = await at(1), l20 = await at(20), l60 = await at(60);
check('level 1: as before (6 s cooldown, 100 burst, 1.5 s brace letting a fifth through, 1.2 s phase, 280 charm)', JSON.stringify(l1) === JSON.stringify({ cd: 6, burst: 100, brace: 1.5, lets: 0.2, phase: 1.2, charm: 280 }), l1);
check('level 20: 3.36 s cooldown, 176 burst, 2.45 s brace letting 0.136 through, 1.77 s phase, 356 charm', JSON.stringify(l20) === JSON.stringify({ cd: 3.36, burst: 176, brace: 2.45, lets: 0.136, phase: 1.77, charm: 356 }), l20);
check('they stop growing at their caps', JSON.stringify(l60) === JSON.stringify({ cd: 3, burst: 240, brace: 3, lets: 0.1, phase: 2.2, charm: 400 }), l60);

// --- Burst at level 20: reaches 176, and hits for 29 times a shot.
const burst = await evaluate(`(() => { const s = ${G}; s.level = 20; s.elapsed = 0; s.stats.maxHp = s.hp = 1e9;
  for (let i = 0; i < 2; i++) s.spawnEnemy();
  const es = s.enemies.getChildren().filter(e => e.active); es.forEach((e, i) => { e.setPosition(s.player.x + (i ? 190 : 170), s.player.y); e.setData('hp', 1e4); e.setData('speed', 0); });
  const shot = s.shotDamage(); s.useAbility();
  return { near: +(1e4 - es[0].getData('hp')).toFixed(2), far: es[1].getData('hp'), want: +(shot * 29).toFixed(2), cd: +s.abilityCooldown.toFixed(2) }; })()`);
check('burst at level 20 reaches 170 px away, for 29 times a shot', burst.near === burst.want, burst);
check('but not 190', burst.far === 1e4, burst);
check('and recharges in 3.36 s', burst.cd === 3.36, burst);
await sleep(200);
check('the button shows it recharging from that shorter cooldown', await evaluate(`(() => { const a = ${G}.hudState().ability; return a.charge > 0 && a.charge < 0.2; })()`), await evaluate(`${G}.hudState().ability`));

// --- Brace: whatever touches you is knocked away hard and takes four shots' worth.
await evaluate(`(() => { const s = ${G}; s.enemies.getChildren().forEach(e => e.disableBody(true, true)); s.scene.restart({}); return true; })()`); await sleep(1500);
await start('hard');
await sleep(400);
const brace = await evaluate(`new Promise(r => { const s = ${G}; s.level = 20; s.elapsed = 0; s.hp = 100; s.invuln = 0; s.abilityCooldown = 0;
  s.spawnEnemy(); const e = s.enemies.getChildren().find(o => o.active); e.setData('hp', 1000); e.setData('speed', 0); e.setPosition(s.player.x + 6, s.player.y);
  const shot = s.shotDamage(); s.useAbility(); let n = 0;
  const f = () => { const v = e.body.velocity; if (e.getData('hp') < 1000 || ++n > 90) return r({ took: +(1000 - e.getData('hp')).toFixed(2), want: +(shot * 4).toFixed(2), speed: Math.round(Math.hypot(v.x, v.y)), awayX: v.x > 0, hp: +s.hp.toFixed(2), braced: s.braceLeft > 0 }); requestAnimationFrame(f); }; requestAnimationFrame(f); })`);
check('braced: an enemy that touches you takes four shots of damage', brace.took === brace.want, brace);
check('and is knocked away hard', brace.speed >= 800 && brace.awayX, brace);
check('while you take only 10 x 0.88 x 0.136 = 1.2', Math.abs(100 - brace.hp - 1.2) < 0.01 && brace.braced, brace);
await shot('brace-shove.png');
await sleep(150);
const later = await evaluate(`(() => { const s = ${G}; return s.enemies.getChildren().filter(o => o.active).map(e => ({ took: +(1000 - e.getData('hp')).toFixed(2), d: Math.round(Math.hypot(e.x - s.player.x, e.y - s.player.y)), knock: +e.getData('knock').toFixed(2) })); })()`);
check('one touch is one knock, not one per frame', later.length === 1 && later[0].took === brace.want, later);

// --- Phase at level 20 charms out to 356.
await evaluate(`(() => { const s = ${G}; s.enemies.getChildren().forEach(e => e.disableBody(true, true)); s.scene.restart({}); return true; })()`); await sleep(1500);
await start('calm');
await sleep(400);
const phase = await evaluate(`(() => { const s = ${G}; s.level = 20; s.stats.maxHp = s.hp = 1e9; for (let i = 0; i < 2; i++) s.spawnEnemy();
  const es = s.enemies.getChildren().filter(e => e.active); es.forEach((e, i) => { e.setPosition(s.player.x - (i ? 370 : 340), s.player.y); e.setData('speed', 0); e.setData('hp', 1e4); });
  s.useAbility(); return { near: !!es[0].getData('charmed'), far: !!es[1].getData('charmed'), phase: +s.phaseLeft.toFixed(2) }; })()`);
check('phase at level 20 charms an enemy 340 px away, not one at 370, and lasts 1.77 s', phase.near && !phase.far && phase.phase === 1.77, phase);
t.done();
