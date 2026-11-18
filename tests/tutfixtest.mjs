// Headless Chrome test for sound, mute and saved best run (raw CDP, Node 22 WebSocket).
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.argv[2];
const URL = process.env.GAME_URL || 'http://127.0.0.1:5173/';
const PORT = 9342;
const W = 844, H = 390;
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
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: URL }); await sleep(4000);
for (let i = 0; i < 20 && (await evaluate(`audioDebug().state`)) !== 'running'; i++) { await key('keyDown', 'a', 'KeyA', 65); await key('keyUp', 'a', 'KeyA', 65); await sleep(500); }
const counts = () => evaluate(`audioDebug().counts`);
// Fresh tutorial with one seed of the given mood at distance d from the player.
const fresh = async (mood, d) => {
  await evaluate(`${G}.scene.restart()`); await sleep(1500);
  await evaluate(`(() => { const s = ${G}; s.enemies.getChildren().forEach(e => e.disableBody(true, true)); s.spawnSeed('${mood}', s.player.x + ${d}, s.player.y, 0); })()`);
  await sleep(100);
};
const seed = () => evaluate(`(() => { const s = ${G}, e = s.enemies.getChildren().find(o => o.active); if (!e) return null; const v = e.body.velocity;
  return { mood: e.getData('mood'), d: Math.hypot(e.x - s.player.x, e.y - s.player.y), speed: Math.hypot(v.x, v.y), angle: e.angle }; })()`);
const state = () => evaluate(`(() => { const s = ${G}; return { tutorial: s.tutorial, mode: s.mode, traits: { ...s.traits }, bumps: s.bumps, hp: s.hp, active: s.enemies.getChildren().filter(o => o.active).length }; })()`);

const c0 = await counts();
check('audio unlocked', (await evaluate(`audioDebug().state`)) === 'running', await evaluate(`audioDebug().state`));

// Curious: bobs (distance goes both ways) and drifts in while far.
await fresh('curious', 300);
const ds = [];
for (let i = 0; i < 16; i++) { ds.push((await seed()).d); await sleep(125); }
const diffs = ds.slice(1).map((d, i) => d - ds[i]);
check('curious bobs toward and away', diffs.some((x) => x > 0.3) && diffs.some((x) => x < -0.3), ds.map((d) => +d.toFixed(1)));
check('curious drifts closer while far', ds[ds.length - 1] < ds[0], [ds[0], ds[ds.length - 1]]);

// Skeptical: flinches the moment you come near.
await fresh('skeptical', 300);
let s1 = await evaluate(`new Promise(r => { const s = ${G}; s.player.x += 120; let top = 0, n = 0;
  const f = () => { const e = s.enemies.getChildren().find(o => o.active); const v = e.body.velocity; top = Math.max(top, Math.hypot(v.x, v.y)); if (++n < 20) requestAnimationFrame(f); else r({ speed: top }); }; requestAnimationFrame(f); })`);
check('skeptical flinches (fast jerk away)', s1.speed > 150, s1);
await sleep(400);
s1 = await seed();
check('then calms down (no lingering jerk)', s1.speed < 150, s1);

// Aggro: trembles.
await fresh('aggro', 300);
const angles = [];
for (let i = 0; i < 5; i++) { angles.push((await seed()).angle); await sleep(50); }
check('aggro trembles', new Set(angles.map((a) => a.toFixed(2))).size > 2 && angles.every((a) => Math.abs(a) <= 4.01), angles);

// Idle: irritated seeds bump (no damage) and the tutorial ends in hell with a hard point.
await fresh('curious', 200);
const hp0 = (await state()).hp;
await evaluate(`${G}.idleTime = 24.9`); await sleep(300);
s1 = await seed();
check('idle irritates the seed (turns aggro)', s1.mood === 'aggro' && (await evaluate(`${G}.irritated`)), s1);
let st;
for (let i = 0; i < 60; i++) { st = await state(); if (!st.tutorial) break; await sleep(250); }
check('idle ends in bullet hell after 3 bumps, +1 hard', !st.tutorial && st.mode === 'hell' && st.bumps === 3 && st.traits.hard === 1, st);
check('bumps did no damage', st.hp === hp0, { hp0, hp: st.hp });
check('no seeds left after the ending', st.active === 0, st);
await shot('idle-end.png');

// Moving resets the idle clock.
await fresh('curious', 200);
await evaluate(`${G}.idleTime = 24`);
await key('keyDown', 'a', 'KeyA', 65); await sleep(200); await key('keyUp', 'a', 'KeyA', 65);
check('moving resets the idle clock', (await evaluate(`${G}.idleTime`)) < 1, await evaluate(`${G}.idleTime`));

// Run away: ends in heaven with a calm point.
await fresh('skeptical', 300);
await evaluate(`${G}.player.x -= 1500`); await sleep(300);
st = await state();
check('running far ends in bullet heaven, +1 calm', !st.tutorial && st.mode === 'heaven' && st.traits.calm === 1 && st.active === 0, st);

// Absorbing: calm and angry.
await fresh('curious', 0); await sleep(2200);
await fresh('aggro', 0); await sleep(4500);
const c1 = await counts();
const delta = Object.fromEntries(Object.keys(c1).map((k) => [k, c1[k] - (c0[k] ?? 0)]));
check('sounds: seed, absorbing, calm exhale, angry throb, 3 brood pops, tutorial end', delta.seed >= 1 && delta.absorbing >= 2 && delta.absorbedCalm >= 1 && delta.absorbedAngry >= 1 && delta.pop >= 3 && delta.tutorialEnd >= 2 && delta.bump >= 3, delta);
console.log('console errors/warnings:', logs.length ? logs : 'none');
console.log(failed ? `${failed} FAILED` : 'ALL PASS');
ws.close(); chrome.kill(); process.exit(0);
