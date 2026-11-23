import { open } from './cdp.mjs';
// --- Phone: the shop fits, words and all, clear of the corner buttons.
const [out, w, h] = [process.argv[2], +process.argv[3], +process.argv[4]];
{
  const p = await open({ out, port: 9371, url: 'http://127.0.0.1:5173/?fullres', width: w, height: h, dsf: 1, mobile: true, touch: true });
  const { evaluate, shot, check, sleep, G, U } = p;
  await evaluate(`(() => { const s = ${G}; s.traits = { hard: 0, calm: 2, rage: 0 }; s.lastTrait = 'calm'; s.endTutorial('absorbed'); s.traits = { hard: 0, calm: 2, rage: 0 }; s.lastTrait = 'calm';
    s.spawnTimer = 1e9; s.fireCooldown = 1e9; s.rescued = true; s.purse = 30; return true; })()`);
  await sleep(600);
  // The longest words the shop has: both new weapons, side by side.
  await evaluate(`import('/src/shop.ts').then(sh => { const s = ${G}; s.openShop(); s.offers = ['Flare', 'Shotgun', 'Spite', 'Purse'].map(n => sh.SHOP_ITEMS.find(x => x.name === n)); ${U}.buildMenu(); return true; })`);
  await sleep(500);
  const fit = await evaluate(`(() => { const u = ${U}; const list = u.menu.list; const cards = list.filter(o => o.type === 'Rectangle' && o.input && o.height > 100);
    const texts = list.filter(o => o.type === 'Text' && o.visible);
    const inside = (t, c) => { const b = t.getBounds(); return b.left >= c.x - c.width / 2 - 0.5 && b.right <= c.x + c.width / 2 + 0.5 && b.top >= c.y - c.height / 2 && b.bottom <= c.y + c.height / 2; };
    const onCard = texts.filter(t => cards.some(c => Math.abs(t.x - c.x) < 1));
    const out = onCard.filter(t => !cards.some(c => Math.abs(t.x - c.x) < 1 && inside(t, c))).map(t => t.text);
    const hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    const fs = u.fsBtn ? u.fsBtn.getBounds() : null; const overlapFs = fs ? cards.some(c => { const b = c.getBounds(); return hit(b, fs); }) : false;
    const buttons = list.filter(o => o.type === 'Rectangle' && o.input && o.height < 60);
    const overlapBtn = buttons.some(b => cards.some(c => hit(b.getBounds(), c.getBounds())));
    const bottom = Math.max(...buttons.map(b => b.getBounds().bottom));
    const tips = onCard.filter(t => t.style.fontSize === '12px').map(t => t.text.slice(0, 12));
    return { cards: cards.length, out, overlapFs, overlapBtn, bottom: Math.round(bottom), h: u.h, tips }; })()`);
  check(`${w}x${h}: four cards, every word inside its card`, fit.cards === 4 && fit.out.length === 0, fit);
  check(`${w}x${h}: cards clear of the fullscreen button and the buttons below`, !fit.overlapFs && !fit.overlapBtn && fit.bottom <= fit.h, fit);
  if (w === 844) check('844x390: every card has room for its plain-words line', fit.tips.length === 4, fit);
  await shot(`shop-${w}.png`);
  p.done();
}
