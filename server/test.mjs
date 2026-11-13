// Self-contained server test: `node server/test.mjs`. Starts the server on a random port
// (in-process), drives raw ws clients, exits non-zero on failure.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { startServer } from './server.js';
import { createHitValidator, motionValue, ATTACK_POWER, DPS_BURST } from '../src/net/hitcheck.js';

// throwaway dist dir so static tests don't depend on a build
const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-dist-'));
fs.mkdirSync(path.join(dist, 'assets'));
fs.writeFileSync(path.join(dist, 'index.html'), '<!doctype html><title>wb</title>');
fs.writeFileSync(path.join(dist, 'assets', 'app.js'), 'console.log(1)');
fs.writeFileSync(path.join(dist, '.secret'), 'nope');
fs.writeFileSync(path.join(path.dirname(dist), 'wb-outside.txt'), 'outside');

const logs = [];
const srv = startServer({ port: 0, host: '127.0.0.1', distDir: dist, log: (l) => logs.push(l) });
const port = await srv.ready;
let passed = 0, failed = 0;
const ok = (cond, label) => { if (cond) { passed++; console.log('  ok  ', label); } else { failed++; console.log('  FAIL', label); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function client(name, room) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const c = { ws, msgs: [], name };
  ws.on('message', (d) => c.msgs.push(JSON.parse(d.toString())));
  c.open = new Promise((r, j) => { ws.once('open', r); ws.once('error', j); });
  c.closed = new Promise((r) => ws.once('close', (code) => r(code)));
  c.send = (o) => ws.send(typeof o === 'string' ? o : JSON.stringify(o));
  c.wait = async (pred, ms = 2000) => {
    const t0 = Date.now();
    for (;;) { const m = c.msgs.find(pred); if (m) return m; if (Date.now() - t0 > ms) return null; await sleep(10); }
  };
  c.hello = async () => { await c.open; c.send({ t: 'hello', n: name, r: room }); return c.wait((m) => m.t === 'welcome'); };
  return c;
}
function get(p, raw = false) {
  return new Promise((r) => {
    const req = http.request({ host: '127.0.0.1', port, path: p, method: 'GET' }, (res) => {
      let b = ''; res.on('data', (d) => (b += d)); res.on('end', () => r({ status: res.statusCode, type: res.headers['content-type'], body: b }));
    });
    req.on('error', (e) => r({ status: 0, body: e.message }));
    if (raw) req.path = p; // keep un-normalized path
    req.end();
  });
}

try {
  console.log('static');
  const h = await get('/healthz'); ok(h.status === 200 && JSON.parse(h.body).app === 'wildbound', 'healthz json');
  const idx = await get('/'); ok(idx.status === 200 && idx.type.startsWith('text/html'), 'index.html served as text/html');
  const js = await get('/assets/app.js'); ok(js.status === 200 && js.type.startsWith('text/javascript'), 'js MIME');
  const spa = await get('/hub/quest'); ok(spa.status === 200 && spa.body.includes('<title>wb'), 'SPA fallback for route');
  const miss = await get('/assets/missing.js'); ok(miss.status === 404, 'missing asset is 404 (no fallback)');
  const trav1 = await get('/../wb-outside.txt'); ok(!trav1.body.includes('outside'), 'path traversal ../ blocked');
  const trav2 = await get('/%2e%2e/wb-outside.txt'); ok(!trav2.body.includes('outside'), 'path traversal %2e%2e blocked');
  const trav3 = await get('/..%2fwb-outside.txt'); ok(!trav3.body.includes('outside'), 'path traversal ..%2f blocked');
  const dot = await get('/.secret'); ok(dot.status === 404 && !dot.body.includes('nope'), 'dotfile hidden');
  const nul = await get('/index.html%00.js'); ok(nul.status === 400, 'NUL byte rejected');

  console.log('rooms');
  const a = client('Alice'), b = client('Bob'), c = client('Cara');
  const wa = await a.hello();
  const wb = await b.hello();
  const wc = await c.hello();
  ok(wa && wb && wc, 'all three welcomed');
  ok(wa.r === wb.r && wb.r === wc.r, `auto-matchmade into same room (${wa.r})`);
  ok(wa.h === wa.i && wb.h === wa.i && wc.h === wa.i, 'first joiner is host');
  ok(wc.pl.length === 2 && wc.pl.some(([, n]) => n === 'Alice'), 'welcome lists existing players');
  ok(await a.wait((m) => m.t === 'join' && m.i === wc.i), 'host notified of join');
  // 4th and 5th: room size cap 4
  const d = client('Dan'), e = client('Eve');
  const wd = await d.hello(); const we = await e.hello();
  ok(wd.r === wa.r && we.r !== wa.r, `room capped at 4 (5th went to ${we.r})`);
  const named = client('Fay', 'MyHunt'); const wf = await named.hello();
  ok(wf.r === 'myhunt' && wf.h === wf.i, '?room=NAME joins/creates named room');

  console.log('relay');
  a.send({ t: 'p', x: [1, 2, 3, 0.5], s: { st: 'run', hp: 90, __proto__x: 1, ['__proto__']: { polluted: true }, nested: { constructor: 1, ok: 2 } } });
  const sb = await b.wait((m) => m.t === 's' && m.p.some((r) => r[0] === wa.i));
  const row = sb && sb.p.find((r) => r[0] === wa.i);
  ok(row && row[1][0] === 1 && row[1][3] === 0.5 && row[2].st === 'run', 'player snapshot relayed to peer');
  ok(row && !Object.prototype.hasOwnProperty.call(row[2], '__proto__') && row[2].nested.ok === 2 && !Object.keys(row[2].nested).includes('constructor') && !Object.keys(row[2]).includes('__proto__') && ({}).polluted === undefined, 'prototype keys stripped');
  ok(!a.msgs.some((m) => m.t === 's' && m.p.some((r) => r[0] === wa.i)), 'sender does not receive own snapshot');
  ok(!e.msgs.some((m) => m.t === 's'), 'other room does not receive snapshot');
  a.send({ t: 'p', x: [1e12, NaN, 'x', 0], s: {} });
  const sb2 = await b.wait((m) => m.t === 's' && m.p.some((r) => r[0] === wa.i && r[1][0] === 1e6));
  ok(sb2, 'numbers clamped (1e12 -> 1e6)');
  a.send({ t: 'm', s: [{ hp: 500, st: 'idle' }] });
  ok(await c.wait((m) => m.t === 's' && m.m && m.m[0].hp === 500), 'host monster snapshot relayed');
  b.send({ t: 'm', s: [{ hp: 1 }] });
  await sleep(150);
  ok(!c.msgs.some((m) => m.m && m.m[0].hp === 1), 'non-host monster snapshot ignored');
  console.log('hit intents (server)');
  b.send({ t: 'hit', mo: 'light1', lv: 0, pt: 'head', mi: 0, p: [0, 1, 0] });
  await sleep(100);
  ok(!a.msgs.some((m) => m.t === 'hit') && logs.some((l) => l.includes(`id=${wb.i}`) && l.includes('reason=hit_without_position')),
    'hit before any position snapshot dropped + logged');
  b.send({ t: 'p', x: [0, 0, 0, 0], s: { s: 'light1' } });
  await sleep(80);
  b.send({ t: 'hit', d: 1e9, pt: 'head', mi: 0, p: [0, 1, 0] });
  ok(await b.wait((m) => m.t === 'err' && m.m === 'bad_hit'), 'legacy damage-only hit rejected (bad_hit)');
  ok(logs.some((l) => l.includes('reason=hit_malformed')), 'malformed hit logged');
  b.send({ t: 'hit', mo: 'heavy', lv: 9, d: 1e9, pt: 'head', mi: 0, p: [1, 1.5, 2], sh: 5, ts: Date.now() });
  const hit = await a.wait((m) => m.t === 'hit');
  ok(hit && hit.i === wb.i && hit.mo === 'heavy' && hit.lv === 3 && hit.sh === 1 && hit.pt === 'head' && !('d' in hit),
    'hit intent forwarded to host: no damage field, charge/sharpness clamped');
  ok(!c.msgs.some((m) => m.t === 'hit'), 'hit not sent to other non-hosts');
  b.send({ t: 'hit', mo: 'light2', pt: 'head', mi: 0, p: [40, 1, 0] });
  await sleep(100);
  ok(a.msgs.filter((m) => m.t === 'hit').length === 1 && logs.some((l) => l.includes('reason=hit_out_of_reach')), 'out-of-reach hit (40m) dropped + logged');
  b.send({ t: 'hit', mo: 'light2', pt: 'head', mi: 0, p: [1, 1, 0], ts: Date.now() - 60000 });
  await sleep(100);
  ok(a.msgs.filter((m) => m.t === 'hit').length === 1 && logs.some((l) => l.includes('reason=hit_stale')), 'stale hit dropped + logged');
  d.send({ t: 'p', x: [0, 0, 0, 0], s: {} }); await sleep(80);
  for (let i = 0; i < 20; i++) d.send({ t: 'hit', mo: 'light1', pt: 'head', mi: 0, p: [1, 1, 0] });
  await sleep(150);
  const dHits = a.msgs.filter((m) => m.t === 'hit' && m.i === wd.i).length;
  ok(dHits <= 7 && dHits >= 5 && logs.some((l) => l.includes(`id=${wd.i}`) && l.includes('reason=hit_rate')), `hit flood clamped (${dHits}/20 forwarded) + logged`);
  a.send({ t: 'sus', i: wb.i, r: 'dps_cap' }); b.send({ t: 'sus', i: wc.i, r: 'framed' });
  await sleep(100);
  ok(logs.some((l) => l.includes('host_rejected:dps_cap') && l.includes(`reporter=${wa.i}`)) && !logs.some((l) => l.includes('framed')),
    'host rejection reports logged; non-host reports ignored');
  a.send({ t: 'ev', e: 'break', mi: 0, pt: 'tail' });
  ok(await b.wait((m) => m.t === 'ev' && m.e === 'break' && m.pt === 'tail'), 'host part-break broadcast');
  b.send({ t: 'ev', e: 'death', mi: 0 });
  await sleep(100);
  ok(!c.msgs.some((m) => m.t === 'ev' && m.e === 'death'), 'non-host events ignored');

  console.log('validation');
  b.send(JSON.stringify({ t: 'chat', x: 'x'.repeat(5000) }));
  ok(await b.wait((m) => m.t === 'err' && m.m === 'too_big'), 'oversized (>4KB) message rejected');
  ok(b.ws.readyState === WebSocket.OPEN, 'connection survives a single oversize strike');
  b.send('not json'); ok(await b.wait((m) => m.t === 'err' && m.m === 'bad_json'), 'bad json rejected');
  b.send({ t: 'evalme' }); ok(await b.wait((m) => m.t === 'err' && m.m === 'unknown_type'), 'unknown type dropped');
  b.send({ t: 'ping', c: 123 }); ok(await b.wait((m) => m.t === 'pong' && m.c === 123), 'ping/pong');

  console.log('chat');
  await sleep(450);
  c.send({ t: 'chat', x: '  <script>alert(1)</script>\u0000‮ hello\n\tworld ' + 'y'.repeat(300) });
  const ch = await a.wait((m) => m.t === 'chat');
  ok(ch && !/[<>\u0000‮\n\t]/.test(ch.x) && ch.x.startsWith('scriptalert(1)/script hello world'), `chat sanitized: "${ch?.x.slice(0, 40)}..."`);
  ok(ch && Array.from(ch.x).length === 140, 'chat truncated to 140 chars');
  ok(ch && ch.n === 'Cara' && ch.i === wc.i, 'chat carries sender id/name');
  c.send({ t: 'chat', x: 'spam' });
  ok(await c.wait((m) => m.t === 'err' && m.m === 'chat_rate'), 'chat rate-limited');

  console.log('host migration');
  a.ws.close();
  const hb = await b.wait((m) => m.t === 'host');
  const hc = await c.wait((m) => m.t === 'host');
  ok(hb && hb.h === wb.i && hc && hc.h === wb.i, 'host migrated to next-oldest (Bob)');
  ok(hb && Array.isArray(hb.m) && hb.m[0].hp === 500, 'new host receives last monster state');
  ok(await c.wait((m) => m.t === 'leave' && m.i === wa.i), 'leave broadcast');
  c.send({ t: 'p', x: [0, 0, 0, 0], s: {} }); await sleep(80);
  c.send({ t: 'hit', mo: 'light3', pt: 'tail', mi: 0, p: [0, 1, 1] });
  ok(await b.wait((m) => m.t === 'hit' && m.i === wc.i), 'hits now go to new host');

  console.log('flood / cleanup');
  const f = client('Flood'); await f.hello();
  for (let i = 0; i < 300; i++) f.send({ t: 'ping', c: i });
  const code = await Promise.race([f.closed, sleep(2000).then(() => 'open')]);
  ok(code === 1008, `flooder disconnected (code ${code})`);
  ok(srv.rooms.has('myhunt'), 'named room exists while occupied');
  named.ws.close(); await sleep(100);
  ok(!srv.rooms.has('myhunt'), 'empty room deleted');
  for (const x of [b, c, d, e]) x.ws.close();
  await sleep(150);
  ok(srv.rooms.size === 0 && srv.clients.size === 0, 'all rooms/clients cleaned up');

  console.log('host-side hit validation (hitcheck.js)');
  {
    const v = createHitValidator({ rand: () => 0.5 }); // no crits
    const now = 10000;
    const samples = (st, h = 0, x = 0) => [{ t: now - 120, x, y: 0, z: 0, st, h }, { t: now - 60, x, y: 0, z: 0, st, h }, { t: now + 10, x, y: 0, z: 0, st, h }];
    const hitboxes = [{ part: 'head', x: 2, y: 1.5, z: 0, r: 1 }, { part: 'tail', x: -4, y: 1, z: 0, r: 0.8 }];
    const ctx = (o = {}) => ({ now, samples: samples('light1'), hitboxes, alive: true, ...o });
    const H = (o = {}) => ({ from: 'x', mo: 'light1', lv: 0, pt: 'head', p: [1.2, 1.4, 0], t: now - 50, sh: 1, ...o });
    let r = v.check(H(), ctx());
    ok(r.ok && Math.abs(r.damage - 0.34 * ATTACK_POWER * 1.2) < 1e-9, `valid light1 accepted, damage recomputed from motion value (${r.damage?.toFixed(1)})`);
    ok(v.check(H(), ctx()).reason === 'duplicate_part', 'same part twice in one swing rejected');
    ok(v.check(H({ mo: 'god' }), ctx()).reason === 'bad_motion', 'unknown motion rejected');
    ok(v.check(H({ from: 'y', mo: 'light3' }), ctx()).reason === 'state_mismatch', 'motion not in attacker state history rejected');
    ok(v.check(H({ from: 'y', mo: 'heavy', lv: 3 }), ctx({ samples: samples('heavy', 1) })).reason === 'charge_mismatch', 'claimed charge level above observed rejected');
    r = v.check(H({ from: 'y', mo: 'heavy', lv: 1 }), ctx({ samples: samples('heavy', 1) }));
    ok(r.ok && Math.abs(r.damage - 0.72 * ATTACK_POWER * 1.2) < 1e-9, 'heavy lv1 accepted with lv1 motion value');
    ok(v.check(H({ from: 'z' }), ctx({ samples: samples('light1', 0, -9) })).reason === 'out_of_reach', 'attacker >6m from hit point rejected');
    ok(v.check(H({ from: 'z', p: [6.5, 1.5, 0] }), ctx({ samples: samples('light1', 0, 5) })).reason === 'far_from_part', 'hit point >3m from part hitbox rejected');
    ok(v.check(H({ from: 'z', pt: 'wing' }), ctx()).reason === 'bad_part', 'unknown part rejected');
    ok(v.check(H({ from: 'z', t: now - 9000 }), ctx()).reason === 'stale', 'stale hit time rejected');
    ok(!v.check(H({ from: 'z' }), ctx({ alive: false })).suspicious, 'hit on dead monster dropped (not suspicious)');
    ok(v.check(H({ from: 'w', sh: 0 }), ctx()).damage === 0.34 * ATTACK_POWER * 0.72, 'sharpness multiplier applied');
    // DPS cap: a cheater claiming a fresh full-charge heavy hit every 100ms on alternating parts
    const v2 = createHitValidator({ rand: () => 0.5 });
    let accepted = 0, dmg = 0, t = now;
    for (let i = 0; i < 100; i++, t += 100) {
      const res = v2.check({ from: 'c', mo: 'heavy', lv: 3, pt: i % 2 ? 'head' : 'tail', p: i % 2 ? [1.2, 1.4, 0] : [-3, 1, 0], t, sh: 1 },
        { now: t, samples: [{ t: t - 50, x: -0.5, y: 0, z: 0, st: 'heavy', h: 3 }], hitboxes, alive: true });
      if (res.ok) { accepted++; dmg += res.damage; }
    }
    const dps = dmg / 10, legit = motionValue('heavy', 3) * ATTACK_POWER * 1.2;
    ok(dps <= 400 + DPS_BURST / 10 + 1, `per-player DPS capped: ${accepted}/100 spoofed heavies accepted, ${dps.toFixed(0)} dmg/s (uncapped would be ${(legit * 10).toFixed(0)})`);
  }

  console.log('shutdown');
  const g = client('Late'); await g.hello();
  const closeP = g.closed;
  await srv.close();
  const gc = await Promise.race([closeP, sleep(2000).then(() => 'hung')]);
  ok(gc === 1001 && g.msgs.some((m) => m.t === 'bye'), `graceful shutdown closes clients (code ${gc})`);
} catch (err) {
  failed++; console.error('ERROR', err);
}
fs.rmSync(dist, { recursive: true, force: true });
fs.rmSync(path.join(path.dirname(dist), 'wb-outside.txt'), { force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
