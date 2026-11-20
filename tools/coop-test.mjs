// Co-op hit test: two browsers in one room on a local server (built dist). The NON-host attacks Varkhul with a sword
// and then a bow; the HOST must apply the damage (body HP and part HP) through its hit validation (src/net/hitcheck.js).
// Usage: npx vite build && node tools/coop-test.mjs   (starts server/server.js on PORT 8091 with a temporary DB)
import { createRequire } from 'module'; import { spawn } from 'child_process'; import fs from 'fs'; import os from 'os'; import path from 'path';
const { chromium } = createRequire(import.meta.url)('playwright');
const PORT = 8091, dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-coop-'));
const srv = spawn('node', ['--no-warnings', 'server/server.js'], { cwd: new URL('..', import.meta.url).pathname, env: { ...process.env, PORT: String(PORT), DB_PATH: path.join(dbDir, 'coop.db') }, stdio: 'ignore' });
for (let i = 0; i < 60; i++) { try { if ((await (await fetch(`http://localhost:${PORT}/healthz`)).json()).ok) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 500)); }
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errs = []; let fails = 0; const room = 'ct' + Date.now().toString(36);
const ok = (c, msg, info = '') => { if (!c) { fails++; console.log('FAIL', msg, info); } else console.log('ok  ', msg, info); };
async function open(name, q) { const p = await b.newPage({ viewport: { width: 640, height: 400 } }); p.setDefaultTimeout(600000); p.on('pageerror', (e) => errs.push(name + ': ' + e.message)); p.on('console', (m) => { if (/\[net\] rejected/.test(m.text())) errs.push(name + ': ' + m.text().slice(0, 160)); });
  await p.goto(`http://localhost:${PORT}/?${q}`); await p.waitForFunction(() => window.__ready === true && window.__game?.net?.connected); return p; }
try {
  const A = await open('host', `mode=field&hunt=varkhul&online=1&room=${room}&low=1&shot=1&monsterFreeze=1`);
  await A.evaluate(() => { window.__nh = []; window.__game.events.on('net:hit', (e) => window.__nh.push(e)); });
  const B = await open('client', `mode=field&hunt=varkhul&online=1&room=${room}&low=1&shot=1`);
  await B.waitForTimeout(3000); // the client's copy of the boss takes its place from the host's snapshots
  ok(await A.evaluate(() => window.__game.net.isHost) && !(await B.evaluate(() => window.__game.net.isHost)), 'one host, one client in the room');
  const snap = () => A.evaluate(() => { const m = window.__game.monsters[0]; return { hp: m.hp, parts: Object.fromEntries(m.parts.map((p) => [p.name, p.hp])), nh: window.__nh.map((e) => e.motion) }; });
  async function attack(cls, dist, sec) {
    return B.evaluate(async ({ cls, dist, sec }) => { const g = window.__game, P = g.player, m = g.monsters[0], w = (ms) => new Promise((r) => setTimeout(r, ms));
      P.setWeaponClass(cls); P.receiveHit = () => false; await w(300); // the boss may still swing at the client: keep the test about the client's own hits
      const place = () => { const hb = m.getHitboxes().reduce((a, b) => (b.sphere.radius > a.sphere.radius ? b : a)); const c = hb.sphere.center; const x = c.x + hb.sphere.radius + dist;
        P.position.set(x, g.world.getHeight(x, c.z), c.z); P.facing = Math.atan2(c.x - P.position.x, c.z - P.position.z); P.lockTarget = m; };
      let hits = 0; const off = g.events.on('hit', (e) => { if (e.attacker === 'local') hits++; });
      const t0 = performance.now(); while (performance.now() - t0 < sec * 1000) { if (/^(idle|walk|run)$/.test(P.state) || !P.state.startsWith(cls === 'bow' ? 'bw' : 'sw')) place(); g.input.mouse.leftPressed = true; await w(250); } // re-stand before each new chain
      off?.(); window.__dbg = { st: P.state, d: +P.position.distanceTo(m.position).toFixed(1), mp: m.position.toArray().map((v) => +v.toFixed(1)), drawn: P.weaponDrawn }; return hits; }, { cls, dist, sec });
  }
  const s0 = await snap();
  const hs = await attack('sword', 0.6, 16); console.log('  client after sword:', JSON.stringify(await B.evaluate(() => window.__dbg)), 'host boss at', JSON.stringify(await A.evaluate(() => window.__game.monsters[0].position.toArray().map((v) => +v.toFixed(1))))); await A.waitForTimeout(3000); const s1 = await snap();
  const melee = s1.nh.filter((m) => m.startsWith('sw_')).length;
  ok(hs > 0 && melee > 0 && (s1.hp < s0.hp || Object.keys(s0.parts).some((k) => s1.parts[k] < s0.parts[k])), `client sword hits (${hs}) are applied by the host (${melee} accepted, HP ${s0.hp} → ${Math.round(s1.hp)})`);
  const ha = await attack('bow', 14, 24); console.log('  client after bow:', JSON.stringify(await B.evaluate(() => ({ ...window.__dbg, ammo: window.__game.player.res?.ammo, lock: !!window.__game.player.lockTarget })))); await A.waitForTimeout(5000); const s2 = await snap();
  const arrows = s2.nh.filter((m) => m === 'arrow').length; const partDmg = Object.keys(s1.parts).filter((k) => s2.parts[k] < s1.parts[k]);
  ok(ha > 0 && arrows > 0 && (s2.hp < s1.hp || partDmg.length), `client arrows (${ha}) from 14 m are applied by the host (${arrows} accepted; parts hurt: ${partDmg.join(', ') || '—'})`);
  // part status is shared (user request): the client's copy shows the host's part HP, breaks and regrowth
  const partsOf = (pg) => pg.evaluate(() => Object.fromEntries(window.__game.monsters[0].parts.filter((p) => p.breakable).map((p) => [p.name, [Math.round((p.hp / p.maxHp) * 100), p.broken ? 1 : 0]])));
  await A.evaluate(() => { const m = window.__game.monsters[0]; const t = m.parts.find((p) => p.breakable && p.name === 'tail') || m.parts.find((p) => p.breakable); t.hp = t.maxHp * 0.37; window.__tp = t.name; });
  await B.waitForFunction((n) => { const p = window.__game.monsters[0].parts.find((x) => x.name === n); return p && p.hp / p.maxHp < 0.5; }, await A.evaluate(() => window.__tp), { timeout: 10000 }).catch(() => null); let hp = await partsOf(A), cp = await partsOf(B); const tn = await A.evaluate(() => window.__tp);
  ok(Math.abs(hp[tn][0] - cp[tn][0]) <= 1 && cp[tn][0] < 50, `client sees the host's part HP (${tn}: host ${hp[tn][0]} % / client ${cp[tn][0]} %)`);
  await B.waitForFunction(() => /wb-pt-heavy|wb-pt-hurt/.test(document.querySelector('.wb-parts')?.innerHTML || ''), null, { timeout: 8000 }).catch(() => null); // the HUD redraws on the client's (slow, headless) frames
  const hud = await B.evaluate(() => { const e = document.querySelector('.wb-parts'); return { n: document.querySelectorAll('.wb-parts').length, hidden: e?.classList.contains('wb-hidden'), html: (e?.innerHTML || '').replace(/<[^>]+>/g, ' ').slice(0, 160), cls: [...(e?.querySelectorAll('.wb-pt') || [])].map((x) => x.className).join(' ') }; });
  ok(!hud.hidden && /wb-pt-heavy|wb-pt-hurt/.test(hud.cls), 'the client HUD part list shows the damaged part', JSON.stringify(hud));
  await A.evaluate(() => { const m = window.__game.monsters[0]; m.receiveHit({ damage: 1e5, part: window.__tp, attackerId: 'local', motion: 'heavy', point: m.position.clone() }); });
  await B.waitForFunction((n) => window.__game.monsters[0].parts.find((p) => p.name === n)?.broken, tn, { timeout: 10000 }).catch(() => null); cp = await partsOf(B); hp = await partsOf(A);
  ok(hp[tn][1] === 1 && cp[tn][1] === 1, `a break on the host shows on the client (${tn})`, JSON.stringify({ host: hp[tn], client: cp[tn] }));
  await A.evaluate(() => { const p = window.__game.monsters[0].parts.find((x) => x.name === window.__tp); p.broken = false; p.regenT = 0; p.hp = p.maxHp * 0.6; }); // what tickRegen does (the host's AI is frozen in this test)
  await B.waitForFunction((n) => !window.__game.monsters[0].parts.find((p) => p.name === n)?.broken, tn, { timeout: 10000 }).catch(() => null); cp = await partsOf(B); hp = await partsOf(A);
  ok(hp[tn][1] === 0 && cp[tn][1] === 0, `the part regrows on the client too (${tn})`, JSON.stringify({ host: hp[tn], client: cp[tn] }));
  ok(!errs.length, 'no page errors / rejected hits', JSON.stringify(errs.slice(0, 5)) + (errs.length ? ' ' + JSON.stringify(await A.evaluate(() => window.__game.net.lastReject)) : ''));
} catch (e) { fails++; console.log('ERROR', e.message); }
await b.close(); srv.kill(); fs.rmSync(dbDir, { recursive: true, force: true });
console.log(fails ? `${fails} co-op tests FAILED` : 'all co-op tests passed');
process.exit(fails ? 1 : 0);
