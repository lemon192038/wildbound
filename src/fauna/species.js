// Small island fauna — data only (behaviour lives in fauna.js). Values follow the user's monster design document
// ("ゲーム実装用ステータス"); stats given there on a 0–100 scale are mapped to game units here.
//   hp          base HP of an adult (juveniles/young scale down by growth stage)
//   speed       m/s walking (birds: flight speed)
//   senses      sight/hearing/smell in metres (smell = vibration/chemical for beetles)
//   regions     island regions it lives in → per-64 m-tile adult count (session census, see fauna.js)
//   eats/fears  ecological relations (species ids; 'hunter' = players) — used by the AI, never randomised
//   drops       material ids (granted by the stage-5 carving system; listed so the data is complete)
export const SPECIES = {
  beetle: {
    name: { ja: 'マグマビートル', en: 'Magma Beetle' }, threat: 'low',
    hp: 650, defense: 0.9, speed: 1.3, size: 1.1,
    senses: { sight: 7, hearing: 14, smell: 10 },              // poor eyes; antennae read vibration and chemicals
    regions: { ashplain: 3, core: 2, geotherm: 3, caldera: 1, peaks: 1, crystal: 2, canyon: 1 },
    eats: ['mineral', 'fungi', 'detritus'], fears: ['bird', 'hunter'], rivals: ['slime'],
    curlDefense: 0.3,                                          // damage multiplier while curled
    heatBurst: { radius: 3.2, damage: 8, status: ['burn', 'small'], cooldown: 12 },
    drops: ['mb_shell', 'mb_shard', 'mb_mandible', 'mb_core', 'mb_antenna'],
  },
  slime: {
    name: { ja: 'マグマスライム', en: 'Magma Slime' }, threat: 'low',
    hp: 420, defense: 0.6, speed: 0.8, size: 1.0,
    senses: { sight: 0, hearing: 10, smell: 12 },             // heat / vibration / minerals
    regions: { caldera: 3, geotherm: 3, core: 2, canyon: 3, ashplain: 1, crystal: 1 },
    eats: ['ash', 'mineral', 'microbe', 'fungi', 'detritus'], fears: ['bird', 'hunter'], rivals: ['beetle'],
    spit: { damage: 6, status: ['burn', 'small'], speed: 14, cooldown: 3.2, range: 14 },
    split: { minStage: 2, threshold: 0.3 },                    // a hit taking ≥30 % max HP splits mature+ slimes
    flatDefense: 0.6,
    drops: ['ms_gel', 'ms_core'],
    servant: 'volcanoSlime',                                   // hidden world event (stage 7)
  },
  bird: {
    name: { ja: 'アッシュバード', en: 'Ash Bird' }, threat: 'low',
    hp: 1200, defense: 0.28, speed: 9.5, groundSpeed: 1.6, size: 1.0,
    senses: { sight: 55, hearing: 22, smell: 0 },              // 索敵 85/100
    regions: { ashplain: 1, peaks: 1, coast: 1, geotherm: 1, core: 0.5 },
    eats: ['beetle', 'slime_small', 'insect'], fears: ['hunter'], rivals: [],
    altitude: [14, 30], fleeHp: 0.4,                           // escapes actively below 40 % HP
    drops: ['ab_feather', 'ab_flight', 'ab_beak', 'ab_core'],
  },
  lizard: {
    name: { ja: 'ファイアリザード', en: 'Fire Lizard' }, epithet: { ja: '岩陰の待ち伏せ者', en: 'Ambusher of the Rocks' }, threat: 'mid',
    hp: 2800, defense: 0.65, speed: 2.2, chargeSpeed: 15, size: 1.0,     // 全長 1.8–2.8 m; 突進 ≈ 65 km/h, short range
    senses: { sight: 16, hearing: 18, smell: 8 },                        // heat / vibration ambush sensing
    regions: { canyon: 0.6, core: 0.35, peaks: 0.3, ashplain: 0.25, geotherm: 0.35, crystal: 0.2 },
    eats: ['beetle', 'slime_small', 'bird_ground', 'beetle_larva'], fears: ['snake', 'wolf', 'boss'], rivals: ['bird', 'snake'],
    territory: 28, giveUp: 22,                                           // poor long-distance chaser: gives up quickly
    attacks: { bite: { damage: 18, status: ['burn', 'small'] }, tail: { damage: 14, knockback: 7 }, charge: { damage: 22, knockback: 10 }, fire: { damage: 16, status: ['burn', 'large'], speed: 18, cooldown: 9, range: [5, 14] } },
    fleeHp: 0.3,
    drops: ['fl_scale', 'fl_fang', 'fl_spine', 'fl_gland'],
  },
  snake: {
    name: { ja: 'ラヴァスネーク', en: 'Lava Snake' }, epithet: { ja: '溶岩を泳ぐ者', en: 'Swimmer of the Molten Rivers' }, threat: 'midboss',
    hp: 8500, defense: 0.92, speed: 3.2, lavaSpeed: 10, size: 1.0,      // 全長 5–15 m; slow on land, very fast in lava
    senses: { sight: 22, hearing: 26, smell: 0 },
    habitat: 'lava', regions: { caldera: 0.5, canyon: 0.45, core: 0.25, ashplain: 0.15 },
    eats: ['lizard', 'beetle', 'bird', 'slime', 'boar_juvenile'], fears: ['dragon', 'golem', 'wolf_pack'], rivals: ['lizard', 'varkhul'],
    attacks: { lunge: { damage: 30, knockback: 10, status: ['burn', 'large'] }, lavaBall: { damage: 20, status: ['burn', 'large'], speed: 22, cooldown: 6, range: [9, 30] } },
    landReach: 12,                                                       // how far it lunges out of the lava
    fleeHp: 0.25,
    drops: ['ls_core', 'ls_fang', 'ls_shell', 'ls_magma'],
  },
  boar: {
    name: { ja: 'クリスタルボア', en: 'Crystal Boar' }, threat: 'mid',
    hp: 3800, defense: 0.88, speed: 2.0, runSpeed: 7, chargeSpeed: 13, size: 1.0,    // ≈2.6 m long; crystals on back/shoulders
    senses: { sight: 26, hearing: 24, smell: 18 },
    group: { min: 3, max: 6, special: 'tusk', specialChance: 0.5, juveniles: [0, 2] }, // herds of 3–6, sometimes led by a Crystal Tusk
    regions: { coast: 0.07, fungal: 0.09, ashplain: 0.04, crystal: 0.07, core: 0.02 },     // herds per 64 m tile (island ≈ 25–50 boars)
    eats: ['plant', 'root', 'mineral', 'insect'], fears: ['wolf_pack', 'boss'], rivals: [],
    attacks: { charge: { damage: 28, knockback: 12, creature: 420 }, gore: { damage: 18, knockback: 6, creature: 260 } },
    distances: { observe: 26, warn: 16, threat: 10, charge: 6 },                      // far → keep grazing … very close → charge
    drops: ['cb_crystal', 'cb_hide', 'cb_tusk'],
  },
  tusk: { // special large individual of the Crystal Boar herd — NOT a separate species (stats from the design document)
    name: { ja: 'クリスタルタスク', en: 'Crystal Tusk' }, epithet: { ja: 'クリスタルボアの大型個体', en: 'Great Crystal Boar' }, threat: 'midboss', of: 'boar',
    hp: 8500, defense: 0.96, speed: 2.1, runSpeed: 7.5, chargeSpeed: 15, size: 1.45,
    senses: { sight: 30, hearing: 30, smell: 24 }, regions: {},
    attacks: { charge: { damage: 40, knockback: 14, creature: 700 }, gore: { damage: 26, knockback: 8, creature: 400 }, crystalCharge: { damage: 52, knockback: 16, creature: 900, rest: 3.5 } },
    drops: ['cb_crystal_l', 'cb_tusk_great', 'cb_hide'],
  },
  wolf: {
    name: { ja: 'マグマウルフ', en: 'Magma Wolf' }, threat: 'mid',
    hp: 1600, defense: 0.6, speed: 3.2, runSpeed: 10, size: 1.0,                      // HP not given in the design document (assumed)
    senses: { sight: 34, hearing: 36, smell: 40 },
    group: { min: 4, max: 7, special: 'leader', specialChance: 1, juveniles: [0, 2] },  // ALWAYS in a pack with a leader; never spawned alone
    regions: { fungal: 0.06, peaks: 0.04, coast: 0.02, ashplain: 0.03, ruins: 0.05 },       // packs per tile (island ≈ 4–6 packs)
    eats: ['lizard', 'beetle', 'slime_small', 'boar_juvenile', 'bird_ground', 'carcass'], fears: ['boss', 'snake_lava', 'dragon'], rivals: ['varkhul', 'lizard'],
    attacks: { bite: { damage: 14, knockback: 4, creature: 160 }, lunge: { damage: 20, knockback: 7, creature: 220 } },
    territory: 140,
    drops: ['mw_fang', 'mw_pelt', 'mw_core'],
  },
  leader: { // the pack's strong individual — a Magma Wolf, not a separate species (stats assumed)
    name: { ja: 'マグマウルフ（リーダー）', en: 'Magma Wolf (Leader)' }, epithet: { ja: '群れを率いる個体', en: 'Pack Leader' }, threat: 'mid', of: 'wolf',
    hp: 4200, defense: 0.7, speed: 3.2, runSpeed: 10.5, size: 1.3,
    senses: { sight: 40, hearing: 40, smell: 44 }, regions: {},
    attacks: { bite: { damage: 20, knockback: 6, creature: 260 }, lunge: { damage: 28, knockback: 10, creature: 340 } },
    drops: ['mw_fang_l', 'mw_pelt_l', 'mw_core'],
  },
  mole: {
    name: { ja: 'ストーンモール', en: 'Stone Mole' }, epithet: { ja: '地中の掘削者', en: 'Burrower of the Deep Rock' }, threat: 'midboss',
    hp: 7200, defense: 0.92, speed: 2.4, digSpeed: 8, chargeSpeed: 9, size: 1.0,    // adult 2.8–3.8 m; slow above ground, fast below
    senses: { sight: 6, hearing: 30, smell: 14 },                                    // feels footsteps through the ground (感知 93/100)
    habitat: 'underground', special: { id: 'grandmole', chance: 0.08 },
    regions: { crystal: 0.07, peaks: 0.05, fungal: 0.05, ashplain: 0.04, core: 0.02 },  // island ≈ 10–25
    eats: ['beetle_larva', 'root', 'mineral', 'underground'], fears: ['snake'], rivals: ['golem'],
    attacks: { claw: { damage: 26, knockback: 8 }, burst: { damage: 30, knockback: 12 }, dig: { damage: 30, knockback: 11 } },
    surfaceTime: [12, 20], chase: 30,
    drops: ['sm_claw', 'sm_plate', 'sm_ore'],
  },
  grandmole: { // the old giant individual of the Stone Mole — NOT a separate species (stats from the design document)
    name: { ja: 'グランドモール', en: 'Grand Mole' }, epithet: { ja: 'ストーンモールの老齢個体', en: 'Elder Stone Mole' }, threat: 'midboss', of: 'mole',
    hp: 15000, defense: 1.0, speed: 2.1, digSpeed: 9, chargeSpeed: 9, size: 1.45,
    senses: { sight: 6, hearing: 38, smell: 16 }, regions: {},
    attacks: { claw: { damage: 36, knockback: 10 }, burst: { damage: 42, knockback: 14 }, dig: { damage: 40, knockback: 13 } },
    surfaceTime: [16, 26], chase: 60,                                                 // strong territoriality: long chases near the nest
    drops: ['sm_claw_l', 'sm_plate_l', 'sm_ancient_core'],
  },
  golem: {
    name: { ja: 'ボルダーゴーレム', en: 'Boulder Golem' }, epithet: { ja: '岩に擬態するもの', en: 'The Stone That Waits' }, threat: 'midboss',
    hp: 12000, defense: 0.98, speed: 1.4, chargeSpeed: 6, size: 1.0,              // slow; 擬態 100/100
    senses: { sight: 18, hearing: 22, smell: 0 },
    regions: { peaks: 0.08, ruins: 0.12, crystal: 0.05, core: 0.03 },                  // island ≈ 10–20
    eats: ['mineral', 'geothermal'], fears: ['dragon'], rivals: ['mole', 'gorvath'],
    distances: { alert: 18, glow: 10, rise: 6, wake: 3.5 },
    attacks: { fist: { damage: 40, knockback: 10 }, slam: { damage: 18, knockback: 6, radius: 6, cooldown: 8 }, throw: { damage: 32, knockback: 9, speed: 16, cooldown: 7, range: [10, 30] }, charge: { damage: 35, knockback: 12, cooldown: 10 } },
    territory: 25,
    drops: ['bg_stone', 'bg_core', 'bg_ore'],
  },
  drake: { // 燼皮: a low-ranking dragon that has lost the power of flight (wings no longer usable); crawls low. HP assumed.
    name: { ja: '燼皮', en: 'Cinderskin Drake' }, epithet: { ja: '飛べない竜', en: 'The Flightless Dragon' }, threat: 'mid',
    hp: 5200, defense: 0.75, speed: 2.6, chargeSpeed: 11, size: 2.2,
    senses: { sight: 24, hearing: 22, smell: 30 },
    regions: { core: 0.08, ashplain: 0.06, geotherm: 0.06, canyon: 0.05 },
    eats: ['bird_ground', 'beetle', 'slime', 'lizard_juvenile', 'carcass'], fears: ['wolf_pack', 'tusk', 'dragon', 'gorvath'], rivals: [],
    roams: true, scavenger: true, territory: 40, giveUp: 26,
    attacks: { bite: { damage: 24, status: ['burn', 'small'] }, tail: { damage: 20, knockback: 9 }, charge: { damage: 30, knockback: 12 }, fire: { damage: 22, status: ['burn', 'large'], speed: 16, cooldown: 10, range: [5, 13] } },
    fleeHp: 0.3,
    drops: ['jp_scale', 'jp_claw', 'jp_wing'],
  },
};
// growth stages (mature slimes can split; juveniles stay near home)
export const STAGES = [{ id: 'juvenile', scale: 0.55, hp: 0.35 }, { id: 'young', scale: 0.78, hp: 0.65 }, { id: 'adult', scale: 1, hp: 1 }, { id: 'large', scale: 1.28, hp: 1.5 }];

// Stage-4 parts per species (hitbox part names in fauna.js). hp = fraction of the creature's max HP.
// disables: abilities lost while broken (regen = seconds until it regrows; null = permanent).
// Not every species has the same parts — they follow each body plan (slimes have none).
// real body length in metres (adult) — used to compare creature sizes across species (part targeting etc.)
export const BODY_SIZE = { beetle: 1.2, slime: 1.0, bird: 1.1, lizard: 2.3, drake: 5.0, snake: 10, boar: 2.6, tusk: 3.8, wolf: 1.9, leader: 2.4, mole: 3.3, grandmole: 5.5, golem: 4.0 };

export const PARTS = {
  beetle: [{ name: 'shell', hp: 0.45, hitzone: 1, hardness: 0.9, regen: 240, disables: ['curl'] }],                               // cracked shell: curling no longer protects
  slime: [],
  bird: [{ name: 'wings', hp: 0.3, hitzone: 1.1, hardness: 0.1, regen: 300, disables: ['fly'] }, { name: 'body', hitzone: 1, hardness: 0.25 }], // torn wings: grounded
  lizard: [{ name: 'head', hp: 0.25, hitzone: 1.2, hardness: 0.5, regen: 200, disables: ['bite', 'fire'] }, { name: 'tail', hp: 0.25, hitzone: 0.9, hardness: 0.4, regen: 400, disables: ['tail'] }, { name: 'body', hitzone: 1, hardness: 0.55 }],
  drake: [{ name: 'head', hp: 0.22, hitzone: 1.2, hardness: 0.55, regen: 260, disables: ['bite', 'fire'] }, { name: 'tail', hp: 0.22, hitzone: 0.9, hardness: 0.45, regen: 480, disables: ['tail'] }, { name: 'body', hitzone: 1, hardness: 0.6 }],
  snake: [{ name: 'head', hp: 0.15, hitzone: 1.25, hardness: 0.8, regen: 300, disables: ['ball', 'swallow'] }, { name: 'body', hitzone: 0.8, hardness: 0.92 }],
  boar: [{ name: 'head', hp: 0.2, hitzone: 1.1, hardness: 0.7, regen: 300, disables: ['gore'] }, { name: 'crystal', hp: 0.25, hitzone: 0.6, hardness: 0.92, regen: 360, disables: [] },
    { name: 'legs', hp: 0.2, hitzone: 1, hardness: 0.4, regen: 240, disables: ['charge', 'run'] }, { name: 'body', hitzone: 0.9, hardness: 0.6 }],
  wolf: [{ name: 'head', hp: 0.2, hitzone: 1.2, hardness: 0.45, regen: 200, disables: ['lunge'] }, { name: 'legs', hp: 0.22, hitzone: 1, hardness: 0.35, regen: 200, disables: ['run'] }, { name: 'body', hitzone: 1, hardness: 0.4 }],
  mole: [{ name: 'head', hp: 0.2, hitzone: 1.2, hardness: 0.6, regen: 300, disables: [] }, { name: 'claw', hp: 0.22, hitzone: 0.7, hardness: 0.85, regen: 300, disables: ['dig', 'claw'] },
    { name: 'body', hitzone: 0.85, hardness: 0.88 }, { name: 'mound', hitzone: 0.3, hardness: 0.3 }],
  golem: [{ name: 'core', hp: 0.2, hitzone: 1.5, hardness: 0.5, regen: 600, disables: ['throw'] }, { name: 'arm', hp: 0.25, hitzone: 0.8, hardness: 0.95, regen: 480, disables: ['fist'] }, { name: 'body', hitzone: 0.7, hardness: 0.97 }],
};
// bit per breakable part for the instanced shader's break states (fauna.js → faunaRender.js aBreak)
export const BREAK_BIT = { crystal: 1, tail: 2, wings: 4, arm: 8, claw: 16, shell: 32, head: 64, legs: 128 };
