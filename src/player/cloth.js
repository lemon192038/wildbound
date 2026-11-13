// Small verlet cloth strip (tabard flaps, mantle). Simulated in world space; top row pinned to bone-space anchors,
// soft "shape matching" pull toward a bone-space rest shape keeps it stable through rolls/knockdowns.
import * as THREE from 'three';

const _v = new THREE.Vector3(), _w = new THREE.Vector3();

export class ClothStrip {
  // opts: { anchorBone, cols, rows, rest(c, r) -> Vector3 in anchor-bone local space, stiffness(r) -> 0..1, material }
  constructor(opts) {
    Object.assign(this, opts);
    const n = this.cols * this.rows;
    this.p = new Float32Array(n * 3); this.q = new Float32Array(n * 3); this.restLocal = [];
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) this.restLocal.push(this.rest(c, r));
    const g = new THREE.BufferGeometry(), uv = [], idx = [];
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) uv.push(c / (this.cols - 1), 1 - r / (this.rows - 1));
    for (let r = 0; r < this.rows - 1; r++) for (let c = 0; c < this.cols - 1; c++) { const a = r * this.cols + c, b = a + this.cols; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    g.setAttribute('position', new THREE.BufferAttribute(this.p, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    this.mesh = new THREE.Mesh(g, this.material); this.mesh.castShadow = true; this.mesh.receiveShadow = true; this.mesh.frustumCulled = false; this.mesh.matrixAutoUpdate = false;
    // constraints: structural + shear + bend
    this.cons = [];
    const id = (c, r) => r * this.cols + c;
    const addC = (a, b) => { const A = this.restLocal[a], B = this.restLocal[b]; this.cons.push([a, b, A.distanceTo(B)]); };
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) {
      if (c + 1 < this.cols) addC(id(c, r), id(c + 1, r));
      if (r + 1 < this.rows) addC(id(c, r), id(c, r + 1));
      if (r + 1 < this.rows && c + 1 < this.cols) { addC(id(c, r), id(c + 1, r + 1)); addC(id(c + 1, r), id(c, r + 1)); }
      if (r + 2 < this.rows) addC(id(c, r), id(c, r + 2));
    }
    this.initialized = false; this.acc = 0;
  }
  reset() { this.initialized = false; }
  _target(i, out) { return out.copy(this.restLocal[i]).applyMatrix4(this.anchorBone.matrixWorld); }
  update(dt, colliders, groundFn) {
    const P = this.p, Q = this.q, n = this.cols * this.rows;
    if (!this.initialized) {
      for (let i = 0; i < n; i++) { this._target(i, _v); P[i * 3] = Q[i * 3] = _v.x; P[i * 3 + 1] = Q[i * 3 + 1] = _v.y; P[i * 3 + 2] = Q[i * 3 + 2] = _v.z; }
      this.initialized = true;
    }
    if (dt > 0) {
      this.acc = Math.min(this.acc + dt, 1 / 20);
      const h = 1 / 90;
      while (this.acc >= h) { this.acc -= h; this._step(h, colliders, groundFn); }
    }
    this.mesh.geometry.attributes.position.needsUpdate = true; this.mesh.geometry.computeVertexNormals();
  }
  _step(h, colliders, groundFn) {
    const P = this.p, Q = this.q, n = this.cols * this.rows, damp = 0.985, g = -9.8 * h * h;
    for (let i = this.cols; i < n; i++) {
      const k = i * 3;
      for (let a = 0; a < 3; a++) { const x = P[k + a], v = (x - Q[k + a]) * damp; Q[k + a] = x; P[k + a] = x + v + (a === 1 ? g : 0); }
      // shape-matching pull
      const r = Math.floor(i / this.cols), s = this.stiffness(r);
      this._target(i, _v); P[k] += (_v.x - P[k]) * s; P[k + 1] += (_v.y - P[k + 1]) * s; P[k + 2] += (_v.z - P[k + 2]) * s;
    }
    for (let i = 0; i < this.cols; i++) { this._target(i, _v); const k = i * 3; Q[k] = P[k]; Q[k + 1] = P[k + 1]; Q[k + 2] = P[k + 2]; P[k] = _v.x; P[k + 1] = _v.y; P[k + 2] = _v.z; }
    for (let it = 0; it < 4; it++) {
      for (const [a, b, L] of this.cons) {
        const ia = a * 3, ib = b * 3, dx = P[ib] - P[ia], dy = P[ib + 1] - P[ia + 1], dz = P[ib + 2] - P[ia + 2];
        const d = Math.hypot(dx, dy, dz) || 1e-6, diff = (d - L) / d;
        const pa = a < this.cols ? 0 : 0.5, pb = b < this.cols ? 0 : 0.5, sum = pa + pb; if (!sum) continue;
        const fa = (pa / sum) * diff, fb = (pb / sum) * diff;
        P[ia] += dx * fa; P[ia + 1] += dy * fa; P[ia + 2] += dz * fa; P[ib] -= dx * fb; P[ib + 1] -= dy * fb; P[ib + 2] -= dz * fb;
      }
      for (let i = this.cols; i < n; i++) {
        const k = i * 3; _w.set(P[k], P[k + 1], P[k + 2]);
        for (const c of colliders) {
          _v.subVectors(_w, c.c); const d = _v.length();
          if (d < c.r) { _v.multiplyScalar((c.r - d) / (d || 1e-6)); _w.add(_v); }
        }
        const gy = groundFn(_w.x, _w.z) + 0.02; if (_w.y < gy) _w.y = gy;
        P[k] = _w.x; P[k + 1] = _w.y; P[k + 2] = _w.z;
      }
    }
  }
}
