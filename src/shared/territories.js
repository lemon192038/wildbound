// Where the island's big monsters live (pure data + one helper, no THREE): used by the boss spawner (islandBosses.js),
// the base camp (islandCamp.js), the sea chart's habitat pins (habitats.js) and nests (lifecycle.js BIG_NESTS).
// Big-monster territories (user request: vast, and never right next to each other — fleeing one big monster must not run
// you into another). Homes sit on a ring around the crater, ≥ 2 × range apart, so territories do not overlap; a mated
// Flame ♂ shares his Venom-fang ♀'s ground (`mate`). `range` = territory radius in metres. The ORDER is fixed (co-op
// snapshot indices). Varkhul south, Cindral east, Gorvath north, as before.
export const TERRITORIES = [
  { kind: 'varkhul', near: [60, 560], site: {}, range: 230 },
  { kind: 'wyvern', near: [620, -110], site: { flatR: 18 }, range: 230 },
  { kind: 'brute', near: [-210, -580], site: { maxSlope: 0.3 }, range: 240 },
  // Dragons of one species (design document): Flame Dragons ♂ (lower / upper individuals) and Venom-fang Dragons ♀,
  // each solitary with its own territory; Cindaryl is the special female (Cindral, above, is the special male).
  // HP values are ASSUMED (the design document gives none): lower < upper < Cindral (19,000) ≈ Cindaryl.
  { kind: 'wyvern', id: 'flame', mate: 'venom', near: [-470, 360], range: 230, site: { flatR: 18, maxSlope: 0.3 }, opts: { variant: 'flame', scale: 0.78, hp: 11000, nameKey: 'dragon.flame' } },
  { kind: 'wyvern', id: 'flameUpper', near: [330, -560], range: 230, site: { flatR: 18, maxSlope: 0.3 }, opts: { variant: 'flame', scale: 0.92, hp: 15500, nameKey: 'dragon.flameUpper' } },
  { kind: 'wyvern', id: 'venom', mate: 'flame', near: [-560, 290], range: 230, site: { flatR: 16, maxSlope: 0.3 }, opts: { variant: 'venom', scale: 0.85, hp: 13000, nameKey: 'dragon.venom' } },
  // more dragons (user request: more monsters): a second Venom-fang female holding a southern territory and the Flame
  // male that hunts for her (the species' pairs: a ground-guarding ♀ + a sky-hunting ♂ — src/field/dragonLife.js)
  { kind: 'wyvern', id: 'venom2', mate: 'flameRoam', near: [500, 410], range: 230, site: { flatR: 16, maxSlope: 0.3 }, opts: { variant: 'venom', scale: 0.82, hp: 12500, nameKey: 'dragon.venom' } },
  { kind: 'wyvern', id: 'flameRoam', mate: 'venom2', near: [430, 470], range: 230, site: { flatR: 18, maxSlope: 0.3 }, opts: { variant: 'flame', scale: 0.8, hp: 11500, nameKey: 'dragon.flame' } },
  { kind: 'wyvern', id: 'cindaryl', near: [-620, -230], range: 240, site: { flatR: 18, maxSlope: 0.3 }, opts: { variant: 'cindaryl', scale: 1.02, hp: 19500, nameKey: 'dragon.cindaryl', epithetKey: 'dragon.cindaryl.title' } },
];
export function territoryHomes(F) { return TERRITORIES.map((T) => ({ kind: T.kind, id: T.id || T.kind, opts: T.opts, range: T.range || 220, mate: T.mate || null, home: F.findSite(T.near[0], T.near[1], T.site) })); }
