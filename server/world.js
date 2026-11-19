// The authoritative island ecosystem (src/shared/ecosystem.js) on the server.
//   • loaded from world_state('eco') at start (or created), then caught up for the time the server slept
//   • stepped every TICK seconds in the background; saved every SAVE_MS when it changed (and on shutdown)
//   • hunters read nearby tiles (GET /api/eco) and report kills / nest intrusions / injuries (POST /api/eco/report);
//     reports are idempotent per event id, rate limited per account, and can only remove creatures that exist
import { createIslandField } from '../src/world/island/islandField.js';
import { createEcoWorld, stepEco, catchUp, applyReport, snapshot, serializeEco, loadEco, census, ECO } from '../src/shared/ecosystem.js';

const TICK = 30, SAVE_MS = 120000, EID_TTL = 15 * 60 * 1000, MAX_EVENTS = 20;

export async function createWorld(store, { seed = 1337, now = () => Date.now(), log = console.log, autoTick = true } = {}) {
  const field = createIslandField(seed);
  let W = null, version = 0, dirty = false, saving = null;
  const row = await store.getWorld('eco').catch(() => null);
  if (row) {
    try { W = loadEco(field, row.data); version = row.version; } catch (e) { log('[wildbound] eco state unreadable, starting fresh:', e.message); }
  }
  if (!W) { W = createEcoWorld(field, { seed, now: now() }); dirty = true; }
  const steps = catchUp(W, now()); if (steps) { dirty = true; log(`[wildbound] ecosystem caught up ${steps} steps`); }

  async function save() {
    if (!dirty || saving) return saving;
    dirty = false;
    saving = (async () => {
      const v = await store.putWorld('eco', serializeEco(W), version, now()).catch((e) => { log('[wildbound] eco save failed:', e.message); return -1; });
      if (v > 0) version = v;
      else if (v === 0) { // someone else wrote it (a second server instance): adopt theirs, ours is dropped
        const r = await store.getWorld('eco'); if (r) { W = loadEco(field, r.data); version = r.version; log('[wildbound] eco conflict: reloaded'); }
      } else dirty = true;
    })().finally(() => { saving = null; });
    return saving;
  }
  function tick(dt = TICK) { stepEco(W, dt); W.wall = now(); dirty = true; }
  let tT = null, sT = null;
  if (autoTick) { tT = setInterval(() => tick(), TICK * 1000); tT.unref?.(); sT = setInterval(() => save(), SAVE_MS); sT.unref?.(); }

  const seen = new Map(); // event id → time
  return {
    field, get W() { return W; }, tick, save,
    view(x, z, r = 3) {
      const tx = Math.floor((x + field.half) / 64), tz = Math.floor((z + field.half) / 64);
      return snapshot(W, tx, tz, Math.max(0, Math.min(4, r | 0)));
    },
    // events: [{ eid, type?: 'kill'|'nest'|'injured', sp, stage, x, z, cause }]
    report(userId, events) {
      const t = now(); for (const [k, v] of seen) if (t - v > EID_TTL) seen.delete(k);
      const out = [];
      for (const ev of (Array.isArray(events) ? events : []).slice(0, MAX_EVENTS)) {
        if (!ev || typeof ev.eid !== 'string' || ev.eid.length > 64) { out.push({ ok: false, why: 'eid' }); continue; }
        const key = userId + ':' + ev.eid; if (seen.has(key)) { out.push({ ok: true, dup: true }); continue; }
        const x = Number(ev.x), z = Number(ev.z); if (!Number.isFinite(x) || !Number.isFinite(z) || Math.abs(x) > field.half || Math.abs(z) > field.half) { out.push({ ok: false, why: 'pos' }); continue; }
        const type = ev.type || 'kill';
        if (type !== 'kill' && type !== 'nest' && type !== 'injured') { out.push({ ok: false, why: 'type' }); continue; }
        if (type !== 'nest' && !ECO[ev.sp]) { out.push({ ok: false, why: 'species' }); continue; }
        const cause = ['hunter', 'predation', 'other', 'split'].includes(ev.cause) ? ev.cause : 'other';
        const r = applyReport(W, field, { type: type === 'kill' ? undefined : type, sp: ev.sp, stage: ev.stage | 0, x, z, cause });
        seen.set(key, t); if (r.ok) dirty = true; out.push(r);
      }
      return out;
    },
    stats: () => ({ t: W.t, census: census(W), stats: W.stats }),
    async close() { clearInterval(tT); clearInterval(sT); dirty = true; await save(); },
  };
}
