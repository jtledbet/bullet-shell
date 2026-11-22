import { open } from './cdp.mjs';
const t = await open({ out: process.argv[2], port: 9366, url: 'http://127.0.0.1:5173/?fullres', width: 1280, height: 720, dsf: 1 });
const { evaluate, shot, click, press, check, sleep, G, U, uiPoint } = t;
// Headless Chrome can't enter fullscreen, so each request is counted instead.
await evaluate(`(() => { window.__fs = 0; document.documentElement.requestFullscreen = () => { window.__fs++; return Promise.resolve(); }; return true; })()`);
const asked = () => evaluate(`window.__fs`);
// Orientation has no auto-aim, so every shot here comes from the mouse.
const shots = () => evaluate(`${G}.notes.shots`);
check('orientation, with a fullscreen button', await evaluate(`${G}.tutorial && !!${U}.fsBtn`));

const fs = await uiPoint(`u.fsBtn`);
let before = await shots();
await click(fs.x, fs.y); await sleep(400);
check('clicking fullscreen asks for fullscreen', (await asked()) === 1, await asked());
check('and fires nothing', (await shots()) === before, { before, after: await shots() });

// The same click out in the field does fire, so the check above can see a shot.
before = await shots();
await click(300, 500); await sleep(400);
check('a click in the field still fires', (await shots()) > before, { before, after: await shots() });

await press('f', 'KeyF', 70); await sleep(300);
check('F asks for fullscreen too', (await asked()) === 2, await asked());

const pb = await uiPoint(`u.pauseBtn`);
before = await shots();
await click(pb.x, pb.y); await sleep(400);
check('clicking pause pauses and fires nothing', (await evaluate(`${G}.paused`)) && (await shots()) === before, { paused: await evaluate(`${G}.paused`), before, after: await shots() });
await shot('fs.png');
t.done();
