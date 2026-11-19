// Instanced rendering for small fauna: ONE draw call per species however many individuals are visible.
// Animation runs in the vertex shader from a per-instance vec4 aAnim = (phase, move, mode, heat):
//   beetle  aPart: 0 shell, 1..6 legs, 7 antennae, 8 mandibles     modes: 0 walk/feed, 1 curled, 2 alert
//   slime   aPart: 0 body                                          modes: 0 wobble, 1 flattened, 2 swelling (spit/charge)
//   bird    aPart: 0 body/head, 1 left wing, 2 right wing, 3 tail  modes: 0 flapping, 1 gliding, 2 perched (wings folded)
// aPart also drives the emissive mask (glowing shell cracks, molten core, ember wing edges) scaled by heat.
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

function part(THREE, g, id, colorFn) {
  const n = g.index ? g.toNonIndexed() : g; n.deleteAttribute('uv'); n.computeVertexNormals();
  const p = n.attributes.position, cnt = p.count, a = new Float32Array(cnt), c = new Float32Array(cnt * 3), o = [0, 0, 0, 0];
  for (let i = 0; i < cnt; i++) { a[i] = id; colorFn(p.getX(i), p.getY(i), p.getZ(i), o); c[i * 3] = o[0]; c[i * 3 + 1] = o[1]; c[i * 3 + 2] = o[2]; }
  n.setAttribute('aPart', new THREE.BufferAttribute(a, 1)); n.setAttribute('color', new THREE.BufferAttribute(c, 3));
  // glow mask in a 4th channel packed into a separate attribute
  const gl = new Float32Array(cnt); for (let i = 0; i < cnt; i++) { colorFn(p.getX(i), p.getY(i), p.getZ(i), o); gl[i] = o[3] || 0; }
  n.setAttribute('aGlow', new THREE.BufferAttribute(gl, 1));
  return n;
}
const ni = (g) => (g.index ? g.toNonIndexed() : g);
const hash = (x, y, z) => { const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453; return s - Math.floor(s); };

function beetleGeo(THREE) {
  const parts = [];
  // shell: domed, segmented by glowing cracks (cracks = hash bands)
  const sh = new THREE.SphereGeometry(0.55, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55); sh.scale(1, 0.62, 1.35); sh.translate(0, 0.32, 0);
  parts.push(part(THREE, sh, 0, (x, y, z, o) => { const crack = Math.abs(Math.sin(z * 9 + Math.sin(x * 7) * 1.5)) < 0.07 || Math.abs(x) < 0.025 ? 1 : 0; const v = 0.035 + hash(x, y, z) * 0.025; o[0] = crack ? 0.4 : v; o[1] = crack ? 0.12 : v * 0.95; o[2] = crack ? 0.03 : v * 0.9; o[3] = crack; }));
  const head = new THREE.SphereGeometry(0.24, 10, 6); head.scale(1.1, 0.75, 1); head.translate(0, 0.28, 0.72);
  parts.push(part(THREE, head, 0, (x, y, z, o) => { const eye = Math.abs(Math.abs(x) - 0.15) < 0.06 && y > 0.3 && z > 0.85 ? 1 : 0; o[0] = eye ? 1 : 0.05; o[1] = eye ? 0.6 : 0.045; o[2] = eye ? 0.1 : 0.04; o[3] = eye; }));
  for (let i = 0; i < 6; i++) {
    const side = i % 2 ? 1 : -1, row = Math.floor(i / 2); const leg = new THREE.CylinderGeometry(0.035, 0.055, 0.62, 5); leg.rotateZ(side * 1.0); leg.translate(side * 0.5, 0.17, 0.35 - row * 0.38);
    parts.push(part(THREE, leg, 1 + i, (x, y, z, o) => { o[0] = 0.03; o[1] = 0.028; o[2] = 0.027; o[3] = 0; }));
  }
  for (const s of [-1, 1]) { const an = new THREE.CylinderGeometry(0.012, 0.018, 0.42, 4); an.rotateX(-1.0); an.rotateZ(s * 0.35); an.translate(s * 0.1, 0.48, 0.95); parts.push(part(THREE, an, 7, (x, y, z, o) => { o[0] = 0.06; o[1] = 0.05; o[2] = 0.04; o[3] = 0; })); }
  for (const s of [-1, 1]) { const md = new THREE.ConeGeometry(0.05, 0.22, 4); md.rotateX(1.57); md.rotateY(s * 0.4); md.translate(s * 0.09, 0.2, 0.95); parts.push(part(THREE, md, 8, (x, y, z, o) => { o[0] = 0.08; o[1] = 0.04; o[2] = 0.02; o[3] = 0.3; })); }
  return mergeGeometries(parts);
}
function slimeGeo(THREE) {
  const g = new THREE.SphereGeometry(0.6, 18, 12); g.scale(1, 0.7, 1); g.translate(0, 0.38, 0);
  return part(THREE, g, 0, (x, y, z, o) => { const crust = hash(Math.floor(x * 7), Math.floor(y * 7), Math.floor(z * 7)) > 0.42 || y > 0.62 ? 1 : 0; o[0] = crust ? 0.07 : 0.85; o[1] = crust ? 0.045 : 0.26; o[2] = crust ? 0.035 : 0.05; o[3] = crust ? 0.05 : 0.6; });
}
function birdGeo(THREE) {
  const parts = [];
  const body = new THREE.SphereGeometry(0.32, 10, 8); body.scale(0.85, 0.8, 1.7); body.translate(0, 0, 0);
  parts.push(part(THREE, body, 0, (x, y, z, o) => { const v = 0.05 + hash(x, y, z) * 0.02; o[0] = v * 1.3; o[1] = v; o[2] = v * 0.8; o[3] = 0; }));
  const head = new THREE.SphereGeometry(0.17, 8, 6); head.translate(0, 0.12, 0.55); parts.push(part(THREE, head, 0, (x, y, z, o) => { o[0] = 0.07; o[1] = 0.05; o[2] = 0.04; o[3] = 0; }));
  const beak = new THREE.ConeGeometry(0.06, 0.24, 5); beak.rotateX(1.57); beak.translate(0, 0.09, 0.78); parts.push(part(THREE, beak, 0, (x, y, z, o) => { o[0] = 0.02; o[1] = 0.02; o[2] = 0.025; o[3] = 0; }));
  const crest = new THREE.ConeGeometry(0.06, 0.32, 4); crest.rotateX(-0.9); crest.translate(0, 0.32, 0.4); parts.push(part(THREE, crest, 0, (x, y, z, o) => { o[0] = 0.9; o[1] = 0.25; o[2] = 0.04; o[3] = 0.8; }));
  for (const s of [-1, 1]) {
    // wing: tapered flat fan, black-brown root → red/orange tips with ember edge
    const w = new THREE.PlaneGeometry(1.5, 0.62, 6, 2); w.rotateX(-Math.PI / 2); const wp = w.attributes.position;
    for (let i = 0; i < wp.count; i++) { const x = wp.getX(i) + 0.75, z = wp.getZ(i); wp.setXYZ(i, s * (x + 0.12), -0.02 * x * x, z * (1 - x * 0.35) - x * 0.18); }
    parts.push(part(THREE, w, s < 0 ? 1 : 2, (x, y, z, o) => { const t = Math.min(1, Math.abs(x) / 1.6); o[0] = 0.06 + t * 0.7; o[1] = 0.04 + t * 0.16; o[2] = 0.03 + t * 0.02; o[3] = t > 0.75 ? (t - 0.75) * 3 : 0; }));
  }
  const tail = new THREE.PlaneGeometry(0.42, 0.7, 2, 2); tail.rotateX(-Math.PI / 2); tail.translate(0, 0, -0.75);
  parts.push(part(THREE, tail, 3, (x, y, z, o) => { const t = Math.min(1, -z - 0.4); o[0] = 0.08 + t * 0.6; o[1] = 0.05 + t * 0.15; o[2] = 0.03; o[3] = t > 0.6 ? 0.6 : 0; }));
  const legs = new THREE.CylinderGeometry(0.02, 0.025, 0.36, 4); legs.translate(0.08, -0.32, 0); const legs2 = legs.clone(); legs2.translate(-0.16, 0, 0);
  parts.push(part(THREE, legs, 0, (x, y, z, o) => { o[0] = 0.02; o[1] = 0.02; o[2] = 0.02; o[3] = 0; })); parts.push(part(THREE, legs2, 0, (x, y, z, o) => { o[0] = 0.02; o[1] = 0.02; o[2] = 0.02; o[3] = 0; }));
  return mergeGeometries(parts);
}

function lizardGeo(THREE) {
  // 1.0 scale ≈ 2.3 m long: flat triangular head with two horn nubs, glowing back radiator spines, 4 splayed legs, long tail (aPart 5)
  const parts = []; const rock = (x, y, z, o) => { const v = 0.035 + hash(x, y, z) * 0.03; const line = Math.abs(Math.sin(z * 6 + x * 3)) < 0.06 ? 1 : 0; o[0] = line ? 0.9 : v * 1.1; o[1] = line ? 0.25 : v; o[2] = line ? 0.04 : v * 0.9; o[3] = line * 0.8; };
  const body = new THREE.SphereGeometry(0.34, 12, 8); body.scale(1, 0.7, 2.0); body.translate(0, 0.42, 0.1); parts.push(part(THREE, body, 0, rock));
  const head = new THREE.ConeGeometry(0.24, 0.62, 6); head.rotateX(Math.PI / 2); head.scale(1.1, 0.55, 1); head.translate(0, 0.48, 0.92); parts.push(part(THREE, head, 6, (x, y, z, o) => { const eye = Math.abs(Math.abs(x) - 0.12) < 0.05 && z > 0.72 && z < 0.86 && y > 0.5 ? 1 : 0; o[0] = eye ? 1 : 0.05; o[1] = eye ? 0.55 : 0.04; o[2] = eye ? 0.05 : 0.035; o[3] = eye; }));
  for (const s of [-1, 1]) { const h = new THREE.ConeGeometry(0.04, 0.16, 4); h.rotateX(-0.9); h.translate(s * 0.1, 0.6, 0.72); parts.push(part(THREE, h, 6, (x, y, z, o) => { o[0] = 0.06; o[1] = 0.05; o[2] = 0.04; o[3] = 0; })); }
  for (let i = 0; i < 6; i++) { const sp = new THREE.ConeGeometry(0.05, 0.2 + (i < 3 ? i : 5 - i) * 0.05, 4); sp.translate(0, 0.72, 0.45 - i * 0.16); parts.push(part(THREE, sp, 0, (x, y, z, o) => { o[0] = 0.9; o[1] = 0.28; o[2] = 0.05; o[3] = 0.9; })); }
  const legs = [[-1, 0.42], [1, 0.42], [-1, -0.28], [1, -0.28]];
  legs.forEach(([sx, z], i) => { const l = new THREE.CylinderGeometry(0.06, 0.08, 0.5, 5); l.rotateZ(sx * 0.9); l.translate(sx * 0.32, 0.25, z); parts.push(part(THREE, l, 1 + i, (x, y, zz, o) => { o[0] = 0.04; o[1] = 0.035; o[2] = 0.03; o[3] = 0; })); });
  const tail = new THREE.ConeGeometry(0.2, 1.5, 8, 6); tail.rotateX(-Math.PI / 2); tail.translate(0, 0.38, -1.25); parts.push(part(THREE, tail, 5, rock));
  return mergeGeometries(parts);
}
function quadruped(THREE, o) {
  // shared four-legged body: aPart 1–4 legs, 5 tail, 6 head, 0 body/back; o: dims + colour/glow functions
  const parts = [];
  const body = new THREE.SphereGeometry(o.bodyR, 14, 10); body.scale(o.bodyW, o.bodyH, o.bodyL); body.translate(0, o.hip, 0); parts.push(part(THREE, body, 0, o.fur));
  const chest = new THREE.SphereGeometry(o.bodyR * 0.95, 12, 8); chest.scale(o.bodyW * 1.05, o.bodyH * 1.1, o.bodyL * 0.55); chest.translate(0, o.hip + 0.05, o.bodyL * o.bodyR * 0.55); parts.push(part(THREE, chest, 0, o.fur));
  const head = o.head(); parts.push(part(THREE, head, 6, o.headCol));
  const legs = [[-1, o.legZ[0]], [1, o.legZ[0]], [-1, o.legZ[1]], [1, o.legZ[1]]];
  legs.forEach(([sx, z], i) => { const l = new THREE.CylinderGeometry(o.legR * 0.7, o.legR, o.hip, 6); l.translate(sx * o.bodyR * o.bodyW * 0.6, o.hip / 2, z); parts.push(part(THREE, l, 1 + i, o.legCol)); });
  if (o.tail) parts.push(part(THREE, o.tail(), 5, o.fur));
  for (const extra of o.extras || []) parts.push(part(THREE, extra.g, extra.part ?? 0, extra.col));
  return mergeGeometries(parts);
}
function wolfGeo(THREE) {
  const fur = (x, y, z, o) => { const v = 0.035 + hash(x, y, z) * 0.025; const crack = Math.abs(Math.sin(z * 7 + x * 4)) < 0.07 && y > 0.75 ? 1 : 0; o[0] = crack ? 0.9 : v * 1.05; o[1] = crack ? 0.22 : v * 0.9; o[2] = crack ? 0.04 : v * 0.85; o[3] = crack * 0.9; };
  return quadruped(THREE, {
    bodyR: 0.36, bodyW: 0.85, bodyH: 0.85, bodyL: 1.9, hip: 0.72, legR: 0.07, legZ: [0.42, -0.42], fur,
    head: () => { const h = new THREE.ConeGeometry(0.2, 0.62, 7); h.rotateX(Math.PI / 2); h.scale(1, 0.85, 1); h.translate(0, 0.95, 0.95); const ears = [-1, 1].map((s) => new THREE.ConeGeometry(0.06, 0.18, 4).translate(s * 0.1, 1.12, 0.78)); return mergeGeometries([ni(h), ...ears.map(ni)]); },
    headCol: (x, y, z, o) => { const eye = Math.abs(Math.abs(x) - 0.08) < 0.04 && y > 0.98 && z > 0.85 && z < 1.0 ? 1 : 0; o[0] = eye ? 1 : 0.04; o[1] = eye ? 0.55 : 0.035; o[2] = eye ? 0.08 : 0.03; o[3] = eye; },
    legCol: (x, y, z, o) => { o[0] = 0.03; o[1] = 0.028; o[2] = 0.026; o[3] = 0; },
    tail: () => { const t = new THREE.ConeGeometry(0.12, 0.8, 6); t.rotateX(-Math.PI / 2 - 0.5); t.translate(0, 0.78, -0.95); return t; },
    extras: [{ g: (() => { const m = new THREE.SphereGeometry(0.3, 8, 6); m.scale(0.9, 0.9, 1.1); m.translate(0, 0.98, 0.42); return m; })(), col: (x, y, z, o) => { o[0] = 0.8; o[1] = 0.22; o[2] = 0.04; o[3] = 0.5; } }], // ember mane
  });
}
function boarGeo(THREE) {
  const hide = (x, y, z, o) => { const v = 0.06 + hash(x, y, z) * 0.03; o[0] = v * 1.2; o[1] = v; o[2] = v * 0.85; o[3] = 0; };
  const crystals = []; const r = (i) => hash(i, i * 1.7, i * 2.3);
  for (let i = 0; i < 9; i++) { const c = new THREE.OctahedronGeometry(0.16, 0); c.scale(0.6, 2.2 + r(i) * 1.6, 0.6); c.rotateZ((r(i + 9) - 0.5) * 0.9); c.rotateX((r(i + 3) - 0.5) * 0.6); c.translate((r(i + 5) - 0.5) * 0.55, 1.18 + r(i + 7) * 0.12, 0.55 - i * 0.14); crystals.push(ni(c)); }
  return quadruped(THREE, {
    bodyR: 0.55, bodyW: 0.95, bodyH: 0.9, bodyL: 1.55, hip: 0.62, legR: 0.11, legZ: [0.5, -0.45], fur: hide,
    head: () => { const h = new THREE.BoxGeometry(0.42, 0.42, 0.62, 2, 2, 3); h.translate(0, 0.62, 1.2); const snout = new THREE.CylinderGeometry(0.13, 0.16, 0.2, 8); snout.rotateX(Math.PI / 2); snout.translate(0, 0.55, 1.55); return mergeGeometries([ni(h), ni(snout)]); },
    headCol: (x, y, z, o) => { const eye = Math.abs(Math.abs(x) - 0.17) < 0.05 && y > 0.68 && z > 1.25 && z < 1.4 ? 1 : 0; o[0] = eye ? 0.4 : 0.07; o[1] = eye ? 0.9 : 0.055; o[2] = eye ? 1 : 0.045; o[3] = eye * 0.6; },
    legCol: (x, y, z, o) => { o[0] = 0.05; o[1] = 0.04; o[2] = 0.035; o[3] = 0; },
    tail: () => { const t = new THREE.CylinderGeometry(0.02, 0.04, 0.3, 4); t.rotateX(0.6); t.translate(0, 0.75, -0.9); return t; },
    extras: [
      { g: mergeGeometries(crystals), col: (x, y, z, o) => { o[0] = 0.3; o[1] = 0.7; o[2] = 0.9; o[3] = 0.4; } },
      ...[-1, 1].map((s) => ({ part: 6, g: (() => { const t = new THREE.ConeGeometry(0.05, 0.42, 5); t.rotateX(-0.7); t.rotateZ(s * 0.5); t.translate(s * 0.2, 0.62, 1.55); return t; })(), col: (x, y, z, o) => { o[0] = 0.8; o[1] = 0.78; o[2] = 0.7; o[3] = 0; } })),
    ],
  });
}
function moleGeo(THREE) {
  // ≈3.3 m: heavy rock-armoured body with overlapping plates, huge digging fore-claws (aPart 1, 2), small blind head, back crystals (Grand Mole: bigger scale)
  const plate = (x, y, z, o) => { const v = 0.06 + hash(Math.floor(x * 4), Math.floor(y * 4), Math.floor(z * 4)) * 0.05; const seam = Math.abs(Math.sin(z * 5)) < 0.08 ? 1 : 0; o[0] = seam ? 0.35 : v * 1.1; o[1] = seam ? 0.12 : v; o[2] = seam ? 0.05 : v * 0.85; o[3] = seam * 0.35; };
  const body = new THREE.SphereGeometry(0.9, 16, 10); body.scale(1, 0.78, 1.5); body.translate(0, 0.95, -0.2);
  const parts = [part(THREE, body, 0, plate)];
  const head = new THREE.ConeGeometry(0.42, 1.0, 8); head.rotateX(Math.PI / 2); head.scale(1, 0.75, 1); head.translate(0, 0.8, 1.55); parts.push(part(THREE, head, 6, (x, y, z, o) => { const nose = z > 1.9 ? 1 : 0; o[0] = nose ? 0.45 : 0.07; o[1] = nose ? 0.25 : 0.06; o[2] = nose ? 0.22 : 0.05; o[3] = 0; }));
  [-1, 1].forEach((sx, i) => {
    const arm = new THREE.CylinderGeometry(0.22, 0.3, 0.9, 7); arm.rotateZ(sx * 0.8); arm.translate(sx * 0.85, 0.6, 0.85); parts.push(part(THREE, arm, 1 + i, plate));
    for (let k = 0; k < 4; k++) { const cl = new THREE.ConeGeometry(0.07, 0.55, 4); cl.rotateX(1.9); cl.translate(sx * (1.05 + k * 0.1) - sx * 0.15, 0.22, 1.2 + (k - 1.5) * 0.05); parts.push(part(THREE, cl, 1 + i, (x, y, z, o) => { o[0] = 0.75; o[1] = 0.7; o[2] = 0.6; o[3] = 0; })); }
  });
  [-1, 1].forEach((sx, i) => { const l = new THREE.CylinderGeometry(0.16, 0.22, 0.7, 6); l.translate(sx * 0.65, 0.35, -1.0); parts.push(part(THREE, l, 3 + i, plate)); });
  for (let i = 0; i < 6; i++) { const c = new THREE.OctahedronGeometry(0.15, 0); c.scale(0.7, 2.4, 0.7); c.rotateZ((hash(i, 2, 3) - 0.5) * 0.8); c.translate((hash(i, 5, 1) - 0.5) * 0.9, 1.65, 0.1 - i * 0.3); parts.push(part(THREE, c, 0, (x, y, z, o) => { o[0] = 0.5; o[1] = 0.85; o[2] = 0.95; o[3] = 0.35; })); }
  return mergeGeometries(parts);
}
function golemGeo(THREE) {
  // ≈4 m standing: stacked boulders. aPart 1/2 arms, 3/4 legs, 7 magma core (chest). Dormant pose is driven in the shader.
  const rock = (seed) => (x, y, z, o) => { const v = 0.05 + hash(Math.floor(x * 3) + seed, Math.floor(y * 3), Math.floor(z * 3)) * 0.04; const ash = y > 2.6 ? 0.08 : 0; const crack = Math.abs(Math.sin(x * 6 + y * 4 + seed)) < 0.05 ? 1 : 0; o[0] = crack ? 0.9 : v + ash; o[1] = crack ? 0.25 : v * 0.95 + ash; o[2] = crack ? 0.04 : v * 0.9 + ash; o[3] = crack * 0.7; };
  const lump = (r, sx, sy, sz, x, y, z, seed) => { const g = new THREE.IcosahedronGeometry(r, 1); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const k = 1 + 0.18 * (hash(p.getX(i) * 3 + seed, p.getY(i) * 3, p.getZ(i) * 3) - 0.5); p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k); } g.scale(sx, sy, sz); g.translate(x, y, z); return g; };
  const parts = [];
  parts.push(part(THREE, lump(1.25, 1.1, 0.95, 0.9, 0, 2.2, 0, 1), 0, rock(1)));              // torso
  parts.push(part(THREE, lump(0.8, 1, 0.8, 1, 0, 1.15, -0.1, 2), 0, rock(2)));                // hips
  parts.push(part(THREE, lump(0.45, 1, 0.85, 1, 0, 3.35, 0.35, 3), 6, rock(3)));              // head
  const core = new THREE.IcosahedronGeometry(0.42, 1); core.translate(0, 2.25, 0.88); parts.push(part(THREE, core, 7, (x, y, z, o) => { o[0] = 1; o[1] = 0.4; o[2] = 0.06; o[3] = 1; }));
  [-1, 1].forEach((sx, i) => { parts.push(part(THREE, lump(0.55, 0.9, 1.5, 0.9, sx * 1.7, 2.0, 0.2, 4 + i), 1 + i, rock(4 + i))); parts.push(part(THREE, lump(0.6, 1.1, 0.9, 1.1, sx * 1.85, 0.9, 0.45, 6 + i), 1 + i, rock(6 + i))); });
  [-1, 1].forEach((sx, i) => parts.push(part(THREE, lump(0.5, 0.9, 1.2, 0.9, sx * 0.6, 0.45, -0.1, 8 + i), 3 + i, rock(8 + i))));
  return mergeGeometries(parts);
}
function moundGeo(THREE) {
  const g = new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  return part(THREE, g, 0, (x, y, z, o) => { const v = 0.07 + hash(Math.floor(x * 6), y, Math.floor(z * 6)) * 0.05; o[0] = v * 1.1; o[1] = v; o[2] = v * 0.9; o[3] = 0; });
}
function drakeGeo(THREE) {
  const base = lizardGeo(THREE); const parts = [base];
  for (const s of [-1, 1]) {
    const w = new THREE.PlaneGeometry(1.1, 0.7, 4, 2); w.rotateX(-Math.PI / 2); const wp = w.attributes.position;
    for (let i = 0; i < wp.count; i++) { const x = wp.getX(i) + 0.55, z = wp.getZ(i); wp.setXYZ(i, s * (0.22 + x * 0.55), 0.66 + x * 0.12, 0.2 + z * 0.6 - x * 0.35); }
    parts.push(part(THREE, w, 7, (x, y, z, o) => { const t = Math.min(1, Math.abs(x) / 0.8); const tear = hash(Math.floor(x * 9), 0, Math.floor(z * 9)) > 0.8 ? 1 : 0; o[0] = 0.06 + t * 0.3; o[1] = 0.035 + t * 0.06; o[2] = 0.03; o[3] = tear * 0.4 + (t > 0.85 ? 0.3 : 0); }));
  }
  return mergeGeometries(parts);
}
function snakeSegGeo(THREE) {
  // one body segment along +z (length 1): cooled black rock plates with molten seams between them
  const g = new THREE.CylinderGeometry(0.5, 0.5, 1.02, 10, 3, true); g.rotateX(Math.PI / 2); const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const k = 1 + 0.08 * Math.sin(Math.atan2(y, x) * 5 + z * 3); p.setXYZ(i, x * k, y * k * 0.85, z); }
  return part(THREE, g, 0, (x, y, z, o) => { const seam = Math.abs(z) > 0.46 || Math.abs(Math.sin(Math.atan2(y, x) * 5)) < 0.06 ? 1 : 0; const v = 0.03 + hash(x, y, z) * 0.02; o[0] = seam ? 1 : v; o[1] = seam ? 0.32 : v * 0.95; o[2] = seam ? 0.05 : v * 0.9; o[3] = seam; });
}
function snakeHeadGeo(THREE) {
  // crocodile/serpent head along +z; lower jaw = aPart 1 (opens with aAnim.y); mouth full of glowing lava
  const parts = [];
  const top = new THREE.BoxGeometry(0.9, 0.42, 1.5, 4, 2, 6); top.translate(0, 0.12, 0.55); const tp = top.attributes.position;
  for (let i = 0; i < tp.count; i++) { const z = tp.getZ(i); const k = 1 - Math.max(0, z - 0.2) * 0.42; tp.setX(i, tp.getX(i) * k); tp.setY(i, tp.getY(i) * (0.8 + 0.2 * k)); }
  parts.push(part(THREE, top, 0, (x, y, z, o) => { const eye = Math.abs(Math.abs(x) - 0.33) < 0.08 && y > 0.25 && Math.abs(z - 0.25) < 0.1 ? 1 : 0; const v = 0.035 + hash(x, y, z) * 0.02; o[0] = eye ? 1 : v; o[1] = eye ? 0.7 : v; o[2] = eye ? 0.1 : v * 0.9; o[3] = eye; }));
  const jaw = new THREE.BoxGeometry(0.8, 0.22, 1.4, 3, 1, 5); jaw.translate(0, -0.18, 0.55); const jp = jaw.attributes.position;
  for (let i = 0; i < jp.count; i++) { const z = jp.getZ(i); jp.setX(i, jp.getX(i) * (1 - Math.max(0, z - 0.2) * 0.45)); }
  parts.push(part(THREE, jaw, 1, (x, y, z, o) => { const inner = y > -0.1 ? 1 : 0; o[0] = inner ? 0.8 : 0.04; o[1] = inner ? 0.25 : 0.035; o[2] = inner ? 0.04 : 0.03; o[3] = inner * 0.5; }));
  const tongue = new THREE.PlaneGeometry(0.6, 1.2); tongue.rotateX(-Math.PI / 2); tongue.translate(0, -0.06, 0.6); parts.push(part(THREE, tongue, 1, (x, y, z, o) => { o[0] = 1; o[1] = 0.4; o[2] = 0.06; o[3] = 0.7; }));
  for (let i = 0; i < 6; i++) { const f = new THREE.ConeGeometry(0.035, 0.16, 4); f.rotateX(Math.PI); f.translate((i % 2 ? 1 : -1) * 0.3 * (1 - i * 0.08), -0.02, 0.4 + i * 0.16); parts.push(part(THREE, f, 0, (x, y, z, o) => { o[0] = 0.02; o[1] = 0.02; o[2] = 0.025; o[3] = 0; })); }
  return mergeGeometries(parts);
}

const VERT = {
  lizard: `
  float ph = aAnim.x, mv = aAnim.y, mode = aAnim.z;
  if (aPart >= 1.0 && aPart <= 4.0) { float k = (aPart == 1.0 || aPart == 4.0) ? 0.0 : 3.14159; transformed.z += sin(ph * 8.0 + k) * 0.22 * mv; transformed.y += max(0.0, sin(ph * 8.0 + k)) * 0.08 * mv; }
  if (aPart == 5.0) { float w = clamp(-transformed.z - 0.5, 0.0, 2.0); transformed.x += sin(ph * (mode > 1.5 && mode < 2.5 ? 1.0 : 4.0) - w * 1.6) * 0.18 * w * (0.4 + mv); if (mode > 0.5 && mode < 1.5) transformed.y += w * w * 0.12 * (0.5 + 0.5 * sin(ph * 6.0)); }
  if (mode > 0.5 && mode < 1.5) { float f = clamp(transformed.z + 0.3, 0.0, 1.5); transformed.y += f * 0.35; }
  if (mode > 1.5 && mode < 2.5) transformed.y *= 0.8;
  if (mode > 2.5) { transformed.y += sin(ph * 14.0) * 0.03; }`,
  wolf: `
  float ph = aAnim.x, mv = aAnim.y, mode = aAnim.z;
  float fast = mode > 2.5 ? 1.8 : 1.0;
  if (aPart >= 1.0 && aPart <= 4.0) { float k = (aPart == 1.0 || aPart == 4.0) ? 0.0 : 3.14159; float sw = sin(ph * 9.0 * fast + k); transformed.z += sw * 0.28 * mv * (1.0 - transformed.y / 0.8); }
  if (aPart == 5.0) { transformed.x += sin(ph * 5.0) * 0.12 * (0.3 + mv); }
  if (mode > 0.5 && mode < 1.5) { transformed.y -= clamp(transformed.z + 0.2, 0.0, 1.5) * 0.18; }
  if (mode > 1.5 && mode < 2.5) { transformed.y *= 0.45; }`,
  boar: `
  float ph = aAnim.x, mv = aAnim.y, mode = aAnim.z;
  float fast = mode > 2.5 ? 2.0 : 1.0;
  if (aPart >= 1.0 && aPart <= 4.0) { float k = (aPart == 1.0 || aPart == 4.0) ? 0.0 : 3.14159; transformed.z += sin(ph * 8.0 * fast + k) * 0.22 * mv * (1.0 - transformed.y / 0.7);
    if (mode > 0.5 && mode < 1.5 && aPart == 1.0) transformed.z += sin(ph * 10.0) * 0.18 * (1.0 - transformed.y / 0.7); }
  if (aPart == 6.0 && mode > 0.5 && mode < 1.5) { transformed.y -= 0.18; }
  if (mode > 1.5 && mode < 2.5) { transformed.y *= 0.7; }`,
  mole: `
  float ph = aAnim.x, mv = aAnim.y, mode = aAnim.z;
  if (aPart >= 1.0 && aPart <= 2.0) { float s = aPart == 1.0 ? 0.0 : 3.14159; transformed.z += sin(ph * 7.0 + s) * 0.3 * mv; if (mode > 0.5 && mode < 1.5) { transformed.y += 0.5 + sin(ph * 6.0 + s) * 0.2; transformed.z += 0.3; } }
  if (aPart >= 3.0 && aPart <= 4.0) { transformed.z += sin(ph * 7.0 + aPart * 3.14159) * 0.2 * mv; }
  if (mode > 2.5) { transformed.y -= clamp(transformed.z, 0.0, 2.0) * 0.12; }`,
  golem: `
  float ph = aAnim.x, rise = aAnim.y, arm = aAnim.z;
  // dormant: hunched into a single boulder (arms tucked, head sunk), standing as rise → 1
  float k = rise;
  if (aPart == 1.0 || aPart == 2.0) { transformed.x *= mix(0.55, 1.0, k); transformed.y = mix(transformed.y * 0.55 + 0.3, transformed.y, k);
    float up = arm > 0.0 ? arm : 0.0; float down = arm < 0.0 ? -arm : 0.0; transformed.y += up * 1.6 * smoothstep(0.5, 2.6, transformed.y) ; transformed.z += up * 0.6 - down * 0.2; transformed.y -= down * 0.8 * smoothstep(0.5, 2.6, transformed.y) * 0.5;
    transformed.z += sin(ph * 2.0 + aPart * 3.14159) * 0.15 * k; }
  if (aPart >= 3.0 && aPart <= 4.0) { transformed.z += sin(ph * 2.0 + aPart * 3.14159) * 0.25 * k; transformed.y *= mix(0.6, 1.0, k); }
  if (aPart == 0.0 || aPart == 6.0 || aPart == 7.0) { transformed.y = mix(transformed.y * 0.55, transformed.y, k); if (aPart == 6.0) transformed.y -= (1.0 - k) * 0.6; }`,
  drake: `
  float ph = aAnim.x, mv = aAnim.y, mode = aAnim.z;
  if (aPart >= 1.0 && aPart <= 4.0) { float k = (aPart == 1.0 || aPart == 4.0) ? 0.0 : 3.14159; transformed.z += sin(ph * 8.0 + k) * 0.22 * mv; transformed.y += max(0.0, sin(ph * 8.0 + k)) * 0.08 * mv; }
  if (aPart == 5.0) { float w = clamp(-transformed.z - 0.5, 0.0, 2.0); transformed.x += sin(ph * (mode > 1.5 && mode < 2.5 ? 1.0 : 4.0) - w * 1.6) * 0.18 * w * (0.4 + mv); if (mode > 0.5 && mode < 1.5) transformed.y += w * w * 0.12 * (0.5 + 0.5 * sin(ph * 6.0)); }
  if (mode > 0.5 && mode < 1.5) { float f = clamp(transformed.z + 0.3, 0.0, 1.5); transformed.y += f * 0.35; }
  if (mode > 1.5 && mode < 2.5) transformed.y *= 0.8;
  if (mode > 2.5) { transformed.y += sin(ph * 14.0) * 0.03; }
  if (aPart == 7.0) { float flare = (mode > 0.5 && mode < 1.5) ? 1.0 : 0.0; transformed.y += flare * abs(transformed.x) * 0.9; transformed.x *= 1.0 + flare * 0.6; }`,
  mound: ``,
  snakeSeg: ``,
  snakeHead: `
  if (aPart == 1.0) { float a = aAnim.y * 0.7; float z = transformed.z; float y = transformed.y; transformed.y = y * cos(a) - z * sin(a); transformed.z = y * sin(a) + z * cos(a); }`,

  beetle: `
  float ph = aAnim.x, mv = aAnim.y, mode = aAnim.z;
  if (aPart >= 1.0 && aPart <= 6.0) { float k = mod(aPart, 2.0) * 2.0 - 1.0; float row = floor((aPart - 1.0) / 2.0); float sw = sin(ph * 9.0 + aPart * 3.14159) * 0.16 * mv; transformed.z += sw * abs(transformed.x); transformed.y += max(0.0, sin(ph * 9.0 + aPart * 3.14159)) * 0.06 * mv;
    if (mode > 0.5 && mode < 1.5) { transformed.x *= 0.35; transformed.y = max(transformed.y, 0.12); } }
  if (aPart == 7.0) { transformed.x += sin(ph * 13.0 + transformed.x * 20.0) * 0.05 * (mode > 1.5 ? 2.0 : 0.6); }
  if (aPart == 8.0) { transformed.x *= 1.0 + 0.35 * sin(ph * 6.0) * (1.0 - mv); }
  if (mode > 0.5 && mode < 1.5) { transformed.z *= 0.86; transformed.y *= 0.82; }`,
  slime: `
  float ph = aAnim.x, mv = aAnim.y, mode = aAnim.z;
  float wob = sin(ph * 3.0 + position.x * 6.0) * 0.06 + sin(ph * 4.3 + position.z * 7.0) * 0.05;
  transformed += normal * wob * (1.0 + mv);
  if (mode > 0.5 && mode < 1.5) { transformed.y *= 0.72; transformed.xz *= 1.12; }
  if (mode > 1.5) { float s = 1.0 + 0.18 * sin(ph * 14.0); transformed *= s; }
  transformed.z += mv * 0.12 * sin(ph * 5.0) * transformed.y;`,
  bird: `
  float ph = aAnim.x, mv = aAnim.y, mode = aAnim.z;
  if (aPart == 1.0 || aPart == 2.0) {
    float span = abs(transformed.x);
    if (mode < 0.5) transformed.y += sin(ph * 7.0) * span * 0.75;
    else if (mode < 1.5) transformed.y += (0.06 + sin(ph * 1.3) * 0.04) * span;
    else { transformed.x *= 0.22; transformed.y += 0.08 - span * 0.05; transformed.z -= span * 0.55; }
  }
  if (aPart == 3.0) transformed.y += sin(ph * 3.0) * 0.05;`,
};

export function createFaunaRender(THREE, scene, { low = false, caps = { beetle: 220, slime: 180, bird: 60, lizard: 40, snakeSeg: 200, snakeHead: 10, wolf: 40, boar: 40, mole: 12, golem: 16, mound: 12, drake: 16 } } = {}) {
  const geos = { beetle: beetleGeo(THREE), slime: slimeGeo(THREE), bird: birdGeo(THREE), lizard: lizardGeo(THREE), snakeSeg: snakeSegGeo(THREE), snakeHead: snakeHeadGeo(THREE), wolf: wolfGeo(THREE), boar: boarGeo(THREE), mole: moleGeo(THREE), golem: golemGeo(THREE), mound: moundGeo(THREE), drake: drakeGeo(THREE) };
  const glowCol = { beetle: [1.0, 0.36, 0.05], slime: [1.0, 0.42, 0.06], bird: [1.0, 0.4, 0.08], lizard: [1.0, 0.32, 0.05], snakeSeg: [1.0, 0.34, 0.04], snakeHead: [1.0, 0.36, 0.05], wolf: [1.0, 0.3, 0.05], boar: [0.35, 0.85, 1.0], mole: [1.0, 0.45, 0.15], golem: [1.0, 0.36, 0.05], mound: [0, 0, 0], drake: [1.0, 0.32, 0.06] };
  const meshes = {}; const anims = {};
  for (const sp of Object.keys(geos)) {
    const cap = Math.round(caps[sp] * (low ? 0.7 : 1));
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: sp === 'slime' ? 0.35 : 0.75, metalness: 0, side: sp === 'bird' ? THREE.DoubleSide : THREE.FrontSide });
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aPart; attribute float aGlow; attribute vec4 aAnim; varying float vGlow;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERT[sp]}\nvGlow = aGlow * (0.35 + aAnim.w);`);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vGlow;')
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(${glowCol[sp].join(',')}) * vGlow * ${sp === 'slime' ? '1.3' : sp.startsWith('snake') ? '0.9' : '1.9'};`);
    };
    mat.customProgramCacheKey = () => 'wb-fauna-' + sp;
    const anim = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4); anim.setUsage(THREE.DynamicDrawUsage);
    geos[sp].setAttribute('aAnim', anim);
    const m = new THREE.InstancedMesh(geos[sp], mat, cap); m.count = 0; m.frustumCulled = false; m.castShadow = !low; m.receiveShadow = false; m.name = 'fauna-' + sp;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.setColorAt(0, new THREE.Color(1, 1, 1)); m.instanceColor.setUsage(THREE.DynamicDrawUsage);
    scene.add(m); meshes[sp] = m; anims[sp] = anim;
  }
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(0, 0, 0, 'YXZ'), S = new THREE.Vector3(), C = new THREE.Color();
  const counts = Object.fromEntries(Object.keys(geos).map((k) => [k, 0]));
  return {
    meshes,
    begin() { for (const k in counts) counts[k] = 0; },
    // c: creature record (see fauna.js); writes one instance
    push(c, anim) {
      const sp = c.sp, m = meshes[sp]; const i = counts[sp]; if (i >= m.instanceMatrix.count) return;
      E.set(c.pitch || 0, c.yaw, c.roll || 0); Q.setFromEuler(E); const s = c.scale * (c.squash || 1); S.set(s, s, s);
      M.compose(c.pos, Q, S); m.setMatrixAt(i, M);
      const a = anims[sp].array; a[i * 4] = anim[0]; a[i * 4 + 1] = anim[1]; a[i * 4 + 2] = anim[2]; a[i * 4 + 3] = anim[3];
      const k = c.dead ? 0.35 : 1 + c.flash * 2; C.setRGB(k, c.dead ? 0.3 : k, c.dead ? 0.3 : k); m.setColorAt(i, C);
      counts[sp] = i + 1;
    },
    // raw instance (snake segments / heads): matrix already composed by the caller
    pushRaw(key, matrix, anim, bright = 1) {
      const m = meshes[key]; const i = counts[key]; if (i >= m.instanceMatrix.count) return;
      m.setMatrixAt(i, matrix); const a = anims[key].array; a[i * 4] = anim[0]; a[i * 4 + 1] = anim[1]; a[i * 4 + 2] = anim[2]; a[i * 4 + 3] = anim[3];
      C.setRGB(bright, bright, bright); m.setColorAt(i, C); counts[key] = i + 1;
    },
    end() {
      for (const sp of Object.keys(meshes)) { const m = meshes[sp]; m.count = counts[sp]; m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; anims[sp].needsUpdate = true; }
    },
    stats: () => ({ ...counts }),
  };
}
