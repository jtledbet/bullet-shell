import { open } from './cdp.mjs';
// First without ?dev: no switch. (A fresh browser profile each run, so nothing is remembered.)
let t = await open({ out: process.argv[2] + '-a', port: 9349, url: 'http://127.0.0.1:5173/?fullres', dsf: 1 });
await t.evaluate(`${t.G}.pauseGame()`); await t.sleep(500);
t.check('without ?dev: no shotgun switch in the pause menu', !(await t.menuTexts()).some((x) => x.startsWith('shotgun')), await t.menuTexts());
t.check('and no speed readout, but the version is there', !(await t.menuTexts()).some((x) => / fps /.test(x)) && (await t.menuTexts()).some((x) => /^v\d+\.\d+\.\d+ /.test(x)), (await t.menuTexts()).slice(-3));
t.check('and no event log', !(await t.evaluate(`!!document.getElementById('devlog')`)));
await t.evaluate(`location.assign('http://127.0.0.1:5173/?fullres&dev')`); await t.sleep(4000); await t.ready();
const { evaluate, click, check, sleep, G, uiPoint, menuTexts, shot } = t;
// The event log, for phone-only fullscreen bugs.
const logText = () => evaluate(`document.getElementById('devlog')?.innerText ?? ''`);
const lg = await evaluate(`(() => { const b = document.getElementById('devlog'); return b ? { taps: getComputedStyle(b).pointerEvents, text: b.innerText } : null; })()`);
check('with ?dev: an event log on the page that never takes a tap', lg && lg.taps === 'none' && lg.text.includes('log started'), lg);
const frames = async () => +(/^frames (\d+)/.exec(await logText())?.[1] ?? -1);
const f0 = await frames(); await sleep(600);
check('its frame count climbs while the game runs', (await frames()) > f0 && f0 >= 0, { f0, f1: await frames() });
// Headless Chrome can't enter fullscreen, so the request is answered here.
await evaluate(`(() => { document.documentElement.requestFullscreen = () => Promise.resolve(); return true; })()`);
const fsb = await uiPoint(`u.fsBtn`);
await click(fsb.x, fsb.y); await sleep(400);
// (Only the missing lines are printed: the log can hold the browser's own error names, which the runner would read as a failure.)
const missing = async (want) => { const text = await logText(); return want.filter((x) => !text.includes(x)); };
let miss = await missing(['fullscreen button down (mouse)', 'fullscreen button up (mouse button 0)', 'toggle: asking for fullscreen', 'fullscreen granted', 'landscape lock']);
check('a tap on fullscreen is logged, with what the browser said', miss.length === 0, { missing: miss });
await evaluate(`document.dispatchEvent(new Event('fullscreenchange'))`); await sleep(300);
miss = await missing(['fullscreenchange: now not fullscreen', 'game: paused']);
check('leaving fullscreen is logged, and the pause it causes', miss.length === 0, { missing: miss });
await shot('dev-log.png');
await evaluate(`${G}.pauseGame()`); await sleep(600);
check('with ?dev: the switch is there, off', (await menuTexts()).includes('shotgun: off'), await menuTexts());
check('and the speed readout shows', (await menuTexts()).some((x) => / fps /.test(x)), (await menuTexts()).slice(-3));
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
// Dev mode lasts only for a visit with ?dev in its address.
await evaluate(`location.assign('http://127.0.0.1:5173/?fullres')`); await sleep(4000); await t.ready();
check('a visit without ?dev plays without it', (await evaluate(`${G}.stats.shotgunPellets`)) === 0);
await evaluate(`${G}.pauseGame()`); await sleep(500);
check('and shows no developer switches', !(await menuTexts()).some((x) => x.startsWith('shotgun') || x.startsWith('flare')), await menuTexts());
await evaluate(`${G}.resumeGame()`);
await evaluate(`location.assign('http://127.0.0.1:5173/?fullres&dev')`); await sleep(4000); await t.ready();
check('the next ?dev visit has it again, switch still on', (await evaluate(`${G}.stats.shotgunPellets`)) === 6);
await evaluate(`location.assign('http://127.0.0.1:5173/?fullres&dev=off')`); await sleep(4000); await t.ready();
check('?dev=off plays without it', (await evaluate(`${G}.stats.shotgunPellets`)) === 0);
t.done();
