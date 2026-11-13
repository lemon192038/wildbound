// Port Halvane layout: walkable primitives (terraces, stairs-as-ramps, timber decks), blocked footprints,
// natural terrain (headlands, cliffs, sea floor) and the baked walk heightfield / mask / circle colliders.
import { makeNoise2D, smoothstep, lerp, clamp } from '../world/noise.js';

// kind: stone (cobbled terrace prism), plaza, deck (timber on posts), stairs (stone steps), wstairs (timber steps)
// rect: x0,x1,z0,z1 ; ramp: y0 at (axis min side if dir=+1 ... ) we store explicit y0 at a0 and y1 at a1 along axis
export const PRIMS = [
  { id: 'plaza', kind: 'plaza', x0: -18, x1: 18, z0: -14, z1: 16, y: 8 },
  { id: 'guildPorch', kind: 'stone', x0: -14, x1: 14, z0: 16, z1: 24, y: 8 },
  { id: 'forgeYard', kind: 'stone', x0: 18, x1: 46, z0: 2, z1: 18, y: 8 },
  { id: 'S2', kind: 'stairs', x0: 18, x1: 26, z0: -12, z1: -5, axis: 'x', a0: 18, y0: 8, a1: 26, y1: 5 },
  { id: 'market', kind: 'stone', x0: 26, x1: 54, z0: -26, z1: -2, y: 5 },
  { id: 'quay', kind: 'stone', x0: -56, x1: 48, z0: -46, z1: -28, y: 2.4 },
  { id: 'S3', kind: 'stairs', x0: 30, x1: 36, z0: -34, z1: -26, axis: 'z', a0: -26, y0: 5, a1: -34, y1: 2.4 },
  { id: 'S1', kind: 'stairs', x0: -7, x1: 7, z0: -28, z1: -14, axis: 'z', a0: -14, y0: 8, a1: -28, y1: 2.4 },
  { id: 'dockyard', kind: 'stone', x0: -62, x1: -24, z0: -28, z1: -8, y: 2.4 },
  { id: 'P1', kind: 'deck', x0: -38, x1: -32, z0: -80, z1: -46, y: 2.3 },
  { id: 'P2', kind: 'deck', x0: -4, x1: 4, z0: -82, z1: -46, y: 2.3 },
  { id: 'P2h', kind: 'deck', x0: -12, x1: 12, z0: -88, z1: -81, y: 2.3 },
  { id: 'P3', kind: 'deck', x0: 24, x1: 29, z0: -72, z1: -46, y: 2.3 },
  { id: 'bastion', kind: 'stone', circle: true, cx: 46, cz: -53, r: 8, y: 2.4 },
  { id: 'viewDeck', kind: 'deck', x0: 54, x1: 60, z0: -24, z1: -8, y: 5 },
  { id: 'alchemy', kind: 'stone', x0: -44, x1: -25, z0: -6, z1: 14, y: 11 },
  { id: 'S4', kind: 'stairs', x0: -25, x1: -18, z0: 1, z1: 7, axis: 'x', a0: -25, y0: 11, a1: -18, y1: 8 },
  { id: 'R1', kind: 'stone', x0: 16, x1: 56, z0: 26, z1: 56, y: 12 },
  { id: 'S5', kind: 'wstairs', x0: 20, x1: 26, z0: 17, z1: 26, axis: 'z', a0: 17, y0: 8, a1: 26, y1: 12 },
  { id: 'R2', kind: 'stone', x0: -54, x1: -18, z0: 22, z1: 56, y: 14 },
  { id: 'S6', kind: 'wstairs', x0: -34, x1: -28, z0: 14, z1: 22, axis: 'z', a0: 14, y0: 11, a1: 22, y1: 14 },
];
export const primY = (p, x, z) => {
  if (p.axis == null) return p.y;
  const a = p.axis === 'x' ? x : z; const t = clamp((a - p.a0) / (p.a1 - p.a0), 0, 1); return p.y0 + (p.y1 - p.y0) * t;
};
export const inPrim = (p, x, z, m = 0) => p.circle ? Math.hypot(x - p.cx, z - p.cz) <= p.r + m : x >= p.x0 - m && x <= p.x1 + m && z >= p.z0 - m && z <= p.z1 + m;
export const primTop = (p) => (p.axis == null ? p.y : Math.max(p.y0, p.y1));

// Talk spots and NPC poses (rotation: 0 faces +z, PI/2 faces +x)
export const SPOTS = {
  quest: { npc: [0, 21.7, Math.PI], talk: [0, 18.3] },
  smith: { npc: [31.3, 9, -Math.PI / 2], talk: [27.8, 9], anvil: [30.1, 9] },
  alchemy: { npc: [-34.3, 3, Math.PI / 2], talk: [-30.6, 3] },
  shop: { npc: [42.75, -14, -Math.PI / 2], talk: [39.1, -14] },
  storage: { npc: [-42.8, -18, Math.PI / 2], talk: [-39.3, -18] },
  dock: { npc: [1.6, -71.2, 0], talk: [1.6, -68.0] },
};

// blocked footprints inside walkable prims: rects [x0,x1,z0,z1] or circles {c:[x,z], r}
export const BLOCKS = [
  { c: [0, 1], r: 5.2 }, // monument fountain
  [-14, 14, 19.6, 24], // guild counter + hall front
  [-11.2, -8.2, 16.6, 17.6], [8.2, 11.2, 16.6, 17.6], // quest boards
  [34, 46, 1, 18], // forge building
  { c: SPOTS.smith.anvil, r: 0.65 }, [31.5, 33.5, 2.6, 3.8], [24, 28, 2, 3.2], { c: [22.5, 13], r: 0.9 },
  [-14, 14, 23.9, 43], // guild hall
  // market stalls (built in build.js with same table)
  [-60, -44, -27, -9], // warehouse
  { c: [46, -53], r: 3.2 }, // crane
  [-44, -32.6, -5, 13], // alchemy atelier + counter
  { c: [-56, -45.5], r: 4.6 }, // quay tower
  [47, 54, -26, -20], // market corner tower
];
export const STALLS = [ // [x, z, w, d, rot] market stalls (blocked)
  [31, -9, 4, 2.6, 0], [31, -19, 4, 2.6, 0], [49, -8, 4, 2.6, Math.PI], [49, -19, 3.6, 2.6, Math.PI],
  [42.6, -14, 2.4, 6, 0], // merchant's big counter stall (behind counter at x≈41..44)
];
for (const [x, z, w, d] of STALLS) BLOCKS.push([x - w / 2, x + w / 2, z - d / 2, z + d / 2]);
BLOCKS.push([40.2, 44.2, -17.4, -10.6]);
BLOCKS.push([-42.2, -40.9, -19.6, -16.4]); // quartermaster's ledger table

// Houses on the residential terraces (x, z, w, d, rot, floors) — blocked, walkable lanes between
export const HOUSES_R1 = [[34, 31, 8, 7, 0, 2], [47, 31.5, 10, 7, 0, 3], [21, 49, 8, 8, Math.PI, 2], [33, 50, 8, 7, Math.PI, 3], [46.5, 49, 10, 8, Math.PI, 2], [53, 40, 5, 7, -Math.PI / 2, 2]];
export const HOUSES_R2 = [[-46, 28.5, 9, 7, 0, 2], [-22.5, 29, 7, 8, Math.PI / 2, 3], [-48, 48.5, 9, 8, Math.PI, 3], [-36, 50, 8, 7, Math.PI, 2], [-24, 48.5, 9, 8, Math.PI, 2]];
for (const [x, z, w, d, r] of [...HOUSES_R1, ...HOUSES_R2]) { const sw = Math.abs(Math.sin(r)) > 0.5; const W = sw ? d : w, D = sw ? w : d; BLOCKS.push([x - W / 2 - 0.3, x + W / 2 + 0.3, z - D / 2 - 0.3, z + D / 2 + 0.3]); }
BLOCKS.push({ c: [22, 31], r: 1.6 }); // well on R1 square
BLOCKS.push({ c: [-40, 38], r: 1.6 }); // tree on R2

const inBlock = (b, x, z) => Array.isArray(b) ? x >= b[0] && x <= b[1] && z >= b[2] && z <= b[3] : Math.hypot(x - b.c[0], z - b.c[1]) <= b.r;

// ---------------- natural terrain ----------------
const N = makeNoise2D(4711);
export const RIVER_Z = -30, CLIFF_X = 75, CLIFF_TOP = 32;
export function natural(x, z) {
  const n1 = N.fbm(x * 0.018, z * 0.018, 4), n2 = N.fbm(x * 0.05 + 7, z * 0.05 - 3, 4), n3 = N.fbm(x * 0.008 - 5, z * 0.008, 3);
  const zc = -29 + n1 * 4;
  let land = smoothstep(zc - 9, zc + 2, z);
  const inlet = smoothstep(52, 56, x) * (1 - smoothstep(CLIFF_X - 2, CLIFF_X + 1, x)) * (1 - smoothstep(-6, 3, z));
  land *= 1 - inlet;
  let h = lerp(-9 + n2 * 2, 6.5 + Math.max(0, z - 22) * 0.34 + n2 * 2.5, land);
  // western headland with the lighthouse
  const wm = (1 - smoothstep(-68, -60, x + n1 * 5)) * smoothstep(-118, -104, z + n1 * 6);
  h = Math.max(h, lerp(-10, 20 + n2 * 4 + Math.max(0, z + 20) * 0.15, wm));
  // eastern cliff massif (waterfall lip at x≈66, z≈RIVER_Z)
  const em = smoothstep(CLIFF_X - 1.5, CLIFF_X + 3, x + n1 * 1.5) * smoothstep(-84, -70, z + n1 * 5) * (1 - smoothstep(-2, 30, z + n1 * 8));
  let eh = CLIFF_TOP + n2 * 7 + N.ridged(x * 0.04, z * 0.04, 3) * 6 + Math.max(0, z + 20) * 0.25 + Math.max(0, x - 90) * 0.3;
  const ch = (1 - smoothstep(3, 7, Math.abs(z - RIVER_Z))) * smoothstep(CLIFF_X - 2, CLIFF_X + 6, x); eh -= ch * 5;
  h = Math.max(h, lerp(-10, eh, em));
  // southern hills and forest slopes rise towards the mountains
  h += smoothstep(55, 150, z) * 30 * (0.65 + 0.35 * n3) + smoothstep(70, 160, Math.abs(x)) * smoothstep(-40, 40, z) * 18;
  return h;
}

// ---------------- bake ----------------
export function bakeLayout() {
  // walk heightfield: 0.5 m nodes over [-100,100]
  const HR = 0.5, HX0 = -100, HN = 401;
  const H = new Float32Array(HN * HN);
  for (let j = 0; j < HN; j++) for (let i = 0; i < HN; i++) {
    const x = HX0 + i * HR, z = HX0 + j * HR;
    let y = null;
    for (const p of PRIMS) if (inPrim(p, x, z)) y = primY(p, x, z);
    if (y == null) { let best = 1.2; for (const p of PRIMS) { if (!inPrim(p, x, z, best)) continue; const d = p.circle ? Math.hypot(x - p.cx, z - p.cz) - p.r : Math.max(p.x0 - x, x - p.x1, p.z0 - z, z - p.z1, 0); if (d < best) { best = d; y = primY(p, clamp(x, p.x0 ?? -1e9, p.x1 ?? 1e9), clamp(z, p.z0 ?? -1e9, p.z1 ?? 1e9)); } } }
    if (y == null) y = Math.max(0, natural(x, z));
    H[j * HN + i] = y;
  }
  function getHeight(x, z) {
    const fx = (x - HX0) / HR, fz = (z - HX0) / HR;
    if (fx < 0 || fz < 0 || fx >= HN - 1 || fz >= HN - 1) return Math.max(0, natural(x, z));
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, k = j * HN + i;
    return (H[k] * (1 - u) + H[k + 1] * u) * (1 - v) + (H[k + HN] * (1 - u) + H[k + HN + 1] * u) * v;
  }
  return { getHeight, finalize: () => bakeMask(getHeight) };
}
function bakeMask(getHeight) {
  // walk mask: 1 m cells, centres at half-integers over [-100,100]
  const MN = 200, MX0 = -100, W = new Uint8Array(MN * MN), CY = new Float32Array(MN * MN);
  for (let j = 0; j < MN; j++) for (let i = 0; i < MN; i++) {
    const x = MX0 + i + 0.5, z = MX0 + j + 0.5; let y = null;
    for (const p of PRIMS) if (inPrim(p, x, z)) y = primY(p, x, z);
    if (y == null) continue;
    let ok = true; for (const b of BLOCKS) if (inBlock(b, x, z)) { ok = false; break; }
    if (ok) { W[j * MN + i] = 1; CY[j * MN + i] = y; }
  }
  // height continuity: neighbouring walkable cells must not differ by more than a step
  const kill = [];
  for (let j = 0; j < MN; j++) for (let i = 0; i < MN; i++) {
    const k = j * MN + i; if (!W[k]) continue;
    for (const [di, dj] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) { const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= MN || jj >= MN) continue; const kk = jj * MN + ii; if (W[kk] && Math.abs(CY[kk] - CY[k]) > 0.75) kill.push(CY[kk] > CY[k] ? k : kk); }
  }
  for (const k of kill) W[k] = 0;
  // colliders: blocked cells touching walkable cells
  const colliders = [];
  for (let j = 0; j < MN; j++) for (let i = 0; i < MN; i++) {
    const k = j * MN + i; if (W[k]) continue;
    let edge = false;
    for (let dj = -1; dj <= 1 && !edge; dj++) for (let di = -1; di <= 1; di++) { const ii = i + di, jj = j + dj; if (ii >= 0 && jj >= 0 && ii < MN && jj < MN && W[jj * MN + ii]) { edge = true; break; } }
    if (edge) colliders.push({ x: MX0 + i + 0.5, z: MX0 + j + 0.5, r: 0.72 });
  }
  function walkable(x, z) { const i = Math.floor(x - MX0), j = Math.floor(z - MX0); return i >= 0 && j >= 0 && i < MN && j < MN && W[j * MN + i] === 1; }
  return { getHeight, walkable, colliders, mask: W, MN, MX0 };
}

// Visual terrain height: natural terrain, with the gaps between terraces relaxed into smooth embankments.
export function bakeTerrain() {
  const R = 2, X0 = -140, n = 141, G = new Float32Array(n * n), fixed = new Uint8Array(n * n), near = new Float32Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = X0 + i * R, z = X0 + j * R, k = j * n + i; let y = null, d = 1e9;
    for (const p of PRIMS) {
      if (p.kind === 'deck') continue;
      if (inPrim(p, x, z, 1)) y = y == null ? primY(p, x, z) - 0.6 : Math.min(y, primY(p, x, z) - 0.6);
      const dd = p.circle ? Math.hypot(x - p.cx, z - p.cz) - p.r : Math.hypot(Math.max(p.x0 - x, 0, x - p.x1), Math.max(p.z0 - z, 0, z - p.z1)); d = Math.min(d, dd);
    }
    const nat = natural(x, z); near[k] = d;
    if (y != null) { G[k] = nat < -3 && d > -2 ? Math.min(y, nat) : y; fixed[k] = 1; }
    else { G[k] = nat; fixed[k] = d > 12 || nat < -3 ? 1 : 0; if (!fixed[k]) G[k] = Math.max(nat, 4); }
  }
  for (let it = 0; it < 160; it++) for (let j = 1; j < n - 1; j++) for (let i = 1; i < n - 1; i++) {
    const k = j * n + i; if (fixed[k]) continue; G[k] = (G[k - 1] + G[k + 1] + G[k - n] + G[k + n]) * 0.25;
  }
  // gaps between terraces sink to the lower level so the masonry retaining walls stand exposed
  const G2 = G.slice();
  for (let j = 1; j < n - 1; j++) for (let i = 1; i < n - 1; i++) {
    const k = j * n + i; if (fixed[k]) continue; const x = X0 + i * R, z = X0 + j * R; let lo = 1e9, hi = -1e9;
    for (const p of PRIMS) { if (p.kind === 'deck') continue; const dd = p.circle ? Math.hypot(x - p.cx, z - p.cz) - p.r : Math.hypot(Math.max(p.x0 - x, 0, x - p.x1), Math.max(p.z0 - z, 0, z - p.z1)); if (dd < 9) { lo = Math.min(lo, Math.min(primY(p, x, z), p.axis ? Math.min(p.y0, p.y1) : p.y)); hi = Math.max(hi, primTop(p)); } }
    if (lo < 1e8 && G[k] < hi - 1.0) G2[k] = Math.min(G[k], lo + 0.5);
  }
  for (let k = 0; k < G.length; k++) G[k] = G2[k];
  const N2 = makeNoise2D(99);
  return function terrainY(x, z) {
    const fx = (x - X0) / R, fz = (z - X0) / R;
    let y;
    if (fx < 0 || fz < 0 || fx >= n - 1 || fz >= n - 1) y = natural(x, z);
    else {
      const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, k = j * n + i;
      y = (G[k] * (1 - u) + G[k + 1] * u) * (1 - v) + (G[k + n] * (1 - u) + G[k + n + 1] * u) * v;
    }
    y += N2.fbm(x * 0.15, z * 0.15, 3) * 0.6;
    for (const p of PRIMS) if (p.kind !== 'deck' && inPrim(p, x, z, 0.8)) y = Math.min(y, primY(p, clamp(x, p.x0 ?? -1e9, p.x1 ?? 1e9), clamp(z, p.z0 ?? -1e9, p.z1 ?? 1e9)) - 0.5);
    return y;
  };
}
