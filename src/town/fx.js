// Town atmosphere: chimney smoke, flame-capped stacks, forge embers + anvil sparks, waterfall mist/spray, seagulls.
import * as THREE from 'three';
import { mulberry32 } from '../world/noise.js';

const VERT = `attribute float aSize; attribute vec4 aColor; attribute float aSeed; uniform float uScale; varying vec4 vColor; varying float vSeed;
void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(aSize * uScale / max(-mv.z, 0.1), 0.0, 400.0); vColor = aColor; vSeed = aSeed; }`;
const FRAG = (add) => `varying vec4 vColor; varying float vSeed;
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y); }
void main(){ vec2 c = gl_PointCoord * 2.0 - 1.0; float r = length(c); if (r > 1.0) discard;
  float n = vn(c * 2.2 + vSeed * 31.0) * 0.6 + vn(c * 4.7 - vSeed * 17.0) * 0.4;
  ${add ? 'float a = pow(max(1.0 - r, 0.0), 1.6) * vColor.a; gl_FragColor = vec4(vColor.rgb * a, a);'
    : 'float a = smoothstep(1.0, 0.15, r + (n - 0.5) * 0.7) * vColor.a; gl_FragColor = vec4(vColor.rgb * (0.82 + 0.35 * n), a);'}
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

function pool(scene, MAX, add) {
  const pos = new Float32Array(MAX * 3).fill(-9999), col = new Float32Array(MAX * 4), size = new Float32Array(MAX), seed = new Float32Array(MAX);
  const vel = new Float32Array(MAX * 3), life = new Float32Array(MAX), max = new Float32Array(MAX), s0 = new Float32Array(MAX), grow = new Float32Array(MAX), grav = new Float32Array(MAX), a0 = new Float32Array(MAX), drag = new Float32Array(MAX);
  const rnd = mulberry32(add ? 9 : 7); for (let i = 0; i < MAX; i++) seed[i] = rnd();
  const g = new THREE.BufferGeometry();
  const aP = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage), aC = new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage), aS = new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('position', aP); g.setAttribute('aColor', aC); g.setAttribute('aSize', aS); g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const uScale = { value: 600 };
  const mat = new THREE.ShaderMaterial({ uniforms: { uScale }, vertexShader: VERT, fragmentShader: FRAG(add), transparent: true, depthWrite: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending });
  const pts = new THREE.Points(g, mat); pts.frustumCulled = false; pts.renderOrder = add ? 7 : 6; scene.add(pts);
  let cur = 0;
  return {
    uScale,
    emit(x, y, z, vx, vy, vz, l, sz, gr, gv, dr, r, gg, b, a) {
      const i = cur; cur = (cur + 1) % MAX; const k = i * 3;
      pos[k] = x; pos[k + 1] = y; pos[k + 2] = z; vel[k] = vx; vel[k + 1] = vy; vel[k + 2] = vz;
      life[i] = max[i] = l; s0[i] = sz; grow[i] = gr; grav[i] = gv; drag[i] = dr; a0[i] = a; col[i * 4] = r; col[i * 4 + 1] = gg; col[i * 4 + 2] = b; col[i * 4 + 3] = 0; size[i] = sz;
    },
    update(dt, wind) {
      for (let i = 0; i < MAX; i++) {
        if (life[i] <= 0) continue; life[i] -= dt; const k = i * 3;
        if (life[i] <= 0) { pos[k + 1] = -9999; col[i * 4 + 3] = 0; continue; }
        const t = 1 - life[i] / max[i], dm = Math.exp(-drag[i] * dt);
        vel[k] = vel[k] * dm + wind.x * t * dt * 0.8; vel[k + 1] = vel[k + 1] * dm + grav[i] * dt; vel[k + 2] = vel[k + 2] * dm + wind.z * t * dt * 0.8;
        pos[k] += vel[k] * dt; pos[k + 1] += vel[k + 1] * dt; pos[k + 2] += vel[k + 2] * dt;
        size[i] = s0[i] * (1 + grow[i] * t);
        col[i * 4 + 3] = a0[i] * Math.min(1, t * 6) * (1 - t) * (1 - t * 0.3);
      }
      aP.needsUpdate = aC.needsUpdate = aS.needsUpdate = true;
    },
  };
}

export function createFx(scene, emitters, opts) {
  const { low, falls } = opts;
  const rnd = mulberry32(77);
  const soft = pool(scene, low ? 700 : 1600, false), glow = pool(scene, low ? 400 : 900, true);
  const wind = new THREE.Vector3(0.9, 0, 0.35);
  const acc = emitters.map(() => rnd());
  const k = low ? 0.55 : 1;
  const R = () => rnd() - 0.5;
  function emitOne(e) {
    switch (e.type) {
      case 'smoke': soft.emit(e.x + R() * 0.3, e.y, e.z + R() * 0.3, R() * 0.2, 1.0 + rnd() * 0.5, R() * 0.2, 6 + rnd() * 3, 0.9, 3.5, 0.05, 0.25, 0.72, 0.72, 0.74, 0.32); break;
      case 'green': soft.emit(e.x + R() * 0.3, e.y, e.z + R() * 0.3, R() * 0.2, 0.8, R() * 0.2, 4 + rnd() * 2, 0.5, 3.0, 0.05, 0.3, 0.55, 0.95, 0.7, 0.3); break;
      case 'blacksmoke': soft.emit(e.x + R() * 0.5, e.y, e.z + R() * 0.5, R() * 0.4, 2.2 + rnd() * 1.0, R() * 0.4, 7 + rnd() * 3, 1.8, 4.5, 0.0, 0.18, 0.12, 0.11, 0.11, 0.55); break;
      case 'fire': glow.emit(e.x + R() * 0.6, e.y, e.z + R() * 0.6, R() * 0.5, 2.5 + rnd() * 2.0, R() * 0.5, 0.5 + rnd() * 0.4, 1.4, -0.6, 0.5, 0.5, 2.4, 0.9 + rnd() * 0.4, 0.25, 0.9); break;
      case 'embers': glow.emit(e.x + R() * 0.8, e.y, e.z + R() * 0.8, R() * 0.6, 1 + rnd() * 1.5, R() * 0.6, 1.2 + rnd(), 0.1, 0, 0.3, 0.6, 3, 1.4, 0.4, 1); break;
      case 'mist': soft.emit(e.x + R() * e.w, e.y + rnd() * 2, e.z + R() * e.w * 2, R() * 3 - 1.5, 1.2 + rnd() * 2.0, R() * 3, 3.5 + rnd() * 2, 3.5, 2.6, -0.05, 0.6, 0.9, 0.95, 0.97, 0.38); break;
      case 'spray': soft.emit(e.x + R() * 2, e.y + rnd() * 2, e.z + R() * e.w * 2, -2 - rnd() * 4, 3 + rnd() * 5, R() * 4, 1.2 + rnd(), 0.6, 1.6, -5, 0.4, 0.95, 0.98, 1.0, 0.5); break;
      case 'fountain': soft.emit(e.x + R() * 0.3, e.y, e.z + R() * 0.3, R() * 2.4, 2.5 + rnd() * 1.5, R() * 2.4, 0.9, 0.25, 1.2, -9, 0.2, 0.85, 0.93, 1.0, 0.45); break;
    }
  }
  if (falls) {
    emitters.push({ type: 'mist', x: falls.base.x, y: 0.5, z: falls.base.z, w: falls.half, rate: 9 }, { type: 'spray', x: falls.base.x + 1, y: 0.4, z: falls.base.z, w: falls.half, rate: 12 }, { type: 'mist', x: falls.top.x - 1, y: falls.top.y - 6, z: falls.top.z, w: falls.half * 0.8, rate: 2 });
    acc.push(0, 0, 0);
  }
  function sparks(p, n = 14) { for (let i = 0; i < n; i++) { const a = rnd() * 6.28, s = 2 + rnd() * 4; glow.emit(p.x, p.y, p.z, Math.cos(a) * s, 1.5 + rnd() * 3.5, Math.sin(a) * s, 0.35 + rnd() * 0.35, 0.09, -0.5, -12, 0.5, 3.2, 1.8, 0.6, 1); } }
  const cam = new THREE.Vector3();
  function update(dt, camera, renderer) {
    const h = renderer.domElement.height || 720, sc = h * 0.5 * camera.projectionMatrix.elements[5];
    soft.uScale.value = glow.uScale.value = sc;
    cam.copy(camera.position);
    emitters.forEach((e, i) => {
      const d = Math.hypot(e.x - cam.x, e.z - cam.z), lod = d > 160 ? 0.25 : d > 80 ? 0.55 : 1;
      acc[i] += dt * (e.rate || 1) * 6 * k * lod;
      while (acc[i] >= 1) { acc[i] -= 1; emitOne(e); }
    });
    soft.update(dt, wind); glow.update(dt, wind);
  }
  return { update, sparks };
}

// seagulls circling over the harbour (instanced, flap in the vertex shader)
export function createGulls(scene, shared, low) {
  const rnd = mulberry32(31);
  const bp = [0, 0, 0.45, 0.08, 0, -0.3, -0.08, 0, -0.3,
    0, 0, 0.15, 0.7, 0.12, -0.05, 0, 0, -0.2, 0.7, 0.12, -0.05, 1.25, 0.0, -0.22, 0, 0, -0.2,
    0, 0, 0.15, 0, 0, -0.2, -0.7, 0.12, -0.05, -0.7, 0.12, -0.05, 0, 0, -0.2, -1.25, 0.0, -0.22];
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3));
  const wing = []; for (let i = 0; i < bp.length / 3; i++) wing.push(Math.min(1, Math.abs(bp[i * 3]) / 1.25)); g.setAttribute('aWing', new THREE.Float32BufferAttribute(wing, 1));
  const cc = []; for (let i = 0; i < bp.length / 3; i++) { const w = wing[i]; const v = w > 0.9 ? 0.15 : 0.95; cc.push(v, v, v * 1.02); } g.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3)); g.computeVertexNormals();
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.8 });
  m.onBeforeCompile = (sh) => { sh.uniforms.uTime = shared.uTime; sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime; attribute float aWing;').replace('#include <begin_vertex>', `#include <begin_vertex>
{ float ph = uTime * 5.5 + float(gl_InstanceID) * 2.31; float f = sin(ph) * 0.55 * step(0.0, sin(uTime * 0.6 + float(gl_InstanceID))) + 0.1; transformed.y += f * abs(transformed.x) * aWing; }`); };
  m.customProgramCacheKey = () => 'town-gull';
  const NB = low ? 8 : 16, birds = new THREE.InstancedMesh(g, m, NB); birds.frustumCulled = false; birds.castShadow = false; scene.add(birds);
  const bd = Array.from({ length: NB }, () => ({ cx: -30 + rnd() * 80, cz: -90 + rnd() * 60, r: 12 + rnd() * 30, h: 14 + rnd() * 26, sp: (0.18 + rnd() * 0.15) * (rnd() < 0.5 ? -1 : 1), ph: rnd() * 6.28, s: 0.8 + rnd() * 0.3 }));
  const o = new THREE.Object3D();
  return { update(t) { bd.forEach((b, i) => { const a = b.ph + t * b.sp; o.position.set(b.cx + Math.cos(a) * b.r, b.h + Math.sin(t * 0.5 + i) * 1.5, b.cz + Math.sin(a) * b.r); o.rotation.set(0, -a + (b.sp > 0 ? 0 : PI), Math.sign(b.sp) * 0.25); o.scale.setScalar(b.s); o.updateMatrix(); birds.setMatrixAt(i, o.matrix); }); birds.instanceMatrix.needsUpdate = true; } };
}
const PI = Math.PI;
