// Shared waterfall (user request: better water / waterfall look). A curved ribbon whose shader layers three scrolling
// streak fields (fast core, slower sheets, broken spray at the edges), a white churn at the lip and at the base, a soft
// translucent body and a foam pool + mist where it lands. Used by the field cliff (src/world/landmarks.js) and the
// island's coastal cliffs (src/world/island/island.js).
export function waterfallMaterial(THREE, uniforms) {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, uniforms]), fog: true, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `varying vec2 vUv; varying float vLen;
#include <fog_pars_vertex>
attribute float aLen;
void main(){ vUv = uv; vLen = aLen; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition;
#include <fog_vertex>
}`,
    fragmentShader: `uniform float uTime; varying vec2 vUv; varying float vLen;
#include <fog_pars_fragment>
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
void main(){
  float y = vUv.y * vLen; // metres down the fall
  float core = vn(vec2(vUv.x * 14.0, y * 0.9 - uTime * 7.0)) * 0.55 + vn(vec2(vUv.x * 31.0, y * 2.4 - uTime * 11.0)) * 0.45;
  float sheet = vn(vec2(vUv.x * 5.0 + sin(y * 0.3) * 0.4, y * 0.35 - uTime * 3.2));
  float streak = smoothstep(0.35, 0.9, core) * 0.7 + smoothstep(0.4, 0.8, sheet) * 0.4;
  float edgeN = vn(vec2(y * 0.8 - uTime * 4.0, vUv.x * 3.0)) * 0.22;
  float edge = smoothstep(0.0, 0.16 + edgeN, vUv.x) * smoothstep(1.0, 0.84 - edgeN, vUv.x);
  float lip = 1.0 - smoothstep(0.0, 0.06, vUv.y), base = smoothstep(0.82, 1.0, vUv.y);
  float churn = clamp(lip * 0.9 + base * (0.6 + 0.4 * vn(vec2(vUv.x * 20.0, uTime * 5.0))), 0.0, 1.0);
  vec3 deep = vec3(0.16, 0.30, 0.34), white = vec3(0.96, 0.98, 1.0);
  vec3 c = mix(deep, white, clamp(streak + churn, 0.0, 1.0));
  float a = edge * clamp(0.38 + streak * 0.6 + churn, 0.0, 1.0);
  gl_FragColor = vec4(c * 1.08, a * 0.94);
  #include <fog_fragment>
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,
  });
}
// a fall from (x, top, z) down to `bottom`, falling outward along (dx, dz); width w
export function buildWaterfall(THREE, { x, z, top, bottom, dx = 1, dz = 0, w = 4, uniforms }) {
  const group = new THREE.Group(); group.name = 'waterfall';
  const len = top - bottom, SY = 22, SX = 4; const l = Math.hypot(dx, dz) || 1; const fx = dx / l, fz = dz / l, sx = -fz, sz = fx;
  const pos = [], uv = [], lens = [], idx = [];
  for (let j = 0; j <= SY; j++) {
    const t = j / SY; const yy = top - len * t; const out = Math.sin(t * Math.PI * 0.5) * Math.min(4, len * 0.12) + t * 0.6;
    for (let i = 0; i <= SX; i++) { const s = (i / SX - 0.5) * w * (1 + t * 0.4); pos.push(x + fx * out + sx * s, yy, z + fz * out + sz * s); uv.push(i / SX, t); lens.push(len); }
  }
  for (let j = 0; j < SY; j++) for (let i = 0; i < SX; i++) { const a = j * (SX + 1) + i, b = a + 1, c = a + SX + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('aLen', new THREE.Float32BufferAttribute(lens, 1)); g.setIndex(idx); g.computeBoundingSphere();
  const fall = new THREE.Mesh(g, waterfallMaterial(THREE, uniforms)); fall.renderOrder = 2; fall.frustumCulled = false; group.add(fall);
  // foam pool where it lands
  const poolMat = new THREE.ShaderMaterial({ uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, uniforms]), fog: true, transparent: true, depthWrite: false,
    vertexShader: `varying vec2 vUv;\n#include <fog_pars_vertex>\nvoid main(){ vUv = uv; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition;\n#include <fog_vertex>\n}`,
    fragmentShader: `uniform float uTime; varying vec2 vUv;\n#include <fog_pars_fragment>\nfloat h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }\nfloat vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
void main(){ vec2 p = vUv - 0.5; float r = length(p) * 2.0; float ring = vn(vec2(atan(p.y, p.x) * 3.0, r * 6.0 - uTime * 2.0)); float a = (1.0 - smoothstep(0.4, 1.0, r)) * (0.35 + 0.65 * smoothstep(0.3, 0.8, ring)); gl_FragColor = vec4(vec3(0.95), a * 0.85);
#include <fog_fragment>
}` });
  const pool = new THREE.Mesh(new THREE.CircleGeometry(w * 1.3, 24).rotateX(-Math.PI / 2), poolMat); pool.position.set(x + fx * Math.min(4, len * 0.12), bottom + 0.06, z + fz * Math.min(4, len * 0.12)); pool.renderOrder = 3; group.add(pool);
  group.userData.base = pool.position.clone();
  return group;
}
