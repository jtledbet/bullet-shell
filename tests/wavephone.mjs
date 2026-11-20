import { open } from './cdp.mjs';
// --- Phone: the map sits under the bars, clear of the power button.
const p = await open({ out: process.argv[2], port: 9363, url: 'http://127.0.0.1:5173/?fullres', width: 844, height: 390, dsf: 1, mobile: true, touch: true });
{
  const { evaluate, shot, check, sleep, G, U } = p;
  await evaluate(`(() => { const s = ${G}; s.traits = { hard: 0, calm: 2, rage: 0 }; s.lastTrait = 'calm'; s.endTutorial('absorbed'); s.spawnTimer = 1e9; s.fireCooldown = 1e9; for (let i = 0; i < 5; i++) s.dropGem(s.player.x + 2000, s.player.y + i * 400); return true; })()`);
  await sleep(800);
  const where = await evaluate(`(() => { const b = ${U}.map.commandBuffer; for (let i = 0; i < b.length - 1; i++) if (b[i] === 76 && b[i + 1] === 128) return true; return false; })()`);
  check('on a phone it sits top left, under the bars', where);
  const power = await evaluate(`(() => { const a = ${U}.ability; return { x: a.x, y: a.y }; })()`);
  check('well away from the power button', Math.hypot(power.x - 76, power.y - 128) > 44 + 32, power);
  await shot('phone-minimap.png');
  p.done();
}
