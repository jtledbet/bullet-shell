import { open } from './cdp.mjs';
const t = await open({ out: process.argv[2], port: 9353, url: 'http://127.0.0.1:5173/?fullres', dsf: 2 });
const { evaluate, shot, sleep, G } = t;
await evaluate(`(() => { const s = ${G}; s.endTutorial('absorbed'); s.traits = { hard: 0, calm: 0, rage: 0 }; s.spawnTimer = 1e9; s.fireCooldown = 1e9; s.stats.maxHp = s.hp = 1000;
  for (let i = 0; i < 7; i++) { s.spawnEnemy(); const e = s.enemies.getChildren().filter(o => o.active).pop(); e.setPosition(s.player.x + 170 + Math.cos(i * 0.9) * (i ? 34 : 0), s.player.y + Math.sin(i * 0.9) * (i ? 34 : 0)); e.setData('hp', i < 4 ? 5 : 60); e.setData('speed', 0); }
  return true; })()`);
await sleep(1500);
// A flare in flight.
await evaluate(`(() => { const s = ${G}; s.stats.flareEvery = 99; s.flareCooldown = 0; s.fireFlare(0.016); return true; })()`);
await sleep(180);
await shot('flare-flying.png');
// Freeze the game a few frames into the burst, so the screenshot catches it.
await evaluate(`new Promise(r => { const s = ${G}; const f = () => { if (!s.flares.getChildren().some(o => o.active)) { let n = 0; const g = () => { if (++n < 4) requestAnimationFrame(g); else { game.loop.sleep(); r(true); } }; requestAnimationFrame(g); } else requestAnimationFrame(f); }; requestAnimationFrame(f); })`);
await shot('flare-burst.png');
await evaluate(`game.loop.wake()`);
t.done();
