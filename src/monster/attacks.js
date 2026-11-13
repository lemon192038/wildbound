// Varkhul attack & reaction library. Each action: duration, pose keyframes (readable wind-ups), root motion,
// active windows with hit spheres, and timed events. Times are in seconds of action time.
import * as THREE from 'three';

// K(t, [[t,v],...]) smooth keyed curve
export function K(t, keys) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, v0] = keys[i], [t1, v1] = keys[i + 1];
    if (t <= t1) { const x = (t - t0) / (t1 - t0); const s = x * x * (3 - 2 * x); return v0 + (v1 - v0) * s; }
  }
  return keys[keys.length - 1][1];
}
const _v = new THREE.Vector3();
const bs = (m, bone, x, y, z, r) => ({ sphere: new THREE.Sphere(m.rig.B[bone].localToWorld(new THREE.Vector3(x, y, z)), r) });

export const ACTIONS = {
  bite: {
    recover: 0, cost: 7, dur: 1.75, rate: 16, track: [0, 0.6, 2.6], tags: ['melee'],
    pose(t, T) {
      T.neckLunge = K(t, [[0, 0], [0.55, -0.55], [0.7, 1.15], [0.95, 1.0], [1.45, 0]]);
      T.headPitch = K(t, [[0, 0], [0.55, 0.35], [0.7, -0.15], [0.95, -0.1], [1.4, 0]]);
      T.jaw = K(t, [[0, 0], [0.45, 0.35], [0.66, 1.1], [0.8, 0.05], [1.2, 0.1], [1.5, 0]]);
      T.crouch = K(t, [[0, 0], [0.55, 0.35], [0.72, 0.1], [1.4, 0]]);
      T.pitch = K(t, [[0, 0], [0.55, -0.05], [0.75, -0.08], [1.4, 0]]);
      T.shake = t > 0.25 && t < 0.55 ? 0.6 : 0; T.look = t < 0.6 ? 1 : 0.2;
    },
    motion: (t) => (t > 0.6 && t < 0.95 ? 9 : t > 0.95 && t < 1.2 ? 1.5 : 0),
    active: [{ t0: 0.68, t1: 0.92, damage: 28, knockback: 7, spheres: (m) => [bs(m, 'head', 0, -0.1, 1.2, 1.35), bs(m, 'jaw', 0, 0, 1.2, 1.0)] }],
    events: [[0.2, (m) => m.sfx('growl', 0.7)], [0.68, (m) => m.sfx('bite', 1)]],
  },
  tailSweep: {
    recover: 0.35, cost: 11, dur: 2.4, rate: 12, track: [0, 0.45, 1.5], tags: ['aoe'],
    pose(t, T) {
      T.crouch = K(t, [[0, 0], [0.75, 0.45], [1.0, 0.2], [1.6, 0.3], [2.2, 0]]);
      T.tailYaw = K(t, [[0, 0], [0.75, 1.6], [0.95, -1.2], [1.5, -0.6], [2.0, 0]]);
      T.tailLift = K(t, [[0, 0], [0.75, 0.4], [1.0, 0.15], [2.0, 0]]);
      T.spineYaw = K(t, [[0, 0], [0.75, 0.35], [0.95, -0.3], [1.5, 0]]);
      T.neckYaw = K(t, [[0, 0], [0.75, -0.5], [1.0, 0.4], [1.6, 0]]);
      T.feetFree = K(t, [[0.7, 0], [0.85, 0.75], [1.45, 0.75], [1.65, 0]]);
      T.jaw = K(t, [[0, 0], [0.7, 0.4], [1.0, 0.2], [1.5, 0]]);
      T.look = t < 0.6 ? 1 : 0;
    },
    // yaw delta per action time (wind back then full spin)
    yaw: (t) => K(t, [[0, 0], [0.75, 0.55], [0.85, 0.2], [1.45, -Math.PI * 2 + 0.55], [1.6, -Math.PI * 2 + 0.35], [1.8, -Math.PI * 2]]),
    active: [{ t0: 0.9, t1: 1.45, damage: 32, knockback: 13, spheres: (m) => [bs(m, 'tail3', 0, 0, -0.4, 1.0), bs(m, 'tail4', 0, 0, -0.4, 0.95), bs(m, 'tail5', 0, 0, -0.4, 0.9), ...(m.tailSevered ? [] : [bs(m, 'tail6', 0, -0.05, -0.6, 1.25), bs(m, 'tail6', 0, -0.1, -1.4, 0.9)])] }],
    events: [[0.3, (m) => m.sfx('growl', 0.6)], [0.9, (m) => m.sfx('swoosh', 1)], [1.6, (m) => m.shake(0.35, 0.3)]],
  },
  charge: {
    recover: 1.3, cost: 15, dur: 3.3, rate: 10, track: [0, 0.85, 3.0], tags: ['ranged'],
    pose(t, T) {
      T.crouch = K(t, [[0, 0], [0.7, 0.55], [0.95, 0.15], [2.6, 0.2], [2.9, 0.35], [3.3, 0]]);
      T.pitch = K(t, [[0, 0], [0.7, -0.12], [1.0, -0.05], [2.6, -0.06], [2.85, 0.12], [3.3, 0]]);
      T.neckPitch = K(t, [[0, 0], [0.7, -0.45], [1.0, -0.3], [2.6, -0.3], [2.9, 0.1], [3.3, 0]]);
      T.headPitch = K(t, [[0, 0], [0.7, 0.3], [2.6, 0.25], [3.0, 0]]);
      T.shake = t > 0.3 && t < 0.8 ? 1 : 0; T.jaw = K(t, [[0, 0], [0.5, 0.5], [0.9, 0.2], [2.6, 0.4], [3.3, 0]]);
      T.wings = K(t, [[0, 0], [0.9, 0.2], [2.6, 0.25], [3.1, 0]]); T.look = t < 0.9 ? 1 : 0;
    },
    motion: (t) => (t < 0.9 ? 0 : t < 1.2 ? (t - 0.9) / 0.3 * 17 : t < 2.6 ? 17 : t < 3.0 ? 17 * (1 - (t - 2.6) / 0.4) : 0),
    homing: [1.0, 2.4, 0.45], gait: (t) => (t > 0.9 && t < 2.8 ? 2.4 : 1),
    active: [{ t0: 1.0, t1: 2.65, damage: 34, knockback: 16, spheres: (m) => [bs(m, 'head', 0, 0, 0.8, 1.6), bs(m, 'chest', 0, -1.0, 0.6, 2.2)] }],
    events: [[0.15, (m) => m.sfx('snort', 1)], [2.6, (m) => { m.sfx('skid', 1); m.dust(m.rig.B.chest, 1.5); }]],
  },
  leapSlam: {
    recover: 1.3, cost: 16, dur: 2.7, rate: 12, track: [0, 0.85, 2.5], tags: ['ranged', 'aoe'],
    pose(t, T) {
      T.crouch = K(t, [[0, 0], [0.8, 1.0], [0.95, -0.2], [1.45, -0.1], [1.62, 1.1], [2.1, 0.5], [2.7, 0]]);
      T.pitch = K(t, [[0, 0], [0.8, 0.14], [1.1, 0.22], [1.45, -0.18], [1.65, -0.12], [2.4, 0]]);
      T.wings = K(t, [[0, 0], [0.8, 0.55], [1.0, 1.05], [1.5, 0.9], [1.8, 0.6], [2.6, 0]]);
      T.flap = K(t, [[0.9, 0], [1.0, 0.8], [1.4, 0.4], [1.6, 0]]);
      T.tuck = K(t, [[0.85, 0], [1.05, 1], [1.4, 0.6], [1.58, 0]]);
      T.neckPitch = K(t, [[0, 0], [0.8, 0.25], [1.4, -0.3], [1.7, -0.45], [2.4, 0]]);
      T.headPitch = K(t, [[0, 0], [0.8, 0.2], [1.4, 0.35], [2.4, 0]]);
      T.jaw = K(t, [[0, 0], [0.8, 0.4], [1.3, 0.9], [1.7, 0.3], [2.4, 0]]);
      T.tailLift = K(t, [[0, 0], [0.8, -0.2], [1.2, 0.5], [1.6, -0.3], [2.4, 0]]);
      T.look = t < 0.85 ? 1 : 0.3;
    },
    air: [0.92, 1.58], height: 7.5,
    active: [{ t0: 1.56, t1: 1.74, damage: 40, knockback: 18, spheres: (m) => { const c = m.position.clone(); c.y += 0.6; return [{ sphere: new THREE.Sphere(c, 7.0) }, bs(m, 'chest', 0, -1.2, 1.2, 2.6)]; } }],
    events: [[0.2, (m) => m.sfx('growl', 0.8)], [0.92, (m) => { m.sfx('leap', 1); m.dust(null, 1.5); }],
      [1.58, (m) => { m.sfx('slam', 1.4); m.dust(null, 4); m.shake(1.2, 0.6); m.events.emit('footstep', { position: m.position.clone(), heavy: true }); }]],
  },
  fireBreath: {
    recover: 1.3, cost: 18, dur: 3.8, rate: 9, track: [0, 0.95, 2.2], tags: ['ranged'],
    pose(t, T, m) {
      const w = m.enraged ? 0.75 : 0.45;
      T.pitch = K(t, [[0, 0], [0.9, 0.22], [1.1, 0.06], [2.9, 0.04], [3.5, 0]]);
      T.crouch = K(t, [[0, 0], [0.9, -0.1], [1.1, 0.25], [2.9, 0.2], [3.5, 0]]);
      T.neckPitch = K(t, [[0, 0], [0.9, 0.6], [1.15, -0.05], [2.9, -0.05], [3.5, 0]]);
      T.headPitch = K(t, [[0, 0], [0.9, 0.45], [1.15, -0.3], [2.9, -0.25], [3.5, 0]]);
      T.jaw = K(t, [[0, 0], [0.6, 0.25], [0.95, 0.15], [1.1, 1.05], [2.9, 1.0], [3.3, 0]]);
      T.neckYaw = K(t, [[0, 0], [1.05, -w * 0.5], [1.2, -w], [2.8, w], [3.4, 0]]);
      T.wings = K(t, [[0, 0], [0.9, 0.35], [1.2, 0.5], [2.9, 0.45], [3.5, 0]]);
      T.tailLift = K(t, [[0, 0], [0.9, 0.3], [3.0, 0.2], [3.6, 0]]);
      T.look = t < 1.0 ? 1 : 0; T.shake = t > 1.1 && t < 2.9 ? 0.25 : 0;
    },
    throat: (t) => K(t, [[0, 0.15], [0.95, 3.0], [1.2, 2.2], [2.8, 2.0], [3.2, 0.15]]),
    breath: [1.1, 2.85],
    active: [{ t0: 1.3, t1: 2.9, damage: 30, knockback: 6, kind: 'fire', spheres: (m) => m.breathSpheres() }],
    events: [[0.1, (m) => m.sfx('inhale', 1)], [1.1, (m) => m.sfx('breath', 1.2)]],
  },
  roar: {
    recover: 0, cost: 4, dur: 2.9, rate: 10, track: [0, 0.5, 2.0], tags: ['roar'],
    pose(t, T) {
      T.crouch = K(t, [[0, 0], [0.65, 0.4], [0.85, -0.25], [2.2, -0.2], [2.8, 0]]);
      T.pitch = K(t, [[0, 0], [0.65, -0.08], [0.9, 0.3], [2.2, 0.28], [2.8, 0]]);
      T.frontLift = K(t, [[0, 0], [0.7, 0], [0.9, 0.0], [2.8, 0]]);
      T.neckPitch = K(t, [[0, 0], [0.65, -0.4], [0.9, 0.6], [2.2, 0.55], [2.8, 0]]);
      T.headPitch = K(t, [[0, 0], [0.65, 0.2], [0.9, 0.2], [2.2, 0.15], [2.8, 0]]);
      T.jaw = K(t, [[0, 0], [0.65, 0.2], [0.85, 1.2], [2.2, 1.15], [2.6, 0]]);
      T.wings = K(t, [[0, 0], [0.7, 0.1], [1.0, 1.0], [2.2, 1.0], [2.8, 0]]);
      T.tailLift = K(t, [[0, 0], [0.9, 0.6], [2.2, 0.5], [2.8, 0]]);
      T.shake = t > 0.9 && t < 2.2 ? 1 : 0; T.look = t < 0.6 ? 1 : 0;
    },
    events: [[0.85, (m) => m.doRoar()]],
    active: [{ t0: 0.85, t1: 1.2, damage: 0, knockback: 0, kind: 'roar', spheres: (m) => [{ sphere: new THREE.Sphere(m.rig.B.head.getWorldPosition(new THREE.Vector3()), 13) }] }],
  },
  // punishable recovery after an attack/combo: head lowered, panting, no tracking
  recover: {
    dur: 1.3, rate: 9, tags: ['react', 'recover'],
    pose(t, T, m) {
      const e = m.exhausted ? 1.4 : 1;
      T.neckPitch = K(t, [[0, 0], [0.3, -0.45 * e], [1.0, -0.4 * e], [1.3, 0]]); T.headPitch = K(t, [[0, 0], [0.3, -0.15], [1.3, 0]]);
      T.crouch = K(t, [[0, 0], [0.3, 0.3], [1.0, 0.25], [1.3, 0]]); T.jaw = 0.35 + 0.15 * Math.sin(t * 9); T.look = 0.15;
      T.spinePitch = -0.06 * Math.sin(t * 9);
    },
    events: [[0.2, (m) => m.sfx('pant', 0.7)]],
  },
  // exhausted fire breath: inhale, then a sputtering puff of smoke & sparks that does nothing
  fizzle: {
    dur: 2.4, rate: 9, track: [0, 0.8, 1.2], tags: ['fizzle'],
    pose(t, T) {
      T.pitch = K(t, [[0, 0], [0.8, 0.15], [1.0, 0.0], [2.4, 0]]); T.neckPitch = K(t, [[0, 0], [0.8, 0.45], [1.0, -0.2], [1.8, -0.4], [2.4, 0]]);
      T.headPitch = K(t, [[0, 0], [0.8, 0.35], [1.0, -0.3], [2.4, 0]]); T.jaw = K(t, [[0, 0], [0.9, 0.2], [1.0, 0.9], [1.6, 0.6], [2.2, 0]]);
      T.shake = t > 1.0 && t < 1.8 ? 0.8 : 0; T.crouch = K(t, [[0, 0], [1.0, 0.2], [1.8, 0.4], [2.4, 0]]); T.look = t < 0.8 ? 1 : 0;
    },
    throat: (t) => K(t, [[0, 0.1], [0.8, 1.0], [1.0, 0.3], [2.0, 0.05]]),
    events: [[0.1, (m) => m.sfx('inhale', 0.7)], [1.0, (m) => { m.sfx('fizzle', 1); m.fizzle(); }]],
  },
  flinchHead: {
    dur: 0.55, rate: 20, tags: ['react'],
    pose(t, T, m) { const s = m.flinchSide || 1; T.headPitch = K(t, [[0, 0], [0.08, 0.45], [0.55, 0]]); T.headYaw = K(t, [[0, 0], [0.08, -0.35 * s], [0.55, 0]]); T.jaw = K(t, [[0, 0], [0.1, 0.6], [0.5, 0]]); T.look = 0; },
    events: [[0, (m) => m.sfx('monsterHurt', 0.6)]],
  },
  legBuckle: {
    dur: 0.8, rate: 16, tags: ['react'],
    pose(t, T, m) { const s = m.flinchSide || 1; T.crouch = K(t, [[0, 0], [0.12, 0.6], [0.8, 0]]); T.roll = K(t, [[0, 0], [0.12, -0.12 * s], [0.8, 0]]); T.pitch = K(t, [[0, 0], [0.12, m.buckleFront ? -0.12 : 0.08], [0.8, 0]]); T.look = 0.3; },
    events: [[0, (m) => m.sfx('monsterHurt', 0.5)], [0.12, (m) => m.shake(0.15, 0.2)]],
  },
  flinch: {
    dur: 1.15, rate: 18, tags: ['react'],
    pose(t, T, m) {
      const s = m.flinchSide || 1;
      T.headPitch = K(t, [[0, 0], [0.12, 0.5], [0.6, 0.2], [1.1, 0]]); T.neckYaw = K(t, [[0, 0], [0.12, 0.6 * s], [0.7, 0.2 * s], [1.1, 0]]);
      T.crouch = K(t, [[0, 0], [0.15, 0.45], [0.8, 0.2], [1.1, 0]]); T.pitch = K(t, [[0, 0], [0.12, -0.1], [1.1, 0]]);
      T.jaw = K(t, [[0, 0], [0.1, 0.8], [0.6, 0.3], [1.0, 0]]); T.roll = K(t, [[0, 0], [0.15, 0.08 * s], [1.0, 0]]); T.look = 0; T.wings = K(t, [[0, 0], [0.15, 0.3], [0.9, 0]]);
    },
    events: [[0, (m) => m.sfx('monsterHurt', 1)]],
  },
  topple: {
    dur: 5.8, rate: 7, tags: ['react', 'down'],
    pose(t, T, m) {
      const s = m.flinchSide || 1;
      T.lieSide = K(t, [[0, 0], [0.7, 1.32 * s], [4.8, 1.25 * s], [5.6, 0]]);
      T.crouch = K(t, [[0, 0], [0.7, 1.75], [4.8, 1.7], [5.6, 0]]);
      T.feetFree = K(t, [[0, 0], [0.4, 1], [5.0, 1], [5.6, 0]]); T.legKick = K(t, [[0.6, 0], [1.0, 1], [4.6, 0.8], [5.2, 0]]);
      T.neckPitch = K(t, [[0, 0], [0.7, -0.2], [3.8, 0.1], [4.6, 0]]); T.jaw = K(t, [[0, 0], [0.5, 0.9], [2.0, 0.5], [3.5, 0.7], [4.4, 0]]);
      T.headYaw = Math.sin(t * 3) * 0.2; T.tailCurl = 0.8; T.wings = K(t, [[0, 0], [0.7, 0.6], [3.8, 0.4], [4.6, 0]]); T.flap = 0.25; T.look = 0;
    },
    events: [[0, (m) => m.sfx('monsterHurt', 1.3)], [0.7, (m) => { m.dust(null, 3); m.shake(0.6, 0.4); m.sfx('thud', 1.4); }]],
  },
  death: {
    dur: 3.0, rate: 5, tags: ['react'], hold: true,
    pose(t, T, m) {
      const s = m.flinchSide || 1;
      T.lieSide = K(t, [[0, 0], [0.4, 0.15 * s], [1.6, 1.42 * s]]); T.crouch = K(t, [[0, 0], [0.4, -0.2], [1.6, 1.85]]);
      T.pitch = K(t, [[0, 0], [0.4, 0.2], [1.6, -0.05]]);
      T.feetFree = K(t, [[0.3, 0], [1.2, 1]]); T.legKick = K(t, [[1.2, 0.6], [2.6, 0]]);
      T.neckPitch = K(t, [[0, 0], [0.4, 0.8], [1.8, -0.5]]); T.headPitch = K(t, [[0, 0], [0.4, 0.5], [1.8, -0.3]]);
      T.jaw = K(t, [[0, 0], [0.4, 1.2], [2.4, 0.45]]); T.wings = K(t, [[0, 0], [0.5, 0.9], [2.0, 0.55]]); T.look = 0; T.tailLift = K(t, [[0, 0], [0.5, 0.6], [2.0, -0.3]]);
      T.shake = t < 1.0 ? 1 : 0;
    },
    events: [[0, (m) => m.sfx('roar', 0.8)], [1.6, (m) => { m.dust(null, 4); m.shake(0.8, 0.5); m.sfx('thud', 1.6); }]],
  },
};

// combos (sequences queued by the AI)
export const COMBOS = {
  emberRush: ['bite', 'bite', 'tailSweep'],
  inferno: ['leapSlam', 'fireBreath'],
  cinderCharge: ['charge', 'tailSweep'],
  biteSweep: ['bite', 'tailSweep'],
  doubleBite: ['bite', 'bite'],
  sweepBite: ['tailSweep', 'bite'],
};
