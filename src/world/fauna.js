// Ambient wildlife: birds of prey circling high over the valley, butterflies fluttering over the flower meadow.
import { mulberry32 } from './noise.js';

function flapMaterial(THREE, base, amp, speed) {
  base.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = base.userData.uTime;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime; attribute float aWing;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
{ float ph = uTime * ${speed.toFixed(2)} + float(gl_InstanceID) * 1.731;
  float f = sin(ph) * ${amp.toFixed(2)};
  float ax = abs(transformed.x);
  transformed.y += f * ax * aWing;
  transformed.x *= mix(1.0, 0.75 + 0.25 * cos(ph * 1.0), aWing); }`);
  };
  base.customProgramCacheKey = () => 'wb-flap-' + amp + speed;
  return base;
}

export function createFauna(THREE, scene, getHeight, opts = {}) {
  const rnd = mulberry32(777);
  const uTime = { value: 0 };
  // ---- birds ----
  const bg = new THREE.BufferGeometry();
  // body (x=0), wings spanning x; tips flagged with aWing
  const bp = [0, 0, 0.7, 0.12, 0, -0.5, -0.12, 0, -0.5, // body
    0, 0, 0.25, 1.4, 0.15, -0.1, 0, 0, -0.35, 1.4, 0.15, -0.1, 2.3, 0.05, -0.45, 0, 0, -0.35,
    0, 0, 0.25, 0, 0, -0.35, -1.4, 0.15, -0.1, -1.4, 0.15, -0.1, 0, 0, -0.35, -2.3, 0.05, -0.45,
    0, 0, -0.45, 0.35, 0, -1.0, -0.35, 0, -1.0];
  const bw = []; for (let i = 0; i < bp.length / 3; i++) bw.push(Math.min(1, Math.abs(bp[i * 3]) / 2.3));
  bg.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3)); bg.setAttribute('aWing', new THREE.Float32BufferAttribute(bw, 1)); bg.computeVertexNormals();
  const bm = new THREE.MeshBasicMaterial({ color: 0x1c1a1e, side: THREE.DoubleSide }); bm.userData.uTime = uTime;
  const NB = opts.low ? 5 : 9;
  const birds = new THREE.InstancedMesh(bg, flapMaterial(THREE, bm, 0.45, 3.2), NB); birds.frustumCulled = false; birds.name = 'birds';
  const bd = Array.from({ length: NB }, (_, i) => ({ cx: -20 + rnd() * 60, cz: -90 + rnd() * 60, r: 50 + rnd() * 70, h: 60 + rnd() * 35, sp: (0.08 + rnd() * 0.06) * (rnd() < 0.5 ? -1 : 1), ph: rnd() * 6.28, s: 1.3 + rnd() * 0.6 }));
  scene.add(birds);

  // ---- butterflies ----
  const fg = new THREE.BufferGeometry();
  const fp = [0, 0, 0.05, 0.16, 0.02, 0.12, 0.2, 0.02, -0.04, 0, 0, 0.05, 0.2, 0.02, -0.04, 0, 0, -0.06,
    0, 0, 0.05, -0.2, 0.02, -0.04, -0.16, 0.02, 0.12, 0, 0, 0.05, 0, 0, -0.06, -0.2, 0.02, -0.04];
  const fw = []; for (let i = 0; i < fp.length / 3; i++) fw.push(Math.abs(fp[i * 3]) > 0.01 ? 1 : 0);
  fg.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3)); fg.setAttribute('aWing', new THREE.Float32BufferAttribute(fw, 1)); fg.computeVertexNormals();
  const fm = new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, roughness: 0.7, emissive: 0x221100 }); fm.userData.uTime = uTime;
  const homes = opts.homes && opts.homes.length ? opts.homes : [[0, 0]];
  const NF = opts.low ? 10 : 24;
  const flies = new THREE.InstancedMesh(fg, flapMaterial(THREE, fm, 5.0, 22.0), NF); flies.frustumCulled = false; flies.name = 'butterflies';
  const pal = [0xf2a33a, 0xf5f0e0, 0x5a8fe0, 0xe8d24a, 0xd8643c];
  const c = new THREE.Color();
  const fd = Array.from({ length: NF }, (_, i) => { const h = homes[Math.floor(rnd() * homes.length)]; flies.setColorAt(i, c.set(pal[i % pal.length])); return { x: h[0], z: h[1], ph: rnd() * 6.28, a: 1 + rnd() * 2, b: 0.8 + rnd() * 1.5, sp: 0.3 + rnd() * 0.4 }; });
  scene.add(flies);

  const dummy = new THREE.Object3D();
  function update(t) {
    uTime.value = t;
    for (let i = 0; i < NB; i++) {
      const b = bd[i]; const a = b.ph + t * b.sp;
      dummy.position.set(b.cx + Math.cos(a) * b.r, b.h + Math.sin(t * 0.3 + i) * 4, b.cz + Math.sin(a) * b.r);
      dummy.rotation.set(0, -a - (b.sp > 0 ? 0 : Math.PI), (b.sp > 0 ? 1 : -1) * 0.35);
      dummy.scale.setScalar(b.s); dummy.updateMatrix(); birds.setMatrixAt(i, dummy.matrix);
    }
    birds.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < NF; i++) {
      const f = fd[i]; const tt = t * f.sp + f.ph;
      const x = f.x + Math.sin(tt * 1.3) * f.a + Math.sin(tt * 3.1) * 0.3, z = f.z + Math.cos(tt * 0.9) * f.b + Math.cos(tt * 2.7) * 0.3;
      const gy = getHeight(x, z);
      dummy.position.set(x, gy + 0.5 + Math.abs(Math.sin(tt * 2.2)) * 0.6, z);
      dummy.rotation.set(0, Math.atan2(Math.cos(tt * 1.3) * 1.3 * f.a, -Math.sin(tt * 0.9) * 0.9 * f.b), 0);
      dummy.scale.setScalar(1.2); dummy.updateMatrix(); flies.setMatrixAt(i, dummy.matrix);
    }
    flies.instanceMatrix.needsUpdate = true;
  }
  return { update };
}
