// Headless Chrome test for sound, mute and saved best run (raw CDP, Node 22 WebSocket).
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.argv[2];
const URL = process.env.GAME_URL || 'http://127.0.0.1:5173/';
const PORT = 9341;
const W = 844, H = 390;
mkdirSync(OUT, { recursive: true });

const chrome = spawn(process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--mute-audio', `--remote-debugging-port=${PORT}`, `--user-data-dir=${join(OUT, 'profile')}`,
  '--no-first-run', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 120 && !target; i++) {
  await sleep(250);
  try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === 'page'); } catch {}
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map(); const logs = [];
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  if (msg.method === 'Runtime.exceptionThrown') logs.push('EXCEPTION ' + msg.params.exceptionDetails.exception?.description);
  if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(msg.params.type))
    logs.push(msg.params.type + ' ' + msg.params.args.map((a) => a.value ?? a.description).join(' '));
};
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expr, aw = true) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: aw })).result?.result?.value;
const shot = async (name) => { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(OUT, name), Buffer.from(r.result.data, 'base64')); };
const touch = (type, points) => send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y, tid]) => ({ x, y, id: tid })) });
const key = (type, k, code, vk) => send('Input.dispatchKeyEvent', { type, key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
const tap = async (x, y, tid) => { await touch('touchStart', [[x, y, tid]]); await sleep(80); await touch('touchEnd', []); };
let failed = 0;
const check = (name, ok, detail) => { if (!ok) failed++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? '  ' + JSON.stringify(detail) : '')); };
const G = `game.scene.getScene('game')`; const U = `game.scene.getScene('ui')`;
const texts = () => evaluate(`(${U}.menu?.list ?? []).filter(o => o.type === 'Text').map(o => o.text)`);
const allLower = (arr) => arr.every((t) => t === t.toLowerCase());
const infos = [];
const TOUCH = !!process.env.TOUCH;
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: TOUCH, screenOrientation: { type: 'landscapePrimary', angle: 90 } });
await send('Emulation.setTouchEmulationEnabled', { enabled: TOUCH, maxTouchPoints: 5 });
await send('Page.navigate', { url: URL }); await sleep(4000);
for (let i = 0; i < 60 && !(await evaluate(`!!window.game?.scene?.getScene?.('game')?.sys?.isActive()`)); i++) await sleep(250);
const ab = () => evaluate(`(() => { const u = ${U}, a = u.ability, r = game.canvas.getBoundingClientRect(), k = u.cameras.main.zoom * r.width / game.canvas.width;
  return { vis: a.visible, x: r.left + a.x * k, y: r.top + a.y * k, cd: ${G}.abilityCooldown, card: !!u.powerCard, frozen: ${G}.frozen }; })()`);
let a = await ab();
check('tutorial: no button', !a.vis, a);
await evaluate(`(() => { const s = ${G}; s.endTutorial(); s.enemies.getChildren().forEach(e => e.disableBody(true, true)); })()`);
await sleep(300);
a = await ab();
check('fight, no traits: no button', !a.vis, a);
// A power new to this visit: a card in the middle says what it is, then shrinks into the button.
const tapMiddle = async () => {
  if (TOUCH) return tap(W / 2, H / 2, 3);
  const m = (type) => send('Input.dispatchMouseEvent', { type, x: W / 2, y: H / 2, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 });
  await m('mouseMoved'); await m('mousePressed'); await sleep(80); await m('mouseReleased');
};
await evaluate(`${G}.traits.rage = 2`);
for (let i = 0; i < 40 && !(await evaluate(`!!${U}.powerCard`)); i++) await sleep(50);
await tapMiddle(); await sleep(250);
a = await ab();
check('rage trait: its card first, the game held, no button yet (a click as it appears is ignored)', a.card && a.frozen && !a.vis, a);
const cardText = await evaluate(`${U}.powerCard.list.filter(o => o.type === 'Text').map(o => o.text)`);
check('the card names the power, says what it does and how to use it', cardText.includes('burst') && cardText.some((x) => x.startsWith('everything close to you')) && cardText.includes(TOUCH ? 'tap to begin' : 'press e or right-click'), cardText);
await shot('power-card.png');
await sleep(500); await tapMiddle(); await sleep(200);
await shot('power-card-shrinking.png');
await sleep(600);
a = await ab();
check('a click sends it into the button: card gone, button there, game going', !a.card && a.vis && !a.frozen, a);
await shot('ability-ready.png');
if (TOUCH) { await tap(a.x, a.y, 7); } else {
  const m = (type) => send('Input.dispatchMouseEvent', { type, x: a.x, y: a.y, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 });
  await m('mouseMoved'); await m('mousePressed'); await sleep(80); await m('mouseReleased');
}
await sleep(200);
a = await ab();
check('pressing the button uses the ability', a.cd > 5, a);
check('pressing the button did not start the aim stick', (await evaluate(`${U}.sticks?.right === undefined`)), null);
await sleep(1500);
await shot('ability-charging.png');
await evaluate(`${G}.pauseGame()`); await sleep(200);
check('hidden while paused', !(await ab()).vis, null);
await evaluate(`${G}.resumeGame()`); await sleep(6000);
a = await ab();
check('recharged and back', a.vis && a.cd === 0, a);
await evaluate(`(() => { const s = ${G}; s.scene.restart({ resume: { mode: 'heaven', traits: { hard: 0, calm: 0, rage: 2 }, lastTrait: 'rage' } }); })()`); await sleep(1500);
a = await ab();
check('the same power next run: no card, just the button', !a.card && a.vis && !a.frozen, a);
console.log('console errors/warnings:', logs.length ? logs : 'none');
console.log(failed ? `${failed} FAILED` : 'ALL PASS');
ws.close(); chrome.kill(); process.exit(0);
