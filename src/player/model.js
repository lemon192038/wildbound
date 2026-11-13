// Procedural hunter: skinned humanoid body (real Bone hierarchy) + rigid layered armor attached to bones,
// helmet with horsehair plume, the Marrowcleaver and the anchors used by the cloth sim.
// Bind pose: Y-up, facing +Z, character's left = +X, arms hanging straight down; every bone has identity rotation.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { getHunterTextures } from './textures.js';
import { buildWeapon, sweep } from './weapon.js';

export const BONE_DEFS = [
  ['root', null, [0, 0, 0]], ['hips', 'root', [0, 0.98, 0]], ['spine', 'hips', [0, 1.09, -0.005]], ['chest', 'spine', [0, 1.26, -0.01]],
  ['neck', 'chest', [0, 1.5, -0.015]], ['head', 'neck', [0, 1.6, 0]],
  ['shoulderL', 'chest', [0.05, 1.44, -0.02]], ['upperArmL', 'shoulderL', [0.195, 1.43, -0.02]], ['foreArmL', 'upperArmL', [0.195, 1.13, -0.02]], ['handL', 'foreArmL', [0.195, 0.88, -0.02]],
  ['shoulderR', 'chest', [-0.05, 1.44, -0.02]], ['upperArmR', 'shoulderR', [-0.195, 1.43, -0.02]], ['foreArmR', 'upperArmR', [-0.195, 1.13, -0.02]], ['handR', 'foreArmR', [-0.195, 0.88, -0.02]],
  ['thighL', 'hips', [0.1, 0.93, 0]], ['shinL', 'thighL', [0.1, 0.5, 0.005]], ['footL', 'shinL', [0.1, 0.085, -0.01]], ['toeL', 'footL', [0.1, 0.03, 0.12]],
  ['thighR', 'hips', [-0.1, 0.93, 0]], ['shinR', 'thighR', [-0.1, 0.5, 0.005]], ['footR', 'shinR', [-0.1, 0.085, -0.01]], ['toeR', 'footR', [-0.1, 0.03, 0.12]],
];
// sheathed: grip above right shoulder, blade down-left across the back (chest-bone local space)
export const BACK_SOCKET = { g: [-0.17, 0.4, -0.25], b: [0.6, -0.8, -0.03], e: [0.6, 0.45, -0.6] };
export const BONE_INDEX = Object.fromEntries(BONE_DEFS.map((b, i) => [b[0], i]));
const BIND = Object.fromEntries(BONE_DEFS.map((b) => [b[0], new THREE.Vector3(...b[2])]));

// ---------- skinned body pieces ----------
// A closed tube from A along axis d (length len), cross-section axes X/W, radius profile prof(t)->[rx,rw,ox,ow].
function tube({ a, d = [0, -1, 0], W = [0, 0, 1], len, prof, weights, rings = 10, segs = 14, capA = 0.12, capB = 0.12 }) {
  const A = new THREE.Vector3(...a), D = new THREE.Vector3(...d).normalize(), Wv = new THREE.Vector3(...W).normalize();
  const X = new THREE.Vector3().crossVectors(Wv, D).normalize();
  if (X.lengthSq() < 0.5) X.set(1, 0, 0);
  const pos = [], uv = [], si = [], sw = [], idx = [];
  const ts = [];
  for (let i = 0; i < rings; i++) { const u = i / (rings - 1); ts.push(0.5 - 0.5 * Math.cos(u * Math.PI) * 0.15 + (u - 0.5) * 0.85); }
  ts[0] = 0; ts[rings - 1] = 1;
  const p = new THREE.Vector3();
  for (let i = 0; i < rings; i++) {
    const t = ts[i], [rx, rw, ox = 0, ow = 0] = prof(t);
    let k = 1;
    if (t < capA) k = Math.sqrt(Math.max(0, 1 - ((capA - t) / capA) ** 2));
    if (t > 1 - capB) k = Math.sqrt(Math.max(0, 1 - ((t - (1 - capB)) / capB) ** 2));
    k = Math.max(k, 0.02);
    const w = weights(t);
    for (let j = 0; j <= segs; j++) {
      const ang = (j / segs) * Math.PI * 2;
      p.copy(A).addScaledVector(D, t * len).addScaledVector(X, ox + Math.sin(ang) * rx * k).addScaledVector(Wv, ow + Math.cos(ang) * rw * k);
      pos.push(p.x, p.y, p.z); uv.push(j / segs, t);
      const wi = [0, 0, 0, 0], ww = [0, 0, 0, 0]; w.slice(0, 4).forEach(([b, v], q) => { wi[q] = BONE_INDEX[b]; ww[q] = v; });
      const sum = ww.reduce((s, v) => s + v, 0) || 1; si.push(...wi); sw.push(...ww.map((v) => v / sum));
    }
  }
  for (let i = 0; i < rings - 1; i++) for (let j = 0; j < segs; j++) {
    const a0 = i * (segs + 1) + j, b0 = a0 + segs + 1;
    idx.push(a0, b0, a0 + 1, b0, b0 + 1, a0 + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  g.setIndex(idx); g.computeVertexNormals();
  // ensure outward normals: flip winding if the first ring normal points inward
  return g;
}
const sm = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
// weight helper: self bone with blend to parent near t=0 and child near t=1
const W = (self, parent, child, ta = 0.22, tb = 0.22) => (t) => {
  const out = [[self, 1]];
  if (parent && t < ta) out.push([parent, 0.5 * (1 - sm(0, ta, t))]);
  if (child && t > 1 - tb) out.push([child, 0.5 * sm(1 - tb, 1, t)]);
  return out;
};

function buildBodyGeometry() {
  const parts = { suit: [], leather: [], skin: [] };
  // pelvis / abdomen / chest (upward)
  parts.leather.push(tube({ a: [0, 0.8, -0.005], d: [0, 1, 0], len: 0.32, prof: (t) => [0.15 + 0.03 * Math.sin(t * Math.PI), 0.11 + 0.015 * Math.sin(t * Math.PI), 0, 0.005], weights: (t) => (t < 0.35 ? [['hips', 1]] : W('hips', null, 'spine', 0, 0.5)(t)), rings: 9, capA: 0.3, capB: 0.02 }));
  parts.suit.push(tube({ a: [0, 1.03, -0.005], d: [0, 1, 0], len: 0.26, prof: (t) => [0.142 + 0.02 * t, 0.103 + 0.012 * t, 0, 0.004], weights: W('spine', 'hips', 'chest', 0.3, 0.3), capA: 0.02, capB: 0.02 }));
  parts.suit.push(tube({ a: [0, 1.22, -0.01], d: [0, 1, 0], len: 0.31, prof: (t) => [0.16 + 0.035 * Math.sin(Math.min(1, t * 1.25) * Math.PI * 0.8) - 0.05 * sm(0.75, 1, t), 0.115 + 0.022 * Math.sin(t * Math.PI) - 0.02 * sm(0.8, 1, t), 0, 0.012 * Math.sin(t * Math.PI)], weights: W('chest', 'spine', null, 0.25), capA: 0.02, capB: 0.18 }));
  // neck + head
  parts.suit.push(tube({ a: [0, 1.46, -0.015], d: [0, 1, 0], len: 0.19, prof: () => [0.056, 0.058, 0, 0], weights: W('neck', 'chest', 'head', 0.3, 0.3), segs: 10, rings: 6, capA: 0.01, capB: 0.01 }));
  parts.skin.push(tube({ a: [0, 1.565, 0.0], d: [0, 1, 0], len: 0.25, prof: (t) => [0.083 + 0.01 * Math.sin(t * Math.PI), 0.098, 0, 0.012 - 0.02 * t], weights: () => [['head', 1]], segs: 16, rings: 12, capA: 0.3, capB: 0.45 }));
  for (const s of [1, -1]) {
    const L = s > 0 ? 'L' : 'R', x = 0.195 * s;
    parts.suit.push(tube({ a: [x, 1.49, -0.02], len: 0.38, prof: (t) => [0.054 - 0.01 * t + 0.008 * Math.sin(t * Math.PI), 0.058 - 0.012 * t + 0.01 * Math.sin(t * 3), 0, 0], weights: (t) => { const o = W('upperArm' + L, 'shoulder' + L, 'foreArm' + L, 0.2, 0.2)(t); if (t < 0.15) o.push(['chest', 0.4 * (1 - t / 0.15)]); return o; }, capA: 0.2, capB: 0.08 }));
    parts.suit.push(tube({ a: [x, 1.15, -0.02], len: 0.28, prof: (t) => [0.044 - 0.012 * t + 0.006 * Math.sin(t * Math.PI), 0.048 - 0.014 * t + 0.008 * Math.sin(t * Math.PI), 0, 0], weights: W('foreArm' + L, 'upperArm' + L, 'hand' + L, 0.15, 0.2), capA: 0.08, capB: 0.05 }));
    parts.leather.push(tube({ a: [x, 0.9, -0.015], len: 0.19, prof: (t) => [0.028 + 0.004 * Math.sin(t * Math.PI), 0.044 + 0.008 * Math.sin(t * Math.PI), -0.004 * s, 0.006], weights: W('hand' + L, 'foreArm' + L, null, 0.2), segs: 10, capA: 0.1, capB: 0.35 }));
    // legs
    parts.leather.push(tube({ a: [0.1 * s, 0.99, 0], len: 0.52, prof: (t) => [0.098 - 0.03 * t + 0.012 * Math.sin(t * Math.PI), 0.1 - 0.032 * t + 0.01 * Math.sin(t * Math.PI), 0.008 * s * (1 - t), 0.01 * Math.sin(t * Math.PI)], weights: W('thigh' + L, 'hips', 'shin' + L, 0.15, 0.18), capA: 0.12, capB: 0.06 }));
    parts.leather.push(tube({ a: [0.1 * s, 0.53, 0.005], len: 0.47, prof: (t) => [0.064 - 0.02 * t + 0.01 * Math.sin(t * 3.5) * (1 - t), 0.066 - 0.022 * t + 0.016 * Math.sin(t * 3.5) * (1 - t), 0, -0.012 * Math.sin(t * 3.5) * (1 - t)], weights: W('shin' + L, 'thigh' + L, 'foot' + L, 0.15, 0.12), capA: 0.06, capB: 0.05 }));
    // boot (along +Z, W axis = up)
    parts.leather.push(tube({ a: [0.1 * s, 0.06, -0.075], d: [0, 0, 1], W: [0, 1, 0], len: 0.27, prof: (t) => [0.046 + 0.01 * Math.sin(t * Math.PI), 0.06 - 0.03 * t, 0, -0.004 - 0.0 * t], weights: (t) => (t < 0.62 ? [['foot' + L, 1]] : [['foot' + L, 1 - sm(0.62, 0.8, t)], ['toe' + L, sm(0.62, 0.8, t)]]), segs: 12, rings: 10, capA: 0.25, capB: 0.25 }));
  }
  const groupMerge = (arr) => mergeGeometries(arr, false);
  return mergeGeometries([groupMerge(parts.suit), groupMerge(parts.leather), groupMerge(parts.skin)], true);
}

let sharedEnv = null;
function envFor(game) {
  if (game.scene.environment) return null;
  if (!sharedEnv) {
    const pm = new THREE.PMREMGenerator(game.renderer);
    sharedEnv = pm.fromScene(new RoomEnvironment(), 0.04).texture; pm.dispose();
  }
  return sharedEnv;
}

export function makeMaterials(game, tint = {}) {
  const T = getHunterTextures(), env = envFor(game);
  const M = (set, o = {}) => new THREE.MeshStandardMaterial({ map: set.map, normalMap: set.normalMap, roughnessMap: set.roughnessMap, metalnessMap: set.metalnessMap, roughness: 1, metalness: 1, envMap: env, envMapIntensity: 0.7, ...o });
  return {
    suit: M(tint.suit ? T.clothLight : T.cloth, { color: tint.suit ?? 0xffffff, metalness: 0 }), cloth: M(tint.cloth ? T.clothLight : T.tabard, { color: tint.cloth ?? 0xffffff, metalness: 0, side: THREE.DoubleSide }),
    clothDark: M(tint.mantle ? T.clothLight : T.tabard, { metalness: 0, side: THREE.DoubleSide, color: tint.mantle ?? 0x7a6a66 }),
    leather: M(T.leather, { metalness: 0 }), leatherDark: M(T.leatherDark, { metalness: 0 }),
    steel: M(T.steel, { color: tint.steel ?? 0xffffff }), darkSteel: M(T.darkSteel, { color: tint.steel ?? 0xffffff }), brass: M(T.brass, { color: tint.trim ?? 0xffffff }),
    bone: M(T.bone, { metalness: 0 }), blade: M(T.blade, { envMapIntensity: 1.0 }),
    skin: new THREE.MeshStandardMaterial({ color: 0xb98466, roughness: 0.6, metalness: 0 }),
    eye: new THREE.MeshStandardMaterial({ color: 0x050403, roughness: 0.3, metalness: 0, emissive: 0x000000 }),
    eyeGlow: new THREE.MeshStandardMaterial({ color: 0x000000, emissive: tint.eye ?? 0xffa040, emissiveIntensity: 1.6, roughness: 1, metalness: 0 }),
    plume: M(tint.plume ? T.clothLight : T.tabard, { color: tint.plume ?? 0xffffff, metalness: 0 }),
    suitTint: null,
  };
}

// Partial ellipsoid shell
const shell = (rx, ry, rz, phiS, phiL, thS, thL, ws = 16, hs = 8) => { const g = new THREE.SphereGeometry(1, ws, hs, phiS, phiL, thS, thL); g.scale(rx, ry, rz); return g; };
const ring = (rx, rz, tube, seg = 24) => { const g = new THREE.TorusGeometry(1, tube, 5, seg); g.rotateX(Math.PI / 2); g.scale(rx, 1, rz); return g; };
// open curved band (plate) segment of a cylinder around Y
const band = (r, h, arcS, arcL, top = 1, bot = 1) => { const g = new THREE.CylinderGeometry(r * top, r * bot, h, 18, 1, true, arcS, arcL); return g; };

export function buildHunter(game, tint = {}) {
  const mats = makeMaterials(game, tint);
  const bones = {}, list = [];
  for (const [name, parent, p] of BONE_DEFS) {
    const b = new THREE.Bone(); b.name = name; const pp = parent ? BIND[parent] : new THREE.Vector3();
    b.position.set(p[0] - pp.x, p[1] - pp.y, p[2] - pp.z); bones[name] = b; list.push(b); if (parent) bones[parent].add(b);
  }
  const geo = buildBodyGeometry();
  const body = new THREE.SkinnedMesh(geo, [mats.suit, mats.leather, mats.skin]);
  body.castShadow = true; body.receiveShadow = true; body.frustumCulled = false;
  const root = new THREE.Group(); root.name = 'Hunter';
  body.add(bones.root); root.add(body); root.updateMatrixWorld(true);
  body.bind(new THREE.Skeleton(list));

  const attach = (bone, geom, mat, wp, rot = [0, 0, 0], scl) => {
    const m = new THREE.Mesh(geom, mat); const bp = BIND[bone];
    m.position.set(wp[0] - bp.x, wp[1] - bp.y, wp[2] - bp.z); m.rotation.set(...rot); if (scl) m.scale.set(...scl);
    m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; bones[bone].add(m); return m;
  };
  // armour plate band with rolled (bevelled) edges: rims catch light like a real turned edge
  const plate = (bone, r, h, aS, aL, top, bot, mat, wp, rot = [0, 0, 0], rimMat = mats.steel) => {
    attach(bone, band(r, h, aS, aL, top, bot), mat, wp, rot);
    for (const [yy, k] of [[h / 2, top], [-h / 2, bot]]) {
      const g = new THREE.TorusGeometry(r * k, 0.0065, 5, 28, aL); g.rotateX(Math.PI / 2); g.rotateY(-(Math.PI / 2 - aS - aL)); g.translate(0, yy, 0);
      attach(bone, g, rimMat, wp, rot);
    }
  };
  const rivets = (bone, pts) => { const g = new THREE.SphereGeometry(0.008, 6, 4); pts.forEach((p) => attach(bone, g, mats.brass, p)); };

  // ---- torso armor ----
  attach('chest', shell(0.205, 0.2, 0.15, 0, Math.PI * 2, 0.5, 1.9, 20, 10), mats.steel, [0, 1.335, 0.005]); // cuirass
  attach('chest', ring(0.19, 0.142, 0.012), mats.brass, [0, 1.235, 0.005]);
  attach('chest', ring(0.176, 0.128, 0.011), mats.brass, [0, 1.47, 0.0]);
  attach('chest', new THREE.BoxGeometry(0.03, 0.2, 0.03), mats.darkSteel, [0, 1.35, 0.15], [0.12, 0, Math.PI / 4]); // keel ridge
  attach('chest', shell(0.1, 0.07, 0.04, 0, Math.PI * 2, 0, Math.PI), mats.darkSteel, [0.085, 1.38, 0.125], [0.1, 0.45, 0.1]); // pectoral boss L
  attach('chest', shell(0.1, 0.07, 0.04, 0, Math.PI * 2, 0, Math.PI), mats.darkSteel, [-0.085, 1.38, 0.125], [0.1, -0.45, -0.1]);
  attach('chest', ring(0.085, 0.085, 0.022, 16), mats.leatherDark, [0, 1.5, -0.01]); // gorget pad
  attach('chest', band(0.095, 0.07, 0, Math.PI * 2, 0.8, 1.1), mats.darkSteel, [0, 1.51, -0.005]); // gorget
  attach('chest', ring(0.075, 0.075, 0.008, 16), mats.brass, [0, 1.545, -0.005]);
  rivets('chest', [[0.13, 1.25, 0.12], [-0.13, 1.25, 0.12], [0.06, 1.24, 0.15], [-0.06, 1.24, 0.15]]);
  // straps crossing the back for the weapon harness
  attach('chest', new THREE.BoxGeometry(0.05, 0.42, 0.012), mats.leatherDark, [0, 1.33, -0.162], [0.15, 0, 0.6]);
  attach('chest', new THREE.BoxGeometry(0.05, 0.42, 0.012), mats.leatherDark, [0, 1.33, 0.165], [-0.25, 0, -0.6]);
  attach('chest', new THREE.TorusGeometry(0.03, 0.007, 5, 10), mats.brass, [0, 1.34, -0.17]);
  // faulds on spine
  plate('spine', 0.168, 0.07, 0, Math.PI * 2, 0.97, 1.04, mats.steel, [0, 1.17, 0.0]);
  plate('spine', 0.172, 0.07, 0, Math.PI * 2, 0.97, 1.05, mats.darkSteel, [0, 1.11, 0.0]);
  // belt + buckle + pouches on hips
  attach('hips', band(0.178, 0.065, 0, Math.PI * 2, 1, 1.02), mats.leatherDark, [0, 1.01, -0.005]);
  attach('hips', new THREE.BoxGeometry(0.08, 0.07, 0.025), mats.brass, [0, 1.01, 0.175]);
  attach('hips', new THREE.BoxGeometry(0.05, 0.04, 0.03), mats.leatherDark, [0, 1.01, 0.188]);
  const pouch = new THREE.BoxGeometry(0.08, 0.1, 0.05); pouch.translate(0, -0.03, 0);
  attach('hips', pouch, mats.leather, [0.16, 0.98, 0.07], [0, 0.9, 0.1]);
  attach('hips', pouch, mats.leather, [-0.14, 0.98, -0.11], [0, -2.4, 0]);
  attach('hips', new THREE.CylinderGeometry(0.03, 0.03, 0.12, 8), mats.leather, [-0.17, 0.97, 0.06], [0, 0, 0.1]); // flask holster
  attach('hips', new THREE.CylinderGeometry(0.022, 0.026, 0.06, 8), new THREE.MeshStandardMaterial({ color: 0x40c0a0, roughness: 0.1, transparent: true, opacity: 0.85, emissive: 0x0b3a30 }), [-0.17, 1.05, 0.06]);

  // ---- arms ----
  for (const s of [1, -1]) {
    const L = s > 0 ? 'L' : 'R', x = 0.2 * s;
    // big layered pauldron on clavicle + lames on upper arm
    attach('shoulder' + L, shell(0.14, 0.12, 0.135, 0, Math.PI * 2, 0, 1.35, 18, 8), mats.steel, [0.215 * s, 1.44, -0.02], [0, 0, -0.38 * s]);
    attach('shoulder' + L, ring(0.128, 0.122, 0.011), mats.brass, [0.245 * s, 1.415, -0.02], [0, 0, -0.38 * s]);
    attach('shoulder' + L, new THREE.ConeGeometry(0.02, 0.07, 6), mats.bone, [0.24 * s, 1.56, -0.03], [0, 0, -0.5 * s]);
    plate('upperArm' + L, 0.082, 0.06, 0, Math.PI * 2, 0.95, 1.08, mats.darkSteel, [x + 0.012 * s, 1.35, -0.02], [0, 0, -0.2 * s]);
    plate('upperArm' + L, 0.074, 0.055, 0, Math.PI * 2, 0.95, 1.06, mats.steel, [x + 0.006 * s, 1.29, -0.02], [0, 0, -0.12 * s]);
    // elbow cop + bracer + gauntlet
    attach('foreArm' + L, shell(0.05, 0.045, 0.05, 0, Math.PI * 2, 0, 1.6, 10, 6), mats.steel, [x, 1.14, -0.055], [-1.4, 0, 0]);
    attach('foreArm' + L, band(0.05, 0.17, 0, Math.PI * 2, 1.12, 0.86), mats.leather, [x, 1.0, -0.018]);
    attach('foreArm' + L, band(0.056, 0.15, Math.PI * (s > 0 ? 0.15 : 0.85) , Math.PI, 1.1, 0.88), mats.steel, [x, 1.0, -0.018]);
    for (let i = 0; i < 3; i++) attach('foreArm' + L, ring(0.052 - i * 0.003, 0.052 - i * 0.003, 0.005, 14), mats.brass, [x, 1.06 - i * 0.06, -0.018]);
    attach('hand' + L, band(0.05, 0.07, 0, Math.PI * 2, 1.0, 1.25), mats.darkSteel, [x, 0.875, -0.016]);
    attach('hand' + L, new THREE.BoxGeometry(0.035, 0.09, 0.075), mats.darkSteel, [x + 0.012 * s, 0.81, -0.01], [0, 0, 0.05 * s]);
    attach('hand' + L, new THREE.BoxGeometry(0.06, 0.03, 0.09), mats.leatherDark, [x, 0.745, -0.005]);
    // ---- legs ----
    // tassets hang from belt but follow thigh
    plate('thigh' + L, 0.135, 0.13, s > 0 ? 0.0 : Math.PI * 0.5 - 0.0, Math.PI * 0.85, 0.95, 1.15, mats.steel, [0.06 * s, 0.9, 0.01], [0, s > 0 ? -0.35 : -0.9, 0]);
    plate('thigh' + L, 0.145, 0.11, s > 0 ? 0.0 : Math.PI * 0.5, Math.PI * 0.85, 0.95, 1.15, mats.darkSteel, [0.065 * s, 0.8, 0.012], [0, s > 0 ? -0.35 : -0.9, 0]);
    attach('thigh' + L, band(0.1, 0.05, 0, Math.PI * 2, 1, 1), mats.leatherDark, [0.1 * s, 0.62, 0.005]); // thigh strap
    attach('shin' + L, shell(0.06, 0.06, 0.05, 0, Math.PI * 2, 0, 1.7, 12, 6), mats.steel, [0.1 * s, 0.5, 0.05], [1.4, 0, 0]); // knee cop
    attach('shin' + L, shell(0.03, 0.04, 0.02, 0, Math.PI * 2, 0, Math.PI, 8, 6), mats.brass, [0.1 * s, 0.5, 0.1]);
    plate('shin' + L, 0.074, 0.3, -Math.PI * 0.45, Math.PI * 0.9, 1.0, 0.82, mats.steel, [0.1 * s, 0.3, 0.012]); // greave (front)
    attach('shin' + L, band(0.075, 0.025, 0, Math.PI * 2, 1, 1), mats.leatherDark, [0.1 * s, 0.4, 0.005]);
    attach('shin' + L, band(0.068, 0.025, 0, Math.PI * 2, 1, 1), mats.leatherDark, [0.1 * s, 0.2, 0.005]);
    attach('foot' + L, band(0.06, 0.08, 0, Math.PI * 2, 1.0, 1.12), mats.leatherDark, [0.1 * s, 0.12, -0.012]); // boot cuff
    attach('toe' + L, shell(0.05, 0.04, 0.07, 0, Math.PI * 2, 0, 1.6, 10, 6), mats.darkSteel, [0.1 * s, 0.04, 0.13], [Math.PI / 2 + 0.25, 0, 0]);
  }

  // ---- helmet ----
  attach('head', shell(0.122, 0.13, 0.138, 0, Math.PI * 2, 0, 1.62, 22, 10), mats.steel, [0, 1.69, -0.005]);
  attach('head', ring(0.124, 0.14, 0.012), mats.brass, [0, 1.705, -0.005]); // brow band
  plate('head', 0.12, 0.085, -Math.PI * 0.58, Math.PI * 1.16, 1.0, 0.86, mats.darkSteel, [0, 1.62, 0.012]); // face mask (front arc, eye slit above)
  attach('head', new THREE.BoxGeometry(0.012, 0.09, 0.02), mats.steel, [0, 1.625, 0.128]); // nasal ridge
  plate('head', 0.13, 0.08, Math.PI * 0.62, Math.PI * 0.76, 1.0, 1.3, mats.steel, [0, 1.62, -0.01]); // neck guard flare (back)
  for (const s of [1, -1]) attach('head', new THREE.CylinderGeometry(0.018, 0.018, 0.01, 8), mats.brass, [0.12 * s, 1.66, 0.01], [0, 0, Math.PI / 2]);
  attach('head', new THREE.BoxGeometry(0.02, 0.06, 0.24), mats.brass, [0, 1.815, -0.01]); // crest holder
  // breathing holes
  const hole = new THREE.CylinderGeometry(0.004, 0.004, 0.01, 4);
  for (let i = 0; i < 4; i++) for (const s of [1, -1]) attach('head', hole, mats.eye, [0.035 * s + 0.01 * s * i, 1.6 + 0.007 * i, 0.112 - 0.006 * i], [Math.PI / 2, 0, 0]);
  attach('head', shell(0.075, 0.03, 0.03, 0, Math.PI * 2, 0, Math.PI), mats.eye, [0, 1.677, 0.09]); // shadow inside eye slit
  { // visor detail: brass-lipped eye slit, breathing grille, faint eye glints
    const lip = new THREE.TorusGeometry(0.123, 0.007, 5, 24, Math.PI * 0.7); lip.rotateX(Math.PI / 2); lip.rotateY(-Math.PI * 0.15); lip.translate(0, 1.692 - BIND.head.y, 0.004);
    attach('head', lip, mats.brass, [0, BIND.head.y, 0]);
    const lip2 = lip.clone(); lip2.translate(0, -0.03, 0.001); attach('head', lip2, mats.steel, [0, BIND.head.y, 0]);
    const bar = new THREE.BoxGeometry(0.006, 0.05, 0.008);
    for (let i = -3; i <= 3; i++) { if (!i) continue; const a = i * 0.13; attach('head', bar, mats.brass, [Math.sin(a) * 0.123, 1.607, 0.012 + Math.cos(a) * 0.123], [0, a, 0]); }
    const glint = new THREE.SphereGeometry(0.008, 6, 4);
    for (const sx of [1, -1]) attach('head', glint, mats.eyeGlow, [0.032 * sx, 1.676, 0.1]);
    attach('head', new THREE.ConeGeometry(0.012, 0.035, 6), mats.brass, [0, 1.715, 0.135], [Math.PI / 2 + 0.3, 0, 0]); // brow spike
  }
  // horsehair plume
  const plumePts = [[0, 1.83, 0.09], [0, 1.87, -0.02], [0, 1.83, -0.15], [0, 1.68, -0.26], [0, 1.5, -0.3]].map((p) => new THREE.Vector3(p[0], p[1] - BIND.head.y, p[2]));
  const plume = new THREE.Mesh(sweep(plumePts, (t) => 0.05 * (1 - t * 0.55) * (0.55 + Math.sin(Math.min(1, t * 4) * Math.PI / 2) * 0.45), 8, 28), mats.plume);
  plume.scale.set(0.45, 1, 1); plume.castShadow = true; plume.frustumCulled = false; bones.head.add(plume);

  // ---- weapon & sockets ----
  const weapon = buildWeapon(mats);
  const sockets = {
    hand: { pos: new THREE.Vector3(0.0, -0.085, 0.012), quat: new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)) },
    back: { pos: new THREE.Vector3(...BACK_SOCKET.g), quat: basisQuat(new THREE.Vector3(...BACK_SOCKET.b), new THREE.Vector3(...BACK_SOCKET.e)) },
  };
  bones.chest.add(weapon); weapon.position.copy(sockets.back.pos); weapon.quaternion.copy(sockets.back.quat);
  const harness = [];
  { // back harness: scabbard throat + two leather straps that hold the blade (chest-bone space)
    const bq = sockets.back.quat, bd = new THREE.Vector3(0, 1, 0).applyQuaternion(bq);
    for (const [d, len, mat] of [[0.24, 0.1, mats.darkSteel], [0.62, 0.05, mats.leatherDark], [1.1, 0.05, mats.leatherDark]]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.045, len, 0.36), mat);
      m.position.copy(sockets.back.pos).addScaledVector(bd, d); m.quaternion.copy(bq); m.position.addScaledVector(new THREE.Vector3(0, 0, 1).applyQuaternion(bq), 0.06);
      m.castShadow = true; bones.chest.add(m); harness.push(m);
    }
  }

  // potion flask (item use)
  const flask = new THREE.Group();
  const fl = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), new THREE.MeshStandardMaterial({ color: 0x40d0a8, roughness: 0.08, transparent: true, opacity: 0.85, emissive: 0x0d4a3a }));
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.05, 8), mats.leather); neck.position.y = 0.05; flask.add(fl, neck); flask.visible = false;
  flask.position.set(0, -0.09, 0.03); bones.handR.add(flask);
  const whet = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.025, 0.12), mats.darkSteel); whet.position.set(0, -0.09, 0.03); whet.visible = false; bones.handL.add(whet);

  // Merge static rigid attachments per (parent, material) to keep draw calls low (~150 -> ~45).
  for (const b of Object.values(bones)) mergeChildren(b, [flask, whet, ...harness]);
  mergeChildren(weapon, weapon.userData.glow);
  root.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
  return { root, body, bones, mats, weapon, sockets, flask, whet, harness, BIND };
}

// Orthonormal basis quaternion: local +Y → b (blade direction), local +Z → e (edge direction, orthogonalised).
const _m = new THREE.Matrix4(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
export function basisQuat(b, e, out = new THREE.Quaternion()) {
  _y.copy(b).normalize(); _z.copy(e).addScaledVector(_y, -e.dot(_y));
  if (_z.lengthSq() < 1e-6) _z.set(0, 0, 1).addScaledVector(_y, -_y.z);
  _z.normalize(); _x.crossVectors(_y, _z).normalize();
  _m.makeBasis(_x, _y, _z); return out.setFromRotationMatrix(_m);
}

function mergeChildren(parent, keep = []) {
  const groups = new Map();
  for (const c of [...parent.children]) {
    if (!c.isMesh || c.isSkinnedMesh || keep.includes(c) || c.children.length) continue;
    if (!groups.has(c.material)) groups.set(c.material, []);
    groups.get(c.material).push(c);
  }
  for (const [mat, list] of groups) {
    if (list.length < 2) continue;
    const geos = list.map((m) => {
      m.updateMatrix(); let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      return g.applyMatrix4(m.matrix);
    });
    const merged = mergeGeometries(geos, false); if (!merged) continue;
    list.forEach((m) => parent.remove(m));
    const mesh = new THREE.Mesh(merged, mat); mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false; parent.add(mesh);
  }
}
