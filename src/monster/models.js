// The real monster models, built standalone (no AI): used by big-monster juveniles (src/field/broods.js) and by
// constructs (src/tame/mountModel.js). Same meshes as the wild animals / bosses:
//   fauna      → faunaRender.js geometry + animation shader (one-instance InstancedMesh; the snake is a chain)
//   dragons    → the wyvern GLB (public/models/wyvern.glb) with the variant's tint (flame / venom / cindaryl / cindral)
//   Varkhul    → rig.js skinned body;  Gorvath → bruteModel.js
// Every model faces +z with its feet at y = 0 and is scaled by `size` (1 = the adult animal / boss as it is in the wild).
// update(dt, { speed, flying }) animates it the same way its owner does (gait from speed, wing beats in flight).
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { makeFaunaMesh } from '../fauna/faunaRender.js';
import { SPECIES } from '../fauna/species.js';
import { loadWyvernGLB, VARIANTS, S0 } from './wyvern.js';
import { buildRig } from './rig.js';
import { buildBrute } from './bruteModel.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _d = new THREE.Vector3(), _z = new THREE.Vector3(0, 0, 1);
// what each monster id is built from
export const MODEL_OF = {
  beetle: ['fauna', 'beetle'], slime: ['fauna', 'slime'], bird: ['fauna', 'bird'], lizard: ['fauna', 'lizard'], drake: ['fauna', 'drake'],
  boar: ['fauna', 'boar'], tusk: ['fauna', 'boar', 1.45], wolf: ['fauna', 'wolf'], leader: ['fauna', 'wolf', 1.3], mole: ['fauna', 'mole'], grandmole: ['fauna', 'mole', 1.45],
  golem: ['fauna', 'golem'], snake: ['snake'],
  flame: ['wyvern', 'flame', 0.78], flameUpper: ['wyvern', 'flame', 0.92], venom: ['wyvern', 'venom', 0.85], cindaryl: ['wyvern', 'cindaryl', 1.02], wyvern: ['wyvern', 'cindral', 1],
  varkhul: ['varkhul'], brute: ['brute'],
};

export async function createMonsterModel(id, { size = 1 } = {}) {
  const [kind, a, k = 1] = MODEL_OF[id] || ['fauna', 'beetle'];
  const root = new THREE.Group(); root.name = 'model-' + id; root.userData.global = true;
  let phase = 0, flap = 0, time = 0, update = () => {}; const parts = [];
  if (kind === 'fauna') {
    const F = makeFaunaMesh(THREE, a, 1); const mesh = F.mesh; mesh.count = 1; mesh.castShadow = true; root.add(mesh); parts.push(mesh);
    const sc = (SPECIES[id]?.size || 1) * (id === 'tusk' || id === 'grandmole' || id === 'leader' ? 1 : k) * size;
    // the bird's model is centred on its body (it is drawn at flight altitude in the wild): stand it on its legs
    _m.makeScale(sc, sc, sc); if (a === 'bird') _m.setPosition(0, 0.52 * sc, 0); mesh.setMatrixAt(0, _m); mesh.instanceMatrix.needsUpdate = true; mesh.setColorAt(0, new THREE.Color(1, 1, 1)); mesh.instanceColor.needsUpdate = true;
    const bird = a === 'bird', golem = a === 'golem';
    update = (dt, { speed = 0, flying = false } = {}) => {
      time += dt; phase += dt * (bird ? (flying ? 1.4 : 0.4) : 0.5 + Math.min(1, speed / 6) * 1.6);
      const A = F.anim.array; A[0] = phase; A[1] = golem ? 1 : Math.min(1, speed / 5); A[2] = bird ? (flying ? 0 : 2) : golem ? 0 : speed > 9 ? 3 : 0; A[3] = 0.3 + 0.2 * Math.sin(time * 2); F.anim.needsUpdate = true;
    };
    update(0);
    return { root, update, parts, kind, height: estimateHeight(a, sc) };
  }
  if (kind === 'snake') { // head + 12 segments following the head's path (the wild snake's chain, shortened to ride)
    const H = makeFaunaMesh(THREE, 'snakeHead', 1), S = makeFaunaMesh(THREE, 'snakeSeg', 12); root.add(H.mesh, S.mesh); H.mesh.count = 1; S.mesh.count = 12; parts.push(H.mesh, S.mesh);
    const sc = 0.75 * size; const pts = []; for (let i = 0; i <= 12; i++) pts.push(new THREE.Vector3(0, 0.45 * sc, -i * 0.8 * sc));
    update = (dt, { speed = 0, swimming = false } = {}) => {
      time += dt; phase += dt * (1.5 + speed * 0.25);
      for (let i = 0; i <= 12; i++) pts[i].set(Math.sin(phase * 2 - i * 0.6) * 0.35 * sc * Math.min(1, i / 3), (swimming ? 0.2 : 0.45) * sc, -i * 0.8 * sc + 0.4 * sc);
      for (let i = 0; i < 12; i++) { _d.subVectors(pts[i], pts[i + 1]); const len = _d.length(); _q.setFromUnitVectors(_z, _d.normalize()); const t = sc * (i < 2 ? 1.05 : 1 - Math.max(0, i - 6) / 14); _s.set(t, t, len * 1.05); _m.compose(_p.copy(pts[i]).lerp(pts[i + 1], 0.5), _q, _s); S.mesh.setMatrixAt(i, _m); }
      _q.identity(); _s.setScalar(sc); _m.compose(_p.copy(pts[0]).setZ(pts[0].z + 0.3 * sc), _q, _s); H.mesh.setMatrixAt(0, _m);
      S.mesh.instanceMatrix.needsUpdate = H.mesh.instanceMatrix.needsUpdate = true; S.anim.array.fill(0); for (let i = 0; i < 12; i++) S.anim.array[i * 4 + 3] = 0.15; S.anim.needsUpdate = true;
    };
    update(0);
    return { root, update, parts, kind, height: 1.0 * sc };
  }
  if (kind === 'wyvern') {
    const gltf = await loadWyvernGLB(); const model = cloneSkinned(gltf.scene); const VD = VARIANTS[a] || VARIANTS.cindral; const SC = S0 * k * size;
    model.scale.setScalar(SC); root.add(model);
    model.traverse((o) => { if (o.isSkinnedMesh) { o.castShadow = true; o.frustumCulled = false; const mat = (o.material = o.material.clone()); mat.metalness = 0.12; mat.roughness = 0.85; mat.emissive = new THREE.Color(1, 0.42, 0.12); mat.emissiveMap = mat.map; mat.emissiveIntensity = 0.18; if (VD.tint) { mat.color.setRGB(...VD.tint.color); mat.emissive.setRGB(...VD.tint.emissive); mat.emissiveIntensity = VD.tint.ei; } parts.push(o); } });
    const B = {}; model.traverse((o) => { if (o.name && !o.isMesh) B[o.name] = o; });
    // the wild dragon's rest pose puts its belly ~LANDED0 (3.55 m × scale) above the ground: lift the model to stand
    model.position.y = 3.2 * k * size;
    update = (dt, { speed = 0, flying = false } = {}) => {
      time += dt; flap += dt * (flying ? 1.25 : 0.25) * Math.PI * 2; const amp = flying ? 0.55 : 0.08, fold = flying ? 0 : -0.35;
      for (const [s, kk] of [['L', 1], ['R', -1]]) {
        if (B['wing1' + s]) B['wing1' + s].rotation.z = kk * (Math.sin(flap) * amp + fold);
        if (B['wing2' + s]) B['wing2' + s].rotation.z = kk * (Math.sin(flap - 0.5) * amp * 0.6 + fold * 0.8);
        if (B['wing3' + s]) B['wing3' + s].rotation.z = kk * Math.sin(flap - 1) * amp * 0.45;
        const walk = flying ? 0 : Math.sin(time * (2 + speed * 0.35) + (kk > 0 ? 0 : Math.PI)) * Math.min(0.5, speed * 0.05);
        if (B['fore1' + s]) B['fore1' + s].rotation.x = flying ? -0.35 : -walk; if (B['hind1' + s]) B['hind1' + s].rotation.x = flying ? 0.4 : walk * 0.8 - 0.5;
      }
      if (B.tail1) B.tail1.rotation.y = Math.sin(time * 1.3) * 0.09; if (B.tail2) B.tail2.rotation.y = Math.sin(time * 1.3 - 0.5) * 0.12;
    };
    update(0);
    return { root, update, parts, kind, B, height: 3.6 * k * size };
  }
  if (kind === 'varkhul') {
    const rig = buildRig(); const g = new THREE.Group(); g.add(rig.bones[0], rig.bodyMesh, rig.memMesh); g.updateMatrixWorld(true);
    rig.bodyMesh.bind(new THREE.Skeleton(rig.bones)); rig.memMesh.bind(rig.bodyMesh.skeleton); g.scale.setScalar(size); root.add(g);
    for (const o of [rig.bodyMesh, rig.memMesh]) { o.castShadow = true; o.frustumCulled = false; parts.push(o); }
    const B = rig.B; const rest = {}; for (const n of ['thighL', 'thighR', 'upperArmL', 'upperArmR', 'tail1', 'tail2']) if (B[n]) rest[n] = B[n].quaternion.clone();
    const uni = rig.materials.uniforms; const _e = new THREE.Euler(), _qq = new THREE.Quaternion();
    update = (dt, { speed = 0 } = {}) => {
      time += dt; if (uni?.uTime) uni.uTime.value = time; phase += dt * (1 + speed * 0.4); const sw = Math.min(0.45, speed * 0.05);
      const set = (n, x, y = 0) => { if (B[n]) B[n].quaternion.copy(rest[n]).multiply(_qq.setFromEuler(_e.set(x, y, 0))); };
      set('thighL', Math.sin(phase) * sw); set('thighR', -Math.sin(phase) * sw); set('upperArmL', -Math.sin(phase) * sw); set('upperArmR', Math.sin(phase) * sw);
      set('tail1', 0, Math.sin(time * 1.1) * 0.08); set('tail2', 0, Math.sin(time * 1.1 - 0.6) * 0.1);
    };
    update(0);
    return { root, update, parts, kind, B, height: 4.2 * size };
  }
  // Gorvath
  const model = buildBrute(); model.root.scale.setScalar(size); root.add(model.root); model.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; parts.push(o); } });
  const B = model.B; const r0 = {}; for (const n of ['hipL', 'hipR', 'shoulderL', 'shoulderR']) if (B[n]) r0[n] = B[n].rotation.x;
  update = (dt, { speed = 0 } = {}) => {
    time += dt; phase += dt * (0.8 + speed * 0.3); const sw = Math.min(0.35, speed * 0.04);
    for (const [s, k2] of [['L', 1], ['R', -1]]) { if (B['hip' + s]) B['hip' + s].rotation.x = r0['hip' + s] + Math.sin(phase) * sw * k2; if (B['shoulder' + s]) B['shoulder' + s].rotation.x = r0['shoulder' + s] - Math.sin(phase) * sw * k2 * 0.6; }
  };
  update(0);
  return { root, update, parts, kind, B, height: 6 * size };
}
const estimateHeight = (sp, sc) => ({ beetle: 0.65, slime: 0.8, bird: 0.5, lizard: 0.7, drake: 0.75, boar: 1.4, wolf: 1.1, mole: 1.7, golem: 3.6 }[sp] || 1) * sc;

// the top of the model's back above the point (x, z) in its local frame — the saddle sits there (ray cast straight down)
const _ray = new THREE.Raycaster(); const _o = new THREE.Vector3(), _dn = new THREE.Vector3(0, -1, 0);
export function backHeightAt(model, x, z) {
  model.root.updateMatrixWorld(true); const inv = model.root.matrixWorld; _o.set(x, 50, z).applyMatrix4(inv); _ray.set(_o, _dn);
  const hits = _ray.intersectObjects(model.parts, false); if (!hits.length) return null;
  const top = hits[0].point.clone(); model.root.worldToLocal(top); return top.y;
}
