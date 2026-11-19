// Client side of the island ecosystem (src/shared/ecosystem.js).
//   • The server's world (GET /api/eco) is the truth when it answers; until then — and offline — the same model
//     runs locally from the deterministic starting populations, so the island is never empty while a sleeping
//     server wakes up. Tiles already spawned keep what they got; the next time a tile spawns it reads the newer data.
//   • fauna.js asks tile(tx, tz) when a tile comes near a hunter and builds individuals from its age classes,
//     herds / packs, nests and carcasses.
//   • Kills made by THIS hunter, nest intrusions and injured escapes are reported (POST /api/eco/report, logged in only;
//     batched, idempotent event ids). Deaths the server models itself (predation, old age…) are never reported.
import { createEcoWorld, stepEco, applyReport, tileView, tileKey, activityAt, seasonFrac, census, TILE } from '../shared/ecosystem.js';

const FRESH_MS = 90000, FETCH_EVERY = 25000, FLUSH_MS = 4000;

export function createEcoClient(game, F) {
  const local = createEcoWorld(F, { seed: F.seed || 1337 });
  const server = new Map(); // tile key → { v: tileView, at }
  let mode = 'local', meta = null, lastFetch = -1e9, lastKey = null, inflight = false, acc = 0, queue = [], flushT = 0, nEv = 0;
  const nonce = Math.random().toString(36).slice(2, 8); const born = performance.now(); let tried = false;
  const acct = () => game.account;
  const tileOfXZ = (x, z) => [Math.floor((x + F.half) / TILE), Math.floor((z + F.half) / TILE)];

  async function fetchAround(x, z) {
    const req = acct()?.request; if (!req || inflight) return; inflight = true; tried = false;
    try {
      const r = await req(`/api/eco?x=${Math.round(x)}&z=${Math.round(z)}&r=4`, null, { retries: 0 });
      if (r?.ok && r.eco) {
        const at = performance.now(); for (const v of r.eco.tiles) server.set(tileKey(v.tx, v.tz), { v, at });
        meta = { t: r.eco.t, season: r.eco.season, activity: r.eco.activity, slimeKills: r.eco.slimeKills };
        if (mode !== 'server') { mode = 'server'; game.events?.emit?.('eco:mode', { mode }); }
      }
    } catch { /* offline: keep the local model */ } finally { inflight = false; tried = true; }
  }
  async function flush() {
    if (!queue.length || mode !== 'server' || !acct()?.loggedIn) { if (mode !== 'server') queue = []; return; }
    const events = queue.splice(0, 20);
    const r = await acct().request('/api/eco/report', { events }, { retries: 1 }).catch(() => null);
    if (!r?.ok) queue.unshift(...events.filter(() => r?.error === 'network' || !r)); // network: retry later (same ids)
  }

  const api = {
    get mode() { return mode; },
    // spawning waits (≤ 4 s) for the server's first answer so the hunter does not meet a local guess first
    get ready() { return mode === 'server' || !acct()?.request || performance.now() - born > 4000 || (tried && !inflight); },
    local,
    // tile view for spawning: server data if fresh, otherwise the local model
    tile(tx, tz) {
      const k = tileKey(tx, tz);
      if (mode === 'server') { const s = server.get(k); if (s && performance.now() - s.at < FRESH_MS) return s.v; }
      const T = local.tiles[k]; return T ? tileView(T) : null;
    },
    info() {
      if (mode === 'server' && meta) return { mode, ...meta };
      return { mode, t: local.t, season: +seasonFrac(local).toFixed(3), activity: +activityAt(local).toFixed(2), slimeKills: local.slimeKills };
    },
    census: () => census(local),
    // ev: { type: 'kill'|'nest'|'injured', sp, stage, x, z, cause }
    report(ev) {
      if (mode === 'local') { applyReport(local, F, { ...ev, type: ev.type === 'kill' ? undefined : ev.type }); return; }
      const s = server.get(tileKey(...tileOfXZ(ev.x, ev.z)));
      if (s && ev.type === 'kill') { // keep the cached view consistent until the next fetch
        const V = s.v; if (V.p[ev.sp]?.[ev.stage] > 0) V.p[ev.sp][ev.stage]--; else { const g = V.g.find((q) => q.sp === ev.sp && q.n[ev.stage] > 0); if (g) g.n[ev.stage]--; }
      }
      if (acct()?.loggedIn) queue.push({ eid: `${nonce}.${++nEv}`, ...ev, x: +ev.x.toFixed(1), z: +ev.z.toFixed(1) });
    },
    update(dt, P) {
      // the local model keeps living either way (it is the fallback and the offline world)
      acc += dt; if (acc >= 30) { stepEco(local, acc); acc = 0; }
      if (P) {
        const [tx, tz] = tileOfXZ(P.x, P.z); const k = tileKey(tx, tz); const now = performance.now();
        if ((k !== lastKey && now - lastFetch > 3000) || now - lastFetch > FETCH_EVERY) { lastKey = k; lastFetch = now; fetchAround(P.x, P.z); }
      }
      const nowMs = performance.now(); if (nowMs - flushT >= FLUSH_MS) { flushT = nowMs; flush(); } // real time: slow frames must not delay reports
    },
  };
  return api;
}
