import { open } from './cdp.mjs';
// First without ?dev: no switch. (A fresh browser profile each run, so nothing is remembered.)
let t = await open({ out: process.argv[2] + '-a', port: 9349, url: 'http://127.0.0.1:5173/?fullres', dsf: 1 });
await t.evaluate(`${t.G}.pauseGame()`); await t.sleep(500);
t.check('without ?dev: no shotgun switch in the pause menu', !(await t.menuTexts()).some((x) => x.startsWith('shotgun')), await t.menuTexts());
await t.evaluate(`location.assign('http://127.0.0.1:5173/?fullres&dev')`); await t.sleep(4000);
const { evaluate, click, check, sleep, G, uiPoint, menuTexts, shot } = t;
await evaluate(`${G}.pauseGame()`); await sleep(600);
check('with ?dev: the switch is there, off', (await menuTexts()).includes('shotgun: off'), await menuTexts());
const p = await uiPoint(`u.menu.list.find(o => o.type === 'Text' && o.text.startsWith('shotgun'))`);
await click(p.x, p.y); await sleep(400);
const s1 = await evaluate(`({ pellets: ${G}.stats.shotgunPellets, rate: ${G}.stats.shotgunRate })`);
check('flip it: an auto shotgun at once (6 pellets, 3 blasts a second)', (await menuTexts()).includes('shotgun: on') && s1.pellets === 6 && s1.rate === 3, s1);
await shot('dev-pause.png');
await evaluate(`${G}.resumeGame()`);
// It fires at that rate with something in reach.
await evaluate(`(() => { const s = ${G}; s.endTutorial('absorbed'); s.spawnTimer = 1e9; s.stats.maxHp = s.hp = 1e9; s.spawnEnemy(); const e = s.enemies.getChildren().find(o => o.active); e.setData('hp', 1e9); e.setData('speed', 0); window.__hold = () => { e.setPosition(s.player.x + 90, s.player.y); e.setVelocity(0, 0); e.setData('knock', 0); }; s.events.on('update', window.__hold); window.__b0 = s.blastId; })()`);
await sleep(3000);
const blasts = await evaluate(`${G}.blastId - window.__b0`);
check('about 3 blasts a second', blasts >= 7 && blasts <= 10, blasts);
await shot('dev-blast.png');
// Remembered: a fresh run starts with it, and so does a reload.
await evaluate(`(() => { const s = ${G}; s.events.off('update', window.__hold); s.scene.restart({}); })()`); await sleep(1200);
check('the next run starts with it', (await evaluate(`${G}.stats.shotgunPellets`)) === 6);
await evaluate(`location.assign('http://127.0.0.1:5173/?fullres')`); await sleep(4000); await t.ready();
check('and it is remembered on this device', (await evaluate(`${G}.stats.shotgunPellets`)) === 6);
await evaluate(`location.assign('http://127.0.0.1:5173/?fullres&dev=off')`); await sleep(4000); await t.ready();
check('?dev=off puts everything back', (await evaluate(`${G}.stats.shotgunPellets`)) === 0);
t.done();
