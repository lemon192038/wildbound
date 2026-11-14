// Molten lava: flat emissive surface at LAVA_Y built only over terrain cells that dip below it (so it shows exactly
// where world.lavaAt() is true), with an animated crust-plate/flow shader. Also lavafall ribbons (same shader, FALL).
// A small FIXED pool of point lights sits over the lava closest to the play area (never added/removed at runtime).

const LAVA_GLSL = `
uniform float uTime, uBoost;
varying vec3 vW; varying float vDepth; varying vec2 vFlow; varying vec2 vUv2;
vec2 lh2(vec2 p){ p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453); }
float lh(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float lvn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(lh(i), lh(i + vec2(1, 0)), f.x), mix(lh(i + vec2(0, 1)), lh(i + vec2(1, 1)), f.x), f.y); }
float lfbm(vec2 p){ return lvn(p) * 0.55 + lvn(p * 2.1 + 3.7) * 0.3 + lvn(p * 4.3 - 1.3) * 0.15; }
vec3 lvoro(vec2 p){
  vec2 i = floor(p), f = fract(p); float f1 = 8.0, f2 = 8.0; float id = 0.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y)); vec2 o = lh2(i + g); vec2 r = g + o - f; float d = dot(r, r);
    if (d < f1) { f2 = f1; f1 = d; id = lh(i + g); } else if (d < f2) f2 = d;
  }
  return vec3(sqrt(f1), sqrt(f2) - sqrt(f1), id);
}
vec3 heatRamp(float t){
  vec3 c = mix(vec3(0.0), vec3(0.35, 0.02, 0.0), smoothstep(0.0, 0.25, t));
  c = mix(c, vec3(1.4, 0.18, 0.01), smoothstep(0.2, 0.5, t));
  c = mix(c, vec3(3.2, 0.95, 0.12), smoothstep(0.45, 0.78, t));
  c = mix(c, vec3(5.0, 3.4, 1.2), smoothstep(0.78, 1.0, t));
  return c;
}
float crustField(vec2 q, float plateScale){
  vec3 v = lvoro(q * plateScale);
  float seam = 1.0 - smoothstep(0.015, 0.16, v.y);           // molten seams between plates
  float n = lfbm(q * 0.55);
  float plateHeat = 0.12 + 0.25 * n * n + 0.15 * step(0.82, v.z); // a few plates still glowing
  return max(seam * (0.75 + 0.25 * n), plateHeat);
}
vec4 lavaShade(vec2 p, vec2 fl, float depth, float plateScale){
  float ph = uTime * 0.16; float t0 = fract(ph), t1 = fract(ph + 0.5);
  float w0 = 1.0 - abs(2.0 * t0 - 1.0);
  vec2 sp = fl * 7.0;
  float c0 = crustField(p - sp * t0, plateScale), c1 = crustField(p - sp * t1 + vec2(17.3, 9.1), plateScale);
  float c = mix(c1, c0, w0);
  // big molten streams slide through the crust
  float sw = lfbm(p * 0.045 - fl * uTime * 0.05 + vec2(uTime * 0.01, 0.0));
  float open = smoothstep(0.42, 0.7, sw) * smoothstep(0.0, 1.4, depth + 0.4);
  float shoreCrust = smoothstep(1.1, 0.05, depth);
  float t = mix(c, max(c, 0.55 + 0.4 * lfbm(p * 0.3 + uTime * 0.2)), open);
  t *= 1.0 - shoreCrust * 0.55;
  t = clamp(t + 0.08 * sin(uTime * 2.3 + p.x * 0.3 + p.y * 0.2), 0.0, 1.0);
  return vec4(heatRamp(t) * uBoost, t);
}
`;

export function createLavaMaterial(THREE, opts = {}) {
  const fall = !!opts.fall;
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uBoost: { value: 1 } }]);
  const mat = new THREE.ShaderMaterial({
    uniforms, fog: true, defines: fall ? { FALL: '' } : {},
    vertexShader: `attribute float aDepth; attribute vec2 aFlow;
varying vec3 vW; varying float vDepth; varying vec2 vFlow; varying vec2 vUv2;
#include <common>
#include <fog_pars_vertex>
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; vDepth = aDepth; vFlow = aFlow; vUv2 = uv;
  vec4 mvPosition = viewMatrix * wp; gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`,
    fragmentShader: `${LAVA_GLSL}
#include <common>
#include <fog_pars_fragment>
void main(){
#ifdef FALL
  // ribbon: u across (0..1), v along the fall (metres); fast, stretched downward flow
  vec2 p = vec2(vUv2.x * vDepth, vUv2.y * 0.35);
  vec4 L = lavaShade(p * vec2(1.0, 1.0), vec2(0.0, -2.4), 1.5, 0.55);
  float edge = smoothstep(0.0, 0.18, vUv2.x) * smoothstep(1.0, 0.82, vUv2.x);
  vec3 col = L.rgb * (0.6 + 0.6 * edge) + vec3(1.2, 0.3, 0.03) * 0.25;
  gl_FragColor = vec4(col, 1.0);
#else
  vec4 L = lavaShade(vW.xz, vFlow, vDepth, 0.26);
  gl_FragColor = vec4(L.rgb, 1.0);
#endif
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`,
  });
  return mat;
}

// flowFn(x,z) -> [fx, fz] (m/s-ish direction scaled by speed)
export function createLava(THREE, scene, terrain, F, flowFn, opts = {}) {
  const { heights, SEG, CELL, HALF, V } = terrain; const LY = F.lavaY;
  const vIndex = new Int32Array(V * V).fill(-1);
  const pos = [], depth = [], flow = [], idx = [];
  const vert = (i, j) => {
    const k = j * V + i; if (vIndex[k] >= 0) return vIndex[k];
    const x = -HALF + i * CELL, z = -HALF + j * CELL;
    const f = flowFn(x, z);
    vIndex[k] = pos.length / 3; pos.push(x, LY, z); depth.push(LY - heights[k]); flow.push(f[0], f[1]);
    return vIndex[k];
  };
  let cells = 0; const cellsList = [];
  for (let j = 0; j < SEG; j++) for (let i = 0; i < SEG; i++) {
    const a = heights[j * V + i], b = heights[(j + 1) * V + i], c = heights[(j + 1) * V + i + 1], d = heights[j * V + i + 1];
    if (Math.min(a, b, c, d) >= LY) continue;
    const ia = vert(i, j), ib = vert(i, j + 1), ic = vert(i + 1, j + 1), id = vert(i + 1, j);
    idx.push(ia, ib, id, ib, ic, id); cells++;
    if (Math.min(a, b, c, d) < LY - 0.6) cellsList.push([-HALF + (i + 0.5) * CELL, -HALF + (j + 0.5) * CELL]);
  }
  const mat = createLavaMaterial(THREE);
  const group = new THREE.Group(); group.name = 'lava';
  let mesh = null;
  if (cells) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aDepth', new THREE.Float32BufferAttribute(depth, 1));
    g.setAttribute('aFlow', new THREE.Float32BufferAttribute(flow, 2));
    g.setIndex(idx); g.computeBoundingSphere();
    mesh = new THREE.Mesh(g, mat); mesh.name = 'lava-surface'; mesh.renderOrder = 1; group.add(mesh);
  }
  scene.add(group);

  // ---- fixed light pool: lava cells closest to the arena, spaced apart ----
  const nLights = opts.lights ?? 4;
  const sorted = cellsList.slice().sort((p, q) => (p[0] ** 2 + p[1] ** 2) - (q[0] ** 2 + q[1] ** 2));
  const picks = [];
  for (const c of sorted) { if (picks.length >= nLights) break; if (picks.every((p) => Math.hypot(p[0] - c[0], p[1] - c[1]) > (opts.lightSpacing || 34))) picks.push(c); }
  const lights = picks.map(([x, z], i) => {
    const L = new THREE.PointLight(0xff5a14, opts.lightIntensity || 260, opts.lightRange || 55, 1.6);
    L.position.set(x, LY + (opts.lightLift || 3), z); L.userData.base = L.intensity; L.userData.ph = i * 1.7; group.add(L); return L;
  });
  // samples for embers / smoke emitters (deterministic subset of lava cells)
  const samples = []; const step = Math.max(1, Math.floor(cellsList.length / 220));
  for (let i = 0; i < cellsList.length; i += step) samples.push(cellsList[i]);

  const mats = [mat];
  function update(time) {
    for (const m of mats) m.uniforms.uTime.value = time;
    for (const L of lights) L.intensity = L.userData.base * (0.82 + 0.12 * Math.sin(time * 2.1 + L.userData.ph) + 0.06 * Math.sin(time * 7.3 + L.userData.ph * 3));
  }
  return { group, mesh, material: mat, lights, samples, cells, update, addMaterial: (m) => mats.push(m) };
}

// A lavafall ribbon hugging the terrain along a path of [x, z] points from the pool up the wall (top first).
export function createLavafall(THREE, getHeight, path, width, mat, lavaY) {
  const pos = [], uv = [], dep = [], idx = []; let acc = 0; const n = path.length;
  for (let i = 0; i < n; i++) {
    const [x, z] = path[i]; const [nx, nz] = path[Math.min(n - 1, i + 1)], [px, pz] = path[Math.max(0, i - 1)];
    let tx = nx - px, tz = nz - pz; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    const sx = -tz, sz = tx; // across
    const w = width * (0.75 + 0.25 * Math.sin(i * 0.7)) * (i === n - 1 ? 1.6 : 1);
    if (i > 0) { const [qx, qz] = path[i - 1]; acc += Math.hypot(x - qx, z - qz, getHeight(x, z) - getHeight(qx, qz)); }
    for (let s = 0; s <= 1; s++) {
      const ox = x + sx * (s - 0.5) * w, oz = z + sz * (s - 0.5) * w;
      const y = Math.max(getHeight(ox, oz), getHeight(x, z)) + 0.45;
      pos.push(ox, i === n - 1 ? lavaY + 0.05 : y, oz); uv.push(s, acc); dep.push(w);
    }
    if (i > 0) { const a = (i - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aDepth', new THREE.Float32BufferAttribute(dep, 1)); g.setAttribute('aFlow', new THREE.Float32BufferAttribute(new Float32Array(dep.length * 2), 2));
  g.setIndex(idx); g.computeBoundingSphere();
  return g;
}
