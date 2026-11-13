// CPU-simulated particle pools rendered as soft point sprites: impact dust, water splashes, ambient pollen motes.
import { mulberry32 } from './noise.js';

const VERT = `
attribute float aSize; attribute vec4 aColor; attribute float aSeed;
uniform float uScale; varying vec4 vColor; varying float vSeed;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(aSize * uScale / max(-mv.z, 0.1), 0.0, 512.0);
  vColor = aColor; vSeed = aSeed;
}`;
const FRAG = `
varying vec4 vColor; varying float vSeed;
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y); }
void main(){
  vec2 c = gl_PointCoord * 2.0 - 1.0; float r = length(c);
  if (r > 1.0) discard;
  float n = vn(c * 2.5 + vSeed * 17.0) * 0.6 + vn(c * 5.0 - vSeed * 9.0) * 0.4;
  float a = smoothstep(1.0, 0.2, r + (n - 0.5) * 0.6 * step(0.5, vColor.a * 0.0 + 1.0));
  gl_FragColor = vec4(vColor.rgb * (0.85 + 0.3 * n), vColor.a * a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function createParticles(THREE, scene, opts) {
  const { getHeight, lowMode } = opts;
  const rnd = mulberry32(4242);
  const MAX = lowMode ? 600 : 1500;
  const pos = new Float32Array(MAX * 3), col = new Float32Array(MAX * 4), size = new Float32Array(MAX), seed = new Float32Array(MAX);
  const vel = new Float32Array(MAX * 3), life = new Float32Array(MAX), maxLife = new Float32Array(MAX), grow = new Float32Array(MAX), drag = new Float32Array(MAX), grav = new Float32Array(MAX), alpha0 = new Float32Array(MAX), size0 = new Float32Array(MAX);
  for (let i = 0; i < MAX; i++) { seed[i] = rnd(); pos[i * 3 + 1] = -9999; }
  const g = new THREE.BufferGeometry();
  const aPos = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
  const aCol = new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage);
  const aSize = new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('position', aPos); g.setAttribute('aColor', aCol); g.setAttribute('aSize', aSize); g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const uScale = { value: 600 };
  const mat = new THREE.ShaderMaterial({ uniforms: { uScale }, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false });
  const points = new THREE.Points(g, mat); points.frustumCulled = false; points.renderOrder = 5; points.name = 'fx-particles';
  scene.add(points);
  let cursor = 0;
  function emit(x, y, z, vx, vy, vz, l, s0, gr, dr, gv, r, gg, b, a) {
    const i = cursor; cursor = (cursor + 1) % MAX;
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z; vel[i * 3] = vx; vel[i * 3 + 1] = vy; vel[i * 3 + 2] = vz;
    life[i] = l; maxLife[i] = l; size0[i] = s0; grow[i] = gr; drag[i] = dr; grav[i] = gv; alpha0[i] = a;
    col[i * 4] = r; col[i * 4 + 1] = gg; col[i * 4 + 2] = b; col[i * 4 + 3] = a; size[i] = s0;
  }
  function spawnDust(p, amount = 1) {
    amount = Math.max(0.2, Math.min(amount, 6));
    const n = Math.round(6 + amount * 12);
    const gy = getHeight(p.x, p.z);
    const y0 = Math.max(p.y ?? gy, gy) + 0.1;
    for (let k = 0; k < n; k++) {
      const a = rnd() * Math.PI * 2, sp = (1.2 + rnd() * 3.2) * Math.sqrt(amount);
      const sh = 0.75 + rnd() * 0.35;
      emit(p.x + Math.cos(a) * 0.3 * amount, y0 + rnd() * 0.3, p.z + Math.sin(a) * 0.3 * amount,
        Math.cos(a) * sp, 0.4 + rnd() * 1.6 * amount * 0.6, Math.sin(a) * sp,
        1.1 + rnd() * 1.4 + amount * 0.25, (0.5 + rnd() * 0.6) * (0.6 + amount * 0.4), 1.3 + rnd() * 1.2, 2.6, -0.15,
        0.50 * sh, 0.43 * sh, 0.33 * sh, 0.42 + rnd() * 0.2);
    }
  }
  function spawnSplash(p, amount = 1) {
    const n = Math.round(26 * amount + 10);
    for (let k = 0; k < n; k++) {
      const a = rnd() * Math.PI * 2, sp = 0.8 + rnd() * 2.6;
      emit(p.x, p.y + 0.05, p.z, Math.cos(a) * sp, 3 + rnd() * 4.5 * amount, Math.sin(a) * sp, 0.6 + rnd() * 0.5, 0.08 + rnd() * 0.12, 0.2, 0.4, -14, 0.8, 0.88, 0.92, 0.85);
    }
    for (let k = 0; k < 8; k++) {
      const a = rnd() * Math.PI * 2;
      emit(p.x + Math.cos(a) * 0.4, p.y + 0.2, p.z + Math.sin(a) * 0.4, Math.cos(a) * 1.2, 0.8 + rnd(), Math.sin(a) * 1.2, 0.9 + rnd() * 0.6, 0.6, 1.8, 2.5, 0, 0.85, 0.9, 0.95, 0.35);
    }
  }

  // ---- ambient motes (pollen catching the low sun) ----
  const AM = lowMode ? 150 : 420, BOX = new THREE.Vector3(70, 14, 70);
  const mp = new Float32Array(AM * 3), ms = new Float32Array(AM), mseed = new Float32Array(AM);
  for (let i = 0; i < AM; i++) { mp[i * 3] = rnd() * BOX.x; mp[i * 3 + 1] = rnd() * BOX.y; mp[i * 3 + 2] = rnd() * BOX.z; ms[i] = 0.05 + rnd() * 0.07; mseed[i] = rnd(); }
  const mg = new THREE.BufferGeometry();
  mg.setAttribute('position', new THREE.BufferAttribute(mp, 3)); mg.setAttribute('aSize', new THREE.BufferAttribute(ms, 1)); mg.setAttribute('aSeed', new THREE.BufferAttribute(mseed, 1));
  const moteU = { uScale, uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uBox: { value: BOX } };
  const moteMat = new THREE.ShaderMaterial({
    uniforms: moteU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute float aSize; attribute float aSeed; uniform float uScale, uTime; uniform vec3 uCam, uBox; varying float vA;
void main(){
  vec3 p = position + vec3(sin(uTime * 0.3 + aSeed * 20.0) * 2.0 + uTime * 0.6, sin(uTime * 0.5 + aSeed * 40.0) * 0.8, cos(uTime * 0.27 + aSeed * 30.0) * 2.0 + uTime * 0.25);
  vec3 o = uCam - uBox * 0.5; p = mod(p - o, uBox) + o; p.y = position.y + uCam.y - 4.0 + sin(uTime * 0.4 + aSeed * 9.0) * 0.6;
  vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
  float d = -mv.z;
  vA = (0.5 + 0.5 * sin(uTime * 2.0 + aSeed * 50.0)) * smoothstep(1.0, 4.0, d) * (1.0 - smoothstep(25.0, 35.0, d));
  gl_PointSize = clamp(aSize * uScale / max(d, 0.1), 1.5, 24.0);
}`,
    fragmentShader: `varying float vA; void main(){ float r = length(gl_PointCoord * 2.0 - 1.0); float a = pow(max(1.0 - r, 0.0), 2.0) * vA; gl_FragColor = vec4(vec3(1.0, 0.78, 0.45) * 2.2 * a, a); }`,
  });
  const motes = new THREE.Points(mg, moteMat); motes.frustumCulled = false; motes.renderOrder = 6; scene.add(motes);

  let tAcc = 0;
  function update(rawDt, camera, renderer) {
    tAcc += rawDt;
    const h = renderer.domElement.height || 720;
    uScale.value = h * 0.5 * camera.projectionMatrix.elements[5];
    moteU.uTime.value = tAcc; moteU.uCam.value.copy(camera.position);
    const dt = rawDt;
    for (let i = 0; i < MAX; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      const k = i * 3;
      if (life[i] <= 0) { pos[k + 1] = -9999; col[i * 4 + 3] = 0; continue; }
      const dmp = Math.exp(-drag[i] * dt);
      vel[k] *= dmp; vel[k + 2] *= dmp; vel[k + 1] = vel[k + 1] * (grav[i] < -1 ? 1 : dmp) + grav[i] * dt;
      pos[k] += vel[k] * dt; pos[k + 1] += vel[k + 1] * dt; pos[k + 2] += vel[k + 2] * dt;
      const t = 1 - life[i] / maxLife[i];
      size[i] = size0[i] * (1 + grow[i] * Math.sqrt(t) * 2.2);
      col[i * 4 + 3] = alpha0[i] * Math.min(1, t * 8) * (1 - t) * (1 - t);
      if (grav[i] < -1) { const gy = getHeight(pos[k], pos[k + 2]); if (pos[k + 1] < gy) life[i] = 0; }
    }
    aPos.needsUpdate = true; aCol.needsUpdate = true; aSize.needsUpdate = true;
  }
  return { spawnDust, spawnSplash, update };
}
