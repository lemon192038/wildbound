// Life cycle of every island monster (user request): each lineage has an EGG and a JUVENILE, a nest site and a
// territory. Shared by the client (nests, broods, egg taking, construct recipes) and the authoritative server.
// The reasoning behind every entry is in ECOLOGY.md (species relations, diets and names are the user's design
// document and are not changed here — this file only adds reproduction, nests and ranges).
//
//   lineage  : the breeding population an individual belongs to. Special individuals are members of their species
//              (Crystal Tusk → boar, pack leader → wolf, Grand Mole → mole). The Flame Dragon ♂ and the Venom-fang
//              Dragon ♀ are the two sexes of ONE dragon species (Cindral = special male, Cindaryl = special female),
//              so they share one egg and one juvenile: 'dragon'.
//   egg / juv: item ids (egg; carcass of a juvenile) — the Monster Workshop needs one of them for a construct
//   nest     : where eggs are laid (regions, the feature the parents look for) — `guard` = how hard parents defend it
//   range    : home-range radius in metres (adults) — juveniles stay within `juvRange` of the nest
const I = (en, ja, rarity, sell, icon, desc, jaDesc) => ({ name: en, ja, kind: 'material', rarity, buy: null, sell, icon, desc, jaDesc });

export const LINEAGE = {
  beetle: 'beetle', slime: 'slime', bird: 'bird', lizard: 'lizard', snake: 'snake', drake: 'drake', golem: 'golem',
  boar: 'boar', tusk: 'boar', wolf: 'wolf', leader: 'wolf', mole: 'mole', grandmole: 'mole',
  flame: 'dragon', flameUpper: 'dragon', venom: 'dragon', cindaryl: 'dragon', wyvern: 'dragon', cindral: 'dragon',
  varkhul: 'varkhul', brute: 'brute',
};

export const LIFE = {
  beetle: { egg: 'egg_beetle', juv: 'juv_beetle', nest: { regions: ['geotherm', 'ashplain', 'core'], feature: 'warm ash beside a vent (eggs buried, heat-incubated)', guard: 0 }, range: 22, juvRange: 8 },
  slime: { egg: 'egg_slime', juv: 'juv_slime', nest: { regions: ['caldera', 'geotherm', 'canyon'], feature: 'a hot seep: gel eggs budded off by one parent', guard: 0 }, range: 14, juvRange: 6 },
  bird: { egg: 'egg_bird', juv: 'juv_bird', nest: { regions: ['peaks', 'coast'], feature: 'a high, bare ledge (out of reach of ground predators)', guard: 0.3 }, range: 90, juvRange: 14 },
  lizard: { egg: 'egg_lizard', juv: 'juv_lizard', nest: { regions: ['geotherm', 'canyon'], feature: 'warm ground under a rock overhang', guard: 0.1 }, range: 40, juvRange: 10 },
  snake: { egg: 'egg_snake', juv: 'juv_snake', nest: { regions: ['caldera', 'canyon'], feature: 'the warm crust of a lava bank', guard: 0.2 }, range: 70, juvRange: 18 },
  drake: { egg: 'egg_drake', juv: 'juv_drake', nest: { regions: ['core', 'ashplain', 'geotherm'], feature: 'a scrape in deep warm ash', guard: 0.5 }, range: 70, juvRange: 12 },
  golem: { egg: 'egg_golem', juv: 'juv_golem', nest: { regions: ['ruins', 'peaks', 'crystal'], feature: 'a mineral vein: a golem buds a core-stone into it', guard: 0.3 }, range: 30, juvRange: 8 },
  boar: { egg: 'egg_boar', juv: 'juv_boar', nest: { regions: ['fungal', 'coast', 'crystal'], feature: 'a trampled den in thick growth (leathery eggs, the herd stays near)', guard: 0.75 }, range: 160, juvRange: 10 },
  wolf: { egg: 'egg_wolf', juv: 'juv_wolf', nest: { regions: ['ruins', 'peaks', 'fungal'], feature: 'a den among ruins or rocks (one adult stays as a sitter)', guard: 0.85 }, range: 260, juvRange: 12 },
  mole: { egg: 'egg_mole', juv: 'juv_mole', nest: { regions: ['crystal', 'peaks', 'fungal'], feature: 'a deep chamber under crystal ground (a mound marks it)', guard: 0.6 }, range: 60, juvRange: 10 },
  dragon: { egg: 'egg_dragon', juv: 'juv_dragon', nest: { regions: ['canyon', 'peaks', 'core'], feature: 'a ground nest of scorched rock: the female (Venom-fang) guards it, the male (Flame) hunts from the sky', guard: 0.95 }, range: 700, juvRange: 25 },
  varkhul: { egg: 'egg_varkhul', juv: 'juv_varkhul', nest: { regions: ['core', 'geotherm'], feature: 'a hollow of warm cinders in its heartland', guard: 0.9 }, range: 220, juvRange: 20 },
  brute: { egg: 'egg_brute', juv: 'juv_brute', nest: { regions: ['peaks', 'ruins'], feature: 'a ring of piled boulders in the highlands', guard: 0.9 }, range: 200, juvRange: 20 },
};
export const LINEAGES = Object.keys(LIFE);

// big monsters are not in the statistical ecosystem: their nests are fixed sites next to the parents' homes
// (src/field/islandBosses.js TERRITORIES). id → which territory (by id) the nest belongs to and the offset from it.
export const BIG_NESTS = [
  { id: 'nest_venom', lineage: 'dragon', home: 'venom', off: [26, -18], eggs: 2 },
  { id: 'nest_cindaryl', lineage: 'dragon', home: 'cindaryl', off: [-28, 20], eggs: 3 },
  { id: 'nest_venom2', lineage: 'dragon', home: 'venom2', off: [22, 24], eggs: 2 },
  { id: 'nest_varkhul', lineage: 'varkhul', home: 'varkhul', off: [30, 22], eggs: 2 },
  { id: 'nest_brute', lineage: 'brute', home: 'brute', off: [-30, -24], eggs: 1 },
];
export const NEST_LIMITS = { eggsPerExpedition: 6, juvPerExpedition: 8, bigNestCooldownMin: 30, reach: 6 };

// items: one egg and one juvenile carcass per lineage
const NAMES = {
  beetle: ['Magma Beetle', 'マグマビートル'], slime: ['Magma Slime', 'マグマスライム'], bird: ['Ash Bird', 'アッシュバード'], lizard: ['Fire Lizard', 'ファイアリザード'],
  snake: ['Lava Snake', 'ラヴァスネーク'], drake: ['Cinderskin', '燼皮'], golem: ['Boulder Golem', 'ボルダーゴーレム'], boar: ['Crystal Boar', 'クリスタルボア'],
  wolf: ['Magma Wolf', 'マグマウルフ'], mole: ['Stone Mole', 'ストーンモール'], dragon: ['Flame / Venom-fang Dragon', '火焔龍・毒牙龍'], varkhul: ['Varkhul', 'ヴァルクル'], brute: ['Gorvath', 'ゴルヴァス'],
};
const EGG_RARITY = { beetle: 2, slime: 2, bird: 3, lizard: 3, snake: 4, drake: 4, golem: 4, boar: 3, wolf: 4, mole: 4, dragon: 6, varkhul: 6, brute: 6 };
const EGG_NOTE = { slime: ['A budded gel egg, still warm.', '株分かれした温かいゲル卵。'], golem: ['A core-stone budded into a mineral vein. It is slowly growing.', '鉱脈に芽吹いた核石。ゆっくり育っている。'], dragon: ['Laid by a Venom-fang female, guarded day and night.', '毒牙龍の雌が昼も夜も守っていた卵。'] };
export const LIFE_ITEMS = {};
for (const [k, [en, ja]] of Object.entries(NAMES)) {
  const r = EGG_RARITY[k], n = EGG_NOTE[k];
  LIFE_ITEMS[LIFE[k].egg] = I(`${en} Egg`, k === 'golem' ? `${ja}の核石卵` : k === 'slime' ? `${ja}のゲル卵` : `${ja}の卵`, r, 40 * r, 'gem-white', n?.[0] || `An egg from a ${en} nest.`, n?.[1] || `${ja}の巣から持ち帰った卵。`);
  LIFE_ITEMS[LIFE[k].juv] = I(`${en} Juvenile Remains`, `${ja}の幼体の亡骸`, r, 30 * r, 'bone', `The body of a young ${en}.`, `${ja}の幼体の亡骸。`);
}
export const eggOf = (sp) => LIFE[LINEAGE[sp]]?.egg || null;
export const juvOf = (sp) => LIFE[LINEAGE[sp]]?.juv || null;
