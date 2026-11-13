// Automated combat test: a light attack against a monster stub must reduce its HP and emit a 'hit' event.
// Usage: node src/player/__test.mjs   (uses BASE or http://localhost:5203; starts vite on 5203 if nothing is listening)
import { createRequire } from 'module';
import { spawn } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:5203';
let server = null;
const up = async () => { try { await fetch(BASE + '/src/player/__harness.html'); return true; } catch { return false; } };
if (!(await up())) {
  server = spawn('npx', ['vite', '--port', new URL(BASE).port || '5203', '--strictPort'], { cwd: new URL('../..', import.meta.url).pathname, stdio: 'ignore' });
  for (let i = 0; i < 60 && !(await up()); i++) await new Promise((r) => setTimeout(r, 500));
}
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 480, height: 300 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
let ok = false, detail = {};
try {
  await page.goto(BASE + '/src/player/__harness.html?shot=1&flat=1', { timeout: 180000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
  await page.evaluate(() => {
    const g = window.__game, P = g.player, m = g.monsters[0];
    window.__hits = []; g.events.on('hit', (h) => window.__hits.push({ attacker: h.attacker, damage: h.damage, isTarget: h.target === m, part: h.part }));
    P.debug.setDrawn(true);
    const f = P.facing; m.position.set(P.position.x + Math.sin(f) * 2.4, 1.4, P.position.z + Math.cos(f) * 2.4);
    window.__hp0 = m.hp;
    g.input.mouse.leftPressed = true; // press light attack through the real input path
  });
  await page.waitForFunction(() => window.__game.monsters[0].hits.length > 0, null, { timeout: 120000 }).catch(() => {});
  detail = await page.evaluate(() => { const m = window.__game.monsters[0]; return { hp0: window.__hp0, hp: m.hp, receiveHit: m.hits.map((h) => ({ dmg: Math.round(h.damage), part: h.part, attackerId: h.attackerId, hasPoint: !!h.point, hasNormal: !!h.normal })), events: window.__hits, state: window.__game.player.state, sharp: window.__game.player.sharpness }; });
  ok = detail.hp < detail.hp0 && detail.receiveHit.length >= 1 && detail.receiveHit[0].attackerId === 'local' && detail.events.some((e) => e.attacker === 'local' && e.isTarget) && detail.sharp < 1;
} catch (e) { detail.error = e.message; }
console.log(JSON.stringify({ pass: ok, ...detail, errors }, null, 1));
await browser.close(); server?.kill();
process.exit(ok && !errors.length ? 0 : 1);
