// Where the island's big monsters live (pure data + one helper, no THREE): used by the boss spawner (islandBosses.js),
// the base camp (islandCamp.js), the sea chart's habitat pins (habitats.js) and nests (lifecycle.js BIG_NESTS).
export const TERRITORIES = [
  { kind: 'varkhul', near: [150, 400], site: {} },
  { kind: 'wyvern', near: [560, -80], site: { flatR: 18 } },
  { kind: 'brute', near: [-120, -560], site: { maxSlope: 0.3 } },
  // Dragons of one species (design document): Flame Dragons ♂ (lower / upper individuals) and Venom-fang Dragons ♀,
  // each solitary with its own territory; Cindaryl is the special female (Cindral, above, is the special male).
  // HP values are ASSUMED (the design document gives none): lower < upper < Cindral (19,000) ≈ Cindaryl.
  { kind: 'wyvern', id: 'flame', near: [-420, -380], site: { flatR: 18, maxSlope: 0.3 }, opts: { variant: 'flame', scale: 0.78, hp: 11000, nameKey: 'dragon.flame' } },
  { kind: 'wyvern', id: 'flameUpper', near: [250, -650], site: { flatR: 18, maxSlope: 0.3 }, opts: { variant: 'flame', scale: 0.92, hp: 15500, nameKey: 'dragon.flameUpper' } },
  { kind: 'wyvern', id: 'venom', near: [-380, 300], site: { flatR: 16, maxSlope: 0.3 }, opts: { variant: 'venom', scale: 0.85, hp: 13000, nameKey: 'dragon.venom' } },
  // more dragons (user request: more monsters): a second Venom-fang female holding a southern territory and the Flame
  // male that hunts for her (the species' pairs: a ground-guarding ♀ + a sky-hunting ♂ — src/field/dragonLife.js)
  { kind: 'wyvern', id: 'venom2', near: [420, 380], site: { flatR: 16, maxSlope: 0.3 }, opts: { variant: 'venom', scale: 0.82, hp: 12500, nameKey: 'dragon.venom' } },
  { kind: 'wyvern', id: 'flameRoam', near: [-180, 560], site: { flatR: 18, maxSlope: 0.3 }, opts: { variant: 'flame', scale: 0.8, hp: 11500, nameKey: 'dragon.flame' } },
  { kind: 'wyvern', id: 'cindaryl', near: [-660, -260], site: { flatR: 18, maxSlope: 0.3 }, opts: { variant: 'cindaryl', scale: 1.02, hp: 19500, nameKey: 'dragon.cindaryl', epithetKey: 'dragon.cindaryl.title' } },
];
export function territoryHomes(F) { return TERRITORIES.map((T) => ({ kind: T.kind, id: T.id || T.kind, opts: T.opts, home: F.findSite(T.near[0], T.near[1], T.site) })); }
