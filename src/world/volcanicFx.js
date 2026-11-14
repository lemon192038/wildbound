// Volcanic particles: a CPU pool of soft lit puffs (smoke over lava, fumarole/hot-spring steam, the volcano plume,
// impact dust, splashes) + GPU-animated falling ash and rising embers. Fixed buffers, 3 draw calls total.
import { mulberry32 } from './noise.js';

const PUFF_V = `attribute float aSize; attribute vec4 aColor; attribute float aSeed; attribute float aHeat;
uniform float uScale; varying vec4 vColor; varying float vSeed; varying float vHeat;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(aSize * uScale / max(-mv.z, 0.1), 0.0, 640.0);
  // fade puffs that would fill the screen right in front of the lens
  vColor = aColor; vColor.a *= smoothstep(0.6, 3.0, -mv.z / max(aSize, 0.2)); vSeed = aSeed; vHeat = aHeat;
}`;
const PUFF_F = `varying vec4 vColor; varying float vSeed; varying float vHeat; uniform vec3 uGlow;
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y); }
void main(){
  vec2 c = gl_PointCoord * 2.0 - 1.0; float r = length(c); if (r > 1.0) discard;
  float n = vn(c * 2.2 + vSeed * 17.0) * 0.55 + vn(c * 4.7 - vSeed * 9.0) * 0.3 + vn(c * 9.0 + vSeed * 3.0) * 0.15;
  float a = smoothstep(1.0, 0.15, r + (n - 0.5) * 0.75);
  // fake volumetric lighting: lit top (sky/sun), glowing underside when hot
  float top = clamp(-c.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 col = vColor.rgb * (0.7 + 0.45 * top + 0.25 * n) + uGlow * vHeat * (1.0 - top) * (0.6 + 0.6 * n);
  gl_FragColor = vec4(col, vColor.a * a);
}`;

export function createVolcanicFx(THREE, scene, F, { getHeight, low, emitters, lavaSamples, fxPal }) {
  const rnd = mulberry32(4242 + F.id.length);
  const MAX = low ? 520 : 1100;
  const pos = new Float32Array(MAX * 3), col = new Float32Array(MAX * 4), size = new Float32Array(MAX), seed = new Float32Array(MAX), heat = new Float32Array(MAX);
  const vel = new Float32Array(MAX * 3), life = new Float32Array(MAX), maxLife = new Float32Array(MAX), grow = new Float32Array(MAX), drag = new Float32Array(MAX), grav = new Float32Array(MAX), alpha0 = new Float32Array(MAX), size0 = new Float32Array(MAX), heat0 = new Float32Array(MAX), shear = new Float32Array(MAX);
  for (let i = 0; i < MAX; i++) { seed[i] = rnd(); pos[i * 3 + 1] = -9999; }
  const g = new THREE.BufferGeometry();
  const aPos = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage), aCol = new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage);
  const aSize = new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage), aHeat = new THREE.BufferAttribute(heat, 1).setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('position', aPos); g.setAttribute('aColor', aCol); g.setAttribute('aSize', aSize); g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1)); g.setAttribute('aHeat', aHeat);
  const uScale = { value: 600 };
  const puffMat = new THREE.ShaderMaterial({ uniforms: { uScale, uGlow: { value: new THREE.Color(...F.palette.glow).multiplyScalar(1.6) } }, vertexShader: PUFF_V, fragmentShader: PUFF_F, transparent: true, depthWrite: false });
  const puffs = new THREE.Points(g, puffMat); puffs.frustumCulled = false; puffs.renderOrder = 5; puffs.name = 'fx-puffs'; scene.add(puffs);
  let cursor = 0;
  const wind = { x: F.wind?.[0] ?? 1.6, z: F.wind?.[1] ?? 0.5 };
  function emit(x, y, z, vx, vy, vz, l, s0, gr, dr, gv, r, gg, b, a, h = 0, sh = 0) {
    const i = cursor; cursor = (cursor + 1) % MAX;
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z; vel[i * 3] = vx; vel[i * 3 + 1] = vy; vel[i * 3 + 2] = vz;
    life[i] = l; maxLife[i] = l; size0[i] = s0; grow[i] = gr; drag[i] = dr; grav[i] = gv; alpha0[i] = a; heat0[i] = h; shear[i] = sh;
    col[i * 4] = r; col[i * 4 + 1] = gg; col[i * 4 + 2] = b; col[i * 4 + 3] = 0; size[i] = s0; heat[i] = h;
  }
  const [dr, dg, db] = fxPal.dust;
  function spawnDust(p, amount = 1) {
    amount = Math.max(0.2, Math.min(amount, 6)); const n = Math.round(6 + amount * 11);
    const gy = getHeight(p.x, p.z); const y0 = Math.max(p.y ?? gy, gy) + 0.1;
    for (let k = 0; k < n; k++) {
      const a = rnd() * Math.PI * 2, sp = (1.2 + rnd() * 3.2) * Math.sqrt(amount), sh = 0.75 + rnd() * 0.35;
      emit(p.x + Math.cos(a) * 0.3 * amount, y0 + rnd() * 0.3, p.z + Math.sin(a) * 0.3 * amount, Math.cos(a) * sp, 0.4 + rnd() * amount, Math.sin(a) * sp,
        1.2 + rnd() * 1.5 + amount * 0.3, (0.5 + rnd() * 0.6) * (0.6 + amount * 0.4), 1.4 + rnd() * 1.2, 2.6, -0.12, dr * sh, dg * sh, db * sh, 0.5 + rnd() * 0.2, 0, 0.3);
    }
  }
  function spawnSplash(p, amount = 1) {
    const n = Math.round(14 * amount + 6);
    for (let k = 0; k < n; k++) { const a = rnd() * Math.PI * 2, sp = 0.6 + rnd() * 2.2; emit(p.x, p.y + 0.05, p.z, Math.cos(a) * sp, 2.5 + rnd() * 3.5 * amount, Math.sin(a) * sp, 0.5 + rnd() * 0.4, 0.07 + rnd() * 0.1, 0.2, 0.4, -14, 0.8, 0.85, 0.85, 0.8); }
    for (let k = 0; k < 6; k++) emit(p.x + (rnd() - 0.5), p.y + 0.3, p.z + (rnd() - 0.5), 0, 1 + rnd(), 0, 1.6 + rnd(), 0.8, 2.2, 1.5, 0.4, 0.85, 0.85, 0.85, 0.3, 0, 0.6);
  }
  // emitter kinds: smoke (over lava, dark, hot underside), steam (white), plume (volcano), mist (big slow cave haze)
  const KIND = {
    smoke: (e) => emit(e.x + (rnd() - 0.5) * e.spread, e.y, e.z + (rnd() - 0.5) * e.spread, (rnd() - 0.5) * 0.4, 1.4 + rnd() * 1.2, (rnd() - 0.5) * 0.4, 7 + rnd() * 5, 1.6 * e.scale, 2.4, 0.25, 0.05, ...fxPal.smoke, 0.32, 1.0, 1),
    steam: (e) => emit(e.x + (rnd() - 0.5) * e.spread, e.y, e.z + (rnd() - 0.5) * e.spread, (rnd() - 0.5) * 0.3, 1.2 + rnd() * 1.4, (rnd() - 0.5) * 0.3, 4 + rnd() * 3, 0.7 * e.scale, 3.0, 0.3, 0.12, ...fxPal.steam, 0.3, 0.0, 1),
    plume: (e) => emit(e.x + (rnd() - 0.5) * e.spread, e.y, e.z + (rnd() - 0.5) * e.spread, (rnd() - 0.5) * 6, 14 + rnd() * 10, (rnd() - 0.5) * 6, 24 + rnd() * 14, 70 * e.scale, 2.2, 0.05, 0.1, 0.07, 0.06, 0.06, 0.9, 1.2, 6),
    mist: (e) => emit(e.x + (rnd() - 0.5) * e.spread, e.y, e.z + (rnd() - 0.5) * e.spread, (rnd() - 0.5) * 0.4, 0.25 + rnd() * 0.3, (rnd() - 0.5) * 0.4, 14 + rnd() * 6, 5 * e.scale, 1.6, 0.1, 0.0, ...fxPal.steam, 0.12, 0.5, 0.3),
  };
  for (const e of emitters) { e.acc = rnd(); e.spread ??= 1; e.scale ??= 1; }

  // ---- falling ash: GPU points wrapped in a box around the camera ----
  const AN = Math.round((low ? 500 : 1400) * (F.ashFall ?? 1)), BOX = new THREE.Vector3(70, 36, 70);
  const ap = new Float32Array(AN * 3), as = new Float32Array(AN), asd = new Float32Array(AN);
  for (let i = 0; i < AN; i++) { ap[i * 3] = rnd() * BOX.x; ap[i * 3 + 1] = rnd() * BOX.y; ap[i * 3 + 2] = rnd() * BOX.z; as[i] = 0.035 + rnd() * 0.05; asd[i] = rnd(); }
  const ag = new THREE.BufferGeometry(); ag.setAttribute('position', new THREE.BufferAttribute(ap, 3)); ag.setAttribute('aSize', new THREE.BufferAttribute(as, 1)); ag.setAttribute('aSeed', new THREE.BufferAttribute(asd, 1));
  const ashU = { uScale, uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uBox: { value: BOX }, uWind: { value: new THREE.Vector2(wind.x, wind.z) }, uCol: { value: new THREE.Color(...fxPal.ash) } };
  const ashMat = new THREE.ShaderMaterial({
    uniforms: ashU, transparent: true, depthWrite: false,
    vertexShader: `attribute float aSize; attribute float aSeed; uniform float uScale, uTime; uniform vec3 uCam, uBox; uniform vec2 uWind; varying float vA;
void main(){
  float t = uTime;
  vec3 p = position + vec3(uWind.x * t * 0.8 + sin(t * 0.7 + aSeed * 30.0) * 1.2, -t * (0.6 + aSeed * 0.5), uWind.y * t * 0.8 + cos(t * 0.6 + aSeed * 20.0) * 1.2);
  vec3 o = uCam - uBox * 0.5; p = mod(p - o, uBox) + o;
  vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; float d = -mv.z;
  vA = smoothstep(0.5, 3.0, d) * (1.0 - smoothstep(22.0, 34.0, d));
  gl_PointSize = clamp(aSize * uScale / max(d, 0.1), 1.0, 16.0);
}`,
    fragmentShader: `varying float vA; uniform vec3 uCol; void main(){ vec2 c = gl_PointCoord * 2.0 - 1.0; float r = dot(c, c); if (r > 1.0) discard; gl_FragColor = vec4(uCol, (1.0 - r) * vA * 0.75); }`,
  });
  const ash = new THREE.Points(ag, ashMat); ash.frustumCulled = false; ash.renderOrder = 6; ash.name = 'fx-ash'; scene.add(ash);

  // ---- embers: rise from lava, swirl, fade (looping, purely in the vertex shader) ----
  const EN = Math.round((low ? 220 : 600) * (F.embers ?? 1));
  const ep = new Float32Array(EN * 3), esd = new Float32Array(EN);
  const src = lavaSamples.length ? lavaSamples : [[0, 0]];
  for (let i = 0; i < EN; i++) { const s = src[Math.floor(rnd() * src.length)]; ep[i * 3] = s[0] + (rnd() - 0.5) * 3; ep[i * 3 + 1] = F.lavaY + 0.1; ep[i * 3 + 2] = s[1] + (rnd() - 0.5) * 3; esd[i] = rnd(); }
  const eg = new THREE.BufferGeometry(); eg.setAttribute('position', new THREE.BufferAttribute(ep, 3)); eg.setAttribute('aSeed', new THREE.BufferAttribute(esd, 1));
  const embU = { uScale, uTime: { value: 0 }, uWind: { value: new THREE.Vector2(wind.x, wind.z) } };
  const embMat = new THREE.ShaderMaterial({
    uniforms: embU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute float aSeed; uniform float uScale, uTime; uniform vec2 uWind; varying float vA; varying float vT;
void main(){
  float life = 4.0 + aSeed * 5.0; float t = fract(uTime / life + aSeed * 7.13); float age = t * life;
  vec3 p = position;
  p.y += age * (1.6 + aSeed * 1.8) + sin(age * 2.0 + aSeed * 40.0) * 0.4;
  p.x += uWind.x * age * 0.7 + sin(age * 3.1 + aSeed * 13.0) * 0.8 * t;
  p.z += uWind.y * age * 0.7 + cos(age * 2.7 + aSeed * 23.0) * 0.8 * t;
  vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; float d = -mv.z;
  vT = t; vA = smoothstep(0.0, 0.08, t) * (1.0 - smoothstep(0.55, 1.0, t)) * (1.0 - smoothstep(90.0, 140.0, d)) * (0.6 + 0.4 * sin(uTime * 9.0 + aSeed * 60.0));
  gl_PointSize = clamp((0.09 + aSeed * 0.08) * uScale / max(d, 0.1), 1.2, 10.0);
}`,
    fragmentShader: `varying float vA; varying float vT; void main(){ float r = length(gl_PointCoord * 2.0 - 1.0); float a = pow(max(1.0 - r, 0.0), 1.6) * vA;
  vec3 c = mix(vec3(4.0, 1.6, 0.35), vec3(1.6, 0.25, 0.03), vT); gl_FragColor = vec4(c * a, a); }`,
  });
  const embers = new THREE.Points(eg, embMat); embers.frustumCulled = false; embers.renderOrder = 7; embers.name = 'fx-embers'; scene.add(embers);

  let tAcc = 0, burst = 0;
  const cam = new THREE.Vector3();
  function update(rawDt, camera, renderer) {
    tAcc += rawDt; const dt = Math.min(rawDt, 0.05);
    const h = renderer.domElement.height || 720;
    uScale.value = h * 0.5 * camera.projectionMatrix.elements[5];
    ashU.uTime.value = tAcc; ashU.uCam.value.copy(camera.position); embU.uTime.value = tAcc;
    cam.copy(camera.position);
    // emit
    for (const e of emitters) {
      const d = Math.hypot(e.x - cam.x, e.z - cam.z);
      const far = e.kind === 'plume' ? 1 : d > 220 ? 0 : d > 120 ? 0.35 : 1;
      e.acc += e.rate * dt * far * (e.kind === 'plume' ? 1 + burst * 3 : 1);
      while (e.acc >= 1) { e.acc -= 1; KIND[e.kind](e); }
    }
    burst = Math.max(0, burst - dt * 0.4);
    // simulate
    for (let i = 0; i < MAX; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt; const k = i * 3;
      if (life[i] <= 0) { pos[k + 1] = -9999; col[i * 4 + 3] = 0; continue; }
      const dmp = Math.exp(-drag[i] * dt);
      const t = 1 - life[i] / maxLife[i];
      vel[k] = vel[k] * dmp + wind.x * shear[i] * dt * (0.5 + t); vel[k + 2] = vel[k + 2] * dmp + wind.z * shear[i] * dt * (0.5 + t);
      vel[k + 1] = vel[k + 1] * (grav[i] < -1 ? 1 : dmp) + grav[i] * dt;
      pos[k] += vel[k] * dt; pos[k + 1] += vel[k + 1] * dt; pos[k + 2] += vel[k + 2] * dt;
      size[i] = size0[i] * (1 + grow[i] * Math.sqrt(t) * 2.2);
      col[i * 4 + 3] = alpha0[i] * Math.min(1, t * 6) * (1 - t) * (1 - t * 0.6);
      heat[i] = heat0[i] * Math.exp(-t * 3.5);
      if (grav[i] < -1) { const gy = getHeight(pos[k], pos[k + 2]); if (pos[k + 1] < gy) life[i] = 0; }
    }
    aPos.needsUpdate = true; aCol.needsUpdate = true; aSize.needsUpdate = true; aHeat.needsUpdate = true;
  }
  return { spawnDust, spawnSplash, update, eruption() { burst = 1; }, emit, objects: [puffs, ash, embers] };
}
