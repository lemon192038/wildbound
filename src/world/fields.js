// The three volcanic hunting fields. Each definition is pure data + deterministic functions of (x, z):
//   base(x,z)      terrain height before lava carving / hot-spring basins
//   lavaSD(x,z)    signed distance to the lava region (m, < 0 inside). The terrain is carved below LAVA_Y inside it,
//                  so the flat lava surface shows exactly where getHeight < lavaY (world.lavaAt uses the same test).
//   surface(x,z,h) macro splat: { ash, scoria, flow, crack, sulfur, burn }
// plus palette / lighting / sky / spawn / prop parameters consumed by world.js and its helpers.
import { makeNoise2D, smoothstep, clamp, lerp } from './noise.js';

const TAU = Math.PI * 2;
function polyline(pts) {
  const seg = []; let total = 0;
  for (let i = 0; i < pts.length - 1; i++) { const [ax, az] = pts[i], [bx, bz] = pts[i + 1]; const l = Math.hypot(bx - ax, bz - az); seg.push({ ax, az, dx: bx - ax, dz: bz - az, l, s0: total }); total += l; }
  // returns [distance, arc position s, tangent x, tangent z]
  return { pts, total, near(x, z, out = [0, 0, 0, 0]) {
    let best = 1e9;
    for (const g of seg) {
      let t = ((x - g.ax) * g.dx + (z - g.az) * g.dz) / (g.l * g.l); t = clamp(t, 0, 1);
      const d = Math.hypot(x - g.ax - g.dx * t, z - g.az - g.dz * t);
      if (d < best) { best = d; out[0] = d; out[1] = g.s0 + t * g.l; out[2] = g.dx / g.l; out[3] = g.dz / g.l; }
    }
    return out;
  } };
}
const angNoise = (N, a, f, o) => N.noise(Math.cos(a) * f + o, Math.sin(a) * f - o);

// --------------------------------------------------------------------------------------------
// EMBERFALL FOOTHILLS — open lava plains at the foot of Mount Kaldrith (north), lava river to the east.
// --------------------------------------------------------------------------------------------
function foothills(seed) {
  const N = makeNoise2D(seed + 11), N2 = makeNoise2D(seed + 29);
  const river = polyline([[150, -320], [112, -172], [80, -98], [71, -44], [99, -4], [168, 30], [320, 48]]);
  const tmp = [0, 0, 0, 0];
  const springs = [{ x: -58, z: 30, r: 6.5 }, { x: -34, z: -80, r: 5.2 }, { x: 64, z: 66, r: 5.6 }];
  const vents = [[-46, -52], [52, -70], [-88, 4], [-70, 74], [24, 92], [96, 70], [-104, -66], [40, -102], [-20, -110], [-96, 40]];
  const F = {
    id: 'foothills', name: 'Emberfall Foothills', size: 600, seg: 288, segLow: 168, boundsR: 120, lavaY: -1.4,
    bank: { inside: 0.55, slope: 0.5, quad: 1.4 },
    springs, vents, river,
    spawn: { player: [0, 38], monster: [0, -26] },
    base(x, z) {
      const r = Math.hypot(x, z);
      let h = N.fbm(x * 0.014, z * 0.014, 3) * 0.9 + N.fbm(x * 0.06 + 9, z * 0.06, 2) * 0.22;
      const k = smoothstep(26, 58, r);
      // pahoehoe flow-front steps (lobes run north->south, away from the volcano)
      const lobe = N2.fbm(x * 0.011 + 3, z * 0.024 - 1, 4) * 4.5 + N2.noise(x * 0.05, z * 0.05) * 0.4;
      const fq = lobe - Math.floor(lobe);
      h += (Math.floor(lobe) + smoothstep(0.62, 0.9, fq)) * 0.55 * k;
      // black basalt ridges (old flow levees), elongated along the flow direction
      const rid = N.ridged(x * 0.011 + 1.3, z * 0.0042 + 7.1, 4, 2.1, 0.5);
      h += Math.pow(rid, 3.2) * 16 * smoothstep(52, 100, r);
      // outer hills hide the map edge; lower to the north so the volcano dominates the skyline
      const north = smoothstep(0.2, 0.95, -z / Math.max(r, 1));
      const out = smoothstep(118, 270, r);
      const mt = N.ridged(x * 0.0065 - 4, z * 0.0065 + 2, 5, 2.05, 0.5);
      h += out * (22 + 60 * mt * mt) * (1 - 0.62 * north);
      h += N.fbm(x * 0.05, z * 0.05, 3) * 1.4 * out;
      return h;
    },
    lavaSD(x, z) {
      river.near(x, z, tmp);
      const w = 4.6 + 1.6 * N2.noise(tmp[1] * 0.03, 3.3) + 2.5 * smoothstep(150, 330, Math.hypot(x, z));
      return tmp[0] - w;
    },
    lavaFlow(x, z) { river.near(x, z, tmp); return [tmp[2] * 0.7, tmp[3] * 0.7]; },
    surface(x, z, h, slope, sd) {
      const r = Math.hypot(x, z);
      const aa = smoothstep(-0.05, 0.35, N2.fbm(x * 0.012 + 8, z * 0.02 - 4, 4) + 0.25 * smoothstep(10, 2, sd));
      const ash = clamp(0.18 + 0.55 * smoothstep(0.0, 0.5, N.fbm(x * 0.02 - 6, z * 0.02 + 2, 3)) * (1 - smoothstep(0.25, 0.5, slope)) + 0.35 * smoothstep(140, 260, r), 0, 1);
      const youngFlow = smoothstep(0.1, 0.55, N.fbm(x * 0.017 + 21, z * 0.03, 3)) * (1 - aa);
      const crack = clamp(youngFlow * 0.85 + 0.9 * smoothstep(16, 3, sd), 0, 1) * (1 - smoothstep(0.2, 0.7, ash));
      let sulfur = 0;
      for (const [vx, vz] of vents) sulfur = Math.max(sulfur, smoothstep(7, 1.5, Math.hypot(x - vx, z - vz) + N.noise(x * 0.4, z * 0.4) * 1.5));
      for (const s of springs) sulfur = Math.max(sulfur, 0.8 * smoothstep(s.r + 4, s.r + 0.5, Math.hypot(x - s.x, z - s.z) + N.noise(x * 0.5, z * 0.5)));
      const trodden = smoothstep(32, 12, r) * 0.35;
      return { ash: clamp(ash + trodden, 0, 1), scoria: aa, flow: 1 - aa, crack, sulfur, burn: smoothstep(24, 6, sd) };
    },
    palette: {
      basalt: [[0.028, 0.026, 0.026], [0.15, 0.135, 0.125]], flow: [[0.016, 0.016, 0.018], [0.11, 0.1, 0.1]],
      scoria: [[0.04, 0.026, 0.022], [0.2, 0.12, 0.085]], oxide: [0.3, 0.085, 0.04], ash: [[0.15, 0.14, 0.135], [0.34, 0.32, 0.3]],
      sulfur: [0.72, 0.6, 0.2], glow: [1.0, 0.3, 0.05], burn: [0.05, 0.03, 0.025],
    },
    light: { sunDir: [-0.82, 0.24, 0.3], sunCol: [1.0, 0.56, 0.32], sun: 2.8, hemiSky: 0x6c5a58, hemiGround: 0x5a2410, hemi: 0.55, env: 0.32, exposure: 1.05 },
    sky: { zenith: [0.045, 0.04, 0.05], horizon: [0.36, 0.19, 0.13], away: [0.17, 0.12, 0.115], sunCol: [1.0, 0.5, 0.25], cloud: [0.09, 0.075, 0.075], cloudLit: [0.55, 0.26, 0.14], glowDir: [0.095, 0.1, -0.99], glowCol: [1.0, 0.28, 0.06], cover: 0.62, sunDisk: 0.7 },
    fog: { density: 0.0027, falloff: 0.016, base: -2, extra: 0.00022 },
    distant: { r0: 280, lowNorth: 0.4, palette: [[0.03, 0.028, 0.03], [0.2, 0.15, 0.13]] },
    volcano: { x: 120, z: -1250, r: 820, h: 560, crater: 70, streams: 5, scale: 1 },
    ashFall: 0.7, embers: 1.0, haze: 0.0012,
  };
  return F;
}

// --------------------------------------------------------------------------------------------
// ASHFANG WASTES — ash-buried plateau ringed by a lava moat, basalt towers, broken arch bridge.
// --------------------------------------------------------------------------------------------
function wastes(seed) {
  const N = makeNoise2D(seed + 47), N2 = makeNoise2D(seed + 83);
  const chans = [polyline([[86, -30], [130, -70], [170, -140], [230, -230]]), polyline([[-80, 40], [-125, 85], [-150, 160], [-210, 240]]), polyline([[-30, -86], [-50, -140], [-30, -210]])];
  const tubes = [polyline([[100, 60], [140, 95], [190, 110], [230, 160]]), polyline([[-100, -60], [-150, -70], [-190, -120]])];
  const tmp = [0, 0, 0, 0];
  const springs = [{ x: -40, z: -18, r: 5.0 }, { x: 30, z: -40, r: 4.4 }];
  const vents = [[-24, 30], [42, 18], [-48, 22], [10, -52], [52, -26]];
  const Ri = (a) => 68.5 + 2.5 * angNoise(N2, a, 1.6, 3), Ro = (a) => 84 + 5 * angNoise(N2, a, 2.2, 9);
  const F = {
    id: 'wastes', name: 'Ashfang Wastes', size: 460, seg: 256, segLow: 150, boundsR: 64, lavaY: -7.2,
    bank: { inside: 0.5, slope: 1.35, quad: 2.6 },
    springs, vents, chans, tubes, Ri, Ro,
    spawn: { player: [0, 38], monster: [0, -25] },
    bridge: { a: 0.32, r0: 60, r1: 98, gap: [75, 80] },
    base(x, z) {
      const r = Math.hypot(x, z);
      const warp = N.fbm(x * 0.01, z * 0.01, 3) * 9;
      // wind-shaped ash dunes (wind from the west-north-west)
      const du = x * 0.93 + z * 0.37 + warp * 3;
      const dune = Math.pow(Math.sin(du * 0.085) * 0.5 + 0.5, 1.6) * 1.0 + Math.sin(du * 0.21 + z * 0.04) * 0.18;
      const amp = lerp(0.25, 1.25, smoothstep(18, 46, r));
      let h = dune * amp + N.fbm(x * 0.03 + 3, z * 0.03, 3) * 0.5;
      // basalt rim lip around the plateau edge
      h += 1.4 * smoothstep(50, 57, r) * (0.6 + 0.4 * N2.noise(x * 0.08, z * 0.08));
      // badlands beyond the moat: terraced mesas + giant ridges
      const out = smoothstep(84, 116, r);
      const rid = N.ridged(x * 0.009 + 2, z * 0.009 - 5, 5, 2.1, 0.5);
      let hh = out * (8 + 34 * rid * rid) + smoothstep(150, 230, r) * 40 * N.fbm(x * 0.004, z * 0.004, 3, 2, 0.5) + smoothstep(140, 230, r) * 30;
      const q = hh / 6.5, f = q - Math.floor(q);
      hh = lerp(hh, (Math.floor(q) + smoothstep(0.55, 0.85, f)) * 6.5, 0.8 * out);
      h += hh;
      // collapsed lava tubes: sunken trenches across the badlands
      for (const t of tubes) { t.near(x, z, tmp); h -= 6 * smoothstep(7, 1.5, tmp[0]) * (0.6 + 0.4 * Math.sin(tmp[1] * 0.12)); }
      return h;
    },
    lavaSD(x, z) {
      const r = Math.hypot(x, z), a = Math.atan2(z, x);
      let sd = Math.max(Ri(a) - r, r - Ro(a));
      for (const c of chans) { c.near(x, z, tmp); sd = Math.min(sd, tmp[0] - (3.2 + 1.2 * N2.noise(tmp[1] * 0.05, 1.7))); }
      return sd;
    },
    lavaFlow(x, z) {
      const r = Math.hypot(x, z), a = Math.atan2(z, x);
      const moat = Math.max(Ri(a) - r, r - Ro(a));
      for (const c of chans) { c.near(x, z, tmp); if (tmp[0] - 3.5 < moat) return [tmp[2] * 0.6, tmp[3] * 0.6]; }
      return [-Math.sin(a) * 0.3, Math.cos(a) * 0.3];
    },
    surface(x, z, h, slope, sd) {
      const r = Math.hypot(x, z);
      const ashN = N2.fbm(x * 0.03 + 4, z * 0.03, 3);
      const ash = (1 - 0.45 * smoothstep(80, 130, r)) * clamp(smoothstep(-0.3, 0.25, ashN + 0.25 * N.fbm(x * 0.11, z * 0.11, 2)) * 0.95 + 0.25 * smoothstep(20, 45, r) - 0.9 * smoothstep(0.32, 0.55, slope) - 0.5 * smoothstep(10, 2, sd), 0, 1);
      const scoria = smoothstep(0.1, 0.5, slope) * 0.7 + smoothstep(12, 2, sd) * 0.5;
      const crack = 0.9 * smoothstep(9, 1, sd) + 0.7 * smoothstep(0.1, 0.5, N.fbm(x * 0.05, z * 0.05, 2));
      let sulfur = 0;
      for (const [vx, vz] of vents) sulfur = Math.max(sulfur, 0.8 * smoothstep(6, 1, Math.hypot(x - vx, z - vz) + N.noise(x * 0.4, z * 0.4) * 1.5));
      for (const s of springs) sulfur = Math.max(sulfur, smoothstep(s.r + 4.5, s.r + 0.5, Math.hypot(x - s.x, z - s.z) + N.noise(x * 0.5, z * 0.5)));
      return { ash, scoria: clamp(scoria, 0, 1), flow: 0.6, crack: clamp(crack, 0, 1), sulfur, burn: smoothstep(14, 3, sd) * 0.8 };
    },
    palette: {
      basalt: [[0.03, 0.03, 0.032], [0.17, 0.16, 0.155]], flow: [[0.02, 0.02, 0.022], [0.12, 0.115, 0.11]],
      scoria: [[0.05, 0.035, 0.03], [0.2, 0.13, 0.1]], oxide: [0.24, 0.08, 0.04], ash: [[0.13, 0.13, 0.13], [0.33, 0.325, 0.32]],
      sulfur: [0.78, 0.7, 0.32], glow: [1.0, 0.34, 0.06], burn: [0.06, 0.045, 0.04],
    },
    light: { sunDir: [0.42, 0.42, -0.8], sunCol: [1.0, 0.7, 0.48], sun: 2.4, hemiSky: 0x6e6862, hemiGround: 0x4a2a1c, hemi: 0.6, env: 0.4, exposure: 1.0 },
    sky: { zenith: [0.11, 0.105, 0.11], horizon: [0.42, 0.36, 0.32], away: [0.26, 0.245, 0.24], sunCol: [1.0, 0.7, 0.45], cloud: [0.16, 0.15, 0.15], cloudLit: [0.55, 0.42, 0.32], glowDir: [-0.7, 0.05, -0.71], glowCol: [1.0, 0.35, 0.08], cover: 0.5, sunDisk: 0.45 },
    fog: { density: 0.0036, falloff: 0.02, base: -6, extra: 0.00025 },
    distant: { r0: 210, lowNorth: 0, palette: [[0.05, 0.048, 0.05], [0.26, 0.24, 0.23]], mesa: true },
    volcano: { x: -1150, z: -1200, r: 600, h: 380, crater: 55, streams: 3, scale: 1 },
    ashFall: 1.4, embers: 0.6, haze: 0.0009,
  };
  return F;
}

// --------------------------------------------------------------------------------------------
// CINDERDEEP HOLLOW — a vast cavern inside the volcano. Walls/roof enclose it; lavafalls feed pools in alcoves.
// --------------------------------------------------------------------------------------------
function hollow(seed) {
  const N = makeNoise2D(seed + 131), N2 = makeNoise2D(seed + 151);
  const dirs = (deg) => [Math.cos(deg * Math.PI / 180), Math.sin(deg * Math.PI / 180)];
  const passages = [dirs(90), dirs(212), dirs(332)].map(([cx, cz]) => ({ cx, cz })); // +z south (spawn side), west-north-west, east-north-east
  const alcoves = [dirs(28), dirs(150), dirs(268)].map(([cx, cz]) => ({ cx, cz, r: 104 }));
  const springs = [{ x: -52, z: -26, r: 4.6 }, { x: 46, z: -40, r: 4.0 }];
  const vents = [[-30, 18], [26, 24], [-14, -38], [40, 6], [-44, -8], [8, 48], [58, 32], [-60, 30]];
  const angDist = (x, z, c) => { const along = x * c.cx + z * c.cz, perp = Math.abs(-x * c.cz + z * c.cx); return [along, perp]; };
  const F = {
    id: 'hollow', name: 'Cinderdeep Hollow', size: 300, seg: 220, segLow: 132, boundsR: 84, lavaY: -1.2, cave: true,
    bank: { inside: 0.6, slope: 0.9, quad: 2.0 },
    springs, vents, passages, alcoves,
    spawn: { player: [0, 39], monster: [0, -25] },
    roof: { apex: 106, edge: 140, edgeY: 72, oculus: 20 },
    passageMask(x, z) {
      let m = 0;
      for (const p of passages) {
        const [al, pe] = angDist(x, z, p);
        const w = 6.5 + 1.5 * N2.noise(al * 0.05, 2.2) + 0.03 * Math.max(0, al - 80);
        m = Math.max(m, smoothstep(w + 6, w, pe) * smoothstep(55, 70, al) * (1 - smoothstep(118, 130, al)));
      }
      return m;
    },
    wallR(a) {
      let al = 0; const c = Math.cos(a), s = Math.sin(a);
      for (const p of alcoves) al = Math.max(al, smoothstep(0.86, 0.985, c * p.cx + s * p.cz));
      return 90 + 8 * angNoise(N2, a, 1.9, 5) + 4 * angNoise(N2, a, 4.5, 1) + 24 * al;
    },
    base(x, z) {
      const r = Math.hypot(x, z), a = Math.atan2(z, x);
      let h = N.fbm(x * 0.028, z * 0.028, 3) * 0.45 + N.fbm(x * 0.09 + 5, z * 0.09, 2) * 0.12 + 1.6 * smoothstep(30, 80, r) * smoothstep(30, 80, r);
      h += smoothstep(70, 90, r) * (3 + 3 * N.fbm(x * 0.06, z * 0.06, 3));
      const wr = F.wallR(a);
      // towering walls with vertical columnar striations
      const col = N.ridged(a * 24, r * 0.02 + 3, 3, 2, 0.5);
      let wall = smoothstep(wr, wr + 13, r) * (104 + 22 * N.fbm(a * 6, r * 0.01, 3)) + smoothstep(wr - 2, wr + 30, r) * col * 10;
      const pm = F.passageMask(x, z);
      wall *= 1 - pm;
      h += wall + pm * (smoothstep(85, 128, r) * 9 + N.fbm(x * 0.1, z * 0.1, 2) * 1.2);
      h = Math.max(h, smoothstep(128, 141, r) * (150 + 20 * N.fbm(a * 4, 3, 2)));
      return h;
    },
    lavaSD(x, z) {
      let sd = 1e9;
      for (const p of alcoves) {
        const px = p.cx * p.r, pz = p.cz * p.r; const dx = x - px, dz = z - pz;
        const along = dx * p.cx + dz * p.cz, perp = -dx * p.cz + dz * p.cx; // pool elongated tangentially
        const e = Math.hypot(along / 1.0, perp / 1.7);
        sd = Math.min(sd, e - 12.5 - 1.5 * N2.noise(x * 0.08, z * 0.08));
      }
      for (const p of passages) { // glowing pools at the far ends of the passages
        const [al, pe] = angDist(x, z, p);
        sd = Math.min(sd, Math.hypot(al - 112, pe) - 5.5);
      }
      return sd;
    },
    lavaFlow(x, z) { const r = Math.hypot(x, z) || 1; return [-x / r * 0.25, -z / r * 0.25]; },
    extraHeat(x, z) {
      const r = Math.hypot(x, z) || 1; let h = 0;
      for (const p of alcoves) { const c = (x * p.cx + z * p.cz) / r; h = Math.max(h, smoothstep(0.985, 0.999, c) * smoothstep(100, 112, r) * (1 - smoothstep(128, 136, r))); }
      return h * 0.8;
    },
    surface(x, z, h, slope, sd) {
      const r = Math.hypot(x, z);
      const obs = smoothstep(-0.05, 0.4, N2.fbm(x * 0.025 + 2, z * 0.025 - 7, 4)) * (1 - smoothstep(60, 80, r));
      const scoria = clamp(smoothstep(64, 84, r) + smoothstep(0.25, 0.5, slope) * 0.5 + 0.35 * (1 - obs) * smoothstep(0.1, 0.5, N.fbm(x * 0.05, z * 0.05, 2)), 0, 1);
      const ash = clamp(0.1 + 0.3 * smoothstep(-0.2, 0.6, N.fbm(x * 0.04 + 9, z * 0.04, 3)) - obs * 0.3, 0, 1) * (1 - smoothstep(0.3, 0.5, slope));
      const crack = clamp(obs * 0.65 + 0.9 * smoothstep(12, 2, sd) + 0.2, 0, 1);
      let sulfur = 0;
      for (const [vx, vz] of vents) sulfur = Math.max(sulfur, 0.35 * smoothstep(3.5, 0.8, Math.hypot(x - vx, z - vz) + N.noise(x * 0.4, z * 0.4) * 1.2));
      for (const s of springs) sulfur = Math.max(sulfur, smoothstep(s.r + 4, s.r + 0.5, Math.hypot(x - s.x, z - s.z) + N.noise(x * 0.5, z * 0.5)));
      return { ash, scoria, flow: obs, crack, sulfur, burn: 0.4 + 0.6 * smoothstep(14, 2, sd) };
    },
    palette: {
      basalt: [[0.022, 0.018, 0.02], [0.12, 0.1, 0.1]], flow: [[0.008, 0.007, 0.01], [0.07, 0.06, 0.07]],
      scoria: [[0.04, 0.022, 0.018], [0.17, 0.09, 0.065]], oxide: [0.26, 0.07, 0.03], ash: [[0.1, 0.09, 0.085], [0.22, 0.2, 0.19]],
      sulfur: [0.68, 0.56, 0.2], glow: [1.0, 0.32, 0.06], burn: [0.04, 0.025, 0.02],
    },
    light: { sunDir: [0.06, 0.99, 0.09], sunCol: [1.0, 0.86, 0.7], sun: 4.5, hemiSky: 0x5c4a46, hemiGround: 0x6a3018, hemi: 1.0, env: 0.22, exposure: 1.2, bounce: [0xff8048, 420] },
    sky: { zenith: [0.32, 0.3, 0.3], horizon: [0.55, 0.42, 0.32], away: [0.4, 0.34, 0.3], sunCol: [1.0, 0.8, 0.6], cloud: [0.3, 0.27, 0.26], cloudLit: [0.8, 0.68, 0.55], glowDir: [0, 1, 0], glowCol: [1.0, 0.4, 0.1], cover: 0.4, sunDisk: 0.8 },
    // fog colour in the cave: dark ember haze, not the sky
    fog: { density: 0.0075, falloff: 0.012, base: 0, extra: 0.0002, cave: [0.075, 0.03, 0.018] },
    ashFall: 0.6, embers: 1.4, haze: 0.0014,
  };
  return F;
}

export const FIELDS = { foothills, wastes, hollow };
export function getField(id, seed) { return (FIELDS[id] || FIELDS.foothills)(seed); }
export { polyline, TAU };
