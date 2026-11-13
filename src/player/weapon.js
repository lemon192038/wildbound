// "Marrowcleaver": an original greatsword-class weapon. Long single-edged cleaver blade with a vertebral bone
// spine ridge, horn quillons, riveted steel ricasso plates and a leather-wrapped two-hand grip.
// Weapon local space: grip (main hand) at origin, blade toward +Y, cutting edge toward +Z, flat faces on ±X.
import * as THREE from 'three';

export const BLADE = { base: 0.16, tip: 1.68, grip2: -0.24 };

function bladeGeometry() {
  const S = 40, U = 10, y0 = BLADE.base, L = BLADE.tip, sT = 0.86;
  const spineZ = (s) => -0.035 - 0.012 * s; // spine side (slight back sweep)
  const edgeZ = (s) => 0.11 + 0.085 * Math.pow(s, 1.3); // widening cleaver belly
  const yAt = (s) => y0 + s * (L - y0);
  const pt = (s, u) => {
    const sz = spineZ(s), y = yAt(s);
    let ez, ey;
    if (s < sT) { ez = edgeZ(s); ey = y; } else {
      const k = (s - sT) / (1 - sT), Ez = edgeZ(sT), Ey = yAt(sT), Tz = spineZ(1) + 0.03, Ty = L;
      ez = Ez + (Tz - Ez) * k; ey = Ey + (Ty - Ey) * Math.pow(k, 0.8);
    }
    return [sz + (ez - sz) * u, y + (ey - y) * u];
  };
  const th = (s, u) => {
    let t = u < 0.8 ? 0.026 * Math.pow(1 - u, 0.55) : 0.026 * Math.pow(0.2, 0.55) * (1 - (u - 0.8) / 0.2);
    if (Math.abs(u - 0.32) < 0.07) t -= 0.006 * (1 - Math.abs(u - 0.32) / 0.07);
    return Math.max(0.0015, t * (1 - 0.35 * s));
  };
  const pos = [], uv = [], idx = [];
  const face = (sign) => {
    const start = pos.length / 3;
    for (let i = 0; i <= S; i++) for (let j = 0; j <= U; j++) {
      const s = i / S, u = j / U, [z, y] = pt(s, u);
      pos.push(sign * th(s, u) / 2, y, z); uv.push(u, s);
    }
    for (let i = 0; i < S; i++) for (let j = 0; j < U; j++) {
      const a = start + i * (U + 1) + j, b = a + U + 1, c = a + 1, d = b + 1;
      if (sign > 0) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
    }
  };
  face(1); face(-1);
  // spine strip (u=0) and edge strip (u=1)
  const strip = (u, flip) => {
    const start = pos.length / 3;
    for (let i = 0; i <= S; i++) {
      const s = i / S, [z, y] = pt(s, u), t = th(s, u) / 2;
      pos.push(t, y, z, -t, y, z); uv.push(u, s, u, s);
    }
    for (let i = 0; i < S; i++) {
      const f0 = start + i * 2, k0 = f0 + 1, f1 = f0 + 2, k1 = f0 + 3;
      if (!flip) idx.push(f0, k0, f1, f1, k0, k1); else idx.push(f0, f1, k0, f1, k1, k0);
    }
  };
  strip(0, false); strip(1, true);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  // edge line points (for glow strip)
  const edge = []; for (let i = 0; i <= S; i++) { const [z, y] = pt(i / S, 0.97); edge.push(new THREE.Vector3(0, y, z)); }
  return { geometry: g, edge, pt };
}

// Tapered sweep along a curve.
export function sweep(points, radius, radial = 8, segs = 24, closed = false) {
  const curve = new THREE.CatmullRomCurve3(points);
  const g = new THREE.TubeGeometry(curve, segs, 1, radial, closed);
  const p = g.attributes.position, c = new THREE.Vector3(), v = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    curve.getPointAt(i / segs, c); const r = radius(i / segs);
    for (let j = 0; j <= radial; j++) { const k = i * (radial + 1) + j; v.fromBufferAttribute(p, k).sub(c).multiplyScalar(r).add(c); p.setXYZ(k, v.x, v.y, v.z); }
  }
  g.computeVertexNormals(); return g;
}

export function buildWeapon(mats) {
  const group = new THREE.Group(); group.name = 'Marrowcleaver';
  const add = (geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); if (s) m.scale.set(...s);
    m.castShadow = true; m.receiveShadow = true; group.add(m); return m;
  };
  const { geometry, edge, pt } = bladeGeometry();
  add(geometry, mats.blade);
  // Vertebral bone ridge along the spine
  const vert = new THREE.SphereGeometry(1, 10, 6);
  for (let i = 0; i < 13; i++) {
    const s = 0.04 + i * 0.065; if (s > 0.86) break;
    const [z, y] = pt(s, 0);
    add(vert, mats.bone, 0, y, z - 0.012, 0, 0, 0, [0.021 - s * 0.006, 0.032, 0.026]);
    if (i % 2 === 0) add(new THREE.ConeGeometry(0.012, 0.05, 6), mats.bone, 0, y + 0.01, z - 0.04, -1.9, 0, 0);
  }
  // Ricasso binding plates + rivets
  const plate = new THREE.BoxGeometry(0.034, 0.17, 0.15);
  add(plate, mats.darkSteel, 0, 0.21, 0.025);
  const rivet = new THREE.SphereGeometry(0.009, 6, 4);
  for (const [y, z] of [[0.15, -0.02], [0.15, 0.07], [0.27, -0.02], [0.27, 0.07]]) { add(rivet, mats.brass, 0.018, y, z); add(rivet, mats.brass, -0.018, y, z); }
  // Guard block + horn quillons
  add(new THREE.BoxGeometry(0.06, 0.06, 0.22), mats.darkSteel, 0, 0.1, 0.02);
  add(new THREE.CylinderGeometry(0.04, 0.05, 0.04, 8), mats.brass, 0, 0.065, 0);
  const horn = (dir) => sweep([new THREE.Vector3(0, 0.1, 0.1 * dir), new THREE.Vector3(0, 0.12, 0.2 * dir), new THREE.Vector3(0, 0.2, 0.25 * dir), new THREE.Vector3(0, 0.3, 0.24 * dir)], (t) => 0.026 * (1 - t) + 0.003, 7, 14);
  add(horn(1), mats.bone); add(horn(-1), mats.bone);
  // Grip: long two-hand wrap with rings
  add(new THREE.CylinderGeometry(0.019, 0.021, 0.46, 10), mats.leatherDark, 0, -0.16, 0);
  const ring = new THREE.TorusGeometry(0.021, 0.004, 5, 12);
  for (let i = 0; i < 9; i++) add(ring, mats.leather, 0, 0.03 - i * 0.045, 0, Math.PI / 2, 0, 0.3);
  add(new THREE.CylinderGeometry(0.025, 0.025, 0.03, 10), mats.brass, 0, -0.38, 0);
  // Pommel: claw ring
  add(new THREE.TorusGeometry(0.04, 0.011, 6, 14), mats.darkSteel, 0, -0.43, 0, 0, Math.PI / 2, 0);
  add(new THREE.ConeGeometry(0.016, 0.08, 6), mats.bone, 0, -0.5, 0, Math.PI, 0, 0);
  // Edge glow strip (charge VFX): additive ribbon along the cutting edge
  const gpos = [], gidx = [];
  edge.forEach((p, i) => { gpos.push(0, p.y, p.z - 0.006, 0, p.y, p.z + 0.04); if (i) { const a = (i - 1) * 2; gidx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } });
  const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(gpos, 3)); gg.setIndex(gidx);
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xff7a2a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const glow = new THREE.Mesh(gg, glowMat); glow.renderOrder = 5; glow.visible = false;
  const glow2 = glow.clone(); glow2.scale.set(1, 1, 1); glow2.position.x = 0.002; group.add(glow, glow2);
  group.userData.glow = [glow, glow2]; group.userData.glowMat = glowMat;
  // sample points along blade (for hit spheres & trail): base→tip at mid-width
  group.userData.samples = [];
  for (let i = 0; i <= 6; i++) { const s = 0.05 + (i / 6) * 0.9, [z, y] = pt(s, 0.55); group.userData.samples.push(new THREE.Vector3(0, y, z)); }
  group.userData.trailBase = new THREE.Vector3(0, 1.12, 0.07); group.userData.trailTip = new THREE.Vector3(0, BLADE.tip - 0.03, 0.06);
  group.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
  return group;
}
