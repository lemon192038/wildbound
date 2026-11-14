// World-map painter: an original, procedural fantasy sea chart rendered once into a large offscreen canvas
// (≈2400×1600), then shown/zoomed by worldMap.js. Deterministic (seeded) so the geography never changes.
//   paintWorldMap({ scale, labels }) → Promise<HTMLCanvasElement>
//   GEO: shared geography (port position, flavour regions, sea routes) in normalised map units (0..1).
// Layers: elevation/biome field on a coarse grid → per-pixel ocean/land shading (depth gradient, shallow halo,
// waves, hillshade, lava veins) → coast + ripple contours (marching squares) → rivers → hand-drawn glyphs
// (mountains, forests, volcanoes, dunes, fields, ruins, ships) → labels → compass, cartouche, border, parchment.
import { DESTINATIONS } from '../../shared/gamedata.js';

export const MAP_W = 2400, MAP_H = 1600, ASPECT = MAP_W / MAP_H;

// ------------------------------------------------------------------ geography
const D = (id) => DESTINATIONS[id].map;
export const GEO = {
  port: { x: 0.392, y: 0.6 },
  // land masses: [cx, cy, rx, ry] (ellipse influence, domain-warped)
  blobs: [
    // western continent (home: the Halvane Marches, Thornwood)
    [0.25, 0.55, 0.15, 0.3], [0.17, 0.3, 0.12, 0.14], [0.31, 0.38, 0.08, 0.1], [0.32, 0.7, 0.09, 0.13], [0.38, 0.6, 0.035, 0.05], [0.13, 0.66, 0.07, 0.12], [0.24, 0.84, 0.06, 0.06],
    // frozen north
    [0.52, 0.09, 0.2, 0.075], [0.4, 0.13, 0.07, 0.05], [0.79, 0.11, 0.12, 0.065], [0.66, 0.17, 0.035, 0.03],
    // the Cinder Reach archipelago
    [0.61, 0.535, 0.06, 0.1], [0.695, 0.495, 0.04, 0.055], [0.552, 0.44, 0.04, 0.05], [0.585, 0.64, 0.05, 0.05], [0.64, 0.45, 0.03, 0.04],
    [0.725, 0.61, 0.018, 0.024], [0.665, 0.37, 0.016, 0.02], [0.515, 0.565, 0.014, 0.02], [0.67, 0.68, 0.02, 0.022],
    // eastern wilds
    [0.9, 0.46, 0.09, 0.26], [0.85, 0.76, 0.08, 0.09], [0.84, 0.3, 0.05, 0.08],
    // southern dunes
    [0.52, 0.93, 0.17, 0.065], [0.42, 0.87, 0.05, 0.04], [0.7, 0.9, 0.05, 0.04],
    // scattered isles
    [0.06, 0.18, 0.025, 0.03], [0.44, 0.33, 0.018, 0.024], [0.47, 0.72, 0.02, 0.025], [0.97, 0.88, 0.03, 0.04], [0.06, 0.88, 0.02, 0.03],
  ],
  // biome seeds: [x, y, biome]
  seeds: [
    [0.3, 0.6, 'fields'], [0.24, 0.72, 'fields'], [0.36, 0.67, 'fields'], [0.2, 0.55, 'fields'], [0.33, 0.48, 'fields'],
    [0.16, 0.3, 'forest'], [0.26, 0.36, 'forest'], [0.1, 0.42, 'forest'], [0.12, 0.66, 'forest'],
    [0.5, 0.08, 'frozen'], [0.38, 0.14, 'frozen'], [0.8, 0.1, 'frozen'], [0.65, 0.16, 'frozen'], [0.06, 0.16, 'frozen'], [0.6, 0.06, 'frozen'],
    [0.61, 0.53, 'volcanic'], [0.69, 0.49, 'volcanic'], [0.555, 0.44, 'volcanic'], [0.585, 0.64, 'volcanic'], [0.64, 0.45, 'volcanic'], [0.72, 0.61, 'volcanic'], [0.665, 0.37, 'volcanic'], [0.67, 0.68, 'volcanic'], [0.515, 0.565, 'volcanic'],
    [0.9, 0.42, 'jungle'], [0.85, 0.75, 'jungle'], [0.84, 0.28, 'forest'], [0.92, 0.6, 'jungle'],
    [0.52, 0.93, 'desert'], [0.42, 0.87, 'desert'], [0.7, 0.9, 'desert'], [0.24, 0.85, 'desert'], [0.97, 0.88, 'desert'], [0.06, 0.88, 'desert'],
    [0.44, 0.33, 'forest'], [0.47, 0.72, 'fields'],
  ],
  // flavour regions (not selectable): label anchors in map units
  regions: [
    { id: 'marches', x: 0.215, y: 0.6, size: 1, rot: -0.12, biome: 'fields', home: true },
    { id: 'thornwood', x: 0.18, y: 0.33, size: 0.9, rot: 0.1, biome: 'forest' },
    { id: 'rimefrost', x: 0.55, y: 0.1, size: 1.05, rot: 0, biome: 'frozen' },
    { id: 'verdalune', x: 0.895, y: 0.5, size: 0.85, rot: -1.35, biome: 'jungle' },
    { id: 'sunscar', x: 0.53, y: 0.935, size: 0.95, rot: 0.02, biome: 'desert' },
  ],
  seas: [
    { id: 'gloaming', x: 0.055, y: 0.5, rot: -1.5 }, { id: 'embers', x: 0.5, y: 0.66, rot: -0.35 },
    { id: 'pale', x: 0.66, y: 0.27, rot: 0.08 }, { id: 'saltwind', x: 0.3, y: 0.97, rot: 0 }, { id: 'drift', x: 0.77, y: 0.82, rot: 0.25 },
  ],
  volcano: { x: 0.606, y: 0.52 },
  ruins: [[0.21, 0.44], [0.86, 0.33], [0.47, 0.88]],
  ships: [[0.46, 0.55, 0.2], [0.12, 0.82, -0.3], [0.7, 0.3, 0.5], [0.33, 0.27, 0], [0.78, 0.6, -0.2], [0.95, 0.15, 0.3]],
};
// Sea route (Port Halvane → destination), normalised points for a Catmull-Rom curve.
export function routeFor(destId) {
  const p = GEO.port, d = D(destId);
  const via = { ember_foothills: [[0.45, 0.62], [0.52, 0.66]], ashfang_wastes: [[0.46, 0.57], [0.53, 0.5], [0.6, 0.41], [0.67, 0.43]], cinderdeep_hollow: [[0.45, 0.56], [0.5, 0.49]] }[destId] || [[0.46, 0.58]];
  return [[p.x, p.y], ...via, [d.x, d.y]];
}
export function catmull(pts, n = 16) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map((j) => 0.5 * ((2 * p1[j]) + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3)));
    }
  }
  out.push(pts[pts.length - 1]); return out;
}

// ------------------------------------------------------------------ noise
function hash(x, y, s) { let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967295; }
function vnoise(x, y, s = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi; const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, oct, s = 0) { let f = 0, a = 0.5, fr = 1, n = 0; for (let i = 0; i < oct; i++) { f += a * vnoise(x * fr, y * fr, s + i * 31); n += a; fr *= 2.03; a *= 0.5; } return f / n; }
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };

// ------------------------------------------------------------------ palettes (r,g,b)
const BIOME = {
  fields: { lo: [128, 146, 74], hi: [160, 158, 96], mtn: [126, 112, 84] },
  forest: { lo: [62, 92, 52], hi: [84, 108, 64], mtn: [104, 98, 80] },
  jungle: { lo: [86, 112, 48], hi: [116, 128, 58], mtn: [110, 104, 72] },
  frozen: { lo: [222, 230, 236], hi: [240, 244, 248], mtn: [190, 200, 214] },
  desert: { lo: [206, 170, 112], hi: [222, 190, 134], mtn: [170, 128, 84] },
  volcanic: { lo: [52, 42, 40], hi: [70, 54, 48], mtn: [36, 30, 30] },
};
const BIOMES = Object.keys(BIOME);

// ------------------------------------------------------------------ field (coarse grid)
const GW = 480, GH = 320;
let fieldCache = null;
function elevation(u, v) {
  const wu = u + (fbm(u * 5, v * 5, 7, 11) - 0.5) * 0.07, wv = v + (fbm(u * 5 + 9, v * 5 + 3, 7, 23) - 0.5) * 0.07;
  let h = -1;
  for (const [cx, cy, rx, ry] of GEO.blobs) { const dx = (wu - cx) / rx, dy = (wv - cy) / ry; const e = 1 - Math.sqrt(dx * dx + dy * dy); if (e > h) h = e; }
  h += (fbm(u * 11, v * 11, 5, 3) - 0.5) * 0.55;
  return h;
}
export function field() {
  if (fieldCache) return fieldCache;
  const M = new Float32Array(GW * GH), WB = new Float32Array(GW * GH), RG = new Float32Array(GW * GH), H = new Float32Array(GW * GH), B = new Uint8Array(GW * GH), C = new Float32Array(GW * GH * 3), V = new Float32Array(GW * GH), S = new Float32Array(GW * GH);
  const seedB = GEO.seeds.map((s) => BIOMES.indexOf(s[2]));
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
    const u = (i + 0.5) / GW, v = (j + 0.5) / GH, k = j * GW + i; H[k] = elevation(u, v);
    M[k] = fbm(u * 14, v * 9.5, 3, 13); WB[k] = vnoise(u * 9.6, v * 19, 5); RG[k] = 1 - Math.abs(2 * fbm(u * 7, v * 7, 3, 71) - 1);
    // biome: nearest two seeds (warped), blended across a ragged band
    const wu = u + (fbm(u * 8, v * 8, 4, 41) - 0.5) * 0.08, wv = v + (fbm(u * 8 + 5, v * 8, 4, 43) - 0.5) * 0.08;
    let d1 = 9, d2 = 9, b1 = 0, b2 = 0;
    for (let s = 0; s < GEO.seeds.length; s++) {
      const dx = (wu - GEO.seeds[s][0]) * ASPECT, dy = wv - GEO.seeds[s][1]; const d = dx * dx + dy * dy;
      if (d < d1) { if (seedB[s] !== b1) { d2 = d1; b2 = b1; } d1 = d; b1 = seedB[s]; } else if (d < d2 && seedB[s] !== b1) { d2 = d; b2 = seedB[s]; }
    }
    const t = 0.5 + 0.5 * smooth(0, 0.012, Math.sqrt(d2) - Math.sqrt(d1)); B[k] = b1;
    const h = H[k]; const P1 = BIOME[BIOMES[b1]], P2 = BIOME[BIOMES[b2]];
    const mix = (P) => { const m = smooth(0.42, 0.85, h); const n = fbm(u * 30, v * 30, 2, 51); return [0, 1, 2].map((c) => (P.lo[c] + (P.hi[c] - P.lo[c]) * n) * (1 - m) + P.mtn[c] * m); };
    const c1 = mix(P1), c2 = mix(P2);
    for (let c = 0; c < 3; c++) C[k * 3 + c] = c1[c] * t + c2[c] * (1 - t);
    V[k] = (BIOMES[b1] === 'volcanic' ? t : 0) + (BIOMES[b2] === 'volcanic' ? 1 - t : 0);
  }
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
    const k = j * GW + i; const hx = H[j * GW + Math.min(GW - 1, i + 1)] - H[j * GW + Math.max(0, i - 1)], hy = H[Math.min(GH - 1, j + 1) * GW + i] - H[Math.max(0, j - 1) * GW + i];
    S[k] = clamp(1 - (hx + hy) * 9, 0.55, 1.45); // light from the north-west
  }
  return (fieldCache = { H, B, C, V, S, M, WB, RG });
}
const sampleF = (A, x, y, stride = 1, c = 0) => { // bilinear sample of a grid array at grid coords
  x = clamp(x, 0, GW - 1.001); y = clamp(y, 0, GH - 1.001); const i = x | 0, j = y | 0, fx = x - i, fy = y - j;
  const a = A[(j * GW + i) * stride + c], b = A[(j * GW + i + 1) * stride + c], d = A[((j + 1) * GW + i) * stride + c], e = A[((j + 1) * GW + i + 1) * stride + c];
  return (a * (1 - fx) + b * fx) * (1 - fy) + (d * (1 - fx) + e * fx) * fy;
};
export const heightAt = (u, v) => sampleF(field().H, u * GW - 0.5, v * GH - 0.5);
export const biomeAt = (u, v) => BIOMES[field().B[clamp(Math.floor(v * GH), 0, GH - 1) * GW + clamp(Math.floor(u * GW), 0, GW - 1)]];

// ------------------------------------------------------------------ painter
const yieldFrame = () => new Promise((r) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => r()) : setTimeout(r, 0)));
export async function paintWorldMap({ scale = 1, labels = {}, serif = 'Cinzel, Georgia, serif', serifJa = '' } = {}) {
  const W = Math.round(MAP_W * scale), Hh = Math.round(MAP_H * scale);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = Hh; const g = cv.getContext('2d');
  const F = field(); await yieldFrame();
  // ---- pixels
  const img = g.createImageData(W, Hh); const px = img.data; const sx = GW / W, sy = GH / Hh;
  const deep = [30, 58, 70], mid = [52, 92, 102], shallow = [92, 136, 138], halo = [170, 202, 196];
  for (let y = 0; y < Hh; y++) {
    if (y % 160 === 0 && y) await yieldFrame();
    const gy = y * sy - 0.5;
    for (let x = 0; x < W; x++) {
      const gx = x * sx - 0.5; const h = sampleF(F.H, gx, gy); const o = (y * W + x) * 4; let r, gg, b;
      const fine = vnoise(x * 0.11 / scale, y * 0.11 / scale, 77) - 0.5;
      if (h < 0) {
        const dpt = clamp(-h / 0.75); const t1 = smooth(0, 0.35, dpt), t2 = smooth(0.3, 1, dpt);
        r = shallow[0] + (mid[0] - shallow[0]) * t1 + (deep[0] - mid[0]) * t2; gg = shallow[1] + (mid[1] - shallow[1]) * t1 + (deep[1] - mid[1]) * t2; b = shallow[2] + (mid[2] - shallow[2]) * t1 + (deep[2] - mid[2]) * t2;
        const hl = 1 - smooth(0, 0.06, -h); r += (halo[0] - r) * hl * 0.55; gg += (halo[1] - gg) * hl * 0.55; b += (halo[2] - b) * hl * 0.55;
        // wave texture: wobbling horizontal swell lines + mottling
        const wob = sampleF(F.WB, gx, gy) * 9;
        const wave = Math.sin((y / scale) * 0.55 + wob + Math.sin(x * 0.013 / scale) * 1.6); const wm = smooth(0.82, 1, wave) * (0.5 + wob * 0.06) * 7;
        const mot = (sampleF(F.M, gx, gy) - 0.5) * 14;
        r += wm + mot + fine * 5; gg += wm + mot + fine * 5; b += wm + mot * 0.8 + fine * 5;
      } else {
        r = sampleF(F.C, gx, gy, 3, 0); gg = sampleF(F.C, gx, gy, 3, 1); b = sampleF(F.C, gx, gy, 3, 2);
        const sh = sampleF(F.S, gx, gy); r *= sh; gg *= sh; b *= sh;
        const shore = 1 - smooth(0, 0.035, h); r += (214 - r) * shore * 0.35; gg += (196 - gg) * shore * 0.35; b += (150 - b) * shore * 0.35;
        const grain = fine * 18 + (vnoise(x * 0.035 / scale, y * 0.035 / scale, 19) - 0.5) * 14; r += grain; gg += grain; b += grain * 0.8;
        const vol = sampleF(F.V, gx, gy);
        if (vol > 0.4) { // lava veins: ridged noise threads glowing through the charred ground
          const n = vnoise(x * 0.016 / scale, y * 0.016 / scale, 101) * 0.65 + vnoise(x * 0.05 / scale, y * 0.05 / scale, 103) * 0.35;
          const ridge = 1 - Math.abs(n * 2 - 1); const glow = 0.85 * smooth(0.925, 0.99, ridge) * smooth(0.4, 0.8, vol) * smooth(0.04, 0.12, h);
          r += (255 - r) * glow; gg += (120 - gg) * glow; b += (30 - b) * glow;
          const ember = smooth(0.8, 0.9, ridge) * smooth(0.4, 0.8, vol) * 0.35; r += 90 * ember; gg += 20 * ember;
        }
      }
      px[o] = r; px[o + 1] = gg; px[o + 2] = b; px[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0); await yieldFrame();
  g.save(); g.scale(scale, scale); // from here on: draw in 2400×1600 map pixels
  const X = (u) => u * MAP_W, Y = (v) => v * MAP_H;
  contours(g, F.H, -0.07, 'rgba(225,240,236,0.10)', 1.2);
  contours(g, F.H, -0.03, 'rgba(230,244,240,0.18)', 1.3);
  contours(g, F.H, 0.0, 'rgba(250,248,235,0.35)', 4.5);
  contours(g, F.H, 0.0, 'rgba(36,28,22,0.85)', 2.1);
  rivers(g, F);
  glyphs(g, F, X, Y);
  ships(g, X, Y);
  await yieldFrame();
  paintLabels(g, labels, serif, serifJa, X, Y);
  compass(g, X(0.075), Y(0.79), 92);
  cartouche(g, labels, serif, serifJa);
  g.restore();
  parchment(g, W, Hh, scale);
  border(g, W, Hh, scale);
  return cv;
}

// ------------------------------------------------------------------ marching squares contours
function contours(g, H, lvl, style, width) {
  const cw = MAP_W / GW, ch = MAP_H / GH; g.beginPath();
  const P = (i, j) => [(i + 0.5) * cw, (j + 0.5) * ch];
  for (let j = 0; j < GH - 1; j++) for (let i = 0; i < GW - 1; i++) {
    const a = H[j * GW + i] - lvl, b = H[j * GW + i + 1] - lvl, c = H[(j + 1) * GW + i + 1] - lvl, d = H[(j + 1) * GW + i] - lvl;
    const idx = (a > 0 ? 8 : 0) | (b > 0 ? 4 : 0) | (c > 0 ? 2 : 0) | (d > 0 ? 1 : 0); if (idx === 0 || idx === 15) continue;
    const [x0, y0] = P(i, j);
    const e = { t: [x0 + cw * (a / (a - b)), y0], r: [x0 + cw, y0 + ch * (b / (b - c))], b: [x0 + cw * (d / (d - c)), y0 + ch], l: [x0, y0 + ch * (a / (a - d))] };
    const segs = { 1: ['l', 'b'], 2: ['b', 'r'], 3: ['l', 'r'], 4: ['t', 'r'], 5: ['l', 't', 'b', 'r'], 6: ['t', 'b'], 7: ['l', 't'], 8: ['l', 't'], 9: ['t', 'b'], 10: ['t', 'r', 'l', 'b'], 11: ['t', 'r'], 12: ['l', 'r'], 13: ['b', 'r'], 14: ['l', 'b'] }[idx];
    for (let s = 0; s < segs.length; s += 2) { g.moveTo(...e[segs[s]]); g.lineTo(...e[segs[s + 1]]); }
  }
  g.strokeStyle = style; g.lineWidth = width; g.lineCap = 'round'; g.lineJoin = 'round'; g.stroke();
}

// ------------------------------------------------------------------ rivers
function rivers(g, F) {
  const starts = [[0.2, 0.36], [0.27, 0.5], [0.15, 0.6], [0.3, 0.72], [0.9, 0.4], [0.86, 0.72], [0.82, 0.3], [0.5, 0.1]];
  for (const [su, sv] of starts) {
    let u = su, v = sv; const pts = [];
    for (let k = 0; k < 400; k++) {
      pts.push([u * MAP_W, v * MAP_H]); const h = heightAt(u, v); if (h < -0.01) break;
      const e = 0.004; const gx = heightAt(u + e, v) - heightAt(u - e, v), gy = heightAt(u, v + e) - heightAt(u, v - e); const l = Math.hypot(gx, gy) || 1;
      const wob = (vnoise(u * 40, v * 40, 61) - 0.5) * 1.6;
      const dx = -gx / l, dy = -gy / l; u += (dx * Math.cos(wob) - dy * Math.sin(wob)) * 0.0035; v += (dx * Math.sin(wob) + dy * Math.cos(wob)) * 0.0035 * ASPECT;
    }
    if (pts.length < 12) continue;
    const frozen = biomeAt(su, sv) === 'frozen';
    for (let pass = 0; pass < 2; pass++) {
      for (let k = 1; k < pts.length; k++) {
        g.beginPath(); g.moveTo(...pts[k - 1]); g.lineTo(...pts[k]);
        const w = 1 + (k / pts.length) * 3.2; g.lineWidth = pass ? w : w + 2.2; g.lineCap = 'round';
        g.strokeStyle = pass ? (frozen ? 'rgba(150,190,215,0.95)' : 'rgba(84,138,160,0.95)') : 'rgba(40,52,48,0.35)'; g.stroke();
      }
    }
  }
}

// ------------------------------------------------------------------ glyphs
function glyphs(g, F, X, Y) {
  const R = rng(1337); const list = [];
  const step = 26;
  for (let y = step; y < MAP_H - step; y += step * 0.8) for (let x = step; x < MAP_W - step; x += step) {
    const px = x + (R() - 0.5) * step * 0.9, py = y + (R() - 0.5) * step * 0.7; const u = px / MAP_W, v = py / MAP_H;
    const h = heightAt(u, v); if (h < 0.06) continue; const b = biomeAt(u, v); const r = R();
    // keep marker and label areas readable
    if (Math.hypot((u - GEO.port.x) * ASPECT, v - GEO.port.y) < 0.03) continue;
    if (Object.values(DESTINATIONS).some((d) => Math.hypot((u - d.map.x) * ASPECT, v - d.map.y) < 0.028)) continue;
    if (Math.hypot((u - GEO.volcano.x) * ASPECT, v - GEO.volcano.y) < 0.05) continue;
    if (GEO.regions.some((L) => { const dx = u - L.x, dy = v - L.y, c = Math.cos(-L.rot), sn = Math.sin(-L.rot); const lx = (dx * c - dy * sn / ASPECT), ly = (dx * sn * ASPECT + dy * c); return Math.abs(lx) < 0.1 * L.size && Math.abs(ly) < 0.03; })) continue;
    const ridge = sampleF(F.RG, u * GW - 0.5, v * GH - 0.5);
    if (b === 'volcanic') { if (h > 0.3 && ridge > 0.6 && r < 0.6) list.push(['spire', px, py, 0.6 + h * 0.9, R()]); else if (r < 0.2) list.push(['crack', px, py, 1, R()]); else if (r < 0.28) list.push(['smoke', px, py, 1, R()]); continue; }
    if (h > 0.45 && ridge > 0.72 && r < 0.8) { list.push(['mountain', px, py, 0.75 + (h - 0.5) * 1.6, R(), b]); continue; }
    if (b === 'forest' && r < 0.8) list.push(['tree', px, py, 0.9 + R() * 0.3, R(), '#2f4a2a', '#4f7040']);
    else if (b === 'jungle' && r < 0.75) list.push(['palm', px, py, 0.9 + R() * 0.3, R()]);
    else if (b === 'fields') { if (r < 0.14) list.push(['farm', px, py, 1, R()]); else if (r < 0.32) list.push(['tree', px, py, 0.75, R(), '#3e5a2c', '#6c8a46']); else if (h > 0.38 && ridge > 0.55 && r < 0.5) list.push(['hill', px, py, 1, R(), b]); }
    else if (b === 'frozen') { if (r < 0.22) list.push(['tree', px, py, 0.8, R(), '#5d7380', '#dfe9ef']); else if (r < 0.32) list.push(['ice', px, py, 1, R()]); else if (h > 0.35 && r < 0.5) list.push(['hill', px, py, 1, R(), b]); }
    else if (b === 'desert') { if (r < 0.3) list.push(['dune', px, py, 1, R()]); else if (r < 0.36) list.push(['mesa', px, py, 1, R()]); }
  }
  list.push(['volcano', X(GEO.volcano.x), Y(GEO.volcano.y), 2.4, 0]);
  list.push(['volcano', X(0.692), Y(0.47), 1.1, 0.4]);
  for (const [u, v] of GEO.ruins) list.push(['ruin', X(u), Y(v), 1.2, R()]);
  list.push(['town', X(GEO.port.x) - 26, Y(GEO.port.y) - 4, 1.3, 0]);
  list.sort((a, b) => a[2] - b[2]);
  for (const it of list) drawGlyph(g, ...it);
}
const INK = 'rgba(38,28,20,0.9)';
function drawGlyph(g, kind, x, y, s, r, a, b) {
  g.save(); g.translate(x, y); g.scale(s, s); g.lineJoin = 'round'; g.lineCap = 'round';
  switch (kind) {
    case 'mountain': {
      const w = 22 + r * 10, h = 22 + r * 12; const pal = { frozen: ['#c8d3de', '#8d9cae', '#fff'], desert: ['#c99a62', '#8e623a', '#e8cf9e'], forest: ['#9a927a', '#5e5848', '#ece8dc'], jungle: ['#9a9470', '#5e5a40', '#ece8dc'] }[a] || ['#a69a7c', '#665b45', '#f2eee4'];
      shadow(g, w * 1.1, 4);
      g.beginPath(); g.moveTo(-w, 0); g.lineTo(-w * 0.15, -h); g.lineTo(w * 0.1, -h * 0.82); g.lineTo(w, 0); g.closePath(); g.fillStyle = pal[0]; g.fill();
      g.beginPath(); g.moveTo(-w * 0.15, -h); g.lineTo(w * 0.1, -h * 0.82); g.lineTo(w, 0); g.lineTo(w * 0.05, 0); g.lineTo(-w * 0.05, -h * 0.5); g.closePath(); g.fillStyle = pal[1]; g.fill();
      if (s > 0.95 || a === 'frozen') { g.beginPath(); g.moveTo(-w * 0.42, -h * 0.62); g.lineTo(-w * 0.15, -h); g.lineTo(w * 0.1, -h * 0.82); g.lineTo(w * 0.3, -h * 0.58); g.lineTo(w * 0.05, -h * 0.66); g.lineTo(-w * 0.12, -h * 0.55); g.closePath(); g.fillStyle = pal[2]; g.fill(); }
      g.beginPath(); g.moveTo(-w, 0); g.lineTo(-w * 0.15, -h); g.lineTo(w * 0.1, -h * 0.82); g.lineTo(w, 0); g.strokeStyle = INK; g.lineWidth = 1.6; g.stroke();
      g.beginPath(); g.moveTo(-w * 0.15, -h); g.lineTo(-w * 0.05, -h * 0.5); g.lineTo(-w * 0.2, -h * 0.2); g.moveTo(w * 0.35, -h * 0.5); g.lineTo(w * 0.5, -h * 0.2); g.lineWidth = 1; g.stroke();
      break;
    }
    case 'hill': {
      const w = 16 + r * 6; const c = a === 'frozen' ? '#e6edf2' : '#8e9a5c';
      g.beginPath(); g.moveTo(-w, 0); g.quadraticCurveTo(0, -w * 0.9, w, 0); g.fillStyle = c; g.fill(); g.strokeStyle = 'rgba(38,28,20,0.6)'; g.lineWidth = 1.3; g.stroke();
      g.beginPath(); g.moveTo(w * 0.2, -w * 0.38); g.quadraticCurveTo(w * 0.6, -w * 0.2, w * 0.8, 0); g.stroke(); break;
    }
    case 'tree': {
      const n = 3 + Math.floor(r * 3);
      for (let k = 0; k < n; k++) {
        const ox = (k - n / 2) * 7 + Math.sin(k * 7 + r * 10) * 3, oy = (k % 2) * 5 - 2, h = 14 + ((k * 37 + r * 50) % 7);
        g.fillStyle = 'rgba(20,24,14,0.25)'; g.beginPath(); g.ellipse(ox + 3, oy + 1, 5, 2, 0, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.moveTo(ox - 5.5, oy); g.lineTo(ox, oy - h); g.lineTo(ox + 5.5, oy); g.closePath(); g.fillStyle = a; g.fill();
        g.beginPath(); g.moveTo(ox, oy - h); g.lineTo(ox + 5.5, oy); g.lineTo(ox + 1, oy); g.closePath(); g.fillStyle = 'rgba(0,0,0,0.22)'; g.fill();
        g.beginPath(); g.moveTo(ox - 2, oy - h * 0.5); g.lineTo(ox, oy - h); g.strokeStyle = b; g.lineWidth = 1.2; g.stroke();
        g.beginPath(); g.moveTo(ox - 5.5, oy); g.lineTo(ox, oy - h); g.lineTo(ox + 5.5, oy); g.strokeStyle = 'rgba(25,30,18,0.7)'; g.lineWidth = 0.9; g.stroke();
      }
      break;
    }
    case 'palm': {
      for (let k = 0; k < 3; k++) {
        const ox = (k - 1) * 9 + r * 3, oy = (k % 2) * 4;
        g.strokeStyle = '#5b4a2e'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(ox, oy); g.quadraticCurveTo(ox + 2, oy - 8, ox + 1, oy - 14); g.stroke();
        g.fillStyle = k % 2 ? '#476a26' : '#3b5a20'; g.beginPath(); g.ellipse(ox + 1, oy - 15, 8, 4.5, r, 0, Math.PI * 2); g.fill(); g.strokeStyle = 'rgba(25,30,18,0.6)'; g.lineWidth = 0.8; g.stroke();
      }
      break;
    }
    case 'farm': {
      g.rotate((r - 0.5) * 0.6); const w = 22, h = 14; g.fillStyle = r < 0.5 ? '#c7b46a' : '#9fb05a'; g.fillRect(-w / 2, -h / 2, w, h);
      g.strokeStyle = 'rgba(80,70,30,0.55)'; g.lineWidth = 0.8; g.beginPath(); for (let k = -w / 2 + 3; k < w / 2; k += 3) { g.moveTo(k, -h / 2); g.lineTo(k, h / 2); } g.stroke();
      g.strokeStyle = 'rgba(38,28,20,0.6)'; g.lineWidth = 1; g.strokeRect(-w / 2, -h / 2, w, h); break;
    }
    case 'dune': {
      g.strokeStyle = 'rgba(120,80,40,0.65)'; g.lineWidth = 1.5;
      for (let k = 0; k < 2; k++) { g.beginPath(); g.moveTo(-14 + k * 8, k * 6); g.quadraticCurveTo(-2 + k * 8, -8 + k * 6, 12 + k * 8, k * 6); g.stroke(); }
      g.fillStyle = 'rgba(150,100,50,0.18)'; g.beginPath(); g.moveTo(-2, -4); g.quadraticCurveTo(6, -2, 12, 0); g.lineTo(-2, 0); g.fill(); break;
    }
    case 'mesa': {
      g.fillStyle = '#b77a48'; g.beginPath(); g.moveTo(-14, 0); g.lineTo(-9, -12); g.lineTo(9, -12); g.lineTo(14, 0); g.closePath(); g.fill();
      g.fillStyle = '#8d5634'; g.fillRect(2, -12, 7, 12); g.strokeStyle = INK; g.lineWidth = 1.2; g.beginPath(); g.moveTo(-14, 0); g.lineTo(-9, -12); g.lineTo(9, -12); g.lineTo(14, 0); g.stroke(); break;
    }
    case 'ice': {
      g.fillStyle = '#bfe6f5'; g.strokeStyle = 'rgba(60,100,130,0.85)'; g.lineWidth = 1;
      for (const [ox, h] of [[-6, 16], [1, 22], [7, 12]]) { g.beginPath(); g.moveTo(ox - 4, 0); g.lineTo(ox, -h); g.lineTo(ox + 4, 0); g.closePath(); g.fill(); g.stroke(); }
      break;
    }
    case 'spire': {
      const w = 12 + r * 8, h = 20 + r * 16; shadow(g, w, 3);
      g.beginPath(); g.moveTo(-w, 0); g.lineTo(-w * 0.35, -h * 0.7); g.lineTo(-w * 0.1, -h); g.lineTo(w * 0.25, -h * 0.65); g.lineTo(w, 0); g.closePath(); g.fillStyle = '#2b2321'; g.fill();
      g.beginPath(); g.moveTo(-w * 0.1, -h); g.lineTo(w * 0.25, -h * 0.65); g.lineTo(w, 0); g.lineTo(0, 0); g.closePath(); g.fillStyle = '#161112'; g.fill();
      g.strokeStyle = 'rgba(255,110,40,0.75)'; g.lineWidth = 1.3; g.beginPath(); g.moveTo(-w * 0.1, -h); g.lineTo(-w * 0.2, -h * 0.55); g.lineTo(-w * 0.05, -h * 0.25); g.stroke();
      g.strokeStyle = 'rgba(10,6,6,0.9)'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(-w, 0); g.lineTo(-w * 0.35, -h * 0.7); g.lineTo(-w * 0.1, -h); g.lineTo(w * 0.25, -h * 0.65); g.lineTo(w, 0); g.stroke(); break;
    }
    case 'crack': {
      g.rotate(r * 6); g.shadowColor = 'rgba(255,120,30,0.9)'; g.shadowBlur = 8; g.strokeStyle = '#ff9a3a'; g.lineWidth = 1.8;
      g.beginPath(); g.moveTo(-10, 2); g.lineTo(-3, -1); g.lineTo(2, 3); g.lineTo(10, -2); g.moveTo(2, 3); g.lineTo(4, 9); g.stroke(); g.shadowBlur = 0; break;
    }
    case 'smoke': {
      g.fillStyle = 'rgba(60,52,50,0.35)'; for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(k * 5 - 4, -k * 7, 5 + k * 2, 0, Math.PI * 2); g.fill(); } break;
    }
    case 'volcano': {
      const w = 34, h = 30; const lava = g.createRadialGradient(0, -h, 2, 0, -h, 60); lava.addColorStop(0, 'rgba(255,170,60,0.85)'); lava.addColorStop(0.4, 'rgba(255,80,20,0.35)'); lava.addColorStop(1, 'rgba(255,40,0,0)');
      g.fillStyle = lava; g.beginPath(); g.arc(0, -h, 60, 0, Math.PI * 2); g.fill(); shadow(g, w * 1.2, 5);
      g.beginPath(); g.moveTo(-w, 0); g.lineTo(-8, -h); g.lineTo(8, -h); g.lineTo(w, 0); g.closePath(); g.fillStyle = '#2d2422'; g.fill();
      g.beginPath(); g.moveTo(0, -h); g.lineTo(8, -h); g.lineTo(w, 0); g.lineTo(4, 0); g.closePath(); g.fillStyle = '#171112'; g.fill();
      g.shadowColor = 'rgba(255,120,30,1)'; g.shadowBlur = 10; g.strokeStyle = '#ff8a2a'; g.lineWidth = 2.4;
      g.beginPath(); g.moveTo(-3, -h); g.quadraticCurveTo(-8, -h * 0.6, -4, -h * 0.3); g.quadraticCurveTo(-1, -h * 0.15, -6, 0); g.moveTo(4, -h); g.quadraticCurveTo(9, -h * 0.55, 14, -h * 0.2); g.stroke();
      g.fillStyle = '#ffcf6a'; g.beginPath(); g.ellipse(0, -h, 8, 2.6, 0, 0, Math.PI * 2); g.fill(); g.shadowBlur = 0;
      g.fillStyle = 'rgba(70,60,58,0.55)'; for (let k = 0; k < 5; k++) { g.beginPath(); g.arc(4 + k * 5 + Math.sin(k) * 3, -h - 10 - k * 9, 6 + k * 2.4, 0, Math.PI * 2); g.fill(); }
      g.strokeStyle = 'rgba(10,6,6,0.9)'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(-w, 0); g.lineTo(-8, -h); g.lineTo(8, -h); g.lineTo(w, 0); g.stroke(); break;
    }
    case 'ruin': {
      g.fillStyle = '#b9ac90'; g.strokeStyle = INK; g.lineWidth = 1.1;
      for (const [ox, h] of [[-10, 14], [-3, 20], [5, 10], [11, 16]]) { g.fillRect(ox - 2.5, -h, 5, h); g.strokeRect(ox - 2.5, -h, 5, h); }
      g.beginPath(); g.moveTo(-12, -16); g.lineTo(-1, -22); g.stroke(); g.fillStyle = 'rgba(38,28,20,0.4)'; g.fillRect(-14, 0, 30, 2); break;
    }
    case 'town': {
      g.strokeStyle = INK; g.lineWidth = 1.2;
      for (const [ox, w, h, c] of [[-12, 9, 9, '#c9b48a'], [-2, 10, 13, '#d8c49a'], [9, 8, 8, '#bfa77c']]) {
        g.fillStyle = c; g.fillRect(ox - w / 2, -h, w, h); g.strokeRect(ox - w / 2, -h, w, h);
        g.fillStyle = '#8c3b2a'; g.beginPath(); g.moveTo(ox - w / 2 - 1.5, -h); g.lineTo(ox, -h - 7); g.lineTo(ox + w / 2 + 1.5, -h); g.closePath(); g.fill(); g.stroke();
      }
      g.fillStyle = '#e6d6aa'; g.fillRect(16, -24, 4, 24); g.strokeRect(16, -24, 4, 24); break;
    }
  }
  g.restore();
}
function shadow(g, w, h) { g.fillStyle = 'rgba(20,14,8,0.22)'; g.beginPath(); g.ellipse(w * 0.25, 1, w, h, 0, 0, Math.PI * 2); g.fill(); }

export function drawShip(g, x, y, s = 1, rot = 0, sail = '#efe4c8') {
  g.save(); g.translate(x, y); g.rotate(rot); g.scale(s, s); g.lineJoin = 'round';
  g.fillStyle = 'rgba(255,255,255,0.25)'; g.beginPath(); g.ellipse(-14, 3, 14, 2.2, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#5a3a22'; g.strokeStyle = 'rgba(20,12,6,0.95)'; g.lineWidth = 1.2;
  g.beginPath(); g.moveTo(-16, -2); g.lineTo(16, -2); g.lineTo(11, 5); g.lineTo(-12, 5); g.closePath(); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(0, -2); g.lineTo(0, -28); g.moveTo(-9, -2); g.lineTo(-9, -20); g.stroke();
  g.fillStyle = sail; g.beginPath(); g.moveTo(1, -26); g.quadraticCurveTo(12, -16, 1, -5); g.closePath(); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(-8, -19); g.quadraticCurveTo(0, -12, -8, -5); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = '#a3302a'; g.beginPath(); g.moveTo(0, -28); g.lineTo(7, -26); g.lineTo(0, -24); g.fill();
  g.restore();
}
function ships(g, X, Y) { for (const [u, v, r] of GEO.ships) drawShip(g, X(u), Y(v), 1.1, r * 0.2); }

// ------------------------------------------------------------------ labels
function spaced(g, text, x, y, spacing, mode) {
  const chars = [...text]; const widths = chars.map((c) => g.measureText(c).width); const total = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
  let cx = x - total / 2; for (let i = 0; i < chars.length; i++) { if (mode === 'stroke') g.strokeText(chars[i], cx, y); else g.fillText(chars[i], cx, y); cx += widths[i] + spacing; }
}
function label(g, text, x, y, { size = 30, rot = 0, font, color = 'rgba(40,28,18,0.92)', halo = 'rgba(246,236,210,0.75)', spacing = 0.18, weight = 700 } = {}) {
  if (!text) return; g.save(); g.translate(x, y); g.rotate(rot); g.font = `${weight} ${size}px ${font}`; g.textBaseline = 'middle';
  g.lineWidth = Math.max(3, size * 0.16); g.strokeStyle = halo; g.lineJoin = 'round'; spaced(g, text, 0, 0, size * spacing, 'stroke');
  g.fillStyle = color; spaced(g, text, 0, 0, size * spacing, 'fill'); g.restore();
}
function paintLabels(g, L, serif, serifJa, X, Y) {
  const ja = !!serifJa; const font = ja ? serifJa : serif; const up = (s) => (ja ? s : String(s || '').toUpperCase());
  for (const r of GEO.regions) label(g, up(L.regions?.[r.id]), X(r.x), Y(r.y), { size: 38 * r.size * (ja ? 0.92 : 1), rot: r.rot, font, color: r.biome === 'frozen' ? 'rgba(40,58,76,0.9)' : 'rgba(40,28,18,0.92)', halo: r.biome === 'frozen' ? 'rgba(255,255,255,0.7)' : 'rgba(246,236,210,0.62)', spacing: ja ? 0.12 : 0.2 });
  label(g, up(L.reach), X(0.64), Y(0.335), { size: 40, rot: 0.04, font, color: 'rgba(255,214,170,0.96)', halo: 'rgba(40,10,4,0.85)', spacing: ja ? 0.12 : 0.22, weight: 900 });
  label(g, L.volcano, X(GEO.volcano.x) + 4, Y(GEO.volcano.y) + 28, { size: 22, font, color: 'rgba(255,200,150,0.95)', halo: 'rgba(30,8,4,0.85)', spacing: 0.08 });
  for (const s of GEO.seas) label(g, L.seas?.[s.id], X(s.x), Y(s.y), { size: 34, rot: s.rot, font, color: 'rgba(214,232,232,0.62)', halo: 'rgba(20,40,50,0.25)', spacing: ja ? 0.3 : 0.32, weight: 600 });
  (GEO.ruins || []).forEach(([u, v], i) => label(g, L.ruins?.[i], X(u), Y(v) + 18, { size: 17, font, color: 'rgba(40,28,18,0.85)', halo: 'rgba(246,236,210,0.6)', spacing: 0.06, weight: 600 }));
}

// ------------------------------------------------------------------ compass, cartouche, border, parchment
function compass(g, x, y, r) {
  g.save(); g.translate(x, y);
  g.strokeStyle = 'rgba(236,222,190,0.55)'; g.lineWidth = 1.2; for (const k of [1, 0.8]) { g.beginPath(); g.arc(0, 0, r * k, 0, Math.PI * 2); g.stroke(); }
  for (let i = 0; i < 32; i++) { const a = (i / 32) * Math.PI * 2, l = i % 4 === 0 ? 0.72 : 0.76; g.beginPath(); g.moveTo(Math.cos(a) * r * l, Math.sin(a) * r * l); g.lineTo(Math.cos(a) * r * 0.8, Math.sin(a) * r * 0.8); g.stroke(); }
  const star = (len, wid, rot, c1, c2) => { for (let i = 0; i < 4; i++) { g.save(); g.rotate(rot + (i * Math.PI) / 2); g.beginPath(); g.moveTo(0, -len); g.lineTo(wid, 0); g.lineTo(0, 0); g.closePath(); g.fillStyle = c1; g.fill(); g.beginPath(); g.moveTo(0, -len); g.lineTo(-wid, 0); g.lineTo(0, 0); g.closePath(); g.fillStyle = c2; g.fill(); g.restore(); } };
  star(r * 0.62, r * 0.1, Math.PI / 4, '#cdb88c', '#6e5a3a'); star(r * 0.95, r * 0.14, 0, '#f2e4bf', '#8a6a3a');
  g.fillStyle = '#a3302a'; g.beginPath(); g.moveTo(0, -r * 0.95); g.lineTo(r * 0.14, 0); g.lineTo(0, 0); g.closePath(); g.fill();
  g.beginPath(); g.arc(0, 0, r * 0.08, 0, Math.PI * 2); g.fillStyle = '#f2e4bf'; g.fill(); g.strokeStyle = '#3a2a1a'; g.stroke();
  g.font = `700 ${r * 0.26}px Cinzel, Georgia, serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#f2e4bf'; g.fillText('N', 0, -r * 1.15);
  g.restore();
}
function cartouche(g, L, serif, serifJa) {
  const x = 350, y = 124, w = 560, h = 136; g.save(); g.translate(x, y);
  g.shadowColor = 'rgba(0,0,0,0.45)'; g.shadowBlur = 18; g.shadowOffsetY = 6;
  const bg = g.createLinearGradient(0, -h / 2, 0, h / 2); bg.addColorStop(0, '#efe0bc'); bg.addColorStop(1, '#d6c093');
  g.fillStyle = bg; g.beginPath(); g.moveTo(-w / 2 + 22, -h / 2); g.lineTo(w / 2 - 22, -h / 2); g.quadraticCurveTo(w / 2, -h / 2, w / 2 + 14, -h / 2 - 12); g.quadraticCurveTo(w / 2 - 6, 0, w / 2 + 14, h / 2 + 12); g.quadraticCurveTo(w / 2, h / 2, w / 2 - 22, h / 2);
  g.lineTo(-w / 2 + 22, h / 2); g.quadraticCurveTo(-w / 2, h / 2, -w / 2 - 14, h / 2 + 12); g.quadraticCurveTo(-w / 2 + 6, 0, -w / 2 - 14, -h / 2 - 12); g.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + 22, -h / 2); g.closePath(); g.fill();
  g.shadowBlur = 0; g.shadowOffsetY = 0; g.strokeStyle = '#6b4f2a'; g.lineWidth = 2.5; g.stroke(); g.strokeStyle = 'rgba(107,79,42,0.6)'; g.lineWidth = 1; g.strokeRect(-w / 2 + 16, -h / 2 + 10, w - 32, h - 20);
  const font = serifJa || serif; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#3a2614';
  g.font = `900 ${serifJa ? 38 : 34}px ${font}`; spaced(g, serifJa ? L.title : String(L.title || '').toUpperCase(), 0, -14, serifJa ? 6 : 4, 'fill');
  g.font = `600 ${serifJa ? 19 : 18}px ${font}`; g.fillStyle = '#6b4f2a'; spaced(g, L.subtitle || '', 0, 30, 2.5, 'fill');
  g.strokeStyle = '#8a6a35'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(-150, 10); g.lineTo(150, 10); g.stroke();
  g.fillStyle = '#8a6a35'; g.beginPath(); g.moveTo(0, 4); g.lineTo(6, 10); g.lineTo(0, 16); g.lineTo(-6, 10); g.closePath(); g.fill();
  g.restore();
}
function parchment(g, W, H, s) {
  g.save();
  const v = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.6); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(36,22,10,0.55)');
  g.fillStyle = v; g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'soft-light'; g.fillStyle = 'rgba(214,180,120,0.35)'; g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'multiply'; const R = rng(9);
  for (let i = 0; i < 70; i++) { const x = R() * W, y = R() * H, r = (60 + R() * 220) * s; const sp = g.createRadialGradient(x, y, 0, x, y, r); sp.addColorStop(0, `rgba(190,160,120,${0.05 + R() * 0.07})`); sp.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = sp; g.fillRect(x - r, y - r, r * 2, r * 2); }
  g.restore();
}
function border(g, W, H, s) {
  g.save(); const o = 14 * s, i2 = 34 * s;
  g.strokeStyle = 'rgba(28,18,10,0.95)'; g.lineWidth = 22 * s; g.strokeRect(o / 2 + 4 * s, o / 2 + 4 * s, W - o - 8 * s, H - o - 8 * s);
  g.strokeStyle = '#c9a35c'; g.lineWidth = 2.4 * s; g.strokeRect(o + 6 * s, o + 6 * s, W - 2 * o - 12 * s, H - 2 * o - 12 * s);
  g.strokeStyle = 'rgba(201,163,92,0.6)'; g.lineWidth = 1 * s; g.strokeRect(i2, i2, W - 2 * i2, H - 2 * i2);
  // tick marks (latitude/longitude) along the inner band
  g.strokeStyle = 'rgba(201,163,92,0.55)'; g.beginPath(); for (let x = i2; x < W - i2; x += 60 * s) { g.moveTo(x, o + 8 * s); g.lineTo(x, o + 14 * s); g.moveTo(x, H - o - 8 * s); g.lineTo(x, H - o - 14 * s); }
  for (let y = i2; y < H - i2; y += 60 * s) { g.moveTo(o + 8 * s, y); g.lineTo(o + 14 * s, y); g.moveTo(W - o - 8 * s, y); g.lineTo(W - o - 14 * s, y); } g.stroke();
  for (const [x, y] of [[i2, i2], [W - i2, i2], [i2, H - i2], [W - i2, H - i2]]) { g.save(); g.translate(x, y); g.rotate(Math.PI / 4); g.fillStyle = '#c9a35c'; g.fillRect(-7 * s, -7 * s, 14 * s, 14 * s); g.fillStyle = '#2a1c10'; g.fillRect(-3.5 * s, -3.5 * s, 7 * s, 7 * s); g.restore(); }
  g.restore();
}
