// Volcanic heightfield terrain: field-defined base height, lava carving (signed distance -> bank profile),
// hot-spring basins, chunked mesh, macro splat maps and a slope/height-blended PBR material with emissive lava veins.
import { smoothstep, clamp } from './noise.js';
import { VOLC_GLSL } from './volcanicTextures.js';

const v3 = (a) => `vec3(${a.map((x) => x.toFixed(4)).join(',')})`;
const smin = (a, b, k) => { const h = clamp(0.5 + 0.5 * (b - a) / k, 0, 1); return b + (a - b) * h - k * h * (1 - h); };

export function createVolcanicTerrain(THREE, F, textures, opts = {}) {
  const SEG = opts.segments || F.seg, SIZE = F.size, HALF = SIZE / 2, CELL = SIZE / SEG;
  const LY = F.lavaY, bank = F.bank;
  for (const s of F.springs) { s.level = F.base(s.x, s.z) - 0.35; }

  function lavaTarget(s) {
    if (s < 0) return LY - clamp(0.3 - s * bank.inside, 0.3, 2.4);
    return LY + 0.35 + s * bank.slope + (s / 6) * (s / 6) * bank.quad;
  }
  function rawHeight(x, z) {
    let h = F.base(x, z);
    for (const s of F.springs) {
      const d = Math.hypot(x - s.x, z - s.z) / s.r;
      if (d < 2.2) {
        const target = d < 1 ? s.level - 0.15 - 0.9 * smoothstep(1, 0.2, d) : s.level + 0.12 + (d - 1) * s.r * 0.12;
        const rim = 0.25 * smoothstep(0.85, 1.05, d) * smoothstep(1.6, 1.1, d);
        h = Math.min(h, target) + rim;
      }
    }
    const sd = F.lavaSD(x, z);
    if (sd < 60) { h = Math.max(h, LY + 0.3); h = smin(h, lavaTarget(sd), 0.35); }
    else h = Math.max(h, LY + 0.3);
    return h;
  }

  // ---- grid ----
  const V = SEG + 1;
  const heights = new Float32Array(V * V);
  for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) heights[j * V + i] = rawHeight(-HALF + i * CELL, -HALF + j * CELL);
  const normals = new Float32Array(V * V * 3);
  const H = (i, j) => heights[clamp(j, 0, SEG) * V + clamp(i, 0, SEG)];
  for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) {
    const nx = H(i - 1, j) - H(i + 1, j), nz = H(i, j - 1) - H(i, j + 1), ny = 2 * CELL;
    const l = Math.hypot(nx, ny, nz); const k = (j * V + i) * 3;
    normals[k] = nx / l; normals[k + 1] = ny / l; normals[k + 2] = nz / l;
  }
  const pos = new Float32Array(V * V * 3);
  for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) { const k = (j * V + i) * 3; pos[k] = -HALF + i * CELL; pos[k + 1] = heights[j * V + i]; pos[k + 2] = -HALF + j * CELL; }
  const CH = 4, CS = Math.ceil(SEG / CH);
  const posAttr = new THREE.BufferAttribute(pos, 3), nrmAttr = new THREE.BufferAttribute(normals, 3);
  const chunkGeos = [];
  for (let cj = 0; cj < CH; cj++) for (let ci = 0; ci < CH; ci++) {
    const i0 = ci * CS, i1 = Math.min(SEG, i0 + CS), j0 = cj * CS, j1 = Math.min(SEG, j0 + CS);
    const idx = new Uint32Array((i1 - i0) * (j1 - j0) * 6); let p = 0, hmin = 1e9, hmax = -1e9;
    for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) {
      const a = j * V + i, b = (j + 1) * V + i, c = (j + 1) * V + i + 1, d = j * V + i + 1;
      idx[p++] = a; idx[p++] = b; idx[p++] = d; idx[p++] = b; idx[p++] = c; idx[p++] = d;
      for (const q of [a, c]) { const h = heights[q]; if (h < hmin) hmin = h; if (h > hmax) hmax = h; }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', posAttr); g.setAttribute('normal', nrmAttr); g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.boundingBox = new THREE.Box3(new THREE.Vector3(-HALF + i0 * CELL, hmin - 1, -HALF + j0 * CELL), new THREE.Vector3(-HALF + i1 * CELL, hmax + 1, -HALF + j1 * CELL));
    g.boundingSphere = g.boundingBox.getBoundingSphere(new THREE.Sphere());
    chunkGeos.push(g);
  }
  function locate(x, z) {
    let fx = (x + HALF) / CELL, fz = (z + HALF) / CELL;
    fx = clamp(fx, 0, SEG - 1e-4); fz = clamp(fz, 0, SEG - 1e-4);
    const i = Math.floor(fx), j = Math.floor(fz); return [i, j, fx - i, fz - j];
  }
  function getHeight(x, z) {
    const [i, j, tx, tz] = locate(x, z);
    const ha = heights[j * V + i], hb = heights[(j + 1) * V + i], hc = heights[(j + 1) * V + i + 1], hd = heights[j * V + i + 1];
    if (tx + tz <= 1) return ha + (hd - ha) * tx + (hb - ha) * tz;
    return hc + (hb - hc) * (1 - tx) + (hd - hc) * (1 - tz);
  }
  function getNormal(x, z, target) {
    const [i, j, tx, tz] = locate(x, z);
    const a = (j * V + i) * 3, b = ((j + 1) * V + i) * 3, c = ((j + 1) * V + i + 1) * 3, d = (j * V + i + 1) * 3;
    const out = target || new THREE.Vector3();
    if (tx + tz <= 1) { const wa = 1 - tx - tz; out.set(normals[a] * wa + normals[d] * tx + normals[b] * tz, normals[a + 1] * wa + normals[d + 1] * tx + normals[b + 1] * tz, normals[a + 2] * wa + normals[d + 2] * tx + normals[b + 2] * tz); }
    else { const wb = 1 - tx, wd = 1 - tz, wc = 1 - wb - wd; out.set(normals[c] * wc + normals[b] * wb + normals[d] * wd, normals[c + 1] * wc + normals[b + 1] * wb + normals[d + 1] * wd, normals[c + 2] * wc + normals[b + 2] * wb + normals[d + 2] * wd); }
    return out.normalize();
  }
  // the visible lava surface is the flat plane at LY wherever the rendered terrain dips below it
  const lavaAt = (x, z) => getHeight(x, z) < LY - 0.02;

  // ---- macro splat maps: m1 = (ash, scoria, heat, crack)  m2 = (sulfur, flow, wet, burn) ----
  const MS = opts.macroSize || 512;
  const m1 = new Uint8Array(MS * MS * 4), m2 = new Uint8Array(MS * MS * 4), heat = new Float32Array(MS * MS);
  const _n = new THREE.Vector3();
  for (let j = 0; j < MS; j++) for (let i = 0; i < MS; i++) {
    const x = -HALF + (i + 0.5) / MS * SIZE, z = -HALF + (j + 0.5) / MS * SIZE;
    const h = getHeight(x, z); getNormal(x, z, _n); const slope = 1 - _n.y;
    const sd = F.lavaSD(x, z);
    const s = F.surface(x, z, h, slope, sd);
    const ht = Math.max(sd < 0 ? 1 : Math.exp(-sd / 9), F.extraHeat ? F.extraHeat(x, z) : 0);
    let wet = 0;
    for (const sp of F.springs) wet = Math.max(wet, smoothstep(1.35, 0.95, Math.hypot(x - sp.x, z - sp.z) / sp.r));
    const k = (j * MS + i) * 4; heat[j * MS + i] = ht;
    m1[k] = s.ash * 255; m1[k + 1] = s.scoria * 255; m1[k + 2] = clamp(ht, 0, 1) * 255; m1[k + 3] = clamp(s.crack, 0, 1) * 255;
    m2[k] = clamp(s.sulfur, 0, 1) * 255; m2[k + 1] = clamp(s.flow, 0, 1) * 255; m2[k + 2] = wet * 255; m2[k + 3] = clamp(s.burn, 0, 1) * 255;
  }
  const mk = (d) => { const t = new THREE.DataTexture(d, MS, MS, THREE.RGBAFormat); t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.needsUpdate = true; return t; };
  const macro1 = mk(m1), macro2 = mk(m2);
  const heatAt = (x, z) => { const i = clamp(Math.floor((x + HALF) / SIZE * MS), 0, MS - 1), j = clamp(Math.floor((z + HALF) / SIZE * MS), 0, MS - 1); return heat[j * MS + i]; };

  const shared = { uTime: { value: 0 }, uPulse: { value: 1 }, tM1: { value: macro1 }, tM2: { value: macro2 }, uSize: { value: SIZE } };
  const material = createTerrainMaterial(THREE, F, textures, shared);
  const mesh = new THREE.Group(); mesh.name = 'terrain';
  for (const g of chunkGeos) { const m = new THREE.Mesh(g, material); m.receiveShadow = true; m.name = 'terrain-chunk'; mesh.add(m); }
  // cave walls must cast (shaft through the oculus); open fields keep a tight shadow box and skip it
  if (F.cave) mesh.children.forEach((m) => { m.castShadow = true; });

  return { mesh, getHeight, getNormal, rawHeight, lavaAt, heatAt, heights, SEG, CELL, HALF, SIZE, V, material, shared, macro1, macro2 };
}

// Shared lighting GLSL for anything that sits on the terrain (rocks, props) so they pick up the lava bounce.
export function macroGLSL(F) {
  return `uniform sampler2D tM1, tM2; uniform float uSize, uTime, uPulse;
vec4 wbM1(vec3 p){ return texture2D(tM1, p.xz / uSize + 0.5); }
vec4 wbM2(vec3 p){ return texture2D(tM2, p.xz / uSize + 0.5); }
const vec3 WB_GLOW = ${v3(F.palette.glow)};
const float WB_LAVAY = ${F.lavaY.toFixed(3)};`;
}

function createTerrainMaterial(THREE, F, tx, shared) {
  const P = F.palette;
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 });
  const uniforms = { ...shared, tBas: { value: tx.basalt }, tBasN: { value: tx.basaltN }, tFlow: { value: tx.flow }, tFlowN: { value: tx.flowN }, tSco: { value: tx.scoria }, tScoN: { value: tx.scoriaN }, tAsh: { value: tx.ash }, tAshN: { value: tx.ashN } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos; varying vec3 vWN;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed,1.0)).xyz; vWN = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vWPos; varying vec3 vWN;
uniform sampler2D tBas, tBasN, tFlow, tFlowN, tSco, tScoN, tAsh, tAshN;
${macroGLSL(F)}
${VOLC_GLSL}
vec3 terrN; float terrRough; vec3 terrEmit;
`)
      .replace('#include <map_fragment>', `
{
  vec3 wn = normalize(vWN);
  vec4 a1 = wbM1(vWPos), a2 = wbM2(vWPos);
  float slope = 1.0 - wn.y;
  vec2 p = vWPos.xz;
  mat2 R1 = mat2(0.8, 0.6, -0.6, 0.8);
  vec2 uF = p * 0.16, uS = R1 * p * 0.21 + 0.3, uA = p * 0.19, uA2 = R1 * p * 0.047;
  vec4 fl = texture2D(tFlow, uF), fl2 = texture2D(tFlow, uF * 0.23 + 0.5);
  vec4 sc = texture2D(tSco, uS);
  vec3 flN = vtN(texture2D(tFlowN, uF)), scN = vtN(texture2D(tScoN, uS));
  // flow vs clinker
  float wS = clamp(a1.g * (1.0 - a2.g * 0.5) + a2.g * 0.0, 0.0, 1.0);
  vec2 b1 = vtHB(fl.a, 1.0 - wS, sc.a, wS);
  vec3 flowC = vtRamp(${v3(P.flow[0])}, ${v3(P.flow[1])}, fl.r * mix(0.8, 1.2, fl2.b));
  vec3 scoC = mix(vtRamp(${v3(P.scoria[0])}, ${v3(P.scoria[1])}, sc.r), ${v3(P.oxide)} * (0.4 + sc.r), sc.g * 0.55);
  vec3 col = flowC * b1.x + scoC * b1.y;
  vec3 nT = flN * b1.x + scN * b1.y;
  float h = fl.a * b1.x + sc.a * b1.y;
  float rough = 0.5 * b1.x + 0.95 * b1.y;
  float crackM = fl.g * b1.x;
  // ash settles in hollows and on flat ground
  float wA = a1.r * (1.0 - smoothstep(0.3, 0.55, slope));
  if (wA > 0.01) {
    vec4 as = mix(texture2D(tAsh, uA), texture2D(tAsh, uA2), 0.4);
    vec3 asN = vtN(texture2D(tAshN, uA));
    vec2 b2 = vtHB(1.0 - h * 0.6, 1.0 - wA, as.a, wA * 1.1);
    vec3 ashC = vtRamp(${v3(P.ash[0])}, ${v3(P.ash[1])}, as.r) * mix(0.9, 1.08, as.b);
    col = col * b2.x + ashC * b2.y; nT = nT * b2.x + asN * b2.y; h = h * b2.x + as.a * b2.y; rough = rough * b2.x + 0.97 * b2.y; crackM *= b2.x;
  }
  // tangent-space (xz plane) -> world
  vec3 nW = normalize(vec3(nT.x + wn.x, abs(nT.z) * wn.y, nT.y + wn.z));
  // basalt on steep faces (triplanar)
  float wR = smoothstep(0.3, 0.52, slope + (h - 0.5) * 0.25);
  if (wR > 0.01) {
    vec3 bw = pow(abs(wn), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
    float rs = 0.09;
    vec2 ux = vWPos.zy * rs, uy = vWPos.xz * rs, uz = vWPos.xy * rs;
    vec4 rk = texture2D(tBas, ux) * bw.x + texture2D(tBas, uy) * bw.y + texture2D(tBas, uz) * bw.z;
    vec4 rk2 = texture2D(tBas, ux * 0.27) * bw.x + texture2D(tBas, uy * 0.27) * bw.y + texture2D(tBas, uz * 0.27) * bw.z;
    vec3 tnx = vtN(texture2D(tBasN, ux)), tny = vtN(texture2D(tBasN, uy)), tnz = vtN(texture2D(tBasN, uz));
    tnx = vec3(tnx.xy + wn.zy, abs(tnx.z) * wn.x); tny = vec3(tny.xy + wn.xz, abs(tny.z) * wn.y); tnz = vec3(tnz.xy + wn.xy, abs(tnz.z) * wn.z);
    vec3 rN = normalize(tnx.zyx * bw.x + tny.xzy * bw.y + tnz.xyz * bw.z);
    vec3 rC = vtRamp(${v3(P.basalt[0])}, ${v3(P.basalt[1])}, rk.r * mix(0.75, 1.25, rk2.a));
    // ash dusting on ledges of the rock
    rC = mix(rC, ${v3(P.ash[1])} * 0.8, smoothstep(0.55, 0.9, wn.y + rk.a * 0.3) * a1.r * 0.6);
    vec2 b3 = vtHB(h, 1.0 - wR, rk.a, wR);
    col = col * b3.x + rC * b3.y; nW = normalize(nW * b3.x + rN * b3.y); rough = rough * b3.x + 0.86 * b3.y;
    crackM = mix(crackM, rk.g * 0.7, b3.y);
  }
  // sulfur / mineral crusts around vents and hot springs
  float sul = a2.r * smoothstep(0.2, 0.7, h + a2.r * 0.5);
  col = mix(col, ${v3(P.sulfur)} * mix(0.5, 1.1, h), sul * 0.75);
  // scorched ground near lava
  col = mix(col, ${v3(P.burn)}, a2.a * 0.45 * (1.0 - sul));
  // wet basin edges
  col *= mix(1.0, 0.5, a2.b); rough = mix(rough, 0.25, a2.b);
  col *= mix(0.72, 1.08, h);
  // emissive: glowing cooling cracks + incandescent ground right at the lava edge
  float heat = a1.b;
  float pulse = 0.75 + 0.25 * sin(uTime * 1.3 + vWPos.x * 0.07 + vWPos.z * 0.05);
  float vein = smoothstep(0.35, 0.9, crackM) * a1.a * (0.45 + 0.55 * heat) * pulse * uPulse;
  float edge = pow(heat, 5.0);
  terrEmit = WB_GLOW * (vein * 2.6 + edge * 1.4 * (0.6 + 0.4 * h)) + WB_GLOW * heat * heat * 0.06;
  terrN = nW; terrRough = rough;
  diffuseColor.rgb *= col;
}
`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = terrRough;')
      .replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(terrN, 0.0)).xyz);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += terrEmit;');
  };
  mat.customProgramCacheKey = () => 'wb-volc-terrain-' + F.id;
  return mat;
}
