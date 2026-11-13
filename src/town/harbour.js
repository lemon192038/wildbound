// Harbour: open sea (PBR water with swell, foam, depth tint), sailing ships, rowboats, the treadwheel cargo crane,
// and the great waterfall (scrolling ribbon + clifftop river).
import * as THREE from 'three';
import { mulberry32, makeNoise2D } from '../world/noise.js';
import { createWaterNormal } from '../world/textures.js';
import { Bucket, Frame, beam, rod, col, mat4 } from './kit.js';
import { PRIMS, RIVER_Z, CLIFF_X } from './layout.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const PI = Math.PI;

// ---------------- sea ----------------
export function createSea(scene, terrainY, shared, low) {
  const tN = createWaterNormal(THREE, 11, 256);
  const u = { uTime: shared.uTime, tWN: { value: tN } };
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.07, metalness: 0.0, transparent: true, envMapIntensity: 1.0 });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
uniform float uTime; attribute float aDepth; attribute float aFoam; varying float vDepth; varying float vFoam; varying vec3 vWW; varying float vCrest;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
{ vec3 w0 = (modelMatrix * vec4(transformed, 1.0)).xyz; float k = clamp(aDepth * 0.25, 0.0, 1.0);
  float s1 = sin(dot(w0.xz, vec2(0.11, 0.05)) + uTime * 1.1), s2 = sin(dot(w0.xz, vec2(-0.05, 0.13)) + uTime * 1.43), s3 = sin(dot(w0.xz, vec2(0.21, -0.17)) + uTime * 2.1);
  float h = (s1 * 0.16 + s2 * 0.11 + s3 * 0.05) * k; transformed.y += h; vCrest = h; }`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
vDepth = aDepth; vFoam = aFoam; vWW = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
uniform float uTime; uniform sampler2D tWN; varying float vDepth; varying float vFoam; varying vec3 vWW; varying float vCrest; vec3 seaN;`)
      .replace('#include <map_fragment>', `{
  vec2 p = vWW.xz; float t = uTime; float dist = length(vWW - cameraPosition);
  vec3 n1 = texture2D(tWN, p * 0.021 + vec2(t * 0.006, t * 0.004)).xyz * 2.0 - 1.0;
  vec3 n2 = texture2D(tWN, p * 0.067 + vec2(-t * 0.012, t * 0.015)).xyz * 2.0 - 1.0;
  vec3 n3 = texture2D(tWN, p * 0.19 + vec2(t * 0.03, -t * 0.022)).xyz * 2.0 - 1.0;
  float far = smoothstep(60.0, 600.0, dist);
  vec2 nxy = n1.xy * 0.6 + n2.xy * 0.45 * (1.0 - far * 0.6) + n3.xy * 0.3 * (1.0 - far);
  seaN = normalize(vec3(nxy.x * 0.42, 1.0, nxy.y * 0.42));
  float d = max(vDepth, 0.0);
  vec3 shallow = vec3(0.04, 0.34, 0.30), mid = vec3(0.008, 0.14, 0.2), deep = vec3(0.004, 0.06, 0.16);
  vec3 c = mix(shallow, mid, smoothstep(0.0, 3.0, d)); c = mix(c, deep, smoothstep(3.0, 12.0, d));
  c += vec3(0.02, 0.09, 0.08) * clamp(vCrest * 4.0, 0.0, 1.0);
  float fn = texture2D(tWN, p * 0.35 + vec2(t * 0.05, t * 0.03)).x;
  float shore = 1.0 - smoothstep(0.05, 0.9 + 0.25 * sin(t * 1.3 + p.x * 0.3), d);
  float foam = max(shore, vFoam * (0.7 + 0.3 * sin(t * 2.0 + p.y))) * smoothstep(0.42, 0.62, fn + 0.15 * shore);
  foam += smoothstep(0.88, 0.99, n2.x * 0.5 + 0.5) * 0.25 * (1.0 - far);
  c = mix(c, vec3(0.85, 0.9, 0.9), clamp(foam, 0.0, 1.0) * 0.85);
  float a = mix(0.62, 1.0, smoothstep(0.0, 2.2, d)); a = max(a, foam);
  a *= smoothstep(-0.05, 0.12, vDepth);
  diffuseColor = vec4(c, a);
}`)
      .replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(seaN, 0.0)).xyz);');
  };
  mat.customProgramCacheKey = () => 'town-sea-v1';
  // polar grid centred on the harbour: dense near, geometric growth outwards
  const cx = 5, cz = -30, AS = low ? 112 : 160, radii = [];
  { let r = 0, dr = low ? 2.8 : 2.0; while (r < 2800) { radii.push(r); if (r > 150) dr *= 1.09; r += dr; } }
  const pos = [], dep = [], foam = [], idx = [];
  const stone = PRIMS.filter((p) => p.kind !== 'deck' && !p.axis);
  const edgeD = (x, z) => { let d = 1e9; for (const p of stone) { const dd = p.circle ? Math.abs(Math.hypot(x - p.cx, z - p.cz) - p.r) : Math.hypot(Math.max(p.x0 - x, 0, x - p.x1), Math.max(p.z0 - z, 0, z - p.z1)); d = Math.min(d, dd); } return d; };
  for (let j = 0; j < radii.length; j++) for (let i = 0; i < AS; i++) {
    const a = (i / AS) * PI * 2, r = radii[j], x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    pos.push(x, 0, z);
    const ty = r < 400 ? terrainY(x, z) : -30; dep.push(Math.max(-1, -ty));
    foam.push(r < 200 ? Math.max(0, 1 - edgeD(x, z) / 1.6) : 0);
  }
  for (let j = 0; j < radii.length - 1; j++) for (let i = 0; i < AS; i++) {
    const a = j * AS + i, b = j * AS + (i + 1) % AS, c = a + AS, d = b + AS; idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setAttribute('aDepth', new THREE.Float32BufferAttribute(dep, 1)); g.setAttribute('aFoam', new THREE.Float32BufferAttribute(foam, 1));
  g.setIndex(idx); g.computeBoundingSphere();
  const m = new THREE.Mesh(g, mat); m.receiveShadow = true; m.renderOrder = 1; m.name = 'sea'; m.frustumCulled = false;
  scene.add(m);
  return m;
}

// ---------------- ships ----------------
function hullGeo(L, Bm, D, fb, rnd, paint) {
  const nt = 30, ns = 7, pos = [], uv = [], colr = [], idx = [];
  const hb = (t) => { const s = t < 0.25 ? 0.78 + 0.22 * Math.sin(t / 0.25 * PI / 2) : t < 0.62 ? 1 : Math.sqrt(Math.max(0, 1 - ((t - 0.62) / 0.38) ** 2)); return Bm / 2 * Math.max(0.03, s); };
  const yd = (t) => fb + 1.6 * Math.pow(Math.max(0, 0.18 - t) / 0.18, 1.5) + 1.3 * Math.pow(Math.max(0, t - 0.7) / 0.3, 2);
  const yk = (t) => -D * (t > 0.85 ? 1 - ((t - 0.85) / 0.15) ** 2 * 0.85 : 1) * (t < 0.06 ? 0.7 + t / 0.06 * 0.3 : 1);
  const band = col(paint), gold = col(0xc89a40), dark = col(0x4a3426), bot = col(0x3a2420);
  const rows = []; // per ring: s from -1..1 (port gunwale → keel → starboard gunwale), plus bulwark tops
  for (let i = 0; i <= nt; i++) {
    const t = i / nt, z = -L / 2 + t * L, w = hb(t), y0 = yd(t), y1 = yk(t);
    const ring = [];
    const pts = [[w * 0.96, y0 + 1.0]];
    for (let k = 0; k <= ns; k++) { const ph = (k / ns) * PI / 2; pts.push([w * Math.pow(Math.cos(ph * 0.97), 0.7) * (1 + 0.04 * Math.sin(ph * 2)), y0 - (y0 - y1) * Math.pow(Math.sin(ph), 1.4)]); }
    const full = [...pts.map(([x, y]) => [-x, y]), ...pts.slice(0, -1).reverse()];
    for (const [x, y] of full) {
      ring.push(pos.length / 3); pos.push(x, y, z); uv.push(z / 2.2, y / 2.2);
      const c = y > y0 - 0.8 ? band : y > y0 - 1.05 ? gold : y > 0.25 ? dark : bot; const k = 0.9 + rnd() * 0.15; colr.push(c[0] * k, c[1] * k, c[2] * k);
    }
    rows.push(ring);
  }
  for (let i = 0; i < nt; i++) for (let k = 0; k < rows[i].length - 1; k++) { const a = rows[i][k], b = rows[i][k + 1], c = rows[i + 1][k], d = rows[i + 1][k + 1]; idx.push(a, b, c, b, d, c); }
  // transom
  const r0 = rows[0], c0 = pos.length / 3; pos.push(0, (yd(0) + yk(0)) / 2, -L / 2); uv.push(0, 0); colr.push(...dark);
  for (let k = 0; k < r0.length - 1; k++) idx.push(c0, r0[k + 1], r0[k]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return { g, hb, yd };
}

export function createShip(M, o, low) {
  const rnd = mulberry32(o.seed || 5), { L, Bm } = o, D = 2.4, fb = o.fb || 3.0;
  const W = new Bucket('ship-wood', { s: 2 }), C = new Bucket('ship-cloth', { s: 2, wave: true }), MT = new Bucket('ship-metal'), GL = new Bucket('ship-glow');
  const ropes = [];
  const { g, hb, yd } = hullGeo(L, Bm, D, fb, rnd, o.paint || 0x1f6f8a);
  W.add(g, null, [1, 1, 1], { uv: 'keep' }); g.dispose();
  // inner bulwark + deck
  const deckY = (t) => yd(t) - 0.15;
  for (let i = 0; i < 12; i++) { const t0 = 0.04 + i / 12 * 0.9, t1 = t0 + 0.9 / 12, tm = (t0 + t1) / 2; const w = hb(tm) * 1.9; W.add(new THREE.BoxGeometry(w, 0.2, L * 0.9 / 12 + 0.05), mat4(0, deckY(tm), -L / 2 + tm * L), col(0x9a7a58, 0.06, rnd), { s: 2 }); for (const s of [-1, 1]) W.add(new THREE.BoxGeometry(0.12, 1.0, L * 0.9 / 12 + 0.05), mat4(s * (hb(tm) * 0.93 - 0.08), deckY(tm) + 0.6, -L / 2 + tm * L), col(0x6a4a30)); }
  // stern castle + forecastle
  const sc = Frame.at(0, deckY(0.1), -L / 2 + L * 0.11, 0), sw = hb(0.1) * 1.8;
  sc.box(W, sw, 2.6, L * 0.2, 0, 1.3, 0, col(0x6a4a30)); sc.box(W, sw + 0.3, 0.25, L * 0.21, 0, 2.7, 0, col(0x8a6a48));
  for (const s of [-1, 1]) for (let k = 0; k < 3; k++) sc.box(GL, 0.08, 0.6, 0.5, s * (sw / 2 + 0.02), 1.4, -L * 0.07 + k * L * 0.06, [2.2, 1.3, 0.5]);
  for (let k = 0; k < 4; k++) sc.box(GL, 0.55, 0.8, 0.08, -sw * 0.36 + k * sw * 0.24, 1.4, -L * 0.1 - 0.03, [2.4, 1.4, 0.5]);
  sc.box(W, sw + 0.4, 0.2, 0.9, 0, 0.6, -L * 0.1 - 0.4, col(0xc89a40)); // stern gallery
  for (const s of [-1, 1]) { sc.box(MT, 0.25, 0.4, 0.25, s * sw * 0.42, 3.4, -L * 0.1, col(0x3a3a3a)); sc.box(GL, 0.2, 0.3, 0.2, s * sw * 0.42, 3.4, -L * 0.1, [3, 1.8, 0.6]); }
  const fc = Frame.at(0, deckY(0.86), -L / 2 + L * 0.86, 0); fc.box(W, hb(0.86) * 1.7, 1.4, L * 0.12, 0, 0.7, 0, col(0x6a4a30));
  // rudder, bowsprit, figurehead
  W.add(new THREE.BoxGeometry(0.3, D + fb, 1.4), mat4(0, (fb - D) / 2, -L / 2 - 0.6), col(0x4a3426));
  const bs0 = V(0, yd(1) - 0.2, L / 2 - 0.5), bs1 = V(0, yd(1) + 3.2, L / 2 + 7.5); rod(W, bs0, bs1, 0.22, col(0x6a4a30), 8);
  const fh = new THREE.ConeGeometry(0.45, 2.4, 7); fh.rotateX(PI / 2 + 0.5); MT.add(fh, mat4(0, yd(1) - 0.6, L / 2 + 0.6), col(0xc89a40)); fh.dispose();
  MT.add(new THREE.SphereGeometry(0.5, 8, 6), mat4(0, yd(1) - 0.2, L / 2 + 0.1), col(0xc89a40));
  // masts, yards, sails
  const masts = [[0.62, 0.62], [0.42, 0.78], [0.2, 0.52]];
  const open = o.sails === 'open';
  for (const [t, hk] of masts) {
    const z = -L / 2 + t * L, y0 = deckY(t), H = L * hk;
    rod(W, V(0, y0 - 1, z), V(0, y0 + H, z), 0.32 - 0.08 * (t === 0.2), col(0x7a5a3a), 10);
    W.add(new THREE.CylinderGeometry(0.9, 0.7, 0.6, 10, 1, true), mat4(0, y0 + H * 0.66, z), col(0x6a4a30));
    W.add(new THREE.CylinderGeometry(0.95, 0.95, 0.12, 10), mat4(0, y0 + H * 0.64, z), col(0x6a4a30));
    const yards = t === 0.2 ? [0.42, 0.78] : [0.3, 0.6, 0.86];
    yards.forEach((yt, k) => {
      const yy = y0 + H * yt, span = Bm * (1.9 - k * 0.45) * (t === 0.2 ? 0.75 : 1);
      rod(W, V(-span / 2, yy, z + 0.3), V(span / 2, yy, z + 0.3), 0.12, col(0x6a4a30), 6);
      ropes.push([V(-span / 2, yy, z + 0.3), V(0, y0 + H + 0.3, z)], [V(span / 2, yy, z + 0.3), V(0, y0 + H + 0.3, z)]);
      if (open) {
        const sh = (k < yards.length - 1 ? (yards[k + 1] - yt) : (yt - yards[k - 1])) * H * 0.95, sg = new THREE.PlaneGeometry(span * 0.92, sh, 6, 5);
        const P = sg.attributes.position; for (let i = 0; i < P.count; i++) { const x = P.getX(i), y = P.getY(i); const bx = 1 - (2 * x / (span * 0.92)) ** 2, by = 1 - (2 * y / sh) ** 2; P.setZ(i, (bx * 0.8 + 0.2) * (by * 0.7 + 0.3) * span * 0.16); P.setX(i, x * (1 - 0.1 * (0.5 - y / sh))); }
        sg.computeVertexNormals();
        C.add(sg, mat4(0, yy - sh / 2 - 0.15, z + 0.55), col(0xece4d2, 0.03, rnd), { uv: 'keep', wave: (q) => 0.15 + 0.15 * Math.abs(q.x) / span });
        sg.dispose();
      } else {
        const fg = new THREE.CylinderGeometry(0.28, 0.28, span * 0.85, 8); fg.rotateZ(PI / 2); C.add(fg, mat4(0, yy - 0.35, z + 0.35), col(0xdcd2c0, 0.04, rnd), { uv: 'keep', wave: 0 }); fg.dispose();
      }
    });
    // pennant
    const pg = new THREE.PlaneGeometry(3.4, 0.7, 6, 1); const P = pg.attributes.position; for (let i = 0; i < P.count; i++) P.setY(i, P.getY(i) * (1 - (P.getX(i) + 1.7) / 3.4 * 0.85)); pg.translate(1.7, 0, 0); pg.rotateY(-PI / 2 + (rnd() - 0.5) * 0.4);
    C.add(pg, mat4(0, y0 + H + 0.1, z), col(o.flag || 0xb83a30), { uv: 'keep', wave: (q) => Math.min(1, Math.hypot(q.x, q.z) / 3.4) * 1.6 }); pg.dispose();
    // shrouds
    for (const s of [-1, 1]) for (let k = -2; k <= 2; k++) ropes.push([V(0, y0 + H * 0.64, z), V(s * hb(t) * 0.95, yd(t) + 0.9, z + k * 0.6)]);
    for (let k = 0; k < 6; k++) { const f = k / 6; ropes.push([V(-hb(t) * 0.95 * (1 - f), yd(t) + 0.9 + (H * 0.64 - 0.9) * f, z), V(hb(t) * 0.95 * (1 - f), yd(t) + 0.9 + (H * 0.64 - 0.9) * f, z)]); }
  }
  // stays + jib
  const tops = masts.map(([t, hk]) => V(0, deckY(t) + L * hk, -L / 2 + t * L));
  ropes.push([tops[1], bs1], [tops[0], tops[1]], [tops[2], tops[0]], [tops[2], V(0, yd(0) + 1.5, -L / 2)], [bs1, V(0, yd(1) - 2, L / 2 + 0.5)]);
  if (open) {
    const jg = new THREE.BufferGeometry(); const A = V(0, tops[1].y * 0.82, tops[1].z + 0.6), Bp = bs1.clone(), Cp = V(0, yd(1) + 0.6, L / 2 + 0.2);
    jg.setAttribute('position', new THREE.Float32BufferAttribute([A.x, A.y, A.z, Bp.x, Bp.y, Bp.z, Cp.x + 0.6, Cp.y, Cp.z, A.x, A.y, A.z, Cp.x + 0.6, Cp.y, Cp.z, Bp.x, Bp.y, Bp.z], 3)); jg.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 0, 0, 0, 0, 1, 0, 0, 1, 0], 2)); jg.computeVertexNormals();
    C.add(jg, null, col(0xe6dccb), { uv: 'keep', wave: 0.15 });
  }
  // cargo on deck, lanterns, anchors
  for (let k = 0; k < 5; k++) W.add(new THREE.BoxGeometry(0.9, 0.9, 0.9), mat4((rnd() - 0.5) * hb(0.5), deckY(0.5) + 0.45, -L / 2 + (0.3 + rnd() * 0.25) * L, rnd()), col(0x8a6a48, 0.1, rnd));
  for (const s of [-1, 1]) MT.add(new THREE.TorusGeometry(0.6, 0.1, 5, 10, PI), mat4(s * hb(0.9) * 0.95, yd(0.9) - 1.2, -L / 2 + 0.9 * L, s * PI / 2, 0, PI), col(0x2a2a2a));
  const grp = new THREE.Group(); grp.name = 'ship';
  for (const [b, m] of [[W, M.wood], [C, M.cloth], [MT, M.metal], [GL, M.glow]]) if (b.count) grp.add(b.mesh(m, { shadow: b !== GL }));
  const rp = []; for (const [a, b] of ropes) rp.push(a.x, a.y, a.z, b.x, b.y, b.z);
  const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3));
  const rl = new THREE.LineSegments(rg, M.rope); grp.add(rl);
  grp.userData.deckY = deckY(0.5);
  return grp;
}

export function addRowboats(B, list, rnd) {
  for (const [x, z, ry, paint] of list) {
    const { g } = hullGeo(4.6, 1.7, 0.45, 0.45, rnd, paint);
    B.wood.add(g, mat4(x, 0.08, z, ry, 0, (rnd() - 0.5) * 0.08), [1, 1, 1], { uv: 'keep' }); g.dispose();
    for (const k of [-0.9, 0.4]) B.wood.add(new THREE.BoxGeometry(1.5, 0.08, 0.35), mat4(x, 0.42, z, ry).multiply(mat4(0, 0, k)), col(0x8a6a48));
    B.wood.add(new THREE.BoxGeometry(0.08, 0.08, 2.8), mat4(x, 0.5, z, ry).multiply(mat4(0.95, 0, 0.2, 0, 0, 0.2)), col(0x7a5a3a));
  }
}

// ---------------- treadwheel crane (rotating jib) ----------------
export function createCrane(M, x, y, z) {
  const S = new Bucket('crane', { s: 2 }), MT = new Bucket('crane-m'), tc = col(0x5a3d29), ic = col(0x2e2c2a);
  const f = new Frame();
  f.cyl(S, 3.0, 3.3, 1.6, 0, 0.8, 0, col(0x9a9288), 16);
  // tower: 4 tapered posts + braces
  const P = (sx, sz, h) => V(sx * (2.2 - h * 0.06), h, sz * (2.2 - h * 0.06));
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) beam(S, P(sx, sz, 1.4), P(sx, sz, 14), 0.42, tc);
  for (const h of [4.5, 8.5, 12.5]) for (const [a, b] of [[[-1, -1], [1, -1]], [[1, -1], [1, 1]], [[1, 1], [-1, 1]], [[-1, 1], [-1, -1]]]) { beam(S, P(a[0], a[1], h), P(b[0], b[1], h), 0.28, tc); beam(S, P(a[0], a[1], h - 3.6), P(b[0], b[1], h), 0.2, tc); }
  S.add(new THREE.BoxGeometry(5, 0.6, 5), mat4(0, 14.2, 0), tc);
  // treadwheel on the landward side
  const tw = Frame.at(0, 6.2, 3.4, 0);
  for (const dx of [-0.9, 0.9]) { const tor = new THREE.TorusGeometry(3.6, 0.18, 6, 28); tor.rotateY(PI / 2); tw.put(S, tor, dx, 0, 0, tc); tor.dispose(); for (let k = 0; k < 8; k++) { const a = k / 8 * PI * 2; beam(S, tw.world(dx, 0, 0), tw.world(dx, Math.sin(a) * 3.5, Math.cos(a) * 3.5), 0.14, tc); } }
  for (let k = 0; k < 24; k++) { const a = k / 24 * PI * 2; S.add(new THREE.BoxGeometry(2.0, 0.1, 0.5), mat4(0, 6.2 + Math.sin(a) * 3.55, 3.4 + Math.cos(a) * 3.55, 0, -a), col(0x7a5a3a)); }
  tw.cyl(MT, 0.25, 0.25, 2.6, 0, 0, 0, ic, 8, undefined, 0, PI / 2);
  // jib (two booms + ties), pulley, rope; cargo hangs separately so it can swing
  const J0 = V(0, 14.5, 0), J1 = V(0, 24, -20);
  for (const s of [-1, 1]) { beam(S, V(s * 0.8, 14.4, 0.5), J1.clone().setX(s * 0.25), 0.5, tc); }
  for (let k = 1; k < 6; k++) { const p = J0.clone().lerp(J1, k / 6); beam(S, p.clone().setX(-0.7 + k * 0.1), p.clone().setX(0.7 - k * 0.1), 0.2, tc); }
  beam(S, V(0, 14.4, 2.2), V(0, 20, 0.5), 0.35, tc); // king post
  MT.add(new THREE.CylinderGeometry(0.55, 0.55, 0.3, 12).rotateZ(PI / 2), mat4(0, 23.8, -20.2), ic);
  const grp = new THREE.Group(); grp.position.set(x, y, z); grp.name = 'crane';
  grp.add(S.mesh(M.wood), MT.mesh(M.metal));
  const lines = [[J1.clone().setY(23.6), V(0, 9.5, -20.2)], [V(0, 20, 0.5), J1.clone()], [V(0, 20, 0.5), V(0, 14.5, 2.2)], [V(0, 23.6, -20), V(0, 6.2, 3.4)]];
  const lp = []; for (const [a, b] of lines) lp.push(a.x, a.y, a.z, b.x, b.y, b.z);
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3)); grp.add(new THREE.LineSegments(lg, M.rope));
  // cargo net with crates (pendulum)
  const cargo = new THREE.Group(); cargo.position.set(0, 9.5, -20.2);
  const CB = new Bucket('cargo', { s: 1.5 });
  for (const [cx, cy, cz] of [[-0.5, -1.6, 0], [0.5, -1.6, 0.1], [0, -0.75, 0]]) CB.add(new THREE.BoxGeometry(0.95, 0.85, 0.95), mat4(cx, cy, cz, 0.2), col(0x8a6a48, 0.1));
  cargo.add(CB.mesh(M.wood)); grp.add(cargo);
  grp.userData.cargo = cargo;
  return grp;
}

// ---------------- waterfall ----------------
export function createWaterfall(scene, terrainY, shared, low) {
  const S = 64, T = 256, d = new Uint8Array(S * T * 4), N = makeNoise2D(5);
  for (let y = 0; y < T; y++) for (let x = 0; x < S; x++) {
    const n = N.fbm(x / S * 8, y / T * 3, 4, 2, 0.5, 8) * 0.5 + 0.5, n2 = N.fbm(x / S * 24, y / T * 6, 3, 2, 0.5, 24) * 0.5 + 0.5;
    const v = Math.min(1, Math.max(0, (n * 0.7 + n2 * 0.5 - 0.35) * 1.6)); const i = (y * S + x) * 4; d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = v * 255;
  }
  const tex = new THREE.DataTexture(d, S, T); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true; tex.needsUpdate = true;
  const mk = (speed, tint, alpha) => {
    const m = new THREE.MeshBasicMaterial({ map: tex, color: tint, transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: alpha });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = shared.uTime;
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace('#include <map_fragment>', `
  vec2 uvA = vMapUv * vec2(1.0, 1.0) + vec2(0.0, uTime * ${speed.toFixed(2)});
  vec2 uvB = vMapUv * vec2(1.7, 0.6) + vec2(0.31, uTime * ${(speed * 1.35).toFixed(2)});
  float a = texture2D(map, uvA).a * 0.7 + texture2D(map, uvB).a * 0.6;
  float edge = smoothstep(0.0, 0.12, vMapUv.x) * smoothstep(1.0, 0.88, vMapUv.x);
  float body = 0.25 + 0.75 * a;
  diffuseColor.rgb *= mix(vec3(0.62, 0.78, 0.82), vec3(1.0), smoothstep(0.35, 0.9, a));
  diffuseColor.a *= clamp(body * edge, 0.0, 1.0);`);
    };
    m.customProgramCacheKey = () => 'town-fall-' + speed;
    return m;
  };
  const z0 = RIVER_Z, half = 5.5;
  // fall profile: hug the cliff face from the lip down to the sea
  const levels = [], NL = 18;
  const top = terrainY(CLIFF_X + 6, z0) + 1.0;
  for (let k = 0; k <= NL; k++) {
    const y = top - (top + 0.5) * Math.pow(k / NL, 1.15);
    let x = 80; while (x > 50 && terrainY(x, z0) > y) x -= 0.25;
    levels.push([Math.min(CLIFF_X + 3, x - 1.0 - (k / NL) * 1.5), y]);
  }
  const pos = [], uv = [], idx = [], SW = 8;
  for (let k = 0; k <= NL; k++) {
    const [x, y] = levels[k], t = k / NL, w = half * (1 + t * 0.35);
    for (let i = 0; i <= SW; i++) { const s = i / SW; pos.push(x - Math.sin(s * PI) * 0.8 * t, y, z0 - w + s * 2 * w); uv.push(s, -k / NL * 3); }
  }
  for (let k = 0; k < NL; k++) for (let i = 0; i < SW; i++) { const a = k * (SW + 1) + i, b = a + 1, c = a + SW + 1, dd = c + 1; idx.push(a, c, b, b, c, dd); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  const fallMat = mk(-1.25, 0xffffff, 0.95);
  const fall = new THREE.Mesh(g, fallMat); fall.renderOrder = 3; fall.name = 'waterfall'; scene.add(fall);
  // second, wider veil slightly in front for depth
  const g2 = g.clone(); const P2 = g2.attributes.position; for (let i = 0; i < P2.count; i++) { P2.setX(i, P2.getX(i) - 0.7); P2.setZ(i, z0 + (P2.getZ(i) - z0) * 1.12); }
  const veil = new THREE.Mesh(g2, mk(-0.9, 0xdff2f4, 0.55)); veil.renderOrder = 3; scene.add(veil);
  // river on the clifftop
  const rp = [], ru = [], ri = [], RN = 30;
  for (let k = 0; k <= RN; k++) { const x = CLIFF_X + 2 + k * 2.2, y = Math.max(terrainY(x, z0) + 1.2, top - 0.3) ; for (let i = 0; i <= 4; i++) { const s = i / 4; rp.push(x, k === 0 ? top : y, z0 - 6.5 + s * 13); ru.push(s, k * 0.25); } }
  for (let k = 0; k < RN; k++) for (let i = 0; i < 4; i++) { const a = k * 5 + i, b = a + 1, c = a + 5, dd = c + 1; ri.push(a, c, b, b, c, dd); }
  const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3)); rg.setAttribute('uv', new THREE.Float32BufferAttribute(ru, 2)); rg.setIndex(ri); rg.computeVertexNormals();
  const river = new THREE.Mesh(rg, mk(0.35, 0x9fd4d0, 0.9)); river.renderOrder = 2; scene.add(river);
  const base = V(levels[NL][0] - 1.5, 0.3, z0);
  return { base, top: V(levels[0][0], top, z0), half };
}
