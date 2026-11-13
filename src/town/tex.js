// Procedural, tileable town textures (albedo sRGB + tangent normal maps): ashlar masonry, cobbles, planks,
// fish-scale roof shingles, plaster, canvas. Neutral-ish albedo so vertex colours can tint per building.
import { makeNoise2D, mulberry32, smoothstep, clamp, lerp } from '../world/noise.js';

function toTex(THREE, data, size, srgb, aniso) {
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true; t.anisotropy = aniso; if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true;
  return t;
}
function normals(h, size, k) {
  const out = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const xl = (x - 1 + size) % size, xr = (x + 1) % size, yu = (y - 1 + size) % size, yd = (y + 1) % size;
    const dx = (h[y * size + xr] - h[y * size + xl]) * k, dy = (h[yd * size + x] - h[yu * size + x]) * k;
    const l = Math.hypot(dx, dy, 1), i = (y * size + x) * 4;
    out[i] = (-dx / l * 0.5 + 0.5) * 255; out[i + 1] = (dy / l * 0.5 + 0.5) * 255; out[i + 2] = (1 / l * 0.5 + 0.5) * 255; out[i + 3] = 255;
  }
  return out;
}
// painter(x, y, out) -> writes out[0..2] linear-ish colour (0..1, treated as sRGB) and out[3] height
function gen(THREE, size, aniso, k, painter) {
  const a = new Uint8Array(size * size * 4), h = new Float32Array(size * size), o = [0, 0, 0, 0];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    painter(x, y, o); const i = y * size + x;
    a[i * 4] = clamp(o[0] * 255, 0, 255); a[i * 4 + 1] = clamp(o[1] * 255, 0, 255); a[i * 4 + 2] = clamp(o[2] * 255, 0, 255); a[i * 4 + 3] = 255; h[i] = o[3];
  }
  return { map: toTex(THREE, a, size, true, aniso), normalMap: toTex(THREE, normals(h, size, k * size / 512), size, false, aniso) };
}

export function createTownTextures(THREE, renderer, size = 512) {
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const N = makeNoise2D(91), rnd = mulberry32(17), S = size;
  const fb = (x, y, f, p, oct = 4) => N.fbm(x / S * f, y / S * f, oct, 2, 0.5, f) * 0.5 + 0.5; // tileable fbm in [0,1]
  const T = {};

  // ---- ashlar masonry: 8 courses, random block lengths, bevelled edges, recessed mortar ----
  {
    const rows = 8, rh = S / rows, cuts = [], tones = [];
    for (let r = 0; r < rows; r++) {
      const c = [0]; let x = 0; while (x < S) { const w = rh * (1.2 + rnd() * 1.6); x += w; c.push(Math.min(S, x)); }
      if (S - c[c.length - 2] < rh * 0.7) { c.splice(c.length - 2, 1); }
      c[c.length - 1] = S; cuts.push(c); tones.push(c.map(() => [0.82 + rnd() * 0.3, rnd(), rnd()]));
    }
    const sh = rnd() * S;
    T.stone = gen(THREE, S, aniso, 5, (x, y, o) => {
      const r = Math.floor(y / rh), c = cuts[r], off = (r * 0.37 * S + sh * (r % 2)) % S, xx = (x + off) % S;
      let i = 0; while (c[i + 1] <= xx) i++;
      const dx = Math.min(xx - c[i], c[i + 1] - xx), dy = Math.min(y - r * rh, (r + 1) * rh - y), e = Math.min(dx, dy);
      const [tn, hu, bu] = tones[r][i];
      const n1 = fb(x, y, 16, 0), n2 = fb(x, y, 64, 0, 3);
      const m = S / 300;
      const bev = smoothstep(m, m + S / 70, e);
      const chip = smoothstep(0.62, 0.7, fb(x + 50, y, 24, 0)) * (1 - smoothstep(0, S / 40, e));
      let hgt = e < m ? 0.05 + n2 * 0.05 : 0.45 + 0.4 * bev + (n1 - 0.5) * 0.35 + (n2 - 0.5) * 0.15 - chip * 0.3;
      let v = tn * (0.78 + 0.32 * n1) * (0.9 + 0.1 * n2);
      const warm = hu * 0.08 - 0.04;
      let cr = 0.66 * v * (1 + warm), cg = 0.64 * v, cb = 0.6 * v * (1 - warm + bu * 0.05);
      const moss = smoothstep(0.6, 0.75, fb(x, y, 8, 0, 3)) * 0.4;
      cr = lerp(cr, 0.36, moss); cg = lerp(cg, 0.42, moss); cb = lerp(cb, 0.28, moss);
      if (e < m) { cr = cg = 0.38 + n2 * 0.08; cb = 0.35 + n2 * 0.07; }
      else { const d = 1 - (1 - bev) * 0.25; cr *= d; cg *= d; cb *= d; }
      o[0] = cr; o[1] = cg; o[2] = cb; o[3] = hgt;
    });
  }
  // ---- cobbles: worley cells, domed stones, dark gritty joints ----
  {
    const P = 12;
    T.cobble = gen(THREE, S, aniso, 7, (x, y, o) => {
      const u = x / S * P, v = y / S * P;
      const wu = u + (fb(x, y, 4, 0) - 0.5) * 0.5, wv = v + (fb(x + 99, y, 4, 0) - 0.5) * 0.5;
      const [f1, f2, id] = N.worley(wu, wv, P);
      const e = f2 - f1, n = fb(x, y, 48, 0, 3);
      const st = smoothstep(0.04, 0.2, e);
      const tone = 0.7 + id * 0.45;
      const hue = (id * 7.3) % 1;
      o[0] = lerp(0.36, 0.62 * tone * (1 + hue * 0.1), st) * (0.85 + 0.2 * n);
      o[1] = lerp(0.35, 0.6 * tone, st) * (0.85 + 0.2 * n);
      o[2] = lerp(0.31, 0.56 * tone * (1.05 - hue * 0.12), st) * (0.85 + 0.2 * n);
      o[3] = st * (0.6 + 0.4 * Math.sqrt(Math.min(1, e * 2.5))) + n * 0.12;
    });
  }
  // ---- planks: horizontal boards, grain, butt joints, nails ----
  {
    const rows = 8, rh = S / rows, joints = [], tones = [];
    for (let r = 0; r < rows; r++) { joints.push([rnd() * S, rnd() * S]); tones.push([0.8 + rnd() * 0.35, 0.85 + rnd() * 0.3]); }
    T.plank = gen(THREE, S, aniso, 4, (x, y, o) => {
      const r = Math.floor(y / rh), ly = y - r * rh;
      const [j1, j2] = joints[r];
      const dj = Math.min(Math.abs(x - j1), Math.abs(x - j2), S - Math.abs(x - j1), S - Math.abs(x - j2));
      const tone = (x > Math.min(j1, j2) && x < Math.max(j1, j2)) ? tones[r][0] : tones[r][1];
      const g1 = N.fbm(x / S * 3, (y / S) * 40 + r * 3.1, 3, 2, 0.5, 0) * 0.5 + 0.5;
      const grain = Math.sin((y / S * 140 + g1 * 9 + r * 7)) * 0.5 + 0.5;
      const n = fb(x, y, 32, 0, 3);
      const gap = Math.min(ly, rh - ly) < S / 260 || dj < S / 400;
      const edge = smoothstep(0, S / 90, Math.min(ly, rh - ly, dj * 2));
      const nail = Math.hypot(Math.min(Math.abs(x - j1), Math.abs(x - j2)) - S / 90, Math.min(Math.abs(ly - rh * 0.25), Math.abs(ly - rh * 0.75))) < S / 260;
      let v = tone * (0.72 + 0.18 * grain + 0.15 * n) * (0.75 + 0.25 * edge);
      o[0] = 0.58 * v; o[1] = 0.47 * v; o[2] = 0.36 * v;
      if (gap) { o[0] = 0.08; o[1] = 0.06; o[2] = 0.05; }
      if (nail) { o[0] = 0.18; o[1] = 0.17; o[2] = 0.16; }
      o[3] = gap ? 0 : 0.55 + 0.25 * edge + grain * 0.08 + n * 0.08 - (nail ? 0.2 : 0);
    });
  }
  // ---- fish-scale roof shingles (rows along u, pointing towards +v = down-slope) ----
  {
    const rows = 12, per = 8, rh = S / rows, W = S / per, R = W / 2;
    const jit = []; for (let i = 0; i < rows * per; i++) jit.push([0.82 + rnd() * 0.3, rnd()]);
    T.roof = gen(THREE, S, aniso, 6, (x, y, o) => {
      let hit = null;
      for (let k = 0; k <= 2 && !hit; k++) {
        const r = Math.floor(y / rh) - k, rr = ((r % rows) + rows) % rows, y0 = r * rh, y1 = y0 + rh * 1.65;
        if (y < y0 || y > y1) continue;
        const off = (rr % 2) * W * 0.5, i = Math.floor(((x - off) % S + S) % S / W), c = i * W + off + R;
        let dx = x - c; if (dx > S / 2) dx -= S; if (dx < -S / 2) dx += S;
        const cy = y1 - R; const inside = Math.abs(dx) < R && (y < cy || dx * dx + (y - cy) ** 2 < R * R);
        if (inside) { const dEdge = y < cy ? R - Math.abs(dx) : R - Math.hypot(dx, y - cy); hit = [rr, i, (y - y0) / (y1 - y0), dEdge]; }
      }
      const n = fb(x, y, 40, 0, 3);
      if (!hit) { o[0] = o[1] = o[2] = 0.15; o[3] = 0; return; }
      const [rr, i, t, de] = hit, [tn, hj] = jit[(rr * per + i) % jit.length];
      const lip = smoothstep(0, S / 90, de);
      let v = tn * (0.55 + 0.45 * t) * (0.7 + 0.3 * lip) * (0.88 + 0.2 * n);
      o[0] = v * (0.86 + hj * 0.1); o[1] = v * 0.97; o[2] = v * (1.0 - hj * 0.06);
      o[3] = 0.2 + 0.7 * t * lip + n * 0.06;
    });
  }
  // ---- lime plaster with stains ----
  T.plaster = gen(THREE, S, aniso, 1.5, (x, y, o) => {
    const n = fb(x, y, 6, 0), n2 = fb(x, y, 48, 0, 3), st = smoothstep(0.55, 0.8, fb(x, y * 0.5, 4, 0, 3));
    const crack = smoothstep(0.985, 1.0, 1 - Math.abs(N.fbm(x / S * 8, y / S * 8, 3, 2, 0.5, 8)) ) * 0.4;
    const v = (0.9 + 0.1 * n) * (0.94 + 0.06 * n2) - st * 0.12 - crack;
    o[0] = v * 0.95; o[1] = v * 0.92; o[2] = v * 0.86; o[3] = n2 * 0.4 + n * 0.3 - crack;
  });
  // ---- canvas weave ----
  T.cloth = gen(THREE, S, aniso, 1.2, (x, y, o) => {
    const w = (Math.sin(x * Math.PI * 2 / 4) * Math.sin(y * Math.PI * 2 / 4)) * 0.5 + 0.5, n = fb(x, y, 12, 0, 3);
    const seam = Math.abs(((y / S) * 4) % 1 - 0.5) > 0.48 ? 0.85 : 1;
    const v = (0.84 + 0.1 * w + 0.08 * n) * seam;
    o[0] = v; o[1] = v * 0.97; o[2] = v * 0.92; o[3] = w * 0.3 + n * 0.2;
  });
  return T;
}
