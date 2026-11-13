// Instanced vegetation + rocks: wind-animated grass tufts, flowers, conifers / broadleaf trees, displaced boulders.
import * as THREE_NS from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeNoise2D, mulberry32, smoothstep, clamp, lerp } from './noise.js';
import { WATER_LEVEL } from './terrain.js';
import { ATLAS, createFoliageAtlas } from './textures.js';

const v3 = (v) => `vec3(${v.x.toFixed(5)}, ${v.y.toFixed(5)}, ${v.z.toFixed(5)})`;

// Shared wind / translucency injection for instanced foliage materials.
export function windMaterial(THREE, base, shared, kind) {
  const mat = base;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = shared.uTime; sh.uniforms.uPush = shared.uPush; sh.uniforms.uFade = shared.uFade;
    const isGrass = kind === 'grass';
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
uniform float uTime; uniform vec4 uPush[4]; uniform vec2 uFade;
attribute float aSway;
varying float vBend; varying vec3 vVW;
const vec3 WSUN = ${v3(shared.sunDir)};`)
      .replace('#include <beginnormal_vertex>', isGrass
        ? 'vec3 objectNormal = normalize(normal * 0.25 + vec3(0.0, 1.0, 0.0));'
        : '#include <beginnormal_vertex>')
      .replace('#include <project_vertex>', `
  mat4 iM = mat4(1.0);
  #ifdef USE_INSTANCING
  iM = instanceMatrix;
  #endif
  vec4 wp = modelMatrix * iM * vec4(transformed, 1.0);
  vec3 root = (modelMatrix * iM * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  float bend = aSway;
  vBend = bend;
  vec2 wdir = normalize(vec2(0.8, 0.45));
  float ph = dot(root.xz, vec2(0.11, 0.07));
  float gust = 0.5 + 0.5 * sin(uTime * 0.7 + root.x * 0.035 + root.z * 0.02);
  ${isGrass ? `
  float dist = distance(root.xz, cameraPosition.xz);
  float fade = 1.0 - smoothstep(uFade.x, uFade.y, dist);
  wp.xyz = root + (wp.xyz - root) * vec3(1.0, fade, 1.0);
  float hgt = max(wp.y - root.y, 0.0);
  float sway = (0.35 + 0.65 * gust) * (0.6 + 0.4 * sin(uTime * 2.3 + ph * 4.0)) + 0.15 * sin(uTime * 5.1 + ph * 13.0);
  wp.xz += wdir * sway * bend * bend * (0.18 + 0.25 * hgt);
  for (int i = 0; i < 4; i++) {
    vec2 d = wp.xz - uPush[i].xz; float l = length(d);
    float k = (1.0 - smoothstep(0.0, uPush[i].w, l)) * step(abs(wp.y - uPush[i].y), 2.5);
    wp.xz += (d / max(l, 1e-3)) * k * bend * 0.55; wp.y -= k * bend * hgt * 0.5;
  }` : `
  float sway = (0.4 + 0.6 * gust) * sin(uTime * 1.15 + ph * 3.0) + 0.25 * sin(uTime * 2.7 + ph * 7.0 + position.y);
  wp.xz += wdir * sway * bend * bend * 0.35;
  wp.y += 0.05 * sin(uTime * 3.0 + position.x * 2.0 + ph) * bend;`}
  vVW = wp.xyz - cameraPosition;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying float vBend; varying vec3 vVW;
const vec3 WSUN = ${v3(shared.sunDir)};`)
      .replace('#include <color_fragment>', `#include <color_fragment>
${isGrass ? 'diffuseColor.rgb *= mix(vec3(0.38, 0.42, 0.30), vec3(0.88, 0.92, 0.72), smoothstep(0.0, 1.0, vBend));' : ''}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{ float bl = pow(max(dot(normalize(vVW), WSUN), 0.0), 3.0);
  totalEmissiveRadiance += diffuseColor.rgb * vec3(1.0, 0.72, 0.42) * bl * ${isGrass ? '0.9 * vBend' : '0.22 * vBend'}; }`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''));
  };
  mat.customProgramCacheKey = () => 'wb-wind-' + kind;
  return mat;
}

// CPU-culled instancing: keeps all instance transforms, uploads only those inside the (inflated) camera frustum
// and distance band each time the camera moves noticeably. One draw call per set; keeps triangles bounded.
class CulledInstances {
  constructor(THREE, geo, mat, list, opts = {}) {
    const n = list.length; this.n = n;
    this.mats = new Float32Array(n * 16); this.cen = new Float32Array(n * 3); this.rad = new Float32Array(n); this.key = new Float32Array(n);
    this.cols = opts.colors ? new Float32Array(n * 3) : null;
    const r0 = geo.boundingSphere ? geo.boundingSphere.radius : 1, c0 = geo.boundingSphere ? geo.boundingSphere.center : new THREE.Vector3();
    const v = new THREE.Vector3(), sc = new THREE.Vector3();
    list.forEach((it, i) => {
      it.m.toArray(this.mats, i * 16);
      v.copy(c0).applyMatrix4(it.m); this.cen.set([v.x, v.y, v.z], i * 3);
      sc.setFromMatrixScale(it.m); this.rad[i] = r0 * Math.max(sc.x, sc.y, sc.z);
      this.key[i] = it.key ?? ((i * 0.618034) % 1);
      if (this.cols) { this.cols[i * 3] = it.c.r; this.cols[i * 3 + 1] = it.c.g; this.cols[i * 3 + 2] = it.c.b; }
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, n));
    this.mesh.frustumCulled = false; this.mesh.count = 0;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (this.cols) { this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, n) * 3), 3); this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage); }
    this.minD = opts.minD || 0; this.maxD = opts.maxD || 1e9; this.margin = opts.margin ?? 2; this.lod = opts.lod || null;
  }
  update(planes, cx, cy, cz) {
    const A = this.mesh.instanceMatrix.array, C = this.cols ? this.mesh.instanceColor.array : null;
    const min2 = this.minD * this.minD, max2 = this.maxD * this.maxD; let k = 0;
    const P = planes;
    for (let i = 0; i < this.n; i++) {
      const x = this.cen[i * 3], y = this.cen[i * 3 + 1], z = this.cen[i * 3 + 2];
      const dx = x - cx, dz = z - cz; const d2 = dx * dx + dz * dz;
      if (d2 > max2 || d2 < min2) continue;
      if (this.lod && this.key[i] > this.lod(Math.sqrt(d2))) continue;
      const r = -(this.rad[i] + this.margin); let out = false;
      for (let p = 0; p < 6; p++) { const pl = P[p]; if (pl.normal.x * x + pl.normal.y * y + pl.normal.z * z + pl.constant < r) { out = true; break; } }
      if (out) continue;
      A.set(this.mats.subarray(i * 16, i * 16 + 16), k * 16);
      if (C) { C[k * 3] = this.cols[i * 3]; C[k * 3 + 1] = this.cols[i * 3 + 1]; C[k * 3 + 2] = this.cols[i * 3 + 2]; }
      k++;
    }
    this.mesh.count = k;
    this.mesh.instanceMatrix.clearUpdateRanges(); this.mesh.instanceMatrix.addUpdateRange(0, Math.max(1, k) * 16); this.mesh.instanceMatrix.needsUpdate = true;
    if (C) { this.mesh.instanceColor.clearUpdateRanges(); this.mesh.instanceColor.addUpdateRange(0, Math.max(1, k) * 3); this.mesh.instanceColor.needsUpdate = true; }
  }
}

// ---------------- GEOMETRY BUILDERS ----------------
function bladeTuft(THREE, rnd, blades = 3) {
  const pos = [], uv = [], sway = [], idx = [], nrm = [];
  let base = 0;
  for (let b = 0; b < blades; b++) {
    const a = rnd() * Math.PI * 2, off = Math.sqrt(rnd()) * 0.32, ox = Math.cos(a) * off, oz = Math.sin(a) * off;
    const yaw = rnd() * Math.PI * 2, cy = Math.cos(yaw), sy = Math.sin(yaw);
    const h = 0.6 + rnd() * 0.55, w = 0.06 + rnd() * 0.04, curve = 0.15 + rnd() * 0.3;
    const SEGS = 3;
    for (let s = 0; s <= SEGS; s++) {
      const t = s / SEGS; const ww = w * (1 - t * 0.85) * (s === SEGS ? 0 : 1);
      const fz = curve * t * t; // lean forward
      for (const side of s === SEGS ? [0] : [-1, 1]) {
        const lx = side * ww, lz = fz;
        pos.push(ox + lx * cy - lz * sy, t * h, oz + lx * sy + lz * cy);
        nrm.push(-sy * 0 + sy, 0.3, cy); uv.push(side * 0.5 + 0.5, t); sway.push(t);
      }
    }
    for (let s = 0; s < SEGS - 1; s++) { const a0 = base + s * 2; idx.push(a0, a0 + 1, a0 + 2, a0 + 1, a0 + 3, a0 + 2); }
    const last = base + (SEGS - 1) * 2; idx.push(last, last + 1, last + 2);
    base += (SEGS) * 2 + 1;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aSway', new THREE.Float32BufferAttribute(sway, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function colorize(g, fn) {
  const p = g.attributes.position; const c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const [r, gg, b] = fn(p.getX(i), p.getY(i), p.getZ(i), i); c[i * 3] = r; c[i * 3 + 1] = gg; c[i * 3 + 2] = b; }
  g.setAttribute('color', new THREE_NS.Float32BufferAttribute(c, 3));
}
function setSway(THREE, g, fn) {
  const p = g.attributes.position; const s = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) s[i] = fn(p.getX(i), p.getY(i), p.getZ(i));
  g.setAttribute('aSway', new THREE.Float32BufferAttribute(s, 1));
}
function strip(g) { // keep only position/normal/color/aSway, non-indexed
  const n = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'color', 'aSway', 'uv'].includes(k)) n.deleteAttribute(k);
  return n;
}

// Geometry builder for atlas-textured vegetation (position, normal, color, uv, aSway; non-indexed).
export class GB {
  constructor() { this.p = []; this.n = []; this.c = []; this.u = []; this.s = []; }
  vert(x, y, z, nx, ny, nz, r, g, b, u, v, s) { this.p.push(x, y, z); this.n.push(nx, ny, nz); this.c.push(r, g, b); this.u.push(u, v); this.s.push(s); }
  // add a BufferGeometry (any), remapping its uv into atlas rect; fn(x,y,z,nx,ny,nz) -> [r,g,b,sway, nx?,ny?,nz?]
  addGeo(geo, rect, fn, uvScale = [1, 1]) {
    const g = geo.index ? geo.toNonIndexed() : geo; if (!g.attributes.normal) g.computeVertexNormals();
    const P = g.attributes.position, Nn = g.attributes.normal, U = g.attributes.uv;
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i); let nx = Nn.getX(i), ny = Nn.getY(i), nz = Nn.getZ(i);
      const o = fn(x, y, z, nx, ny, nz); if (o.length > 4) { nx = o[4]; ny = o[5]; nz = o[6]; }
      const uu = U ? U.getX(i) * uvScale[0] : 0, vv = U ? U.getY(i) * uvScale[1] : 0;
      this.vert(x, y, z, nx, ny, nz, o[0], o[1], o[2], rect[0] + (rect[2] - rect[0]) * (uu % 1 + (uu >= 1 && uu % 1 === 0 ? 1 : 0)), vv, o[3]);
    }
  }
  // quad from base point b along L (length h) and W (width w); v runs v0->v1 along L
  quad(b, L, Wd, w, h, rect, v0, v1, fn) {
    const hw = w / 2; const pts = [
      [b[0] - Wd[0] * hw, b[1] - Wd[1] * hw, b[2] - Wd[2] * hw, rect[0], v0], [b[0] + Wd[0] * hw, b[1] + Wd[1] * hw, b[2] + Wd[2] * hw, rect[2], v0],
      [b[0] + Wd[0] * hw + L[0] * h, b[1] + Wd[1] * hw + L[1] * h, b[2] + Wd[2] * hw + L[2] * h, rect[2], v1], [b[0] - Wd[0] * hw + L[0] * h, b[1] - Wd[1] * hw + L[1] * h, b[2] - Wd[2] * hw + L[2] * h, rect[0], v1]];
    for (const k of [0, 1, 2, 0, 2, 3]) { const q = pts[k]; const o = fn(q[0], q[1], q[2], q[4]); this.vert(q[0], q[1], q[2], o[4], o[5], o[6], o[0], o[1], o[2], q[3], q[4], o[3]); }
  }
  build(THREE) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    g.setAttribute('aSway', new THREE.Float32BufferAttribute(this.s, 1)); g.computeBoundingSphere(); return g;
  }
}
const nrm3 = (x, y, z) => { const l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; };

export function trunkGeo(THREE, h, r0, r1, rnd, lean = 0, rs = 7, hs = 4) {
  const g = new THREE.CylinderGeometry(r1, r0, h, rs, hs, true); g.translate(0, h / 2, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); const t = y / h; p.setX(i, p.getX(i) + lean * t * t + Math.sin(y * 1.3 + rnd()) * 0.03); }
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y < 0.01) { p.setX(i, p.getX(i) * 1.6); p.setZ(i, p.getZ(i) * 1.6); p.setY(i, -0.3); } }
  g.computeVertexNormals();
  return g;
}
// cylinder from A to B (world arrays)
export function limb(THREE, A, B, r0, r1, rs = 5) {
  const dx = B[0] - A[0], dy = B[1] - A[1], dz = B[2] - A[2]; const len = Math.hypot(dx, dy, dz);
  const g = new THREE.CylinderGeometry(r1, r0, len, rs, 1, true); g.translate(0, len / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx, dy, dz).normalize());
  g.applyQuaternion(q); g.translate(A[0], A[1], A[2]); return g;
}

// Layered conifer: bark trunk, dark inner cones + rings of drooping needle-frond cards per tier.
function conifer(THREE, seed, far = false) {
  const rnd = mulberry32(seed);
  const H = 11 + rnd() * 5; const gb = new GB();
  gb.addGeo(trunkGeo(THREE, H * 0.92, 0.42, 0.1, rnd, 0, far ? 5 : 7, far ? 1 : 3), ATLAS.BARK, (x, y) => [0.95, 0.9, 0.85, (y / H) * 0.5], [1, H / 6]);
  const tiers = 9; let y = H * 0.16;
  for (let k = 0; k < tiers; k++) {
    const t = k / (tiers - 1);
    const rad = lerp(3.4, 0.7, t) * (0.9 + rnd() * 0.2);
    const tint = 0.85 + rnd() * 0.3; const off = rnd() * 6.28;
    const keep = !far || k % 2 === 0;
    if (keep) {
      const cone = new THREE.ConeGeometry(rad * 0.72, rad * 1.0, far ? 5 : 7, 1, true); cone.translate(0, y + rad * 0.2, 0);
      gb.addGeo(cone, ATLAS.BARK, (x, yy, z) => { const nn = nrm3(x, 0.6, z); return [0.16 * tint, 0.24 * tint, 0.12, clamp(yy / H, 0, 1) * 0.8, ...nn]; });
      const n = far ? 7 : 12;
      for (let i = 0; i < n; i++) {
        const a = off + (i / n) * Math.PI * 2 + (rnd() - 0.5) * 0.4;
        const ca = Math.cos(a), sa = Math.sin(a); const L = rad * (far ? 1.25 : 1.1) * (0.85 + rnd() * 0.3); const w = L * 1.05;
        const e1 = 0.3 + rnd() * 0.15, e2 = 0.8 + rnd() * 0.25;
        const d1 = [ca * Math.cos(e1), -Math.sin(e1), sa * Math.cos(e1)], d2 = [ca * Math.cos(e2), -Math.sin(e2), sa * Math.cos(e2)];
        const Wd = [-sa, 0, ca];
        const b0 = [ca * 0.15, y + rad * 0.15, sa * 0.15];
        const col = (px, py, pz, v) => { const rr = Math.hypot(px, pz) / (rad + 0.01); const ao = lerp(0.55, 1.15, clamp(rr * 0.8 + t * 0.3, 0, 1));
          const nn = nrm3(px, (py - y) + rad * 0.6, pz); return [tint * ao, tint * ao, tint * ao * 0.95, clamp(py / H, 0, 1) * 0.8 + v * 0.25, ...nn]; };
        gb.quad(b0, d1, Wd, w, L * 0.55, ATLAS.FROND, 0, 0.5, col);
        const b1 = [b0[0] + d1[0] * L * 0.55, b0[1] + d1[1] * L * 0.55, b0[2] + d1[2] * L * 0.55];
        gb.quad(b1, d2, Wd, w * 0.85, L * 0.5, ATLAS.FROND, 0.5, 1.0, col);
      }
    }
    y += lerp(1.5, 1.0, t);
  }
  // crown tip
  for (const a of [0, Math.PI / 2]) gb.quad([0, y - 0.3, 0], [0, 1, 0], [Math.cos(a), 0, Math.sin(a)], 0.9, 1.8, ATLAS.FROND, 0.15, 1, (px, py, pz) => [1, 1, 0.95, 1, 0, 1, 0]);
  return { geo: gb.build(THREE), height: H, trunkR: 0.42 };
}

// Broadleaf: leaning trunk, real branches to each foliage clump, clumps of alpha-tested leaf cards with crown-outward normals.
function broadleaf(THREE, seed, far = false) {
  const rnd = mulberry32(seed);
  const H = 4.2 + rnd() * 1.6; const gb = new GB();
  const lean = (rnd() - 0.5) * 0.6;
  gb.addGeo(trunkGeo(THREE, H + 1.2, 0.5, 0.24, rnd, lean, far ? 5 : 7, far ? 1 : 3), ATLAS.BARK, (x, y) => [1, 0.95, 0.9, clamp(y / (H + 4), 0, 1) * 0.4], [1, H / 5]);
  const crown = [lean, H + 2.6, 0];
  const clumps = 8; const hue = rnd();
  for (let k = 0; k < clumps; k++) {
    const u = (k / clumps) * Math.PI * 2 + rnd() * 0.6, v = k === clumps - 1 ? 0.1 : 0.9 + rnd() * 0.8;
    const c = [crown[0] + Math.sin(v) * Math.cos(u) * 2.5, crown[1] + Math.cos(v) * 1.9 - 0.3, crown[2] + Math.sin(v) * Math.sin(u) * 2.5];
    const bh = H * (0.55 + rnd() * 0.35);
    const base = [lean * Math.pow(bh / (H + 1.2), 2), bh, 0];
    const mid = [(base[0] + c[0]) / 2, (base[1] + c[1]) / 2 + 0.4, (base[2] + c[2]) / 2];
    if (!far || k % 2 === 0) {
      gb.addGeo(limb(THREE, base, mid, 0.17, 0.11, far ? 4 : 5), ATLAS.BARK, (x, y) => [0.95, 0.9, 0.85, clamp(y / (H + 4), 0, 1) * 0.5]);
      gb.addGeo(limb(THREE, mid, c, 0.11, 0.05, far ? 3 : 4), ATLAS.BARK, (x, y) => [0.95, 0.9, 0.85, clamp(y / (H + 4), 0, 1) * 0.6]);
    }
    const tint = 0.85 + rnd() * 0.3;
    const cards = far ? 5 : 12;
    for (let i = 0; i < cards; i++) {
      // random card orientation
      const th = rnd() * Math.PI * 2, ph = Math.acos(rnd() * 2 - 1), ps = rnd() * Math.PI * 2;
      const nx = Math.sin(ph) * Math.cos(th), ny = Math.cos(ph), nz = Math.sin(ph) * Math.sin(th);
      let W = nrm3(-nz, 0, nx); if (Math.abs(ny) > 0.95) W = [1, 0, 0];
      const L0 = [ny * W[2] - nz * W[1], nz * W[0] - nx * W[2], nx * W[1] - ny * W[0]];
      const cs = Math.cos(ps), sn = Math.sin(ps);
      const L = [L0[0] * cs + W[0] * sn, L0[1] * cs + W[1] * sn, L0[2] * cs + W[2] * sn], Wd = [W[0] * cs - L0[0] * sn, W[1] * cs - L0[1] * sn, W[2] * cs - L0[2] * sn];
      const sz = (far ? 3.1 : 2.3) * (0.8 + rnd() * 0.4);
      const o = [c[0] + (rnd() - 0.5) * 1.6, c[1] + (rnd() - 0.5) * 1.0, c[2] + (rnd() - 0.5) * 1.6];
      const b = [o[0] - L[0] * sz / 2, o[1] - L[1] * sz / 2, o[2] - L[2] * sz / 2];
      gb.quad(b, L, Wd, sz, sz, ATLAS.LEAF, 0, 1, (px, py, pz) => {
        const dx = px - crown[0], dy = (py - crown[1]) * 1.25, dz = pz - crown[2]; const d = Math.hypot(dx, dy, dz) / 4.0;
        const ao = clamp(0.45 + d * 0.6 + (py - crown[1]) * 0.07, 0.4, 1.2) * tint;
        const nn = nrm3(dx, dy + 1.2, dz);
        return [ao * lerp(0.95, 1.12, hue), ao, ao * 0.85, clamp(py / (H + 6), 0, 1) * 0.9, ...nn];
      });
    }
  }
  return { geo: gb.build(THREE), height: H + 5, trunkR: 0.5 };
}

// ground cover
function fern(THREE, seed) {
  const rnd = mulberry32(seed); const gb = new GB();
  const n = 7;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rnd() * 0.5; const ca = Math.cos(a), sa = Math.sin(a); const L = 0.75 + rnd() * 0.35;
    const e1 = -0.9 + rnd() * 0.3, e2 = 0.1 + rnd() * 0.3; const Wd = [-sa, 0, ca];
    const d1 = [ca * Math.cos(e1), -Math.sin(e1), sa * Math.cos(e1)], d2 = [ca * Math.cos(e2), -Math.sin(e2), sa * Math.cos(e2)];
    const col = (px, py, pz, v) => [1.15, 1.3, 0.9, v, ...nrm3(px * 0.5, 1, pz * 0.5)];
    gb.quad([0, 0, 0], d1, Wd, L * 0.45, L * 0.5, ATLAS.FROND, 0, 0.5, col);
    gb.quad([d1[0] * L * 0.5, d1[1] * L * 0.5, d1[2] * L * 0.5], d2, Wd, L * 0.38, L * 0.55, ATLAS.FROND, 0.5, 1, col);
  }
  return gb.build(THREE);
}
function shrub(THREE, seed) {
  const rnd = mulberry32(seed); const gb = new GB();
  for (let i = 0; i < 10; i++) {
    const a = rnd() * Math.PI * 2, tilt = 0.3 + rnd() * 0.9; const sz = 0.8 + rnd() * 0.4;
    const L = [Math.cos(a) * Math.sin(tilt), Math.cos(tilt), Math.sin(a) * Math.sin(tilt)], Wd = [-Math.sin(a), 0, Math.cos(a)];
    const o = [(rnd() - 0.5) * 0.7, 0.35 + rnd() * 0.3, (rnd() - 0.5) * 0.7];
    gb.quad([o[0] - L[0] * sz / 2, o[1] - L[1] * sz / 2, o[2] - L[2] * sz / 2], L, Wd, sz, sz, ATLAS.LEAF, 0, 1, (px, py, pz) => [0.95 + py * 0.3, 1.0 + py * 0.3, 0.8, clamp(py, 0, 1) * 0.6, ...nrm3(px, py + 0.3, pz)]);
  }
  return gb.build(THREE);
}
function logGeo(THREE, seed) {
  const rnd = mulberry32(seed); const gb = new GB(); const len = 4 + rnd() * 3, r = 0.3 + rnd() * 0.15;
  const g = new THREE.CylinderGeometry(r * 0.85, r, len, 8, 2, false); g.rotateZ(Math.PI / 2);
  gb.addGeo(g, ATLAS.BARK, (x, y, z, nx, ny) => { const m = smoothstep(0.3, 0.9, ny); return [lerp(0.85, 0.55, m), lerp(0.8, 0.8, m), lerp(0.75, 0.35, m), 0]; }, [1, 2]);
  const br = limb(THREE, [len * 0.2, r * 0.6, 0], [len * 0.35, r + 1.0, 0.5], 0.12, 0.05, 4);
  gb.addGeo(br, ATLAS.BARK, () => [0.9, 0.85, 0.8, 0]);
  const geo = gb.build(THREE); geo.userData = { len, r }; return geo;
}

export function rockGeo(THREE, seed, flat = 0.62, detail = 2) {
  const N = makeNoise2D(seed); const rnd = mulberry32(seed);
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.attributes.position;
  const sx = 0.8 + rnd() * 0.6, sz = 0.8 + rnd() * 0.5;
  const pl = [new THREE.Vector3(rnd() - 0.5, rnd() * 0.6, rnd() - 0.5).normalize(), new THREE.Vector3(rnd() - 0.5, rnd() - 0.3, rnd() - 0.5).normalize(), new THREE.Vector3(rnd() - 0.5, 0.2, rnd() - 0.5).normalize()];
  const tmp = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    tmp.set(p.getX(i), p.getY(i), p.getZ(i));
    const x = tmp.x, y = tmp.y, z = tmp.z;
    let n = (N.noise(x * 1.2, y * 1.2 + z) + N.noise(y * 1.2 + 7, z * 1.2) + N.noise(z * 1.2 - 3, x * 1.2)) / 3;
    const rid = 1 - Math.abs(N.noise(x * 3 + y, z * 3 - y));
    let r = 1 + n * 0.35 + rid * 0.08 + N.noise(x * 6, z * 6 + y * 3) * 0.04;
    tmp.multiplyScalar(r);
    // planar facets (cleaved faces)
    for (const q of pl) { const d = tmp.dot(q) - 0.62; if (d > 0) tmp.addScaledVector(q, -d * 0.85); }
    tmp.x *= sx; tmp.z *= sz; tmp.y *= flat;
    if (tmp.y < -0.15) tmp.y = -0.15 + (tmp.y + 0.15) * 0.35;
    p.setXYZ(i, tmp.x, tmp.y, tmp.z);
  }
  g.computeVertexNormals();
  g.deleteAttribute('uv');
  g.computeBoundingSphere();
  return g;
}

export function rockMaterial(THREE, tx) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.tRock = { value: tx.rock }; sh.uniforms.tRockN = { value: tx.rockN }; sh.uniforms.tGrass = { value: tx.grass };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vRW; varying vec3 vRN;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
{ mat4 m = modelMatrix;
  #ifdef USE_INSTANCING
  m = modelMatrix * instanceMatrix;
  #endif
  vRW = (m * vec4(transformed, 1.0)).xyz; vRN = normalize(mat3(m) * objectNormal); }`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vRW; varying vec3 vRN; uniform sampler2D tRock, tRockN, tGrass; vec3 rockWN;`)
      .replace('#include <map_fragment>', `{
  vec3 wn = normalize(vRN);
  vec3 bw = pow(abs(wn), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
  float s = 0.32;
  vec2 ux = vRW.zy * s, uy = vRW.xz * s, uz = vRW.xy * s;
  vec4 c = texture2D(tRock, ux) * bw.x + texture2D(tRock, uy) * bw.y + texture2D(tRock, uz) * bw.z;
  vec4 c2 = texture2D(tRock, ux * 0.27) * bw.x + texture2D(tRock, uy * 0.27) * bw.y + texture2D(tRock, uz * 0.27) * bw.z;
  c.rgb *= mix(0.7, 1.3, c2.a);
  vec3 tnx = texture2D(tRockN, ux).xyz * 2.0 - 1.0, tny = texture2D(tRockN, uy).xyz * 2.0 - 1.0, tnz = texture2D(tRockN, uz).xyz * 2.0 - 1.0;
  tnx = vec3(tnx.xy + wn.zy, abs(tnx.z) * wn.x); tny = vec3(tny.xy + wn.xz, abs(tny.z) * wn.y); tnz = vec3(tnz.xy + wn.xy, abs(tnz.z) * wn.z);
  rockWN = normalize(tnx.zyx * bw.x + tny.xzy * bw.y + tnz.xyz * bw.z);
  float moss = smoothstep(0.55, 0.85, wn.y + (c.a - 0.5) * 0.6);
  vec3 mc = texture2D(tGrass, vRW.xz * 0.4).rgb * vec3(0.85, 1.0, 0.7);
  c.rgb = mix(c.rgb * vec3(1.02, 0.98, 0.93), mc, moss * 0.85);
  diffuseColor.rgb *= c.rgb;
}`)
      .replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(rockWN, 0.0)).xyz);');
  };
  mat.customProgramCacheKey = () => 'wb-rock-v1';
  return mat;
}

// ---------------- SCATTERING ----------------
export function createFoliage(THREE, scene, terrain, textures, sunDir, opts) {
  const { low, seed, boundsR } = opts;
  const reserve = opts.reserve || [];
  const N = makeNoise2D(seed + 500);
  const rnd = mulberry32(seed + 900);
  const shared = { uTime: { value: 0 }, uPush: { value: [0, 1, 2, 3].map(() => new THREE.Vector4(0, -999, 0, 1)) }, uFade: { value: new THREE.Vector2(low ? 30 : 48, low ? 45 : 72) }, sunDir };
  const colliders = [];
  const group = new THREE.Group(); group.name = 'foliage'; scene.add(group);
  const dummy = new THREE.Object3D();
  const up = new THREE.Vector3(0, 1, 0), nTmp = new THREE.Vector3(), q = new THREE.Quaternion(), q2 = new THREE.Quaternion();
  const occupied = reserve.map((r) => [...r]); // for spacing trees/rocks [x,z,r] (landmark footprints pre-reserved)
  const free = (x, z, r) => { for (const o of occupied) if ((o[0] - x) ** 2 + (o[1] - z) ** 2 < (o[2] + r) ** 2) return false; return true; };

  // ---------- ROCKS ----------
  const rockMat = rockMaterial(THREE, textures);
  const rockVariants = [0, 1, 2, 3, 4, 5].map((i) => rockGeo(THREE, seed * 13 + i * 31, 0.5 + (i % 3) * 0.15, i < 2 && !low ? 3 : 2));
  const rockLists = rockVariants.map(() => []);
  function addRock(x, z, s, sink = 0.25, tilt = 0.4) {
    // big boulders use the high-detail variants (0,1), small rocks the cheap ones
    const v = s > 1.3 ? Math.floor(rnd() * 2) : 2 + Math.floor(rnd() * 4);
    const y = terrain.getHeight(x, z) - sink * s;
    terrain.getNormal(x, z, nTmp);
    q.setFromUnitVectors(up, nTmp.lerp(up, 1 - tilt).normalize());
    q2.setFromAxisAngle(up, rnd() * Math.PI * 2); q.multiply(q2);
    const sy = s * (0.7 + rnd() * 0.6);
    dummy.position.set(x, y, z); dummy.quaternion.copy(q); dummy.scale.set(s * (0.9 + rnd() * 0.3), sy, s * (0.9 + rnd() * 0.3)); dummy.updateMatrix();
    rockLists[v].push({ m: dummy.matrix.clone() });
    occupied.push([x, z, s * 0.9]);
    if (s > 0.55 && Math.hypot(x, z) < boundsR + 8) colliders.push({ x, z, r: s * 0.95 });
  }
  // arena rim boulders (frame the fight, leave south entrance & pond open)
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2 + rnd() * 0.2; const r = 43 + rnd() * 14;
    const x = Math.sin(a) * r, z = Math.cos(a) * r;
    if (Math.abs(Math.atan2(x, z)) < 0.45 || !free(x, z, 2)) continue;
    if (terrain.pondDist(x, z) < 1.5 || terrain.streamInfo(x, z).d < 5) continue;
    const s = 1.4 + rnd() * 2.4; addRock(x, z, s, 0.3);
    if (rnd() < 0.7) addRock(x + (rnd() - 0.5) * s * 2.5, z + (rnd() - 0.5) * s * 2.5, s * (0.3 + rnd() * 0.3), 0.2);
  }
  // a few low cover rocks in the arena
  for (const [x, z, s] of [[-18, -6, 1.2], [14, -20, 0.9], [-9, 24, 0.7], [24, 18, 1.0], [-28, 14, 1.4]]) addRock(x, z, s, 0.35, 0.8);
  // scattered rocks on hills, more on steep ground
  for (let i = 0; i < (low ? 160 : 300); i++) {
    const a = rnd() * Math.PI * 2, r = 52 + Math.pow(rnd(), 0.8) * 180;
    const x = Math.sin(a) * r, z = Math.cos(a) * r;
    if (Math.abs(x) > 250 || Math.abs(z) > 250) continue;
    const ny = terrain.getNormal(x, z, nTmp).y;
    const steep = 1 - ny;
    if (rnd() > 0.25 + steep * 3) continue;
    if (terrain.getHeight(x, z) < WATER_LEVEL + 0.2) continue;
    const s = (0.6 + rnd() * 2.2) * (1 + steep * 2.5);
    if (!free(x, z, s * 0.6)) continue;
    addRock(x, z, s, 0.35, 0.7);
  }
  // stream & pond pebbles/rocks
  for (let i = 0; i < (low ? 60 : 140); i++) {
    const k = Math.floor(rnd() * (terrain.stream.length - 1)); const t = rnd();
    const [ax, az] = terrain.stream[k], [bx, bz] = terrain.stream[k + 1];
    const side = (rnd() < 0.5 ? -1 : 1) * (1.5 + rnd() * 3.5);
    const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz);
    const x = ax + dx * t + (-dz / l) * side, z = az + dz * t + (dx / l) * side;
    addRock(x, z, 0.25 + rnd() * 0.8, 0.3, 0.6);
  }
  for (let i = 0; i < 18; i++) { const a = rnd() * Math.PI * 2; const r = terrain.pond.r * (1.05 + rnd() * 0.3); addRock(terrain.pond.x + Math.cos(a) * r, terrain.pond.z + Math.sin(a) * r, 0.3 + rnd() * 0.9, 0.3, 0.5); }
  const culled = [];
  rockVariants.forEach((g, i) => {
    const list = rockLists[i]; if (!list.length) return;
    const ci = new CulledInstances(THREE, g, rockMat, list, { maxD: low ? 120 : 170, margin: 3 });
    ci.mesh.castShadow = true; ci.mesh.receiveShadow = true; group.add(ci.mesh); culled.push(ci);
  });

  // ---------- TREES ----------
  const atlas = createFoliageAtlas(THREE, opts.renderer, seed);
  const treeMatBase = new THREE.MeshStandardMaterial({ vertexColors: true, map: atlas, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.85, metalness: 0 });
  const treeMat = windMaterial(THREE, treeMatBase, shared, 'tree');
  const conifers = [0, 1, 2].map((i) => ({ ...conifer(THREE, seed * 3 + i * 17), far: conifer(THREE, seed * 3 + i * 17, true).geo }));
  const broads = [0, 1, 2].map((i) => ({ ...broadleaf(THREE, seed * 5 + i * 23), far: broadleaf(THREE, seed * 5 + i * 23, true).geo }));
  const variants = [...conifers, ...broads];
  const lists = variants.map(() => []);
  function addTree(x, z, kind, s) {
    const v = kind === 'c' ? Math.floor(rnd() * 3) : 3 + Math.floor(rnd() * 3);
    const y = terrain.getHeight(x, z);
    dummy.position.set(x, y - 0.1, z); dummy.rotation.set((rnd() - 0.5) * 0.06, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.06);
    dummy.scale.setScalar(s); dummy.updateMatrix();
    lists[v].push({ m: dummy.matrix.clone() });
    occupied.push([x, z, 2.2 * s]);
    if (Math.hypot(x, z) < boundsR + 10) colliders.push({ x, z, r: variants[v].trunkR * s * 1.2 });
  }
  // framing trees on the arena rim
  for (const [a, r, k, s] of [[2.1, 50, 'b', 1.25], [-2.3, 52, 'b', 1.15], [0.95, 55, 'c', 1.2], [-0.9, 53, 'b', 1.1], [2.8, 56, 'c', 1.3], [-1.6, 57, 'c', 1.1], [-2.85, 54, 'b', 1.2]]) {
    const x = Math.sin(a) * r, z = Math.cos(a) * r; if (free(x, z, 3)) addTree(x, z, k, s);
  }
  const step = low ? 10 : 7.5;
  for (let gz = -245; gz < 245; gz += step) for (let gx = -245; gx < 245; gx += step) {
    const x = gx + (rnd() - 0.5) * step * 0.9, z = gz + (rnd() - 0.5) * step * 0.9;
    const r = Math.hypot(x, z); if (r < 54) continue;
    const forest = N.fbm(x * 0.012, z * 0.012, 4) + smoothstep(60, 140, r) * 0.35 - 0.12;
    if (forest < 0.05 + rnd() * 0.25) continue;
    const ny = terrain.getNormal(x, z, nTmp).y; if (ny < 0.82) continue;
    const h = terrain.getHeight(x, z); if (h < WATER_LEVEL + 0.8) continue;
    if (terrain.streamInfo(x, z).d < 6 || terrain.pondDist(x, z) < 1.5) continue;
    if (terrain.macroAt(x, z).dirt > 0.4) continue;
    const s = 0.75 + rnd() * 0.6;
    if (!free(x, z, 1.6 * s)) continue;
    const kind = rnd() < smoothstep(5, 30, h) * 0.6 + 0.3 ? 'c' : 'b';
    addTree(x, z, kind, s);
  }
  let treeCount = 0;
  const TREE_NEAR = low ? 45 : 70, TREE_FAR = low ? 230 : 300;
  variants.forEach((v, i) => {
    const list = lists[i]; if (!list.length) return; treeCount += list.length;
    const near = new CulledInstances(THREE, v.geo, treeMat, list, { maxD: TREE_NEAR, margin: 10 });
    near.mesh.castShadow = true; near.mesh.receiveShadow = true;
    const far = new CulledInstances(THREE, v.far, treeMat, list, { minD: TREE_NEAR, maxD: TREE_FAR, margin: 4 });
    far.mesh.castShadow = false; far.mesh.receiveShadow = true;
    group.add(near.mesh, far.mesh); culled.push(near, far);
  });

  // ---------- GROUND COVER: ferns, shrubs, fallen logs ----------
  {
    const fernG = fern(THREE, seed + 61), shrubG = shrub(THREE, seed + 62), logs = [logGeo(THREE, seed + 63), logGeo(THREE, seed + 64)];
    const fl = [], sl = [], ll = [[], []];
    const tries = low ? 1500 : 3500;
    for (let i = 0; i < tries; i++) {
      const a = rnd() * Math.PI * 2, r = 30 + Math.sqrt(rnd()) * 140; const x = Math.sin(a) * r, z = Math.cos(a) * r;
      const forest = N.fbm(x * 0.012, z * 0.012, 4) + smoothstep(60, 140, r) * 0.35 - 0.12;
      const edge = smoothstep(38, 55, r);
      if (rnd() > (forest + 0.25) * edge * 1.3) continue;
      const ny = terrain.getNormal(x, z, nTmp).y; if (ny < 0.8) continue;
      const h = terrain.getHeight(x, z); if (h < WATER_LEVEL + 0.3) continue;
      if (terrain.streamInfo(x, z).d < 3 || terrain.macroAt(x, z).dirt > 0.5) continue;
      if (!free(x, z, 0.5)) continue;
      dummy.position.set(x, h - 0.05, z); dummy.rotation.set(0, rnd() * 6.28, 0); dummy.scale.setScalar(0.8 + rnd() * 0.7); dummy.updateMatrix();
      (rnd() < 0.65 ? fl : sl).push({ m: dummy.matrix.clone() });
    }
    for (let i = 0; i < (low ? 14 : 28); i++) {
      const a = rnd() * Math.PI * 2, r = 50 + rnd() * 110; const x = Math.sin(a) * r, z = Math.cos(a) * r;
      const ny = terrain.getNormal(x, z, nTmp).y; if (ny < 0.88 || !free(x, z, 3)) continue;
      const h = terrain.getHeight(x, z); if (h < WATER_LEVEL + 0.4) continue;
      const v = i % 2; const yaw = rnd() * 6.28;
      dummy.position.set(x, h + logs[v].userData.r * 0.55, z); dummy.rotation.set(0, yaw, (rnd() - 0.5) * 0.1); dummy.scale.setScalar(1); dummy.updateMatrix();
      ll[v].push({ m: dummy.matrix.clone() }); occupied.push([x, z, logs[v].userData.len * 0.5]);
      if (r < boundsR + 8) { const L = logs[v].userData.len; for (const t of [-0.35, 0, 0.35]) colliders.push({ x: x + Math.cos(yaw) * L * t, z: z - Math.sin(yaw) * L * t, r: logs[v].userData.r + 0.2 }); }
    }
    const fc = new CulledInstances(THREE, fernG, treeMat, fl, { maxD: low ? 40 : 60, margin: 1 }); fc.mesh.receiveShadow = true;
    const sc = new CulledInstances(THREE, shrubG, treeMat, sl, { maxD: low ? 50 : 80, margin: 1 }); sc.mesh.receiveShadow = true;
    group.add(fc.mesh, sc.mesh); culled.push(fc, sc);
    logs.forEach((g, v) => { const lc = new CulledInstances(THREE, g, treeMat, ll[v], { maxD: 140, margin: 3 }); lc.mesh.castShadow = true; lc.mesh.receiveShadow = true; group.add(lc.mesh); culled.push(lc); });
  }

  // ---------- GRASS ----------
  const grassMat = windMaterial(THREE, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, side: THREE.DoubleSide }), shared, 'grass');
  const tuft = bladeTuft(THREE, mulberry32(seed + 40), low ? 3 : 4); tuft.computeBoundingSphere();
  const GR = low ? 60 : 85; const density = low ? 0.9 : 1.9;
  const col = new THREE.Color();
  const glist = [];
  const area = Math.PI * GR * GR; const tries = Math.floor(area * density);
  for (let i = 0; i < tries; i++) {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * GR; const x = Math.sin(a) * r, z = Math.cos(a) * r;
    const mc = terrain.macroAt(x, z);
    const clump = N.fbm(x * 0.08 + 40, z * 0.08, 3) * 0.5 + 0.5;
    let dens = mc.meadow * (0.35 + 0.9 * clump) * (1 - smoothstep(GR - 20, GR, r));
    const ny = terrain.getNormal(x, z, nTmp).y; dens *= smoothstep(0.75, 0.9, ny);
    if (rnd() > dens * 0.85) continue;
    const y = terrain.getHeight(x, z); if (y < WATER_LEVEL + 0.08) continue;
    const tall = lerp(0.42, 0.85, smoothstep(30, 60, r)) * (0.7 + clump * 0.6) * (0.8 + rnd() * 0.4) * (1 - 0.4 * smoothstep(0.5, 0.0, mc.meadow));
    dummy.position.set(x, y - 0.03, z); dummy.rotation.set(0, rnd() * Math.PI * 2, 0); const w = 0.9 + rnd() * 0.6; dummy.scale.set(w, tall, w); dummy.updateMatrix();
    const dry = smoothstep(0.35, 0.8, mc.vari + (rnd() - 0.5) * 0.3);
    col.setRGB(lerp(0.15, 0.34, dry) * (0.8 + rnd() * 0.3), lerp(0.29, 0.33, dry) * (0.85 + rnd() * 0.25), lerp(0.07, 0.09, dry));
    glist.push({ m: dummy.matrix.clone(), c: col.clone(), key: rnd() });
  }
  const fadeEnd = shared.uFade.value.y;
  const grass = new CulledInstances(THREE, tuft, grassMat, glist, { colors: true, maxD: fadeEnd + 2, margin: 1,
    lod: (d) => (d < 18 ? 1 : Math.max(0.22, 1 - (d - 18) / (fadeEnd * 0.9))) });
  grass.mesh.receiveShadow = true; grass.mesh.castShadow = false; group.add(grass.mesh); culled.push(grass);
  const grassCount = glist.length;

  // ---------- FLOWERS ----------
  {
    const fg = new THREE.CircleGeometry(0.06, 10); const fp = fg.attributes.position; for (let i = 1; i < fp.count; i++) { const a = Math.atan2(fp.getY(i), fp.getX(i)); const k = 0.55 + 0.45 * Math.abs(Math.cos(a * 2.5)); fp.setXY(i, fp.getX(i) * k, fp.getY(i) * k); } fg.rotateX(-Math.PI / 2 + 0.3); fg.translate(0, 0.3, 0);
    const stem = new THREE.CylinderGeometry(0.004, 0.006, 0.3, 3); stem.translate(0, 0.15, 0);
    const fgeo = mergeGeometries([strip(fg), strip(stem)]);
    const sw = new Float32Array(fgeo.attributes.position.count); for (let i = 0; i < sw.length; i++) sw[i] = clamp(fgeo.attributes.position.getY(i) / 0.35, 0, 1);
    fgeo.setAttribute('aSway', new THREE.BufferAttribute(sw, 1));
    const fm = windMaterial(THREE, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, side: THREE.DoubleSide }), shared, 'flower');
    const palette = [new THREE.Color(1.0, 0.95, 0.85), new THREE.Color(1.0, 0.8, 0.2), new THREE.Color(0.65, 0.45, 0.95), new THREE.Color(0.95, 0.4, 0.35)];
    const mats = []; const cols = [];
    for (let i = 0; i < (low ? 1200 : 3500); i++) {
      const a = rnd() * Math.PI * 2, r = 8 + Math.sqrt(rnd()) * 85; const x = Math.sin(a) * r, z = Math.cos(a) * r;
      const patch = N.fbm(x * 0.05 - 20, z * 0.05 + 13, 3);
      if (patch < 0.15) continue;
      const mc = terrain.macroAt(x, z); if (mc.meadow < 0.6) continue;
      const y = terrain.getHeight(x, z); if (y < WATER_LEVEL + 0.1) continue;
      dummy.position.set(x, y, z); dummy.rotation.set(0, rnd() * 6.28, 0); dummy.scale.setScalar(0.8 + rnd() * 0.7); dummy.updateMatrix();
      mats.push(dummy.matrix.clone()); cols.push(palette[Math.floor((patch * 7 + rnd() * 0.8) % palette.length)]);
    }
    fgeo.computeBoundingSphere();
    const fl = new CulledInstances(THREE, fgeo, fm, mats.map((m, k) => ({ m, c: cols[k] })), { colors: true, maxD: 45, margin: 1 });
    group.add(fl.mesh); culled.push(fl);
  }

  const frustum = new THREE.Frustum(), pv = new THREE.Matrix4();
  const lastPos = new THREE.Vector3(1e9, 0, 0), lastDir = new THREE.Vector3(), dir = new THREE.Vector3();
  let lastFov = 0;
  function update(t, camera, pushers) {
    shared.uTime.value = t;
    const arr = shared.uPush.value;
    for (let i = 0; i < 4; i++) { const p = pushers[i]; if (p) arr[i].set(p.x, p.y, p.z, p.r || 1.2); else arr[i].set(0, -999, 0, 1); }
    camera.getWorldDirection(dir);
    // re-cull only when the camera moved/turned enough (margins in the culled sets cover the slack)
    if (camera.position.distanceToSquared(lastPos) < 0.36 && dir.dot(lastDir) > 0.9985 && camera.fov === lastFov) return;
    lastPos.copy(camera.position); lastDir.copy(dir); lastFov = camera.fov;
    camera.updateMatrixWorld();
    pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); frustum.setFromProjectionMatrix(pv);
    const { x, y, z } = camera.position;
    for (const c of culled) c.update(frustum.planes, x, y, z);
  }
  return { update, colliders, stats: { trees: treeCount, grass: grassCount }, rockMat, treeMat, shared, culledSets: culled, CulledInstances };
}
