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

// ---------------------------------------------------------------- other weapon classes (src/shared/weaponClasses.js)
// Same local convention: grip (main hand) at origin, striking part toward +Y, edge / face toward +Z.
// userData: samples (hit points base→tip), trailBase / trailTip, glow meshes + glowMat (charge glow), hitPad (extra reach),
// hand: 'R' | 'L' (which hand holds it when drawn), back: [x, y, z] extra offset on the back socket.
function bladeShape(len, width, { y0 = 0.1, curve = 0, tipLen = 0.18 } = {}) {
  const sh = new THREE.Shape(); const N = 10;
  const zAt = (y) => curve * Math.pow((y - y0) / (len - y0), 2);
  sh.moveTo(-width * 0.35 + zAt(y0), y0);
  for (let i = 1; i <= N; i++) { const y = y0 + (len - tipLen - y0) * (i / N); sh.lineTo(-width * 0.35 + zAt(y), y); }
  sh.lineTo(zAt(len), len);
  for (let i = N; i >= 0; i--) { const y = y0 + (len - tipLen - y0) * (i / N); sh.lineTo(width * 0.65 + zAt(y), y); }
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.014, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 1, steps: 1 });
  g.translate(0, 0, -0.007); g.rotateY(-Math.PI / 2); g.computeVertexNormals();
  return g;
}
function finish(group, samples, base, tip, glowColor = 0xff7a2a) {
  const glowMat = new THREE.MeshBasicMaterial({ color: glowColor, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const gg = new THREE.PlaneGeometry(0.05, Math.max(0.2, tip.y - base.y)); gg.rotateY(Math.PI / 2); gg.translate(0, (tip.y + base.y) / 2, (tip.z + base.z) / 2 + 0.02);
  const glow = new THREE.Mesh(gg, glowMat); glow.visible = false; group.add(glow);
  Object.assign(group.userData, { samples, trailBase: base, trailTip: tip, glow: [glow], glowMat });
  group.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = true; } });
  return group;
}
const line = (y0, y1, z = 0, n = 7) => Array.from({ length: n }, (_, i) => new THREE.Vector3(0, y0 + (y1 - y0) * (i / (n - 1)), z));

export function buildClassWeapon(cls, mats) {
  const mk = (geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); return m; };
  const out = { main: null, off: null, shield: null };
  if (cls === 'sword' || cls === 'dual') {
    const one = (len) => {
      const g = new THREE.Group(); g.name = cls;
      g.add(mk(bladeShape(len, 0.07, { curve: cls === 'dual' ? 0.05 : 0 }), mats.blade));
      g.add(mk(new THREE.BoxGeometry(0.04, 0.035, 0.2), mats.darkSteel, 0, 0.08, 0.01));
      g.add(mk(new THREE.CylinderGeometry(0.017, 0.019, 0.16, 8), mats.leatherDark, 0, 0, 0));
      g.add(mk(new THREE.SphereGeometry(0.025, 8, 6), mats.brass, 0, -0.09, 0));
      return finish(g, line(0.16, len - 0.05, 0.01), new THREE.Vector3(0, 0.2, 0.01), new THREE.Vector3(0, len - 0.02, 0.01), 0xffc070);
    };
    out.main = one(cls === 'dual' ? 0.66 : 0.86);
    if (cls === 'dual') { out.off = one(0.66); out.off.userData.hand = 'L'; }
    if (cls === 'sword') {
      const sh = new THREE.Group(); sh.name = 'shield';
      const disc = new THREE.CylinderGeometry(0.27, 0.29, 0.04, 20); disc.rotateX(Math.PI / 2);
      sh.add(mk(disc, mats.darkSteel)); sh.add(mk(new THREE.SphereGeometry(0.07, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), mats.brass, 0, 0, 0.02, Math.PI / 2, 0, 0));
      const rim = new THREE.TorusGeometry(0.28, 0.018, 6, 24); sh.add(mk(rim, mats.bone));
      sh.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
      out.shield = sh;
    }
  } else if (cls === 'longsword') {
    const g = new THREE.Group(); g.name = 'longsword';
    g.add(mk(bladeShape(1.45, 0.05, { y0: 0.12, curve: 0.09, tipLen: 0.14 }), mats.blade));
    const guard = new THREE.CylinderGeometry(0.055, 0.055, 0.015, 12); g.add(mk(guard, mats.brass, 0, 0.1, 0));
    g.add(mk(new THREE.CylinderGeometry(0.018, 0.02, 0.4, 8), mats.leatherDark, 0, -0.1, 0));
    out.main = finish(g, line(0.25, 1.38, 0.03), new THREE.Vector3(0, 0.6, 0.02), new THREE.Vector3(0, 1.42, 0.08), 0xff4030);
  } else if (cls === 'hammer') {
    const g = new THREE.Group(); g.name = 'hammer';
    g.add(mk(new THREE.CylinderGeometry(0.025, 0.03, 1.45, 8), mats.leatherDark, 0, 0.32, 0));
    const head = new THREE.CylinderGeometry(0.17, 0.19, 0.5, 10); head.rotateX(Math.PI / 2);
    g.add(mk(head, mats.darkSteel, 0, 1.05, 0.03)); g.add(mk(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 10), mats.brass, 0, 1.05, 0.28, Math.PI / 2, 0, 0));
    g.add(mk(new THREE.ConeGeometry(0.08, 0.2, 6), mats.bone, 0, 1.05, -0.3, -Math.PI / 2, 0, 0));
    out.main = finish(g, [new THREE.Vector3(0, 0.7, 0), new THREE.Vector3(0, 0.85, 0.05), new THREE.Vector3(0, 0.98, 0.15), new THREE.Vector3(0, 1.05, 0.25), new THREE.Vector3(0, 1.1, 0.15), new THREE.Vector3(0, 1.05, 0.0), new THREE.Vector3(0, 1.05, 0.3)],
      new THREE.Vector3(0, 0.9, 0.2), new THREE.Vector3(0, 1.1, 0.3), 0xffa040);
    out.main.userData.hitPad = 0.22;
  } else if (cls === 'lance') {
    const g = new THREE.Group(); g.name = 'lance';
    g.add(mk(new THREE.ConeGeometry(0.075, 2.3, 10), mats.steel, 0, 1.35, 0));
    g.add(mk(new THREE.ConeGeometry(0.16, 0.3, 10, 1, true), mats.darkSteel, 0, 0.22, 0, Math.PI, 0, 0));
    g.add(mk(new THREE.CylinderGeometry(0.022, 0.024, 0.32, 8), mats.leatherDark, 0, -0.04, 0));
    out.main = finish(g, line(0.7, 2.45, 0), new THREE.Vector3(0, 1.4, 0), new THREE.Vector3(0, 2.45, 0), 0xc0d8ff);
    out.main.userData.hitPad = 0.08;
    const sh = new THREE.Group(); sh.name = 'tower-shield';
    sh.add(mk(new THREE.BoxGeometry(0.62, 1.0, 0.05), mats.darkSteel)); sh.add(mk(new THREE.BoxGeometry(0.5, 0.86, 0.02), mats.steel, 0, 0, 0.03));
    sh.add(mk(new THREE.BoxGeometry(0.06, 0.9, 0.03), mats.brass, 0, 0, 0.05));
    sh.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
    out.shield = sh;
  } else if (cls === 'bow') {
    const g = new THREE.Group(); g.name = 'bow';
    const limb = (s) => sweep([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, s * 0.35, 0.04), new THREE.Vector3(0, s * 0.62, 0.0), new THREE.Vector3(0, s * 0.78, -0.12)], (t) => 0.024 * (1 - t * 0.6), 6, 14);
    g.add(mk(limb(1), mats.bone), mk(limb(-1), mats.bone));
    g.add(mk(new THREE.CylinderGeometry(0.026, 0.026, 0.16, 8), mats.leatherDark));
    const sg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.78, -0.12), new THREE.Vector3(0, 0, -0.12), new THREE.Vector3(0, -0.78, -0.12)]);
    const string = new THREE.Line(sg, new THREE.LineBasicMaterial({ color: 0xe8e0c8 })); g.add(string); g.userData.string = string;
    out.main = finish(g, [new THREE.Vector3(0, 0, 0)], new THREE.Vector3(0, 0.6, 0), new THREE.Vector3(0, 0.78, -0.1), 0x9fe0ff);
    out.main.userData.hand = 'L';
  }
  return out;
}
