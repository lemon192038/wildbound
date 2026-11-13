// Deterministic seeded noise utilities (CPU side) for terrain, scattering and texture synthesis.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 2D gradient (Perlin-style) noise with a seeded permutation. Returns roughly [-1, 1].
export function makeNoise2D(seed) {
  const rnd = mulberry32(seed);
  const perm = new Uint16Array(512);
  const p = new Uint16Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; const t = p[i]; p[i] = p[j]; p[j] = t; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const gx = new Float32Array(256), gy = new Float32Array(256);
  for (let i = 0; i < 256; i++) { const a = rnd() * Math.PI * 2; gx[i] = Math.cos(a); gy[i] = Math.sin(a); }
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  // period (optional) makes the noise tile on integer lattice period
  function noise(x, y, period = 0) {
    let xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    let x1 = xi + 1, y1 = yi + 1;
    if (period) { xi = ((xi % period) + period) % period; yi = ((yi % period) + period) % period; x1 = (xi + 1) % period; y1 = (yi + 1) % period; }
    xi &= 255; yi &= 255; x1 &= 255; y1 &= 255;
    const h00 = perm[perm[xi] + yi], h10 = perm[perm[x1] + yi], h01 = perm[perm[xi] + y1], h11 = perm[perm[x1] + y1];
    const n00 = gx[h00] * xf + gy[h00] * yf;
    const n10 = gx[h10] * (xf - 1) + gy[h10] * yf;
    const n01 = gx[h01] * xf + gy[h01] * (yf - 1);
    const n11 = gx[h11] * (xf - 1) + gy[h11] * (yf - 1);
    const u = fade(xf), v = fade(yf);
    const a = n00 + (n10 - n00) * u, b = n01 + (n11 - n01) * u;
    return (a + (b - a) * v) * 1.414;
  }
  function fbm(x, y, oct = 5, lac = 2, gain = 0.5, period = 0) {
    let s = 0, a = 1, f = 1, n = 0;
    for (let i = 0; i < oct; i++) { s += a * noise(x * f, y * f, period ? period * f : 0); n += a; a *= gain; f *= lac; }
    return s / n;
  }
  function ridged(x, y, oct = 5, lac = 2, gain = 0.5, period = 0) {
    let s = 0, a = 1, f = 1, n = 0, w = 1;
    for (let i = 0; i < oct; i++) {
      let v = 1 - Math.abs(noise(x * f, y * f, period ? period * f : 0)); v *= v; v *= w; w = Math.min(1, v * 2);
      s += a * v; n += a; a *= gain; f *= lac;
    }
    return s / n;
  }
  // Worley / cellular (F1, F2) tileable on period
  const cellRnd = (ix, iy, k) => { const h = perm[(perm[(ix & 255)] + (iy & 255) + k * 37) & 511]; return h / 255; };
  function worley(x, y, period = 0) {
    const xi = Math.floor(x), yi = Math.floor(y);
    let f1 = 9, f2 = 9, id = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      let cx = xi + i, cy = yi + j;
      let wx = cx, wy = cy;
      if (period) { wx = ((cx % period) + period) % period; wy = ((cy % period) + period) % period; }
      const px = cx + cellRnd(wx, wy, 1), py = cy + cellRnd(wx, wy, 2);
      const d = Math.hypot(px - x, py - y);
      if (d < f1) { f2 = f1; f1 = d; id = cellRnd(wx, wy, 3); } else if (d < f2) f2 = d;
    }
    return [f1, f2, id];
  }
  return { noise, fbm, ridged, worley };
}

export const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
