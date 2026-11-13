// Heightfield terrain: deterministic multi-octave noise, carved pond + stream, splat/triplanar material.
import { makeNoise2D, smoothstep, clamp, lerp } from './noise.js';

export const TERRAIN_SIZE = 520;
export const WATER_LEVEL = -0.55;

export function createTerrain(THREE, seed, textures, opts = {}) {
  const SEG = opts.segments || 416;
  const SIZE = TERRAIN_SIZE, HALF = SIZE / 2, CELL = SIZE / SEG;
  const N = makeNoise2D(seed);
  const N2 = makeNoise2D(seed + 101);

  // ---- water features ----
  const pond = { x: 47, z: 10, r: 13 };
  const stream = [[168, -150], [140, -128], [118, -96], [104, -70], [86, -48], [70, -30], [58, -10], [50, 2]];
  // cumulative lengths for param
  const segLen = []; let total = 0;
  for (let i = 0; i < stream.length - 1; i++) { const l = Math.hypot(stream[i + 1][0] - stream[i][0], stream[i + 1][1] - stream[i][1]); segLen.push(l); total += l; }
  function streamInfo(x, z) {
    let best = 1e9, bestS = 0, acc = 0;
    for (let i = 0; i < stream.length - 1; i++) {
      const [ax, az] = stream[i], [bx, bz] = stream[i + 1];
      const dx = bx - ax, dz = bz - az; const l2 = dx * dx + dz * dz;
      let t = ((x - ax) * dx + (z - az) * dz) / l2; t = clamp(t, 0, 1);
      const px = ax + dx * t, pz = az + dz * t; const d = Math.hypot(x - px, z - pz);
      if (d < best) { best = d; bestS = acc + t * segLen[i]; }
      acc += segLen[i];
    }
    // s: 1 at source, 0 at pond
    return { d: best, s: 1 - bestS / total };
  }
  const pondDist = (x, z) => {
    const a = Math.atan2(z - pond.z, x - pond.x);
    const rr = pond.r * (1 + 0.18 * N2.noise(Math.cos(a) * 1.3 + 4, Math.sin(a) * 1.3 + 4) + 0.08 * N2.noise(Math.cos(a) * 3, Math.sin(a) * 3));
    return Math.hypot(x - pond.x, z - pond.z) / rr; // <1 inside
  };

  function rawHeight(x, z) {
    const r = Math.hypot(x, z);
    const ang = Math.atan2(x, z); // 0 = +z (south)
    // gentle arena undulation
    let h = N.fbm(x * 0.018, z * 0.018, 3) * 0.9 + N.fbm(x * 0.07 + 9, z * 0.07, 2) * 0.18;
    const edge = 48 + 10 * N.noise(Math.cos(ang) * 1.7 + 3, Math.sin(ang) * 1.7 + 1);
    const t = smoothstep(edge, edge + 55, r);
    // southern approach valley (lower hills where the hunter walks in)
    const valley = Math.exp(-(ang * ang) / (0.33 * 0.33)) * smoothstep(40, 90, r) * (1 - smoothstep(170, 230, r));
    const hillsN = N.fbm(x * 0.011 + 5, z * 0.011 - 3, 5, 2, 0.5);
    let hills = (12 + 16 * hillsN) * t;
    // big cliffs / ridges further out
    const rid = N.ridged(x * 0.009 + 1.3, z * 0.009 + 7.1, 5, 2.1, 0.5);
    let mtn = smoothstep(95, 220, r) * (18 + 55 * rid * rid);
    // terrace the hills to create cliff bands
    let hh = hills + mtn;
    const step = 7.5;
    const q = hh / step, f = q - Math.floor(q);
    const terr = (Math.floor(q) + smoothstep(0.25, 0.75, f)) * step;
    const terrMask = smoothstep(0.1, 0.5, N.fbm(x * 0.02 - 4, z * 0.02 + 8, 3) + 0.15) * t;
    hh = lerp(hh, terr, 0.75 * terrMask);
    hh += N.fbm(x * 0.06, z * 0.06, 3) * 1.6 * t;
    hh *= 1 - 0.72 * valley;
    h += hh;
    // carve stream valley + channel
    const si = streamInfo(x, z);
    if (si.d < 40) {
      const bed = WATER_LEVEL - 0.25 + 46 * Math.pow(si.s, 1.6);
      const d = si.d;
      let target = d < 1.8 ? bed - 0.55 + (d / 1.8) * (d / 1.8) * 0.55 : bed + (d - 1.8) * 0.35 + ((d - 1.8) / 10) * ((d - 1.8) / 10) * 6;
      if (target < h) { const k = 1.2; const m = clamp(0.5 + 0.5 * (h - target) / k, 0, 1); h = lerp(h, target, m) - k * m * (1 - m) * 0.5; }
    }
    // pond basin
    const pd = pondDist(x, z);
    if (pd < 2) {
      const target = pd < 1 ? WATER_LEVEL + 0.25 - 2.4 * smoothstep(1.0, 0.25, pd) - 0.35 * (1 - pd) : WATER_LEVEL + 0.25 + (pd - 1) * pond.r * 0.22;
      if (target < h) h = target;
    }
    return h;
  }

  // ---- build grid ----
  const V = SEG + 1;
  const heights = new Float32Array(V * V);
  for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) heights[j * V + i] = rawHeight(-HALF + i * CELL, -HALF + j * CELL);
  // light smoothing pass on terrace edges (keeps determinism)
  const normals = new Float32Array(V * V * 3);
  const H = (i, j) => heights[clamp(j, 0, SEG) * V + clamp(i, 0, SEG)];
  for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) {
    const nx = (H(i - 1, j) - H(i + 1, j)), nz = (H(i, j - 1) - H(i, j + 1)), ny = 2 * CELL;
    const l = Math.hypot(nx, ny, nz); const k = (j * V + i) * 3;
    normals[k] = nx / l; normals[k + 1] = ny / l; normals[k + 2] = nz / l;
  }
  const pos = new Float32Array(V * V * 3);
  for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) { const k = (j * V + i) * 3; pos[k] = -HALF + i * CELL; pos[k + 1] = heights[j * V + i]; pos[k + 2] = -HALF + j * CELL; }
  // split into CHUNKS x CHUNKS index ranges sharing one vertex buffer so off-screen parts get frustum culled
  const CHUNKS = 4, CS = SEG / CHUNKS;
  const posAttr = new THREE.BufferAttribute(pos, 3), nrmAttr = new THREE.BufferAttribute(normals, 3);
  const chunkGeos = [];
  for (let cj = 0; cj < CHUNKS; cj++) for (let ci = 0; ci < CHUNKS; ci++) {
    const idx = new Uint32Array(CS * CS * 6); let p = 0; let hmin = 1e9, hmax = -1e9;
    for (let j = cj * CS; j < (cj + 1) * CS; j++) for (let i = ci * CS; i < (ci + 1) * CS; i++) {
      const a = j * V + i, b = (j + 1) * V + i, c = (j + 1) * V + i + 1, d = j * V + i + 1;
      idx[p++] = a; idx[p++] = b; idx[p++] = d; idx[p++] = b; idx[p++] = c; idx[p++] = d;
      const h = heights[a]; if (h < hmin) hmin = h; if (h > hmax) hmax = h;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', posAttr); g.setAttribute('normal', nrmAttr); g.setIndex(new THREE.BufferAttribute(idx, 1));
    const x0 = -HALF + ci * CS * CELL, z0 = -HALF + cj * CS * CELL, x1 = x0 + CS * CELL, z1 = z0 + CS * CELL;
    g.boundingBox = new THREE.Box3(new THREE.Vector3(x0, hmin - 1, z0), new THREE.Vector3(x1, hmax + 1, z1));
    g.boundingSphere = g.boundingBox.getBoundingSphere(new THREE.Sphere());
    chunkGeos.push(g);
  }


  function locate(x, z) {
    let fx = (x + HALF) / CELL, fz = (z + HALF) / CELL;
    fx = clamp(fx, 0, SEG - 1e-4); fz = clamp(fz, 0, SEG - 1e-4);
    const i = Math.floor(fx), j = Math.floor(fz);
    return [i, j, fx - i, fz - j];
  }
  // exact triangle interpolation matching the index layout above
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
    if (tx + tz <= 1) {
      const wa = 1 - tx - tz;
      out.set(normals[a] * wa + normals[d] * tx + normals[b] * tz, normals[a + 1] * wa + normals[d + 1] * tx + normals[b + 1] * tz, normals[a + 2] * wa + normals[d + 2] * tx + normals[b + 2] * tz);
    } else {
      const wb = 1 - tx, wd = 1 - tz, wc = 1 - wb - wd;
      out.set(normals[c] * wc + normals[b] * wb + normals[d] * wd, normals[c + 1] * wc + normals[b + 1] * wb + normals[d + 1] * wd, normals[c + 2] * wc + normals[b + 2] * wb + normals[d + 2] * wd);
    }
    return out.normalize();
  }

  // ---- macro splat map: R dirt, G variation, B wetness, A meadow (grass density) ----
  const MS = 512;
  const macro = new Uint8Array(MS * MS * 4);
  const macroF = new Float32Array(MS * MS * 4);
  for (let j = 0; j < MS; j++) for (let i = 0; i < MS; i++) {
    const x = -HALF + (i + 0.5) / MS * SIZE, z = -HALF + (j + 0.5) / MS * SIZE;
    const r = Math.hypot(x, z);
    const n1 = N2.fbm(x * 0.045, z * 0.045, 4);
    const n2 = N2.fbm(x * 0.012 + 3, z * 0.012 - 6, 3);
    // trampled arena patches & approach path from the south
    const nLow = N2.fbm(x * 0.022 + 7, z * 0.022 - 2, 4);
    let dirt = smoothstep(0.05, 0.55, nLow + 0.2 * (1 - smoothstep(8, 34, r)) + n1 * 0.15) * 0.8 * (1 - smoothstep(34, 50, r));
    const pathX = 6 * Math.sin(z * 0.035) + 3 * N2.noise(z * 0.05, 3);
    const path = smoothstep(3.2, 1.2, Math.abs(x - pathX) + n1 * 1.5) * smoothstep(28, 40, z) * (1 - smoothstep(150, 190, z));
    dirt = Math.max(dirt, path);
    const si = streamInfo(x, z); const pd = pondDist(x, z);
    const wet = Math.max(smoothstep(4.5, 1.2, si.d), smoothstep(1.25, 0.95, pd));
    dirt = Math.max(dirt, smoothstep(6, 2.5, si.d) * 0.85, smoothstep(1.35, 1.05, pd) * 0.9);
    const meadow = (1 - dirt) * (1 - wet);
    const k = (j * MS + i) * 4;
    macroF[k] = dirt; macroF[k + 1] = n2 * 0.5 + 0.5; macroF[k + 2] = wet; macroF[k + 3] = meadow;
    macro[k] = dirt * 255; macro[k + 1] = clamp(n2 * 0.5 + 0.5, 0, 1) * 255; macro[k + 2] = wet * 255; macro[k + 3] = meadow * 255;
  }
  const macroTex = new THREE.DataTexture(macro, MS, MS, THREE.RGBAFormat);
  macroTex.magFilter = THREE.LinearFilter; macroTex.minFilter = THREE.LinearMipmapLinearFilter; macroTex.generateMipmaps = true; macroTex.needsUpdate = true;
  function macroAt(x, z) {
    const i = clamp(Math.floor((x + HALF) / SIZE * MS), 0, MS - 1), j = clamp(Math.floor((z + HALF) / SIZE * MS), 0, MS - 1);
    const k = (j * MS + i) * 4; return { dirt: macroF[k], vari: macroF[k + 1], wet: macroF[k + 2], meadow: macroF[k + 3] };
  }

  const material = createTerrainMaterial(THREE, textures, macroTex, SIZE);
  const mesh = new THREE.Group();
  for (const g of chunkGeos) { const m = new THREE.Mesh(g, material); m.receiveShadow = true; m.castShadow = false; m.name = 'terrain-chunk'; mesh.add(m); }
  mesh.name = 'terrain'; // chunks don't cast: tight shadow box, terrain self-shadowing not worth the depth pass

  return { mesh, getHeight, getNormal, rawHeight, macroAt, streamInfo, pondDist, pond, stream, SIZE, HALF, material };
}

function createTerrainMaterial(THREE, tx, macroTex, SIZE) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 });
  const uniforms = {
    tGrass: { value: tx.grass }, tGrassN: { value: tx.grassN }, tDirt: { value: tx.dirt }, tDirtN: { value: tx.dirtN },
    tRock: { value: tx.rock }, tRockN: { value: tx.rockN }, tMacro: { value: macroTex }, uSize: { value: SIZE },
  };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos; varying vec3 vWN;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed,1.0)).xyz; vWN = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vWPos; varying vec3 vWN;
uniform sampler2D tGrass, tGrassN, tDirt, tDirtN, tRock, tRockN, tMacro; uniform float uSize;
vec3 terrN; float terrRough;
vec3 unpackN(vec4 t){ return t.xyz*2.0-1.0; }
vec2 hb(float h1, float a1, float h2, float a2){ float d=0.32; float m=max(h1+a1,h2+a2)-d; float b1=max(h1+a1-m,0.0), b2=max(h2+a2-m,0.0); return vec2(b1,b2)/(b1+b2+1e-5); }
`)
      .replace('#include <map_fragment>', `
{
  vec3 wn = normalize(vWN);
  vec4 mc = texture2D(tMacro, vWPos.xz / uSize + 0.5);
  float slope = 1.0 - wn.y;
  vec2 p = vWPos.xz;
  vec2 uvA = p * 0.23;
  vec2 uvB = mat2(0.866, 0.5, -0.5, 0.866) * p * 0.061 + 0.37;
  vec4 gA = texture2D(tGrass, uvA), gB = texture2D(tGrass, uvB);
  vec4 grass = mix(gA, gB, 0.45);
  grass.rgb *= mix(vec3(1.12,0.98,0.78), vec3(0.78,1.04,0.92), mc.g);
  vec3 gN = unpackN(texture2D(tGrassN, uvA));
  // weights (computed first so expensive layers can be skipped)
  float wDirt = clamp(mc.r + smoothstep(0.16, 0.3, slope) * 0.6, 0.0, 1.0);
  float hiRock = smoothstep(26.0, 60.0, vWPos.y) * 0.25;
  float wRock = smoothstep(0.30, 0.5, slope + (mc.g - 0.5) * 0.25 + hiRock);
  vec3 gW = normalize(vec3(gN.x + wn.x, abs(gN.z) * wn.y, gN.y + wn.z));
  vec4 base = grass; vec3 baseN = gW; float baseR = 0.92;
  vec3 dWx = dFdx(vWPos), dWy = dFdy(vWPos);
  if (wDirt > 0.01) {
    vec2 uvD = p * 0.29, uvD2 = mat2(0.5, 0.866, -0.866, 0.5) * p * 0.083;
    mat2 rD = mat2(0.5, 0.866, -0.866, 0.5);
    vec4 dirt = mix(textureGrad(tDirt, uvD, dWx.xz * 0.29, dWy.xz * 0.29), textureGrad(tDirt, uvD2, rD * dWx.xz * 0.083, rD * dWy.xz * 0.083), 0.35);
    vec3 dN = unpackN(textureGrad(tDirtN, uvD, dWx.xz * 0.29, dWy.xz * 0.29));
    vec3 dW = normalize(vec3(dN.x + wn.x, abs(dN.z) * wn.y, dN.y + wn.z));
    vec2 w1 = hb(grass.a, 1.0 - wDirt, dirt.a, wDirt);
    grass.rgb = mix(grass.rgb, grass.rgb * vec3(1.25, 1.02, 0.7), smoothstep(0.1, 0.5, wDirt) * 0.7);
    base = grass * w1.x + dirt * w1.y; baseN = gW * w1.x + dW * w1.y; baseR = 0.92 * w1.x + 0.96 * w1.y;
  }
  vec4 col = base; terrN = normalize(baseN); terrRough = baseR; float rockW = 0.0;
  if (wRock > 0.01) {
    vec3 bw = pow(abs(wn), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
    float rs = 0.11;
    vec2 ux = vWPos.zy * rs, uy = vWPos.xz * rs * 0.8, uz = vWPos.xy * rs;
    vec2 gxx = dWx.zy * rs, gxy = dWy.zy * rs, gyx = dWx.xz * rs * 0.8, gyy = dWy.xz * rs * 0.8, gzx = dWx.xy * rs, gzy = dWy.xy * rs;
    vec4 rock = textureGrad(tRock, ux, gxx, gxy) * bw.x + textureGrad(tRock, uy, gyx, gyy) * bw.y + textureGrad(tRock, uz, gzx, gzy) * bw.z;
    vec4 rock2 = textureGrad(tRock, ux * 0.31 + 0.5, gxx * 0.31, gxy * 0.31) * bw.x + textureGrad(tRock, uy * 0.31 + 0.5, gyx * 0.31, gyy * 0.31) * bw.y + textureGrad(tRock, uz * 0.31 + 0.5, gzx * 0.31, gzy * 0.31) * bw.z;
    rock.rgb = rock.rgb * mix(0.75, 1.25, rock2.a);
    vec3 tnx = unpackN(textureGrad(tRockN, ux, gxx, gxy)), tny = unpackN(textureGrad(tRockN, uy, gyx, gyy)), tnz = unpackN(textureGrad(tRockN, uz, gzx, gzy));
    tnx = vec3(tnx.xy + wn.zy, abs(tnx.z) * wn.x);
    tny = vec3(tny.xy + wn.xz, abs(tny.z) * wn.y);
    tnz = vec3(tnz.xy + wn.xy, abs(tnz.z) * wn.z);
    vec3 rN = normalize(tnx.zyx * bw.x + tny.xzy * bw.y + tnz.xyz * bw.z);
    vec2 w2 = hb(base.a, 1.0 - wRock, rock.a, wRock);
    col = base * w2.x + rock * w2.y;
    terrN = normalize(baseN * w2.x + rN * w2.y);
    terrRough = baseR * w2.x + 0.82 * w2.y; rockW = w2.y;
  }
  // wetness near water
  float wet = mc.b * (1.0 - rockW * 0.5);
  col.rgb *= mix(1.0, 0.55, wet);
  terrRough = mix(terrRough, 0.32, wet);
  // underwater darkening
  float uw = smoothstep(${WATER_LEVEL.toFixed(2)} + 0.05, ${WATER_LEVEL.toFixed(2)} - 1.2, vWPos.y);
  col.rgb *= mix(1.0, 0.55, uw);
  // cavity darkening from texture height
  col.rgb *= mix(0.72, 1.08, col.a);
  diffuseColor.rgb *= col.rgb;
}
`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = terrRough;')
      .replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(terrN, 0.0)).xyz);');
  };
  mat.customProgramCacheKey = () => 'wb-terrain-v3';
  return mat;
}
