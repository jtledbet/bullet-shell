// Duncan's note 5 (2026-11-23), Max's call "by tree": every level-up card wears its tree's colour,
// like the shop's cards, and every card carries a small icon for what it does.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { open } from './cdp.mjs';

const TREES = { rage: ['Quick Trigger', 'Heavy Rounds', 'Split Shot', 'Siphon'], hard: ['Piercing', 'Plating', 'Long Barrel'], calm: ['Fleet of Foot', 'Magnet', 'Field Medic'] };

// What a card screen shows: each card's frame and lines, and the badge on its top edge.
const READ = (U) => `(() => { const u = ${U}; const list = u.menu.list; const hex = (n) => n.toString(16).padStart(6, '0');
  const cards = list.filter(o => o.type === 'Rectangle' && o.input && o.height > 100);
  const title = list.find(o => o.type === 'Text' && o.style.fontSize === '32px') || list.find(o => o.type === 'Text' && /shop/.test(o.text));
  const fs = u.fsBtn ? u.fsBtn.getBounds() : null;
  return { h: u.h, titleBottom: title ? Math.round(title.getBounds().bottom) : null, fs: fs && { left: Math.round(fs.left), bottom: Math.round(fs.bottom) }, cards: cards.map(c => {
    const top = c.y - c.height / 2; const on = (o) => Math.abs(o.x - c.x) < 1;
    const name = list.find(o => o.type === 'Text' && on(o) && o.style.fontStyle === 'bold' && o.y >= top && o.y < top + 30);
    const lines = list.filter(o => o.type === 'Text' && on(o) && o !== name && o.y > top && o.y < c.y + c.height / 2 - 20);
    const ring = list.find(o => o.type === 'Arc' && on(o)); const mark = list.find(o => o.type === 'Image' && on(o));
    return { name: name && name.text, stroke: hex(c.strokeColor), desc: lines[0] && lines[0].style.color.slice(1), top: Math.round(top),
      ring: ring ? { y: Math.round(ring.y), r: ring.radius, stroke: hex(ring.strokeColor), alpha: ring.strokeAlpha } : null,
      mark: mark ? { key: mark.texture.key, tint: hex(mark.tintTopLeft), alpha: mark.alpha, w: Math.round(mark.displayWidth), right: Math.round(c.x + 14) } : null }; }) }; })()`;

const run = async (w, h, port, phone) => {
  const t = await open({ out: process.argv[2] + (phone ? '-phone' : ''), port, url: 'http://127.0.0.1:5173/?fullres', width: w, height: h, dsf: 1, ...(phone ? { mobile: true, touch: true } : {}) });
  const { evaluate, shot, check, sleep, G, U } = t;
  const tag = `${w}x${h}`;
  await evaluate(`(() => { const s = ${G}; s.traits = { hard: 0, calm: 2, rage: 0 }; s.lastTrait = 'calm'; s.endTutorial('absorbed'); s.spawnTimer = 1e9; s.fireCooldown = 1e9; s.rescued = true; return true; })()`);
  await sleep(500);
  const colours = await evaluate(`import('/src/traits.ts').then(m => Object.fromEntries(Object.entries(m.TRAIT_COLOURS).map(([k, v]) => [k, v.toString(16).padStart(6, '0')])))`);

  if (!phone) {
    // ---- The cards themselves: a tree each, an icon each, and every icon drawn.
    const data = await evaluate(`Promise.all([import('/src/upgrades.ts'), import('/src/shop.ts')]).then(([up, sh]) => {
      const drawn = (key) => { if (!game.textures.exists(key)) return 0; const c = game.textures.get(key).getSourceImage().getContext('2d'); const d = c.getImageData(0, 0, c.canvas.width, c.canvas.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 128) n++; return n / (d.length / 4); };
      const all = [...up.UPGRADES, ...sh.SHOP_ITEMS];
      const icons = [...new Set(all.map(c => c.icon))];
      return { trees: up.UPGRADES.map(c => [c.name, c.trait]), noIcon: all.filter(c => !c.icon).map(c => c.name), cover: Object.fromEntries(icons.map(i => [i, +drawn('icon-' + i).toFixed(2)])) }; })`);
    const wrong = data.trees.filter(([n, tr]) => !(TREES[tr] || []).includes(n));
    check('every level-up card grows one tree: rage 4, hard 3, calm 3, as proposed', wrong.length === 0 && data.trees.length === 10, { wrong, trees: data.trees });
    check('every card, level-up and shop, has an icon', data.noIcon.length === 0, data.noIcon);
    check('every icon is drawn (a visible shape, not a blank or a filled square)', Object.values(data.cover).every((f) => f > 0.08 && f < 0.7), data.cover);
  }

  // ---- Level up: one card from each tree.
  await evaluate(`import('/src/upgrades.ts').then(m => { const u = ${U}, s = ${G}; s.frozen = true; s.physics.pause(); u.showLevelUp(['Heavy Rounds', 'Plating', 'Magnet'].map(n => m.UPGRADES.find(c => c.name === n)), () => {}); return true; })`);
  await sleep(300);
  const lv = await evaluate(READ(U));
  // (On screen every word is lowercase.)
  const want = { 'heavy rounds': ['rage', 'damage'], plating: ['hard', 'guard'], magnet: ['calm', 'pickup'] };
  const off = lv.cards.filter((c) => { const [tr, icon] = want[c.name] || []; const col = colours[tr];
    return !(c.stroke === col && c.desc === col && c.ring && c.ring.stroke === col && c.mark && c.mark.key === 'icon-' + icon && c.mark.tint === col); });
  check(`${tag} level up: each card in its tree's colour (frame, line, badge, icon)`, lv.cards.length === 3 && off.length === 0, lv.cards);
  check(`${tag} level up: the badge sits on the card's top edge, clear of the title`, lv.cards.every((c) => c.ring && c.ring.y === c.top && c.top - c.ring.r > lv.titleBottom), { titleBottom: lv.titleBottom, cards: lv.cards.map((c) => [c.top, c.ring && c.ring.r]) });
  await shot(`levelup${phone ? '-phone' : ''}.png`);

  if (!phone) {
    // A card that grows no tree (the second wind's) stays plain teal, with no badge.
    await evaluate(`${U}.showCards('Second wind', [{ name: 'Plain', desc: 'a line', tip: 'a tip', kind: 'clear' }], () => {})`);
    await sleep(200);
    const plain = await evaluate(READ(U));
    check('a card with no tree stays teal and has no badge', plain.cards.length === 1 && plain.cards[0].stroke === '5eead4' && !plain.cards[0].ring && !plain.cards[0].mark, plain.cards);
    // The other icons, for a look: shots (arrow), speed (chevrons), health (plus).
    await evaluate(`import('/src/upgrades.ts').then(m => { ${U}.showLevelUp(['Split Shot', 'Fleet of Foot', 'Field Medic'].map(n => m.UPGRADES.find(c => c.name === n)), () => {}); return true; })`);
    await sleep(200); await shot('levelup-2.png');
  }

  // ---- The shop: every offer has its badge; one you can't afford is dimmed, badge and all.
  await evaluate(`import('/src/shop.ts').then(sh => { const s = ${G}; ${U}.closeMenu(); s.frozen = false; s.physics.resume(); s.purse = 30; s.openShop(); s.offers = ['Flare', 'Thick Skin', 'Lingering Charm', 'Purse'].map(n => sh.SHOP_ITEMS.find(x => x.name === n)); ${U}.buildMenu(); return true; })`);
  await sleep(400);
  const sh = await evaluate(READ(U));
  const icons = { flare: 'weapon', 'thick skin': 'guard', 'lingering charm': 'charm', purse: 'pickup' };
  check(`${tag} shop: every offer has its icon, in its colour`, sh.cards.length === 4 && sh.cards.every((c) => c.mark && c.mark.key === 'icon-' + icons[c.name] && c.ring && c.mark.tint === c.stroke), sh.cards);
  const flare = sh.cards.find((c) => c.name === 'flare'), purse = sh.cards.find((c) => c.name === 'purse');
  check(`${tag} shop: too dear (Flare, 40) is dimmed, badge too; affordable (Purse, 20) is not`, flare.mark.alpha < 0.5 && flare.ring.alpha < 0.5 && purse.mark.alpha === 1, { flare, purse });
  check(`${tag} shop: no title, and the badges clear of the fullscreen button`, sh.titleBottom === null && sh.cards.every((c) => (!sh.fs || c.top - c.ring.r > sh.fs.bottom || c.mark.right < sh.fs.left)), { titleBottom: sh.titleBottom, fs: sh.fs, tops: sh.cards.map((c) => c.top) });
  await shot(`shop${phone ? '-phone' : ''}.png`);
  t.done();
};

// The phone is its own browser (each run ends its process): this script runs itself for it, and passes its lines on.
if (process.argv[3] === 'phone') await run(667, 375, 9376, true);
else {
  const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), process.argv[2], 'phone'], { encoding: 'utf-8' });
  process.stdout.write(r.stdout + r.stderr);
  await run(844, 390, 9375, false);
}
