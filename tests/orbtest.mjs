import { open } from './cdp.mjs';
const t = await open({ out: process.argv[2], port: 9347, url: 'http://127.0.0.1:5173/?fullres', dsf: 2 });
const { evaluate, shot, click, check, sleep, G, U, uiPoint, menuTexts } = t;
await evaluate(`import('/src/storage.ts').then(m => { m.setLabels(true); return true; })`);
// On the preview build (/next/), the pause menu has no orb at all.
await evaluate(`history.replaceState(null, '', '/next/?fullres')`);
await evaluate(`${G}.pauseGame()`); await sleep(600);
const n = await evaluate(`(() => { const u = ${U}; return { orb: !!u.orb, orbsInMenu: u.menu.list.filter(o => o.texture?.key === 'orb').length }; })()`);
check('on /next/: no orb in the pause menu', !n.orb && n.orbsInMenu === 0, n);
check('on /next/: no "live" caption', !(await menuTexts()).includes('live'), await menuTexts());
await shot('orb-next.png');
await evaluate(`${G}.resumeGame()`); await sleep(400);
await evaluate(`history.replaceState(null, '', '/?fullres')`);
await evaluate(`${G}.pauseGame()`); await sleep(600);
const o = await evaluate(`(() => { const u = ${U}; return { there: !!u.orb?.active, key: u.orb?.texture.key, tint: u.orb?.tintTopLeft, inMenu: u.menu.list.includes(u.orb) }; })()`);
check('pause menu has the build orb, ember-warm on the live game', o.there && o.key === 'orb' && o.tint === 0xffb866 && o.inMenu, o);
const sizes = await evaluate(`new Promise(r => { const s = new Set(); let n = 0; const f = () => { s.add(${U}.orb.displayWidth.toFixed(1)); if (++n < 40) requestAnimationFrame(f); else r(s.size); }; requestAnimationFrame(f); })`);
check('it breathes', sizes > 5, sizes);
check('labels on: it says where it leads', (await menuTexts()).includes('next'), await menuTexts());
await shot('orb.png');
// Tapping it heads for the preview build.
await evaluate(`window.__went = null; window.addEventListener('beforeunload', () => { window.__went = 'left'; })`);
const p = await uiPoint(`u.orb`);
await sleep(300);
await click(p.x, p.y); await sleep(1500);
const where = await evaluate(`location.pathname`);
check('tapping it goes to next/', where.endsWith('/next/'), where);
await evaluate(`import('/src/storage.ts').then(m => { m.setLabels(false); return true; })`).catch(() => {});
t.done();
