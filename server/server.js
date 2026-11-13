// Wildbound co-op server: static file host for dist/ + WebSocket hub at /ws.
//
// Run: `PORT=8080 node server/server.js` (after `npx vite build`).
// Env: PORT (default 8080), HOST (default 0.0.0.0), DIST (default ../dist),
//      ALLOW_ANY_ORIGIN=1 to skip the WebSocket Origin==Host check,
//      ALLOWED_ORIGINS=https://a.example,https://b.example to also accept those page origins
//        (e.g. the GitHub Pages site connecting cross-origin),
//      TRUST_PROXY=1 to take the client IP from X-Forwarded-For (Render/Fly sit behind a proxy).
//
// ─────────────────────────────── PROTOCOL (v1) ───────────────────────────────
// Every frame is a UTF-8 JSON object with a short type key `t`. Frames > 4096
// bytes, non-JSON, non-object or unknown `t` are dropped (and earn a strike;
// 8 strikes => disconnect). Suspicious players (hit flooding, out-of-reach or
// malformed hits, host-rejected hits) are logged with id/ip/room, throttled per reason. All numbers are clamped, all strings trimmed,
// snapshot objects are deep-sanitized (depth<=4, <=32 keys/obj, <=64 items/arr,
// keys /^[A-Za-z0-9_]{1,24}$/ minus __proto__/constructor/prototype).
//
// A socket starts in the HUB (lobby). It must send `hello` to enter a quest room.
//
// Client -> Server
//   {t:'hello', n:name?, r:room?, k:kind?}  enter a room. r omitted => auto-matchmake. k = quarry
//                                      ('varkhul' default | 'wyvern' | 'brute'); rooms never mix quarries.
//                                      into an open room (<4) or create one.
//   {t:'p', x:[x,y,z,facing], s:{..}}  local player snapshot (player.serialize()).
//                                      Server keeps only the latest; flushes 20Hz.
//   {t:'m', s:[{..},..]}               HOST ONLY: monster snapshots (one per monster).
//                                      Server keeps latest; flushes 15Hz.
//   {t:'hit', mo:motion, lv:charge, pt:part, mi:idx, p:[x,y,z], ts:serverMs?, sh:sharpness}
//                                      NON-HOST hit INTENT (no damage!): motion id in
//                                      light1|light2|light3|heavy, charge level 0-3. Server checks
//                                      format, 5 hits/s (burst 6), reach vs. the attacker's last
//                                      position, staleness; forwards to host, which recomputes
//                                      damage + validates (src/net/hitcheck.js).
//   {t:'sus', i:playerId, r:reason}    HOST ONLY: report a rejected hit (server logs it).
//   {t:'ev', e:'break'|'death'|'roar'|'state', mi:idx, pt:part?, st:state?}
//                                      HOST ONLY: reliable monster event, broadcast.
//   {t:'chat', x:text}                 chat (sanitized, <=140 chars, 1 per 0.4s).
//   {t:'ping', c:clientTime}           RTT probe (also counts as heartbeat).
//   {t:'list'}                         hub: list open rooms.
//
// Server -> Client
//   {t:'welcome', i:yourId, r:room, h:hostId, pl:[[id,name],..], m:lastMonster|null, on:onlineCount}
//   {t:'join', i, n}   {t:'leave', i}   {t:'host', h:newHostId, m:lastMonster|null}
//   {t:'s', ts:serverMs, p:[[id,x,s],..], m?:[..]}   batched snapshots (others only)
//   {t:'hit', i:fromId, mo, lv, pt, mi, p, sh, ts?}  (to host only)
//   {t:'ev', i:fromId, e, mi, pt?, st?}
//   {t:'chat', i, n, x}   {t:'pong', c, s:serverMs}   {t:'rooms', r:[[name,count],..]}
//   {t:'err', m:code}     {t:'bye'} (server shutting down)
//
// Heartbeat: WS-level ping every 5s; a socket with no pong/message for 20s is
// terminated. Rooms are deleted as soon as they are empty. Host = earliest
// joined player; migrates to the next-oldest on disconnect.
// ──────────────────────────────────────────────────────────────────────────────
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { motionValue, MAX_REACH } from '../src/net/hitcheck.js';
import { openStore } from './store.js';
import { createApi } from './api.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const LIMITS = Object.freeze({
  MAX_MSG: 4096, ROOM_SIZE: 4, CHAT_LEN: 140, NAME_LEN: 16, ROOM_LEN: 24,
  MAX_CONN: 512, MAX_CONN_PER_IP: 16, STRIKES: 8,
  HEARTBEAT_MS: 5000, TIMEOUT_MS: 20000, PLAYER_HZ: 20, MONSTER_HZ: 15,
  NUM_MAX: 1e6, HIT_RATE: 5, HIT_BURST: 6, SUS_LOG_MS: 10000,
});

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon', '.wasm': 'application/wasm',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream',
  '.ktx2': 'image/ktx2', '.hdr': 'application/octet-stream', '.txt': 'text/plain; charset=utf-8',
};

// ───────────────────────────── sanitization ─────────────────────────────
const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const KEY_RE = /^[A-Za-z0-9_]{1,24}$/;
// C0/C1 controls, zero-width, bidi overrides/isolates, BOM, line/para separators.
const hx = (a, b) => String.fromCharCode(a) + '-' + String.fromCharCode(b);
const STRIP_RE = new RegExp('[' + [hx(0, 0x1f), hx(0x7f, 0x9f), hx(0x200b, 0x200f), hx(0x2028, 0x202e), hx(0x2060, 0x206f),
  hx(0xfeff, 0xfeff), hx(0xfff9, 0xfffb)].join('') + '<>]', 'g');

export function clampNum(v, lo = -LIMITS.NUM_MAX, hi = LIMITS.NUM_MAX) {
  const n = typeof v === 'number' ? v : Number.NaN;
  if (!Number.isFinite(n)) return 0;
  return n < lo ? lo : n > hi ? hi : n;
}
export function cleanText(v, max) {
  if (typeof v !== 'string') return '';
  const s = v.slice(0, max * 4).replace(/\s+/g, ' ').replace(STRIP_RE, '').replace(/ {2,}/g, ' ').trim();
  return Array.from(s).slice(0, max).join(''); // code-point safe truncation
}
// Deep-copies a JSON value into a safe, bounded, prototype-free-key plain value.
export function sanitizeValue(v, depth = 0) {
  if (v === null) return null;
  switch (typeof v) {
    case 'number': return Number.isFinite(v) ? Math.round(clampNum(v) * 1000) / 1000 : 0;
    case 'boolean': return v;
    case 'string': return cleanText(v, 64);
    case 'object': {
      if (depth >= 4) return null;
      if (Array.isArray(v)) {
        const out = [];
        for (let i = 0; i < v.length && i < 64; i++) out.push(sanitizeValue(v[i], depth + 1));
        return out;
      }
      const out = {};
      let n = 0;
      for (const k of Object.keys(v)) {
        if (n >= 32) break;
        if (BAD_KEYS.has(k) || !KEY_RE.test(k)) continue;
        const sv = sanitizeValue(v[k], depth + 1);
        if (sv !== undefined) { out[k] = sv; n++; }
      }
      return out;
    }
    default: return undefined;
  }
}
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const cleanRoom = (v) => (typeof v === 'string' && /^[A-Za-z0-9_-]{1,24}$/.test(v) ? v.toLowerCase() : '');
const cleanVec = (v, n) => (Array.isArray(v) && v.length === n ? v.map((x) => Math.round(clampNum(x) * 1000) / 1000) : null);

// ───────────────────────────── server ─────────────────────────────
export function startServer({ port = Number(process.env.PORT ?? 8080), host = process.env.HOST || '0.0.0.0',
  distDir = process.env.DIST || path.resolve(__dirname, '..', 'dist'), allowAnyOrigin = process.env.ALLOW_ANY_ORIGIN === '1',
  allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map((o) => o.trim().replace(/\/+$/, '')).filter(Boolean),
  trustProxy = process.env.TRUST_PROXY === '1',
  dbPath = process.env.DB_PATH || path.resolve(__dirname, '..', 'data', 'wildbound.db'), databaseUrl = process.env.DATABASE_URL, store: givenStore = null,
  log = console.log } = {}) {
  // Accounts / saves / economy API (see server/api.js). The store opens asynchronously; API calls wait for it.
  const storeReady = givenStore ? Promise.resolve(givenStore) : openStore({ url: databaseUrl, file: dbPath, log });
  let api = null;
  storeReady.then((st) => { api = createApi(st, { allowedOrigins, log }); }).catch((e) => log('[wildbound] store failed:', e.message));
  function routeApi(req, res, pathname) {
    storeReady.then(() => api.handle(req, res, pathname)).catch(() => { res.writeHead(503, { 'Content-Type': 'application/json' }); res.end('{"ok":false,"error":"store"}'); });
  }
  const DIST = path.resolve(distDir);
  let distReal = DIST;
  try { distReal = fs.realpathSync(DIST); } catch { /* dist missing: static 404s, ws still works */ }

  const rooms = new Map();   // name -> Room
  const clients = new Set(); // all sockets' Client records (hub + rooms)
  const perIp = new Map();
  let nextId = 1, autoRoomSeq = 1, shuttingDown = false;

  // ── static files ──
  function serveStatic(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET, HEAD' }); return res.end(); }
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400); return res.end(); }
    if (pathname === '/healthz') {
      const body = JSON.stringify({ ok: true, app: 'wildbound', players: clients.size, rooms: rooms.size });
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(req.method === 'HEAD' ? undefined : body);
    }
    if (pathname.includes('\0')) { res.writeHead(400); return res.end(); }
    const rel = path.normalize(pathname).replace(/^([/\\])+/, '');
    let file = path.resolve(DIST, rel);
    if (file !== DIST && !file.startsWith(DIST + path.sep)) { res.writeHead(403); return res.end(); }
    // dotfiles are never served
    if (rel.split(/[/\\]/).some((seg) => seg.startsWith('.'))) { res.writeHead(404); return res.end(); }
    const send = (f, st) => {
      // realpath check defeats symlinks pointing outside dist/
      let real; try { real = fs.realpathSync(f); } catch { res.writeHead(404); return res.end(); }
      if (real !== distReal && !real.startsWith(distReal + path.sep)) { res.writeHead(403); return res.end(); }
      const ext = path.extname(f).toLowerCase();
      const immutable = f.startsWith(path.join(DIST, 'assets') + path.sep);
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream', 'Content-Length': st.size,
        'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
        'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin',
      });
      if (req.method === 'HEAD') return res.end();
      const rs = fs.createReadStream(f);
      rs.on('error', () => res.destroy());
      rs.pipe(res);
    };
    fs.stat(file, (err, st) => {
      if (!err && st.isDirectory()) { file = path.join(file, 'index.html'); return fs.stat(file, (e2, s2) => (!e2 && s2.isFile() ? send(file, s2) : spa())); }
      if (!err && st.isFile()) return send(file, st);
      spa();
    });
    function spa() {
      // SPA fallback only for extension-less routes; missing assets are real 404s.
      if (path.extname(rel)) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('not found'); }
      const idx = path.join(DIST, 'index.html');
      fs.stat(idx, (e, st) => (e ? (res.writeHead(404), res.end('build missing: run `npx vite build`')) : send(idx, st)));
    }
  }

  const server = http.createServer((req, res) => {
    let pathname = '/'; try { pathname = new URL(req.url, 'http://x').pathname; } catch { /* */ }
    if (pathname.startsWith('/api/')) return routeApi(req, res, pathname);
    return serveStatic(req, res);
  });
  server.headersTimeout = 10000; server.requestTimeout = 15000;
  const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024, perMessageDeflate: false, clientTracking: false });

  server.on('upgrade', (req, socket, head) => {
    const fail = (code) => { socket.write(`HTTP/1.1 ${code}\r\nConnection: close\r\n\r\n`); socket.destroy(); };
    let u; try { u = new URL(req.url, 'http://x'); } catch { return fail('400 Bad Request'); }
    if (u.pathname !== '/ws' || shuttingDown) return fail('404 Not Found');
    if (!allowAnyOrigin && req.headers.origin) {
      let oh = ''; try { oh = new URL(req.headers.origin).host; } catch { /* invalid */ }
      if (oh !== req.headers.host && !allowedOrigins.includes(req.headers.origin)) return fail('403 Forbidden');
    }
    const fwd = trustProxy ? String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() : '';
    const ip = (fwd && fwd.length <= 64 ? fwd : '') || req.socket.remoteAddress || '?';
    if (clients.size >= LIMITS.MAX_CONN || (perIp.get(ip) || 0) >= LIMITS.MAX_CONN_PER_IP) return fail('503 Service Unavailable');
    wss.handleUpgrade(req, socket, head, (ws) => onConnection(ws, ip));
  });

  function send(c, obj) {
    if (c.ws.readyState !== 1) return;
    // backpressure: drop unreliable traffic for slow consumers, kill hopeless ones
    if (c.ws.bufferedAmount > 1 << 20) { c.ws.terminate(); return; }
    if (obj.t === 's' && c.ws.bufferedAmount > 64 * 1024) return;
    c.ws.send(typeof obj === 'string' ? obj : JSON.stringify(obj));
  }
  function broadcast(room, obj, except) {
    const data = JSON.stringify(obj);
    for (const c of room.players) if (c !== except) { if (c.ws.readyState === 1 && c.ws.bufferedAmount < 1 << 20) c.ws.send(data); }
  }

  function makeRoom(name, auto, kind = 'varkhul') {
    const room = { name, auto, kind, players: [], host: null, monster: null, monsterDirty: false, lastMonsterFlush: 0 };
    rooms.set(name, room);
    return room;
  }
  function pickRoom(requested, kind = 'varkhul') {
    if (requested) {
      // Named rooms are per quarry: the same name for a different quarry is a different room.
      if (kind !== 'varkhul' && !requested.endsWith('_' + kind)) requested = (requested.slice(0, 23 - kind.length) + '_' + kind);
      const r = rooms.get(requested);
      if (!r) return makeRoom(requested, false, kind);
      if (r.players.length < LIMITS.ROOM_SIZE && r.kind === kind) return r;
      return null; // full (or a clash with another quarry)
    }
    let best = null; // auto-matchmake: fullest open auto room for this quarry so parties fill up
    for (const r of rooms.values()) if (r.auto && r.kind === kind && r.players.length < LIMITS.ROOM_SIZE && (!best || r.players.length > best.players.length)) best = r;
    if (best) return best;
    let name; do { name = 'q' + (autoRoomSeq++).toString(36); } while (rooms.has(name));
    return makeRoom(name, true, kind);
  }
  function joinRoom(c, room) {
    c.room = room; c.joinedAt = Date.now();
    room.players.push(c);
    if (!room.host) room.host = c;
    send(c, { t: 'welcome', i: c.id, r: room.name, h: room.host.id, pl: room.players.filter((p) => p !== c).map((p) => [p.id, p.name]), m: room.monster, on: clients.size });
    broadcast(room, { t: 'join', i: c.id, n: c.name }, c);
    // fresh joiners see existing players immediately rather than waiting for their next snapshot
    const snap = room.players.filter((p) => p !== c && p.x).map((p) => [p.id, p.x, p.s]);
    if (snap.length) send(c, { t: 's', ts: Date.now(), p: snap });
  }
  function leaveRoom(c) {
    const room = c.room; if (!room) return;
    c.room = null;
    room.players = room.players.filter((p) => p !== c);
    if (!room.players.length) { rooms.delete(room.name); return; }
    broadcast(room, { t: 'leave', i: c.id });
    if (room.host === c) {
      room.host = room.players[0]; // players[] is in join order => oldest remaining
      broadcast(room, { t: 'host', h: room.host.id, m: room.monster });
    }
  }

  function onConnection(ws, ip) {
    perIp.set(ip, (perIp.get(ip) || 0) + 1);
    const c = {
      ws, ip, id: (nextId++).toString(36) + Math.random().toString(36).slice(2, 6), name: '', room: null,
      x: null, s: null, dirty: false, alive: Date.now(), strikes: 0,
      bucket: 40, bucketT: Date.now(), chatT: 0, hitBucket: LIMITS.HIT_BURST, hitT: 0, sus: 0, susLog: new Map(),
    };
    clients.add(c);
    ws.on('pong', () => { c.alive = Date.now(); });
    ws.on('message', (data, isBinary) => onMessage(c, data, isBinary));
    ws.on('close', () => {
      if (!clients.delete(c)) return;
      const n = (perIp.get(ip) || 1) - 1; n ? perIp.set(ip, n) : perIp.delete(ip);
      leaveRoom(c);
    });
    ws.on('error', () => ws.terminate());
  }

  // Suspicious-activity log: counted per client, logged at most once per reason per SUS_LOG_MS.
  function suspect(c, reason, extra = '') {
    c.sus++;
    const now = Date.now();
    if (now - (c.susLog.get(reason) || 0) < LIMITS.SUS_LOG_MS) return;
    c.susLog.set(reason, now);
    log(`[wildbound] suspicious id=${c.id} ip=${c.ip} room=${c.room?.name ?? '-'} name=${JSON.stringify(c.name)} reason=${reason} total=${c.sus}${extra ? ' ' + extra : ''}`);
  }

  function strike(c, why) {
    send(c, { t: 'err', m: why });
    if (++c.strikes >= LIMITS.STRIKES) c.ws.close(1008, 'policy');
  }

  function onMessage(c, data, isBinary) {
    c.alive = Date.now();
    // token bucket: 60 msgs/s sustained, 40 burst
    const now = Date.now();
    c.bucket = Math.min(40, c.bucket + ((now - c.bucketT) / 1000) * 60); c.bucketT = now;
    if (c.bucket < 1) return strike(c, 'rate');
    c.bucket -= 1;
    if (isBinary || data.length > LIMITS.MAX_MSG) return strike(c, 'too_big');
    let msg;
    try { msg = JSON.parse(data.toString('utf8')); } catch { return strike(c, 'bad_json'); }
    if (!isObj(msg) || typeof msg.t !== 'string') return strike(c, 'bad_msg');
    const room = c.room;
    switch (msg.t) {
      case 'ping': return send(c, { t: 'pong', c: clampNum(msg.c, -1e15, 1e15), s: Date.now() });
      case 'list': return send(c, { t: 'rooms', r: [...rooms.values()].slice(0, 50).map((r) => [r.name, r.players.length]) });
      case 'hello': {
        if (room) return strike(c, 'already_in_room');
        c.name = cleanText(msg.n, LIMITS.NAME_LEN) || 'Hunter-' + c.id.slice(-4);
        const req = cleanRoom(msg.r);
        const kind = msg.k === 'wyvern' || msg.k === 'brute' ? msg.k : 'varkhul';
        let r = pickRoom(req, kind);
        if (!r) { send(c, { t: 'err', m: 'room_full' }); r = pickRoom('', kind); }
        return joinRoom(c, r);
      }
    }
    if (!room) return strike(c, 'no_room');
    switch (msg.t) {
      case 'p': {
        const x = cleanVec(msg.x, 4); if (!x) return strike(c, 'bad_p');
        c.x = x; c.s = isObj(msg.s) ? sanitizeValue(msg.s) : {}; c.dirty = true;
        return;
      }
      case 'm': {
        if (room.host !== c) return; // silently ignore stale host snapshots after migration
        const arr = Array.isArray(msg.s) ? msg.s.slice(0, 4).map((s) => (isObj(s) ? sanitizeValue(s) : {})) : null;
        if (!arr) return strike(c, 'bad_m');
        room.monster = arr; room.monsterDirty = true;
        return;
      }
      case 'hit': {
        // Hit INTENT only — clients never send damage; the host recomputes it (src/net/hitcheck.js).
        if (room.host === c) return; // host applies its own hits locally
        // 5 hits/s sustained, burst 6 (a real swing hits <= 2 parts; fastest combo link is ~0.37s)
        c.hitBucket = Math.min(LIMITS.HIT_BURST, c.hitBucket + ((now - (c.hitT || now)) / 1000) * LIMITS.HIT_RATE); c.hitT = now;
        if (c.hitBucket < 1) return suspect(c, 'hit_rate');
        c.hitBucket -= 1;
        const lv = Math.trunc(clampNum(msg.lv, 0, 3));
        const p = cleanVec(msg.p, 3);
        if (motionValue(msg.mo, lv) == null || !p) { suspect(c, 'hit_malformed'); return strike(c, 'bad_hit'); }
        if (!c.x) return suspect(c, 'hit_without_position');
        // coarse reach check vs. the attacker's latest relayed position (snapshots lag hits by <=~100ms)
        const reach = Math.hypot(c.x[0] - p[0], c.x[2] - p[2]);
        if (reach > MAX_REACH + 3) return suspect(c, 'hit_out_of_reach', `dist=${reach.toFixed(1)}`);
        const out = { t: 'hit', i: c.id, mo: msg.mo, lv, pt: cleanText(msg.pt, 24), mi: Math.trunc(clampNum(msg.mi, 0, 3)), p, sh: clampNum(msg.sh, 0, 1), wm: clampNum(msg.wm ?? 1, 0.5, 2.1) }; // gear multiplier: capped at the best legitimate gear (≈2.07)
        if (msg.ts != null) {
          const ts = clampNum(msg.ts, 0, 1e15);
          if (Math.abs(now - ts) > 5000) return suspect(c, 'hit_stale');
          out.ts = ts;
        }
        return send(room.host, out);
      }
      case 'sus': { // host reports a hit it rejected; logged only (a malicious host must not be able to kick others)
        if (room.host !== c) return;
        const target = room.players.find((p) => p.id === msg.i);
        if (target && target !== c) suspect(target, 'host_rejected:' + (cleanText(msg.r, 24) || '?'), `reporter=${c.id}`);
        return;
      }
      case 'ev': {
        if (room.host !== c) return;
        const e = msg.e;
        if (e !== 'break' && e !== 'death' && e !== 'roar' && e !== 'state') return strike(c, 'bad_ev');
        const out = { t: 'ev', i: c.id, e, mi: Math.trunc(clampNum(msg.mi, 0, 3)) };
        if (msg.pt != null) out.pt = cleanText(msg.pt, 24);
        if (msg.st != null) out.st = cleanText(msg.st, 24);
        return broadcast(room, out, c);
      }
      case 'chat': {
        if (now - c.chatT < 400) return strike(c, 'chat_rate');
        const x = cleanText(msg.x, LIMITS.CHAT_LEN); if (!x) return;
        c.chatT = now;
        return broadcast(room, { t: 'chat', i: c.id, n: c.name, x }); // echo to sender too
      }
      default: return strike(c, 'unknown_type');
    }
  }

  // ── snapshot flush (server-paced) ──
  const playerTimer = setInterval(() => {
    const now = Date.now();
    for (const room of rooms.values()) {
      const dirty = room.players.filter((p) => p.dirty);
      if (!dirty.length) continue;
      for (const c of room.players) {
        const p = []; for (const o of dirty) if (o !== c) p.push([o.id, o.x, o.s]);
        if (p.length) send(c, { t: 's', ts: now, p });
      }
      for (const o of dirty) o.dirty = false;
    }
  }, 1000 / LIMITS.PLAYER_HZ);
  // monster snapshots: 30Hz check, flush when >= 1/15s since last => ~15Hz.
  const monsterTimer = setInterval(() => {
    const now = Date.now();
    for (const room of rooms.values()) {
      if (!room.monsterDirty || now - room.lastMonsterFlush < 1000 / LIMITS.MONSTER_HZ - 5) continue;
      broadcast(room, { t: 's', ts: now, p: [], m: room.monster }, room.host);
      room.monsterDirty = false; room.lastMonsterFlush = now;
    }
  }, 1000 / LIMITS.MONSTER_HZ / 2);

  const heartbeat = setInterval(() => {
    const now = Date.now();
    for (const c of clients) {
      if (now - c.alive > LIMITS.TIMEOUT_MS) { c.ws.terminate(); continue; }
      try { c.ws.ping(); } catch { /* closed */ }
    }
  }, LIMITS.HEARTBEAT_MS);

  const ready = new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => { const a = server.address(); log(`[wildbound] http+ws on :${a.port} (dist=${DIST})`); resolve(a.port); });
  });

  async function close() {
    if (shuttingDown) return; shuttingDown = true;
    clearInterval(playerTimer); clearInterval(monsterTimer); clearInterval(heartbeat);
    for (const c of clients) { send(c, { t: 'bye' }); try { c.ws.close(1001, 'server shutdown'); } catch { /* */ } }
    await new Promise((r) => { server.close(() => r()); server.closeAllConnections?.(); setTimeout(r, 1500).unref(); });
    for (const c of clients) c.ws.terminate();
    if (!givenStore) await storeReady.then((st) => st.close()).catch(() => {});
    log('[wildbound] stopped');
  }
  return { ready, close, rooms, clients, server, storeReady };
}

// ── CLI entry ──
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const srv = startServer();
  srv.ready.catch((e) => { console.error('[wildbound] failed to start:', e.message); process.exit(1); });
  let stopping = false;
  const stop = (sig) => {
    if (stopping) return process.exit(1); stopping = true;
    console.log(`[wildbound] ${sig}: shutting down`);
    const force = setTimeout(() => process.exit(1), 3000); force.unref();
    srv.close().then(() => process.exit(0));
  };
  process.on('SIGINT', () => stop('SIGINT'));
  process.on('SIGTERM', () => stop('SIGTERM'));
}
