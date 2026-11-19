// Hand-placed landmarks that give the arena identity: a ribcage of stone arches (NW), a tall rock spire (NE),
// a fallen ancient tree (W) and a cliff waterfall feeding the pond (E). All procedural, with colliders.
import { buildWaterfall } from './waterfall.js';
import { makeNoise2D, mulberry32, clamp, lerp, smoothstep } from './noise.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rockGeo } from './foliage.js';
import { GB, limb } from './foliage.js';
import { ATLAS } from './textures.js';
import { WATER_LEVEL } from './terrain.js';

// footprints reserved before vegetation scattering: [x, z, radius]
export const LANDMARK_LAYOUT = {
  ribs: { x: -38, z: -40 }, spire: { x: 34, z: -52 }, fallen: { x: -48, z: -4 }, cliff: { x: 66, z: 9 },
};
export const LANDMARK_RESERVE = [[-38, -40, 15], [34, -52, 9], [-48, -4, 15], [66, 9, 10], [57, 9, 4]];

export function createLandmarks(THREE, scene, terrain, mats, opts = {}) {
  const N = makeNoise2D(991); const rnd = mulberry32(4711);
  const colliders = []; const rockParts = []; const group = new THREE.Group(); group.name = 'landmarks'; scene.add(group);
  const L = LANDMARK_LAYOUT;

  // ---- stone ribcage: pairs of tapering curved tusks arching over a buried spine ----
  {
    const C = new THREE.Vector2(L.ribs.x, L.ribs.z); const R = C.clone().normalize(); const T = new THREE.Vector2(-R.y, R.x);
    const ribs = 6;
    for (let i = 0; i < ribs; i++) {
      const s = (i - (ribs - 1) / 2) * 3.8; const mid = 1 - Math.abs(i - (ribs - 1) / 2) / ribs;
      const half = lerp(4.2, 6.5, mid), hgt = lerp(7.5, 14, mid);
      for (const side of [-1, 1]) {
        const bx = C.x + T.x * s + R.x * half * side, bz = C.y + T.y * s + R.y * half * side;
        const by = terrain.getHeight(bx, bz) - 0.8;
        const cx = C.x + T.x * s, cz = C.y + T.y * s;
        const pts = [];
        for (let k = 0; k <= 5; k++) {
          const t = k / 5; const out = Math.sin(t * Math.PI * 0.9) * 1.4 * (1 - t) + (1 - t) * 1.0; // bulge outward then curl in
          const r = half * (1 - t * 0.82) + out;
          pts.push(new THREE.Vector3(cx + R.x * r * side + T.x * t * 0.8, by + Math.sin(t * Math.PI * 0.5) * hgt, cz + R.y * r * side + T.y * t * 0.8));
        }
        const curve = new THREE.CatmullRomCurve3(pts);
        const SEG = 28, RAD = 8;
        const tube = new THREE.TubeGeometry(curve, SEG, 1, RAD, false);
        const p = tube.attributes.position;
        for (let a = 0; a <= SEG; a++) {
          const cp = curve.getPointAt(a / SEG); const tap = lerp(1.05, 0.22, Math.pow(a / SEG, 0.9));
          for (let b = 0; b <= RAD; b++) {
            const idx = a * (RAD + 1) + b; const x = p.getX(idx), y = p.getY(idx), z = p.getZ(idx);
            const n = 1 + 0.18 * N.noise(x * 0.6 + i, y * 0.6 + z * 0.3);
            p.setXYZ(idx, cp.x + (x - cp.x) * tap * n, cp.y + (y - cp.y) * tap * n, cp.z + (z - cp.z) * tap * n);
          }
        }
        tube.deleteAttribute('uv'); tube.computeVertexNormals();
        rockParts.push(tube);
        colliders.push({ x: bx, z: bz, r: 1.2 });
      }
    }
    // vertebrae boulders along the spine
    for (let i = -3; i <= 3; i++) {
      const g = rockGeo(THREE, 300 + i, 0.5, 2); const x = C.x + T.x * i * 3.8, z = C.y + T.y * i * 3.8;
      g.scale(1.8, 1.3, 1.6); g.rotateY(rnd() * 6.28); g.translate(x, terrain.getHeight(x, z) - 0.3, z); rockParts.push(g);
    }
  }

  // ---- spire: stacked leaning rock masses ----
  {
    const { x, z } = L.spire; let y = terrain.getHeight(x, z) - 4.5; let ox = 0, oz = 0;
    const tiers = [[8, 9, 8], [5.5, 9, 5.2], [4.0, 9, 3.8], [2.8, 8, 2.6], [1.7, 6.5, 1.6]];
    tiers.forEach(([sx, sy, sz], k) => {
      const g = rockGeo(THREE, 500 + k * 7, 0.95, 3); g.scale(sx, sy, sz); g.rotateY(k * 1.3);
      g.translate(x + ox, y + sy * 0.45, z + oz); rockParts.push(g);
      y += sy * 0.9; ox += 0.45; oz -= 0.3;
    });
    colliders.push({ x, z, r: 6.5 });
  }

  // ---- cliff for the waterfall ----
  let cliffTop = 0, lipX = 59.2;
  {
    const { x, z } = L.cliff; const g = rockGeo(THREE, 777, 0.62, 3); g.scale(9, 19, 12); g.rotateY(0.2);
    const y = terrain.getHeight(x, z) + 0.5; g.translate(x, y, z); g.computeBoundingBox(); cliffTop = g.boundingBox.max.y; rockParts.push(g);
    const P = g.attributes.position; lipX = 1e9;
    for (let i = 0; i < P.count; i++) if (Math.abs(P.getZ(i) - z) < 2.5 && P.getY(i) > cliffTop - 4) lipX = Math.min(lipX, P.getX(i));
    if (lipX > 1e8) lipX = x - 6;
    const g2 = rockGeo(THREE, 779, 0.6, 2); g2.scale(5, 8, 6); g2.translate(x + 2, y - 1, z + 8); rockParts.push(g2);
    const g3 = rockGeo(THREE, 781, 0.6, 2); g3.scale(5, 9, 6); g3.translate(x + 1, y - 1, z - 8); rockParts.push(g3);
    colliders.push({ x, z, r: 7.5 }, { x: x + 2, z: z + 8, r: 4.5 }, { x: x + 1, z: z - 8, r: 4.5 });
  }
  const rockMesh = new THREE.Mesh(mergeGeometries(rockParts.map((g) => { const n = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal') n.deleteAttribute(k); return n; })), mats.rockMat);
  rockMesh.castShadow = true; rockMesh.receiveShadow = true; rockMesh.name = 'landmark-rock'; group.add(rockMesh);

  // ---- fallen ancient tree (bark atlas) ----
  {
    const gb = new GB(); const { x, z } = L.fallen; const yaw = 0.35; const len = 26;
    const dx = Math.cos(yaw), dz = Math.sin(yaw);
    const A = [x - dx * len / 2, 0, z - dz * len / 2], B = [x + dx * len / 2, 0, z + dz * len / 2];
    A[1] = terrain.getHeight(A[0], A[2]) + 1.5; B[1] = terrain.getHeight(B[0], B[2]) + 0.8;
    const moss = (px, py, pz, nx, ny) => { const m = smoothstep(0.2, 0.8, ny); return [lerp(0.9, 0.55, m), lerp(0.85, 0.85, m), lerp(0.8, 0.35, m), 0]; };
    const trunk = limb(THREE, A, B, 1.6, 0.8, 12); trunk.deleteAttribute('normal'); trunk.computeVertexNormals();
    gb.addGeo(trunk, ATLAS.BARK, moss, [2, 5]);
    // root plate at A
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + rnd() * 0.3; const rl = 2.5 + rnd() * 2.2;
      const dir = [-dx * 0.5 + Math.cos(a) * -dz, Math.sin(a), -dz * 0.5 + Math.cos(a) * dx];
      const E = [A[0] + dir[0] * rl, A[1] + dir[1] * rl, A[2] + dir[2] * rl];
      gb.addGeo(limb(THREE, A, E, 0.45, 0.08, 5), ATLAS.BARK, moss);
    }
    const disc = new THREE.CylinderGeometry(2.6, 2.9, 1.0, 12, 1, false); disc.rotateZ(Math.PI / 2); disc.rotateY(-yaw);
    disc.translate(A[0] - dx * 0.4, A[1], A[2] - dz * 0.4);
    gb.addGeo(disc, ATLAS.BARK, () => [0.45, 0.38, 0.3, 0]);
    // broken branches
    for (let i = 0; i < 5; i++) {
      const t = 0.35 + i * 0.12; const P = [lerp(A[0], B[0], t), lerp(A[1], B[1], t) + 0.6, lerp(A[2], B[2], t)];
      const a = rnd() * Math.PI - Math.PI / 2; const bl = 3 + rnd() * 3;
      const E = [P[0] + (-dz * Math.cos(a)) * bl + dx * 1.2, P[1] + Math.abs(Math.sin(a)) * bl * 0.8, P[2] + (dx * Math.cos(a)) * bl + dz * 1.2];
      gb.addGeo(limb(THREE, P, E, 0.4, 0.12, 6), ATLAS.BARK, moss);
    }
    const geo = gb.build(THREE); const m = new THREE.Mesh(geo, mats.treeMat);
    m.castShadow = true; m.receiveShadow = true; m.name = 'fallen-tree'; group.add(m);
    for (let t = 0; t <= 1.001; t += 0.1) colliders.push({ x: lerp(A[0], B[0], t), z: lerp(A[2], B[2], t), r: lerp(1.7, 0.9, t) });
  }

  // ---- waterfall (shared look: src/world/waterfall.js) ----
  const wfU = { uTime: { value: 0 } };
  const base = { x: 0, z: L.cliff.z };
  {
    const top = cliffTop - 1.2, bot = WATER_LEVEL - 0.1; base.x = lipX - 1.9;
    group.add(buildWaterfall(THREE, { x: lipX + 0.2, z: base.z, top, bottom: bot, dx: -1, dz: 0, w: 3.6, uniforms: wfU }));
  }

  let mistT = 0;
  function update(t, rawDt, camera) {
    wfU.uTime.value = t;
    mistT -= rawDt;
    if (mistT <= 0 && opts.spawnSplash && camera.position.distanceToSquared(new THREE.Vector3(base.x, 0, base.z)) < 90 * 90) {
      mistT = 0.35; opts.spawnSplash(new THREE.Vector3(base.x - 0.3 + (rnd() - 0.5), WATER_LEVEL, base.z + (rnd() - 0.5) * 2.5), 0.35);
    }
  }
  return { colliders, update, waterfallBase: { x: base.x, y: WATER_LEVEL, z: base.z } };
}
