// Cindral, the Ashwing: a flying wyvern built on the user-supplied mesh (public/models/wyvern.glb),
// auto-rigged by tools/rig-wyvern.mjs (24 joints, identity rest rotations, +Z head, +Y up, ±X wings).
// Same contract as createMonster (CONTRACTS.md): update, getHitboxes, getAttackHitboxes, receiveHit,
// serialize/applyRemote (remoteControlled honoured), events monster:roar/partBreak/died/state.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const S = 16; // source mesh units → metres (wingspan ≈ 16 m)
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);

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
  const B = {}; model.traverse((o) => { if (o.isBone || (o.name && !o.isMesh)) B[o.name] = o; });

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
    action: null, actionName: '', actionTime: 0, actionSeq: 0, cooldown: 2.5, hitDone: false,
    stamina: 100, maxStamina: 100, exhausted: false, threat: new Map(), tailSevered: false,
  };
  obj.rotation.y = m.yaw;
  const vel = new THREE.Vector3(); let pitch = 0, roll = 0, flap = 0, flapAmp = 0.55, flapRate = 1.25, flash = 0, neckPitch = 0, neckYaw = 0, jaw = 0, tailPhase = 0, roarCd = 0, tAlive = 0, lastState = '';
  const dbgAttack = params.get('monsterAttack');

  // ---------------------------------------------------------------- fx: fireballs, sparks
  const balls = [];
  const ballGeo = new THREE.SphereGeometry(0.7, 16, 12);
  const ballMat = new THREE.MeshBasicMaterial({ color: 0xffb050 });
  const glowMat = new THREE.SpriteMaterial({ color: 0xff7a20, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  const sparkMat = new THREE.PointsMaterial({ color: 0xffa040, size: 0.35, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const sparks = [];
  function burst(pos, n = 24, speed = 9, life = 0.9) {
    const g = new THREE.BufferGeometry(); const p = new Float32Array(n * 3); const v = [];
    for (let i = 0; i < n; i++) { p.set([pos.x, pos.y, pos.z], i * 3); v.push(new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.4 + Math.random()))); }
    g.setAttribute('position', new THREE.BufferAttribute(p, 3)); const pts = new THREE.Points(g, sparkMat.clone()); scene.add(pts); sparks.push({ pts, v, life, t: 0 });
  }
  function spitFireball(from, to) {
    const mesh = new THREE.Mesh(ballGeo, ballMat); const glow = new THREE.Sprite(glowMat); glow.scale.setScalar(4.5); mesh.add(glow);
    const light = new THREE.PointLight(0xff7a30, 40, 18, 2); mesh.add(light); mesh.position.copy(from); scene.add(mesh);
    const flight = Math.max(0.55, from.distanceTo(to) / 26); const v = new THREE.Vector3().subVectors(to, from).divideScalar(flight); v.y += 0.5 * 18 * flight; // ballistic, g = 18
    balls.push({ mesh, v, t: 0 });
  }
  function updateFx(dt) {
    for (let i = balls.length - 1; i >= 0; i--) {
      const b = balls[i]; b.t += dt; b.v.y -= 18 * dt; b.mesh.position.addScaledVector(b.v, dt); b.mesh.children[0].material.rotation += dt * 4;
      const p = b.mesh.position; const gy = world.getHeight(p.x, p.z);
      if (p.y <= gy + 0.4 || b.t > 4) {
        p.y = gy + 0.4; burst(p, 30, 10, 0.8); world.spawnDust?.(p.clone(), 1.2);
        events.emit('sfx', { name: 'slam', position: p.clone(), volume: 0.8, source: 'monster' }); events.emit('camera:shake', { intensity: 0.35, duration: 0.3 });
        const pl = game.player; if (pl?.receiveHit && pl.position.distanceTo(p) < 4.2) pl.receiveHit({ damage: 34 * (m.enraged ? 1.15 : 1), knockback: 9, from: p.clone(), kind: 'fire', source: m });
        scene.remove(b.mesh); b.mesh.children[1].dispose?.(); balls.splice(i, 1);
      }
    }
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i]; s.t += dt; const a = s.pts.geometry.attributes.position;
      for (let k = 0; k < s.v.length; k++) { s.v[k].y -= 12 * dt; a.setXYZ(k, a.getX(k) + s.v[k].x * dt, a.getY(k) + s.v[k].y * dt, a.getZ(k) + s.v[k].z * dt); }
      a.needsUpdate = true; s.pts.material.opacity = 1 - s.t / s.life;
      if (s.t > s.life) { scene.remove(s.pts); s.pts.geometry.dispose(); s.pts.material.dispose(); sparks.splice(i, 1); }
    }
  }

  // ---------------------------------------------------------------- helpers
  const sfx = (name, volume = 1, pos) => events.emit('sfx', { name, position: (pos || m.center).clone(), volume, source: 'monster' });
  const shake = (i, d) => events.emit('camera:shake', { intensity: i, duration: d });
  const bonePos = (name, off = [0, 0, 0]) => B[name].localToWorld(new THREE.Vector3(...off));
  const mouth = () => bonePos('head', [0, -0.03, 0.1]);
  const partByName = (n) => m.parts.find((p) => p.name === n) || m.parts[4];
  const groundAt = (x, z) => world.getHeight(x, z);
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
  const toTarget = () => (m.target ? new THREE.Vector3().subVectors(m.target.position, m.position).setY(0) : new THREE.Vector3(0, 0, 1));

  // ---------------------------------------------------------------- actions
  // Each: dur, update(t, dt), active windows [{t0, t1, spheres() → [Sphere], damage, knockback, kind}], landed flag for recover.
  const legSpheres = () => ['fore2L', 'fore2R', 'hind2L', 'hind2R'].map((b) => new THREE.Sphere(bonePos(b, [0, -0.04, -0.02]), 0.06 * S));
  const tailSpheres = () => ['tail2', 'tail3'].map((b) => new THREE.Sphere(bonePos(b, [0, -0.02, -0.05]), 0.06 * S));
  let diveFrom = new THREE.Vector3(), diveTo = new THREE.Vector3();
  const ACTIONS = {
    roar: {
      dur: 2.6, tele: 0.6,
      update(t) { jaw = t > 0.5 && t < 2.2 ? 1 : 0.2; neckPitch = t > 0.5 && t < 2.2 ? -0.35 : 0; flapAmp = 0.8; if (t > 0.5 && !this._r) { this._r = true; sfx('roar', 1); events.emit('monster:roar', { monster: m }); shake(0.5, 1.4); stunNearby(16); } },
      reset() { this._r = false; },
    },
    talonDive: {
      dur: 3.4, tele: 1.2, recover: 1.6,
      update(t, dt) {
        if (t < 1.2) { // climb + aim
          m.alt = lerp(m.alt, HIGH, dt * 2.2); flapAmp = 0.9; flapRate = 1.7; pitch = lerp(pitch, -0.25, dt * 3); faceTarget(dt, 3);
          if (m.target) { diveTo.copy(m.target.position); } diveFrom.copy(m.position);
          if (t > 0.3 && !this._g) { this._g = true; sfx('growlRise', 0.9); }
        } else if (t < 2.0) { // dive along a line through the target
          const k = smooth((t - 1.2) / 0.8); const dir = new THREE.Vector3().subVectors(diveTo, diveFrom).setY(0); const len = dir.length(); dir.normalize();
          const p = diveFrom.clone().addScaledVector(dir, (len + 6) * k); m.position.x = p.x; m.position.z = p.z;
          m.alt = lerp(HIGH, LANDED + 0.3, Math.sin(k * Math.PI * 0.5)); flapAmp = 0.15; pitch = 0.45 * (1 - k); flap = 1.2;
          if (!this._s) { this._s = true; sfx('swingHeavy', 1); sfx('roar', 0.5); }
        } else { // skid + land
          m.alt = lerp(m.alt, LANDED, dt * 6); pitch = lerp(pitch, 0, dt * 4); flapAmp = 0.35;
          if (!this._l) { this._l = true; shake(0.6, 0.5); world.spawnDust?.(m.position.clone().setY(groundAt(m.position.x, m.position.z)), 1.6); sfx('thud', 1); }
        }
      },
      active: [{ t0: 1.35, t1: 2.05, spheres: legSpheres, damage: 42, knockback: 13 }],
      reset() { this._g = this._s = this._l = false; },
    },
    fireball: {
      dur: 2.2, tele: 0.8, recover: 0.4,
      update(t, dt) {
        faceTarget(dt, 2.5); neckPitch = t < 0.8 ? -0.45 * smooth(t / 0.8) : lerp(0.35, 0, clamp((t - 0.9) / 0.8, 0, 1)); jaw = t > 0.6 && t < 1.2 ? 1 : 0.1;
        if (t > 0.1 && !this._i) { this._i = true; sfx('inhale', 0.9); }
        const shots = m.enraged ? [0.85, 1.35] : [0.85];
        shots.forEach((st, i) => { if (t > st && !this['_f' + i]) { this['_f' + i] = true; const to = m.target ? m.target.position.clone() : m.position.clone().add(new THREE.Vector3(0, -m.alt, 8)); if (i) to.add(new THREE.Vector3((Math.random() - 0.5) * 6, 0, (Math.random() - 0.5) * 6)); spitFireball(mouth(), to); sfx('breath', 0.7, mouth()); } });
      },
      reset() { this._i = this._f0 = this._f1 = false; },
    },
    wingGust: {
      dur: 2.4, tele: 1.0, recover: 0.6,
      update(t, dt) {
        faceTarget(dt, 2); m.alt = lerp(m.alt, HOVER + 1.5, dt * 2); flapRate = t < 1.0 ? 0.8 : 2.2; flapAmp = t < 1.0 ? 1.0 : 1.1; pitch = lerp(pitch, -0.3, dt * 3);
        if (t > 1.0 && !this._g) {
          this._g = true; sfx('swingHeavy', 1); sfx('roar', 0.35); shake(0.4, 0.6);
          const g = m.position.clone(); g.y = groundAt(g.x, g.z); world.spawnDust?.(g, 2.2);
          const pl = game.player; if (pl?.receiveHit) { const d = new THREE.Vector3().subVectors(pl.position, m.position).setY(0); const fwd = new THREE.Vector3(Math.sin(m.yaw), 0, Math.cos(m.yaw)); if (d.length() < 12 && d.normalize().dot(fwd) > 0.2) pl.receiveHit({ damage: 18, knockback: 15, from: m.position.clone(), kind: 'wind', source: m }); }
        }
      },
      reset() { this._g = false; },
    },
    tailSpin: {
      dur: 2.0, tele: 0.7, recover: 0.5,
      update(t, dt) {
        m.alt = lerp(m.alt, HOVER - 0.8, dt * 3);
        if (t < 0.7) { m.yaw -= dt * 0.9; tailPhase += dt * 2; if (!this._g) { this._g = true; sfx('growl', 0.8); } }
        else if (t < 1.5) { m.yaw += dt * (Math.PI * 2 / 0.8) * 1.0; if (!this._w) { this._w = true; sfx('tail', 1); } }
      },
      active: [{ t0: 0.75, t1: 1.5, spheres: tailSpheres, damage: 36, knockback: 12 }],
      reset() { this._g = this._w = false; },
    },
    bite: {
      dur: 1.6, tele: 0.5, recover: 0.2,
      update(t, dt) {
        faceTarget(dt, 3); m.alt = lerp(m.alt, LANDED, dt * 5);
        if (t < 0.5) { neckPitch = -0.3 * smooth(t / 0.5); jaw = smooth(t / 0.5); } else if (t < 0.85) { neckPitch = lerp(-0.3, 0.75, smooth((t - 0.5) / 0.35)); jaw = t < 0.75 ? 1 : 0; if (!this._b) { this._b = true; sfx('bite', 1); } } else neckPitch = lerp(0.75, 0, smooth((t - 0.85) / 0.75));
      },
      active: [{ t0: 0.6, t1: 0.85, spheres: () => [new THREE.Sphere(bonePos('head', [0, -0.03, 0.08]), 0.06 * S)], damage: 30, knockback: 8 }],
      reset() { this._b = false; },
    },
    recover: { dur: 1.2, update(t, dt) { neckPitch = lerp(neckPitch, 0.35, dt * 3); jaw = 0.3; flapAmp = m.alt < LANDED + 0.6 ? 0.08 : 0.4; } },
    flinch: { dur: 1.0, update(t) { roll = Math.sin(t * 14) * 0.25 * (1 - t); neckPitch = -0.4 * Math.sin(t * Math.PI); jaw = 0.6; } },
    takeoff: { dur: 1.4, update(t, dt) { m.alt = lerp(m.alt, HOVER, dt * 2.5); flapAmp = 1.0; flapRate = 2.0; neckPitch = lerp(neckPitch, 0, dt * 3); if (!this._s) { this._s = true; world.spawnDust?.(m.position.clone().setY(groundAt(m.position.x, m.position.z)), 1.5); sfx('swingHeavy', 0.8); } }, reset() { this._s = false; } },
    topple: { // crash out of the air: big opening
      dur: 6.0, update(t, dt) {
        if (t < 0.8) { m.alt = lerp(m.alt, LANDED - 1.2, dt * 6); roll = lerp(roll, 1.15, dt * 5); flapAmp = 0.05; } else if (!this._c) { this._c = true; shake(0.8, 0.6); world.spawnDust?.(m.position.clone().setY(groundAt(m.position.x, m.position.z)), 2.4); sfx('thud', 1); sfx('monsterHurt', 0.9); }
        if (t > 0.8 && t < 5.2) { roll = 1.15 + Math.sin(t * 3) * 0.05; neckPitch = 0.5 + Math.sin(t * 2) * 0.15; jaw = 0.6; flap = Math.sin(t * 9) * 0.3; }
        if (t > 5.2) { roll = lerp(roll, 0, dt * 4); m.alt = lerp(m.alt, LANDED, dt * 3); }
      }, reset() { this._c = false; },
    },
    exhausted: { dur: 9, update(t, dt) { m.alt = lerp(m.alt, LANDED, dt * 3); flapAmp = 0.05; neckPitch = 0.55 + Math.sin(t * 2.4) * 0.08; jaw = 0.45 + Math.sin(t * 4.8) * 0.15; if (Math.random() < dt * 4) burst(mouth(), 4, 2, 0.6); } },
    death: {
      dur: 99, update(t, dt) { if (t < 1.2) { m.alt = lerp(m.alt, LANDED - 1.3, dt * 4); roll = lerp(roll, 1.3, dt * 3); } else if (!this._d) { this._d = true; shake(0.9, 0.8); sfx('thud', 1); world.spawnDust?.(m.position.clone().setY(groundAt(m.position.x, m.position.z)), 2.6); } neckPitch = lerp(neckPitch, 0.8, dt * 2); jaw = lerp(jaw, 0.5, dt); flapAmp = 0; flap = lerp(flap, -0.4, dt); },
      reset() { this._d = false; },
    },
  };
  const REACT = { flinch: 'flinch', topple: 'topple', death: 'dead', recover: 'recover', exhausted: 'exhausted', takeoff: 'chase' };
  function startAction(name, t = 0) {
    const a = ACTIONS[name]; if (!a) return; a.reset?.();
    m.action = a; m.actionName = name; m.actionTime = t; m.actionSeq++; m.hitDone = false;
    m.state = REACT[name] || 'attack';
    if (name === 'exhausted') m.exhausted = true;
  }
  function endAction() {
    const a = m.action, name = m.actionName; m.action = null; m.actionName = '';
    if (name === 'exhausted') { m.exhausted = false; m.stamina = m.maxStamina; startAction('takeoff'); return; }
    if (name === 'topple') { startAction('takeoff'); return; }
    if (a?.recover) { startAction('recover'); ACTIONS.recover.dur = a.recover; return; }
    if (name === 'recover' && m.alt < LANDED + 0.8 && Math.random() < 0.55) { startAction('bite'); return; }
    if (name === 'recover' && m.alt < HOVER - 1) { startAction('takeoff'); return; }
    m.state = 'chase'; m.cooldown = m.enraged ? 0.6 : 1.1;
  }
  function stunNearby(r) { const pl = game.player; if (pl?.receiveHit && pl.position.distanceTo(m.position) < r) pl.receiveHit({ damage: 0, knockback: 0, from: m.position.clone(), stun: 1.6, kind: 'roar' }); }
  function faceTarget(dt, rate) { if (!m.target) return; const v = toTarget(); const want = Math.atan2(v.x, v.z); m.yaw += clamp(wrapA(want - m.yaw), -rate * dt, rate * dt); }
  function chooseAttack() {
    const d = toTarget().length(); const W = [];
    if (roarCd <= 0 && d < 22) W.push(['roar', 0.5]);
    W.push(['fireball', d > 9 ? 1.4 : 0.5], ['talonDive', d > 7 ? 1.1 : 0.5], ['wingGust', d < 12 ? 0.9 : 0.2], ['tailSpin', d < 8 ? 1.2 : 0.1]);
    if (m.alt < LANDED + 1 && d < 7) W.push(['bite', 1.4]);
    let sum = W.reduce((s, w) => s + w[1], 0), r = Math.random() * sum; for (const [n, w] of W) { if ((r -= w) <= 0) return n; } return W[0][0];
  }

  // ---------------------------------------------------------------- damage
  m.receiveHit = ({ damage = 0, part, point, attackerId } = {}) => {
    if (m.state === 'dead') return null;
    const p = partByName(part); const dmg = Math.max(1, Math.round(damage * p.hitzone)); flash = 1;
    if (point) burst(point, 8, 6, 0.4);
    if (m.remoteControlled) return { damage: dmg, part: p.name, hitzone: p.hitzone, weak: p.hitzone >= 1.2 };
    m.hp = Math.max(0, m.hp - dmg); p.hp = Math.max(0, p.hp - dmg); p.acc += dmg;
    const aid = String(attackerId ?? game.player?.id ?? 'local'); m.threat.set(aid, (m.threat.get(aid) || 0) + dmg);
    if (!m.aggro) { m.aggro = true; pickTarget(); }
    let broke = false; if (p.breakable && !p.broken && p.hp <= 0) { applyBreak(p.name, true); broke = true; }
    if (m.hp <= 0) { die(); return { damage: dmg, part: p.name, hitzone: p.hitzone, killed: true }; }
    if (!m.enraged && m.hp < m.maxHp * 0.5) { m.enraged = true; if (!['topple', 'death'].includes(m.actionName)) startAction('roar'); roarCd = 60; }
    m.limping = m.hp < m.maxHp * 0.2;
    if (broke || p.acc >= p._flinch) {
      p.acc = 0;
      if (!['topple', 'death'].includes(m.actionName)) startAction(broke && p.name !== 'head' ? 'topple' : (p.name === 'wings' && m.alt > LANDED + 1) || (m.exhausted && p.name === 'head') ? 'topple' : 'flinch');
    }
    return { damage: dmg, part: p.name, hitzone: p.hitzone, weak: p.hitzone >= 1.2, broken: broke };
  };
  function applyBreak(name, emit) {
    const p = partByName(name); p.broken = true; p.hp = 0;
    if (name === 'tail') m.tailSevered = true; // tail3 shrinks (visual) and its hitbox goes away
    if (emit) { events.emit('monster:partBreak', { monster: m, part: name }); sfx('break', 1); shake(0.5, 0.4); burst(m.center.clone(), 40, 10, 1); }
  }
  function die() { m.hp = 0; startAction('death'); m.state = 'dead'; events.emit('monster:died', { monster: m }); sfx('roar', 0.7); }

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
      if (_c.distanceTo(s.center) < s.radius + 0.5) { const r = pl.receiveHit({ damage: w.damage * (m.enraged ? 1.15 : 1), knockback: w.knockback, from: m.position.clone(), kind: w.kind || 'physical', source: m }); if (r !== false) m.hitDone = true; return; }
    }
  }
  m.getHitboxes = () => hitboxes.filter((h) => !(h.flag === 'tip' && m.tailSevered)).map((h) => h.out);

  // ---------------------------------------------------------------- pose
  function pose(dt, rawDt) {
    flap += dt * flapRate * Math.PI * 2; tailPhase += dt * 1.3;
    const fl = Math.sin(flap) * flapAmp, fold = m.alt < LANDED + 0.8 ? -0.35 : 0; // fold wings when landed
    const wingBroken = partByName('wings').broken ? 0.75 : 1;
    for (const [s, k] of [['L', 1], ['R', -1]]) {
      B['wing1' + s].rotation.z = k * (fl + fold) * wingBroken; B['wing2' + s].rotation.z = k * (Math.sin(flap - 0.5) * flapAmp * 0.6 + fold * 0.8);
      B['wing3' + s].rotation.z = k * Math.sin(flap - 1.0) * flapAmp * 0.45; B['wing2' + s].rotation.x = -Math.sin(flap - 0.4) * flapAmp * 0.12;
      const legSwing = m.alt < LANDED + 0.8 ? 0.35 : Math.sin(flap * 0.5 + (k > 0 ? 0 : 1)) * 0.08;
      B['fore1' + s].rotation.x = -legSwing; B['hind1' + s].rotation.x = legSwing * 0.6 - (m.alt < LANDED + 0.8 ? 0.5 : 0);
    }
    // head tracking toward target (yaw split over neck)
    let wantYaw = 0, wantPitch = 0;
    if (m.target && m.state !== 'dead') {
      const v = toTarget(); wantYaw = clamp(wrapA(Math.atan2(v.x, v.z) - m.yaw), -0.9, 0.9);
      const dy = m.target.position.y + 1 - B.head.getWorldPosition(_a).y; wantPitch = clamp(-Math.atan2(dy, Math.max(2, v.length())), -0.4, 0.7);
    }
    neckYaw = lerp(neckYaw, wantYaw, Math.min(1, dt * 3));
    const np = neckPitch + wantPitch * 0.5;
    B.neck1.rotation.set(np * 0.45, neckYaw * 0.4, 0); B.neck2.rotation.set(np * 0.35, neckYaw * 0.35, 0); B.head.rotation.set(np * 0.2 - jaw * 0.1, neckYaw * 0.25, 0);
    B.jaw.rotation.x = jaw * 0.55;
    const tw = Math.sin(tailPhase) * 0.18 - (m.actionName === 'tailSpin' ? 0.5 : 0);
    B.tail1.rotation.set(Math.sin(tailPhase * 0.7) * 0.06, tw * 0.5, 0); B.tail2.rotation.set(0.04, tw * 0.7, 0); B.tail3.rotation.set(0.05, tw, 0);
    B.tail3.scale.setScalar(m.tailSevered ? 0.05 : 1);
    B.chest.rotation.x = -Math.sin(flap) * flapAmp * 0.05; // body heave with wingbeats
    // body orientation & altitude bob
    obj.rotation.y = m.yaw; obj.rotation.x = pitch; obj.rotation.z = roll;
    const gy = groundAt(m.position.x, m.position.z); const bob = m.alt > LANDED + 0.5 ? Math.sin(flap + 1.2) * 0.35 * flapAmp : 0;
    m.position.y = gy + m.alt + bob;
    // downstroke whoosh
    const ph = (flap % (Math.PI * 2)); if (ph < m._lastPh && flapAmp > 0.3) sfx('swoosh', 0.35 * flapAmp); m._lastPh = ph;
    // materials
    flash = Math.max(0, flash - rawDt * 6);
    if (skinned) skinned.material.emissiveIntensity = (m.state === 'dead' ? 0.05 : m.enraged ? 0.75 + 0.25 * Math.sin(tAlive * 4) : 0.18) + flash * 0.6;
  }

  // ---------------------------------------------------------------- update
  m.update = (dt, rawDt = dt) => {
    dt = Math.max(0, dt); rawDt = Math.max(0, rawDt); tAlive += dt; roarCd -= dt;
    if (m.remoteControlled) { remoteUpdate(dt); }
    else if (m.state !== 'dead' || m.action) {
      if (!m.aggro) { // idle hover, aggro on proximity
        const near = hunters().some((h) => h.position.distanceTo(m.position) < 38);
        if (near || dbgAttack) { m.aggro = true; pickTarget(); startAction('roar'); roarCd = 45; }
        m.yaw += dt * 0.15;
      }
      if (m.action) {
        m.actionTime += dt; m.action.update(m.actionTime, dt);
        if (m.actionTime >= m.action.dur && m.actionName !== 'death') endAction();
      } else if (m.aggro) {
        if (Math.random() < dt * 0.3) pickTarget();
        // hover-follow: keep ~11 m from target, strafe around
        const v = toTarget(); const d = v.length(); faceTarget(dt, 1.6);
        const want = d > 13 ? 1 : d < 8 ? -1 : 0; const side = new THREE.Vector3(Math.cos(m.yaw), 0, -Math.sin(m.yaw));
        const sp = m.enraged ? 7 : 5.2; const desired = v.normalize().multiplyScalar(want * sp).addScaledVector(side, Math.sin(tAlive * 0.4) * 2.5);
        vel.lerp(desired, Math.min(1, dt * 1.5)); m.position.addScaledVector(vel, dt);
        m.alt = lerp(m.alt, HOVER, dt * 1.2); flapAmp = lerp(flapAmp, 0.55, dt * 2); flapRate = lerp(flapRate, 1.25, dt * 2);
        pitch = lerp(pitch, clamp(vel.length() * 0.03, -0.2, 0.25), dt * 2); roll = lerp(roll, clamp(-vel.dot(side) * 0.05, -0.35, 0.35), dt * 2);
        neckPitch = lerp(neckPitch, 0, dt * 2); jaw = lerp(jaw, 0.1, dt * 3); m.state = 'chase';
        m.stamina = Math.max(0, m.stamina - dt * 0.12);
        m.cooldown -= dt;
        if (m.stamina <= 0 && !m.exhausted) startAction('exhausted');
        else if (m.cooldown <= 0) { const a = dbgAttack && ACTIONS[dbgAttack] ? dbgAttack : chooseAttack(); m.stamina = Math.max(0, m.stamina - 3); startAction(a); if (a === 'roar') roarCd = 75; }
      }
      // stay inside the map
      const r = Math.hypot(m.position.x, m.position.z), R = (world.bounds?.radius || 120) - 12; if (r > R) { m.position.x *= R / r; m.position.z *= R / r; }
      if (dt > 0) checkPlayerHits();
    }
    pose(dt, rawDt);
    m.center.copy(bonePos('chest'));
    for (const h of hitboxes) h.out.sphere.center.copy(h.bone.localToWorld(_a.copy(h.off)));
    updateFx(rawDt);
    if (m.state !== lastState) { lastState = m.state; events.emit('monster:state', { monster: m, state: m.state, action: m.actionName, exhausted: m.exhausted }); }
  };

  // ---------------------------------------------------------------- net sync
  const net = { pos: new THREE.Vector3(), yaw: 0, alt: HOVER, has: false };
  function remoteUpdate(dt) {
    if (net.has) { m.position.x = lerp(m.position.x, net.pos.x, Math.min(1, dt * 8)); m.position.z = lerp(m.position.z, net.pos.z, Math.min(1, dt * 8)); m.yaw += wrapA(net.yaw - m.yaw) * Math.min(1, dt * 8); if (!m.action) m.alt = lerp(m.alt, net.alt, Math.min(1, dt * 6)); }
    if (m.action) { m.actionTime += dt; m.action.update(m.actionTime, dt); if (m.actionTime >= m.action.dur && m.actionName !== 'death') { m.action = null; m.actionName = ''; } }
    if (dt > 0) checkPlayerHits();
  }
  m.serialize = () => ({
    k: 'wyvern', x: +m.position.x.toFixed(2), z: +m.position.z.toFixed(2), r: +wrapA(m.yaw).toFixed(3), al: +m.alt.toFixed(2), s: STATE_CODES.indexOf(m.state), a: m.actionName,
    t: +m.actionTime.toFixed(3), q: m.actionSeq, h: Math.round(m.hp), b: m.parts.reduce((acc, p, i) => acc | (p.broken ? 1 << i : 0), 0), e: m.enraged ? 1 : 0, ex: m.exhausted ? 1 : 0,
    tx: m.target ? +m.target.position.x.toFixed(1) : 0, tz: m.target ? +m.target.position.z.toFixed(1) : 0, tg: m.target ? String(m.target.id ?? 'local') : '',
  });
  let remoteSeq = -1; const remoteLook = { id: 'remoteTarget', position: new THREE.Vector3() };
  m.applyRemote = (st) => {
    if (!st || (st.k && st.k !== 'wyvern')) return;
    net.has = true; net.pos.set(st.x ?? m.position.x, 0, st.z ?? m.position.z); net.yaw = st.r ?? m.yaw; net.alt = st.al ?? net.alt;
    if (st.h != null) m.hp = st.h; if (st.e != null) m.enraged = !!st.e; if (st.ex != null) m.exhausted = !!st.ex; m.limping = m.hp < m.maxHp * 0.2; m.aggro = true;
    if (st.b != null) m.parts.forEach((p, i) => { if (st.b & (1 << i) && !p.broken) applyBreak(p.name, false); });
    if (st.tg) { const local = game.player && String(game.player.id ?? 'local') === st.tg; remoteLook.position.set(st.tx, groundAt(st.tx, st.tz), st.tz); m.target = local ? game.player : remoteLook; }
    if (st.q != null && st.q !== remoteSeq) { remoteSeq = st.q; if (st.a && ACTIONS[st.a]) startAction(st.a, st.t || 0); }
    const s = STATE_CODES[st.s]; if (s === 'dead' && m.actionName !== 'death') startAction('death'); if (s && !m.action) m.state = s;
    m.actionSeq = st.q ?? m.actionSeq;
  };

  m.debug = {
    play: (name, t = 0) => startAction(name, t), setHp: (f) => { m.hp = m.maxHp * f; if (f < 0.5) m.enraged = true; },
    breakPart: (n) => applyBreak(n, true), kill: () => die(), exhaust: () => startAction('exhausted'),
  };
  window.__monster = m;
  pose(0, 0); m.center.copy(bonePos('chest'));
  return m;
}
