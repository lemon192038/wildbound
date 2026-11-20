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

import { CLASS_MOVES, WEAPON_CLASSES } from '../shared/weaponClasses.js';
export const ATTACK_POWER = 210;
// Every weapon class (user report: in co-op only the host's attacks did damage — this table held only the great sword's
// moves, so every other class's hits were never sent). Built from the same shared balance table the player uses:
//   melee moves → mv (array = by charge level); shooting moves → `shot` mv per projectile (charged bow arrows ×1.36);
//   shells / vial bursts → `blast` (fixed base ÷ ATTACK_POWER).
const GS = { light1: 0.34, light2: 0.3, light3: 0.6, heavy: [0.45, 0.72, 1.0, 1.4], tackle: 0.22, trueslash: [0.85, 1.25, 1.65, 2.2], plungeLand: 0.7 };
const TABLE = {};
for (const [k, v] of Object.entries(GS)) TABLE[k] = { mv: v };
for (const [k, mv] of Object.entries(CLASS_MOVES)) {
  const e = {}; if (Array.isArray(mv.mv) ? mv.mv.some((x) => x > 0) : mv.mv > 0) e.mv = mv.mv;
  if (mv.shoot) e.shot = Math.max(...mv.shoot.map((x) => (x.mv || 0) * (x.arrows === 'lvl' ? 1.36 : 1)));
  const b = mv.blast?.dmg || mv.vialBurst?.dmg; if (b) e.blast = b / ATTACK_POWER;
  if (Object.keys(e).length) TABLE[k] = e;
}
export const MOTION_TABLE = Object.freeze(TABLE);
// combo neighbours: on a slow frame a hit and the step into the next move of the chain fall in the same frame, so the
// attacker's snapshot may already show the next (or still the previous) move — those count as the same attack
const NEXT = { light1: ['light2'], light2: ['light3'], heavy: [], tackle: ['trueslash'] };
for (const [k, mv] of Object.entries(CLASS_MOVES)) NEXT[k] = [mv.next, mv.hnext].filter(Boolean);
const NEIGH = {}; for (const [k, ns] of Object.entries(NEXT)) for (const n of ns) { (NEIGH[k] ||= new Set([k])).add(n); (NEIGH[n] ||= new Set([n])).add(k); }
const sameAttack = (st, mo) => st === mo || !!NEIGH[mo]?.has(st);
export const MOTION_VALUES = Object.freeze(Object.fromEntries(Object.entries(TABLE).filter(([, e]) => e.mv != null).map(([k, e]) => [k, e.mv]))); // melee only (legacy name)
export const SHOT_REACH = 90, BLAST_REACH = 12;
// kind: 'melee' (default) | 'shot' (mo = 'arrow', src = the firing move) | 'blast' (mo = the move)
export function motionInfo(mo, lv, kind = 'melee', src = null) {
  if (kind === 'shot' || mo === 'arrow') { const e = TABLE[src]; return e?.shot ? { mv: e.shot, kind: 'shot', state: src, reach: SHOT_REACH } : null; }
  if (typeof mo !== 'string' || !Object.prototype.hasOwnProperty.call(TABLE, mo)) return null; const e = TABLE[mo];
  if (kind === 'blast') return e.blast ? { mv: e.blast, kind: 'blast', state: mo, reach: BLAST_REACH } : null;
  if (e.mv == null) return null; const v = e.mv; const i = Number.isInteger(lv) && lv >= 0 && Array.isArray(v) && lv < v.length ? lv : 0;
  return { mv: Array.isArray(v) ? v[i] : v, kind: 'melee', state: mo, reach: MAX_REACH };
}
export const classScale = (cls) => WEAPON_CLASSES[cls]?.dmgScale ?? 1;
export const CRIT_CHANCE = 0.12, CRIT_MULT = 1.25;
export const MAX_REACH = 6, MAX_PART_SLACK = 3;
// Legit peak is ~370 raw dmg/s (full light combo hitting 2 parts); a full-charge double hit is ~880 at once.
export const DPS_RATE = 800, DPS_BURST = 3200; // scaled for the best equipment (×2.07)
const STATE_WINDOW = [-1000, 800]; // ms around the hit time in which the attacker's snapshot must show the motion (20 Hz snapshots on a slow frame can lag the hit)
const SWING_WINDOW = 400;          // ms: hits with the same motion closer than this count as one swing

export const sharpMult = (s) => (s > 0.66 ? 1.2 : s > 0.4 ? 1.05 : s > 0.2 ? 0.9 : 0.72);
export function motionValue(mo, lv, kind, src) { const m = motionInfo(mo, lv, kind, src); return m ? m.mv : null; }
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
      const info = motionInfo(hit.mo, hit.lv, hit.kd, hit.src); const mv = info?.mv;
      if (mv == null) return no('bad_motion');
      if (!ctx.alive) return no('target_dead', false);
      const p = hit.p;
      if (!Array.isArray(p) || p.length !== 3 || !p.every(fin)) return no('bad_point');
      const t = fin(hit.t) ? hit.t : ctx.now;
      // compare with arrival time (host frame stalls must not age hits); 4s tolerates clock-sync error + lag
      if (Math.abs((fin(hit.arrive) ? hit.arrive : ctx.now) - t) > 4000) return no('stale');

      // 2. attacker state history must show this attack around the hit time
      const W0 = info.kind === 'shot' ? -2200 : STATE_WINDOW[0]; // a projectile lands up to ~2 s after it was fired
      const win = (ctx.samples || []).filter((s) => s.t >= t + W0 && s.t <= t + STATE_WINDOW[1]);
      if (!win.length) return no('no_state', false); // attacker snapshots lagging/missing: drop silently
      // st: the state at the snapshot; la: the attack started in the last 1.5 s (a quick shot can fall between two snapshots)
      if (!win.some((s) => sameAttack(s.st, info.state) || (s.la && sameAttack(s.la, info.state)) || (info.kind === 'shot' && s.st === 'reload'))) return no('state_mismatch');
      if (hit.wc && win.some((s) => s.wc) && !win.some((s) => s.wc === hit.wc)) return no('class_mismatch');
      const charged = hit.mo === 'heavy' || hit.mo === 'trueslash';
      const lv = charged ? (Number.isInteger(hit.lv) ? hit.lv : 0) : 0;
      if (charged && lv > Math.max(...win.map((s) => (fin(s.h) ? s.h : 0)))) return no('charge_mismatch');

      // 3. range checks
      let near = win[0];
      for (const s of win) if (Math.abs(s.t - t) < Math.abs(near.t - t)) near = s;
      const REACH = info.reach;
      if (Math.hypot(near.x - p[0], near.z - p[2]) > REACH || Math.abs(near.y - p[1]) > REACH) return no('out_of_reach');
      const boxes = (ctx.hitboxes || []).filter((h) => h.part === hit.pt);
      if (!boxes.length) return no('bad_part');
      const gap = Math.min(...boxes.map((h) => Math.hypot(h.x - p[0], h.y - p[1], h.z - p[2]) - h.r));
      if (gap > MAX_PART_SLACK + (info.kind === 'shot' ? 2 : 0)) return no('far_from_part'); // a shot meets the client's copy of the boss, which trails the host's pose a little

      // 4. per-swing limits
      let a = atk.get(hit.from);
      if (!a) atk.set(hit.from, (a = { bucket: burst, bt: ctx.now, recent: [] }));
      a.recent = a.recent.filter((r) => ctx.now - r.at < 3000);
      if (info.kind === 'melee') { // projectiles and blasts are not swings: several may land at once (spreads, rapid fire)
        const swing = a.recent.filter((r) => r.mo === hit.mo && Math.abs(r.t - t) < SWING_WINDOW);
        if (swing.some((r) => r.pt === hit.pt)) return no('duplicate_part');
        if (swing.length >= 2) return no('too_many_parts');
      }

      // 5. damage + DPS cap
      const isCrit = rand() < CRIT_CHANCE;
      const sh = fin(hit.sh) ? Math.min(1, Math.max(0, hit.sh)) : 1;
      const wm = Number.isFinite(hit.wm) ? Math.max(0.5, Math.min(2.1, hit.wm)) : 1; // equipment multiplier (server-clamped)
      const damage = mv * ATTACK_POWER * wm * (info.kind === 'melee' ? sharpMult(sh) : 1) * classScale(hit.wc) * (isCrit ? CRIT_MULT : 1);
      a.bucket = Math.min(burst, a.bucket + ((ctx.now - a.bt) / 1000) * rate); a.bt = ctx.now;
      if (a.bucket < damage) return no('dps_cap');
      a.bucket -= damage;
      a.recent.push({ t, at: ctx.now, mo: hit.mo, pt: hit.pt });
      return { ok: true, damage, isCrit };
    },
  };
}
