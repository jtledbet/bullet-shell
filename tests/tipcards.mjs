// The level-up cards on a phone-sized screen: each shows its explanation, and nothing spills out of its card.
import { open } from './cdp.mjs';
const t = await open({ out: process.argv[2], port: 9358, url: 'http://127.0.0.1:5173/?fullres', width: 844, height: 390, dsf: 2, mobile: true, touch: true });
const { evaluate, shot, check, sleep, G, U } = t;
await evaluate(`(() => { const s = ${G}; s.endTutorial('absorbed'); s.spawnTimer = 1e9; return true; })()`); await sleep(400);
// The three wordiest cards, to be sure the longest text fits.
const fit = await evaluate(`import('/src/upgrades.ts').then(m => { const u = ${U}, s = ${G}; const cards = [...m.UPGRADES].sort((a, b) => (b.desc + b.tip).length - (a.desc + a.tip).length).slice(0, 3);
  s.frozen = true; s.physics.pause(); u.showLevelUp(cards, () => {});
  const texts = u.menu.list.filter(o => o.type === 'Text'); const rects = u.menu.list.filter(o => o.type === 'Rectangle' && o.width < 400);
  const bottoms = rects.map(r => r.y + r.height / 2);
  return { names: cards.map(c => c.name), spill: texts.filter(x => x.y > 60).map(x => Math.round(Math.max(...bottoms) - (x.y + x.height))), tips: cards.every(c => texts.some(x => x.text === c.tip.toLowerCase())), h: Math.round(u.h) }; })`);
check('each card shows its explanation', fit.tips, fit.names);
check('the longest ones still fit inside their cards on a phone', fit.spill.every((room) => room >= 4), fit);
await shot('cards-phone.png');
t.done();
