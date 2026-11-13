// Offline pipeline for the user-supplied wyvern GLB (unrigged, ~300k tris, 5 MB texture):
//   1. weld + simplify (meshoptimizer) to a web/iPad budget
//   2. compress textures to WebP (2048 max)
//   3. auto-rig: build a joint hierarchy from measured landmarks, compute skin weights
//      (region-gated inverse-distance to bone segments, top-4, normalised)
// Usage: node tools/rig-wyvern.mjs <in.glb> <out.glb> [ratio=0.16]
// Mesh convention (source units, ~1.0 wingspan): +Z = head, +Y = up, ±X = wings. The game scales it.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, simplify, textureCompress, prune, dedup } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const [inPath, outPath, ratioArg] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(inPath);

await MeshoptSimplifier.ready;
await doc.transform(
  weld(),
  simplify({ simplifier: MeshoptSimplifier, ratio: +(ratioArg || 0.16), error: 0.0015, lockBorder: false }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [2048, 2048], quality: 82 }),
  dedup(), prune(),
);

// ---------------------------------------------------------------- skeleton
// [name, parent, world position]. Positions measured from mesh slices (see tools/__analyze*.mjs history).
const J = [];
const add = (name, parent, p) => J.push({ name, parent, p });
add('root', null, [0, -0.12, -0.04]);
add('hips', 'root', [0, -0.13, -0.08]);
add('chest', 'root', [0, -0.11, 0.03]);
add('neck1', 'chest', [0, -0.07, 0.09]);
add('neck2', 'neck1', [0, -0.02, 0.145]);
add('head', 'neck2', [0, 0.0, 0.19]);
add('jaw', 'head', [0, -0.035, 0.215]);
add('tail1', 'hips', [0, -0.15, -0.15]);
add('tail2', 'tail1', [0, -0.19, -0.23]);
add('tail3', 'tail2', [0, -0.23, -0.29]);
for (const [s, k] of [['L', 1], ['R', -1]]) {
  add(`wing1${s}`, 'chest', [0.08 * k, 0.0, 0.07]);   // shoulder
  add(`wing2${s}`, `wing1${s}`, [0.21 * k, 0.07, 0.13]); // elbow
  add(`wing3${s}`, `wing2${s}`, [0.33 * k, 0.18, 0.22]); // wrist / hand
  add(`fore1${s}`, 'chest', [0.08 * k, -0.06, 0.04]);
  add(`fore2${s}`, `fore1${s}`, [0.07 * k, -0.15, 0.03]);
  add(`hind1${s}`, 'hips', [0.05 * k, -0.13, -0.09]);
  add(`hind2${s}`, `hind1${s}`, [0.05 * k, -0.18, -0.13]);
}
// Segment end points used for weighting (child joint, or an explicit tip for leaf bones).
const tips = {
  head: [0, -0.03, 0.29], jaw: [0, -0.06, 0.27], tail3: [0, -0.275, -0.35],
  wing3L: [0.48, 0.28, 0.34], wing3R: [-0.48, 0.28, 0.34],
  fore2L: [0.06, -0.22, 0.0], fore2R: [-0.06, -0.22, 0.0],
  hind2L: [0.05, -0.2, -0.22], hind2R: [-0.05, -0.2, -0.22],
  root: [0, -0.12, -0.04], hips: [0, -0.15, -0.15], chest: [0, -0.07, 0.09],
  neck1: [0, -0.02, 0.145], neck2: [0, 0.0, 0.19],
  tail1: [0, -0.19, -0.23], tail2: [0, -0.23, -0.29],
  wing1L: [0.21, 0.07, 0.13], wing1R: [-0.21, 0.07, 0.13], wing2L: [0.33, 0.18, 0.22], wing2R: [-0.33, 0.18, 0.22],
  fore1L: [0.07, -0.15, 0.03], fore1R: [-0.07, -0.15, 0.03], hind1L: [0.05, -0.18, -0.13], hind1R: [-0.05, -0.18, -0.13],
};
const idx = Object.fromEntries(J.map((j, i) => [j.name, i]));
const segDist2 = (p, a, b) => {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const L = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2; const t = L > 0 ? Math.max(0, Math.min(1, (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / L)) : 0;
  return (ap[0] - ab[0] * t) ** 2 + (ap[1] - ab[1] * t) ** 2 + (ap[2] - ab[2] * t) ** 2;
};
// Candidate bones by region, so wing membrane never binds to legs and vice versa.
const BODY = ['hips', 'chest', 'neck1', 'neck2', 'head', 'jaw', 'tail1', 'tail2', 'tail3'];
const candidates = (x, y, z) => {
  const s = x >= 0 ? 'L' : 'R', ax = Math.abs(x);
  if (ax > 0.15) return [`wing1${s}`, `wing2${s}`, `wing3${s}`];
  if (ax > 0.095 && y > -0.05) return [`wing1${s}`, `wing2${s}`, 'chest', 'neck1'];
  const c = [...BODY];
  if (ax > 0.025 && y < -0.08) c.push(`fore1${s}`, `fore2${s}`, `hind1${s}`, `hind2${s}`);
  if (ax > 0.06) c.push(`wing1${s}`);
  if (z < 0.17 || y < -0.04) return c.filter((n) => n !== 'jaw');
  return c;
};

// ---------------------------------------------------------------- build skin
const root = doc.getRoot(); const buffer = root.listBuffers()[0];
const meshNode = root.listNodes().find((n) => n.getMesh());
const prim = meshNode.getMesh().listPrimitives()[0];
const pos = prim.getAttribute('POSITION').getArray(); const n = pos.length / 3;
const joints = new Uint16Array(n * 4), weights = new Float32Array(n * 4);
for (let i = 0; i < n; i++) {
  const p = [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]];
  const cand = candidates(...p).map((name) => { const j = J[idx[name]]; const d2 = segDist2(p, j.p, tips[name] || j.p); return [idx[name], 1 / ((d2 + 1e-5) ** 2)]; });
  cand.sort((a, b) => b[1] - a[1]); const top = cand.slice(0, 4); const sum = top.reduce((s, c) => s + c[1], 0);
  top.forEach(([j, w], k) => { joints[4 * i + k] = j; weights[4 * i + k] = w / sum; });
}
prim.setAttribute('JOINTS_0', doc.createAccessor().setType('VEC4').setArray(joints).setBuffer(buffer));
prim.setAttribute('WEIGHTS_0', doc.createAccessor().setType('VEC4').setArray(weights).setBuffer(buffer));

const nodes = J.map((j) => doc.createNode(j.name));
J.forEach((j, i) => {
  const pp = j.parent ? J[idx[j.parent]].p : [0, 0, 0];
  nodes[i].setTranslation([j.p[0] - pp[0], j.p[1] - pp[1], j.p[2] - pp[2]]);
  if (j.parent) nodes[idx[j.parent]].addChild(nodes[i]);
});
const ibm = new Float32Array(J.length * 16);
J.forEach((j, i) => { const m = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -j.p[0], -j.p[1], -j.p[2], 1]; ibm.set(m, i * 16); });
const skin = doc.createSkin('wyvern').setSkeleton(nodes[0]).setInverseBindMatrices(doc.createAccessor().setType('MAT4').setArray(ibm).setBuffer(buffer));
nodes.forEach((nd) => skin.addJoint(nd));
meshNode.setSkin(skin).setName('wyvern_mesh');
const scene = root.listScenes()[0];
// Flatten: mesh node + skeleton root directly under the scene (identity transforms).
for (const c of scene.listChildren()) scene.removeChild(c);
scene.addChild(meshNode).addChild(nodes[0]);
for (const nd of root.listNodes()) if (nd !== meshNode && !nodes.includes(nd)) nd.dispose();

await io.write(outPath, doc);
const tris = prim.getIndices().getCount() / 3;
console.log(JSON.stringify({ out: outPath, verts: n, tris, joints: J.length }));
