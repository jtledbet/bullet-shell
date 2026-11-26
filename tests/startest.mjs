// Full grid (Max, 2026-11-24): orientation and the run share one ruled navy room; the stars drift behind the pause menu.
// The grid can carry waves (they're in rippletest).
import { open } from './cdp.mjs';
const t = await open({ out: process.argv[2], port: 9356, url: 'http://127.0.0.1:5173/?fullres', width: 1280, height: 720, dsf: 1 });
const { evaluate, shot, check, sleep, G, U } = t;
const room = () => evaluate(`({ bg: game.config.backgroundColor.color, grid: ${G}.grid.view.visible, kind: ${G}.grid.view.type, waves: ${G}.grid.waves, stars: ${G}.stars === undefined ? 'none' : 'some' })`);
const NAVY = 0x0b1222;

await evaluate(`(() => { const s = ${G}; s.enemies.getChildren().forEach(e => e.disableBody(true, true)); s.spawnSeed('curious', s.player.x + 200, s.player.y - 40, 0); return true; })()`);
await sleep(600);
const before = await room();
check('orientation: the ruled navy room', before.bg === NAVY && before.grid && before.waves && before.stars === 'none', before);
await shot('orientation-grid.png');

await evaluate(`(() => { const s = ${G}; s.endTutorial('absorbed'); s.spawnTimer = 1e9; s.fireCooldown = 1e9; s.stats.maxHp = s.hp = 1000; for (let i = 0; i < 6; i++) { s.spawnEnemy(); const e = s.enemies.getChildren().filter(o => o.active).pop(); e.setPosition(s.player.x + Math.cos(i) * 260, s.player.y + Math.sin(i) * 170); e.setData('speed', 0); } return true; })()`);
// At once and well after: nothing changes when orientation ends.
await sleep(300);
const just = await room();
await sleep(1500);
const after = await room();
check('the run: the same room, the grid stays, no stars (no change when orientation ends)', [just, after].every((r) => r.bg === NAVY && r.grid && r.waves && r.stars === 'none'), { just, after });

// The grid goes wherever you go: move far, and it still covers the view.
await evaluate(`(() => { const s = ${G}; s.player.x += 3000; s.player.y -= 1700; s.cameras.main.centerOn(s.player.x, s.player.y); return true; })()`); await sleep(400);
const cover = await evaluate(`(() => { const s = ${G}; const v = s.cameras.main.worldView; const g = s.grid.view; return { left: g.x <= v.x, top: g.y <= v.y, right: g.x + 2048 >= v.right, bottom: g.y + 2048 >= v.bottom }; })()`);
check('far from the start, the grid still covers the view', Object.values(cover).every(Boolean), cover);
await shot('run-grid.png');

// ---- The pause menu: the stars, drifting.
await evaluate(`${G}.pauseGame()`); await sleep(400);
const paused = await evaluate(`(() => { const u = ${U}; return { drawn: !!u.stars && u.stars.active && u.stars.commandBuffer.length > 30, inMenu: !!u.stars && u.menu.list.indexOf(u.stars) === 1, travel: u.starTravel }; })()`);
check('paused: stars behind the menu, just over the dimmed game', paused.drawn && paused.inMenu, paused);
const t0 = await evaluate(`({ travel: ${U}.starTravel, at: performance.now() })`);
await sleep(1000);
const t1 = await evaluate(`({ travel: ${U}.starTravel, at: performance.now() })`);
const speed = (t1.travel - t0.travel) / ((t1.at - t0.at) / 1000);
check('they drift: about 100 a second (far layer 4 px a second, near 20)', speed > 60 && speed < 140, +speed.toFixed(1));
await shot('pause-stars.png');
await evaluate(`${G}.resumeGame()`); await sleep(300);
check('resumed: the stars go with the menu', await evaluate(`!${U}.stars.active`));
t.done();
