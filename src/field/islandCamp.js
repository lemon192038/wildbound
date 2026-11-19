// Where the ship drops you for a quest on the open island (user request): near the quarry, and the base camp is there.
//   bosses (Varkhul, Cindral, Gorvath, the dragons): beside their territory, on the side away from the crater
//   creatures: in the best habitat for the species (one of the top tiles, chosen by the expedition id)
//   gathering quests: somewhere in the asked region
// Pure (island field only), so it can run before the world is built and the first tiles are preloaded around the camp.
import { territoryHomes } from '../shared/territories.js';
import { SPECIES } from '../fauna/species.js';
import { habitatById } from '../shared/habitats.js';

const hash = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
export function campFor(F, q, iid = '', landing = null) {
  const C = F.crater; const H = hash(iid || q?.name || 'x');
  let home = null;
  // the habitat picked on the sea chart (群生地) wins: the ship sails there (habitats.js)
  const hab = landing ? habitatById(F, landing) : null;
  const boss = hab ? (hab.kind === 'boss' ? hab : null) : territoryHomes(F).find((T) => T.id === q?.monster || (T.kind === q?.monster && T.id === T.kind));
  if (hab) home = { x: hab.x, z: hab.z };
  else if (boss) home = { x: boss.home[0], z: boss.home[1] };
  else {
    const sp = q?.monster && SPECIES[q.monster] ? q.monster : null; const cands = [];
    const N = Math.ceil((F.half * 2) / 64);
    for (let tz = 0; tz < N; tz++) for (let tx = 0; tx < N; tx++) {
      const x = -F.half + (tx + 0.5) * 64, z = -F.half + (tz + 0.5) * 64; const reg = F.regionAt(x, z); if (reg === 'sea') continue;
      const score = sp ? (SPECIES[sp].regions?.[reg] || 0) : q?.region ? (reg === q.region ? 1 : 0) : 0;
      if (score > 0 && Math.hypot(x - C.x, z - C.z) > C.r + 60) cands.push({ x, z, score });
    }
    cands.sort((a, b) => b.score - a.score || a.x - b.x || a.z - b.z);
    const top = cands.slice(0, 8); if (top.length) { const c = top[H % top.length]; home = { x: c.x, z: c.z }; }
  }
  if (!home) return null;
  // camp: 50 m out from the quarry, away from the crater, on flat dry ground
  const dx = home.x - C.x, dz = home.z - C.z, d = Math.hypot(dx, dz) || 1; const off = boss ? 55 : 24;
  const [x, z] = F.findSite(home.x + (dx / d) * off, home.z + (dz / d) * off, { flatR: 6, maxSlope: 0.35 });
  return { x, z, target: home, boss: !!boss };
}
