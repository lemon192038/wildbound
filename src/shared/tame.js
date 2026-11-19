// Taming (user request): the Monster Workshop (モンスター屋) in town builds an artificial monster (人造モンスター) out of
// EVERY part material of one monster plus gathered island materials. Constructs have no combat ability; they carry a
// saddle, can be summoned anywhere on a hunt, ridden and dismounted on the spot, move fast, and each species has its own
// trait. Shared by the client (shop panel, ride controller) and the authoritative server (craftTame / equipTame).
//
// The real monsters' lore is untouched: these are man-made constructs modelled on them, not the creatures themselves.
import { ISLAND_LOOT } from './islandLoot.js';

// Traits (what each one does is implemented in src/tame/ride.js + the hazard / perception hooks)
//   lavaSwim  : moves over lava; the rider takes no lava damage and no burn
//   fly       : free flight (jump = climb, dodge = descend); `ceiling` caps the height above ground
//   unseen    : monsters and fauna never target the rider
//   camo      : like unseen, but only while standing still (rock mimicry)
//   heatproof : the rider cannot be burned
//   poisonproof: the rider cannot be poisoned
//   sprint    : highest ground speed, sprinting costs no stamina
//   climb     : steep slopes do not slow it down
//   bounce    : very high jumps
//   sturdy    : hits do not throw the rider off
//   charge    : breaks through props (rocks, trees) instead of stopping
export const TRAITS = ['lavaSwim', 'fly', 'unseen', 'camo', 'heatproof', 'poisonproof', 'sprint', 'climb', 'bounce', 'sturdy', 'charge'];

// plan: body shape for src/tame/mountModel.js · c1 body, c2 accents, glow: construct seams · s: scale · speed: m/s
// extra: island materials (gathering) needed on top of every part material · coins: workshop fee
export const TAMES = {
  beetle: { plan: 'beetle', c1: 0x3a2a24, c2: 0xc05a20, glow: 0xff8030, s: 1.0, speed: 11, traits: ['heatproof'], extra: { beetleHusk: 4, pumice: 3, heatShard: 2 }, coins: 1200 },
  slime: { plan: 'blob', c1: 0xd05020, c2: 0xffa040, glow: 0xffc060, s: 1.0, speed: 10, traits: ['bounce', 'heatproof'], extra: { boilingClay: 4, magmaBead: 3, springSalt: 2 }, coins: 1200 },
  bird: { plan: 'bird', c1: 0x2a2424, c2: 0xc04020, glow: 0xff7030, s: 1.0, speed: 14, traits: ['fly'], ceiling: 28, extra: { gullFeather: 5, peakDown: 3, windFlower: 2 }, coins: 2400 },
  lizard: { plan: 'quad', c1: 0x2c2826, c2: 0x8a3a1a, glow: 0xff6020, s: 0.9, speed: 13, traits: ['climb'], extra: { redClay: 4, canyonCactus: 3, fireHerb: 2 }, coins: 2000 },
  drake: { plan: 'quad', c1: 0x4a2a20, c2: 0x2a1a14, glow: 0xff5020, s: 1.15, speed: 12, traits: ['sturdy', 'heatproof'], extra: { cinderAsh: 4, scorchRoot: 3, calderaEmber: 2 }, coins: 3200 },
  snake: { plan: 'serpent', c1: 0x2a2220, c2: 0xd05010, glow: 0xff7020, s: 1.0, speed: 13, traits: ['lavaSwim', 'heatproof'], extra: { obsidian: 4, moltenGlass: 2, lavaPearl: 1, brimstone: 3 }, coins: 6000 },
  boar: { plan: 'quad', c1: 0x5a4a40, c2: 0x9ad0ff, glow: 0x80c0ff, s: 1.0, speed: 13, traits: ['charge'], extra: { quartzSpike: 3, crystalDust: 4, hardwood: 2 }, coins: 2400 },
  tusk: { plan: 'quad', c1: 0x4a3c34, c2: 0x9ad0ff, glow: 0x80c0ff, s: 1.3, speed: 13, traits: ['charge', 'sturdy'], extra: { prismShard: 2, resonantCrystal: 1, crystalWater: 3 }, coins: 5200 },
  wolf: { plan: 'quad', c1: 0x2a2020, c2: 0xd04010, glow: 0xff6020, s: 0.95, speed: 15, traits: ['sprint'], extra: { ashGrass: 4, vigorBerry: 3, emberFirefly: 3 }, coins: 2600 },
  leader: { plan: 'quad', c1: 0x241c1c, c2: 0xff6020, glow: 0xff8040, s: 1.1, speed: 16, traits: ['sprint', 'sturdy'], extra: { emberBerry: 2, emberSilk: 2, vigorBerry: 3 }, coins: 4400 },
  mole: { plan: 'mole', c1: 0x5a5048, c2: 0x8a7a6a, glow: 0xc0a070, s: 1.0, speed: 11, traits: ['unseen'], extra: { copperOre: 4, coal: 3, ironSand: 3 }, coins: 3600 },
  grandmole: { plan: 'mole', c1: 0x4a443e, c2: 0xb0a080, glow: 0xffe0a0, s: 1.3, speed: 12, traits: ['unseen', 'sturdy'], extra: { silverOre: 2, goldNugget: 1, magnetite: 3 }, coins: 7000 },
  golem: { plan: 'golem', c1: 0x5a524a, c2: 0xd05020, glow: 0xff6030, s: 1.0, speed: 10, traits: ['camo', 'sturdy'], extra: { basaltSlab: 4, echoStone: 1, fossilBone: 2 }, coins: 4200 },
  flame: { plan: 'dragon', c1: 0x7a2a14, c2: 0x2a1a14, glow: 0xff7020, s: 1.25, speed: 17, traits: ['fly', 'heatproof'], ceiling: 70, extra: { fireOpal: 1, calderaEmber: 3, sulfurCrystal: 3 }, coins: 9000 },
  venom: { plan: 'dragon', c1: 0x2a4a2a, c2: 0x6a2a6a, glow: 0x80ff60, s: 1.25, speed: 16, traits: ['fly', 'poisonproof'], ceiling: 60, extra: { antidoteMoss: 4, rotTruffle: 2, moonMorel: 1 }, coins: 9000 },
  cindaryl: { plan: 'dragon', c1: 0x3a2050, c2: 0x80ff40, glow: 0xa0ff60, s: 1.45, speed: 18, traits: ['fly', 'poisonproof'], ceiling: 80, extra: { amethystGeode: 1, starIron: 1, antidoteMoss: 4 }, coins: 16000 },
  varkhul: { plan: 'quad', c1: 0x5a2010, c2: 0x2a1410, glow: 0xff6010, s: 1.3, speed: 15, traits: ['sprint', 'heatproof'], extra: { magmaBead: 3, heatShard: 3, coal: 3 }, coins: 5000 },
  wyvern: { plan: 'dragon', c1: 0x4a3a34, c2: 0xc04020, glow: 0xff7030, s: 1.2, speed: 16, traits: ['fly'], ceiling: 60, extra: { peakDown: 3, windFlower: 2, volcanicGlass: 3 }, coins: 7000 },
  brute: { plan: 'golem', c1: 0x3a2a24, c2: 0xff5010, glow: 0xff6020, s: 1.25, speed: 11, traits: ['charge', 'sturdy', 'heatproof'], extra: { basaltSlab: 4, starIron: 1, brimstone: 3 }, coins: 8000 },
};
export const TAME_ORDER = Object.keys(TAMES);

// Every part material of the monster: island creatures use ISLAND_LOOT (body + broken parts); the three original bosses
// use their own carve / break tables (passed in as `monsters` so this file stays free of a gamedata import cycle).
export function partMaterials(sp, monsters, items) {
  const set = new Set(); const L = ISLAND_LOOT[sp];
  if (L && !L.from) { for (const [k] of L.body) set.add(k); for (const k of Object.values(L.parts || {})) set.add(k); }
  else if (monsters?.[sp]) { for (const [k] of monsters[sp].carves) set.add(k); for (const k of Object.values(monsters[sp].breaks || {})) set.add(k); }
  const out = {};
  for (const k of set) { const r = items?.[k]?.rarity ?? 2; out[k] = r <= 2 ? 3 : r === 3 ? 2 : 1; }
  return out;
}
export function tameRecipe(sp, monsters, items) {
  const T = TAMES[sp]; if (!T) return null;
  return { parts: partMaterials(sp, monsters, items), extra: { ...T.extra }, coins: T.coins };
}
export const hasTrait = (sp, tr) => !!TAMES[sp]?.traits.includes(tr);
