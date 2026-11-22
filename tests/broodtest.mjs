// Headless Chrome test for sound, mute and saved best run (raw CDP, Node 22 WebSocket).
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.argv[2];
const URL = process.env.GAME_URL || 'http://127.0.0.1:5173/';
const PORT = 9347;
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
const evaluate = async (expr) => { const r = (await send('Runtime.evaluate', { expression: expr, returnByValue: true })).result; if (r?.exceptionDetails) console.log('EVAL ERROR', r.exceptionDetails.exception?.description?.split(String.fromCharCode(10))[0]); return r?.result?.value; };
const shot = async (name) => { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(OUT, name), Buffer.from(r.result.data, 'base64')); };
const touch = (type, points) => send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y, tid]) => ({ x, y, id: tid })) });
const key = (type, k, code, vk) => send('Input.dispatchKeyEvent', { type, key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
const tap = async (x, y, tid) => { await touch('touchStart', [[x, y, tid]]); await sleep(80); await touch('touchEnd', []); };
let failed = 0;
const check = (name, ok, detail) => { if (!ok) failed++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? '  ' + JSON.stringify(detail) : '')); };

const audio = () => evaluate('audioDebug()');
const saved = () => evaluate(`JSON.parse(localStorage.getItem('bullet-shell:save:v1'))`);
const menuTexts = () => evaluate(`(game.scene.getScene('ui').menu?.list ?? []).filter(o => o.type === 'Text').map(o => o.text)`);
const menuOpen = () => evaluate(`!!game.scene.getScene('ui').menu`);
const die = (elapsed) => evaluate(`(() => { const s = game.scene.getScene('game'); s.elapsed = ${elapsed}; s.gameOver(); })()`);
const load = async () => { await send('Page.navigate', { url: URL }); await sleep(4000); for (let i = 0; i < 60 && !(await evaluate(`!!window.game?.scene?.getScene?.('game')?.sys?.isActive()`)); i++) await sleep(250); await evaluate(`(() => { const u = game.scene.getScene('ui'); if (u) u.introduced = new Set(['hard', 'calm', 'rage']); return true; })()`); };
const aimFor = async (ms, tid) => { await touch('touchStart', [[600, 220, tid]]); await sleep(60); await touch('touchMove', [[670, 220, tid]]); await sleep(ms); await touch('touchEnd', []); };
const SOUND = [W - 32 - 60, 32 + 14];
const PAUSE = [W - 32 - 22, 32 + 14];

await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: +process.env.DSF || 1, mobile: true, screenOrientation: { type: 'landscapePrimary', angle: 90 } });
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
const G = `game.scene.getScene('game')`;
const st = () => evaluate(`(() => { const s = ${G}; return { tutorial: s.tutorial, mode: s.mode, anger: +s.anger.toFixed(2), size: +(s.player.scaleX * 4).toFixed(3), red: +s.angerOverlay.alpha.toFixed(2), hp: s.hp,
  readout: game.scene.getScene('ui').debugText?.text ?? null, enemyShots: s.enemyBullets.getChildren().filter(b => b.active).length }; })()`);
const untilDone = async () => { for (let i = 0; i < 80 && (await st()).tutorial; i++) await sleep(100); };
const setSprite = (mood, dx) => evaluate(`(() => { const s = ${G}; const e = s.enemies.getChildren().find(e => e.active); e.setData({ mood: '${mood}', nosy: false, sulk: 0 }); e.body.reset(s.player.x + ${dx}, s.player.y); s.showMood(e, false); })()`);
const autoAims = () => evaluate(`(() => { const s = ${G}; s.enemies.getChildren().forEach(e => e.disableBody(true, true)); const e = s.enemies.get(); e.enableBody(true, s.player.x + 150, s.player.y, true, true); e.setScale(0.25).setCircle(48, 16, 16).setAlpha(1); e.setData({ hp: 99, speed: 0, knock: 0, mood: 'chase', absorb: 0, shootCd: 99 }); return true; })()`).then(() => sleep(300)).then(() => evaluate(`${G}.aimDirection(${G}.stats.range) !== null`));

const seeds = () => evaluate(`${G}.enemies.getChildren().filter(e => e.active).map(e => ({ mood: e.getData('mood'), gen: e.getData('gen'), size: +(e.scaleX * 4).toFixed(2) }))`);
const kill = (mood) => evaluate(`(() => { const s = ${G}; const e = s.enemies.getChildren().find(e => e.active && e.getData('mood') === '${mood}' && e.getData('gen') === 1); e.setData('hp', 0.1);
  const b = s.bullets.get(); b.enableBody(true, e.x, e.y, true, true); b.setData({ pierce: 0, life: 1, hits: new Set() }); s.onBulletHit(b, e); return true; })()`);
const broodOut = async () => { for (let i = 0; i < 60; i++) { const k = await seeds(); if (k.filter(x => x.gen === 1).length === 3 && k.every(x => x.size > 0.6 || x.mood === 'skeptical')) return k; await sleep(100); } return seeds(); };

// Only three temperaments.
await load();
const seen = {};
for (let i = 0; i < 30; i++) { await evaluate(`${G}.scene.restart()`); await sleep(200); const m = (await seeds())[0]?.mood; seen[m] = (seen[m] ?? 0) + 1; }
check('only curious, skeptical and aggro', Object.keys(seen).sort().join() === 'aggro,curious,skeptical', seen);

// A calm seed absorbed alone still ends the tutorial (no brood).
await load();
await setSprite('curious', 0);
await untilDone();
let a = await st();
check('calm seed absorbed: no brood, tutorial over, heaven', a.tutorial === false && a.mode === 'heaven', a);

// Aggro seed absorbed: three seeds pop up, one of each, smaller; tutorial goes on.
await load();
await setSprite('aggro', 0);
let k = await broodOut();
await shot('brood.png');
a = await st();
check('aggro seed absorbed: tutorial continues', a.tutorial === true, a);
check('three seeds pop up', k.length === 3 && k.every(x => x.gen === 1), k);
check('one of each temperament', k.map(x => x.mood).sort().join() === 'aggro,curious,skeptical', k);
check('brood seeds are smaller', k.every(x => x.size < 1), k);

// Kill two, absorb the curious one: 2 killed vs 2 absorbed (first seed + curious) -> heaven.
await kill('skeptical');
await kill('aggro');
await evaluate(`(() => { const s = ${G}; const e = s.enemies.getChildren().find(e => e.active); e.body.reset(s.player.x, s.player.y); })()`);
await untilDone();
a = await st();
check('tutorial ends once every seed is dealt with', a.tutorial === false, a);
check('even split -> heaven; readout counts it', a.mode === 'heaven' && a.readout?.includes('killed 2, absorbed 2'), a.readout);

// Kill all three of the brood: 3 killed vs 1 absorbed -> hell.
await load();
await setSprite('aggro', 0);
await broodOut();
await kill('skeptical'); await kill('aggro');
check('not over while a seed is left', (await st()).tutorial === true);
await kill('curious');
await sleep(300);
a = await st();
check('mostly killed -> hell', a.tutorial === false && a.mode === 'hell' && a.readout?.includes('killed 3, absorbed 1'), a.readout);
console.log('console errors/warnings:', logs.length ? logs : 'none');
console.log(failed ? `${failed} FAILED` : 'ALL PASS');
ws.close(); chrome.kill(); process.exit(0);
