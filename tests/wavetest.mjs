import { open } from './cdp.mjs';
const out = process.argv[2];
// --- Desktop: balance, merging gems, the lull between waves, and the minimap.
const t = await open({ out: out + '-desktop', port: 9362, url: 'http://127.0.0.1:5173/?fullres', width: 844, height: 390, dsf: 1 });
{
  const { evaluate, shot, check, sleep, press, mouse, G, U, uiPoint } = t;
  // Unlock sound, so the hum can be heard resting.
  for (let i = 0; i < 20 && (await evaluate(`audioDebug().state`)) !== 'running'; i++) { await press('a', 'KeyA', 65); await sleep(400); }
  await evaluate(`(() => { const s = ${G}; s.traits = { hard: 0, calm: 0, rage: 0 }; s.endTutorial('absorbed'); s.traits = { hard: 0, calm: 0, rage: 0 }; s.spawnTimer = 1e9; s.fireCooldown = 1e9; s.rescued = true; return true; })()`);
  await sleep(600);

  // ---- Balance: hits grow with the run, healing has a ceiling, cards add rather than multiply, levels come slower.
  const hits = await evaluate(`(() => { const s = ${G}; const at = (t) => { s.elapsed = t; return +s.hitDamage().toFixed(2); }; const r = [at(0), at(240), at(900)]; s.elapsed = 480; s.invuln = 0; s.hp = 100; s.onPlayerHit(); r.push(+s.hp.toFixed(2)); s.elapsed = 5; s.hp = 100; s.invuln = 0; return r; })()`);
  check('a hit does 10 at the start, 20 at four minutes, 47.5 at fifteen', hits[0] === 10 && hits[1] === 20 && hits[2] === 47.5, hits);
  check('and a real hit at eight minutes takes 30', hits[3] === 70, hits);
  const cards = await evaluate(`import('/src/upgrades.ts').then(m => { const s = m.baseStats(); const card = (n) => m.UPGRADES.find(u => u.name === n); for (let i = 0; i < 2; i++) { card('Heavy Rounds').apply(s, { heal() {} }); card('Quick Trigger').apply(s, { heal() {} }); } return { damage: +s.damage.toFixed(3), fireRate: +s.fireRate.toFixed(3) }; })`);
  check('two Heavy Rounds add half the starting damage each (2.8, not 3.15)', cards.damage === 2.8, cards);
  check('two Quick Triggers add a quarter of the starting rate each (4.5)', cards.fireRate === 4.5, cards);
  const lv = await evaluate(`(() => { const s = ${G}; const was = s.level; s.level = 10; const need = s.xpToNext(); s.level = 11; const dmg = +(s.shotDamage() / s.stats.damage).toFixed(3); s.level = was; return { need, dmg }; })()`);
  check('level 10 needs 158 gems (it was 111)', lv.need === 158, lv);
  check('each level adds 4% to shot damage', lv.dmg === 1.4, lv);
  const tough = await evaluate(`(() => { const s = ${G}; s.enemies.getChildren().forEach(e => e.disableBody(true, true)); s.elapsed = 900; for (let i = 0; i < 30; i++) s.spawnEnemy(); const hs = s.enemies.getChildren().filter(e => e.active).map(e => e.getData('hp')); s.enemies.getChildren().forEach(e => e.disableBody(true, true)); s.elapsed = 5; return { lo: Math.min(...hs), hi: Math.max(...hs) }; })()`);
  // (3 + 900/25) * 1.03^30 = 94.7, times a spread of 0.75 to 1.35.
  check('at fifteen minutes enemies are 2.4 times tougher than before', tough.lo >= 94.6 * 0.75 && tough.hi <= 94.8 * 1.35 && tough.hi > 94.7, tough);
  await evaluate(`(() => { const s = ${G}; s.stats.leech = 1; s.hp = 50; return true; })()`);
  await sleep(1500);
  const leech = await evaluate(`(() => { const s = ${G}; const real = Math.random; Math.random = () => 0.99; const before = s.hp; for (let i = 0; i < 6; i++) { s.spawnEnemy(); const e = s.enemies.getChildren().find(o => o.active); e.setData('hp', 1); s.strike(e, 1); } Math.random = real; return { got: +(s.hp - before).toFixed(2) }; })()`);
  check('Siphon: six kills at once give back 2, not 6', leech.got === 2, leech);
  await evaluate(`(() => { const s = ${G}; s.stats.leech = 0; s.hp = 100; return true; })()`);

  // ---- Gems: once the ground is full, new ones merge into the oldest out of sight. Nothing is lost.
  const merge = await evaluate(`(() => { const s = ${G}; s.gems.getChildren().forEach(g => g.disableBody(true, true));
    for (let i = 0; i < 600; i++) s.dropGem(s.player.x + 3000 + (i % 30) * 20, s.player.y + Math.floor(i / 30) * 20);
    const first = s.gems.getChildren().find(g => g.active);
    for (let i = 0; i < 10; i++) s.dropGem(s.player.x + 50, s.player.y);
    const act = s.gems.getChildren().filter(g => g.active);
    return { active: act.length, total: act.reduce((n, g) => n + g.getData('worth'), 0), firstWorth: first.getData('worth'), bigger: first.scaleX > act[1].scaleX, add: first.blendMode === Phaser.BlendModes.ADD }; })()`);
  check('the ground still holds 600, and the 10 extra are not lost', merge.active === 600 && merge.total === 610, merge);
  check('they went into the oldest one, which grew and brightened', merge.firstWorth === 11 && merge.bigger && merge.add, merge);
  const pick = await evaluate(`(() => { const s = ${G}; s.level = 30; s.xp = 0; const g = s.gems.getChildren().find(o => o.active && o.getData('worth') === 11); s.onGem(g); const r = s.xp; s.level = 1; s.xp = 0; return r; })()`);
  check('picking it up gives all 11', pick === 11, pick);
  await evaluate(`${G}.gems.getChildren().forEach(g => g.disableBody(true, true))`);

  // ---- Waves: a minute of enemies, then ten seconds where none come.
  const lulls = await evaluate(`(() => { const s = ${G}; const at = (t) => { s.elapsed = t; return s.inLull(); }; const r = [59, 61, 69.9, 70.5, 131, 141].map(at); s.elapsed = 5; return r; })()`);
  check('lulls come at 60-70 s, 130-140 s, and so on', JSON.stringify(lulls) === '[false,true,true,false,true,false]', lulls);
  const humIn = async () => (await evaluate(`audioDebug().music.hum`));
  check('the hum plays during a wave', await humIn(), await evaluate(`audioDebug()`));
  await evaluate(`(() => { const s = ${G}; s.enemies.getChildren().forEach(e => e.disableBody(true, true)); for (let i = 0; i < 6; i++) s.spawnEnemy();
    s.enemies.getChildren().filter(e => e.active).forEach((e, i) => { const near = i < 3; e.setPosition(s.player.x + (near ? 60 + i * 40 : 2500 + i * 100), s.player.y + (near ? -80 : 0)); e.setData('speed', 0); e.setData('hp', 1e9); e.setData('tag', near ? 'near' : 'far'); });
    s.dropGem(s.player.x + 200, s.player.y + 60); window.__g = s.gems.getChildren().find(g => g.active); window.__g0 = Math.hypot(window.__g.x - s.player.x, window.__g.y - s.player.y);
    s.spawnTimer = 0; s.elapsed = 60.2; s.stats.maxHp = s.hp = 1e9; return true; })()`);
  await sleep(300);
  check('in a lull the hum rests', !(await humIn()));
  const pulled = await evaluate(`Math.hypot(window.__g.x - ${G}.player.x, window.__g.y - ${G}.player.y) < window.__g0 - 20 || !window.__g.active`);
  check('and gems drift in from three times as far', pulled);
  await sleep(3500);
  const left = await evaluate(`(() => { const s = ${G}; const es = s.enemies.getChildren().filter(e => e.active); return { near: es.filter(e => e.getData('tag') === 'near').length, far: es.filter(e => e.getData('tag') === 'far').length, all: es.length, lull: s.inLull(), elapsed: +s.elapsed.toFixed(1) }; })()`);
  check('nothing new arrives', left.all === left.near + left.far, left);
  check('the ones out of sight drift off; the ones on screen stay', left.near === 3 && left.far === 0 && left.lull, left);
  await shot('lull.png');
  await evaluate(`${G}.elapsed = 69.7`); await sleep(900);
  check('when the next wave starts the hum comes back', await humIn());
  check('and so do enemies', (await evaluate(`${G}.enemies.countActive()`)) > 3);

  // ---- The gem radar: while no gem is on screen, an arrow at the edge points to the nearest one.
  await evaluate(`(() => { const s = ${G}; s.gems.getChildren().forEach(g => g.disableBody(true, true)); s.dropGem(s.player.x + 3000, s.player.y); return true; })()`); await sleep(300);
  const arrow = await evaluate(`(() => { const a = ${G}.hudState().gemArrow; return { angle: a && +a.angle.toFixed(2), drawn: ${U}.radar.commandBuffer.length }; })()`);
  check('radar: with no gem on screen, an arrow points to the nearest one', arrow.angle === 0 && arrow.drawn > 0, arrow);
  await shot('radar.png');
  const seen = await evaluate(`(() => { const s = ${G}; const v = s.cameras.main.worldView; const x = s.player.x + v.width * 0.4; s.dropGem(x, s.player.y); return v.contains(x, s.player.y); })()`); await sleep(300);
  check('radar: hidden while a gem is on screen', seen && (await evaluate(`${U}.radar.commandBuffer.length`)) === 0 && (await evaluate(`${G}.hudState().gemArrow`)) === null, { seen });

  // ---- The minimap, beside the radar.
  await evaluate(`(() => { const s = ${G}; s.enemies.getChildren().forEach(e => e.disableBody(true, true)); s.spawnTimer = 1e9; s.elapsed = 20;
    for (let i = 0; i < 40; i++) { s.spawnEnemy(); const e = s.enemies.getChildren().filter(o => o.active).pop(); const a = i * 0.7, d = 200 + i * 25; e.setPosition(s.player.x + Math.cos(a) * d, s.player.y + Math.sin(a) * d); e.setData('speed', 0); }
    for (let i = 0; i < 12; i++) s.dropGem(s.player.x - 400 + i * 30, s.player.y + 500);
    s.dropGem(s.player.x + 5000, s.player.y); s.dropMote(s.player.x + 300, s.player.y - 300); return true; })()`);
  await sleep(400);
  const cx = 844 - 32 - 44, cy = 32 + 50 + 44;
  const rimDot = await evaluate(`(() => { const b = ${U}.map.commandBuffer; for (let i = 0; i < b.length - 1; i++) if (Math.abs(b[i] - ${cx + 41 - 1.5}) < 0.6 && Math.abs(b[i + 1] - ${cy - 1.5}) < 0.6) return true; return false; })()`);
  check('a gem far beyond its reach shows on its rim, pointing the way', rimDot);
  await shot('minimap.png');
  const m = await uiPoint(`({ x: ${cx}, y: ${cy} })`);
  await mouse('mouseMoved', m.x, m.y, 'none'); await sleep(250);
  check('on desktop it explains itself', (await evaluate(`${U}.tipBox ? ${U}.tipBox.list.find(o => o.type === 'Text').text : ''`)).startsWith('a map of what is around you'));
}
// --- Phone: run in a separate process, since each harness ends its own process when done.
const { spawnSync } = await import('node:child_process');
const r = spawnSync(process.execPath, [new URL('./wavephone.mjs', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), out + '-phone'], { encoding: 'utf-8' });
process.stdout.write(r.stdout + r.stderr);
t.done();
