// Island props, streamed with the near tiles: boulders, basalt columns, ember pines, dead trees, giant fungi and
// mineral crystals. Placement is deterministic per tile (same island for every client). Rendering uses ONE
// InstancedMesh per prop type for the whole loaded area (draw calls stay constant however many tiles stream in);
// tiles only own small matrix arrays that are packed into the shared instance buffers when the tile set changes.
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeNoise2D, mulberry32 } from '../noise.js';

// per-tile counts by region
const DENSITY = {
  boulder: { peaks: 22, core: 10, canyon: 14, ashplain: 4, fungal: 6, crystal: 8, ruins: 10, geotherm: 6, coast: 9, caldera: 6 },
  pillar: { peaks: 4, canyon: 7, ruins: 3, coast: 4, core: 1 },
  pine: { fungal: 26, core: 3, peaks: 3, coast: 4, crystal: 2 },
  deadtree: { core: 5, ashplain: 4, geotherm: 4, canyon: 2 },
  fungus: { fungal: 11, crystal: 1, canyon: 1 },
  crystal: { crystal: 14, peaks: 1, caldera: 2 },
};
const CAP = { boulder: 2400, pillar: 500, pine: 2600, deadtree: 500, fungus: 1100, crystal: 1300 };

function colorize(THREE, g, fn) {
  const p = g.attributes.position, n = g.attributes.normal, c = new Float32Array(p.count * 3); const o = [0, 0, 0];
  for (let i = 0; i < p.count; i++) { fn(p.getX(i), p.getY(i), p.getZ(i), n ? n.getY(i) : 1, o); c[i * 3] = o[0]; c[i * 3 + 1] = o[1]; c[i * 3 + 2] = o[2]; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g;
}
function prep(g) { const n = g.index ? g.toNonIndexed() : g; n.deleteAttribute('uv'); n.computeVertexNormals(); return n; }

function buildGeometries(THREE, seed) {
  const N = makeNoise2D(seed + 77);
  // boulder: lumpy, flattened icosphere with ash settling on top
  let b = new THREE.IcosahedronGeometry(1, 2); const bp = b.attributes.position;
  for (let i = 0; i < bp.count; i++) { const x = bp.getX(i), y = bp.getY(i), z = bp.getZ(i); const k = 1 + 0.28 * N.noise(x * 1.7 + 3, z * 1.7 + y * 1.3) + 0.12 * N.noise(x * 4, y * 4 + z); bp.setXYZ(i, x * k, y * k * 0.72, z * k); }
  b = colorize(THREE, prep(b), (x, y, z, ny, o) => { const v = 0.05 + 0.03 * N.noise(x * 3, z * 3 + y); const ash = Math.max(0, ny - 0.55) * 0.5; o[0] = v + ash * 0.42; o[1] = v * 0.94 + ash * 0.4; o[2] = v * 0.9 + ash * 0.38; });
  // basalt columns: a cluster of hexagonal prisms
  const cols = []; const rr = mulberry32(seed + 3);
  for (let i = 0; i < 6; i++) { const h = 2 + rr() * 5; const c = new THREE.CylinderGeometry(0.5, 0.56, h, 6); c.translate((i % 3) * 0.95 - 0.95 + (i > 2 ? 0.48 : 0), h / 2 - 0.3, i > 2 ? 0.83 : 0); cols.push(prep(c)); }
  const pillar = colorize(THREE, mergeGeometries(cols), (x, y, z, ny, o) => { const v = 0.045 + 0.02 * N.noise(x * 2, y * 2); const top = ny > 0.9 ? 0.06 : 0; o[0] = v + top; o[1] = v + top * 0.95; o[2] = v * 1.05 + top * 0.9; });
  // ember pine: dark trunk + three stacked needle cones
  const pineParts = [prep(new THREE.CylinderGeometry(0.16, 0.3, 4.2, 6).translate(0, 2.1, 0))];
  for (let i = 0; i < 4; i++) {
    const c = new THREE.ConeGeometry(2.1 - i * 0.45, 2.8 - i * 0.3, 11, 2, true); const cp = c.attributes.position;
    for (let v = 0; v < cp.count; v++) { const x = cp.getX(v), y = cp.getY(v), z = cp.getZ(v); const k = 1 + 0.22 * N.noise(x * 2.2 + i * 5, z * 2.2 + y); cp.setXYZ(v, x * k, y + (y < 0 ? -0.25 * N.noise(x * 3, z * 3) - 0.2 : 0), z * k); }
    pineParts.push(prep(c.translate(0, 3.0 + i * 1.45, 0)));
  }
  const pine = colorize(THREE, mergeGeometries(pineParts), (x, y, z, ny, o) => { if (y < 2.4 && Math.hypot(x, z) < 0.35) { o[0] = 0.07; o[1] = 0.045; o[2] = 0.035; return; } const v = 0.55 + 0.45 * (0.5 + 0.5 * N.noise(x * 2 + y, z * 2)); const tip = Math.min(1, Math.max(0, (y - 3) / 6)); o[0] = (0.045 + 0.03 * tip) * v; o[1] = (0.085 + 0.04 * tip) * v; o[2] = (0.05 + 0.015 * tip) * v; });
  // dead tree: charred trunk + bare branches
  const dt = [prep(new THREE.CylinderGeometry(0.12, 0.32, 5.5, 6).translate(0, 2.75, 0))];
  for (let i = 0; i < 4; i++) { const br = new THREE.CylinderGeometry(0.05, 0.12, 2.2, 5); br.translate(0, 1.1, 0); br.rotateZ(0.7 + i * 0.15); br.rotateY(i * 1.7); br.translate(0, 2.8 + i * 0.6, 0); dt.push(prep(br)); }
  const deadtree = colorize(THREE, mergeGeometries(dt), (x, y, z, ny, o) => { const v = 0.025 + 0.015 * N.noise(y * 3, x * 3); o[0] = v; o[1] = v * 0.9; o[2] = v * 0.85; });
  // giant fungus: pale stalk + broad cap (ember-orange with darker gills)
  const stalk = prep(new THREE.CylinderGeometry(0.35, 0.55, 3.2, 8).translate(0, 1.6, 0));
  const cap = new THREE.SphereGeometry(2.2, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2); cap.scale(1, 0.5, 1); cap.translate(0, 3.0, 0);
  const fungus = colorize(THREE, mergeGeometries([stalk, prep(cap)]), (x, y, z, ny, o) => { if (y < 3.0 && Math.hypot(x, z) < 0.6) { o[0] = 0.42; o[1] = 0.36; o[2] = 0.3; return; } const sp = N.noise(x * 2.5, z * 2.5) > 0.35 ? 1 : 0; o[0] = 0.55 + sp * 0.3; o[1] = 0.16 + sp * 0.25; o[2] = 0.06 + sp * 0.1; });
  // mineral crystal cluster
  const cr = []; const rc = mulberry32(seed + 9);
  for (let i = 0; i < 6; i++) { const c = new THREE.OctahedronGeometry(0.6, 0); c.scale(0.7, 2.6 + rc() * 2, 0.7); c.rotateZ((rc() - 0.5) * 0.9); c.rotateY(rc() * 6.3); c.translate((rc() - 0.5) * 1.6, 1.2, (rc() - 0.5) * 1.6); cr.push(prep(c)); }
  const crystal = colorize(THREE, mergeGeometries(cr), (x, y, z, ny, o) => { const v = 0.75 + 0.25 * N.noise(x * 3 + y, z * 3); o[0] = 0.35 * v; o[1] = 0.85 * v; o[2] = 1.0 * v; });
  return { boulder: b, pillar, pine, deadtree, fungus, crystal };
}

export function createIslandProps(THREE, scene, F, { low = false, seed = 1337, clear = [], staticColliders = [] } = {}) {
  const geos = buildGeometries(THREE, seed);
  const mats = {
    boulder: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, metalness: 0 }),
    pillar: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, flatShading: true }),
    pine: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0, side: THREE.DoubleSide }),
    deadtree: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }),
    fungus: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0, emissive: 0x3a1004, emissiveIntensity: 0.7 }),
    crystal: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.12, metalness: 0.05, emissive: 0x0b5a78, emissiveIntensity: 0.9, flatShading: true }),
  };
  const meshes = {};
  for (const k of Object.keys(geos)) {
    const m = new THREE.InstancedMesh(geos[k], mats[k], low ? Math.round(CAP[k] * 0.6) : CAP[k]);
    m.count = 0; m.frustumCulled = false; m.name = 'props-' + k;
    m.castShadow = !low && (k === 'boulder' || k === 'pillar' || k === 'pine' || k === 'fungus'); m.receiveShadow = true;
    meshes[k] = m; scene.add(m);
  }
  const live = new Set(); let dirty = false; const colliders = [];
  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sv = new THREE.Vector3(), pv = new THREE.Vector3();
  const lowFactor = low ? 0.6 : 1;

  // Deterministic placement for one tile. heightAt(x,z) uses the tile's own grid; sdAt(x,z) = lava signed distance.
  function scatter(tx, tz, x0, z0, size, heightAt, sdAt) {
    const rnd = mulberry32((tx * 73856093) ^ (tz * 19349663) ^ seed);
    const out = { types: {}, colliders: [] };
    for (const [type, dens] of Object.entries(DENSITY)) {
      const arr = [];
      // sample the dominant region at a few points to size the candidate count
      const regs = [F.regionAt(x0 + size * 0.25, z0 + size * 0.25), F.regionAt(x0 + size * 0.75, z0 + size * 0.25), F.regionAt(x0 + size * 0.25, z0 + size * 0.75), F.regionAt(x0 + size * 0.75, z0 + size * 0.75)];
      const n = Math.round(regs.reduce((a, r) => a + (dens[r] || 0), 0) / 4 * lowFactor * (0.7 + rnd() * 0.6));
      for (let i = 0; i < n * 2 && arr.length < n * 16; i++) {
        const x = x0 + rnd() * size, z = z0 + rnd() * size; const reg = F.regionAt(x, z);
        if (clear.some((c) => Math.hypot(x - c.x, z - c.z) < c.r)) continue; // camps / spawn points stay open
        if (!(dens[reg] > 0) || rnd() > dens[reg] / Math.max(...Object.values(dens))) continue;
        const h = heightAt(x, z); if (h < (type === 'boulder' || type === 'pillar' ? 0.3 : 2.2)) continue;
        if (sdAt(x, z) < (type === 'pine' || type === 'fungus' ? 10 : 5)) continue;
        const sl = Math.hypot(heightAt(x + 1.5, z) - heightAt(x - 1.5, z), heightAt(x, z + 1.5) - heightAt(x, z - 1.5)) / 3;
        if (sl > (type === 'boulder' ? 0.9 : type === 'pillar' ? 0.7 : 0.45)) continue;
        const s = type === 'boulder' ? 0.5 + Math.pow(rnd(), 2.2) * 3.2 : type === 'pillar' ? 0.8 + rnd() * 0.9 : type === 'crystal' ? 0.6 + rnd() * 1.4 : 0.7 + rnd() * 0.7;
        e.set(type === 'boulder' ? (rnd() - 0.5) * 0.5 : (rnd() - 0.5) * 0.12, rnd() * Math.PI * 2, type === 'boulder' ? (rnd() - 0.5) * 0.5 : (rnd() - 0.5) * 0.12);
        q.setFromEuler(e); sv.set(s * (type === 'boulder' ? 0.8 + rnd() * 0.5 : 1), s, s * (type === 'boulder' ? 0.8 + rnd() * 0.5 : 1));
        pv.set(x, h - (type === 'boulder' ? s * 0.18 : 0.15), z); mtx.compose(pv, q, sv);
        arr.push(...mtx.elements);
        const cr = type === 'boulder' ? (s > 1.1 ? s * 0.85 : 0) : type === 'pillar' ? 1.1 * s : type === 'pine' ? 0.45 * s : type === 'deadtree' ? 0.35 * s : type === 'fungus' ? 0.55 * s : s > 1 ? 0.8 * s : 0;
        if (cr > 0) out.colliders.push({ x, z, r: cr });
      }
      if (arr.length) out.types[type] = new Float32Array(arr);
    }
    return out;
  }

  function add(T) { live.add(T); dirty = true; }
  function remove(T) { live.delete(T); dirty = true; }
  function update() {
    if (!dirty) return; dirty = false;
    for (const [k, m] of Object.entries(meshes)) {
      let n = 0; const dst = m.instanceMatrix.array, cap = m.instanceMatrix.count;
      for (const T of live) { const a = T.props?.types[k]; if (!a) continue; const c = Math.min(a.length / 16, cap - n); if (c <= 0) break; dst.set(c === a.length / 16 ? a : a.subarray(0, c * 16), n * 16); n += c; }
      m.count = n; m.instanceMatrix.needsUpdate = true;
    }
    colliders.length = 0; for (const c of staticColliders) colliders.push(c); for (const T of live) if (T.props) for (const c of T.props.colliders) colliders.push(c);
  }
  return { scatter, add, remove, update, colliders, staticColliders, markDirty: () => { dirty = true; }, meshes, stats: () => Object.fromEntries(Object.entries(meshes).map(([k, m]) => [k, m.count])) };
}
