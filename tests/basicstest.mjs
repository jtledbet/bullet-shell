import { open } from './cdp.mjs';
const t = await open({ out: process.argv[2], port: 9344, url: 'http://127.0.0.1:5173/?fullres', dsf: 2 });
const { evaluate, shot, press, click, check, sleep, G, U, uiPoint, menuTexts, uiTexts } = t;
const bg = () => evaluate(`game.config.backgroundColor.color`);
const setLabels = (on) => evaluate(`import('/src/storage.ts').then(m => { m.setLabels(${on}); return true; })`);

// --- Nudges for a player who has done nothing.
check('orientation: the measured room, ruled with the grid, no stars', (await bg()) === 0x0b1222 && (await evaluate(`${G}.grid.visible`)) && (await evaluate(`${G}.stars === undefined`)), await bg());
// One curious seed, so the run is the same every time; hold the idle clock still until the first hint has gone.
await evaluate(`(() => { const s = ${G}; s.enemies.getChildren().forEach(e => e.disableBody(true, true)); s.spawnSeed('curious', s.player.x + 260, s.player.y, 0); })()`);
for (let i = 0; i < 40 && (await uiTexts()).some((x) => x.includes('wasd')); i++) { await evaluate(`${G}.idleTime = 0`); await sleep(250); }
check('control hint gone after 6s', !(await uiTexts()).some((x) => x.includes('wasd')), await uiTexts());
await evaluate(`${G}.idleTime = 7.9`); await sleep(1500);
check('nudge 1: control hint comes back', (await uiTexts()).some((x) => x.includes('wasd')) && (await evaluate(`${G}.nudges`)) === 1, await uiTexts());
await evaluate(`(() => { const e = ${G}.enemies.getChildren().find(o => o.active); window.__s0 = e.scaleX; ${G}.idleTime = 15.95; })()`);
const peak = await evaluate(`new Promise(r => { let top = 0, n = 0; const f = () => { const e = ${G}.enemies.getChildren().find(o => o.active); top = Math.max(top, e.scaleX / window.__s0); if (++n < 40) requestAnimationFrame(f); else r(top); }; requestAnimationFrame(f); })`);
check('nudge 2: the seed pulses once', peak > 1.15 && (await evaluate(`${G}.nudges`)) === 2, { peak });
await evaluate(`${G}.idleTime = 21.95`); await sleep(1300);
check('nudge 3: one word under the core', (await uiTexts()).includes('move'), await uiTexts());
await shot('nudge-word.png');
// --- Moving stops nudges for good.
await press('d', 'KeyD', 68, 150);
await evaluate(`${G}.scene.restart({})`); await sleep(1200);
await evaluate(`${G}.idleTime = 7.9`); await sleep(600);
check('after any input: no more nudges, even next run', (await evaluate(`${G}.nudges`)) === 0);

// --- The run: backdrop, grid, shots.
await evaluate(`(() => { const s = ${G}; s.traits.rage = 2; s.lastTrait = 'rage'; s.endTutorial('absorbed'); s.stats.maxHp = s.hp = 1e9; })()`); await sleep(1600);
const g = await evaluate(`({ bg: game.config.backgroundColor.color, vis: ${G}.grid.visible, alpha: ${G}.grid.alpha, stars: ${G}.stars === undefined ? 'none' : 'some' })`);
check('run: the same ruled room, the grid stays, no stars', g.bg === 0x0b1222 && g.vis && g.alpha === 1 && g.stars === 'none', g);
await evaluate(`(() => { const s = ${G}; s.shoot(0.7, 300, 3, false); s.shoot(-2.2, 300, 3, true); })()`); await sleep(120);
const shots = await evaluate(`${G}.bullets.getChildren().filter(b => b.active).map(b => ({ key: b.texture.key, rot: +b.rotation.toFixed(2), off: +Math.hypot(b.body.center.x - b.x, b.body.center.y - b.y).toFixed(2), add: b.blendMode === 1 }))`);
check('bolt and spark: textured, turned to face their flight, body on the head', shots.length === 2 && shots[0].key === 'bolt' && shots[1].key === 'spark' && shots[0].rot === 0.7 && shots[1].rot === -2.2 && shots.every((b) => b.off < 1 && b.add), shots);
await evaluate(`(() => { const s = ${G}; for (let i = 0; i < 10; i++) s.shoot(i * 0.63, 60, 5, i % 2 === 0); s.mode = 'hell'; for (let i = 0; i < 6; i++) s.spawnEnemy(); s.enemies.getChildren().filter(e => e.active).forEach((e, i) => { e.setPosition(s.player.x + Math.cos(i) * 170, s.player.y + Math.sin(i) * 110); e.setData('shootCd', 0); e.setData('speed', 0); }); })()`); await sleep(700);
const es = await evaluate(`${G}.enemyBullets.getChildren().filter(b => b.active).map(b => b.texture.key)`);
check('enemy shots wear their own magenta, not ember colours', es.length >= 3 && es.every((k) => k === 'enemy-shot'), es);
await shot('ammo.png');

// --- Power: ring, caption with labels on; phasing makes enemies lose you.
await evaluate(`(() => { const s = ${G}; s.enemyBullets.getChildren().forEach(b => b.disableBody(true, true)); s.mode = 'heaven'; })()`);
await setLabels(true); await sleep(300);
const cap = await evaluate(`({ vis: ${U}.abilityCaption.visible, text: ${U}.abilityCaption.text })`);
check('labels on: power named beside its button', cap.vis && cap.text === 'burst', cap);
const jitter = await evaluate(`new Promise(r => { const xs = new Set(); let n = 0; const f = () => { xs.add(${U}.ability.x.toFixed(2)); if (++n < 12) requestAnimationFrame(f); else r(xs.size); }; requestAnimationFrame(f); })`);
check('rage button trembles when ready', jitter > 3, jitter);
await evaluate(`${G}.useAbility()`); await sleep(120);
check('using it: a ring and its name', (await evaluate(`${G}.powerFx.commandBuffer.length`)) > 0 && (await uiTexts()).filter((x) => x === 'burst').length === 2, await uiTexts());
await shot('power.png');
// No new arrivals: one spawned this frame stands still until the next, which would read as not chasing.
await evaluate(`(() => { const s = ${G}; s.traits = { hard: 0, calm: 3, rage: 0 }; s.lastTrait = 'calm'; s.abilityCooldown = 0; s.fireCooldown = 1e9; s.spawnTimer = 1e9; s.bullets.getChildren().forEach(b => b.disableBody(true, true)); s.enemies.getChildren().filter(e => e.active).forEach(e => { e.setData('speed', 90); e.setData('hp', 1e9); }); })()`); await sleep(300);
const off = () => evaluate(`(() => { const s = ${G}; return s.enemies.getChildren().filter(e => e.active).map(e => { const a = Math.atan2(e.body.velocity.y, e.body.velocity.x) - Math.atan2(s.player.y - e.y, s.player.x - e.x); return +Math.abs(Math.atan2(Math.sin(a), Math.cos(a))).toFixed(2); }); })()`);
const offDetail = () => evaluate(`(() => { const s = ${G}; return s.enemies.getChildren().filter(e => e.active).map(e => { const a = Math.atan2(e.body.velocity.y, e.body.velocity.x) - Math.atan2(s.player.y - e.y, s.player.x - e.x); const off = Math.abs(Math.atan2(Math.sin(a), Math.cos(a))); return off < 0.05 ? null : { off: +off.toFixed(2), mood: e.getData('mood'), knock: +(+e.getData('knock')).toFixed(2), lost: e.getData('lost'), nosy: e.getData('nosy'), sulk: e.getData('sulk'), speed: Math.round(Math.hypot(e.body.velocity.x, e.body.velocity.y)), d: Math.round(Math.hypot(s.player.x - e.x, s.player.y - e.y)) }; }).filter(Boolean); })()`);
check('enemies chase you normally', (await off()).every((a) => a < 0.05), await offDetail());
// Gather them within reach first: how many have arrived by now depends on spawn timing.
await evaluate(`(() => { const s = ${G}; s.enemies.getChildren().filter(e => e.active).forEach((e, i) => e.setPosition(s.player.x + Math.cos(i) * 150, s.player.y + Math.sin(i) * 150)); s.useAbility(); s.player.y += 260; })()`); await sleep(400);
const lost = await off();
check('while you phase, the ones nearby are charmed', (await evaluate(`${G}.phaseLeft`)) > 0 && (await evaluate(`${G}.enemies.getChildren().filter(e => e.active && e.getData('charmed')).length`)) >= 6, { lost, elapsed: await evaluate(`${G}.elapsed`), charmed: await evaluate(`${G}.enemies.getChildren().filter(e => e.active && e.getData('charmed')).length`) });
await sleep(5600);
check('and find you again after', (await off()).every((a) => a < 0.6), await off());

// --- First upgrade at 3 gems.
check('first level-up needs 3, the second 14', (await evaluate(`${G}.xpToNext()`)) === 3 && (await evaluate(`(() => { const s = ${G}; s.level = 2; const n = s.xpToNext(); s.level = 1; return n; })()`)) === 14);

// --- Pause: resume sits where the pause button is.
const pb = await uiPoint(`u.pauseBtn`);
await click(pb.x, pb.y); await sleep(700);
check('tap pause: paused', await evaluate(`${G}.paused`), pb);
await shot('pause.png');
check('pause offers "reorient", not "restart"', (await menuTexts()).includes('reorient') && !(await menuTexts()).includes('restart'), await menuTexts());
check('labels on, no ?dev: the version shows, the speed readout does not', !(await menuTexts()).some((x) => / fps /.test(x)) && (await menuTexts()).some((x) => /^v\d+\.\d+\.\d+(-\w+)? /.test(x)), (await menuTexts()).slice(-3));
await click(pb.x, pb.y); await sleep(400);
check('tap the same spot again: resumed', !(await evaluate(`${G}.paused`)));

// --- Game over: again (same core, no orientation) and reorient.
await evaluate(`(() => { const s = ${G}; s.traits = { hard: 0, calm: 0, rage: 2 }; s.outcome.traits = { ...s.traits }; s.gameOver(); })()`); await sleep(700);
const over = await menuTexts();
check('game over offers "again" and "reorient"', over.includes('again') && over.includes('reorient') && over.includes('exit to site'), over);
await shot('gameover.png');
const again = await uiPoint(`u.menu.list.find(o => o.type === 'Text' && o.text === 'again')`);
await click(again.x, again.y); await sleep(1500);
const st = await evaluate(`(() => { const s = ${G}; return { tutorial: s.tutorial, mode: s.mode, traits: { ...s.traits }, grid: s.grid.visible, bg: game.config.backgroundColor.color, hp: s.hp, hud: ${U}.hud.alpha }; })()`);
check('"again": straight into the run as the same core', !st.tutorial && st.traits.rage === 2 && st.grid && st.bg === 0x0b1222 && st.hp === 100 && st.hud === 1, st);
await evaluate(`${G}.scene.restart({})`); await sleep(1200);
check('a plain restart goes back to orientation', (await evaluate(`${G}.tutorial`)) && (await bg()) === 0x0b1222);
await setLabels(false);
t.done();
