// Headless check of the Volcano Slime event on the real island (local debug view: ?volcano=awakened / stopped;
// nothing is reported to a server). Usage: (vite preview on :4173) node tools/volcano-test.mjs [shot.png]
import { createRequire } from 'module'; const { chromium } = createRequire(import.meta.url)('playwright');
const base = process.env.BASE || 'http://localhost:4173';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errs = []; page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); }); page.on('pageerror', (e) => errs.push('[pageerror] ' + e.message));
const res = [];
const check = (name, pass, info = {}) => { res.push({ name, pass: !!pass, ...info }); };
// ---- awakened: the boss exists, attacks hurt, hits land, the crater devours
await page.goto(`${base}/?mode=field&field=island&shot=1&low=1&volcano=awakened&lang=ja`, { timeout: 600000 });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 600000 });
const a = await page.evaluate(async () => {
  const g = window.__game, P = g.player, wait = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 40 && !g.volcanoBoss; i++) await wait(250);
  const B = g.volcanoBoss; if (!B) return { boss: false };
  const out = { boss: true, inMonsters: g.monsters.includes(B), hp: B.hp, maxHp: B.maxHp, rampage: g.volcanoRampage, flow: g.volcanoFlow };
  // stand near the boss, out of the crater
  const put = () => { const a = Math.atan2(B.position.z, B.position.x); P.position.set(Math.cos(a) * 160, 0, Math.sin(a) * 160); P.position.y = g.world.getHeight(P.position.x, P.position.z); };
  const hurtBy = {};
  for (const type of ['shot', 'slam', 'spikes', 'wave', 'rain', 'grasp', 'sweep']) {
    put(); P.hp = P.maxHp; P.setState('idle'); B.debug.hold(true); B.debug.attack(type); const hp0 = P.hp;
    for (let i = 0; i < 90; i++) { B.update(1 / 30); }
    hurtBy[type] = Math.round(hp0 - P.hp); B.debug.hold(false);
  }
  out.hurtBy = hurtBy;
  // our blows land on the body
  const h0 = B.hp; const hb = B.getHitboxes()[0]; const r = B.receiveHit({ damage: 500, part: 'body', point: hb.sphere.center.clone() }); out.hit = { dealt: r.damage, hp: h0 - B.hp };
  out.tentacles = g.scene.children.filter((o) => o.isInstancedMesh && o.count > 0).length;
  // the crater swallows
  P.hp = P.maxHp; P.setState('idle'); P.position.set(5, 0, 5); P.position.y = g.world.getHeight(5, 5);
  for (let i = 0; i < 20 && !P.dead; i++) await wait(150);
  out.devoured = !!P.dead && !!P.devoured;
  return out;
});
check('awakened: the boss rises with HP 100,000 and joins the monsters', a.boss && a.inMonsters && a.maxHp === 100000, { hp: a.hp });
check('awakened: Magma Slimes rampage, the lava has stopped', a.rampage === true && a.flow === 0);
const hb = a.hurtBy || {}; check(`boss attacks hurt the hunter (${JSON.stringify(hb)})`, Object.values(hb).filter((v) => v > 0).length >= 4, hb);
check('hunter blows damage the boss', a.hit?.dealt > 0 && a.hit.hp === a.hit.dealt, a.hit);
check('entering the crater devours the hunter', a.devoured);
await page.screenshot({ path: process.argv[2] || 'volcano.png', timeout: 600000 }).catch(() => {});
// ---- normal state: no boss, lava flows, crater still devours
await page.goto(`${base}/?mode=field&field=island&shot=1&low=1&lang=ja`, { timeout: 600000 });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 600000 });
const b = await page.evaluate(async () => { const g = window.__game, wait = (ms) => new Promise((r) => setTimeout(r, ms)); await wait(1500); return { boss: !!g.volcanoBoss, flow: g.volcanoFlow, rampage: g.volcanoRampage, guide: JSON.stringify(Object.keys(g)).includes('volcanoGuide') }; });
check('normal state: no boss, lava flowing, no rampage', !b.boss && b.flow === 1 && !b.rampage, b);
for (const r of res) console.log(r.pass ? 'ok  ' : 'FAIL', r.name, JSON.stringify(Object.fromEntries(Object.entries(r).filter(([k]) => k !== 'name' && k !== 'pass'))));
if (errs.length) console.log('errors:', errs.slice(0, 6));
const pass = res.every((r) => r.pass) && !errs.length; console.log(pass ? 'all volcano tests passed' : 'volcano tests FAILED');
await browser.close(); process.exit(pass ? 0 : 1);
