// Volcanic props: several displaced rock generators (boulders, aa slabs, basalt column clusters, spires/stalactites,
// crystal & obsidian shards), charred trees and hardy scrub — all instanced with seeded rotation/scale/tint, plus
// per-field placement (including the boulder levee that keeps monsters out of the foothills lava river).
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeNoise2D, mulberry32, smoothstep, clamp } from './noise.js';
import { macroGLSL } from './volcanicTerrain.js';
import { VOLC_GLSL } from './volcanicTextures.js';

const v3 = (a) => `vec3(${a.map((x) => x.toFixed(4)).join(',')})`;

// ---------------- generators ----------------
function boulderGeo(THREE, seed, { flat = 0.7, detail = 2, facets = 3, lumpy = 0.35, layers = 0 } = {}) {
  const N = makeNoise2D(seed); const rnd = mulberry32(seed);
  const g = new THREE.IcosahedronGeometry(1, detail); const p = g.attributes.position; const t = new THREE.Vector3();
  const sx = 0.75 + rnd() * 0.6, sz = 0.75 + rnd() * 0.5;
  const pl = []; for (let i = 0; i < facets; i++) pl.push(new THREE.Vector3(rnd() - 0.5, rnd() * 0.8 - 0.2, rnd() - 0.5).normalize());
  for (let i = 0; i < p.count; i++) {
    t.set(p.getX(i), p.getY(i), p.getZ(i)); const { x, y, z } = t;
    const n = (N.noise(x * 1.3, y * 1.3 + z) + N.noise(y * 1.3 + 7, z * 1.3) + N.noise(z * 1.3 - 3, x * 1.3)) / 3;
    const fine = N.noise(x * 5 + y * 2, z * 5 - y * 3) * 0.05;
    t.multiplyScalar(1 + n * lumpy + fine);
    for (const q of pl) { const d = t.dot(q) - (0.55 + rnd() * 0.0); if (d > 0) t.addScaledVector(q, -d * 0.9); }
    t.x *= sx; t.z *= sz; t.y *= flat;
    if (layers) { const L = 1 / layers; const q = t.y / L; t.y = (Math.floor(q) + smoothstep(0.3, 0.7, q - Math.floor(q))) * L; }
    if (t.y < -0.2) t.y = -0.2 + (t.y + 0.2) * 0.3;
    p.setXYZ(i, t.x, t.y, t.z);
  }
  g.deleteAttribute('uv'); g.computeVertexNormals(); return g;
}
// Cluster of hexagonal basalt columns (columnar jointing). Heights in [h0, h1], unit-ish footprint radius.
function columnsGeo(THREE, seed, { n = 9, h0 = 0.4, h1 = 1.0, r = 0.16, spread = 0.55, lying = false } = {}) {
  const rnd = mulberry32(seed); const parts = [];
  for (let i = 0; i < n; i++) {
    const a = i === 0 ? 0 : rnd() * Math.PI * 2, d = i === 0 ? 0 : Math.sqrt(rnd()) * spread;
    const h = h0 + (h1 - h0) * Math.pow(rnd(), 0.8) * (1 - d * 0.6);
    const rr = r * (0.8 + rnd() * 0.4);
    const c = new THREE.CylinderGeometry(rr * 0.97, rr, h, 6, Math.max(1, Math.round(h * 3)), false);
    const p = c.attributes.position; const tilt = (rnd() - 0.5) * 0.4, tz = (rnd() - 0.5) * 0.4, bevel = rnd() * 0.35;
    for (let k = 0; k < p.count; k++) {
      let y = p.getY(k); const x = p.getX(k), z = p.getZ(k);
      if (y > h / 2 - 1e-4) y += (x * tilt + z * tz) * 1.0 - (Math.hypot(x, z) > rr * 0.9 ? 0 : 0) - bevel * rr * 0.3;
      // fracture bands
      const band = Math.sin(y * 9 + i) > 0.92 ? 0.94 : 1;
      p.setXYZ(k, x * band, y + h / 2, z * band);
    }
    c.rotateY(rnd() * 1.0);
    c.translate(Math.cos(a) * d, 0, Math.sin(a) * d);
    parts.push(c.toNonIndexed());
  }
  let g = mergeGeometries(parts.map((q) => { q.deleteAttribute('uv'); return q; }));
  if (lying) { g.rotateZ(Math.PI / 2); g.translate(0, r * 0.7, 0); }
  g.computeVertexNormals(); return g;
}
function spireGeo(THREE, seed, { rs = 9, hs = 14, taper = 0.12, bend = 0.15, ridges = 0.18 } = {}) {
  const N = makeNoise2D(seed); const rnd = mulberry32(seed);
  const g = new THREE.CylinderGeometry(taper, 1, 1, rs, hs, false); g.translate(0, 0.5, 0);
  const p = g.attributes.position; const bx = (rnd() - 0.5) * bend, bz = (rnd() - 0.5) * bend;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const a = Math.atan2(z, x);
    const k = 1 + ridges * (N.noise(Math.cos(a) * 2.5, y * 3) + 0.6 * N.noise(a * 3.2, y * 9 + 3)) + 0.12 * N.noise(a * 1.5 + 5, y * 1.5);
    const narrow = 1 - 0.18 * Math.sin(y * 7 + rnd() * 0.01);
    p.setXYZ(i, x * k * narrow + bx * y * y, y < 0.999 ? y : y - rnd() * 0.02, z * k * narrow + bz * y * y);
  }
  g.deleteAttribute('uv'); g.computeVertexNormals(); return g;
}
function crystalGeo(THREE, seed, { n = 7 } = {}) {
  const rnd = mulberry32(seed); const parts = [];
  for (let i = 0; i < n; i++) {
    const h = 0.5 + rnd() * 1.0, r = 0.08 + rnd() * 0.08;
    const body = new THREE.CylinderGeometry(r, r * 0.85, h, 6, 1); body.translate(0, h / 2, 0);
    const tip = new THREE.ConeGeometry(r, r * 2.6, 6); tip.translate(0, h + r * 1.3, 0);
    const c = mergeGeometries([body.toNonIndexed(), tip.toNonIndexed()].map((q) => { q.deleteAttribute('uv'); return q; }));
    c.rotateZ((rnd() - 0.5) * 1.1); c.rotateX((rnd() - 0.5) * 1.1); c.rotateY(rnd() * 6.28);
    c.translate((rnd() - 0.5) * 0.5, 0, (rnd() - 0.5) * 0.5); parts.push(c);
  }
  const g = mergeGeometries(parts); g.computeVertexNormals(); return g;
}
function treeGeo(THREE, seed) {
  const rnd = mulberry32(seed); const parts = []; const col = [];
  const trunk = (A, B, r0, r1) => {
    const d = new THREE.Vector3().subVectors(B, A); const L = d.length();
    const c = new THREE.CylinderGeometry(r1, r0, L, 6, 3); c.translate(0, L / 2, 0);
    const p = c.attributes.position; for (let k = 0; k < p.count; k++) { const y = p.getY(k) / L; p.setX(k, p.getX(k) * (1 + 0.15 * Math.sin(y * 12 + k))); }
    c.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())); c.translate(A.x, A.y, A.z);
    const q = c.toNonIndexed(); q.deleteAttribute('uv'); parts.push(q);
  };
  const H = 3 + rnd() * 3; const lean = new THREE.Vector3((rnd() - 0.5) * 0.6, 1, (rnd() - 0.5) * 0.6).normalize();
  const top = lean.clone().multiplyScalar(H);
  trunk(new THREE.Vector3(0, -0.3, 0), top, 0.22, 0.07);
  const nb = 3 + Math.floor(rnd() * 3);
  for (let i = 0; i < nb; i++) {
    const t = 0.45 + rnd() * 0.5; const A = lean.clone().multiplyScalar(H * t);
    const a = rnd() * Math.PI * 2, L = (1 - t * 0.5) * (1 + rnd()) * 1.1;
    const B = A.clone().add(new THREE.Vector3(Math.cos(a) * L, L * (0.3 + rnd() * 0.6), Math.sin(a) * L));
    trunk(A, B, 0.08 * (1 - t * 0.5), 0.015);
    if (rnd() < 0.6) { const C = B.clone().add(new THREE.Vector3(Math.cos(a + 0.8) * L * 0.5, L * 0.4, Math.sin(a + 0.8) * L * 0.5)); trunk(B, C, 0.02, 0.008); }
  }
  const g = mergeGeometries(parts); g.computeVertexNormals(); return g;
}
function scrubGeo(THREE, seed) {
  const rnd = mulberry32(seed); const parts = [];
  for (let i = 0; i < 9; i++) {
    const h = 0.25 + rnd() * 0.5; const c = new THREE.ConeGeometry(0.025, h, 3); c.translate(0, h / 2, 0);
    c.rotateZ((rnd() - 0.5) * 1.3); c.rotateX((rnd() - 0.5) * 1.3); c.translate((rnd() - 0.5) * 0.3, 0, (rnd() - 0.5) * 0.3);
    const q = c.toNonIndexed(); q.deleteAttribute('uv'); parts.push(q);
  }
  const b = new THREE.IcosahedronGeometry(0.2, 0); b.scale(1, 0.55, 1); const q = b.toNonIndexed(); q.deleteAttribute('uv'); parts.push(q);
  const g = mergeGeometries(parts); g.computeVertexNormals(); return g;
}

// ---------------- materials ----------------
function rockMaterial(THREE, F, tx, shared, { emissiveCracks = 0, ashTop = 1, name = 'rock', basaltScale = 0.35 } = {}) {
  const P = F.palette;
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, shadowSide: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, shared, { tBas: { value: tx.basalt }, tBasN: { value: tx.basaltN }, tAsh: { value: tx.ash } });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vRW; varying vec3 vRN; varying float vRY;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
{ mat4 m = modelMatrix;
  #ifdef USE_INSTANCING
  m = modelMatrix * instanceMatrix;
  #endif
  vRW = (m * vec4(transformed, 1.0)).xyz; vRN = normalize(mat3(m) * objectNormal); vRY = transformed.y; }`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vRW; varying vec3 vRN; varying float vRY; uniform sampler2D tBas, tBasN, tAsh; vec3 rockWN; vec3 rockEm;
${macroGLSL(F)}
${VOLC_GLSL}`)
      .replace('#include <map_fragment>', `{
  vec3 wn = normalize(vRN);
  vec3 bw = pow(abs(wn), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
  float s = ${basaltScale.toFixed(3)};
  vec2 ux = vRW.zy * s, uy = vRW.xz * s, uz = vRW.xy * s;
  vec4 c = texture2D(tBas, ux) * bw.x + texture2D(tBas, uy) * bw.y + texture2D(tBas, uz) * bw.z;
  vec4 c2 = texture2D(tBas, ux * 0.23) * bw.x + texture2D(tBas, uy * 0.23) * bw.y + texture2D(tBas, uz * 0.23) * bw.z;
  vec3 tnx = vtN(texture2D(tBasN, ux)), tny = vtN(texture2D(tBasN, uy)), tnz = vtN(texture2D(tBasN, uz));
  tnx = vec3(tnx.xy + wn.zy, abs(tnx.z) * wn.x); tny = vec3(tny.xy + wn.xz, abs(tny.z) * wn.y); tnz = vec3(tnz.xy + wn.xy, abs(tnz.z) * wn.z);
  rockWN = normalize(tnx.zyx * bw.x + tny.xzy * bw.y + tnz.xyz * bw.z);
  vec3 col = vtRamp(${v3(P.basalt[0])}, ${v3(P.basalt[1])}, c.r * mix(0.7, 1.3, c2.a));
  vec4 m1 = wbM1(vRW);
  float ash = smoothstep(0.5, 0.9, wn.y + (c.a - 0.5) * 0.6) * ${ashTop.toFixed(2)} * (0.35 + m1.r);
  col = mix(col, vtRamp(${v3(P.ash[0])}, ${v3(P.ash[1])}, texture2D(tAsh, vRW.xz * 0.3).r), ash);
  col *= mix(0.7, 1.1, c.a);
  diffuseColor.rgb *= col;
  // lava bounce: rock faces close to molten lava glow from below
  float heat = m1.b * m1.b;
  float low = exp(-max(vRW.y - WB_LAVAY, 0.0) * 0.22);
  float under = 0.45 + 0.55 * clamp(-wn.y * 0.7 + 0.5, 0.0, 1.0);
  rockEm = WB_GLOW * heat * low * under * 0.55;
  float cr = smoothstep(0.4, 0.95, c.g) * ${emissiveCracks.toFixed(2)} * (0.6 + 0.4 * sin(uTime * 1.4 + vRW.x * 0.3 + vRW.y));
  rockEm += WB_GLOW * cr * 2.5;
}`)
      .replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(rockWN, 0.0)).xyz) * faceDirection;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += rockEm;');
  };
  mat.customProgramCacheKey = () => `wb-vrock-${F.id}-${name}`;
  return mat;
}
function crystalMaterial(THREE, color, glow, emissive) {
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.12, metalness: 0.2, emissive: new THREE.Color(glow), emissiveIntensity: emissive, flatShading: true });
  mat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  float fres = pow(1.0 - abs(dot(normalize(vViewPosition), normal)), 2.0);
  totalEmissiveRadiance *= 0.35 + fres * 1.8;`);
  };
  mat.customProgramCacheKey = () => 'wb-crystal-' + emissive;
  return mat;
}

// ---------------- placement ----------------
export function createProps(THREE, scene, F, terrain, tx, opts) {
  const { low, seed, extraLavaGuard } = opts;
  const rnd = mulberry32(seed * 31 + F.id.length * 977);
  const shared = terrain.shared; const G = terrain.getHeight;
  const colliders = [];
  const kinds = {};
  const kind = (name, geo, mat, { shadow = true } = {}) => (kinds[name] = { geo, mat, list: [], shadow });
  const put = (name, x, z, s, opt = {}) => {
    const k = kinds[name]; const sy = opt.sy ?? s, sxz = opt.sxz ?? s;
    const y = (opt.y ?? G(x, z)) - (opt.sink ?? 0.15) * sy;
    k.list.push({ x, y, z, sx: sxz * (opt.ax ?? 1), sy, sz: sxz * (opt.az ?? 1), ry: opt.ry ?? rnd() * Math.PI * 2, rx: opt.rx ?? (rnd() - 0.5) * (opt.tilt ?? 0.25), rz: opt.rz ?? (rnd() - 0.5) * (opt.tilt ?? 0.25), tint: opt.tint ?? (0.8 + rnd() * 0.4), flip: opt.flip });
    if (opt.col) colliders.push({ x, z, r: opt.col });
  };
  const B = F.boundsR; const sx = F.spawn.player, sm = F.spawn.monster;
  const clearOf = (x, z, m) => Math.hypot(x - sx[0], z - sx[1]) > m && Math.hypot(x - sm[0], z - sm[1]) > m && F.springs.every((s) => Math.hypot(x - s.x, z - s.z) > s.r + 2.5);
  const freeOfColliders = (x, z, r) => colliders.every((c) => Math.hypot(x - c.x, z - c.z) > c.r + r + 1.5);
  const polar = (r0, r1) => { const a = rnd() * Math.PI * 2, r = r0 + (r1 - r0) * Math.sqrt(rnd()); return [Math.cos(a) * r, Math.sin(a) * r, r]; };
  const lavaClear = (x, z, m) => F.lavaSD(x, z) > m;
  const nrm = new THREE.Vector3();
  const flatEnough = (x, z, k = 0.75) => terrain.getNormal(x, z, nrm).y > k;
  const C = (n) => Math.max(1, Math.round(n * (low ? 0.55 : 1)));
  const scatter = (n, tries, fn) => { for (let i = 0, t = 0; i < n && t < tries; t++) if (fn()) i++; };

  // shared generators (a few seeds each so no two rocks read as copies)
  const rockMat = rockMaterial(THREE, F, tx, shared, { name: 'rock' });
  const moltenMat = rockMaterial(THREE, F, tx, shared, { name: 'molten', emissiveCracks: 1, ashTop: 0.3 });
  const colMat = rockMaterial(THREE, F, tx, shared, { name: 'cols', basaltScale: 0.5, ashTop: F.id === 'wastes' ? 1.3 : 0.7 });
  kind('boulderA', boulderGeo(THREE, seed + 1, { flat: 0.72 }), rockMat);
  kind('boulderB', boulderGeo(THREE, seed + 2, { flat: 0.55, facets: 5, lumpy: 0.25 }), rockMat);
  kind('boulderC', boulderGeo(THREE, seed + 3, { flat: 0.9, facets: 2, lumpy: 0.5, detail: 2 }), moltenMat);
  kind('slab', boulderGeo(THREE, seed + 4, { flat: 0.32, facets: 4, lumpy: 0.45, layers: 3 }), rockMat);
  kind('cols', columnsGeo(THREE, seed + 5, { n: 11, h0: 0.35, h1: 1.0 }), colMat);
  kind('colsTall', columnsGeo(THREE, seed + 6, { n: 7, h0: 0.55, h1: 1.0, r: 0.14, spread: 0.4 }), colMat);
  kind('spire', spireGeo(THREE, seed + 7, {}), rockMat);
  kind('spireB', spireGeo(THREE, seed + 8, { taper: 0.25, ridges: 0.28, bend: 0.3 }), rockMat);

  const id = F.id;
  if (id === 'foothills') {
    kind('obsidian', crystalGeo(THREE, seed + 9, { n: 6 }), crystalMaterial(THREE, 0x050507, 0xff4a10, 0.12));
    kind('tree', treeGeo(THREE, seed + 10), new THREE.MeshStandardMaterial({ color: 0x0c0a09, roughness: 0.95, emissive: 0x220600, emissiveIntensity: 0.25 }));
    kind('scrub', scrubGeo(THREE, seed + 11), new THREE.MeshStandardMaterial({ color: 0x4a4a2a, roughness: 1 }), { shadow: false });
    // boulder levee along the inner river bank (gaps let a hunter through, not a monster)
    const river = F.river; const tmp = [0, 0, 0, 0];
    for (let s = 0; s < river.total; s += 5.4) {
      // point on the centreline
      let px = 0, pz = 0; { let acc = 0; for (let i = 0; i < river.pts.length - 1; i++) { const [ax, az] = river.pts[i], [bx, bz] = river.pts[i + 1]; const l = Math.hypot(bx - ax, bz - az); if (acc + l >= s) { const t = (s - acc) / l; px = ax + (bx - ax) * t; pz = az + (bz - az) * t; break; } acc += l; } }
      if (Math.hypot(px, pz) > B + 14) continue;
      river.near(px, pz, tmp); let nx = -tmp[3], nz = tmp[2]; if (nx * -px + nz * -pz < 0) { nx = -nx; nz = -nz; } // normal toward the centre
      let d = 0; while (F.lavaSD(px + nx * d, pz + nz * d) < 2.0 && d < 30) d += 0.5;
      const x = px + nx * d, z = pz + nz * d;
      put(rnd() < 0.5 ? 'boulderA' : 'boulderC', x, z, 1.55 + rnd() * 0.35, { sy: 1.2 + rnd() * 0.5, col: 1.6, sink: 0.3 });
    }
    scatter(C(150), 3000, () => { const [x, z, r] = polar(24, 270); const s = (0.4 + rnd() * 1.4) * (1 + smoothstep(60, 220, r) * 1.6); if (!clearOf(x, z, 7) || !lavaClear(x, z, s + 1) || !freeOfColliders(x, z, s)) return false; const k = ['boulderA', 'boulderB', 'boulderC'][Math.floor(rnd() * 3)]; put(k, x, z, s, { col: r < B && s > 1.0 ? s * 0.85 : 0 }); return true; });
    scatter(C(70), 2000, () => { const [x, z, r] = polar(40, 260); const s = 1.5 + rnd() * 3; if (!clearOf(x, z, 8) || !lavaClear(x, z, 2)) return false; put('slab', x, z, s, { sy: s * (0.5 + rnd() * 0.4), tint: 0.6 + rnd() * 0.3, col: r < B && s > 2.5 ? s * 0.6 : 0 }); return true; });
    scatter(C(10), 600, () => { const [x, z, r] = polar(55, 200); const s = 3 + rnd() * 5; if (!clearOf(x, z, 10) || !lavaClear(x, z, s + 2) || !freeOfColliders(x, z, s)) return false; put('cols', x, z, s, { sy: s * (0.8 + rnd()), sink: 0.1, col: r < B ? s * 0.55 : 0 }); return true; });
    scatter(C(30), 900, () => { const [x, z] = polar(30, 200); if (!clearOf(x, z, 6) || !lavaClear(x, z, 2)) return false; put('obsidian', x, z, 0.8 + rnd() * 1.4, { sink: 0.1, tilt: 0.5 }); return true; });
    scatter(C(42), 1500, () => { const [x, z, r] = polar(26, 230); if (!clearOf(x, z, 6) || !lavaClear(x, z, 3) || !flatEnough(x, z) || !freeOfColliders(x, z, 1)) return false; put('tree', x, z, 0.8 + rnd() * 0.6, { tilt: 0.1, sink: 0, col: r < B ? 0.45 : 0, tint: 1 }); return true; });
    scatter(C(240), 3000, () => { const [x, z] = polar(18, 220); if (!lavaClear(x, z, 1.5) || !flatEnough(x, z, 0.85)) return false; put('scrub', x, z, 0.8 + rnd() * 1.2, { tilt: 0.1, sink: 0.05, tint: 0.6 + rnd() * 0.6 }); return true; });
    for (const [x, z] of F.vents) put('slab', x, z, 1.4 + rnd(), { sy: 0.7, sink: 0.1, tint: 0.7 });
    scatter(C(60), 1500, () => { const [x, z] = polar(8, 60); if (!clearOf(x, z, 3)) return false; put(rnd() < 0.5 ? 'boulderB' : 'slab', x, z, 0.15 + rnd() * 0.35, { sink: 0.35, tint: 0.6 + rnd() * 0.5 }); return true; });
  } else if (id === 'wastes') {
    kind('tree', treeGeo(THREE, seed + 13), new THREE.MeshStandardMaterial({ color: 0x1c1a18, roughness: 0.95 }));
    kind('scrub', scrubGeo(THREE, seed + 14), new THREE.MeshStandardMaterial({ color: 0x5a564a, roughness: 1 }), { shadow: false });
    // broken column stumps around the plateau edge (low enough for the wyvern to hover over)
    scatter(C(11), 800, () => { const [x, z] = polar(38, 55); const s = 4 + rnd() * 3; if (!clearOf(x, z, 9) || !freeOfColliders(x, z, s * 0.6)) return false; put(rnd() < 0.5 ? 'cols' : 'colsTall', x, z, s, { sy: 3 + rnd() * 6, sink: 0.05, tilt: 0.12, col: s * 0.55 }); return true; });
    // toppled columns lying in the ash (collider chain along the length)
    // giant basalt towers beyond the moat
    scatter(C(18), 1500, () => { const [x, z] = polar(96, 225); const s = 10 + rnd() * 14; if (!lavaClear(x, z, s * 0.6 + 2) || !freeOfColliders(x, z, s * 0.5)) return false; put(rnd() < 0.6 ? 'colsTall' : 'cols', x, z, s, { sy: 25 + rnd() * 50, sink: 0.05, tilt: 0.08 }); return true; });
    scatter(C(14), 1200, () => { const [x, z] = polar(92, 230); const s = 4 + rnd() * 6; if (!lavaClear(x, z, s + 2)) return false; put(rnd() < 0.5 ? 'spire' : 'spireB', x, z, s, { sy: 14 + rnd() * 30, sink: 0.05, tilt: 0.1 }); return true; });
    scatter(C(110), 2500, () => { const [x, z, r] = polar(16, 240); const s = (0.4 + rnd() * 1.2) * (r > 80 ? 2.2 : 1); if (!clearOf(x, z, 7) || !lavaClear(x, z, s + 1) || !freeOfColliders(x, z, s)) return false; const k = ['boulderA', 'boulderB', 'slab'][Math.floor(rnd() * 3)]; put(k, x, z, s, { sink: 0.3, col: r < B && s > 1.0 ? s * 0.8 : 0 }); return true; });
    scatter(C(12), 600, () => { const [x, z] = polar(28, 56); if (!clearOf(x, z, 7) || !freeOfColliders(x, z, 1)) return false; put('tree', x, z, 0.9 + rnd() * 0.5, { tilt: 0.15, sink: 0.2, col: 0.4, tint: 1 }); return true; });
    scatter(C(50), 1200, () => { const [x, z] = polar(20, 60); if (!flatEnough(x, z, 0.9)) return false; put('scrub', x, z, 0.7 + rnd(), { tilt: 0.1, sink: 0.1 }); return true; });
    for (const [x, z] of F.vents) put('boulderC', x, z, 0.9 + rnd() * 0.5, { sy: 0.6, sink: 0.1, tint: 0.8 });
  } else {
    kind('crystal', crystalGeo(THREE, seed + 15, { n: 8 }), crystalMaterial(THREE, 0x2a0c3a, 0xb04aff, 1.6));
    kind('obsidian', crystalGeo(THREE, seed + 16, { n: 5 }), crystalMaterial(THREE, 0x040306, 0xff3a08, 0.3));
    const roof = F.roof; const roofY = (r) => roof.apex - (roof.apex - roof.edgeY) * Math.pow(Math.max(0, r - roof.oculus) / (roof.edge - roof.oculus), 2);
    F.roofY = roofY;
    // stalagmites: inside bounds near the edges (colliders) + bigger ones beyond
    scatter(C(26), 1500, () => { const [x, z] = polar(64, 82); const s = 1.4 + rnd() * 1.8; if (!clearOf(x, z, 9) || !lavaClear(x, z, 4) || F.passageMask(x, z) > 0.2 || !freeOfColliders(x, z, s)) return false; put(rnd() < 0.5 ? 'spire' : 'spireB', x, z, s, { sy: 5 + rnd() * 12, sink: 0.05, tilt: 0.08, col: s * 0.8 }); return true; });
    scatter(C(40), 1500, () => { const [x, z] = polar(84, 135); const s = 3 + rnd() * 5; if (!lavaClear(x, z, s + 1)) return false; put(rnd() < 0.5 ? 'spire' : 'spireB', x, z, s, { sy: 12 + rnd() * 26, sink: 0.05, tilt: 0.1 }); return true; });
    // stalactites hanging from the roof
    scatter(C(70), 1500, () => { const [x, z, r] = polar(roof.oculus + 6, roof.edge - 8); const s = 1.5 + rnd() * 3.5; put(rnd() < 0.5 ? 'spire' : 'spireB', x, z, s, { y: roofY(r) + 3, sy: (6 + rnd() * 16) * (r < 40 ? 0.6 : 1), sink: 0, rx: Math.PI + (rnd() - 0.5) * 0.1 }); return true; });
    // columnar basalt buttresses against the walls
    scatter(C(14), 900, () => { const [x, z] = polar(86, 120); const s = 7 + rnd() * 8; if (!lavaClear(x, z, 3) || F.passageMask(x, z) > 0.3) return false; put('colsTall', x, z, s, { sy: 18 + rnd() * 26, sink: 0.05, tilt: 0.06 }); return true; });
    // glowing crystal clusters (edges of the chamber, passages and by the lava)
    scatter(C(30), 1500, () => { const [x, z, r] = polar(48, 112); if (!clearOf(x, z, 6) || !lavaClear(x, z, 1.5) || !freeOfColliders(x, z, 1)) return false; const s = 1 + rnd() * 2.2 * (r > B ? 1.8 : 1); put('crystal', x, z, s, { sink: 0.1, tilt: 0.4, col: r < B && s > 1.8 ? s * 0.4 : 0 }); return true; });
    scatter(C(26), 1000, () => { const [x, z] = polar(20, 80); if (!clearOf(x, z, 6) || !lavaClear(x, z, 2)) return false; put('obsidian', x, z, 0.5 + rnd() * 1.0, { sink: 0.1, tilt: 0.6 }); return true; });
    scatter(C(110), 2500, () => { const [x, z, r] = polar(58, 140); const s = (0.5 + rnd() * 1.4) * (r > B ? 2 : 1); if (!clearOf(x, z, 7) || !lavaClear(x, z, s + 0.5) || !freeOfColliders(x, z, s)) return false; const k = ['boulderA', 'boulderB', 'slab', 'boulderC'][Math.floor(rnd() * 4)]; put(k, x, z, s, { sink: 0.3, col: r < B && s > 1.0 ? s * 0.8 : 0 }); return true; });
    scatter(C(14), 600, () => { const [x, z] = polar(22, 60); if (!clearOf(x, z, 8) || !lavaClear(x, z, 3)) return false; put('slab', x, z, 0.8 + rnd() * 1.2, { sy: 0.4, sink: 0.25, tint: 0.7 }); return true; });
  }

  // ---- build instanced meshes ----
  const group = new THREE.Group(); group.name = 'props';
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color();
  let instances = 0, tris = 0;
  for (const [name, k] of Object.entries(kinds)) {
    if (!k.list.length) continue;
    const im = new THREE.InstancedMesh(k.geo, k.mat, k.list.length); im.name = 'props-' + name;
    k.list.forEach((o, i) => {
      e.set(o.rx, o.ry, o.rz); q.setFromEuler(e); sc.set(o.sx, o.sy, o.sz); p.set(o.x, o.y, o.z);
      m4.compose(p, q, sc); im.setMatrixAt(i, m4); col.setScalar(o.tint); im.setColorAt(i, col);
    });
    im.castShadow = k.shadow; im.receiveShadow = true; im.computeBoundingSphere();
    group.add(im); instances += k.list.length; tris += (k.geo.index ? k.geo.index.count : k.geo.attributes.position.count) / 3 * k.list.length;
  }
  scene.add(group);
  return { group, colliders, rockMat, moltenMat, colMat, stats: { instances, tris: Math.round(tris), kinds: Object.keys(kinds).length } };
}
