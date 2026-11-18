// node tools/island-preview.mjs out.ppm [px=512] — shaded relief preview of the island field (heights, lava, regions).
import fs from 'node:fs';
import { createIslandField, ISLAND } from '../src/world/island/islandField.js';
const out = process.argv[2] || 'island.ppm', W = +(process.argv[3] || 512);
const F = createIslandField(1337);
const tint = { caldera: [255, 80, 20], core: [120, 90, 80], canyon: [200, 70, 40], peaks: [150, 150, 170], ashplain: [200, 200, 190], fungal: [60, 140, 80], crystal: [80, 200, 230], ruins: [210, 180, 90], geotherm: [230, 210, 60], coast: [40, 40, 50], sea: [20, 50, 80] };
const buf = Buffer.alloc(W * W * 3); const t0 = performance.now(); const s = {}; let hmax = -1e9, hmin = 1e9;
const H = new Float32Array(W * W), step = ISLAND.size / W;
for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) { const x = -ISLAND.half + (i + 0.5) * step, z = -ISLAND.half + (j + 0.5) * step; F.sample(x, z, s); H[j * W + i] = s.h; hmax = Math.max(hmax, s.h); hmin = Math.min(hmin, s.h); }
const ms = performance.now() - t0;
for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) {
  const x = -ISLAND.half + (i + 0.5) * step, z = -ISLAND.half + (j + 0.5) * step; const h = H[j * W + i];
  const hx = H[j * W + Math.min(W - 1, i + 1)] - h, hz = H[Math.min(W - 1, j + 1) * W + i] - h;
  const shade = Math.max(0.15, Math.min(1.3, 0.75 - (hx * 0.6 + hz * 0.4) / step * 1.2));
  let c;
  if (h < 0) c = [20, 45, 75].map((v) => v * (1 + h / 60));
  else { F.sample(x, z, s); if (s.sd < 6 && h < s.level - 0.02) c = [255, 110, 20]; else { const t = tint[F.regionAt(x, z)]; const k = 0.35 + 0.65 * Math.min(1, h / 300); c = t.map((v) => (v * 0.45 + 90 * k) * shade); } }
  const o = (j * W + i) * 3; buf[o] = Math.max(0, Math.min(255, c[0])); buf[o + 1] = Math.max(0, Math.min(255, c[1])); buf[o + 2] = Math.max(0, Math.min(255, c[2]));
}
fs.writeFileSync(out, Buffer.concat([Buffer.from(`P6 ${W} ${W} 255\n`), buf]));
console.log(`samples ${W * W} in ${ms.toFixed(0)} ms (${(ms * 1000 / (W * W)).toFixed(2)} µs/sample), h ${hmin.toFixed(1)}..${hmax.toFixed(1)}`);
