import { open } from './cdp.mjs';
const out = process.argv[2];
// --- Desktop: hover explains things, and the power explains itself when it first appears.
let t = await open({ out: out + '-desktop', port: 9357, url: 'http://127.0.0.1:5173/?fullres', width: 1280, height: 720, dsf: 1 });
{
  const { evaluate, shot, check, sleep, mouse, G, U, uiPoint, uiTexts } = t;
  const tipText = () => evaluate(`${U}.tipBox ? ${U}.tipBox.list.find(o => o.type === 'Text').text : null`);
  check('every card has an explanation', await evaluate(`import('/src/upgrades.ts').then(m => m.UPGRADES.every(u => u.tip && u.tip.length > 20 && !u.tip.includes('\\u2014')))`));
  await evaluate(`(() => { const s = ${G}; s.traits = { hard: 0, calm: 2, rage: 0 }; s.lastTrait = 'calm'; s.endTutorial('absorbed'); s.spawnTimer = 1e9; s.fireCooldown = 1e9; return true; })()`); await sleep(700);
  let tip = await tipText();
  check('the power says what it does when it first appears', tip && tip.startsWith('phase: slip out of reach'), tip);
  await shot('power-explains.png');
  // (Headless Chrome runs the game's clock slow, so allow well past the 7 seconds.)
  await sleep(9800);
  check('and that goes away by itself', (await tipText()) === null, await tipText());
  const b = await uiPoint(`u.ability`);
  await mouse('mouseMoved', b.x + 3, b.y + 3, 'none'); await sleep(200);
  check('resting the mouse on the power brings it back', (await tipText())?.startsWith('phase:'), await tipText());
  await mouse('mouseMoved', 640, 400, 'none'); await sleep(200);
  check('moving away hides it', (await tipText()) === null);
  await mouse('mouseMoved', 100, 38, 'none'); await sleep(200);
  check('the health bar explains energy', (await tipText())?.startsWith('your energy.'), await tipText());
  await shot('hover-health.png');
  const p = await uiPoint(`u.pauseBtn`);
  await mouse('mouseMoved', p.x, p.y, 'none'); await sleep(200);
  check('the pause button names its keys', (await tipText())?.includes('esc, p and space'), await tipText());
  await evaluate(`${G}.pauseGame()`); await sleep(500);
  check('opening a menu clears any tip', (await tipText()) === null);
  const l = await uiPoint(`u.menu.list.find(o => o.type === 'Text' && o.text.startsWith('labels'))`);
  await mouse('mouseMoved', l.x, l.y, 'none'); await sleep(200);
  check('menu buttons explain themselves', (await tipText())?.startsWith('with labels on'), await tipText());
  await shot('hover-menu.png');
  await evaluate(`${G}.resumeGame()`); await sleep(200);
  check('closing the menu clears it', (await tipText()) === null, await tipText());
}
// --- Phone: cards carry their explanations and still fit.
const { spawnSync } = await import('node:child_process');
const r = spawnSync(process.execPath, [new URL('./tipcards.mjs', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), out + '-phone'], { encoding: 'utf-8' });
process.stdout.write(r.stdout);
t.done();
