// Cindral, the Ashwing: a flying wyvern built on the user-supplied mesh (public/models/wyvern.glb),
// auto-rigged by tools/rig-wyvern.mjs (24 joints, identity rest rotations, +Z head, +Y up, ±X wings).
// Same contract as createMonster (CONTRACTS.md): update, getHitboxes, getAttackHitboxes, receiveHit,
// serialize/applyRemote (remoteControlled honoured), events monster:roar/partBreak/died/state.
//
// Moveset: hover rock-bombing (timed rock bombs that swell and blast + large burn), forced detonation
// (fireball shot / bite into a placed rock), back-jump rock spit, great roar → guaranteed follow-up,
// dragon wind pressure (long stun on landing/takeoff/gust), sweeping breath (fan of flame, burning
// ground trail), chained talon dives with deadly poison, plus tail spin, bite and fireball.
// Hazards/effects live in wyvernFx.js.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createWyvernFx } from './wyvernFx.js';

const S = 16; // source mesh units → metres (wingspan ≈ 16 m)
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const rng = (seed) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

const PART_DEFS = [
  { name: 'head', hp: 2600, hitzone: 1.45, breakable: true, flinch: 700 },
  { name: 'wings', hp: 3400, hitzone: 1.1, breakable: true, flinch: 900 },
  { name: 'tail', hp: 2800, hitzone: 1.2, breakable: true, flinch: 900 },
  { name: 'legs', hp: 99999, hitzone: 1.0, breakable: false, flinch: 1000 },
  { name: 'body', hp: 99999, hitzone: 0.8, breakable: false, flinch: 1300 },
];
const STATE_CODES = ['idle', 'roam', 'chase', 'attack', 'flinch', 'topple', 'dead', 'exhausted', 'recover'];
const HOVER = 6.2, LANDED = 3.55, HIGH = 13;

export async function createWyvern(game) {
  const { scene, events, world } = game;
  const params = game.params || new URLSearchParams();
  const gltf = await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}models/wyvern.glb`); // served from public/
  const model = gltf.scene; model.scale.setScalar(S);
  const obj = new THREE.Group(); obj.name = 'Cindral'; obj.rotation.order = 'YXZ'; obj.add(model); scene.add(obj);
  let skinned = null;
  model.traverse((o) => {
    if (o.isSkinnedMesh) {
      skinned = o; o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
      const mat = o.material; mat.metalness = 0.12; mat.roughness = 0.85;
      mat.emissive = new THREE.Color(1.0, 0.42, 0.12); mat.emissiveMap = mat.map; mat.emissiveIntensity = 0.18;
    }
  });
  const B = {}; model.traverse((o) => { if (o.name && !o.isMesh) B[o.name] = o; });

  const spawn = world.spawn?.monster || new THREE.Vector3(0, 0, -20);
  obj.position.set(spawn.x, world.getHeight(spawn.x, spawn.z) + HOVER, spawn.z);

  // hitboxes: [part, bone, offset (source units, bone-local), radius (source units), flag]
  const HB = [
    ['head', 'head', [0, -0.01, 0.05], 0.045], ['head', 'head', [0, -0.03, 0.09], 0.035],
    ['body', 'neck1', [0, 0, 0.03], 0.04], ['body', 'neck2', [0, 0, 0.02], 0.035],
    ['body', 'chest', [0, 0, -0.02], 0.07], ['body', 'root', [0, 0, -0.03], 0.07], ['body', 'hips', [0, 0, -0.02], 0.06],
    ['tail', 'tail1', [0, -0.02, -0.04], 0.04], ['tail', 'tail2', [0, -0.02, -0.03], 0.035], ['tail', 'tail3', [0, -0.02, -0.03], 0.032, 'tip'],
  ];
  for (const [s, k] of [['L', 1], ['R', -1]]) {
    HB.push(['legs', 'fore1' + s, [-0.005 * k, -0.045, -0.005], 0.035], ['legs', 'fore2' + s, [-0.005 * k, -0.035, -0.015], 0.03]);
    HB.push(['legs', 'hind1' + s, [0, -0.025, -0.02], 0.035], ['legs', 'hind2' + s, [0, -0.01, -0.045], 0.03]);
    HB.push(['wings', 'wing1' + s, [0.065 * k, 0.035, 0.03], 0.045], ['wings', 'wing2' + s, [0.06 * k, 0.055, 0.045], 0.05],
      ['wings', 'wing2' + s, [0.05 * k, 0.02, -0.08], 0.07], ['wings', 'wing3' + s, [0.05 * k, 0.0, -0.05], 0.07], ['wings', 'wing3' + s, [0.1 * k, 0.07, 0.08], 0.05]);
  }
  const hitboxes = HB.map(([part, bone, off, r, flag]) => ({ part, bone: B[bone], off: new THREE.Vector3(...off), flag, out: { part, sphere: new THREE.Sphere(new THREE.Vector3(), r * S) } }));

  const m = {
    kind: 'wyvern', name: 'Cindral, the Ashwing', title: 'Ashwing', object3d: obj, position: obj.position, center: new THREE.Vector3(),
    hp: 19000, maxHp: 19000, state: 'idle', enraged: false, remoteControlled: false, limping: false,
    parts: PART_DEFS.map((d) => ({ name: d.name, hp: d.hp, maxHp: d.hp, broken: false, hitzone: d.hitzone, breakable: d.breakable, _flinch: d.flinch, acc: 0 })),
    yaw: Math.atan2(-spawn.x, -spawn.z) || Math.PI, alt: HOVER, target: null, aggro: false,
    action: null, actionName: '', actionTime: 0, actionSeq: 0, cooldown: 2.5, hitDone: false, queue: [], diveIdx: 0, divesLeft: 0,
    stamina: 100, maxStamina: 100, exhausted: false, threat: new Map(), tailSevered: false,
  };
  obj.rotation.y = m.yaw;
  const fx = createWyvernFx(game, m);
  const vel = new THREE.Vector3(); let pitch = 0, roll = 0, flap = 0, flapAmp = 0.55, flapRate = 1.25, flash = 0, neckPitch = 0, neckYaw = 0, neckYawOverride = null, jaw = 0, tailPhase = 0, roarCd = 0, tAlive = 0, lastState = '';
  let R = rng(1); // per-action seeded RNG → identical rock scatter on every co-op client
  const dbgAttack = params.get('monsterAttack');

  // ---------------------------------------------------------------- helpers
  const sfx = (name, volume = 1, pos) => events.emit('sfx', { name, position: (pos || m.center).clone(), volume, source: 'monster' });
  const shake = (i, d) => events.emit('camera:shake', { intensity: i, duration: d });
  const bonePos = (name, off = [0, 0, 0]) => B[name].localToWorld(new THREE.Vector3(...off));
  const mouth = () => bonePos('head', [0, -0.03, 0.1]);
  const partByName = (n) => m.parts.find((p) => p.name === n) || m.parts[4];
  const groundAt = (x, z) => world.getHeight(x, z);
  const fwd = (yaw = m.yaw) => new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  const tpos = () => (m.target ? m.target.position.clone() : m.position.clone().add(fwd().multiplyScalar(8)).setY(groundAt(m.position.x, m.position.z)));
  function hunters() {
    const list = []; if (game.player && !game.player.dead) list.push(game.player);
    for (const r of game.remotePlayers?.values?.() || []) if (r.position) list.push(r);
    return list;
  }
  function pickTarget() {
    let best = null, bs = -1e9;
    for (const h of hunters()) { const d = h.position.distanceTo(m.position); const th = m.threat.get(String(h.id ?? 'local')) || 0; const s = -d + Math.min(22, th / 120) + (h === m.target ? 4 : 0); if (s > bs) { bs = s; best = h; } }
    m.target = best;
  }
  const toTarget = () => (m.target ? new THREE.Vector3().subVectors(m.target.position, m.position).setY(0) : fwd());
  function faceTarget(dt, rate, at) { const v = at ? new THREE.Vector3().subVectors(at, m.position).setY(0) : toTarget(); if (v.lengthSq() < 0.01) return; const want = Math.atan2(v.x, v.z); m.yaw += clamp(wrapA(want - m.yaw), -rate * dt, rate * dt); }
  const nearestRock = (to, maxD = 1e9) => { let best = null, bd = maxD; for (const r of fx.liveRocks()) if (r.set) { const d = r.mesh.position.distanceTo(to); if (d < bd) { bd = d; best = r; } } return best; };
  function stunNearby(r, stun) { const pl = game.player; if (pl?.receiveHit && pl.position.distanceTo(m.position) < r) pl.receiveHit({ damage: 0, knockback: 0, from: m.position.clone(), stun, kind: 'roar' }); }

  // ---------------------------------------------------------------- actions
  const legSpheres = () => ['fore2L', 'fore2R', 'hind2L', 'hind2R'].map((b) => new THREE.Sphere(bonePos(b, [0, -0.04, -0.02]), 0.065 * S));
  const tailSpheres = () => ['tail2', 'tail3'].map((b) => new THREE.Sphere(bonePos(b, [0, -0.02, -0.05]), 0.06 * S));
  const diveFrom = new THREE.Vector3(), diveTo = new THREE.Vector3(), jumpFrom = new THREE.Vector3(), jumpDir = new THREE.Vector3(), mark = new THREE.Vector3();

  const ACTIONS = {
    // Great roar: wide, long stun; always chains into a punishing follow-up.
    roar: {
      dur: 2.4,
      update(t) {
        jaw = t > 0.45 && t < 2.1 ? 1 : 0.2; neckPitch = t > 0.45 && t < 2.1 ? -0.4 : 0; flapAmp = 0.85;
        if (t > 0.45 && !this._r) { this._r = true; sfx('roar', 1); sfx('growl', 0.7); events.emit('monster:roar', { monster: m }); shake(0.8, 1.6); stunNearby(26, 2.6); }
      },
      reset() { this._r = false; },
    },
    // Hover rock-bombing: climb, spit 3–4 timed rock bombs around the target.
    rockBomb: {
      dur: 2.6, recover: 0.5,
      update(t, dt) {
        m.alt = lerp(m.alt, HOVER + 2.8, dt * 2.2); faceTarget(dt, 2); flapAmp = 0.8; flapRate = 1.5; pitch = lerp(pitch, -0.15, dt * 2);
        neckPitch = t < 0.7 ? -0.35 * smooth(t / 0.7) : 0.55; jaw = t > 0.75 ? 0.9 : 0.15;
        if (t > 0.15 && !this._i) { this._i = true; sfx('inhale', 0.9); }
        const n = m.enraged ? 4 : 3; const fuse = m.enraged ? 3.0 : 3.6;
        for (let k = 0; k < n; k++) {
          if (t > 0.85 + k * 0.3 && !this['_s' + k]) {
            this['_s' + k] = true; const to = tpos();
            if (k > 0) { const a = R() * Math.PI * 2, d = 3 + R() * 4.5; to.x += Math.cos(a) * d; to.z += Math.sin(a) * d; }
            to.y = groundAt(to.x, to.z); fx.spitRock(mouth(), to, fuse + k * 0.15); sfx('breath', 0.4, mouth());
          }
        }
      },
      reset() { this._i = false; for (let k = 0; k < 4; k++) this['_s' + k] = false; },
    },
    // Back-jump rock spit: from close range, leap back and drop a short-fuse rock where the hunter stands.
    backjumpRock: {
      dur: 1.6, recover: 0.35,
      update(t, dt) {
        if (t < 0.3) { m.alt = lerp(m.alt, LANDED + 0.2, dt * 8); pitch = lerp(pitch, 0.15, dt * 8); faceTarget(dt, 4); jumpFrom.copy(m.position); jumpDir.copy(fwd()).negate(); mark.copy(tpos()); flapAmp = 0.3; }
        else if (t < 1.0) {
          const k = smooth((t - 0.3) / 0.7); m.position.x = jumpFrom.x + jumpDir.x * 10 * k; m.position.z = jumpFrom.z + jumpDir.z * 10 * k;
          m.alt = lerp(LANDED + 0.2, HOVER + 0.8, Math.sin(k * Math.PI * 0.5)); flapAmp = 1.1; flapRate = 2.2; pitch = lerp(pitch, -0.35, dt * 6);
          if (!this._w) { this._w = true; fx.windBlast(jumpFrom, 7, 1.0); }
          neckPitch = 0.6; jaw = t > 0.5 && t < 0.8 ? 1 : 0.2;
          if (t > 0.55 && !this._s) { this._s = true; const to = mark.clone(); to.y = groundAt(to.x, to.z); fx.spitRock(mouth(), to, m.enraged ? 1.8 : 2.2); sfx('breath', 0.5, mouth()); }
        } else { pitch = lerp(pitch, 0, dt * 3); flapAmp = 0.7; neckPitch = lerp(neckPitch, 0, dt * 3); }
      },
      reset() { this._w = this._s = false; },
    },
    // Forced detonation by fireball: shoot a placed rock near the hunter.
    detonateShot: {
      dur: 1.8, recover: 0.4,
      update(t, dt) {
        const r = this._rock && !this._rock.dead ? this._rock : null; const aim = r ? r.mesh.position : tpos();
        faceTarget(dt, 3, aim); neckPitch = t < 0.55 ? -0.4 * smooth(t / 0.55) : lerp(0.45, 0, smooth((t - 0.7) / 0.8)); jaw = t > 0.5 && t < 0.95 ? 1 : 0.1;
        if (t > 0.1 && !this._i) { this._i = true; sfx('inhale', 0.7); }
        if (t > 0.65 && !this._f) { this._f = true; fx.spitFireball(mouth(), aim.clone().setY(groundAt(aim.x, aim.z))); sfx('breath', 0.8, mouth()); }
      },
      reset() { this._i = this._f = false; this._rock = nearestRock(tpos(), 12); },
    },
    // Forced detonation by bite: glide in beside a rock and crush it.
    detonateBite: {
      dur: 2.4, recover: 0.6,
      update(t, dt) {
        const r = this._rock && !this._rock.dead ? this._rock : null;
        if (t < 1.1) {
          if (r) { const rp = r.mesh.position; const dir = new THREE.Vector3().subVectors(m.position, rp).setY(0).normalize(); const want = rp.clone().addScaledVector(dir, 4.6); m.position.x = lerp(m.position.x, want.x, dt * 3.5); m.position.z = lerp(m.position.z, want.z, dt * 3.5); faceTarget(dt, 4, rp); }
          m.alt = lerp(m.alt, LANDED, dt * 3.5); flapAmp = 0.5; neckPitch = -0.25 * smooth(t / 1.1); jaw = smooth(t / 1.1);
          if (t > 0.9 && !this._l) { this._l = true; fx.windBlast(m.position, 8, 1.4); sfx('thud', 0.8); }
        } else if (t < 1.5) {
          neckPitch = lerp(-0.25, 0.85, smooth((t - 1.1) / 0.3)); jaw = t < 1.38 ? 1 : 0;
          if (t > 1.36 && !this._b) { this._b = true; sfx('bite', 1); if (r && r.mesh.position.distanceTo(bonePos('head', [0, -0.03, 0.08])) < 6) fx.detonate(r, 0.05); }
        } else neckPitch = lerp(0.85, 0, smooth((t - 1.5) / 0.9));
      },
      active: [{ t0: 1.25, t1: 1.45, spheres: () => [new THREE.Sphere(bonePos('head', [0, -0.03, 0.08]), 0.065 * S)], damage: 30, knockback: 8 }],
      reset() { this._l = this._b = false; this._rock = nearestRock(m.position, 18); },
    },
    // Sweeping breath: fan of flame from the ground or the air, leaving burning ground.
    sweepBreath: {
      dur: 3.3, recover: 0.6,
      update(t, dt) {
        const span = m.enraged ? 1.25 : 1.0, range = m.enraged ? 21 : 18;
        if (t < 0.9) { faceTarget(dt, 3); neckYawOverride = -span * smooth(t / 0.9); neckPitch = -0.35 * smooth(t / 0.9); jaw = 0.4; if (!this._i) { this._i = true; sfx('inhale', 1); } }
        else if (t < 2.6) {
          const k = smooth((t - 0.9) / 1.7); const ang = lerp(-span, span, k); neckYawOverride = ang; neckPitch = m.alt > LANDED + 1 ? 0.75 : 0.35; jaw = 1;
          if (!this._b) { this._b = true; sfx('breath', 1); }
          const mo = mouth(); const dir = fwd(m.yaw + ang); const gp = m.position.clone().addScaledVector(dir, 4 + range * 0.55); gp.y = groundAt(gp.x, gp.z);
          const shoot = new THREE.Vector3().subVectors(gp, mo).normalize();
          for (let i = 0; i < 9; i++) fx.emitFlame(mo, shoot.clone().multiplyScalar(26 + Math.random() * 8).add(new THREE.Vector3((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3)), 0.75 + Math.random() * 0.25);
          fx.requestLight(gp.clone().setY(gp.y + 1.5), 160);
          this._trail -= dt; if (this._trail <= 0) { this._trail = 0.14; for (const d of [0.4, 0.7, 1.0]) { const p = m.position.clone().addScaledVector(dir, 4 + range * d); fx.addPatch(p, 1.6, 6); } }
          // hunter on the flame line (ground segment from under the head out to range)
          const pl = game.player;
          if (pl && !m.hitDone) {
            const a = m.position.clone().addScaledVector(dir, 2).setY(0), b = m.position.clone().addScaledVector(dir, 4 + range).setY(0), p = pl.position.clone().setY(0);
            const ab = b.clone().sub(a); const tt = clamp(p.clone().sub(a).dot(ab) / ab.lengthSq(), 0, 1); const d = a.addScaledVector(ab, tt).distanceTo(p);
            if (d < 2.0 && fx.hurt({ damage: 42 * (m.enraged ? 1.15 : 1), knockback: 9, from: m.position.clone(), kind: 'fire' }, ['burn', 'large'])) m.hitDone = true;
          }
        } else { neckYawOverride = lerp(neckYawOverride ?? 0, 0, dt * 4); jaw = lerp(jaw, 0.1, dt * 4); neckPitch = lerp(neckPitch, 0, dt * 3); }
      },
      reset() { this._i = this._b = false; this._trail = 0; },
    },
    // Talon dive, chainable 2–3×; the kick inflicts deadly poison.
    talonDive: {
      dur: 3.4,
      update(t, dt) {
        const c = this._climb, last = m.divesLeft <= 0;
        if (t < c) { // climb + aim
          m.alt = lerp(m.alt, this._top, dt * (c < 1 ? 4 : 2.2)); flapAmp = 0.9; flapRate = 1.8; pitch = lerp(pitch, -0.25, dt * 3); faceTarget(dt, c < 1 ? 5 : 3);
          diveTo.copy(tpos()); diveFrom.copy(m.position); if (t > c * 0.3 && !this._g) { this._g = true; sfx('growlRise', 0.9); }
        } else if (t < c + 0.8) { // dive along a line through the target
          const k = smooth((t - c) / 0.8); const dir = new THREE.Vector3().subVectors(diveTo, diveFrom).setY(0); const len = dir.length(); dir.normalize();
          m.position.x = diveFrom.x + dir.x * (len + 6) * k; m.position.z = diveFrom.z + dir.z * (len + 6) * k;
          m.alt = lerp(this._top, LANDED + 0.3, Math.sin(k * Math.PI * 0.5)); flapAmp = 0.15; pitch = 0.45 * (1 - k); flap = 1.2;
          if (!this._s) { this._s = true; sfx('swingHeavy', 1); sfx('roar', 0.45); }
        } else if (!last) { // pull up for the next kick
          m.alt = lerp(m.alt, HOVER + 2, dt * 4); flapAmp = 1.0; flapRate = 2.2; pitch = lerp(pitch, -0.3, dt * 5);
        } else { // skid + land, with dragon wind pressure
          m.alt = lerp(m.alt, LANDED, dt * 6); pitch = lerp(pitch, 0, dt * 4); flapAmp = 0.35;
          if (!this._l) { this._l = true; shake(0.6, 0.5); fx.windBlast(m.position, 10, 2.2); sfx('thud', 1); }
        }
      },
      active: [{ t0: 0, t1: 0, spheres: legSpheres, damage: 38, knockback: 12, status: ['poison', 'deadly'] }],
      reset() {
        this._g = this._s = this._l = false; const first = m.diveIdx === 0;
        this._climb = first ? 1.2 : 0.55; this._top = first ? HIGH : 10;
        this.dur = this._climb + 0.8 + (m.divesLeft > 0 ? 0.35 : 1.4);
        this.active[0].t0 = this._climb + 0.15; this.active[0].t1 = this._climb + 0.85;
      },
    },
    fireball: {
      dur: 2.2, recover: 0.4,
      update(t, dt) {
        faceTarget(dt, 2.5); neckPitch = t < 0.8 ? -0.45 * smooth(t / 0.8) : lerp(0.35, 0, clamp((t - 0.9) / 0.8, 0, 1)); jaw = t > 0.6 && t < 1.2 ? 1 : 0.1;
        if (t > 0.1 && !this._i) { this._i = true; sfx('inhale', 0.9); }
        const shots = m.enraged ? [0.85, 1.35] : [0.85];
        shots.forEach((st, i) => { if (t > st && !this['_f' + i]) { this['_f' + i] = true; const to = tpos(); if (i) { to.x += (R() - 0.5) * 6; to.z += (R() - 0.5) * 6; } to.y = groundAt(to.x, to.z); fx.spitFireball(mouth(), to); sfx('breath', 0.7, mouth()); } });
      },
      reset() { this._i = this._f0 = this._f1 = false; },
    },
    // Wing gust: dragon wind pressure in front — long stun, then it presses the advantage.
    wingGust: {
      dur: 2.4, recover: 0.3,
      update(t, dt) {
        faceTarget(dt, 2); m.alt = lerp(m.alt, HOVER + 1.5, dt * 2); flapRate = t < 1.0 ? 0.8 : 2.2; flapAmp = t < 1.0 ? 1.0 : 1.15; pitch = lerp(pitch, -0.3, dt * 3);
        if (t > 1.0 && !this._g) {
          this._g = true; shake(0.5, 0.6); sfx('roar', 0.3);
          const c = m.position.clone().addScaledVector(fwd(), 6); fx.windBlast(c, 11, 2.4);
        }
      },
      reset() { this._g = false; },
    },
    tailSpin: {
      dur: 2.0, recover: 0.5,
      update(t, dt) {
        m.alt = lerp(m.alt, HOVER - 0.8, dt * 3);
        if (t < 0.7) { m.yaw -= dt * 0.9; if (!this._g) { this._g = true; sfx('growl', 0.8); } }
        else if (t < 1.5) { m.yaw += dt * (Math.PI * 2 / 0.8); if (!this._w) { this._w = true; sfx('tail', 1); } }
      },
      active: [{ t0: 0.75, t1: 1.5, spheres: tailSpheres, damage: 36, knockback: 12 }],
      reset() { this._g = this._w = false; },
    },
    bite: {
      dur: 1.6, recover: 0.2,
      update(t, dt) {
        faceTarget(dt, 3); m.alt = lerp(m.alt, LANDED, dt * 5);
        if (t < 0.5) { neckPitch = -0.3 * smooth(t / 0.5); jaw = smooth(t / 0.5); } else if (t < 0.85) { neckPitch = lerp(-0.3, 0.75, smooth((t - 0.5) / 0.35)); jaw = t < 0.75 ? 1 : 0; if (!this._b) { this._b = true; sfx('bite', 1); } } else neckPitch = lerp(0.75, 0, smooth((t - 0.85) / 0.75));
      },
      active: [{ t0: 0.6, t1: 0.85, spheres: () => [new THREE.Sphere(bonePos('head', [0, -0.03, 0.08]), 0.06 * S)], damage: 30, knockback: 8 }],
      reset() { this._b = false; },
    },
    recover: { dur: 1.2, update(t, dt) { neckPitch = lerp(neckPitch, 0.35, dt * 3); jaw = 0.3; flapAmp = m.alt < LANDED + 0.6 ? 0.08 : 0.4; } },
    flinch: { dur: 1.0, update(t) { roll = Math.sin(t * 14) * 0.25 * (1 - t); neckPitch = -0.4 * Math.sin(t * Math.PI); jaw = 0.6; } },
    takeoff: {
      dur: 1.4, update(t, dt) { m.alt = lerp(m.alt, HOVER, dt * 2.5); flapAmp = 1.0; flapRate = 2.0; neckPitch = lerp(neckPitch, 0, dt * 3); if (!this._s) { this._s = true; fx.windBlast(m.position, 9, 1.8); } },
      reset() { this._s = false; },
    },
    topple: { // crash out of the air: big opening
      dur: 6.0, update(t, dt) {
        if (t < 0.8) { m.alt = lerp(m.alt, LANDED - 1.2, dt * 6); roll = lerp(roll, 1.15, dt * 5); flapAmp = 0.05; } else if (!this._c) { this._c = true; shake(0.8, 0.6); world.spawnDust?.(m.position.clone().setY(groundAt(m.position.x, m.position.z)), 2.4); sfx('thud', 1); sfx('monsterHurt', 0.9); }
        if (t > 0.8 && t < 5.2) { roll = 1.15 + Math.sin(t * 3) * 0.05; neckPitch = 0.5 + Math.sin(t * 2) * 0.15; jaw = 0.6; flap = Math.sin(t * 9) * 0.3; }
        if (t > 5.2) { roll = lerp(roll, 0, dt * 4); m.alt = lerp(m.alt, LANDED, dt * 3); }
      }, reset() { this._c = false; },
    },
    exhausted: { dur: 9, update(t, dt) { m.alt = lerp(m.alt, LANDED, dt * 3); flapAmp = 0.05; neckPitch = 0.55 + Math.sin(t * 2.4) * 0.08; jaw = 0.45 + Math.sin(t * 4.8) * 0.15; if (Math.random() < dt * 4) fx.burst(mouth(), 4, 2, 0.6); } },
    death: {
      dur: 99, update(t, dt) { if (t < 1.2) { m.alt = lerp(m.alt, LANDED - 1.3, dt * 4); roll = lerp(roll, 1.3, dt * 3); } else if (!this._d) { this._d = true; shake(0.9, 0.8); sfx('thud', 1); world.spawnDust?.(m.position.clone().setY(groundAt(m.position.x, m.position.z)), 2.6); } neckPitch = lerp(neckPitch, 0.8, dt * 2); jaw = lerp(jaw, 0.5, dt); flapAmp = 0; flap = lerp(flap, -0.4, dt); },
      reset() { this._d = false; },
    },
  };
  const REACT = { flinch: 'flinch', topple: 'topple', death: 'dead', recover: 'recover', exhausted: 'exhausted', takeoff: 'chase' };
  function startAction(name, t = 0) {
    const a = ACTIONS[name]; if (!a) return;
    m.actionSeq++; R = rng(m.actionSeq * 7919 + 13);
    neckYawOverride = null; a.reset?.();
    m.action = a; m.actionName = name; m.actionTime = t; m.hitDone = false;
    m.state = REACT[name] || 'attack';
    if (name === 'exhausted') m.exhausted = true;
  }
  function endAction() {
    const a = m.action, name = m.actionName; m.action = null; m.actionName = ''; neckYawOverride = null;
    if (name === 'talonDive' && m.divesLeft > 0) { m.divesLeft--; m.diveIdx++; startAction('talonDive'); return; }
    if (name === 'talonDive') m.diveIdx = 0;
    if (m.queue.length && !['topple', 'flinch', 'exhausted'].includes(name)) { startAction(m.queue.shift()); return; }
    if (name === 'exhausted') { m.exhausted = false; m.stamina = m.maxStamina; startAction('takeoff'); return; }
    if (name === 'topple') { startAction('takeoff'); return; }
    if (a?.recover) { startAction('recover'); ACTIONS.recover.dur = a.recover; return; }
    if (name === 'recover' && m.alt < LANDED + 0.8 && Math.random() < 0.55) { startAction(nearDist() < 7 && Math.random() < 0.5 ? 'backjumpRock' : 'bite'); return; }
    if (name === 'recover' && m.alt < HOVER - 1) { startAction('takeoff'); return; }
    m.state = 'chase'; m.cooldown = m.enraged ? 0.5 : 1.0;
  }
  const nearDist = () => toTarget().length();
  function beginDive() { m.diveIdx = 0; m.divesLeft = m.enraged ? 2 : Math.random() < 0.55 ? 1 : 0; startAction('talonDive'); }
  function chooseAttack() {
    const d = nearDist(); const W = []; const rocks = fx.liveRocks().filter((r) => r.set);
    const rockNearTarget = rocks.some((r) => r.mesh.position.distanceTo(tpos()) < 12);
    if (roarCd <= 0 && d < 24) W.push(['roar', 0.45]);
    if (fx.liveRocks().length < 5) W.push(['rockBomb', 1.0]);
    if (d < 7) W.push(['backjumpRock', 1.5]);
    if (rockNearTarget) W.push(['detonateShot', 1.3]);
    if (rocks.some((r) => r.mesh.position.distanceTo(m.position) < 18)) W.push(['detonateBite', 0.8]);
    W.push(['sweepBreath', d > 4 && d < 19 ? 1.1 : 0.3], ['talonDive', d > 6 ? 1.0 : 0.4], ['fireball', 0.5], ['wingGust', d < 12 ? 0.6 : 0.15], ['tailSpin', d < 8 ? 0.8 : 0.05]);
    if (m.alt < LANDED + 1 && d < 7) W.push(['bite', 1.2]);
    const sum = W.reduce((s, w) => s + w[1], 0); let r = Math.random() * sum; for (const [n, w] of W) { if ((r -= w) <= 0) return n; } return W[0][0];
  }
  function launch(name) {
    if (name === 'talonDive') return beginDive();
    if (name === 'roar') { roarCd = m.enraged ? 40 : 60; m.queue = [Math.random() < 0.5 ? 'backjumpRock' : 'talonDive']; }
    startAction(name);
  }

  // ---------------------------------------------------------------- damage
  m.receiveHit = ({ damage = 0, part, point, attackerId } = {}) => {
    if (m.state === 'dead') return null;
    const p = partByName(part); const dmg = Math.max(1, Math.round(damage * p.hitzone)); flash = 1;
    if (point) fx.burst(point, 8, 6, 0.4);
    if (m.remoteControlled) return { damage: dmg, part: p.name, hitzone: p.hitzone, weak: p.hitzone >= 1.2 };
    m.hp = Math.max(0, m.hp - dmg); p.hp = Math.max(0, p.hp - dmg); p.acc += dmg;
    const aid = String(attackerId ?? game.player?.id ?? 'local'); m.threat.set(aid, (m.threat.get(aid) || 0) + dmg);
    if (!m.aggro) { m.aggro = true; pickTarget(); }
    let broke = false; if (p.breakable && !p.broken && p.hp <= 0) { applyBreak(p.name, true); broke = true; }
    if (m.hp <= 0) { die(); return { damage: dmg, part: p.name, hitzone: p.hitzone, killed: true }; }
    if (!m.enraged && m.hp < m.maxHp * 0.5) { m.enraged = true; if (!['topple', 'death'].includes(m.actionName)) { m.queue = []; launch('roar'); } }
    m.limping = m.hp < m.maxHp * 0.2;
    if (broke || p.acc >= p._flinch) {
      p.acc = 0;
      if (!['topple', 'death'].includes(m.actionName)) { m.queue = []; m.divesLeft = 0; m.diveIdx = 0; startAction(broke && p.name !== 'head' ? 'topple' : (p.name === 'wings' && m.alt > LANDED + 1) || (m.exhausted && p.name === 'head') ? 'topple' : 'flinch'); }
    }
    return { damage: dmg, part: p.name, hitzone: p.hitzone, weak: p.hitzone >= 1.2, broken: broke };
  };
  function applyBreak(name, emit) {
    const p = partByName(name); p.broken = true; p.hp = 0;
    if (name === 'tail') m.tailSevered = true;
    if (emit) { events.emit('monster:partBreak', { monster: m, part: name }); sfx('break', 1); shake(0.5, 0.4); fx.burst(m.center.clone(), 40, 10, 1); }
  }
  function die() { m.hp = 0; m.queue = []; m.divesLeft = 0; startAction('death'); m.state = 'dead'; events.emit('monster:died', { monster: m }); sfx('roar', 0.7); }

  // ---------------------------------------------------------------- attack collision vs local player
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
  function activeWindows() { const a = m.action; if (!a?.active) return []; return a.active.filter((w) => m.actionTime >= w.t0 && m.actionTime <= w.t1); }
  m.getAttackHitboxes = () => activeWindows().flatMap((w) => w.spheres().map((sphere) => ({ sphere, damage: w.damage, knockback: w.knockback, kind: w.kind || 'physical' })));
  function checkPlayerHits() {
    const pl = game.player; if (!pl?.receiveHit || m.hitDone) return;
    const gy = groundAt(pl.position.x, pl.position.z); const base = Math.abs(pl.position.y - gy) < 1.2 ? gy : pl.position.y;
    _a.set(pl.position.x, base + 0.5, pl.position.z); _b.set(pl.position.x, base + 1.3, pl.position.z);
    for (const w of activeWindows()) for (const s of w.spheres()) {
      const tt = clamp((s.center.y - _a.y) / (_b.y - _a.y), 0, 1); _c.lerpVectors(_a, _b, tt);
      if (_c.distanceTo(s.center) < s.radius + 0.5) { if (fx.hurt({ damage: w.damage * (m.enraged ? 1.15 : 1), knockback: w.knockback, from: m.position.clone(), kind: w.kind || 'physical' }, w.status)) m.hitDone = true; return; }
    }
  }
  m.getHitboxes = () => hitboxes.filter((h) => !(h.flag === 'tip' && m.tailSevered)).map((h) => h.out);

  // ---------------------------------------------------------------- pose
  function pose(dt, rawDt) {
    flap += dt * flapRate * Math.PI * 2; tailPhase += dt * 1.3;
    const fl = Math.sin(flap) * flapAmp, fold = m.alt < LANDED + 0.8 ? -0.35 : 0;
    const wingBroken = partByName('wings').broken ? 0.75 : 1;
    for (const [s, k] of [['L', 1], ['R', -1]]) {
      B['wing1' + s].rotation.z = k * (fl + fold) * wingBroken; B['wing2' + s].rotation.z = k * (Math.sin(flap - 0.5) * flapAmp * 0.6 + fold * 0.8);
      B['wing3' + s].rotation.z = k * Math.sin(flap - 1.0) * flapAmp * 0.45; B['wing2' + s].rotation.x = -Math.sin(flap - 0.4) * flapAmp * 0.12;
      const legSwing = m.alt < LANDED + 0.8 ? 0.35 : Math.sin(flap * 0.5 + (k > 0 ? 0 : 1)) * 0.08;
      const kick = m.actionName === 'talonDive' && m.actionTime > (ACTIONS.talonDive._climb || 1) ? 0.6 : 0; // talons forward for the kick
      B['fore1' + s].rotation.x = -legSwing; B['hind1' + s].rotation.x = legSwing * 0.6 - (m.alt < LANDED + 0.8 ? 0.5 : 0) - kick;
    }
    let wantYaw = 0, wantPitch = 0;
    if (m.target && m.state !== 'dead') {
      const v = toTarget(); wantYaw = clamp(wrapA(Math.atan2(v.x, v.z) - m.yaw), -0.9, 0.9);
      const dy = m.target.position.y + 1 - B.head.getWorldPosition(_a).y; wantPitch = clamp(-Math.atan2(dy, Math.max(2, v.length())), -0.4, 0.7);
    }
    neckYaw = neckYawOverride != null ? neckYawOverride : lerp(neckYaw, wantYaw, Math.min(1, dt * 3));
    const np = neckPitch + wantPitch * 0.5;
    B.neck1.rotation.set(np * 0.45, neckYaw * 0.4, 0); B.neck2.rotation.set(np * 0.35, neckYaw * 0.35, 0); B.head.rotation.set(np * 0.2 - jaw * 0.1, neckYaw * 0.25, 0);
    B.jaw.rotation.x = jaw * 0.55;
    const tw = Math.sin(tailPhase) * 0.18 - (m.actionName === 'tailSpin' ? 0.5 : 0);
    B.tail1.rotation.set(Math.sin(tailPhase * 0.7) * 0.06, tw * 0.5, 0); B.tail2.rotation.set(0.04, tw * 0.7, 0); B.tail3.rotation.set(0.05, tw, 0);
    B.tail3.scale.setScalar(m.tailSevered ? 0.05 : 1);
    B.chest.rotation.x = -Math.sin(flap) * flapAmp * 0.05;
    obj.rotation.y = m.yaw; obj.rotation.x = pitch; obj.rotation.z = roll;
    const gy = groundAt(m.position.x, m.position.z); const bob = m.alt > LANDED + 0.5 ? Math.sin(flap + 1.2) * 0.35 * flapAmp : 0;
    m.position.y = gy + m.alt + bob;
    const ph = flap % (Math.PI * 2); if (ph < m._lastPh && flapAmp > 0.3) sfx('swoosh', 0.35 * flapAmp); m._lastPh = ph;
    flash = Math.max(0, flash - rawDt * 6);
    if (skinned) skinned.material.emissiveIntensity = (m.state === 'dead' ? 0.05 : m.enraged ? 0.75 + 0.25 * Math.sin(tAlive * 4) : 0.18) + flash * 0.6;
    // smouldering mouth while a breath/bomb is being prepared
    if (jaw > 0.5 && m.state === 'attack' && Math.random() < dt * 10) fx.emitFlame(mouth(), new THREE.Vector3(0, 1.5, 0), 0.35);
  }

  // ---------------------------------------------------------------- update
  m.update = (dt, rawDt = dt) => {
    dt = Math.max(0, dt); rawDt = Math.max(0, rawDt); tAlive += dt; roarCd -= dt;
    if (m.remoteControlled) remoteUpdate(dt);
    else if (m.state !== 'dead' || m.action) {
      if (!m.aggro) {
        const near = hunters().some((h) => h.position.distanceTo(m.position) < 38);
        if (near || dbgAttack) { m.aggro = true; pickTarget(); launch('roar'); }
        m.yaw += dt * 0.15;
      }
      if (m.action) {
        m.actionTime += dt; m.action.update(m.actionTime, dt);
        if (m.actionTime >= m.action.dur && m.actionName !== 'death') endAction();
      } else if (m.aggro) {
        if (Math.random() < dt * 0.3) pickTarget();
        const v = toTarget(); const d = v.length(); faceTarget(dt, 1.6);
        const want = d > 13 ? 1 : d < 8 ? -1 : 0; const side = new THREE.Vector3(Math.cos(m.yaw), 0, -Math.sin(m.yaw));
        const sp = m.enraged ? 7 : 5.2; const desired = v.normalize().multiplyScalar(want * sp).addScaledVector(side, Math.sin(tAlive * 0.4) * 2.5);
        vel.lerp(desired, Math.min(1, dt * 1.5)); m.position.addScaledVector(vel, dt);
        m.alt = lerp(m.alt, HOVER, dt * 1.2); flapAmp = lerp(flapAmp, 0.55, dt * 2); flapRate = lerp(flapRate, 1.25, dt * 2);
        pitch = lerp(pitch, clamp(vel.length() * 0.03, -0.2, 0.25), dt * 2); roll = lerp(roll, clamp(-vel.dot(side) * 0.05, -0.35, 0.35), dt * 2);
        neckPitch = lerp(neckPitch, 0, dt * 2); jaw = lerp(jaw, 0.1, dt * 3); m.state = 'chase';
        m.stamina = Math.max(0, m.stamina - dt * 0.12); m.cooldown -= dt;
        if (m.stamina <= 0 && !m.exhausted) startAction('exhausted');
        else if (m.cooldown <= 0) { m.stamina = Math.max(0, m.stamina - 3); launch(dbgAttack && ACTIONS[dbgAttack] ? dbgAttack : chooseAttack()); }
      }
      const r = Math.hypot(m.position.x, m.position.z), Rb = (world.bounds?.radius || 120) - 12; if (r > Rb) { m.position.x *= Rb / r; m.position.z *= Rb / r; }
      if (dt > 0) checkPlayerHits();
    }
    pose(dt, rawDt);
    m.center.copy(bonePos('chest'));
    for (const h of hitboxes) h.out.sphere.center.copy(h.bone.localToWorld(_a.copy(h.off)));
    fx.update(dt);
    if (m.state !== lastState) { lastState = m.state; events.emit('monster:state', { monster: m, state: m.state, action: m.actionName, exhausted: m.exhausted }); }
  };

  // ---------------------------------------------------------------- net sync
  const net = { pos: new THREE.Vector3(), yaw: 0, alt: HOVER, has: false };
  function remoteUpdate(dt) {
    if (net.has) { m.position.x = lerp(m.position.x, net.pos.x, Math.min(1, dt * 8)); m.position.z = lerp(m.position.z, net.pos.z, Math.min(1, dt * 8)); m.yaw += wrapA(net.yaw - m.yaw) * Math.min(1, dt * 8); if (!m.action) m.alt = lerp(m.alt, net.alt, Math.min(1, dt * 6)); }
    if (m.action) { m.actionTime += dt; m.action.update(m.actionTime, dt); if (m.actionTime >= m.action.dur && m.actionName !== 'death') { m.action = null; m.actionName = ''; neckYawOverride = null; } }
    if (dt > 0) checkPlayerHits();
  }
  m.serialize = () => ({
    k: 'wyvern', x: +m.position.x.toFixed(2), z: +m.position.z.toFixed(2), r: +wrapA(m.yaw).toFixed(3), al: +m.alt.toFixed(2), s: STATE_CODES.indexOf(m.state), a: m.actionName,
    t: +m.actionTime.toFixed(3), q: m.actionSeq, h: Math.round(m.hp), b: m.parts.reduce((acc, p, i) => acc | (p.broken ? 1 << i : 0), 0), e: m.enraged ? 1 : 0, ex: m.exhausted ? 1 : 0,
    dv: m.diveIdx, dl: m.divesLeft,
    tx: m.target ? +m.target.position.x.toFixed(1) : 0, tz: m.target ? +m.target.position.z.toFixed(1) : 0, tg: m.target ? String(m.target.id ?? 'local') : '',
  });
  let remoteSeq = -1; const remoteLook = { id: 'remoteTarget', position: new THREE.Vector3() };
  m.applyRemote = (st) => {
    if (!st || (st.k && st.k !== 'wyvern')) return;
    net.has = true; net.pos.set(st.x ?? m.position.x, 0, st.z ?? m.position.z); net.yaw = st.r ?? m.yaw; net.alt = st.al ?? net.alt;
    if (st.h != null) m.hp = st.h; if (st.e != null) m.enraged = !!st.e; if (st.ex != null) m.exhausted = !!st.ex; m.limping = m.hp < m.maxHp * 0.2; m.aggro = true;
    if (st.b != null) m.parts.forEach((p, i) => { if (st.b & (1 << i) && !p.broken) applyBreak(p.name, false); });
    if (st.tg) { const local = game.player && String(game.player.id ?? 'local') === st.tg; remoteLook.position.set(st.tx, groundAt(st.tx, st.tz), st.tz); m.target = local ? game.player : remoteLook; }
    if (st.q != null && st.q !== remoteSeq) {
      remoteSeq = st.q;
      if (st.a && ACTIONS[st.a]) { m.diveIdx = st.dv ?? 0; m.divesLeft = st.dl ?? 0; m.actionSeq = st.q - 1; startAction(st.a, st.t || 0); }
    }
    const s = STATE_CODES[st.s]; if (s === 'dead' && m.actionName !== 'death') startAction('death'); if (s && !m.action) m.state = s;
    m.actionSeq = st.q ?? m.actionSeq;
  };

  m.dispose = () => fx.dispose();
  m.debug = {
    play: (name, t = 0) => (name === 'talonDive' ? beginDive() : launch(name)), setHp: (f) => { m.hp = m.maxHp * f; if (f < 0.5) m.enraged = true; },
    breakPart: (n) => applyBreak(n, true), kill: () => die(), exhaust: () => startAction('exhausted'), fx,
  };
  window.__monster = m;
  pose(0, 0); m.center.copy(bonePos('chest'));
  return m;
}
