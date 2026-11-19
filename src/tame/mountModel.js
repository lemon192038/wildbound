// Procedural look for an artificial monster (人造モンスター): a construct modelled on the species' silhouette (body plan
// from src/shared/tame.js), with glowing construct seams at every joint and a leather saddle. Forward is +z, matching the
// hunter (P.facing). Animated by update(dt, speed, { flying, swimming }): gait cycles, wing beats, serpent waves.
import * as THREE from 'three';
import { TAMES } from '../shared/tame.js';

export function createMountModel(sp) {
  const T = TAMES[sp]; const root = new THREE.Group(); root.name = 'mount-' + sp;
  const body = new THREE.Group(); root.add(body); body.scale.setScalar(T.s);
  const m1 = new THREE.MeshStandardMaterial({ color: T.c1, roughness: 0.75, metalness: 0.15 });
  const m2 = new THREE.MeshStandardMaterial({ color: T.c2, roughness: 0.55, metalness: 0.2 });
  const glow = new THREE.MeshStandardMaterial({ color: T.glow, emissive: T.glow, emissiveIntensity: 1.6, roughness: 0.4 });
  const leather = new THREE.MeshStandardMaterial({ color: 0x5a3820, roughness: 0.85 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xc8a050, roughness: 0.35, metalness: 0.8 });
  const mesh = (g, m, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1], parent = body) => { const o = new THREE.Mesh(g, m); o.position.set(...p); o.rotation.set(...r); o.scale.set(...s); o.castShadow = true; parent.add(o); return o; };
  const pivot = (p, parent = body) => { const g = new THREE.Group(); g.position.set(...p); parent.add(g); return g; };
  const seam = (p, r, parent = body, rad = 0.2) => mesh(new THREE.TorusGeometry(rad, 0.035, 5, 14), glow, p, r, [1, 1, 1], parent);
  const S = new THREE.SphereGeometry(1, 14, 10), CY = new THREE.CylinderGeometry(1, 1, 1, 8);
  const legs = [], wings = [], segs = []; let seatY = 1.6, seatZ = 0;
  const limb = (x, y, z, len, rad, m = m1) => { const hip = pivot([x, y, z]); mesh(CY, m, [0, -len / 2, 0], [0, 0, 0], [rad, len, rad], hip); mesh(S, m2, [0, -len, 0.06], [0, 0, 0], [rad * 1.3, rad * 0.8, rad * 1.7], hip); seam([0, 0, 0], [0, 0, Math.PI / 2], hip, rad * 1.15); legs.push(hip); return hip; };
  const wing = (side, span, y, z) => {
    const w = pivot([0.45 * side, y, z]); const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(span * 0.55, 0.5); sh.lineTo(span, 0.1); sh.lineTo(span * 0.8, -0.6); sh.lineTo(span * 0.45, -0.9); sh.lineTo(span * 0.15, -1.1); sh.lineTo(0, -0.6);
    const g = new THREE.ShapeGeometry(sh); g.rotateX(-Math.PI / 2); if (side < 0) g.scale(-1, 1, 1);
    const mem = new THREE.MeshStandardMaterial({ color: T.c2, roughness: 0.7, side: THREE.DoubleSide, emissive: T.glow, emissiveIntensity: 0.12 });
    mesh(g, mem, [0, 0, 0], [0, 0, 0], [1, 1, 1], w); mesh(CY, m1, [span * 0.5 * side, 0.02, 0.25], [0, 0, Math.PI / 2], [0.07, span, 0.07], w); seam([0, 0, 0], [0, Math.PI / 2, 0], w, 0.16); wings.push({ w, side }); return w;
  };
  switch (T.plan) {
    case 'quad': case 'dragon': {
      const low = sp === 'lizard' || sp === 'drake' ? 0.7 : 1;
      mesh(S, m1, [0, 1.25 * low, 0], [0, 0, 0], [0.62, 0.55, 1.25]); mesh(S, m2, [0, 1.48 * low, -0.1], [0, 0, 0], [0.45, 0.2, 0.9]);
      const neck = pivot([0, 1.45 * low, 1.05]); mesh(CY, m1, [0, 0.25, 0.25], [0.9, 0, 0], [0.24, 0.8, 0.24], neck);
      const head = pivot([0, 0.55, 0.65], neck); mesh(S, m1, [0, 0, 0.2], [0, 0, 0], [0.3, 0.26, 0.5], head); mesh(S, m2, [0, -0.1, 0.45], [0, 0, 0], [0.22, 0.12, 0.3], head);
      mesh(S, glow, [0.17, 0.08, 0.35], [0, 0, 0], [0.05, 0.05, 0.05], head); mesh(S, glow, [-0.17, 0.08, 0.35], [0, 0, 0], [0.05, 0.05, 0.05], head);
      if (sp === 'boar' || sp === 'tusk') { for (const x of [-0.2, 0.2]) mesh(new THREE.ConeGeometry(0.06, 0.45, 6), m2, [x, -0.15, 0.6], [1.2, 0, 0], [1, 1, 1], head); for (let i = 0; i < 5; i++) mesh(new THREE.OctahedronGeometry(0.22, 0), m2, [Math.sin(i * 2.1) * 0.25, 1.75, -0.6 + i * 0.25], [0, i, 0.3], [0.6, 1.6, 0.6]); }
      if (T.plan === 'dragon' || sp === 'varkhul') for (const x of [-0.14, 0.14]) mesh(new THREE.ConeGeometry(0.06, 0.5, 6), m2, [x, 0.25, -0.05], [-0.9, 0, 0], [1, 1, 1], head);
      if (sp === 'wolf' || sp === 'leader') for (const x of [-0.14, 0.14]) mesh(new THREE.ConeGeometry(0.08, 0.25, 4), m1, [x, 0.25, 0.05], [0, 0, 0], [1, 1, 1], head);
      seam([0, 1.45 * low, 1.0], [0.3, 0, 0], body, 0.3);
      const tail = pivot([0, 1.2 * low, -1.15]); mesh(new THREE.ConeGeometry(0.22, 1.8, 7), m1, [0, -0.1, -0.85], [-1.45, 0, 0], [1, 1, 1], tail); seam([0, 0, 0], [0, 0, 0], tail, 0.22); legs.tail = tail;
      const L = 1.05 * low; limb(0.42, 1.0 * low, 0.75, L, 0.15); limb(-0.42, 1.0 * low, 0.75, L, 0.15); limb(0.42, 1.0 * low, -0.75, L, 0.17); limb(-0.42, 1.0 * low, -0.75, L, 0.17);
      if (T.plan === 'dragon') { wing(1, 3.2, 1.6, 0.35); wing(-1, 3.2, 1.6, 0.35); }
      seatY = 1.85 * low; seatZ = 0.1; legs.neck = neck; break;
    }
    case 'bird': {
      mesh(S, m1, [0, 1.3, 0], [0.2, 0, 0], [0.55, 0.55, 0.95]); const head = pivot([0, 1.85, 0.75]); mesh(S, m1, [0, 0, 0], [0, 0, 0], [0.3, 0.3, 0.32], head); mesh(new THREE.ConeGeometry(0.11, 0.45, 6), m2, [0, -0.05, 0.38], [Math.PI / 2, 0, 0], [1, 1, 1], head);
      mesh(S, glow, [0.15, 0.08, 0.2], [0, 0, 0], [0.05, 0.05, 0.05], head); mesh(S, glow, [-0.15, 0.08, 0.2], [0, 0, 0], [0.05, 0.05, 0.05], head); seam([0, 1.6, 0.6], [0.6, 0, 0], body, 0.25);
      mesh(new THREE.ConeGeometry(0.4, 1.1, 5), m2, [0, 1.35, -1.0], [-1.7, 0, 0]); limb(0.25, 0.9, 0.05, 0.9, 0.07, m2); limb(-0.25, 0.9, 0.05, 0.9, 0.07, m2);
      wing(1, 2.4, 1.5, 0.25); wing(-1, 2.4, 1.5, 0.25); seatY = 1.82; seatZ = -0.05; legs.neck = head; break;
    }
    case 'serpent': {
      for (let i = 0; i < 9; i++) { const g = pivot([0, 0.55, 1.2 - i * 0.85]); const r = 0.55 - Math.abs(i - 2) * 0.04; mesh(S, i % 2 ? m1 : m2, [0, 0, 0], [0, 0, 0], [r, r * 0.85, 0.6]); segs.push(g); g.add(body.children.pop()); if (i) seam([0, 0, 0.42], [0, 0, 0], g, r * 0.9); }
      const head = segs[0]; mesh(S, m1, [0, 0.05, 0.55], [0, 0, 0], [0.45, 0.32, 0.6], head); mesh(S, glow, [0.25, 0.2, 0.85], [0, 0, 0], [0.06, 0.06, 0.06], head); mesh(S, glow, [-0.25, 0.2, 0.85], [0, 0, 0], [0.06, 0.06, 0.06], head);
      for (let i = 1; i < 9; i++) mesh(new THREE.ConeGeometry(0.12, 0.35, 5), m2, [0, 0.5, 0], [0, 0, 0], [1, 1, 1], segs[i]);
      seatY = 1.15; seatZ = 0.35; break;
    }
    case 'beetle': {
      mesh(new THREE.SphereGeometry(1, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), m1, [0, 0.7, -0.1], [0, 0, 0], [0.9, 0.75, 1.2]); mesh(CY, glow, [0, 1.18, -0.1], [Math.PI / 2, 0, 0], [0.04, 2.2, 0.04]);
      mesh(S, m2, [0, 0.7, 1.05], [0, 0, 0], [0.42, 0.3, 0.35]); for (const x of [-0.18, 0.18]) mesh(new THREE.ConeGeometry(0.06, 0.4, 5), m2, [x, 0.65, 1.4], [1.4, 0, x * 2], [1, 1, 1]);
      for (const z of [0.6, 0, -0.6]) { for (const s of [1, -1]) { const h = pivot([0.7 * s, 0.7, z]); mesh(CY, m2, [0.3 * s, -0.25, 0], [0, 0, 0.9 * s], [0.06, 0.8, 0.06], h); legs.push(h); } }
      seam([0, 0.72, 0.9], [0, 0, 0], body, 0.4); seatY = 1.55; seatZ = -0.1; break;
    }
    case 'blob': {
      const b = mesh(S, new THREE.MeshStandardMaterial({ color: T.c1, emissive: T.c2, emissiveIntensity: 0.5, roughness: 0.25, transparent: true, opacity: 0.88 }), [0, 0.95, 0], [0, 0, 0], [1.1, 0.95, 1.2]);
      mesh(S, glow, [0, 0.95, 0], [0, 0, 0], [0.35, 0.35, 0.35]); mesh(S, m1, [0.3, 1.35, 0.95], [0, 0, 0], [0.09, 0.12, 0.05]); mesh(S, m1, [-0.3, 1.35, 0.95], [0, 0, 0], [0.09, 0.12, 0.05]);
      seam([0, 0.6, 0], [Math.PI / 2, 0, 0], body, 1.05); legs.blob = b; seatY = 1.95; seatZ = 0; break;
    }
    case 'mole': {
      mesh(S, m1, [0, 0.95, 0], [0, 0, 0], [0.95, 0.7, 1.35]); for (let i = 0; i < 4; i++) mesh(S, m2, [0, 1.35, 0.7 - i * 0.45], [0.2, 0, 0], [0.7 - i * 0.05, 0.25, 0.3]);
      const head = pivot([0, 0.9, 1.3]); mesh(S, m1, [0, 0, 0.1], [0, 0, 0], [0.45, 0.4, 0.5], head); mesh(S, m2, [0, -0.05, 0.6], [0, 0, 0], [0.15, 0.12, 0.15], head); mesh(S, glow, [0.18, 0.12, 0.45], [0, 0, 0], [0.04, 0.04, 0.04], head); mesh(S, glow, [-0.18, 0.12, 0.45], [0, 0, 0], [0.04, 0.04, 0.04], head);
      for (const s of [1, -1]) { const h = limb(0.7 * s, 0.75, 0.8, 0.6, 0.18); for (let k = 0; k < 3; k++) mesh(new THREE.ConeGeometry(0.06, 0.45, 5), m2, [(k - 1) * 0.1, -0.7, 0.25], [1.3, 0, 0], [1, 1, 1], h); }
      limb(0.6, 0.7, -0.8, 0.5, 0.16); limb(-0.6, 0.7, -0.8, 0.5, 0.16); seam([0, 0.95, 1.2], [0, 0, 0], body, 0.45); seatY = 1.75; seatZ = -0.15; legs.neck = head; break;
    }
    case 'golem': {
      mesh(new THREE.DodecahedronGeometry(1, 0), m1, [0, 1.9, 0], [0, 0.3, 0], [0.95, 0.85, 0.85]); mesh(S, glow, [0, 1.95, 0.55], [0, 0, 0], [0.22, 0.22, 0.22]);
      mesh(new THREE.DodecahedronGeometry(0.45, 0), m1, [0, 2.8, 0.4]); mesh(S, glow, [0.15, 2.85, 0.75], [0, 0, 0], [0.05, 0.05, 0.05]); mesh(S, glow, [-0.15, 2.85, 0.75], [0, 0, 0], [0.05, 0.05, 0.05]);
      for (const s of [1, -1]) { const a = pivot([1.05 * s, 2.3, 0.1]); mesh(new THREE.DodecahedronGeometry(0.35, 0), m1, [0, -0.5, 0], [0, 0, 0], [1, 1.6, 1], a); mesh(new THREE.DodecahedronGeometry(0.42, 0), m2, [0, -1.3, 0.1], [0, 0, 0], [1, 1, 1], a); seam([0, 0, 0], [0, 0, Math.PI / 2], a, 0.35); legs.push(a); }
      limb(0.45, 1.1, 0, 1.0, 0.28); limb(-0.45, 1.1, 0, 1.0, 0.28); seatY = 2.75; seatZ = -0.35; break;
    }
  }
  // saddle: seat, cantle, pommel, flaps, stirrups, brass studs
  const saddle = pivot([0, seatY, seatZ]);
  mesh(new THREE.BoxGeometry(0.62, 0.12, 0.8), leather, [0, 0, 0], [0, 0, 0], [1, 1, 1], saddle);
  mesh(new THREE.BoxGeometry(0.5, 0.26, 0.1), leather, [0, 0.13, -0.36], [-0.2, 0, 0], [1, 1, 1], saddle);
  mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.22, 8), brass, [0, 0.14, 0.38], [0.2, 0, 0], [1, 1, 1], saddle);
  for (const s of [1, -1]) { mesh(new THREE.BoxGeometry(0.06, 0.45, 0.55), leather, [0.34 * s, -0.22, 0], [0, 0, 0.12 * s], [1, 1, 1], saddle); mesh(new THREE.TorusGeometry(0.08, 0.018, 5, 10), brass, [0.38 * s, -0.62, 0.05], [0, Math.PI / 2, 0], [1, 1, 1], saddle); }
  const seat = new THREE.Object3D(); seat.position.set(0, 0.07, -0.02); saddle.add(seat);
  root.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });

  let phase = 0, flap = 0, time = 0;
  function update(dt, speed = 0, { flying = false, swimming = false } = {}) {
    time += dt; const gait = Math.min(1, speed / Math.max(4, T.speed * 0.6)); phase += dt * (2 + speed * 0.7);
    legs.forEach((h, i) => { const s = (i % 2 === 0 ? 1 : -1) * (i >= 2 && T.plan !== 'golem' ? -1 : 1); h.rotation.x = flying ? 0.9 : Math.sin(phase + (i % 2) * Math.PI) * 0.6 * gait * s; });
    if (legs.tail) legs.tail.rotation.y = Math.sin(time * 1.6 + phase * 0.3) * 0.25;
    if (legs.neck) legs.neck.rotation.x = Math.sin(phase * 2) * 0.04 * gait - (flying ? 0.15 : 0);
    flap += dt * (flying ? 7 : 1.2); for (const { w, side } of wings) w.rotation.z = side * (flying ? Math.sin(flap) * 0.6 + 0.1 : 1.15);
    for (let i = 0; i < segs.length; i++) { segs[i].position.x = Math.sin(time * (swimming ? 4 : 3) + phase * 0.4 - i * 0.7) * 0.32 * Math.min(1, i / 2) * (0.4 + gait); segs[i].position.y = 0.55 + (swimming ? -0.25 : 0); }
    if (legs.blob) { const k = 1 + Math.sin(phase * 1.4) * 0.07 * (0.3 + gait); legs.blob.scale.set(1.1 / Math.sqrt(k), 0.95 * k, 1.2 / Math.sqrt(k)); }
    body.position.y = T.plan === 'serpent' ? 0 : Math.abs(Math.sin(phase)) * 0.08 * gait + (flying ? Math.sin(time * 2) * 0.1 : 0);
    glow.emissiveIntensity = 1.3 + Math.sin(time * 3) * 0.35;
  }
  function seatWorld(out = new THREE.Vector3()) { root.updateMatrixWorld(true); return seat.getWorldPosition(out); }
  function dispose() { root.traverse((o) => { if (o.isMesh) { o.geometry.dispose?.(); } }); }
  return { root, update, seatWorld, seat, dispose, sp };
}
