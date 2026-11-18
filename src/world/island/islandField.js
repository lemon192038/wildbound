// VOLCANIC ISLAND — the open-world field definition (pure data + deterministic functions of (x, z)).
// One continuous island ≈ 1.9 km across, centred on Mount Kaldrith. Everything here is analytic so any point can be
// evaluated without loading anything: the chunk streamer (chunks.js) caches it into meshes, collision falls back to it.
//
//   macro(x,z)        smooth large-scale height (cone, ridges, plateaus) — also drives the lava surface level
//   height(x,z)       final terrain height = macro + detail, carved by lava channels (getHeight source of truth)
//   lava(x,z,out)     nearest lava body → out = { sd (m, <0 inside), level (lava surface y), fx, fz (flow) }
//   regionAt(x,z)     region id (see REGIONS)
//   surface(...)      macro splat weights for the shared volcanic terrain material
// Coordinates: +x east, +z south, the summit crater at the origin. Sea level y = 0.
import { makeNoise2D, smoothstep, clamp, lerp } from '../noise.js';

export const ISLAND = { size: 2304, half: 1152, sea: 0, coastR: 900 };
const TAU = Math.PI * 2;

// Regions, in the order they are tested (first match wins). Names are i18n keys (region.<id>).
export const REGIONS = ['caldera', 'core', 'canyon', 'peaks', 'ashplain', 'fungal', 'crystal', 'ruins', 'geotherm', 'coast', 'sea'];

function polyline(pts) {
  const seg = []; let total = 0; let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1]; const l = Math.hypot(bx - ax, bz - az);
    seg.push({ ax, az, dx: bx - ax, dz: bz - az, l, s0: total }); total += l;
    x0 = Math.min(x0, ax, bx); z0 = Math.min(z0, az, bz); x1 = Math.max(x1, ax, bx); z1 = Math.max(z1, az, bz);
  }
  return {
    pts, total, box: [x0, z0, x1, z1],
    // cheap lower bound of the distance to the whole line (bounding box) — lets callers skip far rivers
    boxDist(x, z) { const dx = Math.max(x0 - x, 0, x - x1), dz = Math.max(z0 - z, 0, z - z1); return Math.hypot(dx, dz); },
    near(x, z, out) {
      let best = 1e9;
      for (const g of seg) {
        let t = ((x - g.ax) * g.dx + (z - g.az) * g.dz) / (g.l * g.l); t = clamp(t, 0, 1);
        const d = Math.hypot(x - g.ax - g.dx * t, z - g.az - g.dz * t);
        if (d < best) { best = d; out[0] = d; out[1] = g.s0 + t * g.l; out[2] = g.dx / g.l; out[3] = g.dz / g.l; out[4] = g.ax + g.dx * t; out[5] = g.az + g.dz * t; }
      }
      return out;
    },
  };
}

export function createIslandField(seed = 1337) {
  const N = makeNoise2D(seed + 101), N2 = makeNoise2D(seed + 211), N3 = makeNoise2D(seed + 307);
  const CR = 125, CRATER_FLOOR = 262, LAKE = 268; // summit crater radius / floor / magma lake level

  const coastR = (a) => ISLAND.coastR + 70 * N.noise(Math.cos(a) * 1.3 + 4, Math.sin(a) * 1.3 - 2) + 38 * N.noise(Math.cos(a) * 4.2, Math.sin(a) * 4.2 + 7);
  // sector weights (smooth angular masks) — north peaks, east ash plain, south-west forest, west crystals, north-east ruins
  const sector = (x, z, ax, az, w0, w1) => { const r = Math.hypot(x, z) || 1; return smoothstep(w0, w1, (x * ax + z * az) / r); };

  function macro(x, z) {
    const r = Math.hypot(x, z), a = Math.atan2(z, x);
    const c = r / coastR(a);                                  // 1 at the shoreline
    const land = smoothstep(1.07, 0.93, c);
    // lowlands rising from the beaches; the sea floor drops away outside
    let h = lerp(-26, 0, land) + land * (2.5 + 30 * smoothstep(0.97, 0.5, c));
    // Mount Kaldrith: broad shield + steep summit cone, crater bowl at the top
    const cone = 420 * Math.pow(Math.max(0, 1 - r / 700), 1.9) + 60 * Math.pow(Math.max(0, 1 - r / 260), 1.3);
    h += cone;
    if (r < CR + 20) { const rim = 420 * Math.pow(1 - (CR + 20) / 700, 1.9) + 60 * Math.pow(1 - (CR + 20) / 260, 1.3); h = lerp(h, lerp(CRATER_FLOOR, rim + 6, smoothstep(CR * 0.55, CR + 18, r)), smoothstep(CR + 20, CR, r)); }
    // northern ridges (old collapsed flanks)
    const north = sector(x, z, 0, -1, 0.35, 0.85) * smoothstep(0.28, 0.5, c) * smoothstep(1.0, 0.8, c);
    const rid = N.ridged(x * 0.0042 + 3.1, z * 0.0042 - 1.7, 4, 2.05, 0.5);
    h += north * (35 + 165 * Math.pow(rid, 2.3));
    // east: flat ash plain (pulls the lowland toward a level plateau)
    const east = sector(x, z, 1, 0, 0.35, 0.8) * smoothstep(0.35, 0.55, c) * smoothstep(0.97, 0.82, c);
    h = lerp(h, 26 + 4 * N2.noise(x * 0.004, z * 0.004), east * 0.85 * smoothstep(0.5, 0.6, c));
    // south-west: rolling forest hills with wet hollows
    const sw = sector(x, z, -0.7071, 0.7071, 0.3, 0.8) * smoothstep(0.4, 0.6, c) * smoothstep(0.98, 0.85, c);
    h += sw * (10 * N2.fbm(x * 0.006 + 5, z * 0.006, 3) + 6);
    // west: crystal fields on a raised shelf
    const west = sector(x, z, -1, 0, 0.6, 0.9) * smoothstep(0.5, 0.65, c) * smoothstep(0.95, 0.85, c);
    h += west * (14 + 22 * Math.pow(N3.ridged(x * 0.008, z * 0.008, 3), 2));
    return h;
  }

  // ---- lava bodies: summit lake + rivers that run from the crater rim down the flanks ----
  function river(a0, len, wobble, depth, width) {
    const pts = []; let a = a0;
    for (let r = CR - 6; r <= len; r += 22) {
      a += (N2.noise(r * 0.01 + a0 * 3, a0) * wobble) / Math.max(r, 60) * 22;
      pts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    return { line: polyline(pts), depth, width };
  }
  const rivers = [
    river(TAU * 0.10, 760, 0.9, 1.0, 5.5),  // ESE → ash plain shore
    river(TAU * 0.33, 690, 1.1, 14, 7.0),   // SW: the Lava Canyon (deep channel between cliffs)
    river(TAU * 0.56, 560, 0.8, 1.0, 4.5),  // W
    river(TAU * 0.86, 600, 1.0, 1.0, 5.0),  // NE through the ridges
  ];
  const lakes = [{ x: 520, z: 150, r: 46 }, { x: -330, z: 520, r: 28 }];
  for (const L of lakes) L.level = macro(L.x, L.z) - 2.2;
  const tmp = [0, 0, 0, 0, 0, 0];

  function lava(x, z, out = { sd: 1e9, level: -1e9, fx: 0, fz: 0, depth: 1 }) {
    out.sd = 1e9; out.level = -1e9; out.fx = 0; out.fz = 0; out.depth = 1;
    const r = Math.hypot(x, z);
    { const sd = r - CR * 0.62; if (sd < out.sd) { out.sd = sd; out.level = LAKE; out.fx = 0; out.fz = 0; out.depth = 1; } }
    for (const L of lakes) { const sd = Math.hypot(x - L.x, z - L.z) - L.r - 4 * N.noise(x * 0.05, z * 0.05); if (sd < out.sd) { out.sd = sd; out.level = L.level; out.fx = 0; out.fz = 0; out.depth = 1; } }
    for (const R of rivers) {
      if (R.line.boxDist(x, z) - R.width > Math.min(out.sd, 90)) continue;
      R.line.near(x, z, tmp);
      const w = R.width * (1 + 0.35 * N2.noise(tmp[1] * 0.02, 1.7));
      const sd = tmp[0] - w;
      if (sd < out.sd) {
        out.sd = sd; out.depth = R.depth;
        out.level = macro(tmp[4], tmp[5]) - R.depth - 0.6;
        out.fx = tmp[2] * 0.9; out.fz = tmp[3] * 0.9;
      }
    }
    return out;
  }

  const L0 = { sd: 0, level: 0, fx: 0, fz: 0, depth: 1 };
  const smin = (a, b, k) => { const h = clamp(0.5 + 0.5 * (b - a) / k, 0, 1); return b + (a - b) * h - k * h * (1 - h); };
  function detail(x, z, base) {
    const r = Math.hypot(x, z);
    let d = N.fbm(x * 0.02, z * 0.02, 4) * 2.2 + N2.fbm(x * 0.07 + 9, z * 0.07, 2) * 0.45;
    // pahoehoe lobes on the volcano's flanks
    const flank = smoothstep(120, 220, r) * smoothstep(650, 420, r);
    const lobe = N3.fbm(x * 0.012 + 3, z * 0.012 - 1, 3) * 4;
    d += flank * (Math.floor(lobe) + smoothstep(0.6, 0.9, lobe - Math.floor(lobe))) * 0.7;
    // rugged peaks
    d += sectorN(x, z) * N.ridged(x * 0.03, z * 0.03, 3) * 5;
    // beaches stay smooth near sea level
    d *= smoothstep(1, 7, base);
    return d;
  }
  const sectorN = (x, z) => sector(x, z, 0, -1, 0.4, 0.9) * smoothstep(300, 450, Math.hypot(x, z));

  // Final height + lava level for a point (shared by meshes, collision and the lava surface).
  function sample(x, z, out = { h: 0, level: -1e9, sd: 1e9, fx: 0, fz: 0 }) {
    const m = macro(x, z);
    let h = m + detail(x, z, m);
    const L = lava(x, z, L0);
    out.level = L.level; out.sd = L.sd; out.fx = L.fx; out.fz = L.fz;
    if (L.sd < 60) {
      const steep = L.depth > 4 ? 1.35 : 0.5;                           // canyon walls vs. gentle banks
      const tgt = L.sd < 0 ? L.level - clamp(0.35 - L.sd * 0.55, 0.35, 2.4) : L.level + 0.35 + L.sd * steep + (L.sd / 6) * (L.sd / 6) * 1.2;
      h = lerp(h, Math.max(h, L.level + 0.3 * smoothstep(0, 4, L.sd)), smoothstep(18, 2, L.sd)); // levee right at the edge only
      h = smin(h, tgt, 0.4);
    }
    out.h = h;
    return out;
  }
  const _s = { h: 0, level: 0, sd: 0, fx: 0, fz: 0 };
  const height = (x, z) => sample(x, z, _s).h;

  function regionAt(x, z) {
    const r = Math.hypot(x, z), a = Math.atan2(z, x), c = r / coastR(a);
    if (c > 1.03) return 'sea';
    if (r < CR + 25) return 'caldera';
    if (r < 330) return 'core';
    // canyon: close to the deep SW river
    rivers[1].line.near(x, z, tmp); if (tmp[0] < 70 && c < 0.9) return 'canyon';
    if (c > 0.88) return 'coast';
    if (sector(x, z, 0, -1, 0.35, 0.85) > 0.5) return sector(x, z, 0.7071, -0.7071, 0.6, 0.95) > 0.5 && c > 0.6 ? 'ruins' : 'peaks';
    if (sector(x, z, 1, 0, 0.35, 0.8) > 0.5) return c > 0.62 && z > 0 ? 'geotherm' : 'ashplain';
    if (sector(x, z, -1, 0, 0.6, 0.9) > 0.5) return 'crystal';
    if (sector(x, z, -0.7071, 0.7071, 0.3, 0.8) > 0.4) return 'fungal';
    return 'core';
  }

  // macro splat for the shared volcanic terrain material: { ash, scoria, flow, crack, sulfur, burn } (+ wet)
  function surface(x, z, h, slope, sd, region) {
    const r = Math.hypot(x, z);
    const aa = smoothstep(-0.05, 0.35, N2.fbm(x * 0.012 + 8, z * 0.02 - 4, 3) + 0.25 * smoothstep(10, 2, sd));
    let ash = 0.2 + 0.5 * smoothstep(0, 0.5, N.fbm(x * 0.02 - 6, z * 0.02 + 2, 3)) * (1 - smoothstep(0.25, 0.5, slope));
    let wet = 0, sulfur = 0;
    if (region === 'ashplain') ash = 0.95;
    if (region === 'coast') ash = Math.max(ash, 0.75 * smoothstep(9, 2, h));          // black sand beaches
    if (region === 'fungal') { ash *= 0.6; wet = 0.55 * smoothstep(0.1, 0.5, N3.fbm(x * 0.01, z * 0.01, 3)); }
    if (region === 'geotherm' || region === 'caldera') sulfur = smoothstep(0.2, 0.6, N3.noise(x * 0.03, z * 0.03) + (region === 'caldera' ? 0.3 : 0));
    const youngFlow = smoothstep(0.1, 0.55, N.fbm(x * 0.017 + 21, z * 0.03, 3)) * (1 - aa) * smoothstep(700, 300, r);
    const crack = clamp(youngFlow * 0.85 + 0.9 * smoothstep(16, 3, sd), 0, 1) * (1 - smoothstep(0.25, 0.6, ash));
    return { ash: clamp(ash, 0, 1), scoria: aa, flow: 1 - aa, crack, sulfur, burn: smoothstep(24, 6, sd), wet };
  }

  // a few fixed steam vents (geothermal field + caldera) and the summit plume
  const vents = [];
  for (let i = 0; i < 14; i++) { const a = 0.15 + i * 0.09, r = 640 + (i % 3) * 40; vents.push([Math.cos(a) * r, Math.sin(a) * r]); }
  for (let i = 0; i < 6; i++) { const a = i * 1.05; vents.push([Math.cos(a) * (CR - 20), Math.sin(a) * (CR - 20)]); }

  const spawnZ = 800; // south beach camp (where the expedition boat lands)
  return {
    id: 'island', name: 'Volcanic Island', seed, size: ISLAND.size, half: ISLAND.half,
    macro, height, sample, lava, regionAt, surface, coastR, rivers, lakes, vents,
    crater: { x: 0, z: 0, r: CR, floor: CRATER_FLOOR, lake: LAKE },
    spawn: { player: [40, spawnZ - 30] },
    lavaY: 0, // unused by the island (lava level is per body) — kept for shared shader code
    palette: {
      basalt: [[0.028, 0.026, 0.026], [0.15, 0.135, 0.125]], flow: [[0.016, 0.016, 0.018], [0.11, 0.1, 0.1]],
      scoria: [[0.04, 0.026, 0.022], [0.2, 0.12, 0.085]], oxide: [0.3, 0.085, 0.04], ash: [[0.13, 0.125, 0.12], [0.31, 0.3, 0.29]],
      sulfur: [0.72, 0.6, 0.2], glow: [1.0, 0.3, 0.05], burn: [0.05, 0.03, 0.025],
    },
    light: { sunDir: [-0.55, 0.42, 0.45], sunCol: [1.0, 0.7, 0.5], sun: 3.0, hemiSky: 0x7a7480, hemiGround: 0x4a2a18, hemi: 0.95, env: 0.5, exposure: 1.25 },
    sky: { zenith: [0.07, 0.075, 0.1], horizon: [0.42, 0.3, 0.24], away: [0.22, 0.2, 0.22], sunCol: [1.0, 0.62, 0.35], cloud: [0.12, 0.11, 0.11], cloudLit: [0.62, 0.38, 0.24], glowDir: [0.0, 0.25, -0.97], glowCol: [1.0, 0.3, 0.08], cover: 0.55, sunDisk: 0.8 },
    fog: { density: 0.0019, falloff: 0.0065, base: 0, extra: 0.00008 },
    ashFall: 0.45, embers: 0.6, haze: 0.0008,
  };
}
