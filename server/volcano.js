// The Volcano Slime — hidden world event (user spec §6). Server-authoritative, persisted in world_state('volcano').
//
// Phases
//   flowing   lava runs from the crater (it is the Volcano Slime's body). Every Magma Slime a hunter kills (reported
//             through the ecosystem, server/world.js) weakens the flow; flow = 1 - kills / KILLS_TO_STOP. What stops
//             flowing fills the magma chamber (ordinary magma, not the slime): chamber = 1 - flow.
//   stopped   the lava has stopped. Hunters who enter the crater are devoured; every devour counts on ONE world counter.
//             The 100th devour (decided under a lock, so it happens exactly once even when many arrive together)
//             awakens the Volcano Slime and makes that hunter the victim.
//   awakened  world boss (HP 100,000). The event continues only while the victim is alive, logged in and in the volcano
//             region (heartbeat). Death, logout (no heartbeat) or leaving → the slime returns, the lava flows again
//             and EVERYTHING resets to the start (spec §6-5, do not change).
//   defeated  rewards for every hunter who damaged it (once); after AFTERMATH the cycle starts over.
// Clients can only report facts (a devour, a heartbeat, damage dealt); every transition is decided here.
const KEY = 'volcano';
export const VOLCANO = {
  KILLS_TO_STOP: Number(process.env.VOLCANO_STOP_KILLS || 300), DEVOURS: 100, HP: 100000,
  VICTIM_TIMEOUT: 30000, DEVOUR_COOLDOWN: 15000, AFTERMATH: 20 * 60000, MAX_DPS: 900,
  REWARDS: { vs_gel: [3, 6], vs_shell: [2, 4], vs_tendril: [1, 3], vs_core: [0, 1] }, // [min, max] scaled by share
};
const fresh = (cycle = 1, now = 0) => ({ v: 1, cycle, phase: 'flowing', slimeKills: 0, flow: 1, chamber: 0, devoured: 0, victim: null,
  boss: null, contributors: {}, rewarded: false, changedAt: now, log: [] });

export async function createVolcano(store, { now = () => Date.now(), log = console.log, autoTick = true, onPhase = null } = {}) {
  let S = null, version = 0, dirty = false, saving = null;
  const row = await store.getWorld(KEY).catch(() => null);
  if (row) { try { S = JSON.parse(row.data); version = row.version; } catch { S = null; } }
  if (!S) { S = fresh(1, now()); dirty = true; }
  const lastDevour = new Map(), seenEid = new Map(), dmgBucket = new Map();
  let chain = Promise.resolve(); // every state change runs here, one at a time (the 100th devour can only happen once)
  const serial = (fn) => { const run = chain.then(fn, fn); chain = run.catch(() => {}); return run; };
  const note = (msg) => { S.log.push({ t: now(), msg }); if (S.log.length > 30) S.log.shift(); log('[wildbound] volcano: ' + msg); };
  const setPhase = (p) => { S.phase = p; S.changedAt = now(); dirty = true; onPhase?.(p, S); };

  async function save() {
    if (!dirty || saving) return saving; dirty = false;
    saving = (async () => {
      const v = await store.putWorld(KEY, JSON.stringify(S), version, now()).catch(() => -1);
      if (v > 0) version = v; else if (v === 0) { const r = await store.getWorld(KEY); if (r) { S = JSON.parse(r.data); version = r.version; } } else dirty = true;
    })().finally(() => { saving = null; });
    return saving;
  }
  function reset(reason) { // spec §6-5: the slime returns, the lava flows again, progress starts over
    const cycle = S.cycle + (reason === 'cycle' ? 1 : 0); const keep = S.log; S = fresh(cycle, now()); S.log = keep;
    note(`reset (${reason})`); setPhase('flowing');
  }
  function tick() {
    const t = now();
    if (S.phase === 'awakened' && S.victim && t - S.victim.lastSeen > VOLCANO.VICTIM_TIMEOUT) reset('victim-logout');
    if (S.phase === 'defeated' && t - S.changedAt > VOLCANO.AFTERMATH) reset('cycle');
  }
  let tT = null, sT = null;
  if (autoTick) { tT = setInterval(() => serial(tick), 5000); tT.unref?.(); sT = setInterval(() => save(), 15000); sT.unref?.(); }

  async function grantRewards() {
    if (S.rewarded) return; S.rewarded = true; dirty = true;
    const total = Object.values(S.contributors).reduce((a, b) => a + b, 0) || 1;
    for (const [uid, dmg] of Object.entries(S.contributors)) {
      const share = Math.min(1, (dmg / total) * 4); // a quarter of the damage earns the full share
      const bag = {}; for (const [id, [lo, hi]] of Object.entries(VOLCANO.REWARDS)) { const n = Math.round(lo + (hi - lo) * share); if (n > 0) bag[id] = n; }
      if (uid === S.victim?.uid) bag.vs_core = (bag.vs_core || 0) + 1; // the one the volcano chose
      await store.mutateSave(uid, (d) => { for (const [k, n] of Object.entries(bag)) d.box[k] = (d.box[k] || 0) + n; d.notices.push('The Volcano Slime sinks back into the earth. Rewards were sent to your item box.'); if (d.notices.length > 10) d.notices.shift(); }).catch((e) => log('[wildbound] volcano reward failed', uid, e.message));
    }
  }

  const api = {
    get state() { return S; },
    // what every client may see (the event is hidden from guides, but the world reacts to it)
    view(uid = null) {
      const b = S.boss;
      return { phase: S.phase, cycle: S.cycle, flow: +S.flow.toFixed(3), chamber: +S.chamber.toFixed(3), slimeKills: S.slimeKills, killsToStop: VOLCANO.KILLS_TO_STOP,
        devoured: S.devoured, devoursNeeded: VOLCANO.DEVOURS, victim: S.victim ? { name: S.victim.name, you: S.victim.uid === uid } : null,
        boss: b ? { hp: Math.max(0, Math.round(b.hp)), maxHp: b.maxHp, stage: b.hp > b.maxHp * 0.66 ? 1 : b.hp > b.maxHp * 0.33 ? 2 : 3, t0: b.t0, seed: b.seed } : null,
        serverTime: now() };
    },
    // a Magma Slime died to a hunter (from the ecosystem report)
    slimeKilled(n = 1) {
      return serial(() => {
        if (S.phase !== 'flowing') return;
        S.slimeKills += n; S.flow = Math.max(0, 1 - S.slimeKills / VOLCANO.KILLS_TO_STOP); S.chamber = 1 - S.flow; dirty = true;
        if (S.flow <= 0) { note(`lava stopped after ${S.slimeKills} slime kills`); setPhase('stopped'); }
      });
    },
    // a hunter fell into the crater (client fact, rate limited per account); counts only while the lava is stopped
    devour(user) {
      return serial(() => {
        const t = now(); if (t - (lastDevour.get(user.id) || 0) < VOLCANO.DEVOUR_COOLDOWN) return { ok: true, counted: false, why: 'cooldown', count: S.devoured };
        lastDevour.set(user.id, t);
        if (S.phase !== 'stopped') return { ok: true, counted: false, why: S.phase, count: S.devoured };
        S.devoured += 1; dirty = true;
        if (S.devoured >= VOLCANO.DEVOURS) { // exactly once: we are inside the serial chain and the phase changes right here
          S.victim = { uid: user.id, name: user.name, lastSeen: t, since: t };
          S.boss = { hp: VOLCANO.HP, maxHp: VOLCANO.HP, t0: t, seed: (S.cycle * 7919 + t) % 100000 }; S.contributors = {}; S.rewarded = false;
          note(`awakened by the ${S.devoured}th devour (victim ${user.name})`); setPhase('awakened');
          return { ok: true, counted: true, count: S.devoured, victim: true };
        }
        return { ok: true, counted: true, count: S.devoured };
      });
    },
    // the victim's client: alive / in the volcano region (other players' heartbeats are ignored)
    heartbeat(user, { alive = true, region = true } = {}) {
      return serial(() => {
        if (S.phase !== 'awakened' || S.victim?.uid !== user.id) return { ok: true, victim: false };
        if (!alive) { reset('victim-died'); return { ok: true, victim: true, reset: 'died' }; }
        if (!region) { reset('victim-left'); return { ok: true, victim: true, reset: 'left' }; }
        S.victim.lastSeen = now(); dirty = true; return { ok: true, victim: true };
      });
    },
    victimLoggedOut(uid) { return serial(() => { if (S.phase === 'awakened' && S.victim?.uid === uid) reset('victim-logout'); }); },
    // damage dealt to the boss: idempotent event ids, capped per account per second
    damage(user, events) {
      return serial(async () => {
        if (S.phase !== 'awakened' || !S.boss) return { ok: false, why: S.phase };
        const t = now(); for (const [k, v] of seenEid) if (t - v > 600000) seenEid.delete(k);
        let b = dmgBucket.get(user.id); if (!b) { b = { tok: VOLCANO.MAX_DPS * 3, t }; dmgBucket.set(user.id, b); }
        b.tok = Math.min(VOLCANO.MAX_DPS * 3, b.tok + ((t - b.t) / 1000) * VOLCANO.MAX_DPS); b.t = t;
        let applied = 0;
        for (const ev of (Array.isArray(events) ? events : []).slice(0, 40)) {
          if (!ev || typeof ev.eid !== 'string' || ev.eid.length > 64) continue; const key = user.id + ':' + ev.eid; if (seenEid.has(key)) continue; seenEid.set(key, t);
          const d = Math.max(0, Math.min(Number(ev.dmg) || 0, 2500, b.tok)); if (!d) continue; b.tok -= d; applied += d;
        }
        if (applied) { S.boss.hp -= applied; S.contributors[user.id] = (S.contributors[user.id] || 0) + applied; dirty = true; }
        if (S.boss.hp <= 0) { S.boss.hp = 0; note('the Volcano Slime was driven back'); setPhase('defeated'); await grantRewards(); }
        return { ok: true, applied, hp: Math.round(S.boss.hp) };
      });
    },
    tick: () => serial(tick), save, reset: (r) => serial(() => reset(r)),
    async close() { clearInterval(tT); clearInterval(sT); dirty = true; await save(); },
  };
  return api;
}
