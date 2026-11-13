// Varkhul, the Emberhide — flagship boss. AI state machine, combat, hitzones, part breaks, net sync.
// Built from: rig.js (procedural skinned model), anim.js (procedural animation/IK), attacks.js (move set), fx.js (VFX).
import * as THREE from 'three';
import { buildRig } from './rig.js';
import { Animator, POSE_DEFAULTS } from './anim.js';
import { ACTIONS, COMBOS } from './attacks.js';
import { createFx } from './fx.js';

const TAU = Math.PI * 2;
const wrapA = (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
const clamp = THREE.MathUtils.clamp;
const PART_DEFS = [
  { name: 'head', hp: 2900, hitzone: 1.4, breakable: true, flinch: 760 },
  { name: 'forelegs', hp: 2350, hitzone: 1.0, breakable: true, flinch: 950 },
  { name: 'back', hp: 2500, hitzone: 0.9, breakable: true, flinch: 1100 },
  { name: 'tail', hp: 3150, hitzone: 1.15, breakable: true, flinch: 1000 },
  { name: 'body', hp: 21000, hitzone: 0.75, breakable: false, flinch: 1250 },
];
const STATE_CODES = ['idle', 'roam', 'chase', 'attack', 'flinch', 'topple', 'dead', 'exhausted', 'recover'];
const REACT_STATE = { flinch: 'flinch', flinchHead: 'flinch', legBuckle: 'flinch', topple: 'topple', death: 'dead', recover: 'recover' };

export async function createMonster(game) {
  const { scene, events, world } = game;
  const params = game.params || new URLSearchParams();
  const rig = buildRig();
  const obj = new THREE.Group(); obj.name = 'Varkhul';
  obj.add(rig.bones[0], rig.bodyMesh, rig.memMesh);
  obj.updateMatrixWorld(true);
  rig.bodyMesh.bind(new THREE.Skeleton(rig.bones)); rig.memMesh.bind(rig.bodyMesh.skeleton);
  const spawn = world.spawn?.monster || new THREE.Vector3(0, 0, -20);
  obj.position.set(spawn.x, world.getHeight(spawn.x, spawn.z), spawn.z);
  scene.add(obj);
  const anim = new Animator(game, rig, obj);
  const fx = createFx(game);
  const uni = rig.materials.uniforms;

  // hitbox definitions (bone-local offsets; bones are model-axis aligned at rest)
  const B = rig.B; const half = (a, b) => B[b].userData.restPos.clone().multiplyScalar(0.5);
  const HB = [
    ['head', 'head', [0, 0.12, 0.55], 0.95], ['head', 'head', [0, -0.05, 1.45], 0.62],
    ['body', 'neck1', [0, -0.3, 0.4], 1.05], ['body', 'neck2', [0, -0.1, 0.3], 0.82], ['body', 'neck3', [0, 0, 0.3], 0.7],
    ['back', 'root', [0, -0.25, 0.2], 1.2], ['back', 'spine1', [0, -0.25, 0], 1.3], ['back', 'spine2', [0, -0.25, 0], 1.35], ['back', 'chest', [0, -0.25, 0.1], 1.25],
    ['body', 'root', [0, -1.3, -0.2], 1.15], ['body', 'spine1', [0, -1.55, 0], 1.3], ['body', 'spine2', [0, -1.65, 0], 1.35], ['body', 'chest', [0, -1.5, 0.2], 1.3],
    ['tail', 'tail1', [0, -0.1, -0.45], 0.95], ['tail', 'tail2', [0, -0.1, -0.45], 0.82], ['tail', 'tail3', [0, -0.05, -0.45], 0.68], ['tail', 'tail4', [0, 0, -0.45], 0.56],
    ['tail', 'tail5', [0, 0, -0.42], 0.48, true], ['tail', 'tail6', [0, -0.05, -0.55], 0.8, true], ['tail', 'tail6', [0, -0.1, -1.3], 0.6, true],
  ];
  for (const s of ['L', 'R']) {
    HB.push(['forelegs', 'upperArm' + s, half('upperArm' + s, 'foreArm' + s).toArray(), 0.7], ['forelegs', 'foreArm' + s, half('foreArm' + s, 'hand' + s).toArray(), 0.55], ['forelegs', 'hand' + s, [0, -0.3, 0.3], 0.5]);
    HB.push(['body', 'thigh' + s, half('thigh' + s, 'shin' + s).toArray(), 0.9], ['body', 'shin' + s, half('shin' + s, 'meta' + s).toArray(), 0.52], ['body', 'meta' + s, half('meta' + s, 'toe' + s).toArray(), 0.36]);
  }
  const hitboxes = HB.map(([part, bone, off, r, tailEnd]) => ({ part, bone: B[bone], off: new THREE.Vector3(...off), tailEnd: !!tailEnd, out: { part, sphere: new THREE.Sphere(new THREE.Vector3(), r) } }));

  const m = {
    name: 'Varkhul, the Emberhide', title: 'Emberhide', object3d: obj, position: obj.position, center: new THREE.Vector3(),
    hp: 21000, maxHp: 21000, state: 'idle', enraged: false, remoteControlled: false, rig, anim, fx, events,
    parts: PART_DEFS.map((d) => ({ name: d.name, hp: d.hp, maxHp: d.hp, broken: false, hitzone: d.hitzone, breakable: d.breakable, _flinch: d.flinch, acc: 0 })),
    yaw: Math.atan2(-spawn.x, -spawn.z) || Math.PI, speed: 0, target: null, tailSevered: false,
    action: null, actionName: '', actionTime: 0, actionSeq: 0, queue: [], cooldown: 2.0, lift: 0,
    flinchSide: 1, hitDone: false, aggro: false, roamTarget: null, roamWait: 0,
    stamina: 100, maxStamina: 100, exhausted: false, exhaustTimer: 0, threat: new Map(), jerk: 0, buckle: 0, buckleFront: false,
  };
  obj.rotation.y = m.yaw;
  const P = anim.P;
  let yawPrev = m.yaw, yawRate = 0, vy = 0, vAcc = 0, flash = 0, glowTarget = 0.6, actionStartYaw = 0, actionStartPos = new THREE.Vector3(), leapTo = new THREE.Vector3();
  let reactCdUntil = 0, lastStateEmitted = '', targetTimer = 0, roarCd = 18, leapCd = 6, lastAttack = '', sameCount = 0, tAlive = 0;
  const net = { has: false, pos: new THREE.Vector3(), yaw: 0 };
  const dbgAttack = params.get('monsterAttack'), dbgFreeze = params.get('monsterFreeze') === '1', dbgT = params.has('monsterT') ? +params.get('monsterT') : null;

  // ---------- helpers exposed to attack scripts ----------
  m.sfx = (name, volume = 1) => events.emit('sfx', { name, position: m.center.clone(), volume, source: 'monster' });
  m.shake = (intensity, duration) => {
    const d = game.player ? game.player.position.distanceTo(m.position) : 0; const f = clamp(1 - d / 45, 0, 1);
    if (f > 0) { events.emit('camera:shake', { intensity: intensity * f, duration }); game.cameraRig?.shake?.(intensity * f, duration); }
  };
  m.dust = (bone, amount) => { const p = bone ? bone.getWorldPosition(new THREE.Vector3()) : m.position.clone(); p.y = world.getHeight(p.x, p.z); world.spawnDust?.(p, amount); };
  m.doRoar = () => {
    m.sfx('roar', 1.5); m.shake(0.7, 1.6);
    if (!m.remoteControlled) events.emit('monster:roar', { monster: m, position: m.position.clone(), radius: 13 });
  };
  const mouth = new THREE.Vector3(), mouthDir = new THREE.Vector3();
  m.fizzle = () => fx.smokePuff(mouth, mouthDir);
  m.breathSpheres = () => {
    const out = []; const t = m.actionTime - (m.action?.breath?.[0] ?? 0); const reach = clamp(t * 26, 0, 15);
    for (let d = 1.5; d <= reach; d += 1.7) out.push({ sphere: new THREE.Sphere(mouth.clone().addScaledVector(mouthDir, d).setY(Math.max(mouth.y + mouthDir.y * d, world.getHeight(mouth.x + mouthDir.x * d, mouth.z + mouthDir.z * d) + 0.4)), 0.6 + d * 0.16) });
    return out;
  };

  // ---------- hunters ----------
  const hunters = () => {
    const list = []; if (game.player && !(game.player.hp <= 0)) list.push({ id: game.player.id ?? 'local', position: game.player.position, local: true });
    if (game.remotePlayers) for (const [id, r] of game.remotePlayers) { const p = r.position || r.object3d?.position; if (p && !(r.hp <= 0)) list.push({ id, position: p }); }
    return list;
  };
  const pickTarget = () => {
    let best = null, bd = Infinity;
    for (const h of hunters()) { const d = h.position.distanceTo(m.position) - Math.min(22, (m.threat.get(String(h.id)) || 0) * 0.05) - (h.id === m.lastAttacker ? 2 : 0) - (m.target && h.id === m.target.id ? 3 : 0); if (d < bd) { bd = d; best = h; } }
    m.target = best;
  };

  // ---------- actions ----------
  function setState(s) { if (m.state === s) return; m.state = s; }
  function startAction(name, t0 = 0) {
    const a = ACTIONS[name]; if (!a) return;
    m.action = a; m.actionName = name; m.actionTime = t0; m.hitDone = false; m.actionSeq++;
    actionStartYaw = m.yaw; actionStartPos.copy(m.position);
    a._fired = new Set(); for (const [i, ev] of (a.events || []).entries()) if (ev[0] < t0) a._fired.add(i);
    setState(REACT_STATE[name] || 'attack');
    if (a.cost && !m.remoteControlled) m.stamina = Math.max(0, m.stamina - a.cost * 0.2 * (m.enraged ? 0.85 : 1));
    if (name === 'leapSlam') computeLeap();
  }
  function computeLeap() {
    const tp = m.target ? m.target.position : m.position.clone().add(new THREE.Vector3(Math.sin(m.yaw), 0, Math.cos(m.yaw)).multiplyScalar(12));
    const d = new THREE.Vector3().subVectors(tp, m.position).setY(0); const len = clamp(d.length(), 4, 22);
    d.normalize().multiplyScalar(len); leapTo.copy(m.position).add(d);
    const R = (world.bounds?.radius ?? 180) - 10; if (Math.hypot(leapTo.x, leapTo.z) > R) leapTo.setLength(R);
  }
  function endAction() {
    const was = m.actionName; m.action = null; m.actionName = ''; m.yaw = wrapA(m.yaw); yawPrev = m.yaw;
    if (was === 'death') return;
    if (m.queue.length && !m.remoteControlled) { startAction(m.queue.shift()); return; }
    if (!m.remoteControlled && ACTIONS[was]?.cost && was !== 'roar') {
      if (m.stamina <= 0 && !m.exhausted) enterExhausted();
      const rec = (ACTIONS[was].recover ?? 0) * (m.enraged ? 0.6 : 1) * (m.exhausted ? 1.4 : 1);
      if (!dbgAttack && rec > 0.05) { startAction('recover'); m.actionTime = Math.max(0, ACTIONS.recover.dur - rec); return; }
    }
    setState(m.exhausted ? 'exhausted' : m.target ? 'chase' : 'roam');
    m.cooldown = (m.enraged ? 0.5 + Math.random() * 0.7 : 1.1 + Math.random() * 1.2) * (m.exhausted ? 1.8 : 1);
    if (dbgAttack) m.cooldown = 0.9;
  }
  function enterExhausted() {
    m.exhausted = true; m.exhaustTimer = 9; m.queue = []; setState('exhausted'); lastStateEmitted = 'exhausted';
    events.emit('monster:state', { monster: m, state: 'exhausted', exhausted: true }); m.sfx('pant', 1);
  }
  function leaveExhausted() {
    m.exhausted = false; m.stamina = m.maxStamina; m.exhaustTimer = 0;
    events.emit('monster:state', { monster: m, state: m.state, exhausted: false });
  }
  function chooseAttack() {
    const t = m.target; if (!t) return null;
    const to = new THREE.Vector3().subVectors(t.position, m.position); const dist = Math.hypot(to.x, to.z);
    const ang = Math.abs(wrapA(Math.atan2(to.x, to.z) - m.yaw));
    const W = [];
    if (m.exhausted) { // tired: slow melee, fizzling breath, no charge/leap
      if (dist < 8.5 && ang < 0.6) W.push(['bite', 3]);
      if (dist < 9) W.push(['tailSweep', ang > 0.9 ? 3 : 0.8]);
      if (dist > 5 && dist < 18 && ang < 0.6) W.push(['fizzle', 1.5]);
      const tot0 = W.reduce((a, b) => a + b[1], 0); if (!tot0) return null; let r0 = Math.random() * tot0; for (const [n, w] of W) { r0 -= w; if (r0 <= 0) return n; } return W[0][0];
    }
    if (dist < 8.5 && ang < 0.6) W.push(['bite', 4]);
    if (dist < 8.5 && ang < 0.6) W.push(['biteSweep', 2.2], ['doubleBite', 1.8]);
    if (dist < 9 && ang > 0.9) W.push(['sweepBite', 1.5]);
    if (dist < 9 && ang > 0.9) W.push(['tailSweep', 5]); else if (dist < 8) W.push(['tailSweep', 1.5]);
    if (dist > 11 && dist < 34 && ang < 0.5) W.push(['charge', 2.2]);
    if (dist > 9 && dist < 24 && leapCd <= 0) W.push(['leapSlam', 0.6]);
    if (dist > 5 && dist < 18 && ang < 0.6) W.push(['fireBreath', 2]);
    if (roarCd <= 0 && dist < 25) W.push(['roar', 0.6]);
    if (m.enraged) {
      if (dist < 9 && ang < 0.6) W.push(['emberRush', 3]);
      if (dist > 9 && dist < 22) W.push(['inferno', 2.5]);
      if (dist > 12 && dist < 32 && ang < 0.5) W.push(['cinderCharge', 1.5]);
    }
    const ws = W.map(([n, w]) => [n, n === lastAttack ? w * (sameCount > 0 ? 0.15 : 0.5) : w]);
    const tot = ws.reduce((a, b) => a + b[1], 0); if (!tot) return null;
    let r = Math.random() * tot; for (const [n, w] of ws) { r -= w; if (r <= 0) return n; }
    return ws[0][0];
  }
  function launch(name) {
    sameCount = name === lastAttack ? sameCount + 1 : 0; lastAttack = name;
    if (COMBOS[name]) { const seq = [...COMBOS[name]]; startAction(seq.shift()); m.queue = seq; } else startAction(name);
    if (name === 'roar') roarCd = 75;
    if (name === 'leapSlam' || name === 'inferno') leapCd = 14;
  }

  // ---------- damage ----------
  const partByName = (n) => m.parts.find((p) => p.name === n) || m.parts[4];
  m.receiveHit = ({ damage = 0, part, point, attackerId } = {}) => {
    if (m.state === 'dead') return null;
    const p = partByName(part); const dmg = Math.max(1, Math.round(damage * p.hitzone));
    flash = 1;
    if (point) fx.sparks(point, 6, 1.2, 2.5);
    if (m.remoteControlled) return { damage: dmg, part: p.name, hitzone: p.hitzone, weak: p.hitzone >= 1.2 };
    m.hp = Math.max(0, m.hp - dmg); p.hp = Math.max(0, p.hp - dmg); p.acc += dmg;
    const aid = String(attackerId ?? game.player?.id ?? 'local'); m.lastAttacker = attackerId ?? m.lastAttacker;
    m.threat.set(aid, (m.threat.get(aid) || 0) + dmg);
    let lp = null; if (point) { lp = obj.worldToLocal(point.clone()); m.flinchSide = lp.x >= 0 ? 1 : -1; }
    const legHit = p.name === 'forelegs' || (lp && lp.y < 1.9 && p.name === 'body');
    if (p.name === 'head') m.jerk = Math.min(1.5, m.jerk + 0.6);
    if (legHit) { m.buckle = Math.min(1.5, m.buckle + 0.5); m.buckleFront = p.name === 'forelegs' || (lp && lp.z > 0); }
    if (!m.aggro) { m.aggro = true; pickTarget(); }
    let broke = false;
    if (p.breakable && !p.broken && p.hp <= 0) { applyBreak(p.name, true); broke = true; }
    if (m.hp <= 0) { die(); return { damage: dmg, part: p.name, hitzone: p.hitzone, killed: true }; }
    if (!m.enraged && m.hp < m.maxHp * 0.5) { m.enraged = true; m.queue = []; if (m.action?.tags?.includes('react') !== true) { startAction('roar'); roarCd = 25; } }
    if (broke || p.acc >= p._flinch) {
      p.acc = 0;
      const canInterrupt = !m.action || !['topple', 'death'].includes(m.actionName);
      if (canInterrupt) {
        m.queue = []; startAction(broke || (m.exhausted && p.name === 'head') ? 'topple' : 'flinch');
      }
    } else if ((!m.action || m.actionName === 'recover') && tAlive > reactCdUntil && dmg > 30) {
      if (p.name === 'head') { startAction('flinchHead'); reactCdUntil = tAlive + 6; } else if (legHit) { startAction('legBuckle'); reactCdUntil = tAlive + 6; }
    }
    return { damage: dmg, part: p.name, hitzone: p.hitzone, weak: p.hitzone >= 1.2, broken: broke };
  };
  function spawnDebrisFrom(srcMesh, impulse) {
    srcMesh.updateMatrixWorld(true);
    const d = new THREE.Mesh(srcMesh.geometry, srcMesh.material); d.castShadow = true;
    srcMesh.matrixWorld.decompose(d.position, d.quaternion, d.scale);
    fx.addDebris(d, impulse, new THREE.Vector3(Math.random() * 6 - 3, Math.random() * 6 - 3, Math.random() * 6 - 3));
  }
  function applyBreak(name, emit) {
    const p = partByName(name); if (p.broken && !emit) return; p.broken = true; p.hp = 0;
    const up = new THREE.Vector3(0, 6, 0);
    if (name === 'head') {
      spawnDebrisFrom(rig.hornMeshes.L, up.clone().add(new THREE.Vector3(Math.sin(m.yaw + 1.2) * 4, 0, Math.cos(m.yaw + 1.2) * 4)));
      rig.hornMeshes.L.visible = false; rig.hornMeshes.stubL.visible = true;
      fx.sparks(B.head.getWorldPosition(new THREE.Vector3()), 30, 2, 4);
    } else if (name === 'tail') {
      m.tailSevered = true;
      spawnDebrisFrom(rig.clubMesh, new THREE.Vector3(Math.sin(m.yaw) * -5, 5, Math.cos(m.yaw) * -5));
      rig.clubMesh.visible = false; if (rig.rigidMeshes.tail6) rig.rigidMeshes.tail6.visible = false;
      B.tail6.scale.setScalar(0.02); B.tail5.scale.set(0.8, 0.8, 0.45); rig.stump.visible = true;
      fx.sparks(B.tail5.getWorldPosition(new THREE.Vector3()), 40, 1.5, 3);
    } else if (name === 'back') {
      for (const bn of ['spine1', 'spine2']) if (rig.rigidMeshes[bn]) rig.rigidMeshes[bn].scale.set(1, 0.55, 0.8);
      fx.sparks(B.spine2.getWorldPosition(new THREE.Vector3()), 50, 2.5, 5);
    } else if (name === 'forelegs') {
      const mm = rig.materials.memMat; mm.alphaMap = rig.materials.memTex.tornAlpha; mm.needsUpdate = true;
    }
    if (emit && !m.remoteControlled) { events.emit('monster:partBreak', { monster: m, part: name }); m.sfx('break', 1.4); }
  }
  function die() {
    if (m.state === 'dead') return;
    m.queue = []; startAction('death'); setState('dead'); m.hp = 0;
    if (!m.remoteControlled) events.emit('monster:died', { monster: m });
  }

  // ---------- attack collision vs local player ----------
  const _seg0 = new THREE.Vector3(), _seg1 = new THREE.Vector3(), _cp = new THREE.Vector3();
  function activeWindows() { if (!m.action?.active) return []; return m.action.active.filter((w) => m.actionTime >= w.t0 && m.actionTime <= w.t1); }
  m.getAttackHitboxes = () => {
    const out = [];
    for (const w of activeWindows()) { if (w.kind === 'roar') continue; for (const s of w.spheres(m)) out.push({ sphere: s.sphere, damage: w.damage, knockback: w.knockback, kind: w.kind || 'physical' }); }
    return out;
  };
  function checkPlayerHits() {
    const pl = game.player; if (!pl || m.hitDone || !pl.receiveHit) return;
    const wins = activeWindows(); if (!wins.length) return;
    const gy = world.getHeight(pl.position.x, pl.position.z); const base = Math.abs(pl.position.y - gy) < 1.2 ? gy : pl.position.y;
    _seg0.set(pl.position.x, base + 0.5, pl.position.z); _seg1.set(pl.position.x, base + 1.3, pl.position.z);
    for (const w of wins) for (const s of w.spheres(m)) {
      const c = s.sphere.center; const tt = clamp((c.y - _seg0.y) / (_seg1.y - _seg0.y), 0, 1); _cp.lerpVectors(_seg0, _seg1, tt);
      if (_cp.distanceTo(c) < s.sphere.radius + 0.5) {
        const from = w.kind === 'fire' ? mouth.clone() : m.position.clone();
        const res = w.kind === 'roar' ? pl.receiveHit({ damage: 0, knockback: 0, from, stun: 1.6, kind: 'roar' }) : pl.receiveHit({ damage: w.damage * (m.enraged ? 1.15 : 1), knockback: w.knockback, from, kind: w.kind || 'physical', source: m });
        if (res !== false) m.hitDone = true;
        return;
      }
    }
  }

  // ---------- locomotion ----------
  const fwd = new THREE.Vector3(), vel = new THREE.Vector3();
  function steerTo(targetPos, dt, desiredSpeed, turnRate) {
    const to = new THREE.Vector3().subVectors(targetPos, m.position).setY(0);
    // obstacle avoidance
    for (const c of world.colliders || []) {
      const dx = m.position.x - c.x, dz = m.position.z - c.z; const d = Math.hypot(dx, dz); const R = c.r + 6;
      if (d < R && d > 0.01) { const w = (R - d) / R; to.x += (dx / d) * w * 8; to.z += (dz / d) * w * 8; }
    }
    const want = Math.atan2(to.x, to.z); const da = wrapA(want - m.yaw);
    m.yaw += clamp(da, -turnRate * dt, turnRate * dt);
    const facing = Math.abs(da) < 0.9 ? 1 : Math.abs(da) < 1.6 ? 0.35 : 0; // turn in place when target is far off-axis
    return desiredSpeed * facing;
  }
  function moveForward(spd, dt) {
    fwd.set(Math.sin(m.yaw), 0, Math.cos(m.yaw));
    m.position.x += fwd.x * spd * dt; m.position.z += fwd.z * spd * dt;
    let blocked = false;
    for (const c of world.colliders || []) {
      const dx = m.position.x - c.x, dz = m.position.z - c.z; const d = Math.hypot(dx, dz); const R = c.r + 2.8;
      if (d < R) { const k = (R - d) / Math.max(d, 1e-3); m.position.x += dx * k; m.position.z += dz * k; blocked = true; }
    }
    const R = (world.bounds?.radius ?? 180) - 6; const r = Math.hypot(m.position.x, m.position.z);
    if (r > R) { m.position.x *= R / r; m.position.z *= R / r; blocked = true; }
    return blocked;
  }

  function aiUpdate(dt) {
    targetTimer -= dt; roarCd -= dt; leapCd -= dt;
    for (const [k, v] of m.threat) m.threat.set(k, v * Math.exp(-dt * 0.06));
    if (m.aggro && !m.exhausted && m.state !== 'dead') m.stamina = Math.max(0, m.stamina - dt * 0.06);
    if (m.exhausted) { m.exhaustTimer -= dt; if (m.exhaustTimer <= 0) leaveExhausted(); }
    else if (m.stamina <= 0 && !m.action) enterExhausted();
    if (targetTimer <= 0) {
      targetTimer = 1.0; const prev = m.target; pickTarget();
      if (m.target && !m.aggro && m.target.position.distanceTo(m.position) < 48) { m.aggro = true; if (!m.action && !dbgAttack) launch('roar'); }
      if (m.target && m.target.position.distanceTo(m.position) > 90) { m.target = null; m.aggro = false; }
      if (!m.aggro) m.target = null; else if (!m.target) m.target = prev;
    }
    let desired = 0, turn = 1.5;
    if (m.action) {
      const a = m.action; const t = m.actionTime;
      if (m.target && a.track && t >= a.track[0] && t <= a.track[1]) {
        const to = new THREE.Vector3().subVectors(m.target.position, m.position); const da = wrapA(Math.atan2(to.x, to.z) - m.yaw);
        m.yaw += clamp(da, -a.track[2] * dt, a.track[2] * dt);
      }
      if (a.homing && m.target && t >= a.homing[0] && t <= a.homing[1]) {
        const to = new THREE.Vector3().subVectors(m.target.position, m.position); const da = wrapA(Math.atan2(to.x, to.z) - m.yaw);
        m.yaw += clamp(da, -a.homing[2] * dt, a.homing[2] * dt);
      }
      if (a.yaw) m.yaw = actionStartYaw + a.yaw(t);
      if (a.motion) { const s = a.motion(t) * (m.enraged ? 1.1 : 1); const blocked = moveForward(s, dt); if (blocked && m.actionName === 'charge' && t > 1 && t < 2.6) m.actionTime = 2.6; }
      if (a.air) {
        const f = clamp((t - a.air[0]) / (a.air[1] - a.air[0]), 0, 1);
        if (t >= a.air[0] && t <= a.air[1] + 0.05) { m.position.x = actionStartPos.x + (leapTo.x - actionStartPos.x) * f; m.position.z = actionStartPos.z + (leapTo.z - actionStartPos.z) * f; }
        if (t >= a.air[0] - 0.02 && t < a.air[0]) actionStartPos.copy(m.position);
      }
      m.speed = a.motion ? a.motion(t) : 0;
      return;
    }
    if (m.state === 'dead') return;
    if (m.target) {
      setState(m.exhausted ? 'exhausted' : 'chase');
      const dist = m.target.position.distanceTo(m.position);
      m.cooldown -= dt;
      const to = new THREE.Vector3().subVectors(m.target.position, m.position); const ang = Math.abs(wrapA(Math.atan2(to.x, to.z) - m.yaw));
      if (m.cooldown <= 0) {
        const pick = dbgAttack === 'none' ? null : dbgAttack && (ACTIONS[dbgAttack] || COMBOS[dbgAttack]) ? dbgAttack : chooseAttack();
        if (pick) { launch(pick); if (dbgAttack && dbgT != null && dbgFreeze) m.actionTime = dbgT; return; }
        m.cooldown = 0.3;
      }
      const sp = (dbgAttack || m.debugHold ? 0 : dist > 20 ? (m.enraged ? 8.5 : 7) : dist > 8 ? 3.4 : 0) * (m.exhausted ? 0.45 : 1);
      turn = sp > 5 ? 1.0 : 1.5;
      desired = steerTo(m.target.position, dt, sp, ang > 0.4 || sp > 0 ? turn : 0.6);
    } else {
      setState('roam');
      if (!m.roamTarget || m.roamTarget.distanceTo(m.position) < 4) {
        m.roamWait -= dt;
        if (m.roamWait <= 0) { const a = Math.random() * TAU, r = 10 + Math.random() * 25; m.roamTarget = new THREE.Vector3(spawn.x + Math.cos(a) * r, 0, spawn.z + Math.sin(a) * r); m.roamWait = 3 + Math.random() * 4; }
      } else desired = steerTo(m.roamTarget, dt, 2.4, 0.8);
      if (dbgAttack) { desired = 0; m.roamTarget = null; }
    }
    if (m.hp < m.maxHp * 0.2) desired *= 0.7; // limping
    m.speed += (desired - m.speed) * Math.min(1, dt * 2.2);
    moveForward(m.speed, dt);
  }

  // remote: smooth toward the last network state
  function remoteUpdate(dt) {
    if (!net.has) return;
    const k = 1 - Math.exp(-dt * 8);
    const dx = net.pos.x - m.position.x, dz = net.pos.z - m.position.z;
    if (dx * dx + dz * dz > 400) { m.position.x = net.pos.x; m.position.z = net.pos.z; } else { m.position.x += dx * k; m.position.z += dz * k; }
    m.yaw += wrapA(net.yaw - m.yaw) * (1 - Math.exp(-dt * 10));
    m.speed = Math.hypot(dx, dz) * 4;
  }

  // ---------- main update ----------
  const poseT = { ...POSE_DEFAULTS };
  m.update = (dt, rawDt) => {
    dt = Number.isFinite(dt) ? clamp(dt, 0, 0.1) : 0; rawDt = Number.isFinite(rawDt) ? clamp(rawDt, 0, 0.1) : dt;
    tAlive += dt;
    const frozen = (dbgFreeze && m.action && dbgAttack) || (m.debugHold && m.action);
    if (dt > 0) {
      if (m.remoteControlled) remoteUpdate(dt); else aiUpdate(frozen ? 0 : dt);
      if (m.action) {
        const prevT = m.actionTime;
        if (!frozen) m.actionTime += dt * (m.enraged ? 1.15 : 1) * (m.exhausted && m.action.cost ? 0.8 : 1);
        const a = m.action;
        (a.events || []).forEach((ev, i) => { if (!a._fired.has(i) && m.actionTime >= ev[0] && (prevT <= ev[0] || frozen)) { a._fired.add(i); ev[1](m); } });
        if (m.actionTime >= a.dur && !a.hold) { if (!m.remoteControlled || m.actionName !== 'death') endAction(); }
        else if (a.hold && m.actionTime >= a.dur) m.actionTime = a.dur;
      }
    }
    // ground follow
    let lift = 0;
    if (m.action?.air) { const a = m.action, f = (m.actionTime - a.air[0]) / (a.air[1] - a.air[0]); if (f > 0 && f < 1) lift = 4 * a.height * f * (1 - f); }
    const gy = world.getHeight(m.position.x, m.position.z);
    m.position.y = gy + lift;
    obj.rotation.y = m.yaw;
    const sdt = Math.max(dt, 1e-4);
    yawRate += (wrapA(m.yaw - yawPrev) / sdt - yawRate) * Math.min(1, dt * 8); yawPrev = m.yaw;
    const nvy = (lift - m.lift) / sdt; vAcc = (nvy - vy) / sdt; vy = nvy; m.lift = lift;
    // pose targets
    Object.assign(poseT, POSE_DEFAULTS);
    const spd = Math.abs(m.speed);
    poseT.crouch = Math.min(0.25, spd * 0.025); poseT.neckPitch = -Math.min(0.25, spd * 0.03); poseT.pitch = -Math.min(0.05, spd * 0.006);
    if (m.hp < m.maxHp * 0.2 && m.state !== 'dead') { poseT.roll = 0.05; poseT.neckPitch -= 0.15; poseT.jaw = 0.25; }
    if (m.exhausted && m.state !== 'dead') { poseT.neckPitch -= 0.55; poseT.headPitch -= 0.15; poseT.jaw = 0.4 + 0.12 * Math.sin(tAlive * 7); poseT.crouch += 0.2; poseT.spinePitch = -0.05 * Math.sin(tAlive * 7); }
    let rate = 8;
    if (m.action) { m.action.pose(m.actionTime, poseT, m); rate = m.action.rate || 10; }
    // additive hit reactions (never interrupt): small head jerk, leg buckle
    m.jerk = Math.max(0, m.jerk - dt * 3); m.buckle = Math.max(0, m.buckle - dt * 2.5);
    const jk = m.jerk * Math.exp(-Math.pow((1.5 - m.jerk) * 1.2, 2) * 0.5);
    poseT.headPitch += 0.35 * jk; poseT.headYaw -= 0.25 * jk * m.flinchSide; poseT.jaw += 0.3 * jk;
    poseT.crouch += 0.45 * m.buckle; poseT.roll -= 0.08 * m.buckle * m.flinchSide; poseT.pitch += (m.buckleFront ? -0.08 : 0.06) * m.buckle;
    const kk = 1 - Math.exp(-Math.max(dt, frozen ? rawDt : 0) * Math.max(rate, m.jerk + m.buckle > 0.05 ? 14 : 0));
    for (const key in poseT) P[key] += (poseT[key] - P[key]) * kk;
    // head tracking target
    const look = m.target && m.state !== 'dead' ? m.target.position.clone().setY(m.target.position.y + 1.2) : null;
    fwd.set(Math.sin(m.yaw), 0, Math.cos(m.yaw)); vel.copy(fwd).multiplyScalar(m.speed);
    const gaitRate = m.action?.gait ? m.action.gait(m.actionTime) : (m.enraged ? 1.15 : 1) * (m.hp < m.maxHp * 0.2 ? 0.8 : 1);
    anim.update(dt, { yaw: m.yaw, speed: spd, velocity: vel, yawRate, look, air: lift > 0.3, dead: m.state === 'dead' && m.actionTime > 0.6, vAcc, gaitRate });
    // derived positions
    B.head.localToWorld(mouth.set(0, -0.12, 2.0)); B.head.localToWorld(mouthDir.set(0, -0.08, 3.0)); mouthDir.sub(mouth).normalize();
    B.chest.getWorldPosition(m.center); m.center.y -= 0.8;
    for (const h of hitboxes) { h.bone.localToWorld(h.out.sphere.center.copy(h.off)); }
    // VFX: breath stream, glow, embers
    const a = m.action;
    const breathing = a?.breath && m.actionTime >= a.breath[0] && m.actionTime <= a.breath[1];
    if (breathing && rawDt > 0) fx.breath(mouth, mouthDir, rawDt, 1);
    fx.light.position.copy(mouth).addScaledVector(mouthDir, breathing ? 5 : 0.5);
    const fl = Math.sin(tAlive * 31) * 0.5 + Math.sin(tAlive * 17.3 + 1) * 0.3 + (Math.random() - 0.5) * 0.4;
    const lt = breathing ? 7 + fl * 3.5 : a?.throat ? a.throat(m.actionTime) * 0.7 : 0;
    fx.light.intensity += (Math.max(0, lt) - fx.light.intensity) * Math.min(1, rawDt * 18);
    fx.light.color.setRGB(1, 0.42 + fl * 0.08, 0.15);
    if (m.exhausted && m.state !== 'dead' && Math.random() < rawDt * 6) fx.drip(mouth);
    if (world.sun) { const sd = uni.uSunView.value.copy(world.sun.position); if (world.sun.target) sd.sub(world.sun.target.position); sd.normalize().transformDirection(game.camera.matrixWorldInverse); }
    uni.uThroat.value = a?.throat ? a.throat(m.actionTime) : 0.18 + (m.enraged ? 0.3 : 0);
    glowTarget = m.state === 'dead' ? 0.0 : m.enraged ? 2.4 : 0.7;
    if (m.actionName === 'roar') glowTarget *= 1.6;
    uni.uGlow.value += (glowTarget - uni.uGlow.value) * Math.min(1, rawDt * (m.state === 'dead' ? 0.4 : 2));
    uni.uTime.value += rawDt * (m.enraged ? 1.6 : 1);
    rig.materials.ventMat.emissiveIntensity = uni.uGlow.value * (1.3 + 0.6 * Math.sin(uni.uTime.value * 3.1) * Math.sin(uni.uTime.value * 1.7 + 1));
    flash = Math.max(0, flash - rawDt * 7); uni.uFlash.value = flash * 0.35;
    rig.eyes.forEach((e) => (e.material.emissiveIntensity = m.state === 'dead' ? Math.max(0, e.material.emissiveIntensity - rawDt) : m.enraged ? 4.5 : 2.5));
    if (m.enraged && m.state !== 'dead' && Math.random() < rawDt * 14) {
      const bn = ['spine1', 'spine2', 'chest', 'root', 'tail1'][Math.floor(Math.random() * 5)];
      fx.sparks(B[bn].localToWorld(new THREE.Vector3((Math.random() - 0.5) * 0.8, 0.6, (Math.random() - 0.5) * 1.2)), 1, 0.6, 2.5);
    }
    fx.update(rawDt);
    if (dt > 0) checkPlayerHits();
    if (m.state !== lastStateEmitted) { lastStateEmitted = m.state; events.emit('monster:state', { monster: m, state: m.state, action: m.actionName, exhausted: m.exhausted }); }
  };

  anim.onStep = (pos, front, speed) => {
    events.emit('footstep', { position: pos.clone(), heavy: true, source: 'monster' });
    m.sfx('step', 0.6 + Math.min(0.6, speed * 0.05));
    if (speed > 2.5) world.spawnDust?.(pos.clone(), 0.35 + speed * 0.03);
    m.shake(0.12 + Math.min(0.25, speed * 0.02), 0.18);
  };

  m.getHitboxes = () => hitboxes.filter((h) => !(h.tailEnd && m.tailSevered)).map((h) => h.out);

  // ---------- net sync ----------
  m.serialize = () => ({
    x: +m.position.x.toFixed(2), z: +m.position.z.toFixed(2), r: +wrapA(m.yaw).toFixed(3), s: STATE_CODES.indexOf(m.state), a: m.actionName,
    t: +m.actionTime.toFixed(3), q: m.actionSeq, h: Math.round(m.hp), b: m.parts.reduce((acc, p, i) => acc | (p.broken ? 1 << i : 0), 0), e: m.enraged ? 1 : 0, st: Math.round(m.stamina), ex: m.exhausted ? 1 : 0,
    tg: m.target ? String(m.target.id) : '', tx: m.target ? +m.target.position.x.toFixed(1) : 0, tz: m.target ? +m.target.position.z.toFixed(1) : 0,
  });
  let remoteSeq = -1;
  const remoteLook = { id: 'remoteTarget', position: new THREE.Vector3() };
  m.applyRemote = (st) => {
    if (!st) return;
    net.has = true; if (st.tg) m.aggro = true; net.pos.set(st.x ?? m.position.x, 0, st.z ?? m.position.z); net.yaw = st.r ?? m.yaw;
    if (st.h != null) m.hp = st.h;
    if (st.e != null) m.enraged = !!st.e;
    if (st.st != null) m.stamina = st.st;
    if (st.ex != null) m.exhausted = !!st.ex;
    if (st.b != null) m.parts.forEach((p, i) => { if (st.b & (1 << i) && !p.broken) applyBreak(p.name, false); });
    if (st.tg) {
      const local = game.player && String(game.player.id ?? 'local') === st.tg; remoteLook.position.set(st.tx, world.getHeight(st.tx, st.tz), st.tz);
      m.target = local ? { id: st.tg, position: game.player.position } : remoteLook;
    } else m.target = null;
    if (st.q != null && st.q !== remoteSeq) {
      remoteSeq = st.q;
      if (st.a && ACTIONS[st.a]) { if (st.a !== m.actionName || Math.abs(m.actionTime - st.t) > 0.3) { startAction(st.a, st.t || 0); } }
    } else if (st.a && st.a === m.actionName && st.t != null && Math.abs(m.actionTime - st.t) > 0.35) m.actionTime = st.t;
    if (!st.a && m.action && m.actionName !== 'death') { m.action = null; m.actionName = ''; }
    const s = STATE_CODES[st.s];
    if (s === 'dead' && m.actionName !== 'death') { startAction('death', 0); }
    if (s && !m.action && s !== 'dead') m.state = s;
    if (s === 'exhausted') m.exhausted = true;
    m.actionSeq = st.q ?? m.actionSeq;
  };

  // ---------- debug ----------
  m.debug = {
    play: (name, t = 0) => { m.queue = []; m.debugHold = false; startAction(name, t); },
    hold: (name, t) => { m.queue = []; startAction(name, t); m.debugHold = true; },
    release: () => { m.debugHold = false; },
    setHp: (f) => { m.hp = m.maxHp * f; if (f < 0.5) m.enraged = true; },
    breakPart: (n) => applyBreak(n, true), kill: () => die(), exhaust: () => { m.stamina = 0; enterExhausted(); },
  };
  if (dbgAttack) m.cooldown = 1.2;
  window.__monster = m;
  return m;
}
