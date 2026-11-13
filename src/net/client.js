// Wildbound co-op client. Protocol is documented at the top of server/server.js.
//
// createNet(game) -> { update(dt,rawDt), connected, id, roomPlayers, isHost, rtt, room, sendChat(text), disconnect() }
// Activation: `?online=1` forces on, `?online=0` forces off. Otherwise (and not
// `?shot=1`) it probes same-origin GET /healthz and goes online only when the
// page is served by server/server.js ({ok:true, app:'wildbound'}). Offline the
// returned object is a no-op stub and never throws.
//
// Integration contract for other modules:
//  - Remote hunters: createRemoteHunter(game, id) -> {object3d, applyRemote(state), dispose()}.
//    We add object3d to game.scene and register game.remotePlayers.set(id, {object3d, position, applyRemote, dispose, name}).
//    Each frame we call applyRemote({...latestSerializedState, net:{x,y,z,facing,dt,age}}) and THEN set
//    object3d.position / object3d.rotation.y from the interpolated transform (skip by setting hunter.ownsTransform = true).
//  - Monster: on non-host clients we set monster.remoteControlled = true; the monster must then skip AI/
//    attack logic in update() and treat applyRemote(state) as the source of truth (receiveHit should only
//    do local feedback; damage is applied by the host). On host / offline it is false.
//  - Hits: non-hosts send a hit INTENT (motion id from player.state / e.motion, heavy charge level from
//    serialize().h / e.level, part, point, server-clock time, sharpness) — never damage. The host validates it
//    in hitcheck.js (motion table, attacker state history, reach, part distance, per-swing + DPS caps),
//    recomputes damage and calls monster.receiveHit. Rejections are logged and reported to the server ('sus').
//  - Events emitted: 'net:chat' {id,name,text,self}, 'net:join' {id,name}, 'net:leave' {id,name},
//    'net:status' {connected,isHost,room,id}, 'net:host' {isHost,hostId},
//    'net:hit' {from,damage,raw,motion,part,point,isCrit} (host only, after validation).
//    Non-hosts also get 'monster:partBreak' / 'monster:died' / 'monster:roar' with {monster, part?, remote:true}
//    relayed from the host; the monster's applyRemote should therefore NOT emit those itself.
import { createRemoteHunter } from '../player/player.js';
import { createHitValidator, MOTION_VALUES } from './hitcheck.js';

const SEND_HZ = 20, MONSTER_SEND_HZ = 15, INTERP_DELAY = 100, EXTRAP_CAP = 250, BUFFER_MAX = 30;
const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function stubNet() {
  return { update() {}, connected: false, online: false, id: 'local', roomPlayers: [], isHost: true, rtt: 0, room: null,
    sendChat() { return false; }, disconnect() {} };
}

// Defensive copy of server data (server already sanitizes; this guards against Object.assign pollution).
function safe(v, d = 0) {
  if (v === null || typeof v !== 'object') return typeof v === 'number' && !Number.isFinite(v) ? 0 : v;
  if (d > 5) return null;
  if (Array.isArray(v)) return v.slice(0, 64).map((x) => safe(x, d + 1));
  const o = {};
  for (const k of Object.keys(v)) if (!BAD_KEYS.has(k)) o[k] = safe(v[k], d + 1);
  return o;
}
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const lerpAngle = (a, b, t) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return a + d * t; };

export function createNet(game) {
  const params = game.params || new URLSearchParams(location.search);
  const flag = params.get('online');
  const net = stubNet();
  // Build-time co-op server for static hosting (e.g. GitHub Pages → a Render/Fly server).
  const remote = /^wss?:\/\/[^\s]+$/.test(import.meta.env.VITE_SERVER_URL || '') ? import.meta.env.VITE_SERVER_URL.replace(/\/+$/, '') : '';
  if (flag === '0' || typeof WebSocket === 'undefined') return net;
  if (remote) { start(); return net; }
  // Static hosting without a configured server (e.g. the published artifact): stay offline.
  if (import.meta.env.VITE_STATIC === '1') return net;

  if (flag === '1') start();
  else if (params.get('shot') !== '1' && /^https?:$/.test(location.protocol)) {
    // Probe: only server.js answers JSON here (vite dev/preview SPA-fallback returns HTML).
    fetch('/healthz', { cache: 'no-store' })
      .then((r) => (r.ok && (r.headers.get('content-type') || '').includes('json') ? r.json() : null))
      .then((j) => { if (j && j.ok === true && j.app === 'wildbound') start(); })
      .catch(() => {});
  }
  return net;

  function start() {
    try { startOnline(game, net, params, remote); } catch (e) { console.warn('[net] failed to start', e); }
  }
}

function startOnline(game, net, params, remote = '') {
  const THREE = game.THREE;
  const url = remote ? `${remote}/ws` : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
  const wantRoom = (params.get('room') || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 24);
  const name = (params.get('name') || '').slice(0, 16);
  let ws = null, backoff = 1000, reconnectTimer = 0, closedByUser = false, currentRoom = wantRoom;
  let sendAcc = 0, monsterAcc = 0, pingAcc = 0, clockOffset = null, bestRtt = Infinity, rttSamples = [];
  let hostId = null;
  const remotes = new Map(); // id -> {name, hunter, entry, buf:[{t,x,y,z,f,s}], hist:[{t,x,y,z,st,h}]}
  const validator = createHitValidator();
  const pendingHits = []; // host: remote hit intents waiting for the attacker's snapshots to catch up
  const susLog = new Map(); // `${id}:${reason}` -> last log ms (throttle)
  const unsubs = [];

  net.online = true;
  net.sendChat = (text) => {
    const x = String(text ?? '').replace(/[<>]/g, '').trim().slice(0, 140);
    if (!x || !net.connected) return false;
    return tx({ t: 'chat', x });
  };
  net.disconnect = () => { closedByUser = true; clearTimeout(reconnectTimer); try { ws?.close(1000); } catch { /* */ } };
  net.update = update;

  // ── game event hooks ──
  // Handlers are wrapped so a net bug can never break the shared event bus for other listeners.
  const on = (type, fn) => {
    const off = game.events?.on?.(type, (e) => { try { fn(e); } catch (err) { console.warn('[net] event', type, err); } });
    if (off) unsubs.push(off);
  };
  on('hit', (e) => {
    if (!net.connected || net.isHost || !e || e.attacker !== 'local') return;
    const ti = game.monsters.indexOf(e.target);
    if (e.target && ti < 0) return; // not a monster hit
    // Send an INTENT, never damage: the host recomputes damage from the motion value table.
    const P = game.player;
    const mo = typeof e.motion === 'string' ? e.motion : P?.state;
    if (!Object.prototype.hasOwnProperty.call(MOTION_VALUES, mo)) return;
    let lv = e.level;
    if (lv == null && (mo === 'heavy' || mo === 'trueslash')) { try { lv = P.serialize?.().h; } catch { lv = 0; } }
    const out = { t: 'hit', mo, lv: (mo === 'heavy' || mo === 'trueslash') ? Math.max(0, Math.min(3, Math.trunc(num(lv)))) : 0,
      pt: partName(e.part), mi: Math.max(0, ti), sh: Math.round(Math.max(0, Math.min(1, num(P?.sharpness ?? 1))) * 100) / 100 };
    if (!e.point) return;
    out.p = [num(e.point.x), num(e.point.y), num(e.point.z)];
    if (clockOffset != null) out.ts = Math.round(performance.now() + clockOffset); // hit time on the server clock
    tx(out);
  });
  on('monster:partBreak', (e) => { if (net.connected && net.isHost && !e?.remote) tx({ t: 'ev', e: 'break', mi: midx(e?.monster), pt: partName(e?.part) }); });
  on('monster:died', (e) => { if (net.connected && net.isHost && !e?.remote) tx({ t: 'ev', e: 'death', mi: midx(e?.monster) }); });
  on('monster:roar', (e) => { if (net.connected && net.isHost && !e?.remote) tx({ t: 'ev', e: 'roar', mi: midx(e?.monster) }); });
  const midx = (m) => Math.max(0, game.monsters.indexOf(m));
  const partName = (p) => String((typeof p === 'string' ? p : p?.name) ?? '').slice(0, 24);

  window.addEventListener('beforeunload', () => net.disconnect());
  connect();

  function tx(obj) {
    if (!ws || ws.readyState !== 1) return false;
    let s; try { s = JSON.stringify(obj); } catch { return false; }
    if (s.length > 4000) { if (obj.t !== 'p' && obj.t !== 'm') console.warn('[net] dropping oversized', obj.t, s.length); return false; }
    if (ws.bufferedAmount > 256 * 1024 && (obj.t === 'p' || obj.t === 'm')) return false;
    ws.send(s); return true;
  }

  function connect() {
    clearTimeout(reconnectTimer);
    try { ws = new WebSocket(url); } catch (e) { return scheduleReconnect(); }
    ws.onopen = () => { backoff = 1000; tx({ t: 'hello', n: name || undefined, r: currentRoom || undefined, k: game.hunt && game.hunt !== 'varkhul' ? game.hunt : undefined }); };
    ws.onmessage = (ev) => {
      if (typeof ev.data !== 'string' || ev.data.length > 65536) return;
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      if (m && typeof m === 'object' && typeof m.t === 'string') { try { handle(m); } catch (e) { console.warn('[net] handler', m.t, e); } }
    };
    ws.onclose = () => { teardownRoom(); ws = null; if (!closedByUser) scheduleReconnect(); };
    ws.onerror = () => {}; // onclose follows
  }
  function scheduleReconnect() {
    clearTimeout(reconnectTimer);
    const delay = backoff * (0.75 + Math.random() * 0.5);
    backoff = Math.min(backoff * 2, 30000);
    reconnectTimer = setTimeout(connect, delay);
  }

  function setHost(h) {
    hostId = h;
    const was = net.isHost;
    net.isHost = h === net.id;
    for (const mon of game.monsters) mon.remoteControlled = !net.isHost;
    if (was !== net.isHost) game.events?.emit?.('net:host', { isHost: net.isHost, hostId: h });
  }
  function status() { game.events?.emit?.('net:status', { connected: net.connected, isHost: net.isHost, room: net.room, id: net.id }); }
  function refreshRoster() {
    net.roomPlayers = [{ id: net.id, name: net.name, host: net.isHost, self: true },
      ...[...remotes].map(([id, r]) => ({ id, name: r.name, host: id === hostId, self: false }))];
  }

  function handle(m) {
    switch (m.t) {
      case 'welcome': {
        net.id = String(m.i); net.room = currentRoom = String(m.r); net.connected = true; net.online = true;
        net.name = name || 'Hunter-' + net.id.slice(-4);
        net.onlineCount = num(m.on);
        for (const [id, n] of Array.isArray(m.pl) ? m.pl : []) addRemote(String(id), String(n));
        setHost(String(m.h));
        if (!net.isHost && Array.isArray(m.m)) applyMonsters(m.m);
        refreshRoster(); status();
        sendPing();
        return;
      }
      case 'join': addRemote(String(m.i), String(m.n)); refreshRoster(); game.events?.emit?.('net:join', { id: String(m.i), name: String(m.n) }); return;
      case 'leave': {
        const id = String(m.i), r = remotes.get(id);
        removeRemote(id); refreshRoster();
        game.events?.emit?.('net:leave', { id, name: r?.name ?? id });
        return;
      }
      case 'host': setHost(String(m.h)); refreshRoster(); status(); return; // new host keeps its local monster state (it was applying snapshots)
      case 's': {
        const ts = num(m.ts);
        const lt = clockOffset == null ? performance.now() : ts - clockOffset;
        if (Array.isArray(m.p)) for (const row of m.p) {
          if (!Array.isArray(row)) continue;
          const [id, x, s] = row;
          const r = remotes.get(String(id)) || addRemote(String(id), String(id));
          if (!Array.isArray(x)) continue;
          const lastT = r.buf.length ? r.buf[r.buf.length - 1].t : -Infinity;
          if (lt < lastT - 1000) r.buf.length = 0; // clock re-sync jumped backwards: restart buffer
          else if (lt <= lastT) continue;          // out-of-order / duplicate sample
          const ss = safe(s) || {};
          r.buf.push({ t: lt, x: num(x[0]), y: num(x[1]), z: num(x[2]), f: num(x[3]), s: ss });
          // separate 3s history (raw, untrimmed by interpolation) for host-side hit validation
          r.hist.push({ t: lt, x: num(x[0]), y: num(x[1]), z: num(x[2]), st: typeof ss.s === 'string' ? ss.s : '', h: num(ss.h) });
          while (r.hist.length && lt - r.hist[0].t > 3000) r.hist.shift();
          if (r.buf.length > BUFFER_MAX) r.buf.splice(0, r.buf.length - BUFFER_MAX);
        }
        if (Array.isArray(m.m) && !net.isHost) applyMonsters(m.m);
        return;
      }
      case 'hit': {
        if (!net.isHost || pendingHits.length > 64) return;
        const from = String(m.i), now = performance.now();
        const hitT = num(m.ts) && clockOffset != null ? num(m.ts) - clockOffset : now - net.rtt / 2;
        pendingHits.push({ from, mo: m.mo, lv: Math.trunc(num(m.lv)), pt: typeof m.pt === 'string' ? m.pt : '', mi: Math.trunc(num(m.mi)),
          p: Array.isArray(m.p) ? m.p.slice(0, 3).map(num) : null, sh: num(m.sh), t: hitT, arrive: now });
        return;
      }
      case 'ev': {
        if (net.isHost) return;
        const mon = game.monsters[Math.trunc(num(m.mi))] || game.monsters[0];
        if (m.e === 'break') {
          const part = (mon?.parts || []).find((p) => p.name === m.pt) || m.pt;
          game.events?.emit?.('monster:partBreak', { monster: mon, part, remote: true });
        } else if (m.e === 'death') game.events?.emit?.('monster:died', { monster: mon, remote: true });
        else if (m.e === 'roar') game.events?.emit?.('monster:roar', { monster: mon, remote: true });
        return;
      }
      case 'chat': {
        const id = String(m.i);
        game.events?.emit?.('net:chat', { id, name: String(m.n ?? ''), text: String(m.x ?? '').slice(0, 140), self: id === net.id });
        return;
      }
      case 'pong': {
        const now = performance.now(), c = num(m.c), rtt = now - c;
        if (rtt < 0 || rtt > 30000) return;
        rttSamples.push(rtt); if (rttSamples.length > 8) rttSamples.shift();
        net.rtt = Math.round(rttSamples.reduce((a, b) => a + b, 0) / rttSamples.length);
        // Clock offset from the lowest-RTT sample in the window (least queueing error).
        if (rtt <= bestRtt * 1.2 || clockOffset == null) { bestRtt = Math.min(bestRtt, rtt); clockOffset = num(m.s) - (c + rtt / 2); }
        return;
      }
      case 'err': if (m.m !== 'rate') console.warn('[net] server error:', m.m); return;
      case 'bye': return; // close + reconnect follows
    }
  }

  // Host: validate queued hit intents once the attacker's snapshots covering the hit time have arrived
  // (snapshots are batched at 20Hz, the hit itself is sent immediately), or after 250ms at most.
  function processHits(now) {
    for (let i = 0; i < pendingHits.length; ) {
      const h = pendingHits[i], r = remotes.get(h.from);
      const newest = r?.hist.length ? r.hist[r.hist.length - 1].t : -Infinity;
      if (r && newest < h.t + 120 && now - h.arrive < 250) { i++; continue; }
      pendingHits.splice(i, 1);
      if (!r) continue;
      const mon = game.monsters[h.mi] || game.monsters[0];
      if (!mon?.receiveHit) continue;
      const hitboxes = [];
      try {
        for (const hb of mon.getHitboxes?.() ?? []) {
          const c = hb.sphere?.center; if (!c) continue;
          hitboxes.push({ part: typeof hb.part === 'string' ? hb.part : hb.part?.name, x: c.x, y: c.y, z: c.z, r: hb.sphere.radius });
        }
      } catch (e) { console.warn('[net] getHitboxes', e); }
      const res = validator.check(h, { now, samples: r.hist, hitboxes, alive: mon.hp > 0 && mon.state !== 'dead' });
      if (!res.ok) { if (res.suspicious) suspicious(h.from, res.reason); continue; }
      let part = h.pt;
      const hb0 = mon.getHitboxes?.()?.[0];
      if (hb0 && typeof hb0.part === 'object') part = (mon.parts || []).find((p) => p.name === part) || part;
      const point = new THREE.Vector3(h.p[0], h.p[1], h.p[2]);
      const normal = mon.position ? point.clone().sub(mon.position).normalize() : new THREE.Vector3(0, 1, 0);
      let out = null;
      try { out = mon.receiveHit({ damage: res.damage, part, point, normal, attackerId: h.from, isCrit: res.isCrit }); } catch (e) { console.warn('[net] receiveHit', e); }
      const dealt = out && typeof out === 'object' && out.damage != null ? out.damage : Math.round(res.damage);
      game.events?.emit?.('net:hit', { from: h.from, damage: dealt, raw: res.damage, motion: h.mo, part: h.pt, point, isCrit: res.isCrit });
    }
  }
  function suspicious(id, reason) {
    const key = id + ':' + reason, now = performance.now();
    if (now - (susLog.get(key) || -1e9) < 5000) return;
    susLog.set(key, now);
    console.warn(`[net] rejected hit from ${id}: ${reason}`);
    tx({ t: 'sus', i: id, r: reason }); // server logs host reports
  }

  function applyMonsters(arr) {
    for (let i = 0; i < arr.length && i < game.monsters.length; i++) {
      const mon = game.monsters[i];
      if (mon && typeof mon.applyRemote === 'function' && arr[i] && typeof arr[i] === 'object') {
        mon.remoteControlled = true;
        try { mon.applyRemote(safe(arr[i])); } catch (e) { console.warn('[net] monster.applyRemote', e); }
      }
    }
  }

  function addRemote(id, nm) {
    if (!id || id === net.id) return null;
    let r = remotes.get(id);
    if (r) { if (nm && nm !== id) r.name = nm; return r; }
    let hunter;
    try { hunter = createRemoteHunter(game, id); } catch (e) { console.warn('[net] createRemoteHunter', e); }
    if (!hunter?.object3d) hunter = { object3d: new THREE.Object3D(), applyRemote() {}, dispose() {} };
    if (!hunter.object3d.children.length && !hunter.object3d.isMesh) {
      // Player module still stubbed: show a placeholder so remote hunters are at least visible.
      const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 1, 4, 8), new THREE.MeshStandardMaterial({ color: 0xd08a2c }));
      mesh.position.y = 0.9; mesh.castShadow = true;
      hunter.object3d.add(mesh);
      const base = hunter.dispose;
      hunter.dispose = () => { mesh.geometry.dispose(); mesh.material.dispose(); base?.call(hunter); };
    }
    hunter.object3d.visible = false; // until first snapshot
    hunter.object3d.name = 'remote:' + id;
    game.scene.add(hunter.object3d);
    const entry = {
      id, name: nm, object3d: hunter.object3d, position: hunter.object3d.position,
      applyRemote: (s) => hunter.applyRemote?.(s), dispose: () => hunter.dispose?.(),
    };
    r = { name: nm, hunter, entry, buf: [], hist: [], lastS: null };
    remotes.set(id, r);
    game.remotePlayers.set(id, entry);
    return r;
  }
  function removeRemote(id) {
    const r = remotes.get(id); if (!r) return;
    remotes.delete(id); game.remotePlayers.delete(id); validator.forget(id);
    r.hunter.object3d.removeFromParent();
    try { r.hunter.dispose?.(); } catch (e) { console.warn('[net] dispose', e); }
  }
  function teardownRoom() {
    const was = net.connected;
    net.connected = false;
    for (const id of [...remotes.keys()]) removeRemote(id);
    for (const mon of game.monsters) mon.remoteControlled = false; // solo again: local AI resumes
    net.isHost = true; hostId = null; pendingHits.length = 0; refreshRoster();
    if (was) status();
  }

  function sendPing() { tx({ t: 'ping', c: performance.now() }); }

  function update(dt, rawDt) {
    if (!net.connected) return;
    const step = Number.isFinite(rawDt) ? rawDt : dt || 0;
    // ── outgoing ──
    sendAcc += step; monsterAcc += step; pingAcc += step;
    if (sendAcc >= 1 / SEND_HZ) {
      sendAcc %= 1 / SEND_HZ;
      const p = game.player;
      if (p?.position) {
        let s = {};
        try { s = p.serialize?.() ?? {}; } catch (e) { s = {}; }
        tx({ t: 'p', x: [num(p.position.x), num(p.position.y), num(p.position.z), num(p.facing)], s });
      }
    }
    if (net.isHost && monsterAcc >= 1 / MONSTER_SEND_HZ) {
      monsterAcc %= 1 / MONSTER_SEND_HZ;
      if (remotes.size) { // nobody to send to: skip
        const s = []; for (const mon of game.monsters.slice(0, 4)) { try { s.push(mon.serialize?.() ?? {}); } catch { s.push({}); } }
        tx({ t: 'm', s });
      }
    }
    if (pingAcc >= 2) { pingAcc = 0; sendPing(); }
    if (pendingHits.length) processHits(performance.now());

    // ── interpolate remotes ──
    const now = performance.now();
    // Samples are stamped with the server's send time (mapped to our clock), so they arrive ~rtt/2 old.
    const renderT = now - INTERP_DELAY - (clockOffset == null ? 0 : Math.min(net.rtt / 2, 300));
    for (const r of remotes.values()) {
      const b = r.buf; if (!b.length) continue;
      let x, y, z, f, s;
      if (renderT <= b[0].t) ({ x, y, z, f, s } = b[0]);
      else {
        let i = b.length - 1;
        while (i > 0 && b[i - 1].t > renderT) i--;
        const a = b[i - 1], c = b[i];
        if (a && c.t > renderT) {
          const k = (renderT - a.t) / Math.max(1, c.t - a.t);
          x = a.x + (c.x - a.x) * k; y = a.y + (c.y - a.y) * k; z = a.z + (c.z - a.z) * k; f = lerpAngle(a.f, c.f, k); s = c.s;
        } else {
          // past newest sample: extrapolate along last velocity, capped
          const last = b[b.length - 1], prev = b[b.length - 2];
          const ahead = Math.min(renderT - last.t, EXTRAP_CAP);
          ({ x, y, z, f, s } = last);
          if (prev && last.t > prev.t && ahead > 0) {
            const k = ahead / (last.t - prev.t);
            if (k < 4) { x += (last.x - prev.x) * k; y += (last.y - prev.y) * k; z += (last.z - prev.z) * k; }
          }
        }
        // drop samples older than the bracketing pair
        while (b.length > 2 && b[1].t < renderT) b.shift();
      }
      const o = r.hunter.object3d;
      o.visible = true;
      try { r.hunter.applyRemote?.({ ...s, net: { x, y, z, facing: f, dt: step, age: now - b[b.length - 1].t } }); }
      catch (e) { if (!r.warned) { r.warned = true; console.warn('[net] applyRemote', e); } }
      if (!r.hunter.ownsTransform) { o.position.set(x, y, z); o.rotation.y = f; }
    }
  }
}
