// Townsfolk: one InstancedMesh of a modular low-poly humanoid, posed entirely in the vertex shader
// (walk cycle, hammering, carrying, stirring, gesturing, idle look-around). Outfits are per-instance bitmasks.
import * as THREE from 'three';
import { mulberry32 } from '../world/noise.js';

// outfit bits
export const OUT = { hat: 1, robe: 2, crate: 3, hammer: 4, apron: 5, cap: 6, helmet: 7, spear: 8, pack: 9, beard: 10, chat: 11, cape: 12, coat: 13 };
const B = (...k) => k.reduce((s, n) => s | (1 << OUT[n]), 0);
// modes: 0 walk/idle, 1 hammer, 2 carry, 3 stir, 4 talk, 5 guard-idle
function humanoid() {
  const P = [], N = [], part = [], reg = [], mask = [];
  const _m = new THREE.Matrix4(), _n = new THREE.Matrix3(), v = new THREE.Vector3();
  function add(g, m, pt, rg, mk = 0) {
    const gg = g.index ? g.toNonIndexed() : g; gg.computeVertexNormals(); _n.getNormalMatrix(m);
    const p = gg.attributes.position, n = gg.attributes.normal;
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(m); P.push(v.x, v.y, v.z); v.fromBufferAttribute(n, i).applyMatrix3(_n).normalize(); N.push(v.x, v.y, v.z); part.push(pt); reg.push(rg); mask.push(mk); }
  }
  const M = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => _m.clone().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
  const cyl = (rt, rb, h, s = 7, open = false) => new THREE.CylinderGeometry(rt, rb, h, s, 1, open);
  for (const s of [-1, 1]) {
    const pt = s < 0 ? 1 : 2;
    add(new THREE.BoxGeometry(0.13, 0.12, 0.25), M(s * 0.1, 0.06, 0.03), pt, 3);
    add(cyl(0.075, 0.058, 0.84), M(s * 0.1, 0.52, 0), pt, 2);
  }
  add(cyl(0.17, 0.15, 0.22, 9), M(0, 0.93, 0), 0, 2);
  const lathe = new THREE.LatheGeometry([[0.15, 0.95], [0.17, 1.1], [0.205, 1.3], [0.2, 1.42], [0.09, 1.5]].map(([r, y]) => new THREE.Vector2(r, y)), 8);
  add(lathe, M(0, 0, 0, 0, 0, 0, 1, 1, 0.72), 0, 1);
  add(new THREE.TorusGeometry(0.165, 0.028, 3, 8), M(0, 0.99, 0, Math.PI / 2, 0, 0, 1, 0.75, 1), 0, 3);
  add(cyl(0.05, 0.055, 0.12, 6), M(0, 1.52, 0), 7, 0);
  add(new THREE.SphereGeometry(0.115, 8, 6), M(0, 1.655, 0.005, 0, 0, 0, 0.9, 1.06, 0.95), 7, 0);
  for (const s of [-1, 1]) add(new THREE.SphereGeometry(0.017, 4, 3), M(s * 0.038, 1.67, 0.1), 7, 8);
  add(new THREE.ConeGeometry(0.022, 0.055, 4), M(0, 1.64, 0.118, Math.PI / 2), 7, 0);
  add(new THREE.SphereGeometry(0.124, 8, 4, 0, Math.PI * 2, 0, Math.PI * 0.56), M(0, 1.672, -0.012, -0.25), 7, 4);
  for (const s of [-1, 1]) {
    const pt = s < 0 ? 3 : 4;
    add(cyl(0.058, 0.05, 0.32), M(s * 0.225, 1.27, 0), pt, 1);
    add(cyl(0.047, 0.04, 0.27), M(s * 0.23, 0.99, 0.0), pt, 1);
    add(new THREE.SphereGeometry(0.05, 5, 3), M(s * 0.23, 0.83, 0.01), pt, 0);
    add(new THREE.SphereGeometry(0.07, 5, 3), M(s * 0.2, 1.42, 0, 0, 0, 0, 1, 0.8, 1), pt, 1);
  }
  // optional outfit pieces
  add(cyl(0.27, 0.27, 0.025, 9), M(0, 1.76, 0), 7, 5, OUT.hat); add(cyl(0.12, 0.135, 0.13, 10), M(0, 1.83, 0), 7, 5, OUT.hat);
  add(cyl(0.18, 0.32, 0.78, 10, true), M(0, 0.57, 0), 0, 2, OUT.robe);
  add(new THREE.BoxGeometry(0.46, 0.38, 0.4), M(0, 1.16, 0.34), 0, 6, OUT.crate);
  add(cyl(0.02, 0.02, 0.42, 5), M(0.23, 0.82, 0.2, Math.PI / 2), 4, 6, OUT.hammer); add(new THREE.BoxGeometry(0.07, 0.17, 0.11), M(0.23, 0.82, 0.4), 4, 7, OUT.hammer);
  add(new THREE.BoxGeometry(0.34, 0.72, 0.03), M(0, 0.92, 0.158), 0, 5, OUT.apron);
  add(new THREE.SphereGeometry(0.13, 8, 3, 0, Math.PI * 2, 0, Math.PI * 0.5), M(0, 1.69, 0, -0.15), 7, 5, OUT.cap); add(new THREE.BoxGeometry(0.2, 0.02, 0.12), M(0, 1.71, 0.13), 7, 5, OUT.cap);
  add(new THREE.SphereGeometry(0.14, 8, 3, 0, Math.PI * 2, 0, Math.PI * 0.5), M(0, 1.68, 0), 7, 7, OUT.helmet); add(new THREE.TorusGeometry(0.15, 0.02, 4, 12), M(0, 1.69, 0, Math.PI / 2), 7, 7, OUT.helmet);
  add(cyl(0.018, 0.018, 2.2, 5), M(0.23, 1.05, 0.06), 4, 6, OUT.spear); add(new THREE.ConeGeometry(0.04, 0.22, 5), M(0.23, 2.25, 0.06), 4, 7, OUT.spear);
  add(new THREE.BoxGeometry(0.32, 0.4, 0.2), M(0, 1.18, -0.21), 0, 3, OUT.pack); add(cyl(0.07, 0.07, 0.36, 7), M(0, 1.42, -0.22, 0, 0, Math.PI / 2), 0, 5, OUT.pack);
  add(new THREE.SphereGeometry(0.085, 6, 4), M(0, 1.575, 0.07, 0, 0, 0, 1, 1.2, 0.8), 7, 4, OUT.beard);
  add(new THREE.BoxGeometry(0.4, 0.82, 0.03), M(0, 1.04, -0.16, 0.08), 0, 5, OUT.cape);
  add(cyl(0.2, 0.27, 0.5, 10, true), M(0, 0.74, 0), 0, 1, OUT.coat);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(part, 1)); g.setAttribute('aReg', new THREE.Float32BufferAttribute(reg, 1)); g.setAttribute('aMask', new THREE.Float32BufferAttribute(mask, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 300);
  return g;
}

const POSE = `
attribute float aPart, aReg, aMask; attribute vec4 iAnim; attribute vec3 iC1, iC2, iC3; attribute vec4 iMisc;
mat3 npcRX(float a){ float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
mat3 npcRY(float a){ float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
mat3 npcRZ(float a){ float c = cos(a), s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }
bool npcHidden(){ int bits = int(iMisc.z + 0.5); int m = int(aMask + 0.5); return m > 0 && ((bits >> m) & 1) == 0; }
// returns rotation for this vertex's part and writes pivot/offset
mat3 npcRot(out vec3 piv, out vec3 off){
  int bits = int(iMisc.z + 0.5); float robe = float((bits >> 2) & 1) + float((bits >> 13) & 1) * 0.5;
  float ph = iAnim.x, amt = iAnim.y, mode = iAnim.z, tt = iAnim.w;
  float sw = sin(ph) * amt * mix(0.6, 0.3, clamp(robe, 0.0, 1.0));
  off = vec3(0.0, abs(cos(ph)) * 0.045 * amt + sin(tt * 2.1) * 0.006, 0.0); piv = vec3(0.0);
  int part = int(aPart + 0.5);
  if (part == 1) { piv = vec3(0.1, 0.93, 0.0); return npcRX(-sw); }
  if (part == 2) { piv = vec3(-0.1, 0.93, 0.0); return npcRX(sw); }
  if (part == 7) { piv = vec3(0.0, 1.5, 0.0); float look = (1.0 - amt) * sin(tt * 0.37 + iMisc.w * 20.0) * 0.5; return npcRY(look) * npcRX(mode > 3.5 && mode < 4.5 ? sin(tt * 2.3) * 0.08 : 0.0); }
  if (part == 3 || part == 4) {
    float s = part == 3 ? -1.0 : 1.0; piv = vec3(0.21 * s, 1.42, 0.0);
    float a = sw * 0.9 * -s, z = 0.08 * s + sin(tt * 1.3 + s) * 0.02;
    if (mode > 0.5 && mode < 1.5 && part == 4) { float c = fract(tt * 0.8); float up = smoothstep(0.0, 0.6, c) * (1.0 - smoothstep(0.6, 0.7, c)); a = -(0.95 + 1.75 * up); z = 0.15; }
    if (mode > 0.5 && mode < 1.5 && part == 3) { a = -0.7; z = -0.25; }
    if (mode > 1.5 && mode < 2.5) { a = -1.2; z = -0.18 * s; }
    if (mode > 2.5 && mode < 3.5 && part == 4) { a = -1.05 + 0.15 * sin(tt * 3.0); z = 0.35 + 0.25 * cos(tt * 3.0); }
    if (mode > 3.5 && mode < 4.5) { if (part == 4) { a = -0.55 - 0.35 * sin(tt * 1.7) * sin(tt * 0.6); z = 0.3; } else { a = -0.15 - 0.2 * max(0.0, sin(tt * 0.9 + 1.0)); } }
    if (mode > 4.5 && part == 4) { a = -0.25; z = 0.05; }
    return npcRX(a) * npcRZ(z);
  }
  // torso parts: slight forward lean when walking
  piv = vec3(0.0, 0.93, 0.0); return npcRX(0.06 * amt + (mode > 1.5 && mode < 2.5 ? -0.08 : 0.0));
}`;

export function createNpcs(game, ctx) {
  const { scene, camera } = game, { getHeight, walkable, low, colliders, spots, sparks, anvilTop } = ctx;
  const rnd = mulberry32(606);
  const geo = humanoid();
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.78, metalness: 0.0 });
  const inject = (sh, depth) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\n${POSE}\nvarying vec3 vNpcCol;`);
    if (!depth) sh.vertexShader = sh.vertexShader.replace('#include <beginnormal_vertex>', `vec3 objectNormal = normal; { vec3 pv, of; mat3 R = npcRot(pv, of); objectNormal = R * normal; }`);
    sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `vec3 transformed = position; { vec3 pv, of; mat3 R = npcRot(pv, of); transformed = pv + R * (position - pv) + of; if (npcHidden()) transformed = vec3(0.0, 1.0, 0.0);
  int rg = int(aReg + 0.5);
  vec3 skin = mix(vec3(0.75, 0.47, 0.33), vec3(0.20, 0.10, 0.06), iMisc.x);
  vec3 hair = mix(vec3(0.015, 0.012, 0.01), vec3(0.5, 0.3, 0.12), iMisc.y);
  vNpcCol = rg == 0 ? skin : rg == 1 ? iC1 : rg == 2 ? iC2 : rg == 3 ? vec3(0.09, 0.05, 0.03) : rg == 4 ? hair : rg == 5 ? iC3 : rg == 6 ? vec3(0.32, 0.2, 0.11) : rg == 7 ? vec3(0.55, 0.56, 0.6) : vec3(0.01); }`);
    if (!depth) sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vNpcCol;').replace('#include <color_fragment>', 'diffuseColor.rgb *= vNpcCol;');
  };
  mat.onBeforeCompile = (sh) => inject(sh, false); mat.customProgramCacheKey = () => 'town-npc';
  const dmat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  dmat.onBeforeCompile = (sh) => inject(sh, true); dmat.customProgramCacheKey = () => 'town-npc-depth';

  // ---------- population ----------
  const L = (hex) => new THREE.Color(hex);
  const cloth = [0x7a3a2c, 0x2f5a7a, 0x4a6a3a, 0x8a6a3a, 0x5a3a6a, 0xa08a6a, 0x3a3a4a, 0x9a4a3a, 0x2a6a6a, 0xc0a878];
  const pants = [0x3a3028, 0x2a2a30, 0x4a3a2a, 0x5a5048, 0x2a3a4a];
  const agents = [];
  const mk = (o) => { const a = { x: 0, z: 0, ry: 0, mode: 0, bits: 0, scale: 1, ph: rnd() * 6, tt: rnd() * 10, amt: 0, speed: 1.2 + rnd() * 0.4, state: 'idle', wait: rnd() * 3, tx: 0, tz: 0, c1: L(cloth[Math.floor(rnd() * cloth.length)]), c2: L(pants[Math.floor(rnd() * pants.length)]), c3: L(cloth[Math.floor(rnd() * cloth.length)]), skin: rnd() * 0.85, hair: rnd(), ...o }; agents.push(a); return a; };
  // key NPCs (static, working)
  const key = {
    quest: mk({ bits: B('robe', 'cape'), mode: 4, c1: L(0x1f3f78), c2: L(0x1a2a48), c3: L(0xc8a048), hair: 0.85, skin: 0.2 }),
    smith: mk({ bits: B('apron', 'hammer', 'beard'), mode: 1, c1: L(0x6a4a3a), c2: L(0x2a2420), c3: L(0x3a2a20), scale: 1.08, skin: 0.35, hair: 0.1 }),
    alchemy: mk({ bits: B('robe', 'cap'), mode: 3, c1: L(0x4a2a6a), c2: L(0x3a1f4a), c3: L(0x2a8a7a), hair: 0.95, skin: 0.1 }),
    shop: mk({ bits: B('apron', 'hat'), mode: 4, c1: L(0xb87a3a), c2: L(0x4a3a2a), c3: L(0xd8c890), skin: 0.5 }),
    storage: mk({ bits: B('cap', 'beard'), mode: 4, c1: L(0x5a6a3a), c2: L(0x3a3028), c3: L(0x7a5a3a), skin: 0.65, hair: 0.3 }),
    dock: mk({ bits: B('hat', 'coat', 'beard'), mode: 4, c1: L(0x1a2a4a), c2: L(0x2a2a30), c3: L(0x101418), scale: 1.05, skin: 0.3, hair: 0.05 }),
  };
  const objects = {};
  for (const [id, a] of Object.entries(key)) {
    const [x, z, ry] = spots[id].npc; Object.assign(a, { x, z, ry, fixed: true, state: 'work', amt: 0 });
    const o = new THREE.Object3D(); o.name = 'npc-' + id; o.position.set(x, getHeight(x, z), z); o.rotation.y = ry; scene.add(o); objects[id] = o; a.obj = o;
  }
  // ambient: wanderers per district, chatting pairs, guards, dock workers, fishers, kids
  const zones = { plaza: [0, 0, 14], market: [40, -14, 12], quay: [-10, -37, 26], dockyard: [-34, -18, 8], r1: [34, 40, 14], r2: [-36, 38, 13], forge: [24, 9, 5], alch: [-28, 4, 3.5], pier: [0, -62, 14] };
  const ambient = low ? 16 : 30;
  const plan = [['plaza', 6], ['market', 4], ['quay', 5], ['r1', 3], ['r2', 3], ['dockyard', 1], ['pier', 2], ['forge', 1], ['alch', 1]];
  for (const [zn, n] of plan) for (let i = 0; i < Math.round(n * ambient / 26); i++) {
    const r = rnd(); const kid = r < 0.12;
    mk({ zone: zn, bits: kid ? 0 : r < 0.3 ? B('hat') : r < 0.45 ? B('robe') : r < 0.55 ? B('pack', 'cape') : r < 0.65 ? B('cap') : r < 0.7 ? B('beard', 'cap') : r < 0.78 ? B('coat') : 0, scale: kid ? 0.62 : 0.93 + rnd() * 0.13, speed: kid ? 1.9 : 1.1 + rnd() * 0.5 });
  }
  const pairs = [[[6, -8], [7.2, -6.9]], [[35.5, -5], [36.4, -6.2]], [[-15, -40.5], [-13.8, -41.2]], [[26.5, 41], [27.6, 42]], [[-26, 36], [-27, 37]]];
  for (const [[ax, az], [bx, bz]] of pairs.slice(0, low ? 2 : 5)) {
    const ry = Math.atan2(bx - ax, bz - az);
    mk({ x: ax, z: az, ry, fixed: true, state: 'work', mode: 4, bits: B('hat') * (rnd() < 0.5 ? 1 : 0) });
    mk({ x: bx, z: bz, ry: ry + Math.PI, fixed: true, state: 'work', mode: 4, bits: rnd() < 0.5 ? B('robe') : 0, tt: 3 });
  }
  for (const [x, z, ry] of [[-35, -79, Math.PI], [26.5, -71, Math.PI], [9, -87, Math.PI]].slice(0, low ? 1 : 3)) mk({ x, z, ry, fixed: true, state: 'work', mode: 5, bits: B('hat', 'spear'), c3: L(0x8a7a50) });
  const guardRoutes = [[[0, -12], [0, -30], [-22, -36], [-40, -30], [-22, -36], [0, -30]], [[-14, 0], [-24, 4], [-30, 8], [-31, 18], [-36, 30], [-31, 18], [-30, 8], [-24, 4]], [[14, -8], [22, -8.5], [30, -10], [33, -22], [33, -32], [33, -22], [30, -10], [22, -8.5]]];
  for (const rt of guardRoutes.slice(0, low ? 1 : 3)) mk({ route: rt, ri: 0, x: rt[0][0], z: rt[0][1], bits: B('helmet', 'spear', 'cape'), c1: L(0x2a3a5a), c2: L(0x2a2a30), c3: L(0x1f3f78), speed: 1.15, scale: 1.04 });
  const workRoutes = [[[1.5, -58], [1.5, -47], [-6, -37], [-30, -37], [-37, -27]], [[26.5, -60], [26.5, -47], [10, -40], [-10, -40], [-30, -33], [-38, -22]]];
  for (const rt of workRoutes.slice(0, low ? 1 : 2)) mk({ route: rt, ri: 0, pick: rt[0], x: rt[0][0], z: rt[0][1], carrier: true, bits: B('cap'), c1: L(0x8a7a5a), speed: 1.0 });
  // route sanity (dev aid): every segment must be walkable with clearance
  const clear = (ax, az, bx, bz) => { const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / 0.5); for (let i = 0; i <= n; i++) { const t = i / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t; if (!walkable(x, z)) return false; } return true; };
  for (const a of agents) if (a.route) for (let i = 0; i < a.route.length - 1; i++) { const [p, q] = [a.route[i], a.route[i + 1]]; if (!clear(p[0], p[1], q[0], q[1])) console.warn('[town] npc route blocked', p, q); }
  // initial placement for wanderers
  function pickTarget(a) {
    const [cx, cz, r] = zones[a.zone];
    for (let k = 0; k < 14; k++) {
      const ang = rnd() * 6.28, rr = Math.sqrt(rnd()) * r, x = cx + Math.cos(ang) * rr, z = cz + Math.sin(ang) * rr;
      if (walkable(x, z) && walkable(x + 0.7, z) && walkable(x - 0.7, z) && walkable(x, z + 0.7) && walkable(x, z - 0.7) && clear(a.x, a.z, x, z)) { a.tx = x; a.tz = z; return true; }
    }
    return false;
  }
  for (const a of agents) if (a.zone) { const [cx, cz] = zones[a.zone]; a.x = cx; a.z = cz; for (let k = 0; k < 30; k++) { const x = cx + (rnd() - 0.5) * zones[a.zone][2] * 1.6, z = cz + (rnd() - 0.5) * zones[a.zone][2] * 1.6; if (walkable(x, z) && walkable(x + 0.8, z) && walkable(x - 0.8, z)) { a.x = x; a.z = z; break; } } a.ry = rnd() * 6.28; }

  // ---------- instancing ----------
  const n = agents.length;
  const mesh = new THREE.InstancedMesh(geo, mat, n); mesh.customDepthMaterial = dmat; mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false; mesh.name = 'townsfolk';
  const iAnim = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4).setUsage(THREE.DynamicDrawUsage);
  const iMisc = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4).setUsage(THREE.DynamicDrawUsage);
  const c1 = new Float32Array(n * 3), c2 = new Float32Array(n * 3), c3 = new Float32Array(n * 3);
  agents.forEach((a, i) => { a.c1.toArray(c1, i * 3); a.c2.toArray(c2, i * 3); a.c3.toArray(c3, i * 3); iMisc.setXYZW(i, a.skin, a.hair, a.bits, rnd()); a.col = { x: a.x, z: a.z, r: 0.38 }; colliders.push(a.col); });
  geo.setAttribute('iAnim', iAnim); geo.setAttribute('iMisc', iMisc);
  geo.setAttribute('iC1', new THREE.InstancedBufferAttribute(c1, 3)); geo.setAttribute('iC2', new THREE.InstancedBufferAttribute(c2, 3)); geo.setAttribute('iC3', new THREE.InstancedBufferAttribute(c3, 3));
  scene.add(mesh);

  const o3 = new THREE.Object3D();
  let lastCyc = 0;
  function update(dt) {
    const pl = game.player?.position;
    let miscDirty = false;
    agents.forEach((a, i) => {
      a.tt += dt;
      if (a.obj) { a.x = a.obj.position.x; a.z = a.obj.position.z; a.ry = a.obj.rotation.y; }
      if (!a.fixed) {
        const dp = pl ? Math.hypot(pl.x - a.x, pl.z - a.z) : 99;
        if (a.state === 'idle') {
          a.amt = Math.max(0, a.amt - dt * 4); a.wait -= dt;
          if (a.wait <= 0) {
            if (a.route) { a.ri = (a.ri + 1) % a.route.length; [a.tx, a.tz] = a.route[a.ri]; a.state = 'walk'; }
            else if (pickTarget(a)) a.state = 'walk'; else a.wait = 1;
          }
        } else if (a.state === 'walk') {
          const dx = a.tx - a.x, dz = a.tz - a.z, d = Math.hypot(dx, dz);
          // politely stop for the hunter when they block the way
          const ahead = pl && dp < 1.7 && ((pl.x - a.x) * dx + (pl.z - a.z) * dz) > 0;
          if (ahead) { a.amt = Math.max(0, a.amt - dt * 5); const want = Math.atan2(pl.x - a.x, pl.z - a.z); a.ry += Math.atan2(Math.sin(want - a.ry), Math.cos(want - a.ry)) * Math.min(1, dt * 4); a.blocked = (a.blocked || 0) + dt; if (a.blocked > 2.5 && !a.route) { a.blocked = 0; a.state = 'idle'; a.wait = 0.2; } }
          else if (d < 0.3) {
            a.state = 'idle'; a.blocked = 0;
            const end = a.route && (a.ri === 0 || a.ri === a.route.length - 1);
            a.wait = a.route ? (end ? 2.5 + rnd() * 2 : 0) : 2 + rnd() * 6;
            if (a.carrier && end) { const atPick = Math.hypot(a.x - a.pick[0], a.z - a.pick[1]) < 1; a.bits = atPick ? (a.bits | (1 << OUT.crate)) : (a.bits & ~(1 << OUT.crate)); miscDirty = true; iMisc.setZ(i, a.bits); }
            if (a.carrier && a.ri === a.route.length - 1) { a.route = a.route.slice().reverse(); a.ri = 0; }
          } else {
            a.blocked = 0; a.amt = Math.min(1, a.amt + dt * 3);
            const sp = a.speed * a.amt * (a.bits & (1 << OUT.crate) ? 0.8 : 1);
            a.x += dx / d * sp * dt; a.z += dz / d * sp * dt;
            const want = Math.atan2(dx, dz); a.ry += Math.atan2(Math.sin(want - a.ry), Math.cos(want - a.ry)) * Math.min(1, dt * 6);
            a.ph += sp / (1.45 * a.scale) * Math.PI * dt;
          }
        }
        a.mode = a.bits & (1 << OUT.crate) ? 2 : a.bits & (1 << OUT.spear) && a.state !== 'walk' ? 5 : 0;
        a.col.x = a.x; a.col.z = a.z;
      } else if (pl && a.mode !== 1) {
        // fixed NPCs glance towards a nearby hunter
        const dp = Math.hypot(pl.x - a.x, pl.z - a.z);
        if (dp < 6 && !a.obj) { const want = Math.atan2(pl.x - a.x, pl.z - a.z); a.ry += Math.atan2(Math.sin(want - a.ry), Math.cos(want - a.ry)) * Math.min(1, dt * 2); }
      }
      o3.position.set(a.x, getHeight(a.x, a.z), a.z); o3.rotation.set(0, a.ry, 0); o3.scale.setScalar(a.scale); o3.updateMatrix(); mesh.setMatrixAt(i, o3.matrix);
      iAnim.setXYZW(i, a.ph, a.amt, a.mode, a.tt);
    });
    // smith's strike → sparks on the anvil
    const s = key.smith, cyc = (s.tt * 0.8) % 1;
    if (lastCyc < 0.62 && cyc >= 0.62 && anvilTop && camera.position.distanceTo(anvilTop) < 70) sparks(anvilTop, 16);
    lastCyc = cyc;
    mesh.instanceMatrix.needsUpdate = true; iAnim.needsUpdate = true; if (miscDirty) iMisc.needsUpdate = true;
  }
  update(0);
  return { update, objects, mesh, count: n };
}
