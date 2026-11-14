// Field set pieces: steaming hot-spring pools (all fields), the broken arch bridge + lava-tube ribs (wastes),
// cavern roof with oculus, light shaft and lavafalls (hollow).
import { makeNoise2D, mulberry32, smoothstep } from './noise.js';
import { createWaterNormal } from './textures.js';
import { createLavaMaterial, createLavafall } from './lava.js';

export function createLandmarks(THREE, scene, F, terrain, mats, opts = {}) {
  const G = terrain.getHeight; const group = new THREE.Group(); group.name = 'landmarks'; scene.add(group);
  const colliders = []; const N = makeNoise2D(opts.seed + 404); const rnd = mulberry32(opts.seed + 99);
  const updaters = []; const emitters = []; const lavaMats = [];

  // ---------- hot springs ----------
  const wn = createWaterNormal(THREE, 9, 128);
  const discs = [];
  for (const s of F.springs) {
    const c = new THREE.CircleGeometry(s.r * 1.08, 40); c.rotateX(-Math.PI / 2);
    const p = c.attributes.position, uv = c.attributes.uv;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i) + s.x, z = p.getZ(i) + s.z; p.setXYZ(i, x, s.level, z); uv.setXY(i, x * 0.18, z * 0.18); }
    discs.push(c);
    emitters.push({ kind: 'steam', x: s.x, y: s.level + 0.2, z: s.z, rate: 2.2, spread: s.r * 1.2, scale: 1.4 });
  }
  if (discs.length) {
    const { mergeGeometries } = opts.utils;
    const water = new THREE.Mesh(mergeGeometries(discs), new THREE.MeshStandardMaterial({ color: 0x2e8f8a, roughness: 0.08, metalness: 0.0, transparent: true, opacity: 0.86, normalMap: wn, normalScale: new THREE.Vector2(0.35, 0.35), emissive: 0x0b3a36, emissiveIntensity: 0.6 }));
    water.name = 'hot-springs'; water.renderOrder = 2; group.add(water);
    updaters.push((t) => { wn.offset.set(t * 0.02, t * 0.013); });
  }
  const waterHeightAt = (x, z) => { for (const s of F.springs) if ((x - s.x) ** 2 + (z - s.z) ** 2 < (s.r * 1.08) ** 2) return s.level; return null; };

  // ---------- wastes: broken natural arch bridge + collapsed lava-tube ribs ----------
  if (F.id === 'wastes') {
    const { a, r0, r1, gap } = F.bridge; const dx = Math.cos(a), dz = Math.sin(a);
    const yA = G(dx * r0, dz * r0) + 0.6, yB = G(dx * r1, dz * r1) + 0.6;
    const half = (ra, rb, closeEnd) => {
      const SEGS = 22, RING = 10; const pos = [], idx = [];
      for (let i = 0; i <= SEGS; i++) {
        const t = i / SEGS, r = ra + (rb - ra) * t; const u = (r - r0) / (r1 - r0);
        const top = yA + (yB - yA) * u + 3.5 * Math.sin(Math.PI * u);
        const root = Math.min(smoothstep(0.18, 0.0, u), 1) + smoothstep(0.82, 1.0, u);
        const w = 6.5 + 5 * root + 1.2 * N.noise(r * 0.2, 1), th = 3.6 + 11 * root + 1.0 * N.noise(r * 0.3, 4);
        const endK = closeEnd && i === SEGS ? 0.15 : closeEnd && i === SEGS - 1 ? 0.7 : 1;
        for (let k = 0; k < RING; k++) {
          const ang = (k / RING) * Math.PI * 2; const ca = Math.cos(ang), sa = Math.sin(ang);
          const jag = 1 + 0.3 * N.noise(r * 0.35 + k * 0.7, k * 1.7) + 0.12 * N.noise(r * 1.3, k) + (closeEnd && i >= SEGS - 1 ? 0.35 * (rnd() - 0.5) : 0);
          const across = ca * w * 0.5 * jag * endK, vert = (sa > 0 ? sa * 0.9 : sa * th) * jag * endK;
          pos.push(dx * r - dz * across, top - 0.9 + vert, dz * r + dx * across);
        }
        if (i > 0) for (let k = 0; k < RING; k++) { const A = (i - 1) * RING + k, Bq = (i - 1) * RING + (k + 1) % RING, Cq = i * RING + k, D = i * RING + (k + 1) % RING; idx.push(A, Cq, Bq, Bq, Cq, D); }
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
    };
    const parts = [half(r0 - 6, gap[0], true), half(r1 + 6, gap[1], true)];
    // fallen chunks of the span, half sunk in the lava below the gap
    for (let i = 0; i < 3; i++) { const rr = gap[0] + (gap[1] - gap[0]) * (i / 2) + (rnd() - 0.5) * 3; const ch = new THREE.IcosahedronGeometry(2 + rnd() * 1.5, 1); ch.scale(1.3, 0.8, 1); ch.translate(dx * rr + (rnd() - 0.5) * 4, F.lavaY + 0.2, dz * rr + (rnd() - 0.5) * 4); ch.deleteAttribute('uv'); parts.push(ch.toNonIndexed()); }
    const mg = opts.utils.mergeGeometries(parts.map((q) => (q.index ? q.toNonIndexed() : q)));
    mg.computeVertexNormals();
    const bridge = new THREE.Mesh(mg, mats.rock); bridge.castShadow = true; bridge.receiveShadow = true; bridge.name = 'arch-bridge'; group.add(bridge);
    for (const rr of [57, 61]) colliders.push({ x: dx * rr, z: dz * rr, r: 3.2 });
    // lava-tube ribs: remnants of the collapsed roofs arching over the trenches
    const ribs = [];
    for (const tube of F.tubes) {
      for (let s = 12; s < tube.total - 10; s += 16 + rnd() * 10) {
        let px = 0, pz = 0, tx = 1, tz = 0; let acc = 0;
        for (let i = 0; i < tube.pts.length - 1; i++) { const [ax, az] = tube.pts[i], [bx, bz] = tube.pts[i + 1]; const l = Math.hypot(bx - ax, bz - az); if (acc + l >= s) { const t = (s - acc) / l; px = ax + (bx - ax) * t; pz = az + (bz - az) * t; tx = (bx - ax) / l; tz = (bz - az) / l; break; } acc += l; }
        if (rnd() < 0.3) continue;
        const R = 5.5 + rnd() * 1.5; const tor = new THREE.TorusGeometry(R, 1.3 + rnd() * 0.8, 6, 14, Math.PI * (0.75 + rnd() * 0.25));
        const p = tor.attributes.position; for (let k = 0; k < p.count; k++) p.setXYZ(k, p.getX(k) * (1 + 0.15 * N.noise(k * 0.3, s)), p.getY(k), p.getZ(k));
        tor.rotateY(Math.atan2(tx, tz)); // ring plane spans across the trench
        tor.translate(px, G(px, pz) - 1.5, pz); tor.deleteAttribute('uv'); ribs.push(tor.toNonIndexed());
      }
    }
    if (ribs.length) { const rm = new THREE.Mesh(opts.utils.mergeGeometries(ribs), mats.rock); rm.geometry.computeVertexNormals(); rm.castShadow = true; rm.receiveShadow = true; rm.name = 'lava-tube-ribs'; group.add(rm); }
  }

  // ---------- hollow: roof + oculus, light shaft, lavafalls ----------
  if (F.cave) {
    const R = F.roof; const AS = opts.low ? 56 : 84, RS = opts.low ? 18 : 28;
    const pos = [], idx = [];
    for (let j = 0; j <= RS; j++) {
      for (let i = 0; i <= AS; i++) {
        const a = (i / AS) * Math.PI * 2; const ca = Math.cos(a), sa = Math.sin(a);
        const inner = R.oculus + 3.5 * N.noise(ca * 2 + 3, sa * 2) + 1.5 * N.noise(ca * 6, sa * 6 + 2);
        const t = j / RS; const r = inner + (R.edge + 6 - inner) * Math.pow(t, 1.15);
        const base = F.roofY(Math.max(r, R.oculus));
        const lump = N.ridged(ca * r * 0.03 + 7, sa * r * 0.03 - 2, 4, 2, 0.5) * 7 + N.fbm(ca * r * 0.1, sa * r * 0.1, 2) * 2;
        const lip = j === 0 ? 2.5 : 0;
        pos.push(ca * r, base - lump * smoothstep(0, 0.12, t) + lip, sa * r);
      }
    }
    for (let j = 0; j < RS; j++) for (let i = 0; i < AS; i++) { const a = j * (AS + 1) + i, b = a + 1, c = a + AS + 1, d = c + 1; idx.push(a, c, b, b, c, d); } // winding -> normals face down into the cavern
    // inner rim thickness (so the oculus edge reads as rock, not paper)
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    const roof = new THREE.Mesh(g, mats.rock); roof.castShadow = true; roof.receiveShadow = true; roof.name = 'cavern-roof'; group.add(roof);
    // light shaft through the oculus (along -sunDir)
    const sd = opts.sunDir; const topY = R.apex + 2, k = topY / sd.y;
    const shaftGeo = new THREE.CylinderGeometry(R.oculus * 0.9, R.oculus * 1.25, k, 24, 1, true);
    shaftGeo.translate(0, -k / 2, 0);
    const shaftMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uCol: { value: new THREE.Color(...F.light.sunCol).multiplyScalar(0.5) } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: `varying vec3 vN; varying vec3 vV; varying float vY; varying vec3 vW;
void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz); vY = uv.y; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform float uTime; uniform vec3 uCol; varying vec3 vN; varying vec3 vV; varying float vY; varying vec3 vW;
float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
void main(){
  float edge = pow(abs(dot(normalize(vN), vV)), 1.5);
  float n = vn(vec2(atan(vW.z, vW.x) * 6.0, vW.y * 0.08 - uTime * 0.05)) * 0.6 + vn(vec2(atan(vW.z, vW.x) * 17.0, vW.y * 0.2 + uTime * 0.1)) * 0.4;
  float a = edge * (0.35 + 0.65 * n) * smoothstep(0.0, 0.15, vY) * smoothstep(1.0, 0.75, vY) * 0.22;
  gl_FragColor = vec4(uCol * a, a);
}`,
    });
    const shaft = new THREE.Mesh(shaftGeo, shaftMat);
    shaft.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), sd.clone());
    shaft.position.set(0, topY, 0); // top centred on the oculus
    shaft.renderOrder = 8; shaft.name = 'light-shaft'; group.add(shaft);
    updaters.push((t) => { shaftMat.uniforms.uTime.value = t; });
    // lavafalls from the alcove walls into the pools
    const fallMat = createLavaMaterial(THREE, { fall: true }); fallMat.side = THREE.DoubleSide; lavaMats.push(fallMat);
    const fallGeos = [];
    for (const al of F.alcoves) {
      for (const off of [-0.06, 0.07]) {
        const ca = Math.cos(Math.atan2(al.cz, al.cx) + off), sa = Math.sin(Math.atan2(al.cz, al.cx) + off);
        let rb = al.r; while (G(ca * rb, sa * rb) < F.lavaY + 0.2 && rb < al.r + 40) rb += 0.5; // back shore of the pool
        let rt = rb; while (G(ca * rt, sa * rt) < 55 && rt < rb + 30) rt += 0.5;
        const path = []; for (let r = rt; r >= rb - 0.5; r -= 0.7) path.push([ca * r, sa * r]); path.push([ca * (rb - 2.5), sa * (rb - 2.5)]);
        if (path.length > 3) fallGeos.push(createLavafall(THREE, G, path, 7 + rnd() * 3, fallMat, F.lavaY));
        emitters.push({ kind: 'smoke', x: ca * (rb - 2), y: F.lavaY + 0.5, z: sa * (rb - 2), rate: 1.6, spread: 4, scale: 1.6 });
        emitters.push({ kind: 'mist', x: ca * (rb - 3), y: F.lavaY + 2, z: sa * (rb - 3), rate: 0.25, spread: 6, scale: 1.4 });
      }
    }
    if (fallGeos.length) { const fm = new THREE.Mesh(opts.utils.mergeGeometries(fallGeos), fallMat); fm.name = 'lavafalls'; fm.renderOrder = 1; group.add(fm); }
  }
  return { group, colliders, waterHeightAt, updaters, emitters, lavaMats, update(t) { for (const u of updaters) u(t); } };
}
