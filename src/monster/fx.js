// Monster VFX: fire-breath particle stream + light, vent embers, falling debris (broken horn, severed tail).
import * as THREE from 'three';

const VS = `attribute float aSize; attribute float aLife; varying float vLife; uniform float uScale;
void main(){ vLife = aLife; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uScale / max(0.5, -mv.z); }`;
// uMode 1: additive embers. 2: fire (heat ramp white-yellow core -> orange -> dark red -> soot). 3: smoke.
const FS = `varying float vLife; uniform float uMode;
void main(){ vec2 c = gl_PointCoord - 0.5; float r = length(c); if (r > 0.5) discard; if (vLife <= 0.0) discard;
  float soft = smoothstep(0.5, 0.0, r); float l = clamp(vLife, 0.0, 1.0);
  if (uMode > 2.5) { // smoke: dark warm grey, fades in then out
    float a = soft * soft * 0.34 * sin(3.14159 * (1.0 - l)) ;
    gl_FragColor = vec4(vec3(0.075, 0.066, 0.06) * (1.0 + 0.6 * l), a); return; }
  if (uMode > 1.5) { // fire
    vec3 core = vec3(1.0, 0.9, 0.62) * 1.55, orange = vec3(1.0, 0.42, 0.07) * 1.2, ember = vec3(0.42, 0.07, 0.02), soot = vec3(0.07, 0.05, 0.045);
    vec3 col = l > 0.82 ? mix(orange, core, (l - 0.82) / 0.18) : l > 0.5 ? mix(ember, orange, (l - 0.5) / 0.32) : mix(soot, ember, smoothstep(0.18, 0.5, l));
    float flick = 0.85 + 0.15 * sin(gl_PointCoord.x * 9.0 + l * 40.0);
    float a = pow(soft, 1.6) * (l > 0.18 ? 0.62 : 0.62 * l / 0.18) * flick;
    gl_FragColor = vec4(col, a); return; }
  float a = soft * soft * smoothstep(0.0, 0.3, l) * 0.6;
  gl_FragColor = vec4(vec3(1.0, 0.5, 0.15) * (0.6 + 1.4 * l) * a, a); }`;

function scorchTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 4, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.75)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 60; i++) { const a = Math.random() * 6.28, rr = 30 + Math.random() * 34; g.fillStyle = `rgba(0,0,0,${0.3 + Math.random() * 0.5})`; g.beginPath(); g.arc(64 + Math.cos(a) * rr, 64 + Math.sin(a) * rr, 3 + Math.random() * 9, 0, 7); g.fill(); }
  const t = new THREE.CanvasTexture(c); return t;
}

class Particles {
  constructor(scene, max, mode) {
    this.max = max; this.n = 0;
    this.pos = new Float32Array(max * 3); this.vel = new Float32Array(max * 3); this.age = new Float32Array(max); this.life = new Float32Array(max);
    this.size0 = new Float32Array(max); this.size = new Float32Array(max); this.l = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aLife', new THREE.BufferAttribute(this.l, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, uniforms: { uScale: { value: 600 }, uMode: { value: mode } },
      blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    if (mode > 1.5) this.mat.blending = THREE.NormalBlending;
    this.points = new THREE.Points(g, this.mat); this.points.frustumCulled = false; this.points.renderOrder = mode > 2.5 ? 4 : 5; scene.add(this.points);
    this.head = 0;
  }
  emit(p, v, life, size) {
    const i = this.head; this.head = (this.head + 1) % this.max;
    this.pos.set([p.x, p.y, p.z], i * 3); this.vel.set([v.x, v.y, v.z], i * 3); this.age[i] = 0; this.life[i] = life; this.size0[i] = size;
  }
  update(dt, grow, drag, buoy, groundFn) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { this.l[i] = 0; continue; }
      this.age[i] += dt; const f = this.age[i] / this.life[i];
      if (f >= 1) { this.life[i] = 0; this.l[i] = 0; continue; }
      const k = Math.exp(-drag * dt);
      this.vel[i * 3] *= k; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * k + buoy * dt; this.vel[i * 3 + 2] *= k;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (groundFn) { const gy = groundFn(this.pos[i * 3], this.pos[i * 3 + 2]) + 0.2; if (this.pos[i * 3 + 1] < gy) { this.pos[i * 3 + 1] = gy; this.vel[i * 3 + 1] = Math.abs(this.vel[i * 3 + 1]) * 0.2; this.vel[i * 3] *= 1.02; this.vel[i * 3 + 2] *= 1.02; } }
      this.size[i] = this.size0[i] * (1 + f * grow); this.l[i] = 1 - f;
    }
    const a = this.points.geometry.attributes; a.position.needsUpdate = a.aSize.needsUpdate = a.aLife.needsUpdate = true;
  }
}

export function createFx(game) {
  const { scene, world } = game;
  const fire = new Particles(scene, 900, 2), embers = new Particles(scene, 220, 1), smoke = new Particles(scene, 320, 3);
  // ground scorch decals (pool), fade over ~12 s
  const scTex = scorchTexture(); const scorches = [];
  for (let i = 0; i < 14; i++) {
    const mat = new THREE.MeshBasicMaterial({ map: scTex, transparent: true, depthWrite: false, opacity: 0, color: 0x000000, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    const d = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), mat); d.visible = false; d.renderOrder = 2; scene.add(d); scorches.push({ mesh: d, age: 99 });
  }
  let scHead = 0, scTimer = 0;
  const _c = new THREE.Color(), hotC = new THREE.Color(0.5, 0.13, 0.025), charC = new THREE.Color(0.03, 0.025, 0.02);
  const light = new THREE.PointLight(0xff7a30, 0, 20, 1.2); light.castShadow = false; scene.add(light);
  const debris = [];
  const _v = new THREE.Vector3(), _w = new THREE.Vector3();
  const fx = {
    breathing: false, light, _fire: fire,
    breath(origin, dir, dt, intensity = 1) {
      // smoke tail along the cone + scorch where the cone meets the ground
      const ns = Math.ceil(dt * 45 * intensity);
      for (let i = 0; i < ns; i++) {
        const d = 3 + Math.random() * 9; _w.copy(origin).addScaledVector(dir, d); _w.x += (Math.random() - 0.5) * d * 0.25; _w.z += (Math.random() - 0.5) * d * 0.25;
        _v.copy(dir).multiplyScalar(5 + Math.random() * 3); _v.y += 1.5 + Math.random();
        smoke.emit(_w, _v, 0.8 + Math.random() * 0.5, 1.2 + d * 0.12);
      }
      scTimer -= dt;
      if (scTimer <= 0) {
        scTimer = 0.14;
        let hit = null; for (let d = 2; d <= 15; d += 0.75) { _w.copy(origin).addScaledVector(dir, d); const gy = world.getHeight(_w.x, _w.z); if (_w.y < gy + 0.6 + d * 0.12) { hit = _w.clone(); hit.y = gy; break; } }
        if (hit) { const s = scorches[scHead]; scHead = (scHead + 1) % scorches.length; s.age = 0; s.mesh.visible = true; s.mesh.position.set(hit.x + (Math.random() - 0.5), hit.y + 0.06, hit.z + (Math.random() - 0.5)); const sz = 2.6 + Math.random() * 2; s.mesh.scale.set(sz, 1, sz); s.mesh.rotation.y = Math.random() * 6.28; }
      }
      const n = Math.ceil(dt * 240 * intensity);
      for (let i = 0; i < n; i++) {
        const sp = 0.16; _v.set(dir.x + (Math.random() - 0.5) * sp, dir.y + (Math.random() - 0.5) * sp, dir.z + (Math.random() - 0.5) * sp).normalize().multiplyScalar(19 + Math.random() * 6);
        _w.copy(origin).addScaledVector(_v, Math.random() * dt);
        fire.emit(_w, _v, 0.7 + Math.random() * 0.4, 0.45 + Math.random() * 0.45);
      }
    },
    sparks(origin, n, spread = 1, up = 3) {
      for (let i = 0; i < n; i++) {
        _v.set((Math.random() - 0.5) * spread * 2, up * (0.5 + Math.random()), (Math.random() - 0.5) * spread * 2);
        embers.emit(_w.copy(origin).add(_v.clone().multiplyScalar(0.1)), _v, 0.8 + Math.random() * 1.0, 0.15 + Math.random() * 0.2);
      }
    },
    smokePuff(origin, dir) {
      for (let i = 0; i < 40; i++) { _v.set(dir.x * 3 + (Math.random() - 0.5) * 2, 1 + Math.random() * 1.5, dir.z * 3 + (Math.random() - 0.5) * 2); smoke.emit(_w.copy(origin).addScaledVector(dir, Math.random()), _v, 0.8 + Math.random() * 0.5, 0.8 + Math.random() * 0.6); }
      for (let i = 0; i < 18; i++) { _v.set(dir.x * 4 + (Math.random() - 0.5) * 3, Math.random() * 2, dir.z * 4 + (Math.random() - 0.5) * 3); fire.emit(_w.copy(origin), _v, 0.35 + Math.random() * 0.2, 0.25 + Math.random() * 0.25); }
    },
    drip(origin) { _v.set((Math.random() - 0.5) * 0.4, -1.5 - Math.random(), (Math.random() - 0.5) * 0.4); embers.emit(origin, _v, 0.9 + Math.random() * 0.5, 0.18 + Math.random() * 0.12); },
    addDebris(mesh, vel, spin) {
      scene.add(mesh); debris.push({ mesh, vel, spin, life: 14, rest: false });
    },
    update(dt) {
      const sc = (game.renderer?.domElement?.height || 720) / (2 * Math.tan(THREE.MathUtils.degToRad((game.camera?.fov || 55) / 2)));
      fire.mat.uniforms.uScale.value = embers.mat.uniforms.uScale.value = smoke.mat.uniforms.uScale.value = sc;
      fire.update(dt, 5.5, 0.85, 3.0, (x, z) => world.getHeight(x, z));
      smoke.update(dt, 3.0, 0.6, 1.4, null);
      for (const s of scorches) {
        if (!s.mesh.visible) continue; s.age += dt;
        const k = THREE.MathUtils.smoothstep(s.age, 0.2, 1.4); _c.copy(hotC).lerp(charC, k); s.mesh.material.color.copy(_c);
        s.mesh.material.opacity = 0.62 * (1 - THREE.MathUtils.smoothstep(s.age, 7, 12)); if (s.age > 12) s.mesh.visible = false;
      }
      embers.update(dt, 0.2, 0.8, 1.2, null);
      for (let i = debris.length - 1; i >= 0; i--) {
        const d = debris[i]; d.life -= dt;
        if (!d.rest) {
          d.vel.y -= 22 * dt; d.mesh.position.addScaledVector(d.vel, dt);
          d.mesh.rotation.x += d.spin.x * dt; d.mesh.rotation.y += d.spin.y * dt; d.mesh.rotation.z += d.spin.z * dt;
          const gy = world.getHeight(d.mesh.position.x, d.mesh.position.z) + 0.25;
          if (d.mesh.position.y < gy) {
            d.mesh.position.y = gy; d.vel.y = -d.vel.y * 0.3; d.vel.x *= 0.5; d.vel.z *= 0.5; d.spin.multiplyScalar(0.4);
            if (Math.abs(d.vel.y) < 1.5) { d.rest = true; game.events.emit('sfx', { name: 'thud', position: d.mesh.position.clone(), volume: 0.6 }); world.spawnDust?.(d.mesh.position.clone(), 0.6); }
          }
        }
        if (d.life < 0) { scene.remove(d.mesh); debris.splice(i, 1); }
      }
    },
  };
  return fx;
}
