// Geometry helpers: lofted sweeps of cross-sections along a path (optionally skinned).
import * as THREE from 'three';

const _v = new THREE.Vector3(), _q = new THREE.Quaternion();

// Resample a Catmull-Rom through `joints` at equal arc length. Returns {pts, u} where u = float joint index.
export function samplePath(joints, n, tension = 0.5) {
  const curve = new THREE.CatmullRomCurve3(joints, false, 'centripetal', tension);
  const M = n * 8, dense = [], len = [0];
  for (let i = 0; i <= M; i++) { dense.push(curve.getPoint(i / M)); if (i) len.push(len[i - 1] + dense[i].distanceTo(dense[i - 1])); }
  const L = len[M], pts = [], u = [];
  let k = 0;
  for (let i = 0; i <= n; i++) {
    const target = (i / n) * L; while (k < M - 1 && len[k + 1] < target) k++;
    const f = (target - len[k]) / Math.max(1e-6, len[k + 1] - len[k]);
    pts.push(dense[k].clone().lerp(dense[k + 1], f)); u.push(((k + f) / M) * (joints.length - 1));
  }
  return { pts, u, length: L };
}

// path: Vector3[]; ring(s,i) -> {rx, ry, ox, oy, sq, ridge, belly}; skin(s,i) -> [[bone,w],...]
// color(s, theta, i) -> [r,g,b]; glow(s, theta, i) -> float | [vent, throat]  (stored as vec2 aGlow)
export function sweep({ path, ring, segs = 24, upRef = new THREE.Vector3(0, 1, 0), uRepeat = 1, vScale = 1, skin, color, glow, capStart = false, capEnd = false, thetaOffset = 0 }) {
  const n = path.length, cols = segs + 1;
  const T = [], X = [];
  for (let i = 0; i < n; i++) {
    const a = path[Math.max(0, i - 1)], b = path[Math.min(n - 1, i + 1)];
    T.push(b.clone().sub(a).normalize());
  }
  let x0 = new THREE.Vector3().crossVectors(upRef, T[0]);
  if (x0.lengthSq() < 1e-6) x0.set(1, 0, 0).cross(T[0]);
  X.push(x0.normalize());
  for (let i = 1; i < n; i++) { _q.setFromUnitVectors(T[i - 1], T[i]); const x = X[i - 1].clone().applyQuaternion(_q); x.sub(_v.copy(T[i]).multiplyScalar(x.dot(T[i]))).normalize(); X.push(x); }
  const arc = [0]; for (let i = 1; i < n; i++) arc.push(arc[i - 1] + path[i].distanceTo(path[i - 1]));
  const L = arc[n - 1] || 1;
  const pos = [], uv = [], col = [], glw = [], si = [], sw = [], idx = [];
  const U = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const s = arc[i] / L, r = ring(s, i); U.crossVectors(T[i], X[i]);
    const sq = r.sq ?? 2, e = 2 / sq;
    let weights = null;
    if (skin) {
      weights = skin(s, i).filter((w) => w[1] > 1e-4).sort((p, q) => q[1] - p[1]).slice(0, 4);
      const tot = weights.reduce((p, w) => p + w[1], 0) || 1; weights = weights.map((w) => [w[0], w[1] / tot]);
      while (weights.length < 4) weights.push([0, 0]);
    }
    for (let j = 0; j < cols; j++) {
      const th = (j / segs) * Math.PI * 2 + thetaOffset;
      const c = Math.cos(th), sn = Math.sin(th);
      let lx = Math.sign(c) * Math.pow(Math.abs(c), e) * r.rx, ly = Math.sign(sn) * Math.pow(Math.abs(sn), e) * r.ry;
      if (sn < 0 && r.belly) ly *= r.belly;
      if (r.ridge) { const d = th - Math.PI / 2; ly += r.ry * r.ridge * Math.exp(-(d * d) / 0.06); }
      if (r.keel) { const d = th - Math.PI * 1.5; ly -= r.ry * r.keel * Math.exp(-(d * d) / 0.15); }
      if (r.shape) { const o = r.shape(th, lx, ly); lx = o[0]; ly = o[1]; }
      const p = path[i];
      pos.push(p.x + X[i].x * (lx + (r.ox || 0)) + U.x * (ly + (r.oy || 0)), p.y + X[i].y * (lx + (r.ox || 0)) + U.y * (ly + (r.oy || 0)), p.z + X[i].z * (lx + (r.ox || 0)) + U.z * (ly + (r.oy || 0)));
      uv.push((j / segs) * uRepeat, arc[i] * vScale);
      const cc = color ? color(s, th, i) : [1, 1, 1]; col.push(cc[0], cc[1], cc[2]);
      { const gg = glow ? glow(s, th, i) : 0; if (Array.isArray(gg)) glw.push(gg[0], gg[1]); else glw.push(gg, 0); }
      if (weights) { for (let k = 0; k < 4; k++) { si.push(weights[k][0]); sw.push(weights[k][1]); } }
    }
  }
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < segs; j++) {
    const a = i * cols + j, b = a + 1, c = a + cols, d = c + 1; idx.push(a, b, c, b, d, c);
  }
  const addCap = (ri, flip) => {
    const center = new THREE.Vector3(); for (let j = 0; j < segs; j++) center.add(_v.fromArray(pos, (ri * cols + j) * 3)); center.divideScalar(segs);
    const ci = pos.length / 3; pos.push(center.x, center.y, center.z); uv.push(0.5, arc[ri] * vScale);
    const k0 = ri * cols; col.push(col[k0 * 3], col[k0 * 3 + 1], col[k0 * 3 + 2]); glw.push(0, 0);
    if (skin) { for (let k = 0; k < 4; k++) { si.push(si[k0 * 4 + k]); sw.push(sw[k0 * 4 + k]); } }
    for (let j = 0; j < segs; j++) { const a = ri * cols + j; flip ? idx.push(ci, a + 1, a) : idx.push(ci, a, a + 1); }
  };
  if (capStart) addCap(0, false);
  if (capEnd) addCap(n - 1, true);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aGlow', new THREE.Float32BufferAttribute(glw, 2));
  if (skin) { g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4)); }
  g.setIndex(idx); g.computeVertexNormals();
  // weld seam normals
  const nr = g.attributes.normal;
  for (let i = 0; i < n; i++) {
    const a = i * cols, b = i * cols + segs;
    _v.set(nr.getX(a) + nr.getX(b), nr.getY(a) + nr.getY(b), nr.getZ(a) + nr.getZ(b)).normalize();
    nr.setXYZ(a, _v.x, _v.y, _v.z); nr.setXYZ(b, _v.x, _v.y, _v.z);
  }
  return g;
}

// Tapered, curved spike along +Z (base at origin). bend curls the tip toward +Y (negative = -Y).
export function spike({ len = 1, r0 = 0.2, bend = 0.2, side = 0, flat = 1, rings = 10, segs = 10, base = [0.85, 0.8, 0.7], tip = [0.12, 0.1, 0.09], tipStart = 0.45, rFn }) {
  const path = [];
  for (let i = 0; i <= rings; i++) { const t = i / rings; path.push(new THREE.Vector3(side * len * t * t, bend * len * t * t, len * t)); }
  return sweep({
    path, segs, upRef: new THREE.Vector3(0, 1, 0), vScale: 1 / Math.max(0.2, len),
    ring: (s) => { const r = rFn ? rFn(s) : r0 * Math.pow(Math.max(0, 1 - s), 0.85) + 0.004; return { rx: r * flat, ry: r }; },
    color: (s) => { const k = THREE.MathUtils.smoothstep(s, tipStart, 1); return [base[0] + (tip[0] - base[0]) * k, base[1] + (tip[1] - base[1]) * k, base[2] + (tip[2] - base[2]) * k]; },
    capStart: true,
  });
}

// Orient & place a geometry: rotate so +Z points along dir (with optional roll), then translate.
export function place(g, at, dir, roll = 0, up = new THREE.Vector3(0, 1, 0)) {
  const z = dir.clone().normalize(); let x = new THREE.Vector3().crossVectors(up, z); if (x.lengthSq() < 1e-6) x.set(1, 0, 0); x.normalize();
  const y = new THREE.Vector3().crossVectors(z, x);
  const m = new THREE.Matrix4().makeBasis(x, y, z);
  if (roll) m.multiply(new THREE.Matrix4().makeRotationZ(roll));
  m.setPosition(at); g.applyMatrix4(m); return g;
}
