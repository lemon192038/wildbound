// Combat VFX: additive weapon trail ribbon, ember/spark particles, impact flash sprites. Blood-free.
import * as THREE from 'three';

function radialTex(size = 64) {
  const d = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = (x + 0.5) / size * 2 - 1, v = (y + 0.5) / size * 2 - 1, r = Math.hypot(u, v);
    const a = Math.max(0, 1 - r) ** 2, star = Math.max(0, 1 - Math.abs(u * v) * 40) * Math.max(0, 1 - r) * 0.8;
    const i = (y * size + x) * 4; d[i] = 255; d[i + 1] = 255; d[i + 2] = 255; d[i + 3] = Math.min(255, (a + star) * 255);
  }
  const t = new THREE.DataTexture(d, size, size, THREE.RGBAFormat); t.needsUpdate = true; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter; return t;
}

export class WeaponTrail {
  constructor(scene, color = new THREE.Color(1.0, 0.55, 0.2)) {
    this.max = 18; this.sub = 4; this.samples = []; this.life = 0.12;
    const n = (this.max - 1) * this.sub + 1;
    this.pos = new Float32Array(n * 2 * 3); this.uvA = new Float32Array(n * 2 * 2);
    const idx = []; for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(this.uvA, 2)); g.setIndex(idx);
    g.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
      uniforms: { uColor: { value: color }, uPower: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 uColor; uniform float uPower; varying vec2 vUv;
        void main(){ float age = vUv.x; float w = vUv.y; // age 0 = newest, w 0 = inner edge, 1 = blade tip
          float fade = pow(max(0.0, 1.0 - age), 2.5);
          float a = fade * smoothstep(0.0, 0.6, w) * (0.25 + 0.75 * w);
          float core = smoothstep(0.82, 1.0, w) * fade;
          vec3 c = mix(uColor, vec3(1.0, 0.92, 0.75), core * 0.6);
          gl_FragColor = vec4(c * a * 0.5 * uPower, a); }`,
    });
    this.mesh = new THREE.Mesh(g, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 10; scene.add(this.mesh);
  }
  push(base, tip, time) { this.samples.unshift({ b: base.clone(), t: tip.clone(), time }); if (this.samples.length > this.max) this.samples.pop(); }
  clear() { this.samples.length = 0; this.mesh.geometry.setDrawRange(0, 0); }
  update(time) {
    while (this.samples.length && time - this.samples[this.samples.length - 1].time > this.life) this.samples.pop();
    const S = this.samples, n = S.length;
    if (n < 2) { this.mesh.geometry.setDrawRange(0, 0); return; }
    let k = 0; const P = this.pos, U = this.uvA, tmpB = new THREE.Vector3(), tmpT = new THREE.Vector3();
    const cr = (a, b, c, d, t, out, key) => {
      const t2 = t * t, t3 = t2 * t;
      return out.set(0, 0, 0).addScaledVector(a[key], -0.5 * t3 + t2 - 0.5 * t).addScaledVector(b[key], 1.5 * t3 - 2.5 * t2 + 1)
        .addScaledVector(c[key], -1.5 * t3 + 2 * t2 + 0.5 * t).addScaledVector(d[key], 0.5 * t3 - 0.5 * t2);
    };
    for (let i = 0; i < n - 1; i++) {
      const a = S[Math.max(0, i - 1)], b = S[i], c = S[i + 1], d = S[Math.min(n - 1, i + 2)];
      for (let s = 0; s < this.sub; s++) {
        const t = s / this.sub; cr(a, b, c, d, t, tmpB, 'b'); cr(a, b, c, d, t, tmpT, 't');
        const age = Math.min(1, (time - (b.time + (c.time - b.time) * t)) / this.life);
        P.set([tmpB.x, tmpB.y, tmpB.z, tmpT.x, tmpT.y, tmpT.z], k * 6); U.set([age, 0, age, 1], k * 4); k++;
      }
    }
    const L = S[n - 1]; P.set([L.b.x, L.b.y, L.b.z, L.t.x, L.t.y, L.t.z], k * 6); U.set([1, 0, 1, 1], k * 4); k++;
    const g = this.mesh.geometry; g.attributes.position.needsUpdate = true; g.attributes.uv.needsUpdate = true; g.setDrawRange(0, (k - 1) * 6);
  }
}

export class Sparks {
  constructor(scene, count = 220) {
    this.n = count; this.pos = new Float32Array(count * 3); this.vel = new Float32Array(count * 3); this.life = new Float32Array(count); this.max = new Float32Array(count);
    this.col = new Float32Array(count * 3); this.size = new Float32Array(count); this.i = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(this.col, 3)); g.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, vertexColors: true,
      uniforms: { uScale: { value: 600 } },
      vertexShader: `attribute float size; varying vec3 vC; uniform float uScale; void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * uScale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec3 vC; void main(){ vec2 d = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.0, length(d)); gl_FragColor = vec4(vC * a * 2.0, a); }`,
    });
    this.points = new THREE.Points(g, this.mat); this.points.frustumCulled = false; this.points.renderOrder = 11; scene.add(this.points);
    this.flashTex = radialTex(); this.flashes = [];
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.flashTex, color: 0xffb060, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }));
      s.visible = false; s.renderOrder = 12; scene.add(s); this.flashes.push({ s, t: 0, d: 0.1, size: 1 });
    }
    this.fi = 0;
  }
  burst(point, normal, amount = 24, power = 1, hue = 0) {
    for (let k = 0; k < amount; k++) {
      const i = this.i = (this.i + 1) % this.n, o = i * 3;
      this.pos[o] = point.x; this.pos[o + 1] = point.y; this.pos[o + 2] = point.z;
      const sp = (2 + Math.random() * 7) * power;
      let vx = normal.x + (Math.random() - 0.5) * 1.6, vy = normal.y + Math.random() * 0.9 + 0.2, vz = normal.z + (Math.random() - 0.5) * 1.6;
      const l = Math.hypot(vx, vy, vz) || 1; this.vel[o] = vx / l * sp; this.vel[o + 1] = vy / l * sp; this.vel[o + 2] = vz / l * sp;
      this.max[i] = this.life[i] = 0.25 + Math.random() * 0.45; this.size[i] = (0.035 + Math.random() * 0.05) * (0.8 + power * 0.4);
      const hot = Math.random();
      this.col[o] = 1; this.col[o + 1] = hue ? 0.85 : 0.45 + hot * 0.45; this.col[o + 2] = hue ? 0.6 : 0.12 + hot * 0.3;
    }
    const f = this.flashes[this.fi = (this.fi + 1) % this.flashes.length];
    f.s.position.copy(point); f.t = f.d = 0.09 + 0.05 * power; f.size = 0.35 + 0.35 * power; f.s.visible = true;
  }
  update(dt) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) { this.size[i] = 0; continue; }
      this.life[i] -= dt; const o = i * 3;
      this.vel[o + 1] -= 14 * dt; this.vel[o] *= 0.985; this.vel[o + 2] *= 0.985;
      this.pos[o] += this.vel[o] * dt; this.pos[o + 1] += this.vel[o + 1] * dt; this.pos[o + 2] += this.vel[o + 2] * dt;
      const k = Math.max(0, this.life[i] / this.max[i]); this.col[o + 1] *= 0.995; this.col[o + 2] *= 0.98;
      if (k <= 0) this.size[i] = 0; else this.size[i] *= 0.997;
    }
    const g = this.points.geometry; g.attributes.position.needsUpdate = g.attributes.color.needsUpdate = g.attributes.size.needsUpdate = true;
    for (const f of this.flashes) {
      if (!f.s.visible) continue; f.t -= dt; if (f.t <= 0) { f.s.visible = false; continue; }
      const k = f.t / f.d; f.s.scale.setScalar(f.size * (1.4 - k * 0.6)); f.s.material.opacity = k;
    }
  }
}
