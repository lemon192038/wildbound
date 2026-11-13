// Procedural, tileable PBR-ish textures (albedo with height in alpha + tangent-space normal maps).
import { makeNoise2D, mulberry32, smoothstep, clamp, lerp } from './noise.js';

function toTexture(THREE, data, size, srgb, aniso) {
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = aniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

function heightToNormal(h, size, strength) {
  const out = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const xl = (x - 1 + size) % size, xr = (x + 1) % size, yu = (y - 1 + size) % size, yd = (y + 1) % size;
    const dx = (h[y * size + xr] - h[y * size + xl]) * strength;
    const dy = (h[yd * size + x] - h[yu * size + x]) * strength;
    let nx = -dx, ny = -dy, nz = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const i = (y * size + x) * 4;
    out[i] = (nx * 0.5 + 0.5) * 255; out[i + 1] = (ny * 0.5 + 0.5) * 255; out[i + 2] = (nz * 0.5 + 0.5) * 255; out[i + 3] = 255;
  }
  return out;
}

const srgbByte = (v) => clamp(Math.round(v * 255), 0, 255);

export function createTerrainTextures(THREE, renderer, seed = 1, size = 512) {
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const N = makeNoise2D(seed * 7 + 3);
  const P = 8; // lattice period across the tile

  // ---------- GRASS GROUND ----------
  const gh = new Float32Array(size * size);
  const ga = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = (x / size) * P, v = (y / size) * P;
    const low = N.fbm(u * 0.5, v * 0.5, 3, 2, 0.5, P * 0.5);
    const mid = N.fbm(u * 2, v * 2, 4, 2, 0.55, P * 2);
    // blade-ish streaks: stretched high frequency noise in two directions
    const s1 = N.noise(u * 24, v * 24, P * 24) * 0.5 + N.noise(u * 12, v * 12, P * 12) * 0.5;
    const fine = N.noise(u * 40, v * 40, P * 40);
    const hgt = 0.5 + 0.25 * mid + 0.15 * s1 + 0.1 * fine;
    gh[y * size + x] = hgt;
    const dry = smoothstep(0.05, 0.5, low + 0.2 * mid);
    // linear-ish colors, written as sRGB
    let r = lerp(0.20, 0.42, dry), g = lerp(0.33, 0.42, dry), b = lerp(0.10, 0.14, dry);
    const shade = 0.8 + 0.28 * (hgt - 0.5) * 2 + 0.06 * s1;
    r *= shade; g *= shade; b *= shade;
    // tiny dark gaps & flowers specks
    const sp = N.noise(u * 55, v * 55, P * 55);
    if (sp > 0.66) { r *= 0.75; g *= 0.78; b *= 0.78; }
    const i = (y * size + x) * 4;
    ga[i] = srgbByte(r); ga[i + 1] = srgbByte(g); ga[i + 2] = srgbByte(b); ga[i + 3] = srgbByte(clamp(hgt, 0, 1));
  }

  // ---------- DIRT / PEBBLES ----------
  const dh = new Float32Array(size * size);
  const da = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = (x / size) * P, v = (y / size) * P;
    const [f1, f2, id] = N.worley(u * 3, v * 3, P * 3);
    const [g1, , id2] = N.worley(u * 9 + 3.1, v * 9 + 1.7, P * 9);
    const peb = smoothstep(0.36, 0.14, f1) * (0.5 + 0.4 * id) * (id > 0.6 ? 1 : 0);
    const peb2 = smoothstep(0.3, 0.08, g1) * (id2 > 0.75 ? 1 : 0) * 0.45;
    const mid = N.fbm(u * 2, v * 2, 5, 2, 0.55, P * 2);
    const fine = N.noise(u * 48, v * 48, P * 48);
    const crack = smoothstep(0.06, 0.0, f2 - f1) * 0.5 * (mid > 0 ? 1 : 0.3);
    const hgt = clamp(0.35 + 0.18 * mid + 0.45 * Math.max(peb, peb2) + 0.06 * fine - crack * 0.3, 0, 1);
    dh[y * size + x] = hgt;
    let r = 0.39, g = 0.30, b = 0.19;
    const sh = 0.78 + 0.35 * mid + 0.1 * fine;
    r *= sh; g *= sh; b *= sh;
    const pc = Math.max(peb, peb2);
    if (pc > 0.05) { const t = smoothstep(0.05, 0.4, pc); const gr = 0.36 + 0.12 * id; r = lerp(r, gr * 1.05, t * 0.8); g = lerp(g, gr * 0.98, t * 0.8); b = lerp(b, gr * 0.82, t * 0.8); }
    r *= 1 - crack; g *= 1 - crack; b *= 1 - crack;
    const i = (y * size + x) * 4;
    da[i] = srgbByte(r); da[i + 1] = srgbByte(g); da[i + 2] = srgbByte(b); da[i + 3] = srgbByte(hgt);
  }

  // ---------- ROCK ----------
  const rh = new Float32Array(size * size);
  const ra = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = (x / size) * P, v = (y / size) * P;
    const warp = N.fbm(u * 1.5, v * 1.5, 3, 2, 0.5, P * 1.5);
    const strata = Math.sin((v + warp * 0.8) * Math.PI * 2 * 3) * 0.5 + 0.5; // tiles since v*3 periodic over P? P=8 -> integer
    const rid = N.ridged(u * 1.5, v * 1.5, 5, 2, 0.5, P * 1.5);
    const [f1, f2] = N.worley(u * 2 + warp, v * 2 - warp, P * 2);
    const crack = smoothstep(0.08, 0.0, f2 - f1);
    const fine = N.fbm(u * 16, v * 16, 3, 2, 0.5, P * 16);
    const hgt = clamp(0.45 + 0.3 * rid + 0.12 * strata + 0.1 * fine - 0.35 * crack, 0, 1);
    rh[y * size + x] = hgt;
    let base = 0.34 + 0.18 * rid + 0.06 * strata + 0.06 * fine;
    let r = base * 1.0, g = base * 0.96, b = base * 0.9;
    const tint = N.fbm(u * 0.7, v * 0.7, 3, 2, 0.5, P * 0.7);
    r *= 1 + 0.12 * tint; b *= 1 - 0.1 * tint;
    // lichen / moss blotches
    const lic = smoothstep(0.35, 0.55, N.fbm(u * 3 + 11, v * 3 + 5, 4, 2, 0.5, P * 3));
    r = lerp(r, 0.38, lic * 0.5); g = lerp(g, 0.40, lic * 0.5); b = lerp(b, 0.22, lic * 0.5);
    r *= 1 - crack * 0.6; g *= 1 - crack * 0.6; b *= 1 - crack * 0.6;
    const i = (y * size + x) * 4;
    ra[i] = srgbByte(r); ra[i + 1] = srgbByte(g); ra[i + 2] = srgbByte(b); ra[i + 3] = srgbByte(hgt);
  }

  return {
    grass: toTexture(THREE, ga, size, true, aniso), grassN: toTexture(THREE, heightToNormal(gh, size, 3.0), size, false, aniso),
    dirt: toTexture(THREE, da, size, true, aniso), dirtN: toTexture(THREE, heightToNormal(dh, size, 5.0), size, false, aniso),
    rock: toTexture(THREE, ra, size, true, aniso), rockN: toTexture(THREE, heightToNormal(rh, size, 6.0), size, false, aniso),
  };
}

export function createWaterNormal(THREE, seed = 5, size = 256) {
  const N = makeNoise2D(seed);
  const h = new Float32Array(size * size);
  const P = 4;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = (x / size) * P, v = (y / size) * P;
    h[y * size + x] = N.fbm(u * 2, v * 2, 5, 2, 0.5, P * 2);
  }
  return toTexture(THREE, heightToNormal(h, size, 4.0), size, false, 4);
}

export function createSoftDot(THREE, size = 64) {
  const d = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (x + 0.5) / size * 2 - 1, dy = (y + 0.5) / size * 2 - 1;
    const r = Math.hypot(dx, dy); const a = Math.pow(Math.max(0, 1 - r), 2);
    const i = (y * size + x) * 4; d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = a * 255;
  }
  const t = new THREE.DataTexture(d, size, size); t.needsUpdate = true; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter; return t;
}

// Foliage atlas (1024x512): [0,0.5) broadleaf leaf cluster (alpha), [0.5,0.75) needle/fern frond (alpha, base at v=0),
// [0.76,1] bark (opaque). Returned as DataTexture with colour bled into transparent texels (clean mips).
export const ATLAS = { LEAF: [0.0, 0.0, 0.5, 1.0], FROND: [0.5, 0.0, 0.75, 1.0], BARK: [0.765, 0.0, 1.0, 1.0] };
export function createFoliageAtlas(THREE, renderer, seed = 3) {
  const W = 1024, H = 512;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const rnd = mulberry32(seed);
  // ---- leaf cluster ----
  const leaf = (x, y, a, len, wid, light) => {
    g.save(); g.translate(x, y); g.rotate(a);
    g.fillStyle = `hsl(${88 + rnd() * 22}, ${42 + rnd() * 18}%, ${light}%)`;
    g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(wid, len * 0.45, 0, len); g.quadraticCurveTo(-wid, len * 0.45, 0, 0); g.fill();
    g.strokeStyle = `hsla(80, 40%, ${light + 12}%, 0.6)`; g.lineWidth = 1.2; g.beginPath(); g.moveTo(0, 2); g.lineTo(0, len * 0.9); g.stroke();
    g.restore();
  };
  const cx = 256, cy = 256;
  for (let tw = 0; tw < 9; tw++) { // twigs
    const ta = rnd() * Math.PI * 2, tl = 60 + rnd() * 140;
    const sx = cx + Math.cos(ta) * 20, sy = cy + Math.sin(ta) * 20;
    g.strokeStyle = '#3b2a1c'; g.lineWidth = 3; g.beginPath(); g.moveTo(sx, sy); g.lineTo(cx + Math.cos(ta) * tl, cy + Math.sin(ta) * tl); g.stroke();
  }
  for (let i = 0; i < 260; i++) {
    const r = Math.sqrt(rnd()) * 200, a = rnd() * Math.PI * 2;
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r * 0.95;
    leaf(x, y, a + Math.PI / 2 + (rnd() - 0.5) * 1.2 - Math.PI, 34 + rnd() * 26, 12 + rnd() * 8, 20 + rnd() * 20 - r * 0.03);
  }
  // ---- frond (needles / fern), base at canvas top ----
  const fx0 = 640;
  for (let pass = 0; pass < 2; pass++) for (let i = 0; i < 70; i++) {
    const t = i / 70; const y = 10 + t * 490; const span = (1 - t) * 105 + 10;
    for (const s of [-1, 1]) {
      g.strokeStyle = `hsl(${118 + rnd() * 20}, ${30 + rnd() * 15}%, ${16 + rnd() * 12 + pass * 4}%)`; g.lineWidth = 3 + rnd() * 2;
      g.beginPath(); g.moveTo(fx0, y); g.quadraticCurveTo(fx0 + s * span * 0.5, y + 8, fx0 + s * span * (0.85 + rnd() * 0.2), y + 26 + rnd() * 12); g.stroke();
    }
  }
  g.strokeStyle = '#2c2a18'; g.lineWidth = 5; g.beginPath(); g.moveTo(fx0, 0); g.lineTo(fx0, 500); g.stroke();
  // ---- bark ----
  const bx = Math.round(W * 0.765);
  g.fillStyle = '#5a4433'; g.fillRect(bx, 0, W - bx, H);
  for (let i = 0; i < 260; i++) {
    const x = bx + rnd() * (W - bx), w = 2 + rnd() * 6, l = 30 + rnd() * 160, y = rnd() * H;
    g.fillStyle = rnd() < 0.6 ? `rgba(30,20,14,${0.35 + rnd() * 0.4})` : `rgba(140,120,100,${0.15 + rnd() * 0.2})`;
    g.fillRect(x, y, w, l); if (y + l > H) g.fillRect(x, y - H, w, l);
  }
  const img = g.getImageData(0, 0, W, H); const d = img.data;
  // bleed: transparent texels take the region's mean colour so mipmaps don't darken edges
  for (const [x0, x1, col] of [[0, 512, [60, 92, 34]], [512, bx, [40, 70, 36]]]) {
    for (let y = 0; y < H; y++) for (let x = x0; x < x1; x++) { const i = (y * W + x) * 4; if (d[i + 3] < 40) { d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = d[i + 3] < 40 ? 0 : d[i + 3]; } }
  }
  for (let y = 0; y < H; y++) for (let x = bx; x < W; x++) d[(y * W + x) * 4 + 3] = 255;
  const t = new THREE.DataTexture(new Uint8Array(d.buffer.slice(0)), W, H, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.RepeatWrapping; t.anisotropy = renderer?.capabilities ? Math.min(4, renderer.capabilities.getMaxAnisotropy()) : 4; t.needsUpdate = true;
  return t;
}
