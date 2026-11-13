// Varkhul, the Emberhide — procedural skeleton + lofted skinned meshes + rigid armour pieces.
// Model space: +Z forward (snout), +Y up, origin on the ground under the body centre. All bones have
// identity rest rotations, so a bone's rest frame == model frame (simplifies IK).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { samplePath, sweep, spike, place } from './geo.js';
import { makeScaleTextures, makeMembraneTextures, makeHornTextures } from './textures.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const srgb = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; }; // Color(hex) converts sRGB->linear
const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const sstep = THREE.MathUtils.smoothstep;
// smooth interpolation of keyed values: keys = [[u, v], ...] sorted
function keyed(keys, u) {
  if (u <= keys[0][0]) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) {
    const [u0, v0] = keys[i], [u1, v1] = keys[i + 1];
    if (u <= u1) { const t = (u - u0) / (u1 - u0); const k = t * t * (3 - 2 * t); return v0 + (v1 - v0) * k; }
  }
  return keys[keys.length - 1][1];
}

const PAL = {
  back: srgb(0x141010), side: srgb(0x2e1c17), belly: srgb(0xa67c4c), bellyDark: srgb(0x6a4a30),
  dark: srgb(0x140e0d), plate: srgb(0x2c201c), mouth: srgb(0x4a0e0c), horn: srgb(0xc9b89a), hornDark: srgb(0x1a1210),
  claw: srgb(0x2a2422), membrane: srgb(0xa8644a), spar: srgb(0x4a3328),
};

export function buildRig() {
  // ---------------- joints (model space) ----------------
  const J = {
    tailTip: V(0, 1.45, -8.6), tail6: V(0, 1.65, -7.7), tail5: V(0, 1.92, -6.85), tail4: V(0, 2.28, -5.95), tail3: V(0, 2.66, -5.05),
    tail2: V(0, 3.02, -4.15), tail1: V(0, 3.28, -3.25), root: V(0, 3.42, -2.3), spine1: V(0, 3.66, -0.8), spine2: V(0, 3.82, 0.65),
    chest: V(0, 3.78, 2.05), neck1: V(0, 3.9, 3.15), neck2: V(0, 4.35, 3.95), neck3: V(0, 4.9, 4.55), head: V(0, 5.12, 5.1),
    jaw: V(0, 4.86, 5.12),
  };
  const side = (sx) => ({
    shoulder: V(1.25 * sx, 3.35, 2.2), elbow: V(1.9 * sx, 2.2, 1.35), wrist: V(1.82 * sx, 0.78, 2.45), knuckle: V(1.86 * sx, 0.14, 3.05), fplant: V(1.86 * sx, 0, 2.9),
    f1: V(0.1 * sx, 0.66, -0.75).normalize().multiplyScalar(4.7), f2: V(0.16 * sx, 0.52, -0.84).normalize().multiplyScalar(4.3), f3: V(0.2 * sx, 0.38, -0.9).normalize().multiplyScalar(3.7),
    f1s: V(0.5 * sx, 0.85, 0.2).normalize(), f2s: V(0.82 * sx, 0.55, -0.12).normalize(), f3s: V(0.95 * sx, 0.18, -0.25).normalize(),
    hip: V(1.15 * sx, 3.2, -2.3), knee: V(1.62 * sx, 1.92, -1.32), ankle: V(1.56 * sx, 0.95, -2.55), ball: V(1.56 * sx, 0.2, -2.0), toe: V(1.6 * sx, 0.06, -1.3), hplant: V(1.56 * sx, 0, -1.8),
  });
  const L = side(1), R = side(-1);

  // ---------------- bones ----------------
  const bones = [], B = {};
  const mk = (name, at, parent) => {
    const b = new THREE.Bone(); b.name = name; b.userData.worldRest = at.clone();
    b.position.copy(parent ? at.clone().sub(parent.userData.worldRest) : at); if (parent) parent.add(b);
    b.userData.restPos = b.position.clone(); B[name] = b; b.userData.index = bones.length; bones.push(b); return b;
  };
  mk('root', J.root, null);
  mk('spine1', J.spine1, B.root); mk('spine2', J.spine2, B.spine1); mk('chest', J.chest, B.spine2);
  mk('neck1', J.neck1, B.chest); mk('neck2', J.neck2, B.neck1); mk('neck3', J.neck3, B.neck2); mk('head', J.head, B.neck3); mk('jaw', J.jaw, B.head);
  mk('tail1', J.tail1, B.root); mk('tail2', J.tail2, B.tail1); mk('tail3', J.tail3, B.tail2); mk('tail4', J.tail4, B.tail3); mk('tail5', J.tail5, B.tail4); mk('tail6', J.tail6, B.tail5);
  for (const [s, S] of [['L', L], ['R', R]]) {
    mk('upperArm' + s, S.shoulder, B.chest); mk('foreArm' + s, S.elbow, B['upperArm' + s]); mk('hand' + s, S.wrist, B['foreArm' + s]);
    for (const f of ['f1', 'f2', 'f3']) mk(f + s, S.wrist, B['foreArm' + s]);
    mk('thigh' + s, S.hip, B.root); mk('shin' + s, S.knee, B['thigh' + s]); mk('meta' + s, S.ankle, B['shin' + s]); mk('toe' + s, S.ball, B['meta' + s]);
  }
  const bi = (n) => B[n].userData.index;

  // ---------------- textures & materials ----------------
  const scaleTex = makeScaleTextures(512), memTex = makeMembraneTextures(512), hornTex = makeHornTextures(256);
  const uniforms = {
    uTime: { value: 0 }, uGlow: { value: 0.6 }, uThroat: { value: 0.15 }, uEmber: { value: new THREE.Color(1.0, 0.36, 0.08) },
    uRim: { value: new THREE.Color(0.55, 0.16, 0.08) }, uHeight: { value: scaleTex.heightMap }, uFlash: { value: 0 }, uSunView: { value: new THREE.Vector3(0, 1, 0) },
  };
  const patch = (mat, opts = {}) => {
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, uniforms);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 aGlow; varying vec2 vGlow; varying vec2 vRUv;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\nvGlow = aGlow; vRUv = uv;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
uniform float uTime, uGlow, uThroat, uFlash; uniform vec3 uEmber, uRim, uSunView; uniform sampler2D uHeight; varying vec2 vGlow; varying vec2 vRUv;`)
        .replace('#include <map_fragment>', opts.height ? `#include <map_fragment>
  // macro variation breaks up scale tiling: low-frequency resample of the scale map + height field
  diffuseColor.rgb *= mix(0.74, 1.16, texture2D(map, vMapUv * 0.173 + vec2(0.31, 0.57)).g) * mix(0.86, 1.08, texture2D(uHeight, vMapUv * 0.067 + vec2(0.7, 0.1)).r);` : '#include <map_fragment>')
        .replace('#include <roughnessmap_fragment>', opts.height ? `#include <roughnessmap_fragment>
  // wet / glossy patches (lower roughness on scale crowns in blotches)
  roughnessFactor *= mix(0.42, 1.05, smoothstep(0.25, 0.75, texture2D(uHeight, vMapUv * 0.091 + vec2(0.2, 0.45)).r));` : '#include <roughnessmap_fragment>')
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{
  float hh = ${opts.height ? 'texture2D(uHeight, vMapUv).r' : '0.4'};
  float crev = pow(clamp(1.0 - hh, 0.0, 1.0), 2.2);
  float wave = 0.65 + 0.35 * sin(uTime * 2.6 - vRUv.y * 0.9) * sin(uTime * 1.3 + vRUv.y * 0.37 + 1.7);
  totalEmissiveRadiance += uEmber * (vGlow.x * uGlow * wave * (0.08 + 2.4 * crev * crev) + vGlow.y * uThroat * (0.3 + 1.6 * crev));
}`)
        .replace('#include <opaque_fragment>', `{
  vec3 vd = normalize(vViewPosition);
  float fr = pow(1.0 - clamp(dot(normal, vd), 0.0, 1.0), 3.0);
  outgoingLight += uRim * fr * ${opts.rim ?? '0.35'} + vec3(1.0, 0.85, 0.75) * uFlash * (0.3 + fr);
  ${opts.trans ? 'outgoingLight += diffuseColor.rgb * vec3(1.0, 0.5, 0.28) * (0.12 + 1.5 * pow(max(0.0, -dot(normal, uSunView)), 1.5)) * ' + opts.trans + ';' : ''}
}
#include <opaque_fragment>`);
    };
    mat.customProgramCacheKey = () => 'varkhul2' + (opts.height ? 'H' : '') + (opts.rim ?? '') + (opts.trans ?? '');
    return mat;
  };
  const skinMat = patch(new THREE.MeshStandardMaterial({
    map: scaleTex.map, normalMap: scaleTex.normalMap, normalScale: new THREE.Vector2(1.1, 1.1), roughnessMap: scaleTex.roughnessMap,
    roughness: 1, metalness: 0.0, vertexColors: true, emissive: 0x000000,
  }), { height: true });
  const memMat = patch(new THREE.MeshStandardMaterial({ map: memTex.map, roughness: 0.75, side: THREE.DoubleSide, vertexColors: true, emissive: 0x000000, alphaTest: 0.5 }), { rim: '0.5', trans: '0.9' });
  const hornMat = patch(new THREE.MeshStandardMaterial({ normalMap: hornTex.normalMap, roughness: 0.42, metalness: 0.05, vertexColors: true, emissive: 0x000000 }), { rim: '0.15' });
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x110500, emissive: 0xffb030, emissiveIntensity: 2.5, roughness: 0.1 });
  const materials = { skinMat, memMat, hornMat, eyeMat, uniforms, memTex };

  // ---------------- main body (tail tip -> head) ----------------
  const mainJ = [J.tailTip, J.tail6, J.tail5, J.tail4, J.tail3, J.tail2, J.tail1, J.root, J.spine1, J.spine2, J.chest, J.neck1, J.neck2, J.neck3, J.head];
  const segOwner = ['tail6', 'tail5', 'tail4', 'tail3', 'tail2', 'tail1', 'root', 'root', 'spine1', 'spine2', 'chest', 'neck1', 'neck2', 'neck3', 'head'].map(bi);
  const rxK = [[0, 0.14], [1, 0.3], [2, 0.38], [3, 0.47], [4, 0.6], [5, 0.78], [6, 0.98], [7, 1.28], [8, 1.42], [9, 1.55], [10, 1.5], [11, 1.02], [12, 0.74], [13, 0.62], [14, 0.56]];
  const ryK = [[0, 0.14], [1, 0.3], [2, 0.4], [3, 0.5], [4, 0.64], [5, 0.82], [6, 1.02], [7, 1.3], [8, 1.48], [9, 1.62], [10, 1.6], [11, 1.08], [12, 0.8], [13, 0.68], [14, 0.6]];
  const oyK = [[0, 0], [4, -0.12], [6, -0.35], [7, -0.6], [8, -0.78], [9, -0.85], [10, -0.8], [11, -0.42], [12, -0.2], [14, -0.12]];
  const ridgeK = [[0, 0.1], [6, 0.12], [9, 0.16], [12, 0.12], [14, 0.05]];
  const mainS = samplePath(mainJ, 150);
  const mainProf = (u) => ({ rx: keyed(rxK, u), ry: keyed(ryK, u), oy: keyed(oyK, u), ridge: keyed(ridgeK, u) });
  const skinAlong = (u, owners) => {
    const w = u - 0.5; const a = Math.floor(w); const t = sstep(w - a, 0, 1);
    const ia = owners[Math.max(0, Math.min(owners.length - 1, a))], ib = owners[Math.max(0, Math.min(owners.length - 1, a + 1))];
    return ia === ib ? [[ia, 1]] : [[ia, 1 - t], [ib, t]];
  };
  const bodyColor = (u, th, arcU) => {
    const sn = Math.sin(th); // +1 dorsal, -1 ventral
    let c = sn > 0 ? mix3(PAL.side, PAL.back, sstep(sn, 0.1, 0.8)) : mix3(PAL.side, PAL.belly, sstep(-sn, 0.25, 0.75));
    if (sn < -0.3) { const band = 0.5 + 0.5 * Math.cos(arcU * Math.PI * 2 / 0.42); c = mix3(c, PAL.bellyDark, 0.45 * Math.pow(band, 6)); }
    const ext = sstep(u, 3.5, 0) * 0.7 + sstep(u, 13, 14) * 0.2; c = mix3(c, PAL.dark, ext);
    return c;
  };
  const mainArc = []; { let a = 0; mainArc.push(0); for (let i = 1; i < mainS.pts.length; i++) { a += mainS.pts[i].distanceTo(mainS.pts[i - 1]); mainArc.push(a); } }
  const ventGlow = (u, th, arc) => {
    const d = th - Math.PI / 2; const dorsal = Math.exp(-(d * d) / 0.07);
    const region = sstep(u, 3.2, 6) * (1 - sstep(u, 11.2, 12.4));
    const stripe = 0.35 + 0.65 * Math.pow(0.5 + 0.5 * Math.cos((arc / 0.62) * Math.PI * 2), 2);
    const flank = Math.exp(-Math.pow(th - Math.PI / 2 - 0.85, 2) / 0.02) + Math.exp(-Math.pow(th - Math.PI / 2 + 0.85, 2) / 0.02);
    const fr = sstep(u, 7.5, 8.5) * (1 - sstep(u, 10, 10.8)) * 0.5;
    const throat = Math.exp(-Math.pow(th - Math.PI * 1.5, 2) / 0.35) * sstep(u, 10.6, 11.6) * (1 - sstep(u, 13.6, 14));
    return [dorsal * region * stripe + flank * fr, throat];
  };
  const bodyGeo = sweep({
    path: mainS.pts, segs: 40, uRepeat: 11, vScale: 1 / 0.62,
    ring: (s, i) => mainProf(mainS.u[i]), skin: (s, i) => skinAlong(mainS.u[i], segOwner),
    color: (s, th, i) => bodyColor(mainS.u[i], th, mainArc[i]), glow: (s, th, i) => ventGlow(mainS.u[i], th, mainArc[i]), capStart: true, capEnd: true,
  });

  // ---------------- limbs ----------------
  const limbColor = (u, th, footU) => { const sn = Math.sin(th); let c = mix3(PAL.side, PAL.back, sstep(sn, -0.2, 0.9)); return mix3(c, PAL.dark, sstep(u, footU - 1.6, footU)); };
  const limbGeos = [];
  for (const [s, S, sx] of [['L', L, 1], ['R', R, -1]]) {
    // fore limb (wing-arm): chest interior -> shoulder -> elbow -> wrist -> knuckles
    const fj = [V(0.45 * sx, 3.55, 2.25), S.shoulder, S.elbow, S.wrist, S.knuckle];
    const fo = ['chest', 'upperArm' + s, 'foreArm' + s, 'hand' + s, 'hand' + s].map(bi);
    const fs = samplePath(fj, 46);
    const frK = [[0, 0.85], [1, 0.74], [1.45, 0.66], [2, 0.48], [2.5, 0.4], [3, 0.33], [3.5, 0.36], [4, 0.2]];
    limbGeos.push(sweep({ path: fs.pts, segs: 20, upRef: V(0, 0, 1), uRepeat: 3, vScale: 1 / 0.8,
      ring: (q, i) => { const u = fs.u[i]; const r = keyed(frK, u); return { rx: r * (u > 3 ? 1.35 : 1), ry: r * (u > 2.2 && u < 3.2 ? 1.2 : 1), sq: 2.3 }; },
      skin: (q, i) => skinAlong(fs.u[i], fo), color: (q, th, i) => limbColor(fs.u[i], th, 4.2), capEnd: true }));
    // hind limb: hip interior -> hip -> knee -> ankle -> ball -> toe
    const hj = [V(0.4 * sx, 3.5, -2.2), S.hip, S.knee, S.ankle, S.ball, S.toe];
    const ho = ['root', 'thigh' + s, 'shin' + s, 'meta' + s, 'toe' + s, 'toe' + s].map(bi);
    const hs = samplePath(hj, 54);
    const hrK = [[0, 0.8], [0.7, 0.86], [1, 0.84], [1.5, 0.72], [2, 0.48], [2.5, 0.38], [3, 0.3], [3.6, 0.26], [4, 0.34], [5, 0.2]];
    limbGeos.push(sweep({ path: hs.pts, segs: 20, upRef: V(0, 0, 1), uRepeat: 3, vScale: 1 / 0.8,
      ring: (q, i) => { const u = hs.u[i]; const r = keyed(hrK, u); return { rx: r * (u > 3.8 ? 1.4 : 1), ry: r * (u > 1 && u < 2 ? 1.15 : 1), sq: 2.2 }; },
      skin: (q, i) => skinAlong(hs.u[i], ho), color: (q, th, i) => limbColor(hs.u[i], th, 5.2), capEnd: true }));
    // wing finger spars
    for (const f of ['f1', 'f2', 'f3']) {
      const tip = S.wrist.clone().add(S[f]); const mid = S.wrist.clone().lerp(tip, 0.5).add(V(0.12 * sx, 0.05, 0));
      const p = samplePath([S.wrist.clone(), mid, tip], 18).pts;
      limbGeos.push(sweep({ path: p, segs: 8, upRef: V(0, 0, 1), uRepeat: 1, vScale: 1,
        ring: (q) => { const r = 0.22 * (1 - q) + 0.045 + 0.07 * Math.exp(-Math.pow((q - 0.5) / 0.05, 2)) + 0.05 * Math.exp(-Math.pow((q - 0.08) / 0.06, 2)); return { rx: r, ry: r * 1.15 }; },
        skin: () => [[bi(f + s), 1]], color: (q, th) => mix3(mix3(PAL.spar, PAL.horn, 0.18 * Math.max(0, Math.sin(th))), PAL.dark, q * 0.6), capEnd: true }));
    }
  }
  const skinGeo = mergeGeometries([bodyGeo, ...limbGeos]);
  const bodyMesh = new THREE.SkinnedMesh(skinGeo, skinMat); bodyMesh.castShadow = true; bodyMesh.receiveShadow = true; bodyMesh.frustumCulled = false;

  // ---------------- wing membranes ----------------
  const memGeos = [];
  for (const [s, S, sx] of [['L', L, 1], ['R', R, -1]]) {
    const K = 14, A = 7;
    const spar = (f) => { const pts = []; for (let k = 0; k <= K; k++) pts.push({ p: S.wrist.clone().add(S[f].clone().multiplyScalar(0.06 + 0.94 * k / K)), w: [[bi(f + s), 1]] }); return pts; };
    const flank = []; {
      const a = V(1.3 * sx, 3.62, 1.55), b = V(1.48 * sx, 3.45, 0.0), c = V(1.3 * sx, 3.3, -1.9);
      for (let k = 0; k <= K; k++) {
        const t = k / K; const p = t < 0.5 ? a.clone().lerp(b, t * 2) : b.clone().lerp(c, (t - 0.5) * 2);
        const z = p.z; const w = z > 1.35 ? [[bi('chest'), 1]] : z > 0 ? [[bi('chest'), z / 1.35], [bi('spine2'), 1 - z / 1.35]] : z > -0.8 ? [[bi('spine2'), 1 + z / 0.8], [bi('spine1'), -z / 0.8]] : [[bi('spine1'), 1]];
        flank.push({ p, w });
      }
    }
    const spars = [spar('f1'), spar('f2'), spar('f3'), flank];
    const pos = [], uv = [], si = [], sw = [], col = [], glw = [], idx = [];
    for (let pIdx = 0; pIdx < 3; pIdx++) {
      const S0 = spars[pIdx], S1 = spars[pIdx + 1]; const base = pos.length / 3;
      for (let k = 0; k <= K; k++) for (let a = 0; a <= A; a++) {
        const t = a / A; const p = S0[k].p.clone().lerp(S1[k].p, t);
        const sag = Math.sin(Math.PI * t) * Math.pow(k / K, 2) * (pIdx === 2 ? 0.9 : 0.55);
        p.lerp(S.wrist, sag * 0.32);
        pos.push(p.x, p.y, p.z); uv.push((pIdx + t) / 3, k / K);
        const ws = new Map(); for (const [b, w] of S0[k].w) ws.set(b, (ws.get(b) || 0) + w * (1 - t)); for (const [b, w] of S1[k].w) ws.set(b, (ws.get(b) || 0) + w * t);
        const arr = [...ws.entries()].sort((x, y) => y[1] - x[1]).slice(0, 4); const tot = arr.reduce((x, y) => x + y[1], 0); while (arr.length < 4) arr.push([0, 0]);
        for (const [b, w] of arr) { si.push(b); sw.push(w / tot); }
        const c = mix3(PAL.membrane, PAL.side, 0.1 + 0.45 * Math.pow(1 - k / K, 3)); col.push(...c); glw.push(0, 0);
      }
      for (let k = 0; k < K; k++) for (let a = 0; a < A; a++) { const i0 = base + k * (A + 1) + a, i1 = i0 + 1, i2 = i0 + A + 1, i3 = i2 + 1; sx > 0 ? idx.push(i0, i2, i1, i1, i2, i3) : idx.push(i0, i1, i2, i1, i3, i2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('aGlow', new THREE.Float32BufferAttribute(glw, 2));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    g.setIndex(idx); g.computeVertexNormals(); memGeos.push(g);
  }
  const memMesh = new THREE.SkinnedMesh(mergeGeometries(memGeos), memMat); memMesh.castShadow = true; memMesh.frustumCulled = false;

  // ---------------- rigid armour (horns, plates, teeth, claws) ----------------
  const rigid = new Map(); // bone -> geometries
  const addRigid = (boneName, geo, worldAt) => {
    const b = B[boneName]; if (worldAt) geo.translate(-b.userData.worldRest.x, -b.userData.worldRest.y, -b.userData.worldRest.z);
    if (!rigid.has(boneName)) rigid.set(boneName, []); rigid.get(boneName).push(geo);
  };
  const hornCol = { base: PAL.horn, tip: PAL.hornDark };
  const plateCol = { base: PAL.plate, tip: srgb(0x9a8a78), tipStart: 0.55 };
  // skull (head-local, head bone at origin)
  const skullJ = [V(0, 0.16, -0.6), V(0, 0.16, 0.0), V(0, 0.08, 0.7), V(0, -0.02, 1.4), V(0, -0.08, 1.95)];
  const skullS = samplePath(skullJ, 40);
  const headColor = (q, th) => { const sn = Math.sin(th); let c = sn > 0 ? mix3(PAL.side, PAL.back, sstep(sn, 0, 0.7)) : PAL.side; const m = Math.exp(-Math.pow(th - Math.PI * 1.5, 2) / 0.35); return mix3(c, PAL.mouth, m * sstep(q, 0.12, 0.25)); };
  const skull = sweep({ path: skullS.pts, segs: 28, uRepeat: 3, vScale: 1 / 0.7,
    ring: (q) => ({ rx: keyed([[0, 0.5], [0.18, 0.72], [0.32, 0.66], [0.55, 0.46], [0.85, 0.38], [1, 0.26]], q), ry: keyed([[0, 0.5], [0.2, 0.52], [0.45, 0.36], [0.8, 0.28], [1, 0.18]], q), belly: 0.42, sq: 2.6, ridge: 0.18 }),
    color: headColor, capStart: true, capEnd: true });
  skull.userData.useScale = true;
  const jawJ = [V(0, 0.02, -0.5), V(0, -0.02, 0.4), V(0, -0.06, 1.2), V(0, -0.05, 1.82)];
  const jawS = samplePath(jawJ, 30);
  const jaw = sweep({ path: jawS.pts, segs: 24, uRepeat: 2, vScale: 1 / 0.7,
    ring: (q) => ({ rx: keyed([[0, 0.5], [0.3, 0.5], [0.7, 0.36], [1, 0.24]], q), ry: keyed([[0, 0.34], [0.4, 0.3], [1, 0.14]], q), keel: 0.2,
      shape: (th, x, y) => [x, y > 0 ? y * 0.3 : y] }),
    color: (q, th) => { const sn = Math.sin(th); const m = Math.exp(-Math.pow(th - Math.PI / 2, 2) / 0.5); return mix3(sn < 0 ? mix3(PAL.side, PAL.belly, 0.4) : PAL.side, PAL.mouth, m); },
    glow: (q, th) => [0, Math.exp(-Math.pow(th - Math.PI / 2, 2) / 0.3) * 0.7], capStart: true, capEnd: true });
  const toHead = (g) => g.translate(0, 0, 0);
  // the skull pieces get scale texture (skinMat-compatible attributes): use skinMat on a regular mesh
  const headPieces = [toHead(skull)];
  const jawPieces = [jaw];
  // teeth
  const teethU = [], teethL = [];
  for (let i = 0; i < 9; i++) {
    const z = 0.35 + i * 0.18, big = i === 7 ? 1.7 : i === 2 ? 1.3 : 1; const rx = keyed([[0, 0.5], [0.18, 0.72], [0.32, 0.66], [0.55, 0.46], [0.85, 0.38], [1, 0.26]], (z + 0.6) / 2.55) * 0.82;
    for (const sx of [1, -1]) {
      teethU.push(place(spike({ len: 0.2 * big, r0: 0.045 * big, bend: 0.15, rings: 5, segs: 6, base: srgb(0xb8a888), tip: srgb(0xe6dcc6) }), V(sx * rx, keyed([[0, 0.16], [0.4, 0.06], [1, -0.08]], z / 1.95) - 0.16, z), V(0, -1, 0.25)));
      teethL.push(place(spike({ len: 0.16 * big, r0: 0.04 * big, bend: -0.1, rings: 5, segs: 6, base: srgb(0xb8a888), tip: srgb(0xe6dcc6) }), V(sx * rx * 0.92, -0.02, z - 0.05), V(0, 1, 0.3)));
    }
  }
  // crest & horns (head-local)
  const hornL = [], hornR = [], hornStubL = [], hornStubR = [];
  for (const [sx, arr, stub] of [[1, hornL, hornStubL], [-1, hornR, hornStubR]]) {
    arr.push(place(spike({ len: 2.5, r0: 0.24, bend: 0.32, side: 0.08 * sx, rings: 16, segs: 12, ...hornCol, tipStart: 0.3 }), V(0.38 * sx, 0.42, -0.25), V(0.38 * sx, 0.42, -0.82)));
    stub.push(place(spike({ len: 0.9, r0: 0.24, rFn: (q) => 0.24 * (1 - q * 0.45), bend: 0.1, rings: 5, segs: 12, ...hornCol, tipStart: 0.9 }), V(0.38 * sx, 0.42, -0.25), V(0.38 * sx, 0.42, -0.82)));
    headPieces.push(place(spike({ len: 1.2, r0: 0.14, bend: -0.15, side: 0.15 * sx, rings: 10, segs: 9, ...hornCol, tipStart: 0.35 }), V(0.62 * sx, 0.02, -0.3), V(0.62 * sx, -0.12, -0.78)));
    headPieces.push(place(spike({ len: 0.75, r0: 0.11, bend: 0.1, rings: 8, segs: 8, ...hornCol }), V(0.6 * sx, 0.36, 0.15), V(0.35 * sx, 0.28, -0.9)));
    headPieces.push(place(spike({ len: 0.45, r0: 0.07, bend: 0.0, rings: 6, segs: 7, ...hornCol }), V(0.52 * sx, -0.12, 0.55), V(0.85 * sx, -0.2, -0.5)));
    jawPieces.push(place(spike({ len: 0.55, r0: 0.08, bend: -0.2, rings: 6, segs: 7, ...hornCol }), V(0.42 * sx, -0.18, -0.25), V(0.5 * sx, -0.5, -0.7)));
    // brow ridge plate
    headPieces.push(place(spike({ len: 0.85, r0: 0.17, flat: 0.55, bend: 0.06, rings: 8, segs: 10, base: PAL.plate, tip: PAL.back, tipStart: 0.2 }), V(0.42 * sx, 0.38, 0.75), V(0.32 * sx, 0.08, -1.0), 0.6 * sx));
  }
  for (let i = 0; i < 4; i++) headPieces.push(place(spike({ len: 0.55 + i * 0.28, r0: 0.18 + i * 0.03, flat: 0.32, bend: -0.25, rings: 9, segs: 10, ...plateCol }), V(0, 0.5 - i * 0.02, 0.45 - i * 0.32), V(0, 0.8, -0.6)));
  headPieces.push(place(spike({ len: 0.55, r0: 0.11, bend: -0.25, rings: 8, segs: 8, ...hornCol }), V(0, 0.2, 1.5), V(0, 0.75, 0.5)));
  headPieces.push(place(spike({ len: 0.32, r0: 0.08, bend: -0.2, rings: 6, segs: 7, ...hornCol }), V(0, 0.12, 1.85), V(0, 0.8, 0.6)));

  // dorsal plates: along the main path from neck2 down to tail tip
  const ownerAt = (u) => { const w = Math.round(u - 0.5); return ['tail6', 'tail5', 'tail4', 'tail3', 'tail2', 'tail1', 'root', 'root', 'spine1', 'spine2', 'chest', 'neck1', 'neck2', 'neck3', 'head'][Math.max(0, Math.min(14, w))]; };
  const plateList = [];
  let lastArc = -1;
  for (let i = mainS.pts.length - 1; i >= 0; i--) {
    const u = mainS.u[i]; if (u > 12.4 || u < 0.9) continue;
    if (lastArc >= 0 && mainArc[lastArc] - mainArc[i] < 0.62) continue; lastArc = i;
    const pr = mainProf(u); const top = mainS.pts[i].clone().add(V(0, pr.oy + pr.ry * (1 + pr.ridge) - 0.08, 0));
    const size = keyed([[1, 0.4], [3, 0.55], [5, 0.75], [7, 0.95], [9, 1.25], [10, 1.15], [11, 0.8], [12.4, 0.5]], u);
    const plate = place(spike({ len: size, r0: size * 0.32, flat: 0.28, bend: -0.22, rings: 9, segs: 10, ...plateCol }), top, V(0, 1, -0.75));
    const bone = ownerAt(u); addRigid(bone, plate, true); plateList.push({ bone, u });
    // flank osteoderms on torso & tail base
    if (u > 5.5 && u < 11) for (const sx of [1, -1]) {
      const th = Math.PI / 2 - sx * 0.95; const pos = mainS.pts[i].clone().add(V(Math.cos(th) * pr.rx * 0.97, pr.oy + Math.sin(th) * pr.ry * 0.97, 0));
      const os = place(spike({ len: size * 0.42, r0: size * 0.17, flat: 0.5, bend: 0.1, rings: 6, segs: 8, ...plateCol }), pos, V(sx * 0.8, 0.6, -0.6));
      addRigid(bone, os, true);
    }
  }
  // ember vents: glowing lens-shaped slits flanking the dorsal ridge (intensity driven per-frame)
  const ventMat = new THREE.MeshStandardMaterial({ color: 0x1a0602, emissive: 0xff5a14, emissiveIntensity: 2, roughness: 0.6 });
  const vents = new Map();
  for (let i = 0; i < mainS.pts.length; i += 3) {
    const u = mainS.u[i]; if (u < 4.6 || u > 11.3) continue;
    const pr = mainProf(u); const size = keyed([[4.6, 0.45], [7, 0.8], [9.5, 1.0], [11.3, 0.55]], u);
    for (const sx of [1, -1]) {
      const th = Math.PI / 2 - sx * (0.42 + 0.12 * Math.sin(i * 1.7));
      const nrm = V(Math.cos(th) * pr.ry, Math.sin(th) * pr.rx, 0).normalize();
      const pos = mainS.pts[i].clone().add(V(Math.cos(th) * pr.rx, pr.oy + Math.sin(th) * pr.ry * (1 + pr.ridge * 0.3), 0)).addScaledVector(nrm, -0.03);
      const g = new THREE.SphereGeometry(1, 10, 6); g.scale(0.09 * size, 0.05, 0.3 * size + 0.05 * Math.sin(i * 3.1));
      const t = mainS.pts[Math.min(mainS.pts.length - 1, i + 1)].clone().sub(mainS.pts[Math.max(0, i - 1)]).normalize();
      place(g, pos, t.applyAxisAngle(V(0, 1, 0), sx * 0.25), 0, nrm);
      g.deleteAttribute('uv');
      const bone = ownerAt(u); g.translate(-B[bone].userData.worldRest.x, -B[bone].userData.worldRest.y, -B[bone].userData.worldRest.z);
      if (!vents.has(bone)) vents.set(bone, []); vents.get(bone).push(g);
    }
  }
  const ventMeshes = [];
  for (const [bn, geos] of vents) { const vm = new THREE.Mesh(mergeGeometries(geos), ventMat); B[bn].add(vm); ventMeshes.push(vm); }
  materials.ventMat = ventMat;
  const stump = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8), ventMat); stump.scale.set(1.1, 1.1, 0.5); stump.position.set(0, -0.05, 0.05); stump.visible = false; B.tail6.add(stump);

  // tail club (tail6-local): knobbed bony mace
  const clubJ = [V(0, 0.02, 0.35), V(0, -0.04, -0.3), V(0, -0.08, -0.95), V(0, -0.1, -1.4)];
  const clubS = samplePath(clubJ, 28);
  const clubPieces = [sweep({ path: clubS.pts, segs: 22, vScale: 1.2, ring: (q) => { const r = keyed([[0, 0.3], [0.3, 0.62], [0.55, 0.7], [0.85, 0.42], [1, 0.08]], q); return { rx: r * 1.15, ry: r * 0.9, sq: 2.2,
    shape: (th, x, y) => { const k = 1 + 0.18 * Math.max(0, Math.cos(th * 4)) * Math.sin(q * Math.PI); return [x * k, y * k]; } }; },
    color: (q, th) => mix3(PAL.plate, PAL.back, 0.5 - 0.4 * Math.max(0, Math.cos(th * 4))), capStart: true, capEnd: true })];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + 0.2, z = -0.45 - (k % 2) * 0.35; const dir = V(Math.cos(a), Math.sin(a) * 0.85, -0.35);
    clubPieces.push(place(spike({ len: 0.7 + (k % 3) * 0.15, r0: 0.16, bend: -0.05, rings: 8, segs: 8, ...plateCol }), V(Math.cos(a) * 0.62, -0.06 + Math.sin(a) * 0.5, z), dir));
  }
  clubPieces.push(place(spike({ len: 0.9, r0: 0.18, rings: 8, segs: 8, ...plateCol }), V(0, -0.1, -1.25), V(0, 0, -1)));

  // claws
  for (const [s, S, sx] of [['L', L, 1], ['R', R, -1]]) {
    for (let k = -1; k <= 1; k++) addRigid('hand' + s, place(spike({ len: 0.55, r0: 0.11, bend: -0.45, rings: 8, segs: 8, base: PAL.claw, tip: srgb(0x0a0808), tipStart: 0.2 }), S.knuckle.clone().add(V(k * 0.2, 0.12, -0.05)), V(k * 0.25, -0.15, 1)), true);
    addRigid('f1' + s, place(spike({ len: 0.7, r0: 0.12, bend: -0.5, rings: 8, segs: 8, base: PAL.claw, tip: srgb(0x0a0808), tipStart: 0.2 }), S.wrist.clone().add(S.f1.clone().multiplyScalar(0.03)), V(0.1 * sx, 0.3, 1)), true);
    for (let k = -1; k <= 1; k++) addRigid('toe' + s, place(spike({ len: 0.5, r0: 0.11, bend: -0.5, rings: 8, segs: 8, base: PAL.claw, tip: srgb(0x0a0808), tipStart: 0.2 }), S.toe.clone().add(V(k * 0.24, 0.1, -0.1)), V(k * 0.3, -0.1, 1)), true);
    addRigid('toe' + s, place(spike({ len: 0.35, r0: 0.08, bend: 0.3, rings: 6, segs: 6, base: PAL.claw, tip: srgb(0x0a0808) }), S.ball.clone().add(V(0, 0.12, -0.25)), V(0, 0.1, -1)), true);
    // elbow spur & knee plate
    addRigid('upperArm' + s, place(spike({ len: 0.8, r0: 0.14, bend: 0.2, rings: 8, segs: 8, ...plateCol }), S.elbow.clone().add(V(0.15 * sx, 0.05, -0.15)), V(0.3 * sx, 0.2, -1)), true);
    addRigid('shin' + s, place(spike({ len: 0.5, r0: 0.15, flat: 0.5, bend: 0.2, rings: 6, segs: 8, ...plateCol }), S.knee.clone().add(V(0.05 * sx, 0.1, 0.3)), V(0.2 * sx, 0.6, 0.6)), true);
  }

  // build rigid meshes
  const rigidMeshes = {};
  for (const [bn, geos] of rigid) {
    const mesh = new THREE.Mesh(mergeGeometries(geos), hornMat); mesh.castShadow = true; B[bn].add(mesh); rigidMeshes[bn] = mesh;
  }
  const mkMesh = (geos, mat, parent) => { const m = new THREE.Mesh(mergeGeometries(geos), mat); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };
  const skullMesh = mkMesh([headPieces[0]], skinMat, B.head);
  const headArmour = mkMesh(headPieces.slice(1).concat(teethU), hornMat, B.head);
  const jawMesh = mkMesh([jawPieces[0]], skinMat, B.jaw);
  const jawArmour = mkMesh(jawPieces.slice(1).concat(teethL), hornMat, B.jaw);
  // jaw geometry is jaw-local already (authored around jaw bone origin)
  const hornMeshes = { L: mkMesh(hornL, hornMat, B.head), R: mkMesh(hornR, hornMat, B.head), stubL: mkMesh(hornStubL, hornMat, B.head), stubR: mkMesh(hornStubR, hornMat, B.head) };
  hornMeshes.stubL.visible = hornMeshes.stubR.visible = false;
  const clubMesh = mkMesh(clubPieces, hornMat, B.tail6);
  // eyes
  const eyes = [];
  for (const sx of [1, -1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10), eyeMat); e.scale.set(0.8, 0.5, 1.3); e.position.set(0.6 * sx, 0.24, 0.48); e.rotation.y = sx * 0.35; B.head.add(e); eyes.push(e);
  }

  return { stump, ventMeshes, bones, B, J, L, R, bodyMesh, memMesh, materials, rigidMeshes, hornMeshes, clubMesh, skullMesh, jawMesh, eyes, clubGeoSrc: clubPieces, hornGeoSrc: { L: hornL, R: hornR } };
}
