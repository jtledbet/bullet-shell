// Shared headless-Chrome harness for the test scripts (raw CDP over Node's WebSocket).
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export async function open({ out, port, url, width = 844, height = 390, dsf = 1, mobile = false, touch = false }) {
  mkdirSync(out, { recursive: true });
  const chrome = spawn(process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${join(out, 'profile')}`,
    '--no-first-run', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank',
  ], { stdio: 'ignore' });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let target;
  for (let i = 0; i < 120 && !target; i++) {
    await sleep(250);
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page'); } catch {}
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0; const pending = new Map(); const logs = []; const infos = [];
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    if (msg.method === 'Runtime.exceptionThrown') logs.push('EXCEPTION ' + msg.params.exceptionDetails.exception?.description);
    if (msg.method === 'Runtime.consoleAPICalled') {
      const text = msg.params.args.map((a) => a.value ?? a.description).join(' ');
      if (['error', 'warning'].includes(msg.params.type)) logs.push(msg.params.type + ' ' + text);
      if (msg.params.type === 'info') infos.push(text);
    }
  };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) throw new Error('evaluate failed: ' + (r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text) + '\n  in: ' + expr.slice(0, 160));
    return r.result?.result?.value;
  };
  const shot = async (name) => { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(out, name), Buffer.from(r.result.data, 'base64')); };
  const touchEv = (type, points) => send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y, tid]) => ({ x, y, id: tid })) });
  const tap = async (x, y, tid = 1) => { await touchEv('touchStart', [[x, y, tid]]); await sleep(80); await touchEv('touchEnd', []); };
  const key = (type, k, code, vk) => send('Input.dispatchKeyEvent', { type, key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, text: type === 'keyDown' && k.length === 1 ? k : undefined });
  const press = async (k, code, vk, ms = 60) => { await key('keyDown', k, code, vk); await sleep(ms); await key('keyUp', k, code, vk); };
  const mouse = (type, x, y, button = 'left') => send('Input.dispatchMouseEvent', { type, x, y, button, buttons: type === 'mousePressed' ? (button === 'right' ? 2 : 1) : 0, clickCount: 1 });
  const click = async (x, y, button = 'left') => { await mouse('mouseMoved', x, y, 'none'); await mouse('mousePressed', x, y, button); await sleep(80); await mouse('mouseReleased', x, y, button); };
  let failed = 0;
  const check = (name, ok, detail) => { if (!ok) failed++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined && detail !== null ? '  ' + JSON.stringify(detail) : '')); };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dsf, mobile, screenOrientation: mobile ? { type: width > height ? 'landscapePrimary' : 'portraitPrimary', angle: width > height ? 90 : 0 } : undefined });
  await send('Emulation.setTouchEmulationEnabled', { enabled: touch, maxTouchPoints: 5 });
  // Waits until the game has finished loading. (Until then, window.game is the page's <div id="game">.)
  const ready = async () => {
    for (let i = 0; i < 60; i++) {
      if (await evaluate(`!!window.game?.scene?.getScene?.('game')?.sys?.isActive()`).catch(() => false)) return;
      await sleep(250);
    }
    throw new Error('the game never finished loading');
  };
  await send('Page.navigate', { url }); await sleep(4000); await ready();
  const G = `game.scene.getScene('game')`; const U = `game.scene.getScene('ui')`;
  // Screen position (CSS px) of something laid out in the UI scene.
  const uiPoint = (expr) => evaluate(`(() => { const u = ${U}, o = ${expr}, r = game.canvas.getBoundingClientRect(), k = u.cameras.main.zoom * r.width / game.canvas.width; return { x: r.left + o.x * k, y: r.top + o.y * k }; })()`);
  const menuTexts = () => evaluate(`(${U}.menu?.list ?? []).filter(o => o.type === 'Text').map(o => o.text)`);
  const uiTexts = () => evaluate(`${U}.children.list.filter(o => o.type === 'Text' && o.alpha > 0.05 && o.visible).map(o => o.text)`);
  const done = () => {
    console.log('console errors/warnings:', logs.length ? logs : 'none');
    console.log(failed ? `${failed} FAILED` : 'ALL PASS');
    ws.close(); chrome.kill(); process.exit(0);
  };
  return { send, evaluate, ready, shot, tap, touchEv, key, press, mouse, click, check, sleep, G, U, uiPoint, menuTexts, uiTexts, logs, infos, done };
}
