// Headless Chrome test for sound, mute and saved best run (raw CDP, Node 22 WebSocket).
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.argv[2];
const URL = process.env.GAME_URL || 'http://127.0.0.1:5173/';
const PORT = 9349;
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
const load = async () => { await send('Page.navigate', { url: URL }); await sleep(4000); for (let i = 0; i < 60 && !(await evaluate(`!!window.game?.scene?.getScene?.('game')?.sys?.isActive()`)); i++) await sleep(250); };
const aimFor = async (ms, tid) => { await touch('touchStart', [[600, 220, tid]]); await sleep(60); await touch('touchMove', [[670, 220, tid]]); await sleep(ms); await touch('touchEnd', []); };
const SOUND = [W - 32 - 60, 32 + 14];
const PAUSE = [W - 32 - 22, 32 + 14];

await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: +process.env.DSF || 1, mobile: true, screenOrientation: { type: 'landscapePrimary', angle: 90 } });
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await send('Emulation.setTouchEmulationEnabled', { enabled: false });
const G = `game.scene.getScene('game')`;
const mouse = (type, button, x, y) => send('Input.dispatchMouseEvent', { type, x, y, button, buttons: button === 'left' ? 1 : button === 'right' ? 2 : 0, clickCount: 1 });
const rightClick = async () => { await mouse('mousePressed', 'right', 700, 200); await sleep(60); await mouse('mouseReleased', 'right', 700, 200); await sleep(150); };
const st = () => evaluate(`(() => { const s = ${G}; return { tutorial: s.tutorial, mode: s.mode, traits: { ...s.traits }, alpha: +s.player.alpha.toFixed(2), edge: s.hardEdge.commandBuffer.length > 0,
  ability: s.lastAbility, cd: +s.abilityCooldown.toFixed(1), phase: s.phaseLeft > 0, brace: s.braceLeft > 0, hp: +s.hp.toFixed(2), damage: +s.stats.damage.toFixed(3), shots: s.bullets.getChildren().filter(b => b.active).length }; })()`);
const clearField = () => evaluate(`(() => { const s = ${G}; s.enemies.getChildren().forEach(e => e.disableBody(true, true)); s.spawnTimer = 1e9; s.hp = 100; s.invuln = 0; })()`);
const killFirst = () => evaluate(`(() => { const s = ${G}; const e = s.enemies.getChildren().find(e => e.active); e.setData('hp', 0.1); const b = s.bullets.get(); b.enableBody(true, e.x, e.y, true, true); b.setData({ pierce: 0, life: 1, hits: new Set() }); s.onBulletHit(b, e); })()`);
const hitOnce = () => evaluate(`(() => { const s = ${G}; s.invuln = 0; s.onPlayerHit(); return +s.hp.toFixed(2); })()`);

// HARD: kill the seed.
await load();
await killFirst();
await sleep(300);
await clearField();
let a = await st();
check('killing gives hard 1', a.traits.hard === 1 && a.mode === 'hell', a);
check('hard shows a dark edge', a.edge === true, a.edge);
await rightClick();
a = await st();
check('right-click with hard strongest: brace', a.ability === 'brace' && a.brace && a.cd > 5, a);
let hp = await hitOnce();
check('braced hit: 10 x 0.88 x 0.2 = 1.76 damage', Math.abs(100 - hp - 1.76) < 0.01, hp);
await rightClick();
check('cooldown blocks a second use', (await st()).ability === 'brace' && (await st()).cd > 4, await st());
await evaluate(`${G}.braceLeft = 0`);
await evaluate(`${G}.hp = 100`);
hp = await hitOnce();
check('unbraced hit with hard 1: 8.8 damage', Math.abs(100 - hp - 8.8) < 0.01, hp);

// CALM: let a curious seed in.
await load();
await evaluate(`(() => { const s = ${G}; const e = s.enemies.getChildren().find(e => e.active); e.setData('mood', 'curious'); e.body.reset(s.player.x, s.player.y); s.showMood(e, false); })()`);
for (let i = 0; i < 80 && (await st()).tutorial; i++) await sleep(100);
await clearField();
await sleep(200);
a = await st();
check('letting a calm seed in gives calm 1', a.traits.calm === 1 && a.mode === 'heaven', a);
check('calm fades the core (alpha 0.88)', a.alpha === 0.88, a.alpha);
await rightClick();
a = await st();
check('right-click with calm strongest: phase', a.ability === 'phase' && a.phase, a);
hp = await hitOnce();
check('phasing: no damage', hp === 100, hp);
const passes = await evaluate(`(() => { const s = ${G}; const b = s.enemyBullets.get(); b.enableBody(true, s.player.x, s.player.y, true, true); b.setData('life', 4); s.onEnemyBullet(b); return b.active; })()`);
check('phasing: enemy shots pass through', passes === true, passes);
const dodge = await evaluate(`(() => { const s = ${G}; s.phaseLeft = 0; s.traits.calm = 4; let passed = 0; for (let i = 0; i < 400; i++) { s.invuln = 0; s.hp = 100; s.onPlayerHit(); if (s.hp === 100) passed++; } return passed / 400; })()`);
check('calm 4: about 48% of hits pass through', dodge > 0.38 && dodge < 0.58, dodge);

// RAGE: rage points boost shot damage at the end of the tutorial; right-click fires a ring.
await load();
await evaluate(`(() => { const s = ${G}; s.traits.rage = 2; s.lastTrait = 'rage'; s.endTutorial('absorbed'); })()`);
await clearField();
await evaluate(`${G}.bullets.getChildren().forEach(b => b.disableBody(true, true))`);
a = await st();
check('rage 2: shot damage x1.3', a.damage === 1.82, a.damage);
await rightClick();
a = await st();
check('right-click with rage strongest: the burst', a.ability === 'burst', a);

// Nothing before the tutorial is over, and nothing with no traits.
await load();
await rightClick();
check('right-click does nothing during the tutorial', (await st()).ability === null);
console.log('console errors/warnings:', logs.length ? logs : 'none');
console.log(failed ? `${failed} FAILED` : 'ALL PASS');
ws.close(); chrome.kill(); process.exit(0);
