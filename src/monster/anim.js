// Procedural animation for Varkhul: gait with foot planting (2-bone IK on terrain), body bob/tilt,
// head tracking, spring tail, wings, jaw, plus pose-parameter layering driven by the AI/attacks.
import * as THREE from 'three';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion(), _qp = new THREE.Quaternion();
const _m = new THREE.Matrix4(), _e = new THREE.Euler();
const clamp = THREE.MathUtils.clamp;

function basisQuat(x, ref, out) {
  const X = _a.copy(x).normalize();
  const Y = _b.copy(ref).addScaledVector(X, -ref.dot(X)).normalize();
  const Z = _c.crossVectors(X, Y);
  _m.makeBasis(X, Y, Z); return out.setFromRotationMatrix(_m);
}

export const POSE_DEFAULTS = {
  crouch: 0, pitch: 0, roll: 0, bodyYaw: 0, spinePitch: 0, spineYaw: 0,
  neckPitch: 0, neckYaw: 0, neckLunge: 0, headPitch: 0, headYaw: 0, headRoll: 0, jaw: 0,
  wings: 0, flap: 0, tailYaw: 0, tailLift: 0, tailCurl: 0, frontLift: 0, feetFree: 0, tuck: 0, shake: 0, look: 1, legKick: 0, lieSide: 0,
};

export class Animator {
  constructor(game, rig, obj) {
    this.game = game; this.rig = rig; this.obj = obj; this.t = 0;
    const B = rig.B;
    this.P = { ...POSE_DEFAULTS };
    this.legs = [];
    const def = (key, S, s, front, group) => {
      const upper = B[(front ? 'upperArm' : 'thigh') + s], lower = B[(front ? 'foreArm' : 'shin') + s], end = B[(front ? 'hand' : 'meta') + s];
      const A = front ? S.shoulder : S.hip, K = front ? S.elbow : S.knee, C = front ? S.wrist : S.ankle, plant = front ? S.fplant : S.hplant;
      const n = C.clone().sub(A).normalize(); const pole = K.clone().sub(A); pole.addScaledVector(n, -pole.dot(n)).normalize();
      const planeN = new THREE.Vector3().crossVectors(n, pole).normalize();
      const r1 = basisQuat(K.clone().sub(A), planeN, new THREE.Quaternion()).invert();
      const r2 = basisQuat(C.clone().sub(K), planeN, new THREE.Quaternion()).invert();
      this.legs.push({ key, front, group, upper, lower, end, l1: A.distanceTo(K), l2: K.distanceTo(C), poleRest: pole, r1, r2,
        plantRest: plant.clone(), endOffset: C.clone().sub(plant), endRest: C.clone(), rootRest: rig.J.root.clone(),
        planted: new THREE.Vector3(), from: new THREE.Vector3(), to: new THREE.Vector3(), stepping: false, st: 0, lift: 0, cur: new THREE.Vector3(), init: false });
    };
    def('FL', rig.L, 'L', true, 0); def('FR', rig.R, 'R', true, 1); def('HL', rig.L, 'L', false, 1); def('HR', rig.R, 'R', false, 0);
    this.tail = ['tail1', 'tail2', 'tail3', 'tail4', 'tail5', 'tail6'].map((n) => ({ bone: B[n], yaw: 0, vy: 0, pitch: 0, vp: 0 }));
    this.look = { yaw: 0, pitch: 0 };
    this.terrain = { pitch: 0, roll: 0 };
    this.lastVelY = 0; this.vertSpring = 0; this.vertVel = 0;
    this.spreadQ = {};
    for (const s of ['L', 'R']) for (const f of ['f1', 'f2', 'f3']) {
      const S = s === 'L' ? rig.L : rig.R; this.spreadQ[f + s] = new THREE.Quaternion().setFromUnitVectors(S[f].clone().normalize(), S[f + 's']);
    }
    this.onStep = null;
  }

  // P targets are blended by the caller; here we just apply P + procedural layers.
  update(dt, ctx) {
    const { rig, obj, P } = this; const B = rig.B; const world = this.game.world;
    this.t += dt; const t = this.t;
    for (const b of rig.bones) { b.position.copy(b.userData.restPos); b.quaternion.identity(); }
    const speed = ctx.speed || 0, yawRate = ctx.yawRate || 0;
    // --- terrain tilt ---
    const fwd = _d.set(Math.sin(ctx.yaw), 0, Math.cos(ctx.yaw));
    const px = obj.position.x, pz = obj.position.z;
    const hF = world.getHeight(px + fwd.x * 3.5, pz + fwd.z * 3.5), hB = world.getHeight(px - fwd.x * 3.5, pz - fwd.z * 3.5);
    const hL = world.getHeight(px + fwd.z * 1.8, pz - fwd.x * 1.8), hR = world.getHeight(px - fwd.z * 1.8, pz + fwd.x * 1.8);
    const k = 1 - Math.exp(-dt * 5);
    this.terrain.pitch += (clamp(Math.atan2(hF - hB, 7), -0.45, 0.45) - this.terrain.pitch) * k;
    this.terrain.roll += (clamp(Math.atan2(hL - hR, 3.6), -0.3, 0.3) - this.terrain.roll) * k;
    // vertical secondary (tail/neck react to bobbing)
    const grounded = !ctx.air && !ctx.dead;
    // --- body ---
    let bob = 0, sway = 0;
    for (const L of this.legs) if (L.stepping) { const s = Math.sin(Math.PI * L.st); bob -= 0.05 * s * Math.min(1, speed / 3 + 0.3); sway += (L.key[1] === 'L' ? 1 : -1) * 0.02 * s; }
    const breath = Math.sin(t * 1.6) * 0.035;
    const root = B.root;
    root.position.y += -P.crouch + bob + breath * 0.5 + (ctx.lift || 0);
    root.position.z += P.neckLunge * 0.25;
    _e.set(-(this.terrain.pitch * 0.75 + P.pitch), P.bodyYaw + yawRate * -0.03, this.terrain.roll * 0.6 + P.roll + sway + P.lieSide, 'YXZ');
    root.quaternion.setFromEuler(_e);
    const sp = P.spinePitch / 3, sy = (P.spineYaw + yawRate * 0.06) / 3;
    for (const n of ['spine1', 'spine2', 'chest']) { _e.set(-sp + (n === 'chest' ? -breath * 0.15 : 0), sy, 0); B[n].quaternion.setFromEuler(_e); }
    B.chest.scale.setScalar(1);
    // --- neck & head (S-curve + look) ---
    if (ctx.look && P.look > 0) {
      obj.updateMatrixWorld(); const lt = _a.copy(ctx.look); obj.worldToLocal(lt);
      const dx = lt.x, dz = lt.z - 3.5, dy = lt.y - 4.6;
      const ty = clamp(Math.atan2(dx, dz), -1.15, 1.15) * P.look, tp = clamp(Math.atan2(dy, Math.hypot(dx, dz)), -0.55, 0.45) * P.look;
      const kl = 1 - Math.exp(-dt * 4); this.look.yaw += (ty - this.look.yaw) * kl; this.look.pitch += (tp - this.look.pitch) * kl;
    } else { const kl = 1 - Math.exp(-dt * 3); this.look.yaw *= 1 - kl; this.look.pitch *= 1 - kl; }
    const ly = this.look.yaw + P.neckYaw, lp = this.look.pitch;
    const nb = Math.sin(t * 1.6 + 0.6) * 0.025;
    // neckLunge: drop the neck base, straighten neck forward, head compensates up
    _e.set(-(P.neckPitch * 0.45 + lp * 0.2) + P.neckLunge * 0.55 + nb, ly * 0.22, 0); B.neck1.quaternion.setFromEuler(_e);
    _e.set(-(P.neckPitch * 0.35 + lp * 0.3) + P.neckLunge * 0.35, ly * 0.3, 0); B.neck2.quaternion.setFromEuler(_e);
    _e.set(-(P.neckPitch * 0.2 + lp * 0.25) - P.neckLunge * 0.25, ly * 0.25, 0); B.neck3.quaternion.setFromEuler(_e);
    const shake = P.shake ? Math.sin(t * 38) * 0.06 * P.shake : 0;
    _e.set(-(P.headPitch + lp * 0.25) - P.neckLunge * 0.45 - nb, ly * 0.23 + P.headYaw + shake, P.headRoll + shake * 0.5); B.head.quaternion.setFromEuler(_e);
    B.jaw.quaternion.setFromEuler(_e.set(clamp(P.jaw, 0, 1.2) * 0.72 + Math.max(0, Math.sin(t * 0.7)) * 0.03, 0, 0));
    // --- tail: spring chain reacting to turning & vertical motion ---
    const kS = 34, cS = 5.5; const vAcc = ctx.vAcc || 0;
    for (let i = 0; i < this.tail.length; i++) {
      const T = this.tail[i], w = (i + 1) / this.tail.length;
      const idle = Math.sin(t * 1.25 - i * 0.55) * (0.035 + 0.02 * w) * (1 + speed * 0.05);
      const target = P.tailYaw * (0.08 + 0.2 * w) + idle - yawRate * 0.075 * (0.4 + w) + P.tailCurl * Math.sin(t * 9 - i * 0.9) * 0.15;
      T.vy += (kS * (target - T.yaw) - cS * T.vy) * dt; T.yaw += T.vy * dt;
      const pt = -P.tailLift * (0.15 + 0.05 * i) + 0.03 + Math.sin(t * 1.6 - i * 0.5) * 0.015 - (grounded ? 0 : 0.08);
      T.vp += (kS * (pt - T.pitch) - cS * T.vp - vAcc * 0.02 * w) * dt; T.pitch += T.vp * dt;
      T.bone.quaternion.setFromEuler(_e.set(-T.pitch, T.yaw, 0, 'YXZ'));
    }
    // --- wings ---
    const spread = clamp(P.wings + (P.flap ? Math.sin(t * 9) * 0.3 * P.flap : 0), 0, 1.15);
    for (const s of ['L', 'R']) {
      for (const [i, f] of ['f1', 'f2', 'f3'].entries()) {
        const q = B[f + s].quaternion; q.identity().slerp(this.spreadQ[f + s], spread);
        if (spread < 0.05) q.multiply(_q1.setFromAxisAngle(_a.set(s === 'L' ? 0 : 0, 0, 1), Math.sin(t * 1.6 + i) * 0.015));
      }
    }
    // --- legs ---
    obj.updateMatrixWorld(true);
    const rootQ = root.getWorldQuaternion(_qp); const objQ = obj.quaternion;
    const vel = ctx.velocity || _d.set(0, 0, 0);
    const lead = 0.28, stepDur = clamp(0.64 - speed * 0.042, 0.26, 0.64) / (ctx.gaitRate || 1);
    const thresh = 0.55 + speed * 0.1;
    for (const L of this.legs) {
      // home (ground contact) in world
      const home = _b.copy(L.plantRest); obj.localToWorld(home); home.addScaledVector(vel, lead); home.y = world.getHeight(home.x, home.z);
      if (!L.init || ctx.snapFeet) { L.planted.copy(home); L.cur.copy(home); L.init = true; L.stepping = false; }
      const free = clamp(Math.max(P.feetFree, ctx.air ? 1 : 0, ctx.dead ? 1 : 0, L.front ? P.frontLift : 0), 0, 1);
      if (grounded) {
        if (L.stepping) {
          L.to.copy(home).addScaledVector(vel, stepDur * (1 - L.st) * 0.5); L.to.y = world.getHeight(L.to.x, L.to.z);
          L.st += dt / stepDur;
          if (L.st >= 1) {
            L.stepping = false; L.planted.copy(L.to); this.onStep?.(L.planted, L.front, speed);
          }
        } else {
          const err = Math.hypot(L.planted.x - home.x, L.planted.z - home.z);
          const settle = speed < 0.3 && err > 0.22 && !this.legs.some((o) => o.stepping);
          if ((err > thresh || settle || free > 0.8) && this.canStep(L)) { L.stepping = true; L.st = 0; L.from.copy(L.planted); L.to.copy(home); L.lift = 0.35 + Math.min(0.5, speed * 0.05); }
        }
      } else { L.planted.copy(home); L.stepping = false; }
      // current foot position
      if (L.stepping) {
        const e = L.st * L.st * (3 - 2 * L.st);
        L.cur.lerpVectors(L.from, L.to, e); L.cur.y += Math.sin(Math.PI * L.st) * L.lift;
      } else L.cur.copy(L.planted);
      // end-effector target (wrist/ankle)
      const T = _c.copy(L.endOffset).applyQuaternion(objQ).add(L.cur);
      if (free > 0) {
        // body-relative pose (rest relative to root bone) + tuck / raise
        const fr = _a.copy(L.endRest).sub(L.rootRest);
        if (L.front) fr.add(_d.set(0, P.frontLift * 0.9 + P.tuck * 0.6, P.frontLift * 0.7 + P.tuck * 0.2));
        else fr.add(_d.set(0, P.tuck * 0.9, -P.tuck * 0.2));
        if (P.legKick) fr.add(_d.set(0, Math.sin(t * 7 + L.group * 2 + (L.front ? 1 : 0)) * 0.5 * P.legKick, Math.cos(t * 6 + L.group) * 0.4 * P.legKick));
        root.localToWorld(fr);
        T.lerp(fr, free);
      }
      this.solveLeg(L, T, rootQ, objQ);
    }
    obj.updateMatrixWorld(true);
  }

  canStep(L) {
    const other = this.legs.filter((o) => o.group !== L.group);
    if (other.some((o) => o.stepping && o.st < 0.85)) return false;
    return this.legs.filter((o) => o.stepping).length < 2;
  }

  solveLeg(L, T, rootQ, objQ) {
    const A = L.upper.getWorldPosition(_a.clone());
    const dVec = T.clone().sub(A); let d = dVec.length();
    const dd = clamp(d, Math.abs(L.l1 - L.l2) + 0.05, L.l1 + L.l2 - 0.02); const n = dVec.normalize();
    const pole = L.poleRest.clone().applyQuaternion(rootQ); const perp = pole.addScaledVector(n, -pole.dot(n)).normalize();
    const a = (L.l1 * L.l1 - L.l2 * L.l2 + dd * dd) / (2 * dd); const h = Math.sqrt(Math.max(0, L.l1 * L.l1 - a * a));
    const K = A.clone().addScaledVector(n, a).addScaledVector(perp, h);
    const endP = A.clone().addScaledVector(n, dd);
    const planeN = new THREE.Vector3().crossVectors(n, perp).normalize();
    const Q1 = basisQuat(K.clone().sub(A), planeN, new THREE.Quaternion()).multiply(L.r1);
    const Q2 = basisQuat(endP.sub(K), planeN, new THREE.Quaternion()).multiply(L.r2);
    L.upper.parent.getWorldQuaternion(_q3);
    L.upper.quaternion.copy(_q3.invert().multiply(Q1));
    L.lower.quaternion.copy(_q2.copy(Q1).invert().multiply(Q2));
    L.end.quaternion.copy(_q2.copy(Q2).invert().multiply(objQ));
    L.upper.updateMatrixWorld(true);
  }
}
