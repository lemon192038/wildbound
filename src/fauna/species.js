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
};
// growth stages (mature slimes can split; juveniles stay near home)
export const STAGES = [{ id: 'juvenile', scale: 0.55, hp: 0.35 }, { id: 'young', scale: 0.78, hp: 0.65 }, { id: 'adult', scale: 1, hp: 1 }, { id: 'large', scale: 1.28, hp: 1.5 }];
