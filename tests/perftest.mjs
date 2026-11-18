// Headless Chrome test for sound, mute and saved best run (raw CDP, Node 22 WebSocket).
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.argv[2];
const URL = process.env.GAME_URL || 'http://127.0.0.1:5173/';
const PORT = 9343;
const W = +process.env.W || 1920, H = +process.env.H || 1080;
mkdirSync(OUT, { recursive: true });

const chrome = spawn(process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${join(OUT, 'profile')}`,
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
const N = +(process.env.N ?? 40);
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: +process.env.DSF || 1, mobile: false });
await send('Page.navigate', { url: URL }); await sleep(4000);
for (let i = 0; i < 60 && !(await evaluate(`!!window.game?.scene?.getScene?.('game')?.sys?.isActive()`)); i++) await sleep(250);
await evaluate(`(() => { const s = ${G}; if (s.tutorial) s.endTutorial('${process.env.OUTCOME || 'killed'}'); s.stats.maxHp = s.hp = 1e9; for (let i = 0; i < ${N}; i++) s.spawnEnemy(); })()`);
await sleep(1500);
// Time spent in script per frame, measured in-page around the game loop step.
const measure = (ms) => evaluate(`new Promise(r => { const t = []; let last = performance.now(); const end = last + ${ms};
  const f = (now) => { t.push(now - last); last = now; if (now < end) requestAnimationFrame(f); else { t.sort((a, b) => a - b); r({ frames: t.length, avg: +(t.reduce((a, b) => a + b, 0) / t.length).toFixed(2), p95: +t[Math.floor(t.length * 0.95)].toFixed(2), max: +t[t.length - 1].toFixed(2), enemies: ${G}.enemies.getChildren().filter(o => o.active).length }); } };
  requestAnimationFrame(f); })`);
await send('Profiler.enable'); await send('Profiler.setSamplingInterval', { interval: 200 });
await send('Profiler.start');
const m = await measure(6000);
const prof = (await send('Profiler.stop')).result.profile;
console.log('frame times (ms):', JSON.stringify(m));
// Self time by function.
const self = new Map(); const byId = new Map(prof.nodes.map((n) => [n.id, n]));
const dt = prof.timeDeltas; let total = 0;
prof.samples.forEach((id, i) => { const n = byId.get(id); const f = n.callFrame; const k = `${f.functionName || '(anon)'} ${f.url.split('/').pop().split('?')[0]}:${f.lineNumber}`; self.set(k, (self.get(k) ?? 0) + dt[i]); total += dt[i]; });
const top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 28);
for (const [k, v] of top) console.log((v / total * 100).toFixed(1).padStart(5) + '%  ' + k);
console.log('console errors/warnings:', logs.length ? logs.slice(0, 5) : 'none');
ws.close(); chrome.kill(); process.exit(0);
