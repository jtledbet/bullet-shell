// The core speaks, rarely (Max, 2026-11-25): pressing the power before it's ready swells its arc every
// time, and about one press in five the core says "not yet", never twice within 30 s and not while a
// power still runs. Shown with labels off too.
import { open } from './cdp.mjs';

const t = await open({ out: process.argv[2], port: 9381, url: 'http://127.0.0.1:5173/?fullres', width: 844, height: 390, dsf: 2 });
const { evaluate, shot, check, sleep, G } = t;
await evaluate(`(() => { const s = ${G}; s.endTutorial('absorbed'); s.spawnTimer = 1e9; s.fireCooldown = 1e9; s.stats.maxHp = s.hp = 1e9; s.xpToNext = () => 1e9;
  s.enemies.getChildren().forEach(e => e.disableBody(true, true)); s.traits = { hard: 0, calm: 2, rage: 0 }; s.lastTrait = 'calm'; return true; })()`);
await sleep(1200);

// Press the power with Math.random fixed for that one press (0: the one in five; 0.5: the other four).
const press = (roll, setup = '') => evaluate(`(() => { const s = ${G}; ${setup}; const r = Math.random; Math.random = () => ${roll}; try { s.useAbility(); } finally { Math.random = r; }
  const th = s.thoughts.find(x => x.on === s.player);
  return { says: th ? th.text.text : null, nudge: +s.arcNudge.toFixed(2), cd: s.abilityCooldown, used: s.lastAbility }; })()`);
const hush = `s.forget(s.player)`;
const labels = await evaluate(`import('/src/storage.ts').then(m => m.labelsOn())`);

let r = await press(0, `${hush}; s.lastAbility = null; s.abilityCooldown = s.abilityCooldownFull = 8; s.phaseLeft = s.braceLeft = 0; s.elapsed = 100`);
check('labels off, pressed too early, the one in five: the core says "not yet" and the arc swells', labels === false && r.says === 'not yet' && r.nudge > 0.9 && r.used === null && r.cd === 8, { ...r, labels });
await sleep(120);
const where = await evaluate(`(() => { const s = ${G}, th = s.thoughts.find(x => x.on === s.player); return { shown: th?.text.visible, above: th ? th.text.y < s.player.y - s.coreEdge() : false, centred: th ? Math.abs(th.text.x - s.player.x) < 2 : false }; })()`);
check('the words sit over the core', where.shown && where.above && where.centred, where);
await shot('notyet.png');

r = await press(0, `${hush}; s.elapsed = 120`);
check('within 30 s it stays quiet, but the arc still swells', r.says === null && r.nudge > 0.9, r);
r = await press(0.5, `${hush}; s.elapsed = 131`);
check('after 30 s, four presses in five say nothing', r.says === null && r.nudge > 0.9, r);
r = await press(0, `${hush}; s.elapsed = 131`);
check('and the fifth says it again', r.says === 'not yet', r);
r = await press(0, `${hush}; s.elapsed = 200; s.phaseLeft = 3`);
check('not while a power is still running (the arc swells)', r.says === null && r.nudge > 0.9, r);

await sleep(1500);
check('the swell fades', (await evaluate(`${G}.arcNudge`)) === 0);

r = await press(0, `${hush}; s.elapsed = 300; s.phaseLeft = s.braceLeft = 0; s.abilityCooldown = 0`);
check('when it is ready the power just goes, no words', r.used === 'phase' && r.says !== 'not yet', r);
t.done();
