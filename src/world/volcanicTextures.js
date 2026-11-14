// Procedural tileable volcanic surface textures. Each "packed" texture stores
//   R = albedo luminance, G = a feature mask (cooling cracks / oxidation / lapilli), B = per-cell variation, A = height
// so a field palette can colourise the same data (see volcanicTerrain.js / rocks.js). Normal maps are derived from A.
import { makeNoise2D, smoothstep, clamp } from './noise.js';

function toTexture(THREE, data, size, aniso) {
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.anisotropy = aniso; t.needsUpdate = true;
  return t;
}
function heightToNormal(h, size, strength) {
  const out = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const xl = (x - 1 + size) % size, xr = (x + 1) % size, yu = (y - 1 + size) % size, yd = (y + 1) % size;
    const dx = (h[y * size + xr] - h[y * size + xl]) * strength, dy = (h[yd * size + x] - h[yu * size + x]) * strength;
    const l = Math.hypot(dx, dy, 1); const i = (y * size + x) * 4;
    out[i] = (-dx / l * 0.5 + 0.5) * 255; out[i + 1] = (-dy / l * 0.5 + 0.5) * 255; out[i + 2] = (1 / l * 0.5 + 0.5) * 255; out[i + 3] = 255;
  }
  return out;
}
const B = (v) => clamp(Math.round(v * 255), 0, 255);

function bake(size, fn) {
  const px = new Uint8Array(size * size * 4), h = new Float32Array(size * size); const o = [0, 0, 0, 0];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    fn(x / size, y / size, o); const i = y * size + x; h[i] = o[3];
    px[i * 4] = B(o[0]); px[i * 4 + 1] = B(o[1]); px[i * 4 + 2] = B(o[2]); px[i * 4 + 3] = B(o[3]);
  }
  return { px, h };
}

export function createVolcanicTextures(THREE, renderer, seed = 1, size = 512) {
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const N = makeNoise2D(seed * 13 + 5);
  const P = 8;
  // ---- BASALT: columnar-jointed plates, vesicle pits, fine grain ----
  const basalt = bake(size, (s, t, o) => {
    const u = s * P, v = t * P;
    const w = N.fbm(u * 1.3, v * 1.3, 3, 2, 0.5, P * 1.3) * 0.35;
    const [f1, f2, id] = N.worley(u * 2.5 + w, v * 2.5 - w, P * 2.5);
    const [g1, g2] = N.worley(u * 7 + 3.3, v * 7 + 1.1, P * 7);
    const [p1] = N.worley(u * 22 + 9.1, v * 22 + 4.7, P * 22);
    const crack = smoothstep(0.075, 0.0, f2 - f1), crack2 = smoothstep(0.05, 0.0, g2 - g1) * 0.55;
    const pit = smoothstep(0.22, 0.05, p1) * 0.6;
    const grain = N.fbm(u * 18, v * 18, 3, 2, 0.5, P * 18);
    const plate = 0.5 + 0.22 * (id - 0.5) + 0.12 * N.fbm(u * 3, v * 3, 3, 2, 0.5, P * 3);
    const hgt = clamp(plate + 0.08 * grain - 0.42 * crack - 0.18 * crack2 - 0.22 * pit, 0, 1);
    o[0] = clamp(0.36 + 0.26 * (id - 0.5) + 0.12 * grain - 0.25 * Math.max(crack, crack2) - 0.15 * pit, 0, 1);
    o[1] = Math.max(crack, crack2 * 0.6); o[2] = id; o[3] = hgt;
  });
  // ---- PAHOEHOE: ropy folded flow skin with cooling cracks ----
  const flow = bake(size, (s, t, o) => {
    const u = s * P, v = t * P;
    const warp = N.fbm(u * 0.9, v * 0.9, 4, 2, 0.5, P * 0.9);
    const lobe = N.fbm(u * 1.6 + 4, v * 1.6 - 2, 3, 2, 0.5, P * 1.6);
    const rope = Math.sin((v * 2 + warp * 3.2 + lobe * 1.2) * Math.PI * 2 * 3) * 0.5 + 0.5; // v*2*3 = integer cycles over P -> tiles
    const rope2 = Math.sin((u * 1 + warp * 2.0) * Math.PI * 2 * 5) * 0.5 + 0.5;
    const [f1, f2, id] = N.worley(u * 1.5 + warp, v * 1.5, P * 1.5);
    const crack = smoothstep(0.05, 0.0, f2 - f1);
    const fine = N.fbm(u * 24, v * 24, 2, 2, 0.5, P * 24);
    const lobeH = smoothstep(-0.25, 0.4, lobe);
    const hgt = clamp(0.35 + 0.3 * lobeH + 0.16 * rope * (0.4 + 0.6 * lobeH) + 0.05 * rope2 + 0.05 * fine - 0.4 * crack, 0, 1);
    o[0] = clamp(0.28 + 0.16 * rope * lobeH + 0.1 * fine + 0.12 * (id - 0.5) - 0.2 * crack, 0, 1);
    o[1] = crack; o[2] = clamp(lobe * 0.5 + 0.5, 0, 1); o[3] = hgt;
  });
  // ---- AA / SCORIA: jagged clinker rubble, oxidised reds ----
  const scoria = bake(size, (s, t, o) => {
    const u = s * P, v = t * P;
    const [a1, a2, id] = N.worley(u * 4, v * 4, P * 4);
    const [b1, , id2] = N.worley(u * 11 + 1.7, v * 11 + 8.2, P * 11);
    const rid = N.ridged(u * 3, v * 3, 4, 2, 0.55, P * 3);
    const lump = Math.pow(clamp(1 - a1 * 1.25, 0, 1), 1.3), lump2 = Math.pow(clamp(1 - b1 * 1.4, 0, 1), 1.5);
    const gap = smoothstep(0.12, 0.0, a2 - a1);
    const hgt = clamp(0.18 + 0.5 * lump + 0.25 * lump2 * (id2 > 0.3 ? 1 : 0.4) + 0.12 * rid - 0.25 * gap, 0, 1);
    const ox = smoothstep(0.35, 0.8, N.fbm(u * 1.2 + 7, v * 1.2 + 3, 3, 2, 0.5, P * 1.2) * 0.5 + 0.5 + (id - 0.5) * 0.4);
    o[0] = clamp(0.22 + 0.3 * hgt + 0.1 * (id2 - 0.5) - 0.12 * gap, 0, 1);
    o[1] = ox; o[2] = id; o[3] = hgt;
  });
  // ---- ASH: fine powder, wind ripples, dark lapilli specks ----
  const ash = bake(size, (s, t, o) => {
    const u = s * P, v = t * P;
    const warp = N.fbm(u * 0.7 + 11, v * 0.7, 3, 2, 0.5, P * 0.7);
    const rip = Math.sin((u * 1 + v * 0.5 + warp * 1.6) * Math.PI * 2 * 8) * 0.5 + 0.5; // (1, 0.5)*8 -> integer cycles
    const ripAmt = smoothstep(-0.3, 0.4, N.fbm(u * 1.1, v * 1.1 + 5, 3, 2, 0.5, P * 1.1));
    const [l1, , lid] = N.worley(u * 16 + 2, v * 16 + 6, P * 16);
    const lap = smoothstep(0.2, 0.06, l1) * (lid > 0.72 ? 1 : 0);
    const fine = N.fbm(u * 32, v * 32, 2, 2, 0.5, P * 32), mid = N.fbm(u * 3, v * 3, 4, 2, 0.5, P * 3);
    const hgt = clamp(0.45 + 0.12 * rip * ripAmt + 0.1 * mid + 0.04 * fine + 0.25 * lap, 0, 1);
    o[0] = clamp(0.62 + 0.07 * mid + 0.05 * fine + 0.04 * rip * ripAmt - 0.45 * lap, 0, 1);
    o[1] = lap; o[2] = clamp(mid * 0.5 + 0.5, 0, 1); o[3] = hgt;
  });
  const T = (b) => toTexture(THREE, b.px, size, aniso);
  const Nn = (b, k) => toTexture(THREE, heightToNormal(b.h, size, k * size / 512), size, aniso);
  return {
    basalt: T(basalt), basaltN: Nn(basalt, 7), flow: T(flow), flowN: Nn(flow, 5),
    scoria: T(scoria), scoriaN: Nn(scoria, 8), ash: T(ash), ashN: Nn(ash, 3),
  };
}

// Shared GLSL: palette ramps for the packed textures + triplanar helpers.
export const VOLC_GLSL = `
vec3 vtN(vec4 t){ return t.xyz * 2.0 - 1.0; }
vec2 vtHB(float h1, float a1, float h2, float a2){ float d = 0.28; float m = max(h1 + a1, h2 + a2) - d; float b1 = max(h1 + a1 - m, 0.0), b2 = max(h2 + a2 - m, 0.0); return vec2(b1, b2) / (b1 + b2 + 1e-5); }
vec3 vtRamp(vec3 dark, vec3 light, float l){ return mix(dark, light, smoothstep(0.08, 0.85, l)); }
`;
