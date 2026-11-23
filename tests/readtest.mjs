// Duncan's readability notes (2026-11-23): enemy shots in their own colour, phase that reads like
// Pac-Man, a reticle while firing, and the power's arc under the core.
import { open } from './cdp.mjs';
const t = await open({ out: process.argv[2], port: 9373, url: 'http://127.0.0.1:5173/?fullres', width: 844, height: 390, dsf: 1 });
const { evaluate, shot, check, sleep, G } = t;

// A calm core in the run, nothing arriving, no level-up cards, can't die.
const setup = (trait, mode) => evaluate(`(() => { const s = ${G}; s.traits = { hard: 0, calm: 0, rage: 0, ${trait}: 3 }; s.lastTrait = '${trait}'; s.endTutorial('${mode === 'hell' ? 'killed' : 'absorbed'}'); s.traits = { hard: 0, calm: 0, rage: 0, ${trait}: 3 }; s.lastTrait = '${trait}';
  s.spawnTimer = 1e9; s.fireCooldown = 1e9; s.abilityCooldown = 0; s.rescued = true; s.level = 40; s.stats.maxHp = s.hp = 1e9; return true; })()`);
const near = (n) => evaluate(`(() => { const s = ${G}; for (let i = 0; i < ${n}; i++) s.spawnEnemy(); s.enemies.getChildren().filter(e => e.active).forEach((e, i) => { e.setPosition(s.player.x + Math.cos(i * 1.6) * 130, s.player.y + Math.sin(i * 1.6) * 130); e.setData({ hp: 20, speed: 70, tag: i }); }); return true; })()`);

// ---- 1. Enemy shots: magenta, nothing like the red-orange embers that fire them.
await setup('hard', 'hell'); await sleep(400);
const colours = await evaluate(`(() => { const S = 4;
  const px = (key, x, y) => { const c = game.textures.get(key).getSourceImage().getContext('2d'); return Array.from(c.getImageData(x * S, y * S, 1, 1).data); };
  return { shot: px('enemy-shot', 8 + 2.5, 8), shotHaze: px('enemy-shot', 8 + 5.5, 8), ember: px('enemy', 16 + 11, 16) }; })()`);
const magenta = ([r, g, b]) => r > 180 && b > 150 && g < r * 0.7;
check('an enemy shot is magenta, centre and haze', magenta(colours.shot) && magenta(colours.shotHaze), colours);
check('an ember is not (red-orange, no blue)', colours.ember[2] < 80, colours);
const fired = await evaluate(`(() => { const s = ${G}; s.spawnEnemy(); const e = s.enemies.getChildren().find(o => o.active); e.setPosition(s.player.x + 200, s.player.y); e.setData('shootCd', 0); s.enemiesShoot(0.016);
  const b = s.enemyBullets.getChildren().find(o => o.active); return b && b.texture.key; })()`);
check('enemies fire with it', fired === 'enemy-shot', fired);
await sleep(250); await shot('enemy-shot.png');

// ---- 7. The reticle, in bullet hell: nothing while you aren't aiming.
await evaluate(`(() => { const s = ${G}; s.enemyBullets.getChildren().forEach(b => b.disableBody(true, true)); s.enemies.getChildren().forEach(e => e.disableBody(true, true)); return true; })()`);
await sleep(400);
check('bullet hell, not aiming: no reticle', await evaluate(`${G}.reticleAlpha < 0.05 && ${G}.reticle.commandBuffer.length === 0`));

// ---- 6. Phase, the Pac-Man way.
await evaluate(`${G}.scene.restart({})`); await sleep(1300);
await setup('calm', 'heaven'); await near(4); await sleep(300);
await evaluate(`${G}.useAbility()`); await sleep(500);
let look = await evaluate(`(() => { const s = ${G}; return s.enemies.getChildren().filter(e => e.active).map(e => ({ charmed: !!e.getData('charmed'), key: e.texture.key, fill: e.tintFill })); })()`);
check('phasing turns the four nearby blue', look.length === 4 && look.every((e) => e.charmed && e.key === 'enemy-charmed' && !e.fill), look);
check('the core wears a blue outline', await evaluate(`${G}.charmEdge.commandBuffer.length > 0`));
check('and the power arc shows under it', await evaluate(`${G}.powerArc.commandBuffer.length > 0`));
await shot('charmed.png');

// In the last 1.5 s a charmed one blinks white; before that, never.
const blinks = await evaluate(`new Promise(r => { const s = ${G}; const e = s.enemies.getChildren().find(o => o.active && o.getData('tag') === 1); const seen = { early: 0, white: 0, blue: 0 }; let n = 0;
  s.enemies.getChildren().filter(o => o.active && o.getData('charmed')).forEach(o => o.setData('lost', 6)); e.setData('lost', 3); const f = () => { const left = e.getData('lost');
    if (left > 1.6 && e.tintFill) seen.early++; if (left < 1.4 && left > 0.2) { if (e.tintFill) seen.white++; else seen.blue++; }
    if (left > 0.25 && ++n < 400) requestAnimationFrame(f); else r(seen); }; requestAnimationFrame(f); })`);
check('in its last moments a charmed enemy blinks white, and not before', blinks.early === 0 && blinks.white > 2 && blinks.blue > 2, blinks);

// Take one in: it is drawn into the core, shrinking, and the core gulps.
const taken = await evaluate(`new Promise(r => { const s = ${G}; const e = s.enemies.getChildren().find(o => o.active && o.getData('tag') === 0); const base = s.player.scaleX; const start = Math.hypot(e.x - s.player.x, e.y - s.player.y);
  e.setPosition(s.player.x + 20, s.player.y); const out = { minScale: 1, maxCore: 0, closest: 99, start: Math.round(start) }; let n = 0, after = -1;
  const f = () => { if (e.active) { out.minScale = Math.min(out.minScale, e.scaleX / e.getData('absorbScale') || 1); out.closest = Math.min(out.closest, Math.hypot(e.x - s.player.x, e.y - s.player.y)); }
    else if (after < 0) after = performance.now();
    out.maxCore = Math.max(out.maxCore, s.player.scaleX / base);
    if ((after < 0 || performance.now() - after < 700) && ++n < 600) requestAnimationFrame(f); else { out.closest = Math.round(out.closest); out.maxCore = +out.maxCore.toFixed(2); out.minScale = +out.minScale.toFixed(2); out.gone = !e.active; out.settled = +(s.player.scaleX / base).toFixed(3); r(out); } };
  requestAnimationFrame(f); })`);
check('touching a charmed one takes it in', taken.gone, taken);
check('it is drawn into the middle of the core, shrinking as it goes', taken.closest < 8 && taken.minScale < 0.7, taken);
check('the core swells for a moment as it goes in (a gulp), then settles', taken.maxCore > 1.15 && Math.abs(taken.settled - 1) < 0.01, taken);

// Once you've started taking one in, the charm can't run out on you.
const held = await evaluate(`new Promise(r => { const s = ${G}; const e = s.enemies.getChildren().find(o => o.active && o.getData('tag') === 2); e.setData({ lost: 0.03, absorb: 0.2, absorbScale: e.scaleX }); let n = 0, wasCharmed = true;
  e.setPosition(s.player.x + 10, s.player.y); const f = () => { if (e.active && !e.getData('charmed')) wasCharmed = false; if (e.active && ++n < 200) requestAnimationFrame(f); else r({ gone: !e.active, wasCharmed }); }; requestAnimationFrame(f); })`);
check('one half taken in stays charmed until it is in', held.gone && held.wasCharmed, held);

// A shot breaks the charm: back to an ember, full size.
const broke = await evaluate(`(() => { const s = ${G}; const e = s.enemies.getChildren().find(o => o.active && o.getData('tag') === 3); const full = e.scaleX; e.setData({ absorb: 0.4, absorbScale: full }); e.setScale(full * 0.7); s.strike(e, 1);
  return { key: e.texture.key, charmed: !!e.getData('charmed'), scale: e.scaleX === full }; })()`);
check('a shot breaks the charm: an ember again, at full size', broke.key === 'enemy' && !broke.charmed && broke.scale, broke);

// When nothing is charmed and the phase is over, the outline goes; the arc keeps filling until the power is ready, then fades.
await evaluate(`(() => { const s = ${G}; s.enemies.getChildren().forEach(e => { if (e.getData('charmed')) s.uncharm(e); }); s.phaseLeft = 0; s.abilityCooldown = 2; s.abilityCooldownFull = 4; return true; })()`);
await sleep(200);
check('no charm, no phase: no outline', await evaluate(`${G}.charmEdge.commandBuffer.length === 0`));
check('recharging: the arc shows', await evaluate(`${G}.powerArc.commandBuffer.length > 0 && ${G}.abilityCooldown > 0`));
await evaluate(`${G}.abilityCooldown = 0`); await sleep(1100);
check('ready: it fades away', await evaluate(`${G}.powerArc.commandBuffer.length === 0`));

// ---- 7. The reticle, in bullet heaven: it sits on whatever auto-aim picked, and goes when there's nothing to shoot.
await evaluate(`(() => { const s = ${G}; s.enemies.getChildren().forEach(e => e.disableBody(true, true)); s.spawnEnemy(); const e = s.enemies.getChildren().find(o => o.active); e.setPosition(s.player.x + 150, s.player.y + 40); e.setData({ speed: 0, hp: 1e9, tag: 7 }); return true; })()`);
await sleep(500);
const ret = await evaluate(`(() => { const s = ${G}; const e = s.enemies.getChildren().find(o => o.active && o.getData('tag') === 7); return { off: Math.round(Math.hypot(s.reticleAt.x - e.x, s.reticleAt.y - e.y)), alpha: +s.reticleAlpha.toFixed(2), drawn: s.reticle.commandBuffer.length > 0 }; })()`);
check('heaven: a reticle sits on the enemy being shot', ret.drawn && ret.alpha > 0.9 && ret.off < 6, ret);
await shot('reticle.png');
await evaluate(`(() => { const s = ${G}; s.enemies.getChildren().forEach(e => e.disableBody(true, true)); return true; })()`);
await sleep(500);
check('nothing to shoot: the reticle is gone', await evaluate(`${G}.reticleAlpha < 0.05 && ${G}.reticle.commandBuffer.length === 0`));

// ---- 2. Brace: the arc drains while it runs.
await evaluate(`${G}.scene.restart({})`); await sleep(1300);
await setup('hard', 'heaven'); await sleep(300);
await evaluate(`${G}.useAbility()`);
const drain = await evaluate(`new Promise(r => { const s = ${G}; const full = s.powerFull; setTimeout(() => r({ full: +full.toFixed(2), left: +s.braceLeft.toFixed(2), drawn: s.powerArc.commandBuffer.length > 0 }), 300); })`);
check('brace: the arc drains from its full length', drain.drawn && drain.full > 0 && drain.left < drain.full && drain.left > 0, drain);
await shot('brace-arc.png');
t.done();
