// Procedural PBR texture sets for the hunter (DataTexture based, no DOM needed).
// Each set returns { map, normalMap, roughnessMap, metalnessMap } where roughness lives in G and metalness in B
// of a shared "ORM" texture (three.js reads G for roughness, B for metalness).
import * as THREE from 'three';

function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

// Tileable value noise with fBm.
function makeNoise(seed, size) {
  const r = rng(seed), g = new Float32Array(size * size);
  for (let i = 0; i < g.length; i++) g[i] = r();
  const at = (x, y) => g[((y % size + size) % size) * size + ((x % size + size) % size)];
  const sm = (t) => t * t * (3 - 2 * t);
  const v = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = sm(x - xi), yf = sm(y - yi);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  };
  return (x, y, oct = 4, base = 4) => {
    let s = 0, amp = 0.5, f = base, n = 0;
    for (let o = 0; o < oct; o++) { s += v(x * f, y * f) * amp; n += amp; amp *= 0.5; f *= 2; }
    return s / n;
  };
}

function tex(data, size, srgb) {
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true; t.anisotropy = 4; if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; return t;
}

// Builds a full set from a per-pixel function returning {r,g,b (0..1 albedo), h (height 0..1), rough, metal}
function build(size, fn, normalStrength = 2) {
  const n = size * size, alb = new Uint8Array(n * 4), orm = new Uint8Array(n * 4), nor = new Uint8Array(n * 4), H = new Float32Array(n);
  const o = {};
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x; fn(x / size, y / size, o);
    alb[i * 4] = Math.min(255, o.r * 255); alb[i * 4 + 1] = Math.min(255, o.g * 255); alb[i * 4 + 2] = Math.min(255, o.b * 255); alb[i * 4 + 3] = 255;
    orm[i * 4] = 255; orm[i * 4 + 1] = Math.min(255, o.rough * 255); orm[i * 4 + 2] = Math.min(255, o.metal * 255); orm[i * 4 + 3] = 255;
    H[i] = o.h;
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const h = (xx, yy) => H[((yy + size) % size) * size + ((xx + size) % size)];
    const dx = (h(x + 1, y) - h(x - 1, y)) * normalStrength, dy = (h(x, y + 1) - h(x, y - 1)) * normalStrength;
    const l = Math.hypot(dx, dy, 1), i = (y * size + x) * 4;
    nor[i] = (-dx / l * 0.5 + 0.5) * 255; nor[i + 1] = (dy / l * 0.5 + 0.5) * 255; nor[i + 2] = (1 / l * 0.5 + 0.5) * 255; nor[i + 3] = 255;
  }
  const ormT = tex(orm, size, false);
  return { map: tex(alb, size, true), normalMap: tex(nor, size, false), roughnessMap: ormT, metalnessMap: ormT };
}

const mix = (a, b, t) => a + (b - a) * t;
const C = (hex) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];

export function clothSet(colA = 0x5a1f22, colB = 0x2a0e10, seed = 3) {
  const N = makeNoise(seed, 64), a = C(colA), b = C(colB);
  return build(128, (u, v, o) => {
    const wu = Math.sin(u * Math.PI * 2 * 48), wv = Math.sin(v * Math.PI * 2 * 48);
    const weave = (Math.sign(Math.sin(u * Math.PI * 2 * 24) * Math.sin(v * Math.PI * 2 * 24)) > 0 ? Math.abs(wu) : Math.abs(wv));
    const n = N(u, v, 4, 3), fray = N(u * 3, v * 3, 2, 8);
    const t = Math.min(1, Math.max(0, n * 1.2 - 0.1 + (fray - 0.5) * 0.3));
    const k = 0.9 + 0.1 * weave;
    o.r = mix(a[0], b[0], t) * k; o.g = mix(a[1], b[1], t) * k; o.b = mix(a[2], b[2], t) * k;
    o.h = weave * 0.5 + n * 0.3; o.rough = 0.88 + fray * 0.1; o.metal = 0;
  }, 1.6);
}

export function leatherSet(col = 0x4a3020, seed = 7) {
  const N = makeNoise(seed, 64), M = makeNoise(seed + 11, 64), c = C(col);
  return build(128, (u, v, o) => {
    const grain = N(u, v, 5, 8), patch = M(u, v, 3, 2), crack = Math.abs(M(u * 2, v * 2, 3, 6) - 0.5) < 0.02 ? 1 : 0;
    const stitch = (Math.abs(((v * 4) % 1) - 0.5) < 0.012 && ((u * 64) % 1) < 0.55) ? 1 : 0; // stitched seams
    const k = 0.7 + grain * 0.45 + patch * 0.25 - crack * 0.2;
    o.r = c[0] * k + stitch * 0.25; o.g = c[1] * k + stitch * 0.2; o.b = c[2] * k + stitch * 0.12;
    o.h = grain * 0.6 - crack * 0.4 + stitch * 0.6; o.rough = 0.55 + grain * 0.25 + patch * 0.15 - stitch * 0.2; o.metal = 0;
  }, 2.2);
}

export function metalSet(col = 0x9aa0a6, seed = 13, wear = 1) {
  const N = makeNoise(seed, 64), S = makeNoise(seed + 5, 128), c = C(col);
  return build(256, (u, v, o) => {
    const brushed = S(u * 0.05, v * 4, 3, 16);
    const grime = Math.max(0, N(u, v, 4, 3) - 0.45) * 2 * wear;
    const scratch = Math.max(0, 1 - Math.abs(S(u * 1.3 + v * 0.7, v * 0.2, 2, 20) - 0.5) * 60) * wear;
    const dent = N(u * 2, v * 2, 3, 6);
    const k = 0.78 + brushed * 0.22 - grime * 0.45 + scratch * 0.35;
    o.r = c[0] * k; o.g = c[1] * k; o.b = c[2] * k;
    const hammer = N(u * 5, v * 5, 2, 8);
    o.h = dent * 0.5 + hammer * 0.35 - scratch * 0.25; o.rough = 0.3 + brushed * 0.15 + grime * 0.45 - scratch * 0.15; o.metal = 1 - grime * 0.5;
  }, 3.2);
}

export function boneSet(seed = 21) {
  const N = makeNoise(seed, 64), c = C(0xd8ccb0);
  return build(128, (u, v, o) => {
    const n = N(u, v, 5, 4), ring = Math.sin((v * 30 + n * 6)) * 0.5 + 0.5;
    const crack = Math.abs(N(u * 3, v, 3, 5) - 0.5) < 0.015 ? 1 : 0;
    const k = 0.72 + n * 0.3 + ring * 0.06 - crack * 0.35;
    o.r = c[0] * k; o.g = c[1] * k * 0.98; o.b = c[2] * k * 0.92;
    o.h = ring * 0.2 + n * 0.4 - crack * 0.5; o.rough = 0.55 + n * 0.2; o.metal = 0;
  }, 2);
}

// Blade: u = spine(0) → edge(1), v = guard(0) → tip(1). Polished edge bevel, fuller groove, etched runes-free hammer marks.
export function bladeSet(seed = 31) {
  const N = makeNoise(seed, 64), S = makeNoise(seed + 3, 128);
  return build(256, (u, v, o) => {
    const hammer = N(u * 2, v * 6, 4, 6), streak = S(u * 0.3, v * 8, 3, 12);
    const bevel = u > 0.8 ? 1 : 0, fuller = Math.abs(u - 0.32) < 0.06 ? 1 : 0;
    const grime = Math.max(0, N(u, v * 3, 3, 3) - 0.5) * 2 * (1 - bevel);
    const base = bevel ? 0.92 : 0.42 + hammer * 0.18;
    const k = base - grime * 0.2 + streak * 0.08 - fuller * 0.12;
    o.r = k * 0.95; o.g = k * 0.97; o.b = k;
    o.h = (bevel ? 0.2 : hammer * 0.5) - fuller * 0.6; o.rough = bevel ? 0.14 + streak * 0.08 : 0.42 + hammer * 0.2 + grime * 0.3; o.metal = 1;
  }, 1.8);
}

let cache = null;
export function getHunterTextures() {
  if (cache) return cache;
  cache = {
    cloth: clothSet(0x6b1f1c, 0x341010, 3), clothDark: clothSet(0x2a2b30, 0x16161a, 5), tabard: clothSet(0x7a2420, 0x3a0f0d, 9), clothLight: clothSet(0xd8d4cc, 0x9a948a, 11),
    leather: leatherSet(0x553622, 7), leatherDark: leatherSet(0x2a1c14, 9), steel: metalSet(0x9aa3ab, 13, 1), darkSteel: metalSet(0x5a6068, 17, 1.2),
    brass: metalSet(0xb08a4a, 19, 0.8), bone: boneSet(21), blade: bladeSet(31),
  };
  return cache;
}
