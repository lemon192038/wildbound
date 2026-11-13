// Third-person orbit camera: mouse/right-stick orbit, lagged follow, terrain collision, lock-on framing,
// FOV kicks, trauma-based shake (driven by rawDt so it keeps moving through hitstop). ?cam=x,y,z,tx,ty,tz = fixed shot.
import * as THREE from 'three';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
// smooth 1D noise from summed sines (deterministic, cheap)
const noise = (t, s) => Math.sin(t * 1.0 + s) * 0.5 + Math.sin(t * 2.31 + s * 1.7) * 0.3 + Math.sin(t * 4.13 + s * 2.9) * 0.2;

export function createCameraRig(game) {
  const cam = game.camera, P = game.player, world = game.world, events = game.events;
  let fixed = game.params?.get('cam')?.split(',').map(Number);
  const rig = {
    yaw: P.facing + Math.PI, pitch: 0.28, dist: 5.6, fov: cam.fov || 55, trauma: 0, shakeDur: 0.3, kick: 0,
    target: P.position.clone().add(new THREE.Vector3(0, 1.5, 0)), vel: new THREE.Vector3(), time: 0, monH: 2, occPitch: 0, occPitchT: 0, occYaw: 0, occYawT: 0, melee: 0, hunterHidden: false, hunterNdc: [0, 0], offscreen: 0, resolves: 0, lookOff: new THREE.Vector3(), fixed: fixed && fixed.length >= 6 && fixed.every(Number.isFinite),
  };
  const baseFov = rig.fov;
  rig.setFixed = (a) => { fixed = a; rig.fixed = !!a; }; // debug: fixed camera [x,y,z,tx,ty,tz]
  let lastInput = 0;
  rig.shake = (intensity = 0.3, duration = 0.3) => { rig.trauma = Math.min(1, rig.trauma + intensity); rig.shakeDur = Math.max(0.15, duration); };
  events.on('camera:shake', (e = {}) => rig.shake(e.intensity ?? 0.3, e.duration ?? 0.3));
  events.on('camera:fov', (e = {}) => { rig.kick = Math.max(rig.kick, e.kick ?? 4); });
  const tmp2 = new THREE.Vector3(), tmp3 = new THREE.Vector3(), lookOff = new THREE.Vector3(), ndc = new THREE.Vector3(), desired = new THREE.Vector3(), look = new THREE.Vector3(), off = new THREE.Vector3(), tmp = new THREE.Vector3();
  const pos = cam.position.clone();
  let first = true;

  const dirOf = (yaw, pitch, out) => out.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  const blockers = [];
  function gatherBlockers() {
    blockers.length = 0;
    for (const m of game.monsters || []) { let hbs; try { hbs = m.getHitboxes?.() || []; } catch (e) { hbs = []; } for (const h of hbs) blockers.push(h.sphere); }
  }
  const _sd = new THREE.Vector3(), _sc = new THREE.Vector3();
  // does the segment a->b pass through any (1.35x inflated) monster hitbox? spheres containing b (the hunter) are ignored
  function segBlocked(a, b) {
    _sd.subVectors(b, a); const L = _sd.length(); if (L < 1e-4) return false; _sd.divideScalar(L);
    for (const sp of blockers) {
      const r = sp.radius * 1.6 + 0.2; if (sp.center.distanceToSquared(b) < r * r) continue;
      _sc.subVectors(sp.center, a); const t = clamp(_sc.dot(_sd), 0, L);
      if (_sc.addScaledVector(_sd, -t).lengthSq() < r * r && t < L - 0.3) return true;
    }
    return false;
  }
  rig.update = (rawDt, input = {}) => {
    rig.time += rawDt;
    if (rig.fixed) {
      cam.position.set(fixed[0], fixed[1], fixed[2]); cam.lookAt(fixed[3], fixed[4], fixed[5]);
      applyShake(rawDt); return;
    }
    const lock = P.lockTarget, lx = input.look?.x || 0, ly = input.look?.y || 0;
    if (Math.abs(lx) + Math.abs(ly) > 0) lastInput = rig.time;
    rig.yaw -= lx * 1.0; rig.pitch = clamp(rig.pitch + ly * 0.8, -0.35, 1.2);
    // follow target with spring lag
    const st = P.state, low = st === 'knockdown' || st === 'dead' || st === 'dodge';
    desired.set(P.position.x, P.position.y + (low ? 1.0 : 1.55), P.position.z);
    let wantDist = P.weaponDrawn ? 4.9 : 4.5;
    if (st === 'sprint') wantDist += 0.6; if (st === 'charge') wantDist -= 0.5; if (st === 'heavy') wantDist += 0.4;
    lookOff.set(0, 0, 0); rig.melee = 0;
    if (lock && lock.position) {
      // Camera stays anchored behind the hunter (orbit around the hunter); only the look-at point leans toward the monster.
      tmp.subVectors(lock.position, P.position); tmp.y = 0; const d = tmp.length();
      const wantYaw = Math.atan2(-tmp.x, -tmp.z);
      if (rig.time - lastInput > 0.6) rig.yaw += wrap(wantYaw - rig.yaw) * Math.min(1, rawDt * 3.5);
      let top = 2; try { for (const h of lock.getHitboxes?.() || []) top = Math.max(top, h.sphere.center.y + h.sphere.radius - P.position.y); } catch (e) { /* ignore */ }
      rig.monH += (Math.min(top, 8) - rig.monH) * Math.min(1, rawDt * 2);
      // melee with a tall monster: lower, wider framing (pull back, widen FOV) instead of pitching up
      rig.melee = clamp((12 - d) / 5, 0, 1) * clamp((rig.monH - 2.5) / 2, 0, 1);
      if (d < 25 && d > 0.01) {
        const lean = Math.min(2.5, d * 0.35) * (1 - clamp((d - 18) / 7, 0, 1)) * (1 - 0.6 * rig.melee);
        lookOff.copy(tmp).multiplyScalar(lean / d); lookOff.y = Math.min(1.2, rig.monH * 0.12) * (lean / 2.5) * (1 - rig.melee);
      }
      wantDist += clamp(rig.monH - 3, 0, 4) * 0.35 * (1 - rig.melee) + (d < 8 ? 0.6 : 0);
      wantDist += (8.6 - wantDist) * rig.melee;
      const basePitch = clamp(0.2 + rig.monH * 0.025, 0.18, 0.42) * (1 - rig.melee) + 0.14 * rig.melee;
      if (rig.time - lastInput > 0.6) rig.pitch += (basePitch - rig.pitch) * Math.min(1, rawDt * 1.5);
      desired.y -= 0.25 * rig.melee; // keep the hunter high enough in frame
    } else if (rig.time - lastInput > 2.5 && P.state === 'sprint') {
      rig.yaw += wrap(P.facing + Math.PI - rig.yaw) * Math.min(1, rawDt * 1.2); // gentle auto-recenter while sprinting
    }
    if (first) { rig.target.copy(desired); first = false; }
    // critically damped spring on the hunter-anchored focus point
    const w = 9, x = tmp.subVectors(rig.target, desired);
    const a = x.clone().multiplyScalar(-w * w).addScaledVector(rig.vel, -2 * w);
    rig.vel.addScaledVector(a, rawDt); rig.target.addScaledVector(rig.vel, rawDt);
    if (rig.target.distanceTo(desired) > 4) rig.target.copy(desired);
    rig.lookOff.lerp(lookOff, Math.min(1, rawDt * 4));
    rig.dist += (Math.max(3, wantDist) - rig.dist) * Math.min(1, rawDt * 3);
    // Monster occlusion (hitbox radii inflated 1.35x): first try orbiting sideways to a clear yaw, only a small pitch raise (<=0.35, total <=0.6 over base).
    gatherBlockers();
    const chest = tmp2.set(P.position.x, P.position.y + 1.2, P.position.z);
    const camAt = (yaw, pitch, out) => out.copy(rig.target).addScaledVector(dirOf(yaw, pitch, off), rig.dist);
    const clearAt = (yaw, pitch) => !segBlocked(camAt(yaw, pitch, tmp3), chest);
    const yaw0 = rig.yaw + rig.occYaw, pBase = rig.pitch;
    if (!clearAt(yaw0, pBase + rig.occPitch)) {
      let best = null;
      for (const dy of [0.35, -0.35, 0.7, -0.7, 1.05, -1.05, 1.4, -1.4]) { // prefer the side the camera is already drifting toward
        const yy = rig.occYaw + dy * (Math.sign(rig.occYaw || 1));
        if (clearAt(rig.yaw + yy, pBase)) { best = yy; break; }
      }
      if (best !== null) rig.occYawT = best; else rig.occPitchT = 0.35;
    } else if (clearAt(rig.yaw, pBase)) { rig.occYawT = 0; rig.occPitchT = 0; }
    rig.occYaw += (rig.occYawT - rig.occYaw) * Math.min(1, rawDt * 4);
    rig.occPitch += (rig.occPitchT - rig.occPitch) * Math.min(1, rawDt * 3);
    const pitch = clamp(rig.pitch + Math.min(0.35, rig.occPitch), -0.35, Math.min(1.3, rig.pitch + 0.6));
    const yawF = rig.yaw + rig.occYaw;
    dirOf(yawF, pitch, off);
    // terrain collision: march toward the camera, shorten distance where terrain blocks
    let dist = rig.dist;
    for (let i = 1; i <= 8; i++) {
      const s = (i / 8) * dist; tmp.copy(rig.target).addScaledVector(off, s);
      if (tmp.y < world.getHeight(tmp.x, tmp.z) + 0.35) { dist = Math.max(1.2, s * 0.9); break; }
    }
    pos.copy(rig.target).addScaledVector(off, dist);
    const gh = world.getHeight(pos.x, pos.z) + 0.5; if (pos.y < gh) pos.y = gh;
    // shoulder offset (over right shoulder) for a more cinematic frame
    const right = tmp.set(Math.cos(yawF), 0, -Math.sin(yawF));
    pos.addScaledVector(right, -0.35); look.copy(rig.target).addScaledVector(right, -0.35).add(rig.lookOff);
    cam.position.copy(pos); cam.lookAt(look);
    // safety: hunter off-screen OR hidden behind a monster (ray camera->chest vs inflated hitboxes) for >0.5s -> re-solve
    cam.updateMatrixWorld(); ndc.set(P.position.x, P.position.y + 1.1, P.position.z).project(cam);
    rig.hunterNdc = [ndc.x, ndc.y];
    rig.hunterHidden = segBlocked(cam.position, chest);
    const bad = ndc.z > 1 || Math.abs(ndc.x) > 1 || Math.abs(ndc.y) > 1 || rig.hunterHidden;
    rig.offscreen = bad ? rig.offscreen + rawDt : 0;
    if (rig.offscreen > 0.5) {
      rig.offscreen = 0; rig.resolves++;
      rig.yaw = lock?.position ? Math.atan2(P.position.x - lock.position.x, P.position.z - lock.position.z) : P.facing + Math.PI;
      rig.pitch = 0.2; rig.occPitch = rig.occPitchT = 0; rig.dist = Math.max(5, rig.dist); rig.lookOff.set(0, 0, 0); rig.target.copy(desired); rig.vel.set(0, 0, 0);
      rig.occYaw = rig.occYawT = 0;
      for (const dy of [0, 0.5, -0.5, 1.0, -1.0, 1.5, -1.5, 2.0, -2.0]) { if (clearAt(rig.yaw + dy, 0.2)) { rig.occYaw = rig.occYawT = dy; break; } }
      camAt(rig.yaw + rig.occYaw, 0.2, pos); pos.y = Math.max(pos.y, world.getHeight(pos.x, pos.z) + 0.5);
      cam.position.copy(pos); cam.lookAt(desired);
    }
    // FOV kicks: sprint widens, heavy release punches
    let fovT = baseFov + 7 * (rig.melee || 0) + (st === 'sprint' ? 6 : 0) + (st === 'charge' ? -3 * (P.chargeLevel || 0) * 0.5 : 0);
    rig.kick *= Math.max(0, 1 - rawDt * 4);
    const nf = cam.fov + (fovT + rig.kick - cam.fov) * Math.min(1, rawDt * 6);
    if (Math.abs(nf - cam.fov) > 0.01) { cam.fov = nf; cam.updateProjectionMatrix(); }
    applyShake(rawDt);
  };
  function applyShake(rawDt) {
    if (rig.trauma <= 0.001) return;
    const s = rig.trauma * rig.trauma, t = rig.time * 28;
    cam.rotateX(noise(t, 1.3) * 0.03 * s); cam.rotateY(noise(t, 7.1) * 0.03 * s); cam.rotateZ(noise(t, 3.7) * 0.05 * s);
    cam.position.y += noise(t, 9.2) * 0.08 * s;
    rig.trauma = Math.max(0, rig.trauma - rawDt / rig.shakeDur);
  }
  rig.update(0, {});
  return rig;
}
