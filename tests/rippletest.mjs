// The wave grid (Max, 2026-11-25, the double-slit idea, step 2): explosives send rings through the grid
// that bend the lines and settle. Visual only. Without WebGL (or with ?plaingrid) it's the plain grid.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { open } from './cdp.mjs';

const LINE = { r: 0x1e, g: 0x29, b: 0x3b };
const FIELD = { r: 0x0b, g: 0x12, b: 0x22 };
const near = (c, want) => Math.abs(c.r - want.r) <= 3 && Math.abs(c.g - want.g) <= 3 && Math.abs(c.b - want.b) <= 3;

const run = async (plain) => {
  const tag = plain ? 'plain grid:' : 'wave grid:';
  const t = await open({ out: process.argv[2] + (plain ? '-plain' : ''), port: plain ? 9379 : 9378, url: `http://127.0.0.1:5173/?fullres${plain ? '&plaingrid' : ''}`, width: 844, height: 390, dsf: 2 });
  const { evaluate, shot, check, sleep, G } = t;
  await evaluate(`(() => { const s = ${G}; s.endTutorial('absorbed'); s.spawnTimer = 1e9; s.fireCooldown = 1e9; s.stats.maxHp = s.hp = 1e9; s.enemies.getChildren().forEach(e => e.disableBody(true, true)); return true; })()`);
  await sleep(1200);
  // Hold the world still (it keeps drawing) so pixels can be read; place the grid by hand after each change.
  await evaluate(`(() => { const s = ${G}; s.scene.pause(); s.gridKick = 0; s.grid.clear(); s.followGrid(0); return true; })()`);
  await sleep(200);
  // A spot on an up-and-down line (its middle is half a pixel right of its coordinate, as Phaser draws plain lines), a little left of and below the core, in the middle of a row, and a spot mid-cell beside it.
  // (Worked out again whenever the world has run: the camera's zoom eases, and it glides after the core even
  // while the world is held, so wait until it has come to rest.)
  const view = () => evaluate(`(() => { const v = ${G}.cameras.main.worldView; return v.x + ',' + v.y + ',' + v.width; })()`);
  const settle = async () => { let a = await view(); for (let i = 0; i < 30; i++) { await sleep(150); const b = await view(); if (b === a) return; a = b; } };
  const where = async () => { await settle(); return place(); };
  const place = () => evaluate(`(() => { const s = ${G}, c = s.cameras.main, v = c.worldView; const X = Math.round((s.player.x - 128) / 64) * 64, Y = Math.floor((s.player.y + 60) / 64) * 64 + 32;
    const px = (wx, wy) => ({ x: Math.floor((wx - v.x) * c.zoom), y: Math.floor((wy - v.y) * c.zoom) }); return { X, Y, line: px(X + 0.5, Y), cell: px(X + 32, Y), zoom: c.zoom }; })()`);
  let spot = await where();
  const pixel = (p) => evaluate(`new Promise(r => game.renderer.snapshotPixel(${p.x}, ${p.y}, c => r({ r: c.r, g: c.g, b: c.b })))`);
  // Nine pixels across the line's spot: a line is there if one of them is its colour (lines are 2 to 3 px wide here,
  // and where exactly they fall inside a pixel varies), and gone if all nine are navy.
  const row = async (p) => { const out = []; for (let dx = -4; dx <= 4; dx++) out.push(await pixel({ x: p.x + dx, y: p.y })); return out; };
  const hasLine = (r) => r.some((c) => near(c, LINE));
  const noLine = (r) => r.every((c) => near(c, FIELD));
  const reds = (r) => r.map((c) => c.r).join(' ');
  const calm = { line: await row(spot.line), cell: await pixel(spot.cell) };
  check(`${tag} with nothing going off, the same 1 px slate lines on navy`, hasLine(calm.line) && near(calm.cell, FIELD), { line: reds(calm.line), cell: calm.cell, spot });

  if (plain) {
    const p = await evaluate(`(() => { const s = ${G}; s.burst(); s.clearScreen(); s.followGrid(0); return { type: s.grid.view.type, shader: s.grid.shader, waves: s.grid.waves, rings: s.grid.rings.length }; })()`);
    check(`${tag} plain lines, no shader, and blasts start no rings`, p.type === 'Graphics' && p.shader === null && !p.waves && p.rings === 0, p);
    t.done();
    return;
  }

  const kinds = await evaluate(`import('/src/wavegrid.ts').then(m => ({ ripples: m.RIPPLES, max: m.MAX_RINGS }))`);
  const shown = () => evaluate(`({ view: ${G}.grid.view.type, lines: ${G}.grid.lines.visible, shader: ${G}.grid.shader.visible, waves: ${G}.grid.waves })`);
  let sh = await shown();
  check(`${tag} at rest: the plain lines, the shader off (it costs nothing)`, sh.waves && sh.view === 'Graphics' && sh.lines && !sh.shader, sh);

  // ---- The four events, each with its own ring, and the background jolt kept.
  const last = `(() => { const r = ${G}.grid.rings[${G}.grid.rings.length - 1]; return r ? { x: Math.round(r.x), y: Math.round(r.y), strength: r.strength, age: r.age } : null; })()`;
  const event = async (code) => {
    await evaluate(`(() => { const s = ${G}; s.grid.clear(); s.gridKick = 0; ${code}; return true; })()`);
    return { ring: await evaluate(last), rings: await evaluate(`${G}.grid.rings.length`), kick: await evaluate(`${G}.gridKick > 0`), p: await evaluate(`({ x: Math.round(${G}.player.x), y: Math.round(${G}.player.y) })`) };
  };
  let e = await event(`s.burstFlare({ active: true, x: s.player.x + 150, y: s.player.y - 40, disableBody() {} })`);
  check(`${tag} a flare goes off: a flare ring where it burst, and the jolt`, e.rings === 1 && e.ring.strength === kinds.ripples.flare.strength && e.ring.x === e.p.x + 150 && e.ring.y === e.p.y - 40 && e.kick, e);
  e = await event(`s.burst()`);
  check(`${tag} rage's burst: a bigger ring out from the core, and the jolt`, e.rings === 1 && e.ring.strength === kinds.ripples.burst.strength && e.ring.x === e.p.x && e.ring.y === e.p.y && e.kick, e);
  e = await event(`s.clearScreen()`);
  check(`${tag} the screen clear: the biggest ring, out from the core`, e.rings === 1 && e.ring.strength === kinds.ripples.clear.strength && e.ring.x === e.p.x && e.ring.y === e.p.y, e);
  e = await event(`s.impactBlast = -1; s.blastImpact(77, s.player.x + 90, s.player.y); s.blastImpact(77, s.player.x + 120, s.player.y); s.hitStop = 0; s.physics.resume()`);
  check(`${tag} a shotgun blast's first hit: one small ring where it hit, and the jolt`, e.rings === 1 && e.ring.strength === kinds.ripples.shot.strength && e.ring.x === e.p.x + 90 && e.kick, e);
  const sizes = kinds.ripples;
  check(`${tag} sizes: shot < flare < burst < screen clear`, sizes.shot.strength < sizes.flare.strength && sizes.flare.strength < sizes.burst.strength && sizes.burst.strength < sizes.clear.strength, sizes);

  // Let the blasts' own flashes and glows play out, then hold still again.
  await evaluate(`${G}.scene.resume()`);
  await sleep(2500);
  await evaluate(`(() => { const s = ${G}; s.scene.pause(); s.cameras.main.resetFX(); return true; })()`);

  // ---- A ring moves the lines as it passes, then they settle back.
  spot = await where();
  const before = await row(spot.line);
  check(`${tag} (the spot is on a line before the ring)`, hasLine(before), { before: reds(before), spot });
  // A ring far off: the shader takes over, and its straight lines sit exactly where the plain ones were (no jump).
  await evaluate(`(() => { const s = ${G}; s.grid.clear(); s.gridKick = 0; s.grid.ripple(${spot.X} + 5000, ${spot.Y}, 'clear'); s.followGrid(0); return true; })()`);
  await sleep(200);
  const far = { line: await row(spot.line), cell: await pixel(spot.cell), shown: await shown() };
  check(`${tag} the shader's lines sit where the plain lines were`, far.shown.view === 'Shader' && hasLine(far.line) && near(far.cell, FIELD), { ...far, line: reds(far.line) });
  await evaluate(`(() => { const s = ${G}; s.grid.clear(); s.gridKick = 0; s.grid.ripple(${spot.X} + 200, ${spot.Y}, 'burst'); s.grid.rings[0].age = (200 - 21) / 320; s.followGrid(0); return true; })()`);
  await sleep(200);
  const moved = await row(spot.line);
  await shot('ripple.png');
  check(`${tag} where a ring passes, the line has moved off its spot`, noLine(moved), { moved: reds(moved) });
  sh = await shown();
  check(`${tag} while a ring is out: the shader instead of the lines`, sh.view === 'Shader' && sh.shader && !sh.lines, sh);
  await evaluate(`(() => { const s = ${G}; s.grid.rings[0].age = 30; s.followGrid(0); return true; })()`);
  await sleep(200);
  const settled = { line: await row(spot.line), cell: await pixel(spot.cell), rings: await evaluate(`${G}.grid.rings.length`) };
  check(`${tag} once it fades, the ring is gone and the line is back`, settled.rings === 0 && hasLine(settled.line) && near(settled.cell, FIELD), { ...settled, line: reds(settled.line) });
  sh = await shown();
  check(`${tag} and the plain lines are back in place of the shader`, sh.view === 'Graphics' && sh.lines && !sh.shader, sh);

  // ---- No more than MAX_RINGS at once: the oldest goes.
  const capped = await evaluate(`(() => { const s = ${G}; s.grid.clear(); for (let i = 0; i < 12; i++) s.grid.ripple(s.player.x + i, s.player.y, 'shot'); return { n: s.grid.rings.length, first: Math.round(s.grid.rings[0].x - s.player.x) }; })()`);
  check(`${tag} at most ${kinds.max} rings: the oldest make way`, capped.n === kinds.max && capped.first === 12 - kinds.max, capped);

  // ---- Paused: the rings hold still with the world.
  await evaluate(`(() => { const s = ${G}; s.grid.clear(); s.scene.resume(); s.grid.ripple(s.player.x, s.player.y, 'burst'); return true; })()`);
  await sleep(300);
  await evaluate(`${G}.pauseGame()`);
  const a0 = await evaluate(`${G}.grid.rings[0].age`);
  await sleep(600);
  const a1 = await evaluate(`${G}.grid.rings[0].age`);
  check(`${tag} paused: the rings wait`, a0 > 0 && a1 === a0, { a0, a1 });
  await evaluate(`${G}.resumeGame()`);
  t.done();
};

// The plain grid is its own browser (each run ends its process): this script runs itself for it, and passes its lines on.
if (process.argv[3] === 'plain') await run(true);
else {
  const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), process.argv[2], 'plain'], { encoding: 'utf-8' });
  process.stdout.write(r.stdout + r.stderr);
  await run(false);
}
