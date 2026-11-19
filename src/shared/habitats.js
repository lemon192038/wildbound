// Habitats (群生地) of EVERY monster on the Volcanic Island (user request): the sea chart shows them all and the ship
// sails to the one you pick — the base camp is set up there (src/field/islandCamp.js).
//   creatures: the best ground for the species (its densest region in species.js, away from the crater; the Lava Snake
//              needs lava). Special individuals (Crystal Tusk, pack leader, Grand Mole) get their own site in their
//              species' range.
//   big monsters: their territory (shared/territories.js).
// Pure and deterministic (island field only): the chart, the client and the server all derive the same sites.
import { SPECIES } from '../fauna/species.js';
import { territoryHomes } from './territories.js';

export const FAUNA_HABITATS = ['beetle', 'slime', 'bird', 'lizard', 'snake', 'drake', 'boar', 'tusk', 'wolf', 'leader', 'mole', 'grandmole', 'golem'];
export const BOSS_HABITATS = ['varkhul', 'wyvern', 'brute', 'flame', 'flameUpper', 'venom', 'venom2', 'flameRoam', 'cindaryl'];
export const HABITAT_IDS = [...FAUNA_HABITATS, ...BOSS_HABITATS].map((m) => 'hab_' + m);
const TILE = 64;

let cache = null;
export function habitatSites(F) {
  if (cache && cache.F === F) return cache.list;
  const C = F.crater; const N = Math.ceil((F.half * 2) / TILE); const out = []; const Ls = {};
  const taken = (x, z) => out.some((h) => Math.hypot(h.x - x, h.z - z) < 110); // spread the pins out on the chart
  for (const H of territoryHomes(F)) out.push({ id: 'hab_' + H.id, monster: H.id, kind: 'boss', x: H.home[0], z: H.home[1], region: F.regionAt(H.home[0], H.home[1]) });
  for (const m of FAUNA_HABITATS) {
    const S = SPECIES[m]; const sp = S.of || m; const R = SPECIES[sp].regions; const cands = [];
    for (let tz = 0; tz < N; tz++) for (let tx = 0; tx < N; tx++) {
      const x = -F.half + (tx + 0.5) * TILE, z = -F.half + (tz + 0.5) * TILE; const reg = F.regionAt(x, z); if (reg === 'sea' || !(R[reg] > 0)) continue;
      if (Math.hypot(x - C.x, z - C.z) < C.r + 70) continue;
      const lava = F.lava(x, z, Ls).sd; if (m === 'snake' && lava > 4) continue; // the Lava Snake lives in the lava rivers
      if (m !== 'snake' && lava < 6) continue;
      cands.push({ x, z, reg, score: R[reg] * (S.of ? 0.9 : 1) - Math.hypot(x, z) / 5000 });
    }
    cands.sort((a, b) => b.score - a.score || a.x - b.x || a.z - b.z);
    const pick = cands.find((c) => !taken(c.x, c.z)) || cands[0]; if (!pick) continue;
    const [x, z] = m === 'snake' ? [pick.x, pick.z] : F.findSite(pick.x, pick.z, { flatR: 6, maxSlope: 0.35, maxR: 60 });
    out.push({ id: 'hab_' + m, monster: m, kind: 'fauna', x, z, region: pick.reg });
  }
  cache = { F, list: out };
  return out;
}
export const habitatById = (F, id) => habitatSites(F).find((h) => h.id === id) || null;
// island metres → chart units (the Cinder Reach's main island on the painted chart: centre 0.61 / 0.535, ry 0.1)
export const CHART_ISLAND = { cx: 0.615, cy: 0.535, k: 0.1 / 1152, aspect: 1.5 }; // spread over the Cinder Reach archipelago (the chart is stylised)
export const chartPos = (x, z) => ({ x: CHART_ISLAND.cx + x * CHART_ISLAND.k, y: CHART_ISLAND.cy + z * CHART_ISLAND.k * CHART_ISLAND.aspect });
