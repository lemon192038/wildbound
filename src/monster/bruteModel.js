// Gorvath, the Cinderfist — procedural model (original design).
// A colossal knuckle-walking brute: soot-blackened iron-navy armour, massive forearms ending in boulder
// fists, ram-like curled horns over a heavy brow plate, and a club tail. Molten "cinder growths" cling
// to the brow, both fists and the tail club; each growth group has its own material so its heat
// (0 = dull red crust … 1 = white-hot critical) can be driven per part.
// Rig: plain Object3D bones (rigid segments under overlapping armour), +Z forward, +Y up, ground at y=0.
import * as THREE from 'three';

// ---------------------------------------------------------------- noise
function hash3(x, y, z) { let h = (x * 374761393 + y * 668265263 + z * 1274126177) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
  const s = (t) => t * t * (3 - 2 * t), u = s(xf), v = s(yf), w = s(zf);
  const L = (a, b, t) => a + (b - a) * t;
  const c = (dx, dy, dz) => hash3(xi + dx, yi + dy, zi + dz);
  return L(L(L(c(0, 0, 0), c(1, 0, 0), u), L(c(0, 1, 0), c(1, 1, 0), u), v), L(L(c(0, 0, 1), c(1, 0, 1), u), L(c(0, 1, 1), c(1, 1, 1), u), v), w);
}
const fbm = (x, y, z) => vnoise(x, y, z) * 0.55 + vnoise(x * 2.1, y * 2.1, z * 2.1) * 0.28 + vnoise(x * 4.3, y * 4.3, z * 4.3) * 0.17;

// Lumpy ellipsoid: sphere displaced along its normal by fbm (amp in fraction of radius), optional ridged plating.
function lump(rx, ry, rz, { seg = 28, amp = 0.12, freq = 2.2, seed = 0, plates = 0 } = {}) {
  const g = new THREE.SphereGeometry(1, seg, Math.round(seg * 0.75)); const a = g.attributes.position; const v = new THREE.Vector3();
  for (let i = 0; i < a.count; i++) {
    v.fromBufferAttribute(a, i); const n = fbm(v.x * freq + seed, v.y * freq + seed * 1.7, v.z * freq - seed);
    let d = 1 + (n - 0.5) * 2 * amp;
    if (plates) { const p = vnoise(v.x * plates + seed, v.y * plates, v.z * plates); d += Math.floor(Math.max(0, p - 0.45) * 5) * 0.045; } // stepped, overlapping plates // raised plate edges
    a.setXYZ(i, v.x * d * rx, v.y * d * ry, v.z * d * rz);
  }
  g.computeVertexNormals(); return g;
}
// Tapered, curved horn/spike along a curve.
function horn(points, r0, r1, seg = 24, radial = 10) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const g = new THREE.TubeGeometry(curve, seg, 1, radial, false); const a = g.attributes.position;
  const frames = curve.computeFrenetFrames(seg, false); const c = new THREE.Vector3(), v = new THREE.Vector3();
  for (let i = 0; i <= seg; i++) {
    const t = i / seg, r = r0 + (r1 - r0) * t ** 0.9; curve.getPointAt(t, c);
    for (let j = 0; j <= radial; j++) { const k = i * (radial + 1) + j; v.fromBufferAttribute(a, k).sub(c).multiplyScalar(r); a.setXYZ(k, c.x + v.x, c.y + v.y, c.z + v.z); }
  }
  g.computeVertexNormals(); return g;
}

// ---------------------------------------------------------------- textures
function canvasTex(size, draw, srgb = true) { const c = document.createElement('canvas'); c.width = c.height = size; draw(c.getContext('2d'), size); const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t; }
function armourTextures() {
  const S = 512; const img = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S; // tileable-ish noise via torus mapping
    const a = u * Math.PI * 2, b = v * Math.PI * 2;
    img[y * S + x] = fbm(Math.cos(a) * 1.6 + 5, Math.sin(a) * 1.6 + Math.cos(b) * 1.6, Math.sin(b) * 1.6 + 3);
  }
  const map = canvasTex(S, (g) => {
    const d = g.createImageData(S, S);
    for (let i = 0; i < S * S; i++) {
      const n = img[i], soot = Math.max(0, n - 0.55) * 2.2;
      const r = 20 + n * 26 - soot * 14, gg = 23 + n * 28 - soot * 15, bb = 34 + n * 40 - soot * 18; // iron navy, sooty blotches
      d.data.set([r, gg, bb, 255], i * 4);
    }
    g.putImageData(d, 0, 0);
    // scars and scratches
    for (let k = 0; k < 140; k++) {
      const x = Math.random() * S, y = Math.random() * S, a = Math.random() * Math.PI, l = 8 + Math.random() * 40;
      g.strokeStyle = `rgba(${150 + Math.random() * 60},${150 + Math.random() * 60},${170 + Math.random() * 60},${0.08 + Math.random() * 0.18})`; g.lineWidth = 0.6 + Math.random() * 1.2;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
    // ember-scorched seams
    for (let k = 0; k < 40; k++) { const x = Math.random() * S, y = Math.random() * S; const gr = g.createRadialGradient(x, y, 0, x, y, 6 + Math.random() * 18); gr.addColorStop(0, 'rgba(90,30,12,0.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - 30, y - 30, 60, 60); }
  });
  const bump = canvasTex(S, (g) => { const d = g.createImageData(S, S); for (let i = 0; i < S * S; i++) { const n = img[i]; const cell = Math.abs(Math.sin(n * 40)) ** 6; const val = 255 * Math.min(1, n * 0.8 + cell * 0.35); d.data.set([val, val, val, 255], i * 4); } g.putImageData(d, 0, 0); }, false);
  return { map, bump };
}
export function growthTexture() {
  return canvasTex(256, (g, S) => {
    g.fillStyle = '#200600'; g.fillRect(0, 0, S, S);
    // molten veins between crusted cells
    for (let k = 0; k < 220; k++) {
      const x = Math.random() * S, y = Math.random() * S, r = 4 + Math.random() * 14;
      const gr = g.createRadialGradient(x, y, r * 0.2, x, y, r); gr.addColorStop(0, 'rgba(40,8,0,1)'); gr.addColorStop(0.7, 'rgba(70,14,2,0.9)'); gr.addColorStop(1, 'rgba(255,190,90,0.95)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
  });
}

// ---------------------------------------------------------------- model
export function buildBrute() {
  const root = new THREE.Group(); root.name = 'GorvathRig';
  const { map, bump } = armourTextures();
  map.repeat.set(3, 3); bump.repeat.set(3, 3);
  const armour = new THREE.MeshStandardMaterial({ map, bumpMap: bump, bumpScale: 1.4, color: 0xc8d2ff, roughness: 0.42, metalness: 0.55 });
  const armourDark = armour.clone(); armourDark.color = new THREE.Color(0x9aa0b0); armourDark.roughness = 0.6;
  const horny = new THREE.MeshStandardMaterial({ color: 0x1b1a1e, roughness: 0.35, metalness: 0.3, bumpMap: bump, bumpScale: 1.5 });
  const claw = new THREE.MeshStandardMaterial({ color: 0x0e0d10, roughness: 0.3, metalness: 0.2 });
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: new THREE.Color(1, 0.55, 0.15), emissiveIntensity: 3 });
  const gTex = growthTexture();
  const growthMat = () => new THREE.MeshStandardMaterial({ color: 0x2a0b04, roughness: 0.55, metalness: 0.0, emissive: new THREE.Color(1, 0.3, 0.06), emissiveMap: gTex, emissiveIntensity: 0.9, bumpMap: gTex, bumpScale: 2 });

  const B = {};
  const bone = (name, parent, p) => { const o = new THREE.Object3D(); o.name = name; o.position.set(...p); (parent ? B[parent] : root).add(o); B[name] = o; o.userData.rest = o.position.clone(); return o; };
  const meshes = [];
  const add = (boneName, geo, mat, p = [0, 0, 0], r = [0, 0, 0], s = 1) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(...p); m.rotation.set(...r); if (typeof s === 'number') m.scale.setScalar(s); else m.scale.set(...s);
    m.castShadow = true; m.receiveShadow = true; B[boneName].add(m); meshes.push(m); return m;
  };

  // skeleton
  bone('root', null, [0, 4.0, 0]);
  bone('chest', 'root', [0, 1.6, 2.6]);
  bone('neck', 'chest', [0, 0.35, 2.0]);
  bone('head', 'neck', [0, -0.3, 1.5]);
  bone('jaw', 'head', [0, -0.6, 0.35]);
  for (const [s, k] of [['L', 1], ['R', -1]]) {
    bone('shoulder' + s, 'chest', [2.15 * k, 0.25, 0.6]);
    bone('elbow' + s, 'shoulder' + s, [0.45 * k, -2.35, 0.65]);
    bone('fist' + s, 'elbow' + s, [0.15 * k, -2.45, 0.45]);
    bone('hip' + s, 'root', [1.45 * k, -0.3, -0.5]);
    bone('knee' + s, 'hip' + s, [0.2 * k, -2.0, 0.85]);
    bone('foot' + s, 'knee' + s, [0, -1.75, -0.65]);
  }
  bone('tail1', 'root', [0, 0.15, -1.9]); bone('tail2', 'tail1', [0, -0.35, -2.0]); bone('tail3', 'tail2', [0, -0.45, -2.0]); bone('tail4', 'tail3', [0, -0.35, -1.8]);

  // torso
  add('root', lump(2.5, 2.0, 3.4, { seed: 1, amp: 0.06, plates: 3 }), armour, [0, 0.65, 1.0], [-0.25, 0, 0]);
  add('chest', lump(3.0, 2.3, 2.4, { seed: 2, amp: 0.06, plates: 3 }), armour, [0, 0.1, 0.1], [-0.15, 0, 0]);
  add('chest', lump(2.1, 1.3, 1.6, { seed: 9, amp: 0.15 }), armourDark, [0, -1.25, 0.7]); // hanging chest mass
  // dorsal armour ridge: overlapping swept plates
  for (let i = 0; i < 9; i++) {
    const t = i / 8; const bn = t < 0.5 ? 'chest' : 'root';
    const z = t < 0.5 ? 1.2 - t * 4.6 : 2.2 - (t - 0.5) * 6.5, y = t < 0.5 ? 2.05 - t * 0.6 : 2.25 - (t - 0.5) * 1.6;
    const h = 2.6 - Math.abs(t - 0.35) * 2.2;
    for (const side of [-1, 1]) add(bn, new THREE.ConeGeometry(0.7, h, 5), horny, [side * (0.6 + t * 0.2), y + 0.2, z], [-0.85, 0, side * 0.4], [1, 1, 0.45]);
  }
  // neck & head
  add('neck', lump(1.25, 1.15, 1.5, { seed: 3, amp: 0.12, plates: 4 }), armour, [0, 0, 0.5], [-0.3, 0, 0]);
  add('head', lump(1.2, 0.95, 1.8, { seed: 4, amp: 0.07, plates: 4 }), armour, [0, 0, 0.6]);
  add('head', lump(1.25, 0.55, 1.1, { seed: 5, amp: 0.18, plates: 5 }), armourDark, [0, 0.7, 0.35], [-0.25, 0, 0]); // brow plate
  add('jaw', lump(0.95, 0.5, 1.3, { seed: 6, amp: 0.1 }), armourDark, [0, -0.1, 0.55]);
  for (const s of [-1, 1]) {
    add('head', horn([[0.6 * s, 0.6, 0.2], [1.5 * s, 1.1, -0.4], [2.0 * s, 0.4, -1.1], [1.7 * s, -0.5, -0.6], [1.2 * s, -0.4, 0.1]], 0.48, 0.12), horny); // curled ram horn
    add('head', new THREE.SphereGeometry(0.12, 10, 8), eyeMat, [0.62 * s, 0.25, 1.35]);
    for (let t = 0; t < 4; t++) add('jaw', new THREE.ConeGeometry(0.07, 0.35, 5), claw, [0.55 * s - s * t * 0.13, 0.25, 1.2 + t * 0.12], [Math.PI, 0, 0]);
  }
  // arms: massive forearms, boulder fists
  for (const [s, k] of [['L', 1], ['R', -1]]) {
    add('shoulder' + s, lump(1.25, 1.1, 1.25, { seed: 10 + k, amp: 0.12, plates: 3 }), armour, [0.1 * k, 0.1, 0]); // pauldron mass
    add('shoulder' + s, lump(0.85, 1.4, 0.9, { seed: 12 + k, amp: 0.1 }), armour, [0.25 * k, -1.2, 0.35], [0.25, 0, 0.15 * k]);
    add('shoulder' + s, new THREE.ConeGeometry(0.6, 2.4, 5), horny, [0.85 * k, 0.9, -0.2], [-0.45, 0, -0.75 * k]);
    add('elbow' + s, lump(1.2, 1.95, 1.25, { seed: 14 + k, amp: 0.08, plates: 3 }), armour, [0.08 * k, -1.15, 0.2], [0.18, 0, 0]); // huge forearm
    for (let i = 0; i < 3; i++) add('elbow' + s, new THREE.ConeGeometry(0.42, 1.9 - i * 0.3, 5), horny, [0.85 * k, -0.3 - i * 0.75, -0.55], [-1.25, 0, -0.95 * k]);
    add('fist' + s, lump(1.35, 1.05, 1.4, { seed: 16 + k, amp: 0.08, plates: 4 }), armourDark, [0, 0, 0.1]);
    for (let i = 0; i < 4; i++) add('fist' + s, new THREE.ConeGeometry(0.16, 0.6, 5), claw, [(-0.6 + i * 0.4) * k, -0.8, 1.05], [1.9, 0, 0]);
    // legs
    add('hip' + s, lump(1.15, 1.45, 1.35, { seed: 20 + k, amp: 0.12, plates: 3 }), armour, [0.1 * k, -0.9, 0.35]);
    add('knee' + s, lump(0.7, 1.1, 0.75, { seed: 22 + k, amp: 0.12 }), armour, [0, -0.85, -0.3], [-0.35, 0, 0]);
    add('foot' + s, lump(0.75, 0.38, 1.05, { seed: 24 + k, amp: 0.1 }), armourDark, [0, 0.15, 0.45]);
    for (let i = 0; i < 3; i++) add('foot' + s, new THREE.ConeGeometry(0.13, 0.55, 5), claw, [(-0.38 + i * 0.38), -0.02, 1.4], [Math.PI / 2 + 0.3, 0, 0]);
  }
  // tail
  add('tail1', lump(1.3, 1.2, 1.4, { seed: 30, amp: 0.12, plates: 3 }), armour, [0, -0.1, -0.9]);
  add('tail2', lump(1.0, 0.95, 1.3, { seed: 31, amp: 0.12, plates: 3 }), armour, [0, -0.2, -0.95]);
  add('tail3', lump(0.75, 0.75, 1.2, { seed: 32, amp: 0.12, plates: 3 }), armour, [0, -0.2, -0.9]);
  add('tail4', lump(1.15, 1.0, 1.35, { seed: 33, amp: 0.18, plates: 4 }), armourDark, [0, -0.1, -0.7]); // club
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; add('tail4', new THREE.ConeGeometry(0.22, 0.9, 5), horny, [Math.cos(a) * 0.95, Math.sin(a) * 0.85, -0.8], [Math.sin(a) * 1.2, 0, -Math.cos(a) * 1.2]); }
  for (const [bn, i] of [['tail1', 0], ['tail2', 1], ['tail3', 2]]) add(bn, new THREE.ConeGeometry(0.4 - i * 0.08, 1.1 - i * 0.2, 5), horny, [0, 0.9 - i * 0.15, -0.8], [-1.1, 0, 0]);

  // cinder growths (per part group; each group has its own material for heat)
  const growths = {};
  const growth = (part, boneName, spots) => {
    const mat = growthMat(); const grp = new THREE.Group(); grp.name = 'growth_' + part; B[boneName].add(grp);
    spots.forEach(([p, r, sc], i) => { const m = new THREE.Mesh(lump(...sc.map((v) => v * r), { seed: 40 + i * 3 + part.length, amp: 0.3, freq: 3, seg: 18 }), mat); m.position.set(...p); m.castShadow = true; grp.add(m); });
    growths[part] = { group: grp, mat, bone: boneName };
  };
  growth('head', 'head', [[[0, 1.05, 0.55], 0.8, [1.2, 0.55, 1.0]], [[0.55, 0.85, 1.0], 0.5, [1, 0.8, 1]], [[-0.55, 0.85, 1.0], 0.5, [1, 0.8, 1]], [[0, 0.75, 1.45], 0.45, [1.1, 0.8, 0.9]]]);
  for (const [s, k] of [['L', 1], ['R', -1]]) growth('fist' + s, 'fist' + s, [[[0, 0.25, 0.7], 1.05, [1.15, 0.95, 0.85]], [[0.55 * k, 0.7, 0.2], 0.6, [1, 0.9, 1]], [[-0.4 * k, -0.15, 0.95], 0.55, [1, 0.8, 0.8]], [[0.15 * k, 0.85, -0.4], 0.5, [1, 0.8, 1]]]);
  growth('tail', 'tail4', [[[0, 0.55, -0.75], 0.85, [1.1, 0.8, 1.2]], [[0.6, -0.1, -1.1], 0.5, [1, 1, 1]], [[-0.6, -0.1, -1.1], 0.5, [1, 1, 1]]]);

  return { root, B, growths, meshes, eyeMat, materials: { armour, armourDark, horny } };
}
