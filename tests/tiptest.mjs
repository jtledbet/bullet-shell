import { open } from './cdp.mjs';
const out = process.argv[2];
// --- Desktop: hover explains things, and a power new to this visit explains itself on a card.
let t = await open({ out: out + '-desktop', port: 9357, url: 'http://127.0.0.1:5173/?fullres', width: 1280, height: 720, dsf: 1 });
{
  const { evaluate, shot, check, sleep, mouse, press, G, U, uiPoint, uiTexts } = t;
  const tipText = () => evaluate(`${U}.tipBox ? ${U}.tipBox.list.filter(o => o.type === 'Text').map(o => o.text).join(' | ') : null`);
  check('every card has an explanation', await evaluate(`import('/src/upgrades.ts').then(m => m.UPGRADES.every(u => u.tip && u.tip.length > 20 && !u.tip.includes('\\u2014')))`));
  await evaluate(`(() => { const s = ${G}; ${U}.introduced.delete('calm'); s.traits = { hard: 0, calm: 2, rage: 0 }; s.lastTrait = 'calm'; s.endTutorial('absorbed'); s.spawnTimer = 1e9; s.fireCooldown = 1e9; return true; })()`);
  const card = () => evaluate(`${U}.powerCard ? ${U}.powerCard.list.filter(o => o.type === 'Text').map(o => o.text) : null`);
  for (let i = 0; i < 60 && !(await card()); i++) await sleep(50);
  const c = await card();
  check('the run starts with a card that names the power, says what it does and how to use it', c && c.includes('phase') && c.some((x) => x.startsWith('slip out of reach')) && c.includes('press e or right-click'), c);
  check('the game waits behind it', await evaluate(`${G}.frozen`));
  await sleep(800); await shot('power-card.png');
  await press('e', 'KeyE', 69); await sleep(900);
  const after = await evaluate(`({ card: !!${U}.powerCard, button: ${U}.ability.visible, cd: ${G}.abilityCooldown, frozen: ${G}.frozen })`);
  check('pressing e sends it into the button, without using the power yet', !after.card && after.button && after.cd === 0 && !after.frozen, after);
  const b = await uiPoint(`u.ability`);
  await mouse('mouseMoved', b.x + 3, b.y + 3, 'none'); await sleep(200);
  check('resting the mouse on the power explains it, its name a bold title', (await tipText())?.startsWith('phase | slip out of reach') && (await evaluate(`${U}.tipBox.list.find(o => o.type === 'Text').style.fontStyle`)) === 'bold', await tipText());
  await shot('power-hover.png');
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
