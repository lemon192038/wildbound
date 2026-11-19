// A construct (人造モンスター) uses the REAL model of the monster it is modelled on (user request): the same mesh,
// shader animation and tint as the wild animal / boss (src/monster/models.js), at a rideable size, with a leather
// saddle strapped onto its back. Forward is +z (P.facing). update(dt, speed, { flying, swimming }).
// Async: the dragon models come from the wyvern GLB.
import * as THREE from 'three';
import { createMonsterModel, backHeightAt } from '../monster/models.js';

// size relative to the wild adult: small animals are built larger so a hunter fits on them, big bosses smaller
export const RIDE_SIZE = { beetle: 1.9, slime: 1.9, bird: 2.4, lizard: 1.35, drake: 0.95, snake: 1.3, boar: 1.15, tusk: 0.85, wolf: 1.6, leader: 1.25, mole: 0.95, grandmole: 0.7, golem: 0.75,
  flame: 0.5, venom: 0.48, cindaryl: 0.42, wyvern: 0.45, varkhul: 0.42, brute: 0.38 };
// where the saddle goes along the body (local z, metres at ride size): over the shoulders
const SEAT_Z = { snake: -0.9, bird: -0.05, mole: -0.4, golem: -0.4, brute: -0.6, varkhul: 0.6, beetle: -0.1, slime: 0 };

export async function createMountModel(sp) {
  const model = await createMonsterModel(sp, { size: RIDE_SIZE[sp] ?? 1 });
  const root = model.root; root.name = 'mount-' + sp;
  // saddle height: cast down onto the back at the seat; fall back to the model's nominal height
  const sz = SEAT_Z[sp] ?? 0.1; let y = backHeightAt(model, 0, sz); if (y == null || !Number.isFinite(y) || y < 0.3) y = model.height;
  const leather = new THREE.MeshStandardMaterial({ color: 0x5a3820, roughness: 0.85 }), brass = new THREE.MeshStandardMaterial({ color: 0xc8a050, roughness: 0.35, metalness: 0.8 });
  const saddle = new THREE.Group(); saddle.position.set(0, y, sz); root.add(saddle);
  const add = (g, m, p, r = [0, 0, 0]) => { const o = new THREE.Mesh(g, m); o.position.set(...p); o.rotation.set(...r); o.castShadow = true; saddle.add(o); return o; };
  add(new THREE.BoxGeometry(0.62, 0.12, 0.8), leather, [0, 0.04, 0]);
  add(new THREE.BoxGeometry(0.5, 0.26, 0.1), leather, [0, 0.17, -0.36], [-0.2, 0, 0]);
  add(new THREE.CylinderGeometry(0.06, 0.08, 0.22, 8), brass, [0, 0.18, 0.38], [0.2, 0, 0]);
  for (const s of [1, -1]) { add(new THREE.BoxGeometry(0.06, 0.45, 0.55), leather, [0.34 * s, -0.18, 0], [0, 0, 0.12 * s]); add(new THREE.TorusGeometry(0.08, 0.018, 5, 10), brass, [0.38 * s, -0.58, 0.05], [0, Math.PI / 2, 0]); }
  const girth = add(new THREE.TorusGeometry(0.5, 0.03, 5, 16), leather, [0, -0.25, 0], [0, Math.PI / 2, 0]); girth.scale.set(1, 1.4, 1);
  const seat = new THREE.Object3D(); seat.position.set(0, 0.11, -0.02); saddle.add(seat);
  root.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
  function update(dt, speed = 0, { flying = false, swimming = false } = {}) { model.update(dt, { speed, flying, swimming }); }
  function seatWorld(out = new THREE.Vector3()) { root.updateMatrixWorld(true); return seat.getWorldPosition(out); }
  function dispose() { root.traverse((o) => { if (o.isMesh && !o.isSkinnedMesh) o.geometry?.dispose?.(); }); }
  return { root, update, seatWorld, seat, dispose, sp, model, seatY: y };
}
