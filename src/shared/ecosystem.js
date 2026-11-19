// Island ecosystem — the statistical (far / unobserved) layer of the three-level simulation (stage 6).
//   near hunters : full individual AI (src/fauna/fauna.js + predators / herds / earthkin)
//   same region  : the same AI at a reduced rate (fauna.js LOD_NEAR: every 4th frame)
//   everywhere   : THIS model — every 64 m tile keeps populations by age class, nests, carcasses and an environment,
//                  stepped in coarse time steps. The server runs it authoritatively and persists it (server/world.js);
//                  offline play runs the same model locally. Pure JS: no DOM, no THREE.
//
// What it models (user's spec §7)
//   breeding    eggs / live birth / splitting (slime) per species, breeding seasons, clutch sizes, nests that hatch
//               after incubation, juvenile → young → adult → elder growth, nest protection (boars, wolves)
//   regulation  food from the environment or prey, starvation, predation (juveniles are the easy prey),
//               old age, carrying capacity; hunting never empties the island for good (refuge populations seed
//               empty suitable tiles slowly) but nothing respawns instantly where it died
//   migration   reasons: food shortage, predators, crowding / territory, volcanic activity, lava damage,
//               hunting pressure, breeding season (toward nest ground), injury — only to a better neighbour tile
//   carcasses   fresh → eaten → rotten (insects, fungi) → remains (bones / shell) → gone; scavengers and decomposers feed
//   environment ash, heat, minerals, fungi, plants, insects, carrion, lava damage; eruptions change it and it feeds back
//   learning    per tile, per species wariness from hunted kin and nest intrusions (individuals add their own memory
//               on top in fauna.js; intelligence differs per species)
// All life-history numbers below are PROVISIONAL game-design assumptions (the design document gives behaviour,
// not timings). Time unit: real seconds of world time.
import { SPECIES } from '../fauna/species.js';
import { mulberry32 } from '../world/noise.js';

export const TILE = 64;
export const SEASON = 4 * 3600; // one breeding-season cycle (s)
const STAGE_MASS = [0.3, 0.6, 1, 1.1];
// mode: egg | birth | split | none · season: [from, to] fraction of SEASON (null = all year) · clutch: [min, max]
// incubate: s until eggs hatch / young are born · grow: s per stage step (juvenile→young, young→adult, adult→elder)
// life: mean s an elder survives · iq: learning ability 0..1 · protect: how well adults guard young (0..1)
// meal: s an adult needs per meal (predators) · nestRegion: preferred nest ground
export const ECO = {
  beetle: { mode: 'egg', season: null, clutch: [3, 5], incubate: 1800, grow: [1800, 3600, 6 * 3600], life: 3 * 3600, iq: 0.15, protect: 0, cooldown: 2400 },
  slime: { mode: 'split', season: null, clutch: [1, 1], incubate: 0, grow: [1200, 2400, 5 * 3600], life: 3 * 3600, iq: 0.05, protect: 0, cooldown: 1500 },
  bird: { mode: 'egg', season: [0, 0.35], clutch: [2, 3], incubate: 2400, grow: [2400, 4800, 8 * 3600], life: 4 * 3600, iq: 0.5, protect: 0.3, cooldown: 3600, meal: 1800, nestRegion: ['peaks', 'coast'] },
  lizard: { mode: 'egg', season: [0.1, 0.45], clutch: [2, 4], incubate: 3000, grow: [3000, 5400, 10 * 3600], life: 5 * 3600, iq: 0.35, protect: 0.1, cooldown: 5400, meal: 2400, nestRegion: ['geotherm', 'canyon'] },
  snake: { mode: 'egg', season: [0.5, 0.8], clutch: [1, 3], incubate: 4200, grow: [4200, 7200, 14 * 3600], life: 6 * 3600, iq: 0.3, protect: 0.2, cooldown: 7200, meal: 3000, nestRegion: ['caldera', 'canyon'] },
  boar: { mode: 'birth', season: [0.2, 0.6], clutch: [2, 3], incubate: 3600, grow: [3600, 6000, 12 * 3600], life: 5 * 3600, iq: 0.45, protect: 0.75, cooldown: 7200 },
  wolf: { mode: 'birth', season: [0.6, 0.95], clutch: [2, 4], incubate: 3600, grow: [3000, 6000, 12 * 3600], life: 5 * 3600, iq: 0.85, protect: 0.85, cooldown: 9000, meal: 2400 },
  mole: { mode: 'birth', season: [0.3, 0.7], clutch: [1, 2], incubate: 4800, grow: [4800, 7200, 16 * 3600], life: 8 * 3600, iq: 0.3, protect: 0.6, cooldown: 10800 },
  // ASSUMPTION (flagged to the user): golems do not breed; new ones slowly form in mineral-rich ground
  golem: { mode: 'none', season: null, clutch: [1, 1], incubate: 0, grow: [0, 0, 30 * 3600], life: 20 * 3600, iq: 0.2, protect: 0, cooldown: 4 * 3600, form: 4 * 3600 },
  drake: { mode: 'egg', season: [0.4, 0.7], clutch: [1, 2], incubate: 6000, grow: [6000, 10800, 20 * 3600], life: 10 * 3600, iq: 0.7, protect: 0.5, cooldown: 4 * 3600, meal: 3600 },
};
export const ECO_SPECIES = Object.keys(ECO);
export const GROUP_SP = ECO_SPECIES.filter((sp) => SPECIES[sp].group);
const SOLO_SP = ECO_SPECIES.filter((sp) => !SPECIES[sp].group);
// environment resources each diet word draws on
const RES = { mineral: ['min'], fungi: ['fun'], detritus: ['car', 'fun'], ash: ['ash'], microbe: ['heat'], plant: ['pla'], root: ['pla'], insect: ['ins'],
  carcass: ['car'], underground: ['min', 'ins'], geothermal: ['heat'] };
// prey words → [species, max stage eaten, vulnerability]
const PREY_WORD = (w) => {
  const [sp, suf] = w.split('_'); if (!ECO[sp]) return null;
  if (suf === 'small' || suf === 'juvenile') return [sp, 1, 1];
  if (suf === 'larva') return [sp, 0, 1];
  if (suf === 'ground') return [sp, 3, 0.35];
  return [sp, 3, 0.7];
};
const DIET = {}; const PREDATORS = {};
for (const sp of ECO_SPECIES) {
  const d = { res: [], prey: [] };
  for (const w of SPECIES[sp].eats || []) { if (RES[w]) d.res.push(...RES[w]); else { const p = PREY_WORD(w); if (p) { d.prey.push(p); (PREDATORS[p[0]] ||= []).push(sp); } } }
  DIET[sp] = d;
}
export { DIET, PREDATORS };
// base environment per region: ash, heat, minerals, fungi, plants
const ENV0 = {
  caldera: [0.8, 1, 0.8, 0.1, 0], core: [0.9, 0.8, 0.7, 0.15, 0.05], canyon: [0.6, 0.9, 0.6, 0.2, 0.05], peaks: [0.6, 0.3, 0.6, 0.15, 0.2],
  ashplain: [1, 0.4, 0.5, 0.3, 0.2], fungal: [0.3, 0.3, 0.3, 1, 0.7], crystal: [0.3, 0.3, 1, 0.3, 0.3], ruins: [0.3, 0.2, 0.4, 0.5, 0.6],
  geotherm: [0.5, 0.9, 0.7, 0.5, 0.3], coast: [0.2, 0.1, 0.3, 0.3, 1], sea: [0, 0, 0, 0, 0],
};
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const keyOf = (tx, tz) => tz * 1000 + tx;
const sum = (a) => a[0] + a[1] + a[2] + a[3];

// ------------------------------------------------------------------ creation
// field: the island field (regionAt, half, lava). Initial populations follow the per-tile densities in species.js.
export function createEcoWorld(field, { seed = 1337, now = 0 } = {}) {
  const r = mulberry32(seed * 7 + 99); const N = Math.ceil((field.half * 2) / TILE);
  const W = { v: 1, seed, t: 0, wall: now, step: 0, tiles: {}, n: N, refuge: {}, stats: { births: 0, deaths: 0, predation: 0, starved: 0, migrated: 0, hunted: 0, eruptions: 0, formed: 0, seeded: 0 }, slimeKills: 0, init: {} };
  const Ls = {};
  for (let tz = 0; tz < N; tz++) for (let tx = 0; tx < N; tx++) {
    const x0 = -field.half + tx * TILE, z0 = -field.half + tz * TILE;
    const regs = [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]].map(([a, b]) => field.regionAt(x0 + a * TILE, z0 + b * TILE));
    if (regs.every((g) => g === 'sea')) continue;
    let lavaFrac = 0; const G4 = [0.03, 0.35, 0.65, 0.97]; for (const a of G4) for (const b of G4) if (field.lava(x0 + a * TILE, z0 + b * TILE, Ls).sd < 0) lavaFrac += 1 / 16; // narrow channels count too
    const e0 = [0, 0, 0, 0, 0]; for (const g of regs) ENV0[g].forEach((v, i) => (e0[i] += v / 4));
    const T = { tx, tz, regs, lavaFrac: +lavaFrac.toFixed(2), base: e0.map((v) => +v.toFixed(3)), K: {},
      env: { ash: e0[0], heat: e0[1], min: e0[2], fun: e0[3], pla: e0[4], ins: 0.2, car: 0, lava: 0 }, p: {}, g: [], nest: [], cc: [], hunt: 0, wary: {}, cd: {}, inj: {} };
    for (const sp of ECO_SPECIES) {
      const S = SPECIES[sp]; const dens = regs.reduce((a, g) => a + (S.regions[g] || 0), 0) / 4;
      if (S.habitat === 'lava' && lavaFrac === 0) continue;
      if (!(dens > 0)) continue;
      if (S.group) { // dens = groups per tile; K counts individuals
        const G = S.group; T.K[sp] = G.max + 1; T.D ||= {}; T.D[sp] = +dens.toFixed(3); // a herd's range spans many tiles: one herd fits a tile
        let ng = Math.floor(dens * (0.6 + r() * 0.8)); if (r() < dens - Math.floor(dens)) ng++;
        for (let i = 0; i < ng; i++) T.g.push(newGroup(sp, r));
      } else {
        T.K[sp] = +Math.max(dens, 1.2).toFixed(2); T.D ||= {}; T.D[sp] = +dens.toFixed(3); // a lone territory holder always fits
        let n = Math.floor(dens * (0.6 + r() * 0.8)); if (r() < dens - Math.floor(dens)) n++;
        const a = [0, 0, 0, 0]; for (let i = 0; i < n; i++) a[sp === 'golem' ? 2 : rollStage(r)]++; T.p[sp] = a;
      }
    }
    W.tiles[keyOf(tx, tz)] = T;
  }
  W.dmax = {}; for (const T of Object.values(W.tiles)) for (const sp in T.D || {}) W.dmax[sp] = Math.max(W.dmax[sp] || 0, T.D[sp]);
  W.init = census(W);
  return W;
}
function rollStage(r) { const x = r(); return x < 0.15 ? 0 : x < 0.4 ? 1 : x < 0.9 ? 2 : 3; }
function newGroup(sp, r, n = null) {
  const G = SPECIES[sp].group; const a = [0, 0, 0, 0];
  if (n) for (let i = 0; i < 4; i++) a[i] = n[i];
  else { const k = G.min + Math.floor(r() * (G.max - G.min + 1)); const j = G.juveniles[0] + Math.floor(r() * (G.juveniles[1] - G.juveniles[0] + 1)); a[0] = Math.min(j, k - 2); for (let i = a[0]; i < k; i++) a[r() < 0.3 ? 1 : r() < 0.85 ? 2 : 3]++; }
  return { sp, n: a, s: sp === 'wolf' ? 1 : r() < G.specialChance ? 1 : 0, id: Math.floor(r() * 1e9) };
}
// island-wide head count per species
// per-species ledger of what happened (debug overlay / tests)
const note = (W, sp, what, k = 1) => { if (k) { const b = ((W.stats.by ||= {})[sp] ||= {}); b[what] = (b[what] || 0) + k; } };
export function census(W) {
  const out = {}; for (const sp of ECO_SPECIES) out[sp] = 0;
  for (const T of Object.values(W.tiles)) { for (const sp in T.p) out[sp] += sum(T.p[sp]); for (const g of T.g) out[g.sp] += sum(g.n); }
  return out;
}
export const tileKey = keyOf;
export const tileAt = (W, field, x, z) => W.tiles[keyOf(Math.floor((x + field.half) / TILE), Math.floor((z + field.half) / TILE))] || null;
const popOf = (T, sp) => (SPECIES[sp].group ? T.g.filter((g) => g.sp === sp).reduce((a, g) => a + sum(g.n), 0) : T.p[sp] ? sum(T.p[sp]) : 0);
const stagesOf = (T, sp) => { if (!SPECIES[sp].group) return T.p[sp] || [0, 0, 0, 0]; const a = [0, 0, 0, 0]; for (const g of T.g) if (g.sp === sp) for (let i = 0; i < 4; i++) a[i] += g.n[i]; return a; };

// ------------------------------------------------------------------ volcanic activity (deterministic in world time)
export function activityAt(W, t = W.t) { return clamp(0.45 + 0.35 * Math.sin((t / (3 * 3600)) * Math.PI * 2) + 0.15 * Math.sin(t / 1700), 0, 1); }
function eruptionIn(W, t0, t1) { // one eruption roll per 30-minute slot, more likely when activity is high
  for (let s = Math.floor(t0 / 1800); s < Math.floor(t1 / 1800); s++) { const r = mulberry32(W.seed * 31 + s)(); if (r < 0.15 + 0.6 * activityAt(W, (s + 1) * 1800)) return (s + 1) * 1800; }
  return null;
}

// ------------------------------------------------------------------ stepping
const binom = (n, p, r) => { if (n <= 0 || p <= 0) return 0; if (p >= 1) return n; let k = 0; for (let i = 0; i < n; i++) if (r() < p) k++; return k; };
function removeOne(T, sp, maxStage, r, prefer = 'young') {
  // pick an individual of sp with stage <= maxStage; juveniles first for predators, otherwise weighted
  if (SPECIES[sp].group) {
    const gs = T.g.filter((g) => g.sp === sp && g.n.slice(0, maxStage + 1).some((v) => v > 0)); if (!gs.length) return -1;
    const g = gs[Math.floor(r() * gs.length)]; const st = pickStage(g.n, maxStage, r, prefer); g.n[st]--; if (!sum(g.n)) T.g.splice(T.g.indexOf(g), 1); return st;
  }
  const a = T.p[sp]; if (!a) return -1; const st = pickStage(a, maxStage, r, prefer); if (st < 0) return -1; a[st]--; return st;
}
function pickStage(a, maxStage, r, prefer) {
  const w = a.map((v, i) => (i > maxStage ? 0 : v * (prefer === 'young' ? [3, 2, 1, 1.5][i] : prefer === 'old' ? [1, 1, 1, 4][i] : 1)));
  const tot = w.reduce((x, y) => x + y, 0); if (tot <= 0) return -1; let x = r() * tot; for (let i = 0; i < 4; i++) { x -= w[i]; if (x <= 0 && w[i] > 0) return i; } return a.findIndex((v, i) => v > 0 && i <= maxStage);
}
function addCarcass(T, sp, stage, r, eaten = false, x = null, z = null) {
  T.cc.push({ sp, m: +(STAGE_MASS[stage] * (eaten ? 0.35 : 1)).toFixed(2), age: eaten ? 120 : 0, dx: x ?? Math.floor(r() * TILE), dz: z ?? Math.floor(r() * TILE) });
  if (T.cc.length > 8) T.cc.shift();
}
export function carcassState(c) { return c.age > 7200 ? 'gone' : c.age > 2400 ? 'remains' : c.age > 900 ? 'rotten' : c.m < 0.6 ? 'eaten' : 'fresh'; }
const inSeason = (W, sp) => { const s = ECO[sp].season; if (!s) return true; const f = (W.t % SEASON) / SEASON; return f >= s[0] && f < s[1]; };
export const seasonFrac = (W) => (W.t % SEASON) / SEASON;

export function stepEco(W, dt) {
  const r = mulberry32(W.seed * 977 + W.step++); const tiles = Object.values(W.tiles); const St = W.stats;
  W._golems = census(W).golem;
  const t0 = W.t; W.t += dt; const act = activityAt(W);
  // eruption: ash and heat around the summit, lava damage near channels, creatures caught are killed
  const er = eruptionIn(W, t0, W.t);
  if (er != null) {
    St.eruptions++;
    for (const T of tiles) {
      const cx = T.tx - W.n / 2 + 0.5, cz = T.tz - W.n / 2 + 0.5; const d = Math.hypot(cx, cz) * TILE; const near = clamp(1 - d / 700, 0, 1);
      if (near <= 0 && T.lavaFrac === 0) continue;
      T.env.ash = clamp(T.env.ash + 0.5 * near, 0, 2); T.env.heat = clamp(T.env.heat + 0.3 * near, 0, 1.5);
      const flood = T.lavaFrac > 0 ? 0.25 + 0.5 * r() : 0; T.env.lava = clamp(T.env.lava + flood, 0, 1);
      if (flood > 0.3) for (const sp of SOLO_SP) { if (sp === 'snake' || sp === 'slime' || !T.p[sp]) continue; for (let i = 0; i < 4; i++) { const k = binom(T.p[sp][i], flood * 0.3, r); T.p[sp][i] -= k; St.deaths += k; note(W, sp, 'lava', k); for (let j = 0; j < Math.min(k, 2); j++) addCarcass(T, sp, i, r); } }
      if (flood > 0.3) T.nest = T.nest.filter((n) => n.sp === 'snake' || r() > flood);
    }
  }
  for (const T of tiles) {
    const E = T.env, B = T.base;
    // ---- environment drifts back toward its base, shaped by ash, heat, carcasses and grazing
    const k = Math.min(1, dt / 3600);
    E.ash += (B[0] * (0.7 + 0.6 * act) - E.ash) * k * 0.3;              // ash settles / erodes; more falls when active
    E.heat += (B[1] * (0.8 + 0.4 * act) - E.heat) * k * 0.5;
    E.lava = Math.max(0, E.lava - dt / (2 * 3600));                       // flows cool...
    E.min = clamp(E.min + (B[2] + 0.3 * E.lava - E.min) * k * 0.4 + E.lava * 0.02 * k, 0, 1.6); // ...into fresh mineral
    E.pla = clamp(E.pla + ((B[4] + 0.15 * Math.min(1, E.ash) * (B[4] > 0.1 ? 1 : 0)) * (1 - E.lava) * (1 - 0.5 * Math.max(0, E.ash - 1)) - E.pla) * k * 0.25, 0, 1.5); // old ash fertilises, fresh heavy ash smothers
    E.car = 0; for (const c of T.cc) if (carcassState(c) === 'rotten' || carcassState(c) === 'eaten') E.car += c.m * 0.5;
    E.fun = clamp(E.fun + (B[3] + 0.3 * E.car - E.fun) * k * 0.3, 0, 1.6);   // fungi thrive on decay
    E.ins = clamp(E.ins + (0.15 + 0.4 * E.car + 0.25 * E.pla - E.ins) * k * 0.6, 0, 1.5);
    // ---- carcasses: age, scavengers / decomposers eat them
    for (const c of T.cc) { c.age += dt; c.m = Math.max(0, c.m - dt / 7200 * (0.2 + E.ins)); }
    T.cc = T.cc.filter((c) => carcassState(c) !== 'gone');
    T.hunt = Math.max(0, T.hunt * Math.pow(0.5, dt / 1200));
    for (const sp in T.wary) T.wary[sp] = Math.max(0, T.wary[sp] - dt / (3 * 3600));
    for (const sp in T.cd) T.cd[sp] = Math.max(0, T.cd[sp] - dt);
    for (const sp in T.inj) T.inj[sp] = Math.max(0, T.inj[sp] - dt / 1800);
    T.sat ||= {};
    for (const sp of ECO_SPECIES) {
      const st = stagesOf(T, sp); const n = sum(st); if (!n) { T.sat[sp] = 1; continue; }
      const D = DIET[sp]; const demand = st.reduce((a, v, i) => a + v * STAGE_MASS[i], 0);
      // ---- food. Environment eaters: resource level vs the tile's capacity for them (logistic: crowding = hunger).
      // Predators: a food reserve that drains between meals and is refilled by real kills (prey in this tile and,
      // at a lower rate, the neighbouring ones). Scavengers also feed on carcasses.
      const L = ECO[sp]; T.res ||= {}; let R = T.res[sp] ?? 0.8;
      if (D.res.length) {
        let have = 0; for (const res of D.res) have += res === 'heat' ? E.heat : E[res] || 0; have /= D.res.length;
        const envS = clamp((have / 0.45) * (T.K[sp] || 0.3) / Math.max(0.2, demand), 0, 1.5);
        R += (envS - R) * Math.min(1, dt / 1800) * (D.prey.length ? 0.5 : 1);
        const graze = demand / Math.max(0.3, T.K[sp] || 0.3); // grazing pressure drags the resources down a little
        for (const res of D.res) if (res !== 'heat' && E[res] != null) E[res] = Math.max(0.02, E[res] - 0.03 * graze * Math.min(1, dt / 3600));
      }
      if (D.prey.length && L.meal) {
        R -= dt / (L.meal * 3);
        let tries = binom(Math.max(1, n), Math.min(1, (dt / L.meal) * (R < 0.8 ? 2 : 0.5)), r); // each individual hunts; many hunts fail
        while (tries-- > 0) {
          let src = T; if (r() < 0.35) { const nb = W.tiles[keyOf(T.tx + Math.floor(r() * 3) - 1, T.tz + Math.floor(r() * 3) - 1)]; if (nb) src = nb; }
          const opts = D.prey.map(([p, ms, v]) => { const a = stagesOf(src, p); let avail = 0; for (let i = 0; i <= ms; i++) avail += a[i] * (i <= 1 ? 1.5 : 1); return avail * v * (1 - (ECO[p].protect || 0) * 0.6); });
          const tot = opts.reduce((a, b) => a + b, 0); if (tot <= 0.01 || r() > tot / (tot + 1.5)) continue; // the hunt failed
          let x = r() * tot, pi = 0; for (; pi < opts.length - 1; pi++) { x -= opts[pi]; if (x <= 0) break; }
          const [p, ms] = D.prey[pi]; const stg = removeOne(src, p, ms, r, 'young'); if (stg < 0) continue;
          St.predation++; St.deaths++; note(W, p, 'eaten'); R += 0.45 * clamp(STAGE_MASS[stg] / 0.6, 0.5, 1.5) / Math.max(1, n); addCarcass(src, p, stg, r, true);
        }
      }
      if ((SPECIES[sp].eats || []).includes('carcass') && E.car > 0) R += Math.min(E.car, 1) * dt / 3600;
      R = clamp(R, 0, 1.3); T.res[sp] = +R.toFixed(3); const s = R; T.sat[sp] = +s.toFixed(2);
      // ---- deaths: age and starvation (dead bodies stay as carcasses)
      const starve = Math.max(0, 0.4 - s) / 0.4;
      const haz = [1 / (10 * 3600), 1 / (20 * 3600), 1 / (30 * 3600), 1 / L.life].map((h) => h + starve * starve / 3600);
      const crowd = T.K[sp] ? Math.max(0, n / Math.max(1, T.K[sp] * 1.5) - 1) / 3600 : 0;
      for (let i = 0; i < 4; i++) {
        const dead = binom(st[i], (haz[i] + crowd) * dt, r); if (!dead) continue;
        for (let j = 0; j < dead; j++) { if (removeOne(T, sp, i, r) < 0) break; addCarcass(T, sp, i, r); }
        St.deaths += dead; if (starve > 0.3) St.starved += dead; note(W, sp, starve > 0.3 ? 'starved' : i === 3 ? 'old' : 'other', dead);
      }
      // ---- growth: juvenile → young → adult → elder
      const grow = (a) => { for (let i = 2; i >= 0; i--) { const g = L.grow[i] ? binom(a[i], dt / L.grow[i], r) : 0; a[i] -= g; a[i + 1] += g; } };
      if (SPECIES[sp].group) for (const g of T.g) { if (g.sp === sp) grow(g.n); } else if (T.p[sp]) grow(T.p[sp]);
    }
    // ---- breeding (nests hatch after incubation; parents need food; crowding stops it)
    for (const nst of T.nest) nst.t -= dt;
    for (const nst of T.nest.filter((q) => q.t <= 0)) {
      const sp = nst.sp; let born = nst.n;
      if (born <= 0) continue;
      if (SPECIES[sp].group) { const g = T.g.find((q) => q.id === nst.gid) || T.g.find((q) => q.sp === sp); if (g) g.n[0] += born; else T.g.push(newGroup(sp, r, [born, 0, 1, 0])); }
      else (T.p[sp] ||= [0, 0, 0, 0])[sp === 'mole' ? 1 : 0] += born; // mole young leave the deep nest already grown a little
      St.births += born; note(W, sp, 'born', born);
    }
    T.nest = T.nest.filter((q) => q.t > 0);
    // nest raiders: predators that eat eggs / juveniles thin unguarded nests
    for (const nst of T.nest) { const raiders = (PREDATORS[nst.sp] || []).reduce((a, p) => a + popOf(T, p), 0); if (raiders && r() < (1 - (ECO[nst.sp].protect || 0)) * raiders * dt / (4 * 3600)) nst.n = Math.max(0, nst.n - 1); }
    for (const sp of ECO_SPECIES) {
      const L = ECO[sp]; if (T.cd[sp] > 0 || !inSeason(W, sp) || (T.sat[sp] ?? 1) < 0.45) continue;
      const st = stagesOf(T, sp), n = sum(st), K = T.K[sp] || 0; if (n >= Math.max(1, K * 1.4)) continue;
      if (L.mode === 'none') { // golems: slow forming in mineral-rich ground (ASSUMPTION)
        if (K > 0 && n < K && T.env.min > 0.6 && (W._golems ?? 0) < (W.init.golem || 0) && r() < dt / L.form) { (T.p[sp] ||= [0, 0, 0, 0])[2]++; St.formed++; T.cd[sp] = L.cooldown; }
        continue;
      }
      let adults = st[2] + st[3]; const need = L.mode === 'split' ? 1 : 2;
      // solitary species meet a mate from the neighbouring ground in the breeding season (temporary contact only)
      if (adults === 1 && need === 2 && !SPECIES[sp].group) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) { const U = W.tiles[keyOf(T.tx + dx, T.tz + dz)]; const a = U?.p[sp]; if (a && a[2] + a[3] > 0) { adults = 2; break; } }
      if (adults < need || T.nest.some((q) => q.sp === sp)) continue;
      if (r() > Math.min(1, dt / 900)) continue;
      const nr = L.nestRegion; if (nr && !T.regs.some((g) => nr.includes(g)) && r() > 0.3) continue; // preferred nest ground (elsewhere: rarely)
      const clutch = L.clutch[0] + Math.floor(r() * (L.clutch[1] - L.clutch[0] + 1));
      if (L.mode === 'split' && W.rampage) T.cd[sp] = 0; // the awakened slime pours out spawn
      if (L.mode === 'split') { const a = T.p[sp]; const big = a[3] > 0 ? 3 : 2; a[big]--; a[1] += 2; St.births++; T.cd[sp] = L.cooldown; continue; } // slimes split into two young
      const gid = SPECIES[sp].group ? (T.g.filter((g) => g.sp === sp).sort((a, b) => sum(b.n) - sum(a.n))[0]?.id) : undefined;
      T.nest.push({ sp, n: clutch, t: L.incubate, dx: Math.floor(8 + r() * (TILE - 16)), dz: Math.floor(8 + r() * (TILE - 16)), gid, kind: L.mode });
      T.cd[sp] = L.cooldown;
    }
  }
  migrate(W, dt, r);
  reseed(W, dt, r);
  W.wall += dt * 1000;
  return W;
}

// ------------------------------------------------------------------ migration
export function suitability(T, sp, W = null) {
  if (!T || !(T.K[sp] > 0)) return -1;
  const n = popOf(T, sp); const preds = (PREDATORS[sp] || []).reduce((a, p) => a + popOf(T, p) * 0.5, 0);
  const q = ((T.D?.[sp] || 0) / (W?.dmax?.[sp] || 1)) * 4; // habitat quality on a common 0..4 scale
  return q * (T.sat?.[sp] ?? 1) * (1 - T.env.lava) - Math.max(0, n - T.K[sp]) * 0.5 - preds * 0.4 - T.hunt * 0.3 - (T.wary[sp] || 0) * 0.5;
}
// why would individuals of sp leave tile T? (0 = content … 1 = leave now)
export function pushOf(W, T, sp) {
  const n = popOf(T, sp); if (!n) return 0; const K = T.K[sp] || 0.01;
  const food = Math.max(0, 0.7 - (T.sat?.[sp] ?? 1));
  const preds = Math.min(1, (PREDATORS[sp] || []).reduce((a, p) => a + popOf(T, p), 0) / (n + 2)) * 0.4;
  const crowd = Math.max(0, n / K - 1.2) * 0.5;
  const volcano = T.env.lava * 0.6 + Math.max(0, T.env.heat - 1.1) * (sp === 'snake' || sp === 'slime' ? 0 : 0.5);
  const hunted = Math.min(0.6, T.hunt * 0.15) * (0.5 + ECO[sp].iq);
  const nest = inSeason(W, sp) && ECO[sp].nestRegion && !T.regs.some((g) => ECO[sp].nestRegion.includes(g)) ? 0.3 : 0;
  const injured = Math.min(0.4, (T.inj[sp] || 0) * 0.2);
  // Volcano Slime awake: rampaging slime swarms drive everything else out of slime ground (habitats shift for a while)
  const rampage = W.rampage && sp !== 'slime' && popOf(T, 'slime') > 0 ? (sp === 'golem' ? 0.1 : 0.5) : 0;
  return clamp(food + preds + crowd + volcano + hunted + nest + injured + rampage, 0, 1);
}
function migrate(W, dt, r) {
  const St = W.stats; const N8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];
  for (const T of Object.values(W.tiles)) for (const sp of ECO_SPECIES) {
    const push = pushOf(W, T, sp); if (push < 0.15) continue;
    if (r() > push * Math.min(1, dt / 1800)) continue;
    const here = suitability(T, sp, W); let best = null, bs = here + 0.2; // only move somewhere clearly better
    for (const [dx, dz] of N8) { const U = W.tiles[keyOf(T.tx + dx, T.tz + dz)]; const s = suitability(U, sp, W); if (s > bs) { bs = s; best = U; } }
    if (!best) continue;
    if (SPECIES[sp].group) { const gs = T.g.filter((g) => g.sp === sp); if (!gs.length) continue; const g = gs[Math.floor(r() * gs.length)]; T.g.splice(T.g.indexOf(g), 1); best.g.push(g); St.migrated += sum(g.n); for (const q of T.nest) if (q.gid === g.id) q.gid = null; }
    else { const a = T.p[sp]; const st = a[1] > 0 && r() < 0.6 ? 1 : a[2] > 0 ? 2 : a.findIndex((v) => v > 0); if (st < 0 || st === 0) continue; a[st]--; (best.p[sp] ||= [0, 0, 0, 0])[st]++; St.migrated++; } // juveniles stay with the nest ground
  }
  // packs that fell apart: survivors join the nearest pack of their kind (wolves never live alone)
  for (const T of Object.values(W.tiles)) for (const g of [...T.g]) {
    if (sum(g.n) >= 2 && !(g.sp === 'wolf' && sum(g.n) < 3)) continue;
    let tgt = null, bd = 1e9; for (const U of Object.values(W.tiles)) for (const h of U.g) { if (h === g || h.sp !== g.sp) continue; const d = Math.hypot(U.tx - T.tx, U.tz - T.tz); if (d < bd) { bd = d; tgt = h; } }
    if (tgt && bd <= 8) { for (let i = 0; i < 4; i++) tgt.n[i] += g.n[i]; T.g.splice(T.g.indexOf(g), 1); St.migrated += sum(g.n); }
  }
}
// refuges: a species hunted down to a fraction of its starting numbers slowly re-enters empty suitable ground
// (from deep tunnels, the sea cliffs, the lava depths…). Never where a hunter just killed it: the tile must be empty.
function reseed(W, dt, r) {
  const now = census(W);
  for (const sp of ECO_SPECIES) {
    const init = W.init[sp] || 0; if (!init || now[sp] >= init * 0.4) continue;
    if (r() > dt / 1800) continue;
    const cands = Object.values(W.tiles).filter((T) => T.K[sp] > 0.3 && !popOf(T, sp) && T.hunt < 0.5 && T.env.lava < 0.3); if (!cands.length) continue;
    const T = cands[Math.floor(r() * cands.length)]; note(W, sp, 'seeded');
    if (SPECIES[sp].group) T.g.push(newGroup(sp, r, sp === 'wolf' ? [0, 2, 2, 0] : [0, 1, 2, 0])); else (T.p[sp] ||= [0, 0, 0, 0])[1]++;
    W.stats.seeded++;
  }
}

// catch up a world that was not stepped for a while (server asleep): coarse steps, capped
export function catchUp(W, nowMs, { maxS = 24 * 3600, fine = 120, coarse = 600 } = {}) {
  let gap = Math.min(maxS, Math.max(0, (nowMs - W.wall) / 1000)); let steps = 0;
  while (gap >= fine) { const dt = gap > 2 * 3600 ? coarse : fine; stepEco(W, dt); gap -= dt; steps++; }
  W.wall = nowMs - gap * 1000;
  return steps;
}

// ------------------------------------------------------------------ reports from hunters (server-validated)
// ev: { sp, stage, x, z, cause } kill · { type: 'nest', x, z } intrusion · { type: 'injured', sp, x, z }
export function applyReport(W, field, ev) {
  const r = mulberry32((W.seed + W.step * 13 + (ev.x | 0) * 7 + (ev.z | 0)) | 0);
  const T = tileAt(W, field, ev.x, ev.z); if (!T) return { ok: false, why: 'tile' };
  if (ev.type === 'nest') { T.hunt += 0.5; for (const q of T.nest) (T.wary[q.sp] = Math.min(1, (T.wary[q.sp] || 0) + 0.25 * ECO[q.sp].iq)); return { ok: true }; }
  const sp = ev.sp; if (!ECO[sp]) return { ok: false, why: 'species' };
  if (ev.type === 'injured') { T.inj[sp] = (T.inj[sp] || 0) + 1; return { ok: true }; }
  // kill: take the individual from this tile (or a neighbour: creatures wander a little while observed)
  let U = T, stg = -1; const want = clamp(ev.stage | 0, 0, 3);
  for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
    const V = W.tiles[keyOf(T.tx + dx, T.tz + dz)]; if (!V || !popOf(V, sp)) continue;
    const a = stagesOf(V, sp); const s = a[want] > 0 ? want : a.findIndex((v) => v > 0); if (s < 0) continue;
    if (SPECIES[sp].group) { const g = V.g.find((q) => q.sp === sp && q.n[s] > 0); g.n[s]--; if (!sum(g.n)) V.g.splice(V.g.indexOf(g), 1); } else V.p[sp][s]--;
    stg = s; U = V; break;
  }
  if (stg < 0) return { ok: false, why: 'none' }; // nothing left there: the report cannot invent deaths
  const lx = clamp(Math.floor(ev.x + W.n * TILE / 2 - U.tx * TILE), 0, TILE - 1), lz = clamp(Math.floor(ev.z + W.n * TILE / 2 - U.tz * TILE), 0, TILE - 1);
  if (ev.cause !== 'split') addCarcass(U, sp, stg, r, ev.cause === 'predation', lx, lz);
  W.stats.deaths++;
  if (ev.cause === 'hunter') { W.stats.hunted++; U.hunt += 1; U.wary[sp] = Math.min(1, (U.wary[sp] || 0) + 0.3 * ECO[sp].iq); if (sp === 'slime') W.slimeKills++; }
  return { ok: true, stage: stg };
}

// ------------------------------------------------------------------ snapshots for clients
export function snapshot(W, tx, tz, rad = 3) {
  const out = []; for (let z = tz - rad; z <= tz + rad; z++) for (let x = tx - rad; x <= tx + rad; x++) { const T = W.tiles[keyOf(x, z)]; if (T) out.push(tileView(T)); }
  return { t: W.t, season: +seasonFrac(W).toFixed(3), activity: +activityAt(W).toFixed(2), slimeKills: W.slimeKills, tiles: out };
}
export function tileView(T) {
  return { tx: T.tx, tz: T.tz, p: T.p, g: T.g.map((g) => ({ sp: g.sp, n: g.n, s: g.s, id: g.id })), nest: T.nest.map((q) => ({ sp: q.sp, n: q.n, dx: q.dx, dz: q.dz, t: Math.round(q.t), gid: q.gid })),
    cc: T.cc.map((c) => ({ sp: c.sp, s: carcassState(c), dx: c.dx, dz: c.dz })), wary: T.wary, hunt: +T.hunt.toFixed(2),
    env: Object.fromEntries(Object.entries(T.env).map(([k, v]) => [k, +v.toFixed(2)])), sat: T.sat };
}

// ------------------------------------------------------------------ persistence (static tile data is rebuilt from the field)
const rd = (v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v);
const rdObj = (o) => Object.fromEntries(Object.entries(o || {}).map(([k, v]) => [k, rd(v)]));
export function serializeEco(W) {
  const tiles = {};
  for (const [k, T] of Object.entries(W.tiles)) tiles[k] = { p: T.p, g: T.g, nest: T.nest.map((q) => ({ ...q, t: Math.round(q.t) })), cc: T.cc.map((c) => ({ ...c, age: Math.round(c.age), m: rd(c.m) })),
    env: rdObj(T.env), hunt: rd(T.hunt), wary: rdObj(T.wary), cd: rdObj(T.cd), inj: rdObj(T.inj), res: rdObj(T.res) };
  return JSON.stringify({ v: W.v, seed: W.seed, t: Math.round(W.t), wall: W.wall, step: W.step, stats: W.stats, slimeKills: W.slimeKills, init: W.init, tiles });
}
export function loadEco(field, json) {
  const D = typeof json === 'string' ? JSON.parse(json) : json;
  const W = createEcoWorld(field, { seed: D.seed });
  Object.assign(W, { t: D.t, wall: D.wall, step: D.step, stats: D.stats || W.stats, slimeKills: D.slimeKills || 0, init: D.init || W.init });
  for (const [k, T] of Object.entries(W.tiles)) { const s = D.tiles?.[k]; if (!s) { T.p = {}; T.g = []; continue; } Object.assign(T, { p: s.p || {}, g: s.g || [], nest: s.nest || [], cc: s.cc || [], env: { ...T.env, ...s.env }, hunt: s.hunt || 0, wary: s.wary || {}, cd: s.cd || {}, inj: s.inj || {}, res: s.res || {} }); }
  return W;
}
