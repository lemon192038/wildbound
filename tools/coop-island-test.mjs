// Co-op on the open island (user report: a Flame Dragon attacked one hunter while the other hunter's screen showed
// nothing and took no damage). Two browsers in one island room on a local server (built dist):
//   1. all 9 island bosses are synced to the client (the host used to send only the first 4);
//   2. a boss the host moves to the hunters while the client's copy rests far away (a roaming Flame Dragon flies its
//      circuit even when out of view) wakes on the client, is drawn there and stands where the host has it;
//   3. its attack hurts the client.
// Usage: npx vite build && node tools/coop-island-test.mjs   (starts server/server.js on PORT 8094 with a temporary DB)
import { createRequire } from 'module'; import { spawn } from 'child_process'; import fs from 'fs'; import os from 'os'; import path from 'path';
const { chromium } = createRequire(import.meta.url)('playwright');
const PORT = 8094, dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-coopi-'));
const srv = spawn('node', ['--no-warnings', 'server/server.js'], { cwd: new URL('..', import.meta.url).pathname, env: { ...process.env, PORT: String(PORT), DB_PATH: path.join(dbDir, 'coop.db') }, stdio: 'ignore' });
for (let i = 0; i < 60; i++) { try { if ((await (await fetch(`http://localhost:${PORT}/healthz`)).json()).ok) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 500)); }
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errs = []; let fails = 0; const room = 'ci' + Date.now().toString(36);
const ok = (c, msg, info = '') => { if (!c) { fails++; console.log('FAIL', msg, info); } else console.log('ok  ', msg, info); };
async function open(name) { const p = await b.newPage({ viewport: { width: 320, height: 200 } }); p.setDefaultTimeout(600000); p.on('pageerror', (e) => errs.push(name + ': ' + e.message)); p.on('console', (m) => { if (/\[net\] (rejected|server error)/.test(m.text())) errs.push(name + ': ' + m.text().slice(0, 160)); });
  await p.goto(`http://localhost:${PORT}/?mode=field&field=island&online=1&room=${room}&low=1&shot=1`); await p.waitForFunction(() => window.__ready === true && window.__game?.net?.connected); return p; }
const flame = (pg, fn, arg) => pg.evaluate(new Function('arg', `const g = window.__game, f = g.monsters.find((m) => m.islandId === 'flame'); return (${fn})(g, f, arg);`), arg);
try {
  const A = await open('host'), B = await open('client');
  await A.waitForFunction(() => window.__game.monsters.length >= 9); await B.waitForFunction(() => window.__game.monsters.length >= 9); await B.waitForTimeout(3000);
  ok(await A.evaluate(() => window.__game.net.isHost) && !(await B.evaluate(() => window.__game.net.isHost)), 'one host, one client in the island room');
  const pos = (pg) => pg.evaluate(() => window.__game.monsters.map((m) => [m.islandId, m.position.x, m.position.z]));
  await B.waitForTimeout(3000); const pa = await pos(A), pb = await pos(B);
  const gaps = pa.map((a) => { const c = pb.find((x) => x[0] === a[0]); return [a[0], c ? Math.round(Math.hypot(a[1] - c[1], a[2] - c[2])) : 1e9]; });
  ok(gaps.length >= 9 && gaps.every(([, d]) => d < 30), 'all 9 island bosses stand where the host has them on the client', JSON.stringify(gaps));
  // both hunters together, 600 m from the Flame Dragon: the client copy rests
  const spot = await flame(A, '(g, f) => [f.position.x + 600 * Math.sign(-f.position.x || 1), f.position.z]');
  for (const pg of [A, B]) await pg.evaluate(([x, z]) => { const g = window.__game; g.player.position.set(x, g.world.getHeight(x, z), z); g.player.receiveHit = g.net.isHost ? () => false : g.player.receiveHit; }, spot);
  await B.waitForFunction(() => window.__game.monsters.find((m) => m.islandId === 'flame')._resting, null, { timeout: 30000 }).catch(() => null);
  ok(await flame(B, '(g, f) => !!f._resting'), 'the client copy of the far Flame Dragon rests');
  // the host's dragon comes to them (what its roaming circuit does out of view)
  await flame(A, '(g, f, [x, z]) => { f.position.x = x + 12; f.position.z = z; }', spot);
  await B.waitForFunction(() => { const g = window.__game, f = g.monsters.find((m) => m.islandId === 'flame'); return !f._resting && Math.hypot(f.position.x - g.player.position.x, f.position.z - g.player.position.z) < 30; }, null, { timeout: 30000 }).catch(() => null);
  const seen = await flame(B, '(g, f) => { let drawn = 0; f.object3d.traverse((o) => { if (o.isMesh && o.visible && o.layers.test(g.camera.layers)) drawn++; }); return { resting: !!f._resting, drawn, d: Math.round(Math.hypot(f.position.x - g.player.position.x, f.position.z - g.player.position.z)) }; }');
  ok(!seen.resting && seen.drawn > 0 && seen.d < 30, 'the client sees the dragon the host sees next to the hunters', JSON.stringify(seen));
  // its bite hurts the client
  await B.evaluate(() => { window.__dmg = 0; window.__game.events.on('player:damaged', (e) => { window.__dmg += e.amount || 0; }); });
  for (const pg of [A, B]) await flame(pg, '(g, f) => { setInterval(() => { f.alt = 0; }, 16); }'); // on the ground for the bite
  for (let k = 0; k < 4 && !(await B.evaluate(() => window.__dmg > 0)); k++) {
    const cp = await B.evaluate(() => { const p = window.__game.player.position; return [p.x, p.z]; });
    await flame(A, '(g, f, [x, z]) => { f.position.x = x + 3; f.position.z = z + 1; f.yaw = Math.atan2(x - f.position.x, z - f.position.z); f.debug.play("bite"); }', cp);
    await B.waitForFunction(() => window.__dmg > 0, null, { timeout: 15000 }).catch(() => null);
  }
  ok(await B.evaluate(() => window.__dmg > 0), `the host's dragon bite hurts the client (${Math.round(await B.evaluate(() => window.__dmg))} damage)`);
  ok(!errs.length, 'no page errors / rejected messages', JSON.stringify(errs.slice(0, 5)));
} catch (e) { fails++; console.log('ERROR', e.message); }
await b.close(); srv.kill(); fs.rmSync(dbDir, { recursive: true, force: true });
console.log(fails ? `${fails} island co-op tests FAILED` : 'all island co-op tests passed');
process.exit(fails ? 1 : 0);
