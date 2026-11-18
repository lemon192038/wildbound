// Monster perception: independent sight / hearing / smell senses with an awareness meter, then a bounded
// pursuit (chase → search → return). Replaces the old "any hunter inside N metres → aggro forever" checks.
//
//   const P = createPerception(game, monster, senseProfile('varkhul'), { home })
//   P.update(dt, hunters)   → call every frame on the AI owner (host / solo); internally throttled while unaware
//   P.noticed               → hunter that just crossed the awareness threshold this frame (or null)
//   P.lost                  → true on the frame contact is given up (out of chase range / leash / unseen too long)
//   P.engage(h) / P.reset() → force engaged (e.g. when struck) / back to unaware
//   P.state                 → 'IDLE' | 'CAUTION' | 'AGGRESSIVE' | 'SEARCH' | 'RETURN'
//   P.debug()               → snapshot for the developer overlay
// Hunters: [{ id, position: Vector3, state?, local? }] — noise is estimated from speed and action state.
import { senseProfile } from '../shared/senses.js';

const ATTACK_STATES = /light|heavy|charge|slash|tackle|combo|attack|guard/;

export function createPerception(game, m, profile = senseProfile('default'), opts = {}) {
  const S = profile;
  const home = (opts.home || m.position).clone();
  const cosHalf = Math.cos((S.fov * Math.PI) / 360);
  const lastPos = new Map(); // hunter id → {x, z, speed}
  const P = {
    profile: S, home, state: 'IDLE', alert: 0, noticed: null, lost: false,
    target: null, lastSeen: null, unseenT: 0, contactT: 0, searchT: 0, senseT: 0,
    lastSense: { id: null, dist: Infinity, sight: false, heard: false, smelled: false, los: true },
  };

  function noiseOf(h, dt) {
    const id = String(h.id ?? 'local'); const p = h.position;
    const prev = lastPos.get(id);
    let speed = 0;
    if (prev && dt > 0) speed = Math.hypot(p.x - prev.x, p.z - prev.z) / dt;
    lastPos.set(id, { x: p.x, z: p.z, speed: prev ? prev.speed * 0.6 + speed * 0.4 : 0 });
    const sp = lastPos.get(id).speed;
    const st = String(h.state || '');
    let n = 0.12 + Math.min(1, sp / 7.5) * 0.8;          // standing ≈ 0.12, walking ≈ 0.5, sprinting ≈ 0.9
    if (ATTACK_STATES.test(st)) n = Math.max(n, 1.15);   // steel on stone carries
    if (/roll|dodge/.test(st)) n = Math.max(n, 0.7);
    return n;
  }

  // Terrain line of sight: march from the monster's eyes to the hunter's chest over the heightfield.
  function lineOfSight(from, to) {
    const world = game.world; if (!world?.getHeight) return true;
    const eyeY = from.y + S.eyeH, tgtY = to.y + 1.4;
    const dx = to.x - from.x, dz = to.z - from.z, d = Math.hypot(dx, dz);
    const steps = Math.min(12, Math.max(3, Math.ceil(d / 6)));
    for (let i = 1; i < steps; i++) {
      const t = i / steps; const y = eyeY + (tgtY - eyeY) * t;
      if (world.getHeight(from.x + dx * t, from.z + dz * t) > y + 0.25) return false;
    }
    return true;
  }

  // Evaluate the senses against one hunter. Returns a stimulus strength (per second of awareness gain).
  function sense(h, dt) {
    const mp = m.position, hp = h.position;
    const dx = hp.x - mp.x, dz = hp.z - mp.z, dist = Math.hypot(dx, dz);
    const r = { id: h.id, dist, sight: false, heard: false, smelled: false, los: true, gain: 0 };
    if (dist < 1e-3) { r.gain = 10; r.sight = true; return r; }
    // sight: range + view cone (yaw convention: forward = (sin yaw, cos yaw)) + terrain LOS
    if (dist <= S.sight) {
      const fx = Math.sin(m.yaw || 0), fz = Math.cos(m.yaw || 0);
      const inCone = (dx * fx + dz * fz) / dist >= cosHalf;
      if (inCone) {
        r.los = lineOfSight(mp, hp);
        if (r.los) { r.sight = true; r.gain += (1 / S.notice) * (1.6 - 1.2 * (dist / S.sight)); }
      }
    }
    // hearing: noisy hunters are heard through terrain and from behind
    const noise = noiseOf(h, dt);
    if (dist <= S.hearing * noise) { r.heard = true; r.gain += (1 / S.notice) * 2.0 * Math.sqrt(1 - dist / (S.hearing * noise + 1e-3)) * noise; }
    // smell: short omnidirectional radius
    if (S.smell > 0 && dist <= S.smell) { r.smelled = true; r.gain += (1 / S.notice) * 0.6; }
    return r;
  }

  function candidates(hunters, radius) {
    const sp = game.spatial;
    if (sp?.queryHunters) return sp.queryHunters(m.position, radius);
    return hunters;
  }

  P.engage = (h) => {
    if (!h) return;
    P.target = h; P.alert = 1; P.state = 'AGGRESSIVE'; P.unseenT = 0; P.searchT = 0;
    P.lastSeen = h.position.clone();
  };
  P.reset = () => { P.target = null; P.alert = 0; P.state = 'RETURN'; P.unseenT = 0; P.searchT = 0; P.contactT = 0; };
  P.setHome = (v) => home.copy(v);

  P.update = (dt, hunters) => {
    P.noticed = null; P.lost = false;
    if (dt <= 0) return P;
    const engaged = P.state === 'AGGRESSIVE' || P.state === 'SEARCH';
    P.senseT += dt;
    if (!engaged && P.senseT < S.interval) {
      P.alert = Math.max(0, P.alert - dt * 0.12); // between samples the awareness meter slowly cools
      return P;
    }
    const step = engaged ? dt : P.senseT;
    P.senseT = 0;
    const reach = Math.max(S.sight, S.hearing * 1.2, S.smell, S.chaseEnd);
    let best = null;
    for (const h of candidates(hunters, reach)) {
      if (!h?.position || h.hp <= 0 || h.dead) continue;
      const r = sense(h, step);
      if (!best || r.gain > best.gain || (r.gain === best.gain && r.dist < best.dist)) best = r, best.h = h;
    }
    P.lastSense = best || { id: null, dist: Infinity, sight: false, heard: false, smelled: false, los: true };

    if (!engaged) {
      if (best && best.gain > 0) P.alert = Math.min(1, P.alert + best.gain * step);
      else P.alert = Math.max(0, P.alert - step * 0.25);
      P.state = P.alert >= 1 ? 'AGGRESSIVE' : P.alert > 0.15 ? 'CAUTION' : (m.position.distanceTo(home) > 8 && P.state === 'RETURN' ? 'RETURN' : 'IDLE');
      if (P.alert >= 1 && best) { P.engage(best.h); P.noticed = best.h; }
      return P;
    }

    // engaged: keep contact with the current target (or whoever the AI switched to)
    const tgt = m.target && m.target.position ? m.target : P.target;
    if (!tgt) { P.reset(); P.lost = true; return P; }
    P.target = tgt;
    const d = tgt.position.distanceTo(m.position);
    const fromHome = tgt.position.distanceTo(home);
    const tr = sense(tgt, step);
    const contact = d <= S.chaseEnd && (tr.sight || tr.heard || tr.smelled || d < 25);
    P.contactT += dt;
    if (contact && fromHome <= S.leash) {
      P.unseenT = 0; P.searchT = 0; P.state = 'AGGRESSIVE'; P.lastSeen = (P.lastSeen || tgt.position.clone()).copy(tgt.position);
    } else {
      P.unseenT += dt; P.state = 'SEARCH';
      if (fromHome > S.leash + 20 || d > S.chaseEnd * 1.5) P.searchT += dt * 2; // clearly gone: give up faster
      P.searchT += dt;
      if (P.searchT >= S.search) { P.reset(); P.lost = true; }
    }
    return P;
  };

  P.debug = () => ({
    state: P.state, alert: +P.alert.toFixed(2), target: P.target ? String(P.target.id ?? 'local') : '',
    dist: Number.isFinite(P.lastSense.dist) ? +P.lastSense.dist.toFixed(1) : null,
    sight: P.lastSense.sight, heard: P.lastSense.heard, smelled: P.lastSense.smelled, los: P.lastSense.los,
    contactT: +P.contactT.toFixed(1), searchT: +P.searchT.toFixed(1), profile: S,
  });
  return P;
}
