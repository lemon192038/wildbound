// Gorvath, the Cinderfist — colossal knuckle-walking brute (original design, procedural model in bruteModel.js).
// Signature mechanics:
//  • Per-part criticality: cinder growths on head / fistL / fistR / tail heat up over time and when struck
//    (dull red → orange → white-hot "critical", sparks and heat light).
//  • Detach blast: striking a hot growth hard enough tears it off; the molten lump drops at the part and
//    explodes ~1–1.3 s later (blastblight). The growth regrows over ~25 s.
//  • Final phase (HP < 35%): it leaps to the arena centre, roars and slams both fists — a ring of magma
//    pillars seals the arena (no escape). Spattered cinder no longer bursts: it pools as a "cinder sea"
//    (slip damage + blastblight). Ultimate: rears up, roars, and detonates every pool and lump in a
//    chained cataclysm (interruptible by heavy damage during the wind-up). Its own blasts and the
//    heat burn it — it can die by its own fire.
// Contract: same as createMonster (CONTRACTS.md).
import * as THREE from 'three';
import { t } from '../shared/i18n.js';
import { buildBrute, growthTexture } from './bruteModel.js';
import { createWyvernFx } from './wyvernFx.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const rng = (seed) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

const GROWTH_PARTS = ['head', 'fistL', 'fistR', 'tail'];
const PART_DEFS = [
  { name: 'head', hp: 3000, hitzone: 1.35, breakable: true, flinch: 900 },
  { name: 'fistL', hp: 2600, hitzone: 1.2, breakable: true, flinch: 1000 },
  { name: 'fistR', hp: 2600, hitzone: 1.2, breakable: true, flinch: 1000 },
  { name: 'tail', hp: 2800, hitzone: 1.1, breakable: true, flinch: 1000 },
  { name: 'legs', hp: 99999, hitzone: 0.9, breakable: false, flinch: 1300 },
  { name: 'body', hp: 99999, hitzone: 0.75, breakable: false, flinch: 1500 },
];
const STATE_CODES = ['idle', 'roam', 'chase', 'attack', 'flinch', 'topple', 'dead', 'exhausted', 'recover'];
const RING = 30, FINAL_AT = 0.35;
const BLAST = { radius: 6, damage: 44, knockback: 13, status: ['blast', 'normal'] };
const SEA = { status: ['blast', 'normal'], drain: 3, tint: 0xffd090, kind: 'slime', max: 80 };

export async function createBrute(game) {
  const { scene, events, world } = game;
  const params = game.params || new URLSearchParams();
  const model = buildBrute(); const B = model.B;
  const obj = new THREE.Group(); obj.name = 'Gorvath'; obj.add(model.root); scene.add(obj);
  const spawn = world.spawn?.monster || new THREE.Vector3(0, 0, -20);
  obj.position.set(spawn.x, world.getHeight(spawn.x, spawn.z), spawn.z);
  const groundAt = (x, z) => world.getHeight(x, z);

  // hitboxes [part, bone, offset, radius]
  const HB = [
    ['head', 'head', [0, 0.25, 0.8], 1.45], ['head', 'head', [0, 0.6, 0.3], 1.1],
    ['body', 'neck', [0, 0, 0.5], 1.35], ['body', 'chest', [0, 0, 0.2], 2.6], ['body', 'root', [0, 0.6, 1.0], 2.5], ['body', 'root', [0, 0.4, -0.9], 2.1],
    ['tail', 'tail1', [0, -0.1, -0.9], 1.35], ['tail', 'tail2', [0, -0.2, -0.95], 1.1], ['tail', 'tail3', [0, -0.2, -0.9], 0.9], ['tail', 'tail4', [0, -0.05, -0.75], 1.4],
  ];
  for (const s of ['L', 'R']) {
    HB.push(['fist' + s, 'fist' + s, [0, 0.1, 0.15], 1.55], ['body', 'shoulder' + s, [0, -0.6, 0.2], 1.3], ['body', 'elbow' + s, [0, -1.1, 0.2], 1.35]);
    HB.push(['legs', 'hip' + s, [0, -0.9, 0.35], 1.45], ['legs', 'knee' + s, [0, -0.85, -0.3], 0.9]);
  }
  const hitboxes = HB.map(([part, bone, off, r]) => ({ part, bone: B[bone], off: new THREE.Vector3(...off), out: { part, sphere: new THREE.Sphere(new THREE.Vector3(), r) } }));

  const m = {
    kind: 'brute', name: 'Gorvath, the Cinderfist', title: 'Cinderfist', object3d: obj, position: obj.position, center: new THREE.Vector3(),
    hp: 26000, maxHp: 26000, state: 'idle', enraged: false, remoteControlled: false, limping: false,
    parts: PART_DEFS.map((d) => ({ name: d.name, hp: d.hp, maxHp: d.hp, broken: false, hitzone: d.hitzone, breakable: d.breakable, _flinch: d.flinch, acc: 0 })),
    yaw: Math.atan2(-spawn.x, -spawn.z) || Math.PI, target: null, aggro: false, queue: [],
    action: null, actionName: '', actionTime: 0, actionSeq: 0, cooldown: 2.5, hitDone: false,
    stamina: 100, maxStamina: 100, exhausted: false, threat: new Map(),
    // criticality per growth part: heat 0..1, size 0..1 (regrows after detaching), detach damage meter
    heat: Object.fromEntries(GROWTH_PARTS.map((p) => [p, 0.15])), size: Object.fromEntries(GROWTH_PARTS.map((p) => [p, 1])),
    detachAcc: Object.fromEntries(GROWTH_PARTS.map((p) => [p, 0])), detachCount: Object.fromEntries(GROWTH_PARTS.map((p) => [p, 0])),
    final: false, ringCenter: new THREE.Vector3(), critical: false,
  };
  obj.rotation.y = m.yaw;
  const fx = createWyvernFx(game, m);
  let R = rng(1), tAlive = 0, lastState = '', roarCd = 0, gait = 0, speed = 0, bodyY = 0, rearUp = 0, flash = 0, windupDmg = 0, criticalToast = {};
  const P = { arm: { L: { sh: 0, el: 0, side: 0 }, R: { sh: 0, el: 0, side: 0 } }, neck: 0, head: 0, jaw: 0, tailYaw: 0, spin: 0, crouch: 0 };
  const dbgAttack = params.get('monsterAttack');

  // ---------------------------------------------------------------- helpers
  const sfx = (name, volume = 1, pos) => events.emit('sfx', { name, position: (pos || m.center).clone(), volume, source: 'monster' });
  const shake = (i, d) => events.emit('camera:shake', { intensity: i, duration: d });
  const toast = (t) => { try { game.ui?.toast?.(t); } catch { /* */ } };
  const bonePos = (name, off = [0, 0, 0]) => B[name].localToWorld(new THREE.Vector3(...off));
  const fistGround = (s) => { const p = bonePos('fist' + s, [0, -0.6, 0.6]); p.y = groundAt(p.x, p.z); return p; };
  const fwd = (yaw = m.yaw) => new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  const partByName = (n) => m.parts.find((p) => p.name === n) || m.parts[5];
  const tpos = () => (m.target ? m.target.position.clone() : m.position.clone().add(fwd().multiplyScalar(8)));
  function hunters() { const l = []; if (game.player && !game.player.dead) l.push(game.player); for (const r of game.remotePlayers?.values?.() || []) if (r.position) l.push(r); return l; }
  function pickTarget() { let best = null, bs = -1e9; for (const h of hunters()) { const s = -h.position.distanceTo(m.position) + Math.min(22, (m.threat.get(String(h.id ?? 'local')) || 0) / 120) + (h === m.target ? 4 : 0); if (s > bs) { bs = s; best = h; } } m.target = best; }
  const toTarget = () => (m.target ? new THREE.Vector3().subVectors(m.target.position, m.position).setY(0) : fwd());
  function faceTarget(dt, rate, at) { const v = at ? new THREE.Vector3().subVectors(at, m.position).setY(0) : toTarget(); if (v.lengthSq() < 0.01) return; m.yaw += clamp(wrapA(Math.atan2(v.x, v.z) - m.yaw), -rate * dt, rate * dt); }

  // Cinder spatter at an impact: bursting lumps normally, lingering cinder pools in the final phase.
  function spatter(at, part, n) {
    const hot = m.heat[part] ?? 0.5; if (m.size[part] !== undefined && m.size[part] < 0.4) return;
    for (let i = 0; i < n; i++) {
      const a = R() * Math.PI * 2, d = 1.5 + R() * 4; const p = at.clone(); p.x += Math.cos(a) * d; p.z += Math.sin(a) * d; p.y = groundAt(p.x, p.z);
      if (m.final) fx.addPatch(p, 1.8 + R() * 1.2, 45, SEA);
      else if (hot > 0.35) fx.spitRock(at.clone().setY(at.y + 1.2), p, 1.4 + R() * 0.4, { size: 0.65, color: 0x3a0e04, emissive: new THREE.Color(1, 0.35, 0.05), blast: { ...BLAST, radius: 4.2, damage: 30, big: false, patchOpts: { r: 1.6, life: 3, status: ['burn', 'small'] } }, max: 12 });
    }
  }
  // Detach a growth: the molten mass drops and blows almost immediately.
  function detach(part, emit = true) {
    const g = model.growths[part]; if (!g) return;
    const p = g.group.getWorldPosition(new THREE.Vector3()); const to = p.clone(); to.y = groundAt(p.x, p.z);
    const hot = m.heat[part] >= 0.75;
    fx.spitRock(p, to, hot ? 1.0 : 1.3, { size: 1.35, color: 0x4a1406, emissive: new THREE.Color(1, 0.55, 0.15), blast: m.final ? { ...BLAST, radius: 7, patchOpts: { ...SEA, r: 3.2, life: 45 } } : { ...BLAST, radius: 7 }, max: 14 });
    m.size[part] = 0; m.heat[part] = 0; m.detachAcc[part] = 0; m.detachCount[part]++;
    sfx('break', 0.8, p); fx.burst(p, 30, 8, 0.8);
    if (emit) toast(t('brute.shed', { p: t(part.startsWith('fist') ? 'brute.fist' : part === 'head' ? 'brute.brow' : 'brute.tail') }));
  }

  // ---------------------------------------------------------------- final phase ring
  const ringGroup = new THREE.Group(); scene.add(ringGroup);
  const pTex = growthTexture(); pTex.repeat.set(2, 3);
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x1a1412, roughness: 0.85, metalness: 0.1, emissive: new THREE.Color(1, 0.32, 0.06), emissiveMap: pTex, emissiveIntensity: 0.9, bumpMap: pTex, bumpScale: 3 });
  // jagged basalt spire with molten seams
  const spire = (r, h, seed) => { const g = new THREE.ConeGeometry(r, h, 7, 6); g.translate(0, h / 2, 0); const a = g.attributes.position;
    for (let i = 0; i < a.count; i++) { const y = a.getY(i), k = 1 - y / h; const j = Math.sin(i * 12.9898 + seed) * 43758.5453; const n = (j - Math.floor(j)) - 0.5; a.setXYZ(i, a.getX(i) * (1 + n * 0.45 * k), y + n * 0.4, a.getZ(i) * (1 + n * 0.45 * k)); }
    g.computeVertexNormals(); return g; };
  const pillars = [];
  function enterFinal(center) {
    if (m.final) return; m.final = true; m.ringCenter.copy(center); m.ringCenter.y = groundAt(center.x, center.z);
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2; const h = 7 + ((i * 7919) % 5);
      const geo = spire(2.2 + (i % 3) * 0.5, h, i);
      const mesh = new THREE.Mesh(geo, pillarMat); const x = center.x + Math.cos(a) * (RING + 1.5), z = center.z + Math.sin(a) * (RING + 1.5);
      mesh.position.set(x, groundAt(x, z) - h, z); mesh.rotation.set((Math.random() - 0.5) * 0.25, Math.random() * 3, (Math.random() - 0.5) * 0.25); mesh.castShadow = true; ringGroup.add(mesh);
      pillars.push({ mesh, target: groundAt(x, z) - 0.5, delay: i * 0.03 });
    }
    toast(t('brute.sealed')); events.emit('boss:deathmatch', { monster: m });
    try { game.audio?.setMusicIntensity?.(1); } catch { /* */ }
  }
  function updateRing(dt) {
    if (!m.final) return;
    for (const p of pillars) { p.delay -= dt; if (p.delay <= 0 && p.mesh.position.y < p.target) { p.mesh.position.y = Math.min(p.target, p.mesh.position.y + dt * 22); if (Math.random() < dt * 6) fx.emitFlame(p.mesh.position.clone().setY(p.target + 2), new THREE.Vector3(0, 4, 0), 0.6); } }
    pillarMat.emissiveIntensity = 0.8 + Math.sin(tAlive * 3) * 0.25;
    // the ring holds the local hunter in
    const pl = game.player; if (!pl) return;
    const dx = pl.position.x - m.ringCenter.x, dz = pl.position.z - m.ringCenter.z; const d = Math.hypot(dx, dz);
    if (d > RING - 1) { const k = (RING - 1.2) / d; pl.position.x = m.ringCenter.x + dx * k; pl.position.z = m.ringCenter.z + dz * k; if (Math.random() < dt * 2) game.status?.apply('burn', 'small'); }
    // the heat consumes the beast itself
    if (!m.remoteControlled && m.state !== 'dead') selfHarm(5 * dt);
  }
  function selfHarm(dmg) {
    if (m.state === 'dead' || m.remoteControlled) return;
    m.hp = Math.max(0, m.hp - dmg); if (m.hp <= 0) die();
  }
  m.onFxBlast = (p, radius) => { if (m.final && p.distanceTo(m.position) < radius + 5) selfHarm(70); };

  // ---------------------------------------------------------------- actions
  const fistSphere = (s, r = 2.0) => () => [new THREE.Sphere(bonePos('fist' + s, [0, -0.2, 0.4]), r)];
  const jumpFrom = new THREE.Vector3(), jumpTo = new THREE.Vector3();
  const lunge = (dt, t, t0, t1, dist) => { if (t > t0 && t < t1) m.position.addScaledVector(fwd(), (dist / (t1 - t0)) * dt); };
  // Step so the chosen fist comes down on the target: body goal = target − forward·F − side·L (capped at 3.5 m of travel).
  const FIST_F = 5.6, FIST_L = 2.3, aimFrom = new THREE.Vector3(), aimGoal = new THREE.Vector3();
  function aimLunge(dt, t, t0, t1, s, self) {
    if (t <= t0 || t >= t1) return;
    if (!self._aimed) { self._aimed = true; aimFrom.copy(m.position); const f = fwd(), right = new THREE.Vector3(f.z, 0, -f.x); const k = s === 'L' ? 1 : s === 'R' ? -1 : 0;
      aimGoal.copy(tpos()).addScaledVector(f, -FIST_F).addScaledVector(right, -FIST_L * k); aimGoal.y = 0; const d = new THREE.Vector3().subVectors(aimGoal, aimFrom).setY(0); if (d.length() > 3.5) d.setLength(3.5); aimGoal.copy(aimFrom).add(d); }
    const k = smooth((t - t0) / (t1 - t0)); m.position.x = lerp(aimFrom.x, aimGoal.x, k); m.position.z = lerp(aimFrom.z, aimGoal.z, k);
  }
  const slamImpact = (s, n) => { const p = fistGround(s); shake(0.55, 0.35); world.spawnDust?.(p.clone(), 1.6); sfx('slam', 0.9, p); spatter(p, 'fist' + s, n); };
  const ACTIONS = {
    roar: {
      dur: 2.4, update(t) { rearUp = t < 0.4 ? smooth(t / 0.4) * 0.35 : t < 2 ? 0.35 : lerp(0.35, 0, smooth((t - 2) / 0.4)); P.jaw = t > 0.4 && t < 2.1 ? 1 : 0.2; P.neck = -0.5 * rearUp / 0.35;
        if (t > 0.4 && !this._r) { this._r = true; sfx('roar', 1); sfx('growl', 0.6); events.emit('monster:roar', { monster: m }); shake(0.7, 1.5); const pl = game.player; if (pl && pl.position.distanceTo(m.position) < 28) pl.receiveHit?.({ damage: 0, knockback: 0, from: m.position.clone(), stun: 2.0, kind: 'roar' }); } },
      reset() { this._r = false; },
    },
    punch: { // single overhead fist slam
      dur: 2.1, recover: 0.6,
      update(t, dt) { const s = this._s; faceTarget(dt, t < 0.7 ? 2.2 : 0.3);
        const a = P.arm[s]; aimLunge(dt, t, 0.55, 0.95, s, this);
        if (t < 0.75) { a.sh = -2.3 * smooth(t / 0.75); a.el = 0.6 * smooth(t / 0.75); P.crouch = -0.2; } else if (t < 0.95) { a.sh = lerp(-2.3, -0.3, smooth((t - 0.75) / 0.2)); a.el = 0; P.crouch = 0.45; } else { a.sh = lerp(-0.3, 0, smooth((t - 1.2) / 0.8)); P.crouch = lerp(0.45, 0, smooth((t - 1.2) / 0.8)); }
        if (t > 0.92 && !this._i) { this._i = true; slamImpact(s, m.enraged ? 3 : 2); } },
      active: [{ t0: 0.8, t1: 1.0, spheres: () => fistSphere(ACTIONS.punch._s, 2.4)(), damage: 42, knockback: 13 }],
      reset() { this._i = this._aimed = false; this._s = R() < 0.5 ? 'L' : 'R'; },
    },
    doublePunch: {
      dur: 2.8, recover: 0.7,
      update(t, dt) { faceTarget(dt, t < 1.4 ? 1.8 : 0.3);
        if (t < 0.85) aimLunge(dt, t, 0.4, 0.8, 'L', this); else { if (!this._second) { this._second = true; this._aimed = false; } aimLunge(dt, t, 1.2, 1.6, 'R', this); }
        for (const [s, t0] of [['L', 0], ['R', 0.8]]) { const a = P.arm[s], u = t - t0; if (u < 0) continue; if (u < 0.6) a.sh = -2.1 * smooth(u / 0.6); else if (u < 0.78) a.sh = lerp(-2.1, -0.3, smooth((u - 0.6) / 0.18)); else a.sh = lerp(-0.3, 0, smooth((u - 1.1) / 0.6)); }
        P.crouch = 0.25 * Math.sin(Math.min(1, t / 2) * Math.PI);
        if (t > 0.76 && !this._a) { this._a = true; slamImpact('L', 2); } if (t > 1.56 && !this._b) { this._b = true; slamImpact('R', m.enraged ? 3 : 2); } },
      active: [{ t0: 0.62, t1: 0.8, spheres: fistSphere('L', 2.4), damage: 38, knockback: 12 }, { t0: 1.42, t1: 1.6, spheres: fistSphere('R', 2.4), damage: 42, knockback: 14 }],
      reset() { this._a = this._b = this._aimed = this._second = false; },
    },
    sweepPunch: { // horizontal backhand across the front
      dur: 2.0, recover: 0.5,
      update(t, dt) { const s = this._s, k = s === 'L' ? 1 : -1, a = P.arm[s]; faceTarget(dt, t < 0.6 ? 2 : 0);
        aimLunge(dt, t, 0.35, 0.75, null, this); if (t < 0.6) { a.side = 0.9 * k * smooth(t / 0.6); a.sh = -0.3 * smooth(t / 0.6); P.crouch = 0.3 * smooth(t / 0.6); } else if (t < 1.0) { a.side = lerp(0.9 * k, -1.1 * k, smooth((t - 0.6) / 0.4)); a.sh = -0.3; P.crouch = 0.3; if (!this._w) { this._w = true; sfx('swingHeavy', 1); } } else { a.side = lerp(-1.0 * k, 0, smooth((t - 1.2) / 0.6)); a.sh = lerp(-0.3, 0, smooth((t - 1.2) / 0.6)); P.crouch = lerp(0.3, 0, smooth((t - 1.2) / 0.6)); } },
      active: [{ t0: 0.65, t1: 0.98, spheres: () => fistSphere(ACTIONS.sweepPunch._s, 2.6)(), damage: 36, knockback: 14 }],
      reset() { this._w = this._aimed = false; this._s = R() < 0.5 ? 'L' : 'R'; },
    },
    headSlam: { // brow smashes the ground, shedding cinder
      dur: 2.2, recover: 0.8,
      update(t, dt) { faceTarget(dt, t < 0.8 ? 2 : 0); if (t < 0.85) { rearUp = 0.3 * smooth(t / 0.85); P.neck = -0.5 * smooth(t / 0.85); } else if (t < 1.05) { rearUp = lerp(0.3, -0.15, smooth((t - 0.85) / 0.2)); P.neck = lerp(-0.5, 0.9, smooth((t - 0.85) / 0.2)); } else { rearUp = lerp(-0.15, 0, smooth((t - 1.3) / 0.8)); P.neck = lerp(0.9, 0, smooth((t - 1.3) / 0.8)); }
        if (t > 1.03 && !this._i) { this._i = true; const p = bonePos('head', [0, -0.5, 1.4]); p.y = groundAt(p.x, p.z); shake(0.7, 0.4); world.spawnDust?.(p, 1.8); sfx('slam', 1, p); spatter(p, 'head', m.enraged ? 4 : 3); } },
      active: [{ t0: 0.9, t1: 1.08, spheres: () => [new THREE.Sphere(bonePos('head', [0, 0, 1.0]), 2.0)], damage: 48, knockback: 15 }],
      reset() { this._i = false; },
    },
    leapSlam: { // bound forward, land on both fists
      dur: 2.6, recover: 0.9,
      update(t, dt) {
        if (t < 0.7) { faceTarget(dt, 3); P.crouch = 0.4 * smooth(t / 0.7); jumpFrom.copy(m.position); jumpTo.copy(tpos()).addScaledVector(fwd(), -3); P.arm.L.sh = P.arm.R.sh = -0.6 * smooth(t / 0.7); }
        else if (t < 1.5) { const k = smooth((t - 0.7) / 0.8); m.position.x = lerp(jumpFrom.x, jumpTo.x, k); m.position.z = lerp(jumpFrom.z, jumpTo.z, k); bodyY = Math.sin(k * Math.PI) * 6; P.crouch = 0; P.arm.L.sh = P.arm.R.sh = lerp(-2.4, -0.1, smooth((t - 1.1) / 0.4)); if (!this._j) { this._j = true; sfx('leap', 1); } }
        else { bodyY = 0; P.crouch = lerp(0.5, 0, smooth((t - 1.5) / 1)); P.arm.L.sh = P.arm.R.sh = lerp(-0.1, 0, smooth((t - 1.6) / 0.8)); if (!this._i) { this._i = true; shake(1.0, 0.6); fx.windBlast(m.position, 9, 1.2); slamImpact('L', 2); slamImpact('R', 2); } }
      },
      active: [{ t0: 1.35, t1: 1.6, spheres: () => [...fistSphere('L', 2.4)(), ...fistSphere('R', 2.4)()], damage: 50, knockback: 16 }],
      reset() { this._j = this._i = false; },
    },
    tailSwipe: {
      dur: 2.2, recover: 0.6,
      update(t, dt) { if (t < 0.6) { P.spin = -0.5 * smooth(t / 0.6); } else if (t < 1.5) { P.spin = lerp(-0.5, Math.PI * 2 - 0.5, smooth((t - 0.6) / 0.9)); if (!this._w) { this._w = true; sfx('tail', 1); } } else { m.yaw += P.spin; P.spin = 0; if (!this._f) { this._f = true; spatter(bonePos('tail4', [0, 0, -0.8]), 'tail', 2); } } },
      active: [{ t0: 0.75, t1: 1.45, spheres: () => [new THREE.Sphere(bonePos('tail4', [0, 0, -0.7]), 2.2), new THREE.Sphere(bonePos('tail3'), 1.6)], damage: 38, knockback: 14 }],
      reset() { this._w = this._f = false; P.spin = 0; },
    },
    charge: {
      dur: 2.6, recover: 0.8,
      update(t, dt) { if (t < 0.7) { faceTarget(dt, 3); P.crouch = 0.3 * smooth(t / 0.7); if (!this._g) { this._g = true; sfx('snort', 0.9); } } else if (t < 2.0) { const v = fwd().multiplyScalar((m.enraged ? 15 : 12) * dt); m.position.add(v); speed = 9; P.crouch = 0; faceTarget(dt, 0.4); } else speed = 0; },
      active: [{ t0: 0.75, t1: 2.0, spheres: () => { const f = fwd(), c = m.position.clone(); return [new THREE.Sphere(c.clone().addScaledVector(f, 4.5).setY(c.y + 1.5), 3.0), new THREE.Sphere(c.clone().addScaledVector(f, 1.5).setY(c.y + 1.5), 3.0)]; }, damage: 40, knockback: 15 }],
      reset() { this._g = false; },
    },
    sealRing: { // final phase opener
      dur: 4.0,
      update(t, dt) {
        if (t < 1.4) { const k = smooth(t / 1.4); if (!this._from) this._from = m.position.clone(); m.position.x = lerp(this._from.x, this._c.x, k); m.position.z = lerp(this._from.z, this._c.z, k); bodyY = Math.sin(k * Math.PI) * (this._from.distanceTo(this._c) > 6 ? 8 : 1); }
        else if (t < 2.6) { bodyY = 0; faceTarget(dt, 2); rearUp = 0.45; P.jaw = 1; P.neck = -0.6; P.arm.L.sh = P.arm.R.sh = -2.5; if (!this._r) { this._r = true; sfx('roar', 1); events.emit('monster:roar', { monster: m }); shake(0.9, 1.4); } }
        else { rearUp = lerp(0.45, -0.1, smooth((t - 2.6) / 0.25)); P.arm.L.sh = P.arm.R.sh = lerp(-2.5, -0.1, smooth((t - 2.6) / 0.25)); P.jaw = 0.3; P.neck = 0;
          if (t > 2.85 && !this._s) { this._s = true; shake(1.2, 1.0); fx.windBlast(m.position, 12, 1.6); for (const s of ['L', 'R']) { const p = fistGround(s); fx.explode(p, { radius: 5, damage: 40, knockback: 14, status: ['burn', 'large'], patchOpts: { ...SEA, r: 4, life: 60 } }); } enterFinal(this._c); } }
      },
      reset() { this._r = this._s = false; this._from = null; this._c = m.position.clone().lerp(new THREE.Vector3(0, 0, 0), 0.6); const pl = game.player; if (pl && pl.position.distanceTo(this._c) > RING - 3) this._c.lerp(pl.position, 0.3); },
    },
    cataclysm: { // final ultimate: rear up, roar, detonate every pool and lump in a chain
      dur: 6.0, recover: 2.5,
      update(t, dt) {
        if (t < 2.6) { rearUp = 0.5 * smooth(t / 0.8); P.neck = -0.7; P.jaw = t > 0.8 ? 1 : 0.3; P.arm.L.sh = P.arm.R.sh = -2.6 * smooth(t / 0.8);
          if (t > 0.8 && !this._r) { this._r = true; sfx('roar', 1); sfx('growlRise', 1); shake(0.6, 1.8); }
          for (const f of fx.listPatches()) if (f.kind === 'slime') f.mesh.material.color.setRGB(1, 0.4 + 0.3 * Math.sin(t * 20), 0.2); // pools flare red
          fx.requestLight(m.center.clone(), 120 + 200 * (t / 2.6));
          for (const g of Object.values(model.growths)) g.mat.emissiveIntensity = 3 + t * 2;
        } else if (!this._d) {
          this._d = true; rearUp = 0; P.arm.L.sh = P.arm.R.sh = -0.1; shake(1.4, 1.2); sfx('slam', 1); sfx('roar', 0.6);
          const list = fx.listPatches().filter((f) => f.kind === 'slime').sort((a, b) => a.mesh.position.distanceTo(m.position) - b.mesh.position.distanceTo(m.position));
          list.forEach((f, i) => { const p = f.mesh.position.clone(); const r = f.r; setTimeout(() => { fx.removePatch(f); fx.explode(p, { radius: r + 2.6, damage: 30, knockback: 10, status: ['blast', 'normal'], patch: false, big: i % 3 === 0 }); }, 120 * i * (1 / Math.max(1, list.length / 14))); });
          for (const r of fx.liveRocks()) fx.detonate(r, 0.2);
          const pl = game.player; if (pl && pl.position.distanceTo(m.position) < 9) fx.hurt({ damage: 60, knockback: 16, from: m.position.clone(), kind: 'fire' }, ['blast', 'normal']);
        }
      },
      reset() { this._r = this._d = false; windupDmg = 0; },
    },
    recover: { dur: 1.2, update(t, dt) { P.crouch = lerp(P.crouch, 0.2, dt * 3); P.jaw = 0.4; P.neck = lerp(P.neck, 0.4, dt * 3); } },
    flinch: { dur: 1.1, update(t) { rearUp = -0.15 * Math.sin(t * Math.PI); P.neck = 0.6 * Math.sin(t * Math.PI); P.jaw = 0.7; } },
    topple: { dur: 5.5, update(t, dt) { P.crouch = t < 0.5 ? lerp(0, 1.2, smooth(t / 0.5)) : t < 4.6 ? 1.2 + Math.sin(t * 4) * 0.05 : lerp(1.2, 0, smooth((t - 4.6) / 0.9)); P.neck = t < 4.6 ? 0.9 : lerp(0.9, 0, smooth((t - 4.6) / 0.9)); P.jaw = 0.6; if (!this._c && t > 0.5) { this._c = true; shake(0.9, 0.6); sfx('thud', 1); world.spawnDust?.(m.position.clone(), 2.5); } }, reset() { this._c = false; } },
    death: { dur: 99, update(t, dt) { P.crouch = lerp(P.crouch, 1.5, dt * 1.5); P.neck = lerp(P.neck, 1.1, dt * 1.5); P.jaw = lerp(P.jaw, 0.6, dt); for (const g of Object.values(model.growths)) g.mat.emissiveIntensity = Math.max(0.05, g.mat.emissiveIntensity - dt * 0.8); if (!this._d && t > 1) { this._d = true; shake(1, 0.8); sfx('thud', 1); world.spawnDust?.(m.position.clone(), 3); } }, reset() { this._d = false; } },
  };
  const REACT = { flinch: 'flinch', topple: 'topple', death: 'dead', recover: 'recover' };
  function startAction(name, t = 0) {
    const a = ACTIONS[name]; if (!a) return;
    m.actionSeq++; R = rng(m.actionSeq * 7919 + 29); a.reset?.();
    m.action = a; m.actionName = name; m.actionTime = t; m.hitDone = false; m.state = REACT[name] || 'attack';
  }
  function endAction() {
    const a = m.action, name = m.actionName; m.action = null; m.actionName = ''; bodyY = 0; rearUp = 0;
    if (m.queue.length && !['topple', 'flinch'].includes(name)) { startAction(m.queue.shift()); return; }
    if (a?.recover) { startAction('recover'); ACTIONS.recover.dur = a.recover; return; }
    m.state = 'chase'; m.cooldown = m.enraged ? 0.6 : 1.1;
  }
  const nearDist = () => toTarget().length();
  function chooseAttack() {
    const d = nearDist(); const W = [];
    if (roarCd <= 0 && d < 26) W.push(['roar', 0.4]);
    if (d < 9) W.push(['punch', 1.2], ['doublePunch', 1.0], ['sweepPunch', 0.9], ['headSlam', 0.8], ['tailSwipe', 0.7]);
    W.push(['leapSlam', d > 8 && d < 26 ? 1.3 : 0.2], ['charge', d > 10 ? 1.0 : 0.15]);
    if (m.final && fx.listPatches().filter((f) => f.kind === 'slime').length >= 8 && (m._cataCd || 0) <= 0) W.push(['cataclysm', 2.0]);
    const sum = W.reduce((s, w) => s + w[1], 0); let r = Math.random() * sum; for (const [n, w] of W) { if ((r -= w) <= 0) return n; } return W[0][0];
  }
  function launch(name) { if (name === 'roar') roarCd = 45; if (name === 'cataclysm') m._cataCd = 28; startAction(name); }

  // ---------------------------------------------------------------- damage
  m.receiveHit = ({ damage = 0, part, point, attackerId } = {}) => {
    if (m.state === 'dead') return null;
    const p = partByName(part); const dmg = Math.max(1, Math.round(damage * p.hitzone)); flash = 1;
    if (point) fx.burst(point, 8, 6, 0.4);
    if (m.remoteControlled) return { damage: dmg, part: p.name, hitzone: p.hitzone, weak: p.hitzone >= 1.2 };
    m.hp = Math.max(0, m.hp - dmg); p.hp = Math.max(0, p.hp - dmg); p.acc += dmg;
    const aid = String(attackerId ?? game.player?.id ?? 'local'); m.threat.set(aid, (m.threat.get(aid) || 0) + dmg);
    if (!m.aggro) { m.aggro = true; pickTarget(); }
    // criticality & detach
    if (p.name in m.heat && m.size[p.name] > 0.8) {
      m.heat[p.name] = Math.min(1, m.heat[p.name] + dmg / 900);
      if (m.heat[p.name] >= 0.5) { m.detachAcc[p.name] += dmg; if (m.detachAcc[p.name] >= 380) detach(p.name); }
    }
    if (m.actionName === 'cataclysm' && m.actionTime < 2.6) windupDmg += dmg;
    let broke = false; if (p.breakable && !p.broken && p.hp <= 0) { p.broken = true; broke = true; events.emit('monster:partBreak', { monster: m, part: p.name }); sfx('break', 1); }
    if (m.hp <= 0) { die(); return { damage: dmg, part: p.name, hitzone: p.hitzone, killed: true }; }
    if (!m.enraged && m.hp < m.maxHp * 0.6) { m.enraged = true; toast(t('brute.enraged')); }
    if (!m.final && m.hp < m.maxHp * FINAL_AT && m.actionName !== 'sealRing') { m.queue = []; startAction('sealRing'); return { damage: dmg, part: p.name, hitzone: p.hitzone, weak: p.hitzone >= 1.2 }; }
    m.limping = m.hp < m.maxHp * 0.15;
    const interruptCata = m.actionName === 'cataclysm' && m.actionTime < 2.6 && windupDmg >= 900;
    if (interruptCata || broke || p.acc >= p._flinch) {
      p.acc = 0;
      if (!['topple', 'death', 'sealRing'].includes(m.actionName) && (m.actionName !== 'cataclysm' || interruptCata)) { m.queue = []; startAction(broke || interruptCata ? 'topple' : 'flinch'); if (interruptCata) toast(t('brute.cataBroken')); }
    }
    return { damage: dmg, part: p.name, hitzone: p.hitzone, weak: p.hitzone >= 1.2, broken: broke };
  };
  function die() { if (m.state === 'dead') return; m.hp = 0; m.queue = []; startAction('death'); m.state = 'dead'; events.emit('monster:died', { monster: m }); sfx('roar', 0.7); }

  // ---------------------------------------------------------------- attack collision vs local player
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
  function activeWindows() { const a = m.action; if (!a?.active) return []; return a.active.filter((w) => m.actionTime >= w.t0 && m.actionTime <= w.t1); }
  m.getAttackHitboxes = () => activeWindows().flatMap((w) => w.spheres().map((sphere) => ({ sphere, damage: w.damage, knockback: w.knockback, kind: 'physical' })));
  function checkPlayerHits() {
    const pl = game.player; if (!pl?.receiveHit || m.hitDone) return;
    const gy = groundAt(pl.position.x, pl.position.z); const base = Math.abs(pl.position.y - gy) < 1.2 ? gy : pl.position.y;
    _a.set(pl.position.x, base + 0.5, pl.position.z); _b.set(pl.position.x, base + 1.3, pl.position.z);
    for (const w of activeWindows()) for (const s of w.spheres()) {
      const tt = clamp((s.center.y - _a.y) / (_b.y - _a.y), 0, 1); _c.lerpVectors(_a, _b, tt);
      if (_c.distanceTo(s.center) < s.radius + 0.5) { if (fx.hurt({ damage: w.damage * (m.enraged ? 1.15 : 1) * (m.final ? 1.1 : 1), knockback: w.knockback, from: m.position.clone(), kind: 'physical' })) m.hitDone = true; return; }
    }
  }
  m.getHitboxes = () => hitboxes.map((h) => h.out);

  // ---------------------------------------------------------------- pose
  function pose(dt, rawDt) {
    const moving = speed > 0.3 && !m.action;
    gait += dt * (moving ? 0.9 + speed * 0.18 : 0);
    const g = gait * Math.PI * 2; const sw = moving ? 1 : 0;
    // knuckle-walk: diagonal pairs (fistL + footR, fistR + footL)
    for (const [s, k, ph] of [['L', 1, 0], ['R', -1, Math.PI]]) {
      const a = P.arm[s]; const walk = Math.sin(g + ph) * 0.35 * sw, lift = Math.max(0, Math.cos(g + ph)) * 0.35 * sw;
      B['shoulder' + s].rotation.set(a.sh - walk - lift * 0.5, a.side * 0.9, a.side * 0.08 * k);
      B['elbow' + s].rotation.set(a.el + lift * 0.6, 0, 0);
      B['hip' + s].rotation.set(walk * 0.9 - P.crouch * 0.3, 0, 0); B['knee' + s].rotation.set(lift * 0.5 + P.crouch * 0.5, 0, 0); B['foot' + s].rotation.set(-walk * 0.4 - P.crouch * 0.2, 0, 0);
    }
    for (const s of ['L', 'R']) { const a = P.arm[s]; a.sh = lerp(a.sh, 0, m.action ? 0 : dt * 3); a.el = lerp(a.el, 0, m.action ? 0 : dt * 3); a.side = lerp(a.side, 0, m.action ? 0 : dt * 3); }
    if (!m.action) { P.crouch = lerp(P.crouch, 0, dt * 3); P.neck = lerp(P.neck, 0, dt * 2); P.jaw = lerp(P.jaw, 0.15 + (m.critical ? 0.2 : 0), dt * 3); rearUp = lerp(rearUp, 0, dt * 3); }
    // head tracks the target
    let look = 0; if (m.target && m.state !== 'dead') look = clamp(wrapA(Math.atan2(toTarget().x, toTarget().z) - m.yaw), -0.7, 0.7);
    B.neck.rotation.set(P.neck * 0.6, look * 0.5, 0); B.head.rotation.set(P.neck * 0.4 - P.jaw * 0.1, look * 0.4, 0); B.jaw.rotation.x = P.jaw * 0.6;
    const tw = Math.sin(tAlive * 1.4) * 0.12 + (moving ? Math.sin(g) * 0.12 : 0);
    B.tail1.rotation.set(0.05, tw, 0); B.tail2.rotation.set(0.05, tw * 1.2, 0); B.tail3.rotation.set(0.05, tw * 1.4, 0); B.tail4.rotation.set(0, tw * 1.5, 0);
    const breathe = Math.sin(tAlive * 1.6) * 0.03;
    B.root.position.y = B.root.userData.rest.y - P.crouch * 1.2 + bodyY + (moving ? Math.abs(Math.sin(g)) * 0.25 : 0) + breathe;
    B.root.rotation.set(-rearUp, 0, moving ? Math.sin(g) * 0.04 : 0); B.chest.rotation.set(-rearUp * 0.8 + breathe, 0, 0);
    obj.rotation.y = m.yaw + P.spin;
    obj.position.y = groundAt(m.position.x, m.position.z);
    // growths: heat → colour/intensity, size → scale, critical → sparks & light
    flash = Math.max(0, flash - rawDt * 6); let crit = 0;
    for (const part of GROWTH_PARTS) {
      const gr = model.growths[part]; const h = m.heat[part], sz = m.size[part];
      const pulse = 0.5 + 0.5 * Math.sin(tAlive * (3 + h * 9) + part.length);
      gr.mat.emissive.setRGB(1, 0.22 + h * 0.62, 0.04 + h * h * 0.6); gr.mat.emissiveIntensity = m.state === 'dead' ? gr.mat.emissiveIntensity : 0.7 + h * h * 4.5 + pulse * (0.3 + h) + flash * 0.5;
      gr.group.scale.setScalar(Math.max(0.001, sz * (1 + h * 0.3 + pulse * 0.04 * h)));
      if (h >= 0.75 && sz > 0.8) {
        crit++; if (!criticalToast[part] && !m.remoteControlled) { criticalToast[part] = true; toast(t('brute.crit', { p: t(part.startsWith('fist') ? 'brute.fist' : part === 'head' ? 'brute.brow' : 'brute.tail') })); }
        if (Math.random() < dt * 14) fx.burst(gr.group.getWorldPosition(_a).clone(), 2, 4, 0.5);
        if (Math.random() < dt * 8) fx.emitFlame(gr.group.getWorldPosition(_a).clone(), new THREE.Vector3(0, 3, 0), 0.5);
      } else if (h < 0.5) criticalToast[part] = false;
    }
    m.critical = crit >= 2 || (m.final && crit >= 1);
    if (m.critical) { fx.requestLight(m.center.clone().setY(m.center.y + 1), 60 + 30 * Math.sin(tAlive * 7)); if (Math.random() < dt * 10) fx.emitFlame(bonePos('chest', [(Math.random() - 0.5) * 4, 2.2, (Math.random() - 0.5) * 3]), new THREE.Vector3(0, 3.5, 0), 0.8); }
    model.eyeMat.emissiveIntensity = m.state === 'dead' ? 0.1 : m.critical ? 6 : 3;
  }

  // ---------------------------------------------------------------- update
  m.update = (dt, rawDt = dt) => {
    dt = Math.max(0, dt); rawDt = Math.max(0, rawDt); tAlive += dt; roarCd -= dt; m._cataCd = (m._cataCd || 0) - dt;
    // heat creeps up on its own; shed growths regrow
    if (m.state !== 'dead') for (const part of GROWTH_PARTS) {
      if (m.size[part] < 1) { m.size[part] = Math.min(1, m.size[part] + dt / 25); continue; }
      m.heat[part] = Math.min(1, m.heat[part] + dt * (m.final ? 0.05 : m.enraged ? 0.03 : 0.015));
    }
    if (m.remoteControlled) remoteUpdate(dt);
    else if (m.state !== 'dead' || m.action) {
      if (!m.aggro) { if (hunters().some((h) => h.position.distanceTo(m.position) < 40) || dbgAttack) { m.aggro = true; pickTarget(); launch('roar'); } m.yaw += dt * 0.1; }
      if (m.action) { m.actionTime += dt; m.action.update(m.actionTime, dt); if (m.actionTime >= m.action.dur && m.actionName !== 'death') endAction(); speed = m.actionName === 'charge' ? speed : 0; }
      else if (m.aggro) {
        if (Math.random() < dt * 0.3) pickTarget();
        const d = nearDist(); faceTarget(dt, 1.2);
        const want = d > 7 ? (m.enraged ? 4.6 : 3.6) : 0; speed = lerp(speed, want, dt * 2);
        m.position.addScaledVector(fwd(), speed * dt); m.state = 'chase';
        // final phase: every heavy step splashes the cinder sea
        if (m.final && speed > 1 && Math.random() < dt * 0.8) { const s = Math.random() < 0.5 ? 'L' : 'R'; fx.addPatch(fistGround(s), 1.5, 40, SEA); }
        m.cooldown -= dt;
        if (m.cooldown <= 0 && d < 30) launch(dbgAttack && ACTIONS[dbgAttack] ? dbgAttack : chooseAttack());
      }
      if (m.final) { const dx = m.position.x - m.ringCenter.x, dz = m.position.z - m.ringCenter.z, d = Math.hypot(dx, dz); if (d > RING - 5) { m.position.x = m.ringCenter.x + dx * (RING - 5) / d; m.position.z = m.ringCenter.z + dz * (RING - 5) / d; } }
      else { const r = Math.hypot(m.position.x, m.position.z), Rb = (world.bounds?.radius || 120) - 14; if (r > Rb) { m.position.x *= Rb / r; m.position.z *= Rb / r; } }
      if (dt > 0) checkPlayerHits();
    }
    pose(dt, rawDt);
    m.center.copy(bonePos('chest'));
    for (const h of hitboxes) h.out.sphere.center.copy(h.bone.localToWorld(_a.copy(h.off)));
    updateRing(dt);
    fx.update(dt);
    if (m.state !== lastState) { lastState = m.state; events.emit('monster:state', { monster: m, state: m.state, action: m.actionName, exhausted: false }); }
  };

  // ---------------------------------------------------------------- net sync
  const net = { pos: new THREE.Vector3(), yaw: 0, has: false }; const seenDetach = { ...m.detachCount };
  function remoteUpdate(dt) {
    if (net.has) { m.position.x = lerp(m.position.x, net.pos.x, Math.min(1, dt * 8)); m.position.z = lerp(m.position.z, net.pos.z, Math.min(1, dt * 8)); m.yaw += wrapA(net.yaw - m.yaw) * Math.min(1, dt * 8); }
    if (m.action) { m.actionTime += dt; m.action.update(m.actionTime, dt); if (m.actionTime >= m.action.dur && m.actionName !== 'death') { m.action = null; m.actionName = ''; bodyY = 0; rearUp = 0; } }
    if (dt > 0) checkPlayerHits();
  }
  m.serialize = () => ({
    k: 'brute', x: +m.position.x.toFixed(2), z: +m.position.z.toFixed(2), r: +wrapA(m.yaw).toFixed(3), s: STATE_CODES.indexOf(m.state), a: m.actionName,
    t: +m.actionTime.toFixed(3), q: m.actionSeq, h: Math.round(m.hp), b: m.parts.reduce((acc, p, i) => acc | (p.broken ? 1 << i : 0), 0), e: m.enraged ? 1 : 0,
    ht: GROWTH_PARTS.map((p) => Math.round(m.heat[p] * 100)), sz: GROWTH_PARTS.map((p) => Math.round(m.size[p] * 100)), dc: GROWTH_PARTS.map((p) => m.detachCount[p]),
    f: m.final ? 1 : 0, cx: +m.ringCenter.x.toFixed(1), cz: +m.ringCenter.z.toFixed(1),
    tx: m.target ? +m.target.position.x.toFixed(1) : 0, tz: m.target ? +m.target.position.z.toFixed(1) : 0, tg: m.target ? String(m.target.id ?? 'local') : '',
  });
  let remoteSeq = -1; const remoteLook = { id: 'remoteTarget', position: new THREE.Vector3() };
  m.applyRemote = (st) => {
    if (!st || (st.k && st.k !== 'brute')) return;
    net.has = true; net.pos.set(st.x ?? m.position.x, 0, st.z ?? m.position.z); net.yaw = st.r ?? m.yaw; m.aggro = true;
    if (st.h != null) m.hp = st.h; if (st.e != null) m.enraged = !!st.e; m.limping = m.hp < m.maxHp * 0.15;
    if (st.b != null) m.parts.forEach((p, i) => { p.broken = !!(st.b & (1 << i)); });
    GROWTH_PARTS.forEach((p, i) => {
      if (Array.isArray(st.dc) && st.dc[i] > seenDetach[p]) { seenDetach[p] = st.dc[i]; detach(p, false); }
      if (Array.isArray(st.ht)) m.heat[p] = clamp(st.ht[i] / 100, 0, 1); if (Array.isArray(st.sz)) m.size[p] = clamp(st.sz[i] / 100, 0, 1);
    });
    if (st.f && !m.final) enterFinal(new THREE.Vector3(st.cx, 0, st.cz));
    if (st.tg) { const local = game.player && String(game.player.id ?? 'local') === st.tg; remoteLook.position.set(st.tx, groundAt(st.tx, st.tz), st.tz); m.target = local ? game.player : remoteLook; }
    if (st.q != null && st.q !== remoteSeq) { remoteSeq = st.q; if (st.a && ACTIONS[st.a]) { m.actionSeq = st.q - 1; startAction(st.a, st.t || 0); } }
    const s = STATE_CODES[st.s]; if (s === 'dead' && m.actionName !== 'death') startAction('death'); if (s && !m.action) m.state = s;
    m.actionSeq = st.q ?? m.actionSeq;
  };

  m.dispose = () => { fx.dispose(); scene.remove(ringGroup); };
  m.debug = {
    play: (name) => launch(name), setHp: (f) => { m.hp = m.maxHp * f; if (f < 0.6) m.enraged = true; }, kill: () => die(), fx,
    heat: (part, v) => { m.heat[part] = v; }, detach: (part) => detach(part), final: () => startAction('sealRing'),
  };
  window.__monster = m;
  pose(0, 0); m.center.copy(bonePos('chest'));
  return m;
}
