// Host-authoritative validation of remote hit intents. Pure (no DOM / THREE) so server/test.mjs can unit-test it.
//
// Non-hosts never send damage. They send an intent {mo: motion id, lv: charge level, pt: part, p: point,
// ts: hit time (server clock), sh: sharpness 0..1}. The host:
//   1. looks up the motion value (mirrors ATTACKS / ATTACK_POWER / sharpMult in src/player/player.js),
//   2. checks the attacker's relayed snapshots around the hit time actually show that attack state
//      (and, for 'heavy', a charge level >= the claimed one),
//   3. range-checks: attacker within MAX_REACH m (horizontal) of the hit point, hit point within
//      MAX_PART_SLACK m of the claimed part's hitbox surface,
//   4. per-swing limits (no same part twice per swing, <= 2 parts per swing, like the local player),
//   5. a per-attacker damage token bucket (DPS cap), and rolls crits itself.
// MUST be kept in sync with src/player/player.js if motion values change.

export const ATTACK_POWER = 210;
export const MOTION_VALUES = Object.freeze({ light1: 0.34, light2: 0.3, light3: 0.6, heavy: Object.freeze([0.45, 0.72, 1.0, 1.4]), tackle: 0.22, trueslash: Object.freeze([0.85, 1.25, 1.65, 2.2]) });
export const CRIT_CHANCE = 0.12, CRIT_MULT = 1.25;
export const MAX_REACH = 6, MAX_PART_SLACK = 3;
// Legit peak is ~370 raw dmg/s (full light combo hitting 2 parts); a full-charge double hit is ~880 at once.
export const DPS_RATE = 400, DPS_BURST = 1600;
const STATE_WINDOW = [-800, 400]; // ms around the hit time in which the attacker's snapshot must show the motion
const SWING_WINDOW = 400;          // ms: hits with the same motion closer than this count as one swing

export const sharpMult = (s) => (s > 0.66 ? 1.2 : s > 0.4 ? 1.05 : s > 0.2 ? 0.9 : 0.72);
export function motionValue(mo, lv) {
  if (typeof mo !== 'string' || !Object.prototype.hasOwnProperty.call(MOTION_VALUES, mo)) return null;
  const v = MOTION_VALUES[mo];
  if (!Array.isArray(v)) return v;
  const i = Number.isInteger(lv) && lv >= 0 && lv < v.length ? lv : 0;
  return v[i];
}
const fin = (v) => typeof v === 'number' && Number.isFinite(v);

export function createHitValidator({ rate = DPS_RATE, burst = DPS_BURST, rand = Math.random } = {}) {
  const atk = new Map(); // attackerId -> {bucket, bt, recent:[{t, mo, pt}]}
  return {
    forget(id) { atk.delete(id); },
    /**
     * hit: {from, mo, lv, pt, p:[x,y,z], t (local ms of the hit), sh}
     * ctx: {now (local ms), samples:[{t,x,y,z,st,h}] attacker history, hitboxes:[{part,x,y,z,r}], alive:boolean}
     * -> {ok:true, damage, isCrit} | {ok:false, reason, suspicious:boolean}
     */
    check(hit, ctx) {
      const no = (reason, suspicious = true) => ({ ok: false, reason, suspicious });
      const mv = motionValue(hit.mo, hit.lv);
      if (mv == null) return no('bad_motion');
      if (!ctx.alive) return no('target_dead', false);
      const p = hit.p;
      if (!Array.isArray(p) || p.length !== 3 || !p.every(fin)) return no('bad_point');
      const t = fin(hit.t) ? hit.t : ctx.now;
      // compare with arrival time (host frame stalls must not age hits); 4s tolerates clock-sync error + lag
      if (Math.abs((fin(hit.arrive) ? hit.arrive : ctx.now) - t) > 4000) return no('stale');

      // 2. attacker state history must show this attack around the hit time
      const win = (ctx.samples || []).filter((s) => s.t >= t + STATE_WINDOW[0] && s.t <= t + STATE_WINDOW[1]);
      if (!win.length) return no('no_state', false); // attacker snapshots lagging/missing: drop silently
      if (!win.some((s) => s.st === hit.mo)) return no('state_mismatch');
      const charged = hit.mo === 'heavy' || hit.mo === 'trueslash';
      const lv = charged ? (Number.isInteger(hit.lv) ? hit.lv : 0) : 0;
      if (charged && lv > Math.max(...win.map((s) => (fin(s.h) ? s.h : 0)))) return no('charge_mismatch');

      // 3. range checks
      let near = win[0];
      for (const s of win) if (Math.abs(s.t - t) < Math.abs(near.t - t)) near = s;
      if (Math.hypot(near.x - p[0], near.z - p[2]) > MAX_REACH || Math.abs(near.y - p[1]) > MAX_REACH) return no('out_of_reach');
      const boxes = (ctx.hitboxes || []).filter((h) => h.part === hit.pt);
      if (!boxes.length) return no('bad_part');
      const gap = Math.min(...boxes.map((h) => Math.hypot(h.x - p[0], h.y - p[1], h.z - p[2]) - h.r));
      if (gap > MAX_PART_SLACK) return no('far_from_part');

      // 4. per-swing limits
      let a = atk.get(hit.from);
      if (!a) atk.set(hit.from, (a = { bucket: burst, bt: ctx.now, recent: [] }));
      a.recent = a.recent.filter((r) => ctx.now - r.at < 3000);
      const swing = a.recent.filter((r) => r.mo === hit.mo && Math.abs(r.t - t) < SWING_WINDOW);
      if (swing.some((r) => r.pt === hit.pt)) return no('duplicate_part');
      if (swing.length >= 2) return no('too_many_parts');

      // 5. damage + DPS cap
      const isCrit = rand() < CRIT_CHANCE;
      const sh = fin(hit.sh) ? Math.min(1, Math.max(0, hit.sh)) : 1;
      const damage = mv * ATTACK_POWER * sharpMult(sh) * (isCrit ? CRIT_MULT : 1);
      a.bucket = Math.min(burst, a.bucket + ((ctx.now - a.bt) / 1000) * rate); a.bt = ctx.now;
      if (a.bucket < damage) return no('dps_cap');
      a.bucket -= damage;
      a.recent.push({ t, at: ctx.now, mo: hit.mo, pt: hit.pt });
      return { ok: true, damage, isCrit };
    },
  };
}
