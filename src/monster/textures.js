// Procedural textures for Varkhul (no external assets).
// Scale field: tileable voronoi "shingle" scales -> albedo variation, normal, roughness, height.
import * as THREE from 'three';

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

function canvasTex(c, srgb, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 4; t.needsUpdate = true;
  return t;
}

function heightToNormal(h, N, strength) {
  const c = document.createElement('canvas'); c.width = c.height = N;
  const ctx = c.getContext('2d'); const img = ctx.createImageData(N, N); const d = img.data;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const xl = h[y * N + ((x - 1 + N) % N)], xr = h[y * N + ((x + 1) % N)];
    const yu = h[((y - 1 + N) % N) * N + x], yd = h[((y + 1) % N) * N + x];
    let nx = (xl - xr) * strength, ny = (yd - yu) * strength, nz = 1;
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const i = (y * N + x) * 4; d[i] = (nx * 0.5 + 0.5) * 255; d[i + 1] = (ny * 0.5 + 0.5) * 255; d[i + 2] = (nz * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0); return c;
}

// Tileable scale pattern. Cells are staggered rows, elongated along v (body axis) like overlapping shingles.
export function makeScaleTextures(N = 512, seed = 7) {
  const R = 12, C = 10, rnd = rng(seed);
  const cx = [], cy = [], cv = [];
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
    cx.push((c + 0.5 * (r % 2) + (rnd() - 0.5) * 0.5) / C); cy.push((r + (rnd() - 0.5) * 0.4) / R); cv.push(rnd());
  }
  const h = new Float32Array(N * N), cell = new Float32Array(N * N), edge = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N; const rr = Math.floor(v * R), cc = Math.floor(u * C);
    let f1 = 9, f2 = 9, id = 0, dyb = 0;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -2; dc <= 2; dc++) {
      const r2 = rr + dr, c2 = cc + dc; const wr = ((r2 % R) + R) % R, wc = ((c2 % C) + C) % C;
      const k = wr * C + wc; const ox = Math.floor(c2 / C), oy = Math.floor(r2 / R);
      const px = cx[k] + ox, py = cy[k] + oy;
      // anisotropic metric: scales are wider than long, and shifted so each "overlaps" the next
      const dx = (u - px) * C, dy = (v - py) * R * 0.9;
      const dd = Math.hypot(dx, dy * 1.15 + (dy > 0 ? dy * 0.35 : 0));
      if (dd < f1) { f2 = f1; f1 = dd; id = k; dyb = dy; } else if (dd < f2) f2 = dd;
    }
    const e = Math.min(1, (f2 - f1) / 0.16); const eS = e * e * (3 - 2 * e);
    const dome = Math.max(0, 1 - f1 * 0.9);
    const i = y * N + x;
    h[i] = eS * (0.45 + 0.55 * Math.pow(dome, 0.7)) + 0.12 * Math.max(0, -dyb) * eS;
    cell[i] = cv[id]; edge[i] = eS;
  }
  // fine noise pores
  for (let i = 0; i < N * N; i++) h[i] += (rnd() - 0.5) * 0.025;

  const mk = () => { const c = document.createElement('canvas'); c.width = c.height = N; return c; };
  const alb = mk(), rough = mk(), hgt = mk();
  const ia = alb.getContext('2d').createImageData(N, N), ir = rough.getContext('2d').createImageData(N, N), ih = hgt.getContext('2d').createImageData(N, N);
  for (let i = 0; i < N * N; i++) {
    const v = 0.62 + 0.38 * h[i] * (0.8 + 0.4 * cell[i]);
    const k = i * 4;
    ia.data[k] = 255 * Math.min(1, v * (1.0 + 0.06 * cell[i])); ia.data[k + 1] = 255 * v * (0.97 - 0.05 * cell[i]); ia.data[k + 2] = 255 * v * 0.92; ia.data[k + 3] = 255;
    const ro = 0.92 - 0.42 * h[i] * edge[i] + 0.06 * cell[i];
    ir.data[k] = ir.data[k + 1] = ir.data[k + 2] = 255 * Math.min(1, ro); ir.data[k + 3] = 255;
    ih.data[k] = ih.data[k + 1] = ih.data[k + 2] = 255 * Math.min(1, Math.max(0, h[i])); ih.data[k + 3] = 255;
  }
  alb.getContext('2d').putImageData(ia, 0, 0); rough.getContext('2d').putImageData(ir, 0, 0); hgt.getContext('2d').putImageData(ih, 0, 0);
  return {
    map: canvasTex(alb, true), roughnessMap: canvasTex(rough, false), heightMap: canvasTex(hgt, false),
    normalMap: canvasTex(heightToNormal(h, N, 5.5), false),
  };
}

// Wing membrane: leathery mottling + branching veins. Optional torn alpha mask.
export function makeMembraneTextures(N = 512, seed = 3) {
  const rnd = rng(seed);
  const c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d');
  g.fillStyle = '#a07a68'; g.fillRect(0, 0, N, N);
  for (let i = 0; i < 900; i++) { // mottling
    const x = rnd() * N, y = rnd() * N, r = 4 + rnd() * 26; const a = 0.04 + rnd() * 0.08;
    g.fillStyle = rnd() < 0.5 ? `rgba(60,30,25,${a})` : `rgba(230,190,160,${a * 0.7})`; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  const vein = (x, y, ang, w, depth) => {
    g.strokeStyle = `rgba(70,22,18,${0.35 + 0.3 * w / 5})`; g.lineWidth = w; g.lineCap = 'round';
    let len = 30 + rnd() * 60;
    for (let s = 0; s < 6; s++) {
      const nx = x + Math.cos(ang) * len / 6, ny = y + Math.sin(ang) * len / 6;
      g.beginPath(); g.moveTo(x, y); g.lineTo(nx, ny); g.stroke(); x = nx; y = ny; ang += (rnd() - 0.5) * 0.5;
    }
    if (depth > 0) { vein(x, y, ang - 0.5 - rnd() * 0.3, w * 0.65, depth - 1); vein(x, y, ang + 0.4 + rnd() * 0.3, w * 0.65, depth - 1); }
  };
  for (let i = 0; i < 9; i++) vein(rnd() * N, N * 0.02, Math.PI / 2 + (rnd() - 0.5) * 0.6, 4.5, 4);
  // fine wrinkles along the spars
  g.strokeStyle = 'rgba(40,15,12,0.10)'; g.lineWidth = 1;
  for (let i = 0; i < 160; i++) { const x = rnd() * N; g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + 20, N * 0.3, x - 20, N * 0.6, x + (rnd() - 0.5) * 40, N); g.stroke(); }
  const map = canvasTex(c, true);
  // torn alpha mask (ragged holes + ripped trailing edge)
  const a = document.createElement('canvas'); a.width = a.height = 256; const ga = a.getContext('2d');
  ga.fillStyle = '#fff'; ga.fillRect(0, 0, 256, 256); ga.fillStyle = '#000';
  for (let i = 0; i < 9; i++) {
    const x = 20 + rnd() * 216, y = 60 + rnd() * 190; ga.beginPath();
    for (let k = 0; k < 14; k++) { const an = k / 14 * Math.PI * 2, rr = (8 + rnd() * 22) * (0.6 + rnd() * 0.6); ga.lineTo(x + Math.cos(an) * rr, y + Math.sin(an) * rr * 1.6); }
    ga.fill();
  }
  for (let x = 0; x < 256; x += 6) { const d = 6 + rnd() * 40 * (rnd() < 0.3 ? 1 : 0.3); ga.fillRect(x, 256 - d, 7, d); }
  const tornAlpha = canvasTex(a, false, false);
  return { map, tornAlpha };
}

// Horn / claw / tooth: growth rings & striations.
export function makeHornTextures(N = 256) {
  const h = new Float32Array(N * N); const rnd = rng(11);
  const ph = Array.from({ length: 12 }, () => rnd() * 6.28);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const v = y / N, u = x / N;
    let s = 0.5 + 0.3 * Math.sin(v * Math.PI * 2 * 18 + Math.sin(u * 6.28 * 2 + ph[0]) * 1.2) + 0.15 * Math.sin(u * Math.PI * 2 * 24 + ph[1]);
    h[y * N + x] = s + (rnd() - 0.5) * 0.05;
  }
  return { normalMap: canvasTex(heightToNormal(h, N, 2.0), false) };
}
