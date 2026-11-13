// Geometry accumulation ("buckets" = one merged mesh per material), frame helpers and the town material set.
import * as THREE from 'three';

const _p = new THREE.Vector3(), _n = new THREE.Vector3(), _nm = new THREE.Matrix3(), _c = new THREE.Color();
export const col = (hex, j = 0, rnd = Math.random) => { _c.set(hex); if (j) { const k = 1 + (rnd() - 0.5) * 2 * j; _c.r *= k; _c.g *= k * (1 + (rnd() - 0.5) * j * 0.3); _c.b *= k; } return [_c.r, _c.g, _c.b]; };

// Accumulates transformed, non-indexed geometry with position/normal/uv/color (+ optional aWave) attributes.
export class Bucket {
  constructor(name, { s = 2, wave = false } = {}) { this.name = name; this.s = s; this.P = []; this.N = []; this.U = []; this.C = []; this.W = wave ? [] : null; }
  // o: { uv:'box'|'keep'|'fn', s, su, sv, uvFn(p,n)->[u,v], off:[u,v], wave:number|fn(p)->number, colFn(p,n,wp)->[r,g,b] }
  add(geo, m, color = [1, 1, 1], o = {}) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (!g.attributes.normal) g.computeVertexNormals();
    const P = g.attributes.position, Nn = g.attributes.normal, U = g.attributes.uv;
    const s = o.s || this.s, mode = o.uv || 'box', ou = o.off ? o.off[0] : 0, ov = o.off ? o.off[1] : 0;
    if (m) _nm.getNormalMatrix(m);
    for (let i = 0; i < P.count; i++) {
      _p.fromBufferAttribute(P, i); _n.fromBufferAttribute(Nn, i);
      let u, v;
      if (mode === 'keep') { u = U.getX(i) * (o.su || 1); v = U.getY(i) * (o.sv || 1); }
      else if (mode === 'fn') [u, v] = o.uvFn(_p, _n);
      else {
        const ax = Math.abs(_n.x), ay = Math.abs(_n.y), az = Math.abs(_n.z);
        if (ay >= ax && ay >= az) { u = _p.x; v = _p.z; } else if (ax >= az) { u = _p.z; v = -_p.y; } else { u = _p.x; v = -_p.y; }
        u /= s; v /= s;
      }
      this.U.push(u + ou, v + ov);
      if (this.W) this.W.push(typeof o.wave === 'function' ? o.wave(_p) : (o.wave || 0));
      const lx = _p.x, ly = _p.y, lz = _p.z;
      if (m) { _p.applyMatrix4(m); _n.applyMatrix3(_nm).normalize(); }
      this.P.push(_p.x, _p.y, _p.z); this.N.push(_n.x, _n.y, _n.z);
      if (o.colFn) { const c = o.colFn(lx, ly, lz, _p); this.C.push(c[0], c[1], c[2]); } else this.C.push(color[0], color[1], color[2]);
    }
    if (g !== geo) g.dispose();
  }
  get count() { return this.P.length / 3; }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.U, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3));
    if (this.W) g.setAttribute('aWave', new THREE.Float32BufferAttribute(this.W, 1));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
  mesh(mat, { shadow = true, receive = true } = {}) {
    const m = new THREE.Mesh(this.geometry(), mat); m.castShadow = shadow; m.receiveShadow = receive; m.name = 'town-' + this.name;
    this.P = this.N = this.U = this.C = null; if (this.W) this.W = null;
    return m;
  }
}

// Frame: a local coordinate system (position + yaw) to place parts of a building/prop.
const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _t = new THREE.Vector3();
export function mat4(x, y, z, ry = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  _e.set(rx, ry, rz, 'YXZ'); _q.setFromEuler(_e); return new THREE.Matrix4().compose(_t.set(x, y, z), _q, _s.set(sx, sy, sz));
}
export class Frame {
  constructor(m = new THREE.Matrix4()) { this.m = m; }
  static at(x, y, z, ry = 0) { return new Frame(mat4(x, y, z, ry)); }
  sub(x, y, z, ry = 0, rx = 0, rz = 0) { return new Frame(this.m.clone().multiply(mat4(x, y, z, ry, rx, rz))); }
  put(b, geo, x, y, z, color, o, ry = 0, rx = 0, rz = 0) { b.add(geo, this.m.clone().multiply(mat4(x, y, z, ry, rx, rz)), color, o); }
  box(b, w, h, d, x, y, z, color, o, ry = 0, rx = 0, rz = 0) { const g = new THREE.BoxGeometry(w, h, d); this.put(b, g, x, y, z, color, o, ry, rx, rz); g.dispose(); }
  cyl(b, rt, rb, h, x, y, z, color, seg = 10, o, rx = 0, rz = 0, open = false) { const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, open); this.put(b, g, x, y, z, color, o, 0, rx, rz); g.dispose(); }
  world(x, y, z) { return new THREE.Vector3(x, y, z).applyMatrix4(this.m); }
}

// beam between two points (square section) — for timber framing, braces, crane jibs, rails
export function beam(b, A, B, w, color, o, h = w) {
  const d = new THREE.Vector3().subVectors(B, A), L = d.length(); if (L < 1e-4) return;
  const g = new THREE.BoxGeometry(w, L, h); g.translate(0, L / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  b.add(g, new THREE.Matrix4().compose(A, q, new THREE.Vector3(1, 1, 1)), color, o); g.dispose();
}
export function rod(b, A, B, r, color, seg = 6, o) {
  const d = new THREE.Vector3().subVectors(B, A), L = d.length(); if (L < 1e-4) return;
  const g = new THREE.CylinderGeometry(r, r, L, seg, 1, true); g.translate(0, L / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  b.add(g, new THREE.Matrix4().compose(A, q, new THREE.Vector3(1, 1, 1)), color, o); g.dispose();
}

// cone roof with shingle-friendly UVs (u around, v down the slant)
export function coneRoof(r, h, seg = 16, s = 2) {
  const g = new THREE.ConeGeometry(r, h, seg, 3, true); const P = g.attributes.position, U = g.attributes.uv; const sl = Math.hypot(r, h);
  for (let i = 0; i < P.count; i++) { const y = P.getY(i); const t = (h / 2 - y) / h; U.setXY(i, U.getX(i) * Math.max(3, Math.round(2 * Math.PI * r / s)), t * sl / s); }
  return g;
}
// triangular prism (gable attic), ridge along x, width w (x), depth d (z), height h, base at y=0
export function gablePrism(w, d, h) {
  const x = w / 2, z = d / 2;
  const p = [
    -x, 0, -z, -x, 0, z, -x, h, 0, // left end
    x, 0, z, x, 0, -z, x, h, 0, // right end
    -x, 0, z, x, 0, z, x, h, 0, -x, 0, z, x, h, 0, -x, h, 0, // front slope
    x, 0, -z, -x, 0, -z, -x, h, 0, x, 0, -z, -x, h, 0, x, h, 0, // back slope
  ];
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.computeVertexNormals();
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(p.length / 3 * 2).fill(0), 2));
  return g;
}

// ---------------- materials ----------------
export function createMaterials(T, shared, low) {
  const std = (o) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, ...o });
  const ns = (k) => new THREE.Vector2(k, k);
  const M = {
    stone: std({ map: T.stone.map, normalMap: T.stone.normalMap, normalScale: ns(1.0), roughness: 0.92 }),
    cobble: std({ map: T.cobble.map, normalMap: T.cobble.normalMap, normalScale: ns(1.1), roughness: 0.82 }),
    wood: std({ map: T.plank.map, normalMap: T.plank.normalMap, normalScale: ns(0.9), roughness: 0.8 }),
    roof: std({ map: T.roof.map, normalMap: T.roof.normalMap, normalScale: ns(1.2), roughness: 0.42, metalness: 0.08, envMapIntensity: 1.1 }),
    plaster: std({ map: T.plaster.map, normalMap: T.plaster.normalMap, normalScale: ns(0.6), roughness: 0.95 }),
    cloth: std({ map: T.cloth.map, normalMap: T.cloth.normalMap, normalScale: ns(0.5), roughness: 0.9, side: THREE.DoubleSide }),
    metal: std({ roughness: 0.38, metalness: 0.85 }),
    leaf: std({ normalMap: T.plaster.normalMap, normalScale: ns(1.5), roughness: 0.75 }),
    glass: std({ color: 0x182028, roughness: 0.12, metalness: 0.2, envMapIntensity: 1.4 }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: true }),
  };
  // cloth: wind flutter along the (world) normal, scaled by aWave
  M.cloth.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = shared.uTime;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime; attribute float aWave;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
{ vec3 wpos = (modelMatrix * vec4(position, 1.0)).xyz;
  float ph = uTime * 2.6 + dot(wpos, vec3(0.9, 0.35, 0.6));
  float f = sin(ph) * 0.6 + sin(ph * 2.3 + 1.7) * 0.3 + sin(uTime * 0.7 + wpos.x * 0.1) * 0.4;
  transformed += normal * f * aWave * 0.22; }`);
  };
  M.cloth.customProgramCacheKey = () => 'town-cloth';
  // glass: dark reflective panes, emissive interior light from vertex colour * uGlow (dusk lights up the windows)
  M.glass.onBeforeCompile = (sh) => {
    sh.uniforms.uGlow = shared.uGlow;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uGlow;')
      .replace('#include <color_fragment>', '')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n#ifdef USE_COLOR\ntotalEmissiveRadiance += vColor.rgb * uGlow;\n#endif');
  };
  M.glass.customProgramCacheKey = () => 'town-glass';
  if (low) for (const k of ['stone', 'cobble', 'wood', 'roof', 'plaster']) M[k].normalScale.multiplyScalar(0.8);
  return M;
}
