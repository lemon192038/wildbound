// Island set pieces (static, few, always loaded): the landing camp, the Ancient Ruins, the giant crystal spires
// of the Crystal Fields and the three boss nests. Geometry is merged per material, so this adds a handful of
// draw calls. Every piece is placed on a site found by F.findSite (flat, dry, away from lava) and contributes
// circle colliders.
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeNoise2D, mulberry32 } from '../noise.js';

function strip(g) { const n = g.index ? g.toNonIndexed() : g; n.deleteAttribute('uv'); n.computeVertexNormals(); return n; }
function tint(THREE, g, fn) {
  const p = g.attributes.position, c = new Float32Array(p.count * 3), o = [0, 0, 0];
  for (let i = 0; i < p.count; i++) { fn(p.getX(i), p.getY(i), p.getZ(i), o); c[i * 3] = o[0]; c[i * 3 + 1] = o[1]; c[i * 3 + 2] = o[2]; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g;
}

export function createIslandLandmarks(THREE, scene, F, { seed = 1337, sites, low = false } = {}) {
  const N = makeNoise2D(seed + 501); const rnd = mulberry32(seed + 77);
  const H = (x, z) => F.height(x, z);
  const stone = [], crystal = [], wood = [], cloth = [], glow = [];
  const colliders = []; const out = { colliders, sites: {} };
  const place = (g, x, z, rotY = 0, sink = 0.2, y = null) => { g.rotateY(rotY); g.translate(x, (y ?? H(x, z)) - sink, z); return g; };
  const stoneTint = (g, base = 0.11) => tint(THREE, strip(g), (x, y, z, o) => { const v = base + 0.05 * N.noise(x * 0.6 + y * 0.4, z * 0.6); const moss = Math.max(0, N.noise(x * 0.2, z * 0.2) - 0.3) * 0.12; o[0] = v * 1.05; o[1] = v + moss * 0.6; o[2] = v * 0.92; });

  // ---- Ancient Ruins: a ring of broken columns, a standing arch, wall fragments, a fallen lintel ----
  {
    const [cx, cz] = sites.ruins; out.sites.ruins = [cx, cz];
    const R = 22;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2, x = cx + Math.cos(a) * R, z = cz + Math.sin(a) * R; const h = rnd() < 0.3 ? 1 + rnd() * 2 : 4 + rnd() * 6;
      const col = new THREE.CylinderGeometry(1.0, 1.15, h, 10, 3); col.translate(0, h / 2, 0);
      const cp = col.attributes.position; for (let v = 0; v < cp.count; v++) { const y = cp.getY(v); if (y > h - 0.01) cp.setY(v, y - rnd() * 1.2); }
      stone.push(stoneTint(place(col, x, z, rnd() * 3)));
      const cap = new THREE.BoxGeometry(2.6, 0.5, 2.6); cap.translate(0, 0.25, 0); stone.push(stoneTint(place(cap, x, z, a, 0.1)));
      colliders.push({ x, z, r: 1.4 });
    }
    // arch
    const ax = cx + R * 0.35, az = cz - R * 0.2; const legs = [-3.2, 3.2];
    for (const lx of legs) { const leg = new THREE.BoxGeometry(1.6, 9, 1.6); leg.translate(lx, 4.5, 0); stone.push(stoneTint(place(leg, ax, az, 0.4))); colliders.push({ x: ax + Math.cos(0.4) * lx, z: az - Math.sin(0.4) * lx, r: 1.3 }); }
    const top = new THREE.BoxGeometry(9, 1.6, 1.8); top.translate(0, 9.6, 0); stone.push(stoneTint(place(top, ax, az, 0.4)));
    // wall fragments
    for (let i = 0; i < 6; i++) { const a = rnd() * 6.28, r = R + 8 + rnd() * 18, x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r, w = 4 + rnd() * 6, h = 1.2 + rnd() * 3;
      const wall = new THREE.BoxGeometry(w, h, 1.2, 4, 2, 1); wall.translate(0, h / 2, 0); stone.push(stoneTint(place(wall, x, z, a + 1.57)));
      colliders.push({ x, z, r: w * 0.45 }); }
    // fallen lintel + central altar with a faint ember glow
    const lint = new THREE.BoxGeometry(8, 1.2, 1.6); lint.rotateZ(0.12); stone.push(stoneTint(place(lint, cx - 6, cz + 5, 1.1, 0.4)));
    const alt = new THREE.CylinderGeometry(3, 3.4, 1.2, 8); alt.translate(0, 0.6, 0); stone.push(stoneTint(place(alt, cx, cz, 0, 0.1), 0.09)); colliders.push({ x: cx, z: cz, r: 3.2 });
    const rune = new THREE.TorusGeometry(2.2, 0.08, 4, 32); rune.rotateX(Math.PI / 2); rune.translate(0, 1.22, 0); glow.push(strip(place(rune, cx, cz, 0, 0)));
  }

  // ---- Crystal Fields: giant spires (8–26 m) ----
  {
    const [cx, cz] = sites.crystal; out.sites.crystal = [cx, cz];
    for (let i = 0; i < (low ? 9 : 14); i++) {
      const a = rnd() * 6.28, r = 6 + rnd() * 60, x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r; if (F.lava(x, z).sd < 8) continue;
      const h = 8 + Math.pow(rnd(), 1.5) * 18, w = h * (0.12 + rnd() * 0.06);
      const g = new THREE.CylinderGeometry(0, w, h, 6, 1); g.translate(0, h / 2, 0); g.rotateZ((rnd() - 0.5) * 0.5); g.rotateX((rnd() - 0.5) * 0.4);
      crystal.push(tint(THREE, strip(place(g, x, z, rnd() * 6, 1)), (px, py, pz, o) => { const v = 0.65 + 0.35 * N.noise(px * 0.3 + py * 0.2, pz * 0.3); o[0] = 0.32 * v; o[1] = 0.82 * v; o[2] = 1.0 * v; }));
      colliders.push({ x, z, r: w * 0.9 });
      for (let k = 0; k < 3; k++) { const s = w * (0.25 + rnd() * 0.3), hh = h * (0.2 + rnd() * 0.25); const b = new THREE.CylinderGeometry(0, s, hh, 6); b.translate(0, hh / 2, 0); b.rotateZ((rnd() - 0.5) * 1.2); crystal.push(tint(THREE, strip(place(b, x + (rnd() - 0.5) * w * 3, z + (rnd() - 0.5) * w * 3, rnd() * 6, 0.4)), (px, py, pz, o) => { o[0] = 0.3; o[1] = 0.78; o[2] = 0.95; })); }
    }
  }

  // ---- nests: ring of scorched stones and bones around each boss home ----
  for (const [id, [x, z]] of Object.entries(sites.nests || {})) {
    out.sites['nest_' + id] = [x, z];
    const R = id === 'brute' ? 14 : 11;
    for (let i = 0; i < 18; i++) { const a = (i / 18) * 6.28 + rnd() * 0.2, r = R + (rnd() - 0.5) * 2; const b = new THREE.DodecahedronGeometry(0.7 + rnd() * 0.9, 0); b.scale(1, 0.6, 1);
      stone.push(stoneTint(place(b, x + Math.cos(a) * r, z + Math.sin(a) * r, rnd() * 6, 0.25), 0.05)); }
    for (let i = 0; i < 7; i++) { const a = rnd() * 6.28, r = rnd() * R * 0.8; const bone = new THREE.CylinderGeometry(0.12, 0.18, 2.4 + rnd() * 2, 5); bone.rotateZ(1.5); bone.rotateY(rnd() * 6);
      wood.push(tint(THREE, strip(place(bone, x + Math.cos(a) * r, z + Math.sin(a) * r, 0, -0.1)), (px, py, pz, o) => { o[0] = 0.55; o[1] = 0.5; o[2] = 0.42; })); }
  }

  // ---- landing camp: tent, supply crates, fire pit (the expedition boat lands here) ----
  {
    const [x, z] = sites.camp; out.sites.camp = [x, z];
    const tx = x + 7, tz = z + 3;
    const tent = new THREE.ConeGeometry(3.4, 3.6, 4, 1, true); tent.rotateY(Math.PI / 4); tent.translate(0, 1.8, 0);
    cloth.push(tint(THREE, strip(place(tent, tx, tz, 0.3, 0.05)), (px, py, pz, o) => { o[0] = 0.45; o[1] = 0.32; o[2] = 0.2; })); colliders.push({ x: tx, z: tz, r: 2.6 });
    for (let i = 0; i < 3; i++) { const c = new THREE.BoxGeometry(1, 0.8, 0.8); c.translate(0, 0.4 + (i === 2 ? 0.8 : 0), 0); wood.push(tint(THREE, strip(place(c, x - 5 + (i % 2) * 1.1, z + 2, 0.2, 0)), (px, py, pz, o) => { o[0] = 0.32; o[1] = 0.2; o[2] = 0.1; })); }
    colliders.push({ x: x - 4.5, z: z + 2, r: 1.2 });
    for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.28; const st = new THREE.DodecahedronGeometry(0.32, 0); stone.push(stoneTint(place(st, x + Math.cos(a) * 1.1, z - 4 + Math.sin(a) * 1.1, a, 0.1), 0.06)); }
    const ember = new THREE.SphereGeometry(0.5, 8, 4); ember.scale(1, 0.4, 1); glow.push(strip(place(ember, x, z - 4, 0, 0)));
    out.campFire = new THREE.Vector3(x, H(x, z - 4) + 1.2, z - 4);
  }

  const meshes = [];
  const add = (list, mat, name) => { if (!list.length) return; const m = new THREE.Mesh(mergeGeometries(list), mat); m.name = name; m.castShadow = !low; m.receiveShadow = true; m.matrixAutoUpdate = false; scene.add(m); meshes.push(m); };
  add(stone, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 }), 'lm-stone');
  add(crystal, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.1, metalness: 0.05, emissive: 0x0d6a8e, emissiveIntensity: 0.8, flatShading: true }), 'lm-crystal');
  add(wood, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }), 'lm-wood');
  add(cloth, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide }), 'lm-cloth');
  add(glow, new THREE.MeshStandardMaterial({ color: 0x220800, emissive: 0xff6a1a, emissiveIntensity: 2.2 }), 'lm-glow');
  if (out.campFire) { const L = new THREE.PointLight(0xff8a3a, 60, 18, 1.8); L.position.copy(out.campFire); scene.add(L); out.campLight = L; }
  out.meshes = meshes;
  return out;
}
