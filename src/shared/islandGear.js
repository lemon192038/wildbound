// Island gear (stage 5b): great swords and armour sets forged from island materials (design document §11).
// Merged into WEAPONS / ARMOR_SETS by gamedata.js, so crafting, upgrading, the forge comparison and the server's
// validation all treat them like the original gear. Japanese names live here too (merged into the ja pack).
// Material → character (§11): Flame Dragon = fire · Venom-fang = poison · Cindaryl = strong poison + durability ·
// Crystal Boar = defence/crystal · Magma Beetle = hard shell · Stone Mole = weight/defence · Magma Wolf = mobility/attack.
const w = (attack, affinity = 0, element = null, sharp = 1, cost = null) => ({ attack, affinity, element, sharp, cost });

export const ISLAND_WEAPONS = {
  beetleCarapaceBlade: { name: 'Carapace Greatsword', ja: '甲殻の大剣', jaEffect: '硬い外殻を重ねた、刃こぼれしにくい大剣。', rarity: 2, effect: 'Layered beetle shell: a durable edge.',
    craft: { coins: 900, mats: { mb_shell: 4, mb_shard: 3, ironOre: 4 } },
    levels: [w(552, 0, null, 1.1), w(588, 0, null, 1.12, { coins: 1500, mats: { mb_shell: 3, mb_mandible: 2 } }), w(624, 5, null, 1.15, { coins: 2600, mats: { mb_core: 1, mb_shard: 4 } })] },
  packFangBlade: { name: 'Pack Fang Blade', ja: '群狼の牙刃', jaEffect: '群れの牙を連ねた軽い大剣。会心が出やすい。', rarity: 3, effect: 'Fangs of a whole pack: light and keen.',
    craft: { coins: 2200, mats: { mw_fang: 4, mw_pelt: 3, crimsonOre: 2 } },
    levels: [w(600, 15), w(636, 20, null, 1.05, { coins: 3400, mats: { mw_fang: 3, mw_core: 1 } }), w(672, 25, null, 1.05, { coins: 6200, mats: { mw_fang_l: 1, mw_pelt_l: 1, mw_core: 1 } })] },
  crystalTuskCleaver: { name: 'Crystal Tusk Cleaver', ja: '結晶牙の大鉈', jaEffect: '結晶をまとう分厚い刃。切れ味が長く続く。', rarity: 4, effect: 'Crystal-clad edge that stays keen.',
    craft: { coins: 3600, mats: { cb_crystal: 4, cb_tusk: 2, cb_hide: 3 } },
    levels: [w(648, 0, null, 1.2), w(696, 0, null, 1.2, { coins: 5600, mats: { cb_crystal: 4, cb_tusk: 2 } }), w(744, 5, null, 1.25, { coins: 9800, mats: { cb_tusk_great: 1, cb_crystal_l: 1 } })] },
  obsidianFangSword: { name: 'Obsidian Fang Greatsword', ja: '黒曜牙の大剣', jaEffect: '溶岩核を封じた黒曜石の刃。火属性。', rarity: 4, effect: 'Fire element. A lava core sealed in obsidian.',
    craft: { coins: 4200, mats: { ls_fang: 1, ls_shell: 3, ls_magma: 2 } },
    levels: [w(624, 10, { type: 'fire', value: 300 }, 1.05), w(672, 10, { type: 'fire', value: 360 }, 1.1, { coins: 6800, mats: { ls_shell: 3, ls_magma: 3 } }), w(720, 15, { type: 'fire', value: 420 }, 1.1, { coins: 11000, mats: { ls_core: 1, ls_fang: 1 } })] },
  golemSlab: { name: 'Golem Slab', ja: '岩塊の剛剣', jaEffect: '動く岩から削り出した重い刃。攻撃力が高いが会心は出にくい。', rarity: 5, effect: 'Carved from a moving stone: crushing but crude.',
    craft: { coins: 5600, mats: { bg_stone: 5, bg_ore: 2, sm_plate: 2 } },
    levels: [w(744, -20, null, 0.95), w(792, -15, null, 1.0, { coins: 8800, mats: { bg_stone: 4, bg_ore: 2 } }), w(840, -10, null, 1.0, { coins: 14000, mats: { bg_core: 1, sm_plate_l: 1 } })] },
  flameDragonSword: { name: 'Flame Dragon Greatsword', ja: '火焔龍の大剣', jaEffect: '火焔龍の火炎袋を宿す。強い火属性。', rarity: 5, effect: 'Strong fire element from a flame sac.',
    craft: { coins: 7000, mats: { fd_scale: 4, fd_claw: 2, fd_flame_sac: 1 } },
    levels: [w(696, 0, { type: 'fire', value: 420 }, 1.1), w(744, 5, { type: 'fire', value: 480 }, 1.1, { coins: 10000, mats: { fd_shell: 3, fd_fang: 1 } }), w(792, 10, { type: 'fire', value: 560 }, 1.15, { coins: 16000, mats: { fd_tail: 1, fd_membrane: 1, fd_flame_sac: 1 } })] },
  venomFangSword: { name: 'Venom-fang Greatsword', ja: '毒牙龍の大剣', jaEffect: '毒牙龍の毒袋を仕込んだ刃。毒属性。', rarity: 5, effect: 'Poison element from a venom sac.',
    craft: { coins: 7000, mats: { vd_scale: 4, vd_fang: 1, vd_venom_sac: 1 } },
    levels: [w(672, 5, { type: 'poison', value: 380 }, 1.1), w(720, 5, { type: 'poison', value: 440 }, 1.1, { coins: 10000, mats: { vd_shell: 3, vd_tail: 1 } }), w(768, 10, { type: 'poison', value: 520 }, 1.15, { coins: 16000, mats: { vd_gem: 1, vd_venom_sac: 2 } })] },
  cindarylLethalBlade: { name: "Venom Empress's Blade", ja: '猛毒姫の剣', jaEffect: 'シンダリルの猛毒を宿す。非常に強い毒属性と高い耐久性。', rarity: 7, effect: 'Very strong poison; a blade that barely dulls.',
    craft: { coins: 15000, mats: { cy_scale: 4, cy_fang: 1, cy_venom_sac: 2, vd_scale: 3 } },
    levels: [w(792, 10, { type: 'poison', value: 560 }, 1.2), w(840, 15, { type: 'poison', value: 640 }, 1.2, { coins: 22000, mats: { cy_shell: 3, cy_tail: 1 } }), w(888, 20, { type: 'poison', value: 720 }, 1.25, { coins: 32000, mats: { cy_gem: 1, cy_membrane: 1, cy_venom_sac: 2 } })] },
};

// armour sets (5 slots each) — skills reuse the existing skill set so every effect actually works in combat
export const ISLAND_ARMOR_SETS = {
  carapace: { name: 'Carapace', ja: 'キャラペス', rarity: 2, def: 22, perLv: 3, maxLv: 4, res: { fire: 2, water: 0, thunder: -1, ice: 0, dragon: 0 },
    skills: { head: { steadfast: 1 }, chest: { heatward: 1 }, arms: { sharpEdge: 1 }, waist: { steadfast: 1 }, legs: { constitution: 1 } }, craft: { coins: 600, mats: { mb_shell: 2, mb_shard: 2 } }, upMats: { mb_shard: 1 }, upCoins: 220 },
  ashfeather: { name: 'Ashfeather', ja: 'アッシュフェザー', rarity: 3, def: 26, perLv: 3, maxLv: 5, res: { fire: 2, water: 0, thunder: 1, ice: -1, dragon: 0 },
    skills: { head: { critEye: 1 }, chest: { constitution: 1 }, arms: { critEye: 1 }, waist: { constitution: 1 }, legs: { constitution: 1, critEye: 1 } }, craft: { coins: 1100, mats: { ab_feather: 3, ab_beak: 1 } }, upMats: { ab_feather: 1 }, upCoins: 320 },
  magmawolf: { name: 'Magma Wolf', ja: 'マグマウルフ', rarity: 3, def: 32, perLv: 4, maxLv: 5, res: { fire: 3, water: -2, thunder: 0, ice: -1, dragon: 0 },
    skills: { head: { attackBoost: 1 }, chest: { critEye: 1 }, arms: { attackBoost: 1 }, waist: { constitution: 1 }, legs: { critEye: 1 } }, craft: { coins: 1600, mats: { mw_pelt: 3, mw_fang: 1 } }, upMats: { mw_pelt: 1 }, upCoins: 380 },
  crystalboar: { name: 'Crystal Boar', ja: 'クリスタルボア', rarity: 4, def: 46, perLv: 5, maxLv: 5, res: { fire: 1, water: 2, thunder: -2, ice: 2, dragon: 0 },
    skills: { head: { steadfast: 1 }, chest: { healthBoost: 1 }, arms: { steadfast: 1 }, waist: { healthBoost: 1 }, legs: { steadfast: 1 } }, craft: { coins: 2400, mats: { cb_hide: 3, cb_crystal: 2 } }, upMats: { cb_crystal: 1 }, upCoins: 480 },
  stonemole: { name: 'Stone Mole', ja: 'ストーンモール', rarity: 4, def: 52, perLv: 5, maxLv: 5, res: { fire: 2, water: 0, thunder: 2, ice: -2, dragon: 0 },
    skills: { head: { steadfast: 1 }, chest: { healthBoost: 1, steadfast: 1 }, arms: { sharpEdge: 1 }, waist: { healthBoost: 1 }, legs: { steadfast: 1 } }, craft: { coins: 2600, mats: { sm_plate: 3, sm_ore: 2 } }, upMats: { sm_ore: 1 }, upCoins: 520 },
  flamedragon: { name: 'Flame Dragon', ja: '火焔龍', rarity: 5, def: 56, perLv: 6, maxLv: 6, res: { fire: 6, water: -3, thunder: 0, ice: -3, dragon: 2 },
    skills: { head: { heatward: 1, attackBoost: 1 }, chest: { attackBoost: 1 }, arms: { heatward: 1 }, waist: { critEye: 1 }, legs: { heatward: 1, attackBoost: 1 } }, craft: { coins: 4200, mats: { fd_scale: 3, fd_shell: 2 } }, upMats: { fd_scale: 1 }, upCoins: 700 },
  venomfang: { name: 'Venom-fang', ja: '毒牙龍', rarity: 5, def: 54, perLv: 6, maxLv: 6, res: { fire: 2, water: 0, thunder: -2, ice: 1, dragon: 2 },
    skills: { head: { antivenom: 1 }, chest: { antivenom: 1, healthBoost: 1 }, arms: { antivenom: 1 }, waist: { critEye: 1 }, legs: { antivenom: 1, steadfast: 1 } }, craft: { coins: 4200, mats: { vd_scale: 3, vd_shell: 2 } }, upMats: { vd_scale: 1 }, upCoins: 700 },
  cindaryl: { name: 'Venom Empress', ja: '猛毒姫', rarity: 7, def: 72, perLv: 7, maxLv: 7, res: { fire: 4, water: -2, thunder: 1, ice: 0, dragon: 3 },
    skills: { head: { antivenom: 1, critEye: 1 }, chest: { antivenom: 2, attackBoost: 1 }, arms: { critEye: 1, attackBoost: 1 }, waist: { antivenom: 1, healthBoost: 1 }, legs: { attackBoost: 1, steadfast: 1 } }, craft: { coins: 9000, mats: { cy_scale: 2, cy_shell: 2, vd_scale: 2 } }, upMats: { cy_scale: 1 }, upCoins: 1200 },
};
