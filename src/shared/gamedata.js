// Wildbound shared game data — imported by BOTH the browser client and the Node server.
// The server is authoritative: it validates every purchase/craft/upgrade/reward against these tables,
// the client only uses them for display. Pure data + tiny pure helpers; no DOM, no Node APIs.
// Adding content: append entries; ids are stable keys stored in player saves — never rename an id.

export const DATA_VERSION = 1;

// ---------------------------------------------------------------- items & materials
// kind: consumable | tool | material.  rarity 1..7.  buy: shop price (null = not sold).  sell: buy-back price.
// pouchMax: how many can be carried into a hunt.  use: effect id understood by the field runtime.
export const ITEMS = {
  // consumables
  potion: { name: 'Verdant Draught', kind: 'consumable', rarity: 1, buy: 60, sell: 6, pouchMax: 10, use: 'heal50', icon: 'flask-green', desc: 'A bitter herbal draught that knits wounds. Restores a moderate amount of health.' },
  megaPotion: { name: 'Greater Draught', kind: 'consumable', rarity: 3, buy: null, sell: 30, pouchMax: 10, use: 'heal100', icon: 'flask-gold', desc: 'Honey-thickened draught. Restores a large amount of health.' },
  ancientDraught: { name: 'Ancient Draught', kind: 'consumable', rarity: 6, buy: null, sell: 320, pouchMax: 1, use: 'healFull', icon: 'flask-violet', desc: 'A legendary brew. Fully restores health and stamina and grants brief invigoration.' },
  energyDrink: { name: 'Tideroot Tonic', kind: 'consumable', rarity: 2, buy: 120, sell: 12, pouchMax: 5, use: 'stamina', icon: 'flask-blue', desc: 'Refills stamina and halves stamina drain for 60 seconds.' },
  antidote: { name: 'Clearwater Antidote', kind: 'consumable', rarity: 1, buy: 50, sell: 5, pouchMax: 10, use: 'curePoison', icon: 'flask-white', desc: 'Neutralises poison, even the deadly kind.' },
  coolingSalve: { name: 'Frostfern Salve', kind: 'consumable', rarity: 2, buy: null, sell: 18, pouchMax: 5, use: 'cureBurn', icon: 'jar-blue', desc: 'Smothers flames and wards against burns for 90 seconds.' },
  quenchFlask: { name: 'Quench Flask', kind: 'consumable', rarity: 3, buy: null, sell: 28, pouchMax: 5, use: 'cureBlast', icon: 'jar-teal', desc: 'Dowses blastblight and steadies volatile cinder on your armour.' },
  mightSeed: { name: 'Emberseed', kind: 'consumable', rarity: 3, buy: null, sell: 40, pouchMax: 5, use: 'attackUp', icon: 'seed-red', desc: 'Raises attack by 10% for 90 seconds.' },
  adamantSeed: { name: 'Ironbark Seed', kind: 'consumable', rarity: 3, buy: null, sell: 40, pouchMax: 5, use: 'defenseUp', icon: 'seed-grey', desc: 'Reduces damage taken by 15% for 90 seconds.' },
  flashPod: { name: 'Glare Pod', kind: 'tool', rarity: 2, buy: 150, sell: 15, pouchMax: 3, use: 'flash', icon: 'pod-yellow', desc: 'Bursts in blinding light. Grounds flying monsters and dazes others.' },
  snareCoil: { name: 'Snare Coil', kind: 'tool', rarity: 3, buy: 420, sell: 40, pouchMax: 1, use: 'snare', icon: 'coil', desc: 'Pins a weakened, limping monster in place. Follow with Lull Bombs to capture it.' },
  tranqBomb: { name: 'Lull Bomb', kind: 'tool', rarity: 2, buy: 140, sell: 14, pouchMax: 4, use: 'tranq', icon: 'bomb-purple', desc: 'Sedative gas. Two on a snared monster completes a capture.' },
  // gathered / bought materials
  sunpetal: { name: 'Sunpetal Herb', kind: 'material', rarity: 1, buy: 20, sell: 3, icon: 'herb', desc: 'A hardy golden herb found in sunny meadows.' },
  glowcap: { name: 'Glowcap Mushroom', kind: 'material', rarity: 1, buy: null, sell: 5, icon: 'mushroom', desc: 'Faintly luminous fungus from shaded roots.' },
  tidecap: { name: 'Tidecap Lichen', kind: 'material', rarity: 2, buy: null, sell: 9, icon: 'lichen', desc: 'Cool blue lichen that clings to wet stone near water.' },
  honey: { name: 'Wild Honey', kind: 'material', rarity: 1, buy: 40, sell: 6, icon: 'honey', desc: 'Sticky and sweet; a common binding agent.' },
  brinesalt: { name: 'Brinesalt', kind: 'material', rarity: 1, buy: 30, sell: 4, icon: 'salt', desc: 'Coarse harbour salt. Stabilises volatile mixtures.' },
  ironOre: { name: 'Iron Ore', kind: 'material', rarity: 1, buy: 90, sell: 12, icon: 'ore-grey', desc: 'Workable ore. The backbone of every forge.' },
  crimsonOre: { name: 'Crimson Ore', kind: 'material', rarity: 3, buy: null, sell: 45, icon: 'ore-red', desc: 'Heat-tempered ore veined with red metal.' },
  stormquartz: { name: 'Stormquartz', kind: 'material', rarity: 4, buy: null, sell: 120, icon: 'crystal', desc: 'A crackling crystal formed where lightning strikes rock.' },
  monsterBone: { name: 'Monster Bone', kind: 'material', rarity: 1, buy: 70, sell: 10, icon: 'bone', desc: 'Sturdy bone from the field. Used in sturdy hafts and frames.' },
  // Varkhul, the Emberhide
  vk_scale: { name: 'Emberhide Scale', kind: 'material', rarity: 2, buy: null, sell: 40, icon: 'scale-red', desc: 'A heat-scarred scale from Varkhul.' },
  vk_hide: { name: 'Emberhide Plate', kind: 'material', rarity: 3, buy: null, sell: 85, icon: 'plate-red', desc: 'Thick dorsal plating. Holds heat for hours.' },
  vk_horn: { name: 'Emberhide Horn', kind: 'material', rarity: 3, buy: null, sell: 140, icon: 'horn', desc: 'Broken from Varkhul\'s crest. Prized by smiths.' },
  vk_tail: { name: 'Emberhide Tailclub', kind: 'material', rarity: 3, buy: null, sell: 130, icon: 'club', desc: 'The spiked club of Varkhul\'s tail.' },
  vk_talon: { name: 'Emberhide Talon', kind: 'material', rarity: 2, buy: null, sell: 60, icon: 'claw', desc: 'A foreleg talon, still warm.' },
  vk_gem: { name: 'Ember Heartstone', kind: 'material', rarity: 6, buy: null, sell: 900, icon: 'gem-red', desc: 'A rare stone grown in Varkhul\'s furnace-heart.' },
  // Cindral, the Ashwing
  cw_scale: { name: 'Ashwing Scale', kind: 'material', rarity: 3, buy: null, sell: 70, icon: 'scale-dark', desc: 'Soot-black scale veined with ember light.' },
  cw_membrane: { name: 'Ashwing Membrane', kind: 'material', rarity: 4, buy: null, sell: 160, icon: 'membrane', desc: 'Torn wing membrane, light as cloth and twice as tough.' },
  cw_fang: { name: 'Ashwing Fang', kind: 'material', rarity: 4, buy: null, sell: 150, icon: 'fang', desc: 'Broken from Cindral\'s jaw.' },
  cw_barb: { name: 'Ashwing Tail Barb', kind: 'material', rarity: 4, buy: null, sell: 150, icon: 'barb', desc: 'A venomous barb. Handle with gloves.' },
  cw_gland: { name: 'Volatile Rockgland', kind: 'material', rarity: 4, buy: null, sell: 110, icon: 'gland', desc: 'The organ that forms Cindral\'s rock bombs. Unstable.' },
  cw_gem: { name: 'Ashwing Cinderpearl', kind: 'material', rarity: 7, buy: null, sell: 1500, icon: 'gem-orange', desc: 'A pearl of compressed ash and fire. Extremely rare.' },
  // Gorvath, the Cinderfist
  gv_plate: { name: 'Cinderfist Plate', kind: 'material', rarity: 5, buy: null, sell: 180, icon: 'plate-navy', desc: 'Soot-blackened armour plate, heavy as an anvil.' },
  gv_knuckle: { name: 'Cinderfist Knuckle', kind: 'material', rarity: 5, buy: null, sell: 260, icon: 'knuckle', desc: 'Shattered knuckle-plate from a broken fist.' },
  gv_horn: { name: 'Cinderfist Horn', kind: 'material', rarity: 5, buy: null, sell: 260, icon: 'horn-dark', desc: 'A coil of Gorvath\'s ram horn.' },
  gv_tail: { name: 'Cinderfist Tailclub', kind: 'material', rarity: 5, buy: null, sell: 240, icon: 'club-dark', desc: 'Its tail club, crusted with cooled cinder.' },
  gv_slag: { name: 'Molten Slag', kind: 'material', rarity: 4, buy: null, sell: 120, icon: 'slag', desc: 'Cooled cinder growth. Still faintly warm.' },
  gv_core: { name: 'Critical Core', kind: 'material', rarity: 7, buy: null, sell: 2200, icon: 'gem-white', desc: 'A white-hot heart of cinder that never cools.' },
};

// ---------------------------------------------------------------- skills
// Each skill has max points; effects are applied by the field runtime/player.
export const SKILLS = {
  attackBoost: { name: 'Attack Boost', max: 5, desc: '+3% attack per level.' },
  critEye: { name: 'Keen Eye', max: 5, desc: '+5% affinity per level.' },
  healthBoost: { name: 'Vitality', max: 3, desc: '+15 max health per level.' },
  constitution: { name: 'Endurance', max: 3, desc: '−12% stamina use per level.' },
  heatward: { name: 'Heatward', max: 3, desc: 'Burn lasts 30% shorter per level; fire damage −5% per level.' },
  blastward: { name: 'Blastward', max: 3, desc: 'Blastblight fuse +3 s per level; at 3, immune.' },
  antivenom: { name: 'Antivenom', max: 3, desc: 'Poison drains 30% slower per level; at 3, immune.' },
  steadfast: { name: 'Steadfast', max: 3, desc: 'Roar and wind-pressure stuns −30% per level.' },
  sharpEdge: { name: 'Honed Edge', max: 3, desc: 'Sharpness falls 25% slower per level.' },
};

// ---------------------------------------------------------------- weapons (greatswords)
// attack: raw (480 = baseline multiplier 1.0). affinity %. element {type, value}. sharp: whetstone cap (0.8..1.2).
// levels[]: index 0 = forged; each upgrade level lists its stats and the cost to reach it.
// next: weapons this line can be upgraded INTO from its final level (branch).
const w = (attack, affinity = 0, element = null, sharp = 1, cost = null) => ({ attack, affinity, element, sharp, cost });
export const WEAPONS = {
  marrowcleaver: { name: 'Marrowcleaver', rarity: 1, effect: 'A dependable bone-and-iron cleaver.', craft: null,
    levels: [w(480), w(528, 0, null, 1, { coins: 300, mats: { ironOre: 4, monsterBone: 2 } }), w(576, 0, null, 1.05, { coins: 900, mats: { ironOre: 6, crimsonOre: 2, monsterBone: 3 } })] },
  emberhideBlade: { name: 'Emberhide Greatblade', rarity: 3, effect: 'Its edge glows dull red after every swing.',
    craft: { coins: 2400, mats: { vk_scale: 5, vk_horn: 1, ironOre: 6 } },
    levels: [w(624, 0, { type: 'fire', value: 240 }, 1.05), w(672, 0, { type: 'fire', value: 300 }, 1.05, { coins: 4200, mats: { vk_hide: 3, vk_tail: 1, crimsonOre: 3 } }), w(720, 5, { type: 'fire', value: 360 }, 1.1, { coins: 7500, mats: { vk_gem: 1, crimsonOre: 5, vk_talon: 3 } })] },
  tideglassBlade: { name: 'Tideglass Greatsword', rarity: 3, effect: 'Water element. Cools cinder growths on contact.',
    craft: { coins: 3200, mats: { tidecap: 6, stormquartz: 1, vk_scale: 4, ironOre: 5 } },
    levels: [w(576, 0, { type: 'water', value: 320 }, 1.1), w(624, 0, { type: 'water', value: 380 }, 1.1, { coins: 5200, mats: { tidecap: 8, stormquartz: 2, cw_scale: 4 } }), w(672, 0, { type: 'water', value: 450 }, 1.15, { coins: 9000, mats: { stormquartz: 4, cw_membrane: 2, gv_slag: 3 } })] },
  ashwingRender: { name: 'Ashwing Rendblade', rarity: 4, effect: 'Blast element. Volatile glands packed into the spine.',
    craft: { coins: 4200, mats: { cw_scale: 5, cw_membrane: 1, cw_gland: 2, crimsonOre: 3 } },
    levels: [w(600, 10, { type: 'blast', value: 300 }, 1.05), w(648, 15, { type: 'blast', value: 360 }, 1.1, { coins: 6800, mats: { cw_fang: 1, cw_barb: 1, cw_gland: 2 } }), w(696, 20, { type: 'blast', value: 420 }, 1.15, { coins: 11000, mats: { cw_gem: 1, stormquartz: 3, cw_membrane: 2 } })] },
  cinderfistCrusher: { name: 'Cinderfist Crusher', rarity: 6, effect: 'Critical Surge: hits on white-hot parts deal +15% damage.',
    craft: { coins: 9000, mats: { gv_plate: 4, gv_knuckle: 2, gv_horn: 1, crimsonOre: 6 } },
    levels: [w(768, -15, { type: 'blast', value: 420 }, 1.1), w(816, -10, { type: 'blast', value: 480 }, 1.15, { coins: 14000, mats: { gv_tail: 1, gv_slag: 4, stormquartz: 3 } }), w(864, -5, { type: 'blast', value: 540 }, 1.2, { coins: 22000, mats: { gv_core: 1, gv_knuckle: 2, vk_gem: 1 } })] },
};
export const STARTER_WEAPON = 'marrowcleaver';

// ---------------------------------------------------------------- armour
export const ARMOR_SLOTS = ['head', 'chest', 'arms', 'waist', 'legs'];
const SLOT_NAMES = { head: 'Helm', chest: 'Mail', arms: 'Vambraces', waist: 'Coil', legs: 'Greaves' };
// Armour sets: base defence per piece, +def per upgrade level, resistances, per-piece skills, craft cost per piece.
const ARMOR_SETS = {
  leather: { name: "Hunter's", rarity: 1, def: 8, perLv: 2, maxLv: 3, res: { fire: 0, water: 0, thunder: 0, ice: 0, dragon: 0 }, skills: { head: { constitution: 1 }, chest: {}, arms: {}, waist: { healthBoost: 1 }, legs: {} }, craft: null, upMats: { monsterBone: 1 }, upCoins: 120 },
  iron: { name: 'Ironclad', rarity: 2, def: 18, perLv: 3, maxLv: 4, res: { fire: 0, water: 1, thunder: -2, ice: 1, dragon: 0 }, skills: { head: { steadfast: 1 }, chest: { healthBoost: 1 }, arms: { sharpEdge: 1 }, waist: { steadfast: 1 }, legs: { constitution: 1 } }, craft: { coins: 500, mats: { ironOre: 4, monsterBone: 2 } }, upMats: { ironOre: 2 }, upCoins: 250 },
  emberhide: { name: 'Emberhide', rarity: 3, def: 30, perLv: 4, maxLv: 5, res: { fire: 4, water: -3, thunder: 0, ice: -2, dragon: 1 }, skills: { head: { attackBoost: 1 }, chest: { heatward: 1, attackBoost: 1 }, arms: { critEye: 1 }, waist: { heatward: 1 }, legs: { attackBoost: 1, heatward: 1 } }, craft: { coins: 1400, mats: { vk_scale: 3, vk_hide: 1, ironOre: 2 } }, upMats: { vk_scale: 1, crimsonOre: 1 }, upCoins: 600 },
  ashwing: { name: 'Ashwing', rarity: 4, def: 42, perLv: 5, maxLv: 5, res: { fire: 3, water: 0, thunder: -3, ice: 1, dragon: 0 }, skills: { head: { critEye: 1 }, chest: { antivenom: 1, critEye: 1 }, arms: { antivenom: 1 }, waist: { blastward: 1 }, legs: { critEye: 1, steadfast: 1 } }, craft: { coins: 2600, mats: { cw_scale: 3, cw_membrane: 1, crimsonOre: 2 } }, upMats: { cw_scale: 1, stormquartz: 1 }, upCoins: 1100 },
  cinderfist: { name: 'Cinderfist', rarity: 6, def: 60, perLv: 6, maxLv: 6, res: { fire: 5, water: -4, thunder: 2, ice: -2, dragon: 2 }, skills: { head: { blastward: 1, attackBoost: 1 }, chest: { healthBoost: 1, attackBoost: 1 }, arms: { blastward: 1, critEye: 1 }, waist: { attackBoost: 1 }, legs: { steadfast: 1, healthBoost: 1 } }, craft: { coins: 5200, mats: { gv_plate: 2, gv_slag: 2, crimsonOre: 3 } }, upMats: { gv_slag: 1, stormquartz: 1 }, upCoins: 2200 },
};
// Expand sets into per-piece definitions: id = `${set}_${slot}`.
export const ARMOR = {};
for (const [setId, s] of Object.entries(ARMOR_SETS)) {
  for (const slot of ARMOR_SLOTS) {
    // chest/legs cost a little more; extra signature material per slot for monster sets
    const k = slot === 'chest' || slot === 'legs' ? 1.25 : 1;
    ARMOR[`${setId}_${slot}`] = {
      set: setId, slot, name: `${s.name} ${SLOT_NAMES[slot]}`, rarity: s.rarity, def: s.def, perLv: s.perLv, maxLv: s.maxLv, res: s.res, skills: s.skills[slot] || {},
      craft: s.craft ? { coins: Math.round(s.craft.coins * k / 10) * 10, mats: Object.fromEntries(Object.entries(s.craft.mats).map(([m, q]) => [m, Math.max(1, Math.round(q * k))])) } : null,
      upgrade: (lv) => ({ coins: Math.round(s.upCoins * (1 + lv * 0.6) / 10) * 10, mats: Object.fromEntries(Object.entries(s.upMats).map(([m, q]) => [m, q + Math.floor(lv / 2)])) }),
    };
  }
}
export const STARTER_ARMOR = ARMOR_SLOTS.map((s) => `leather_${s}`);

// ---------------------------------------------------------------- alchemy recipes
// unlock: null (known from start) | { hr } | { slain: monster } | { quest: id }
export const RECIPES = {
  potion: { out: ['potion', 1], in: { sunpetal: 1, glowcap: 1 }, coins: 5, unlock: null },
  megaPotion: { out: ['megaPotion', 1], in: { potion: 1, honey: 1 }, coins: 15, unlock: null },
  antidote: { out: ['antidote', 1], in: { tidecap: 1, sunpetal: 1 }, coins: 5, unlock: null },
  energyDrink: { out: ['energyDrink', 1], in: { tidecap: 1, honey: 1 }, coins: 10, unlock: { hr: 2 } },
  coolingSalve: { out: ['coolingSalve', 1], in: { tidecap: 1, brinesalt: 1 }, coins: 10, unlock: { slain: 'varkhul' } },
  quenchFlask: { out: ['quenchFlask', 1], in: { tidecap: 1, brinesalt: 1, glowcap: 1 }, coins: 20, unlock: { quest: 'q_gv1' } },
  mightSeed: { out: ['mightSeed', 1], in: { sunpetal: 2, vk_scale: 1 }, coins: 30, unlock: { slain: 'varkhul' } },
  adamantSeed: { out: ['adamantSeed', 1], in: { ironOre: 1, glowcap: 2 }, coins: 30, unlock: { hr: 2 } },
  flashPod: { out: ['flashPod', 2], in: { stormquartz: 1, honey: 1 }, coins: 40, unlock: { hr: 3 } },
  tranqBomb: { out: ['tranqBomb', 2], in: { glowcap: 2, honey: 1 }, coins: 25, unlock: { hr: 2 } },
  snareCoil: { out: ['snareCoil', 1], in: { ironOre: 2, cw_membrane: 1 }, coins: 80, unlock: { slain: 'wyvern' } },
  ancientDraught: { out: ['ancientDraught', 1], in: { megaPotion: 2, cw_gem: 1 }, coins: 300, unlock: { hr: 5 } },
};

// ---------------------------------------------------------------- monsters (rewards & weaknesses)
export const MONSTERS = {
  varkhul: { name: 'Varkhul, the Emberhide', hunt: 'varkhul', weakness: { water: 1.3, ice: 1.15, thunder: 1.0, fire: 0.5, dragon: 0.9, blast: 1.0 },
    carves: [['vk_scale', 40], ['vk_hide', 22], ['vk_talon', 20], ['monsterBone', 15], ['vk_gem', 3]], breaks: { head: 'vk_horn', tail: 'vk_tail', forelegs: 'vk_talon', back: 'vk_hide' }, coins: 900 },
  wyvern: { name: 'Cindral, the Ashwing', hunt: 'wyvern', weakness: { water: 1.25, ice: 1.2, thunder: 1.1, fire: 0.4, dragon: 1.0, blast: 1.0 },
    carves: [['cw_scale', 40], ['cw_gland', 22], ['cw_membrane', 15], ['crimsonOre', 18], ['cw_gem', 2]], breaks: { head: 'cw_fang', wings: 'cw_membrane', tail: 'cw_barb' }, coins: 1600 },
  brute: { name: 'Gorvath, the Cinderfist', hunt: 'brute', weakness: { water: 1.35, ice: 1.25, thunder: 0.9, fire: 0.3, dragon: 1.1, blast: 0.8 },
    carves: [['gv_plate', 38], ['gv_slag', 30], ['gv_knuckle', 14], ['crimsonOre', 16], ['gv_core', 2]], breaks: { head: 'gv_horn', fistL: 'gv_knuckle', fistR: 'gv_knuckle', tail: 'gv_tail' }, coins: 2800 },
};

// ---------------------------------------------------------------- quests
// type: slay | hunt (slay or capture) | deliver (turn in materials at the counter) | gather | survey | elite
// objectives (all must be met): {k:'slay'} {k:'slayOrCapture'} {k:'gather', item, qty} {k:'deliver', item, qty}
//   {k:'break', parts:[...]} {k:'noFaint'} {k:'within', s}
// minClear: minimum plausible seconds (server anti-cheat). maxFaints: fail after this many faints.
export const QUESTS = {
  q_gather_intro: { name: 'Herbs of the Meadow', type: 'gather', stars: 1, reqHR: 1, monster: 'varkhul', ambient: true, timeLimit: 900, maxFaints: 3, minClear: 30,
    desc: 'The atelier is short on draught ingredients. Gather Sunpetal Herbs and Glowcaps in the meadow — and keep clear of the Emberhide that roams there.',
    objectives: [{ k: 'gather', item: 'sunpetal', qty: 6 }, { k: 'gather', item: 'glowcap', qty: 3 }], coins: 300, xp: 80, rewards: [['potion', 3, 100], ['honey', 2, 60]] },
  q_ore: { name: 'Iron for the Forge', type: 'gather', stars: 1, reqHR: 1, monster: 'varkhul', ambient: true, timeLimit: 900, maxFaints: 3, minClear: 30,
    desc: 'Master Borrik needs ore before the next convoy sails. Mine Iron Ore from the outcrops around the meadow.',
    objectives: [{ k: 'gather', item: 'ironOre', qty: 5 }], coins: 350, xp: 90, rewards: [['ironOre', 2, 100], ['monsterBone', 2, 70]] },
  q_vk1: { name: 'Emberhide Awakens', type: 'slay', stars: 2, reqHR: 1, monster: 'varkhul', timeLimit: 3000, maxFaints: 3, minClear: 90,
    desc: 'A heat-scarred beast is scorching the trade road. Slay Varkhul, the Emberhide.',
    objectives: [{ k: 'slay' }], coins: 1200, xp: 260, rewards: [['vk_scale', 2, 100], ['potion', 2, 100]] },
  q_deliver_scales: { name: 'Scales for the Smith', type: 'deliver', stars: 2, reqHR: 1, monster: null, prereq: ['q_vk1'],
    desc: 'Borrik wants to test Emberhide scales in the furnace. Deliver them to the guild counter.',
    objectives: [{ k: 'deliver', item: 'vk_scale', qty: 3 }, { k: 'deliver', item: 'ironOre', qty: 3 }], coins: 1500, xp: 140, rewards: [['crimsonOre', 2, 100]] },
  q_gather_rare: { name: 'Stormquartz Vein', type: 'gather', stars: 3, reqHR: 2, monster: 'varkhul', ambient: true, timeLimit: 1200, maxFaints: 3, minClear: 40,
    desc: 'Surveyors report lightning-struck rock north of the meadow. Bring back Stormquartz and Crimson Ore.',
    objectives: [{ k: 'gather', item: 'stormquartz', qty: 2 }, { k: 'gather', item: 'crimsonOre', qty: 4 }], coins: 900, xp: 200, rewards: [['stormquartz', 1, 60]] },
  q_vk_hunt: { name: 'Bring Down the Emberhide', type: 'hunt', stars: 3, reqHR: 2, monster: 'varkhul', timeLimit: 3000, maxFaints: 3, minClear: 90, prereq: ['q_vk1'],
    desc: 'The guild wants Varkhul alive for study — or dead, if it must be. Slay or capture it.',
    objectives: [{ k: 'slayOrCapture' }], coins: 1800, xp: 340, rewards: [['vk_hide', 1, 100], ['vk_scale', 2, 100]] },
  q_survey_unbroken: { name: 'Survey: Unbroken', type: 'survey', stars: 3, reqHR: 2, monster: 'varkhul', timeLimit: 1800, maxFaints: 1, minClear: 90, prereq: ['q_vk1'],
    desc: 'Prove your discipline: slay Varkhul within 15 minutes without fainting once.',
    objectives: [{ k: 'slay' }, { k: 'noFaint' }, { k: 'within', s: 900 }], coins: 2200, xp: 380, rewards: [['crimsonOre', 2, 100], ['vk_gem', 1, 8]] },
  q_cw1: { name: 'Ashes on the Wind', type: 'slay', stars: 4, reqHR: 3, monster: 'wyvern', timeLimit: 3000, maxFaints: 3, minClear: 120, prereq: ['q_vk1'],
    desc: 'Ships are being bombed off the coast by a winged terror. Slay Cindral, the Ashwing.',
    objectives: [{ k: 'slay' }], coins: 2600, xp: 520, rewards: [['cw_scale', 2, 100], ['megaPotion', 1, 100]] },
  q_survey_wings: { name: 'Survey: Clipped Wings', type: 'survey', stars: 4, reqHR: 3, monster: 'wyvern', timeLimit: 3000, maxFaints: 3, minClear: 120, prereq: ['q_cw1'],
    desc: 'Scholars need samples. Break Cindral\'s wings and tail, then slay it.',
    objectives: [{ k: 'break', parts: ['wings', 'tail'] }, { k: 'slay' }], coins: 3200, xp: 600, rewards: [['cw_membrane', 1, 100], ['cw_barb', 1, 100]] },
  q_cw_hunt: { name: 'Grounding the Ashwing', type: 'hunt', stars: 5, reqHR: 4, monster: 'wyvern', timeLimit: 3000, maxFaints: 3, minClear: 120, prereq: ['q_cw1'],
    desc: 'Slay or capture Cindral before the trade fleet sails.',
    objectives: [{ k: 'slayOrCapture' }], coins: 3600, xp: 700, rewards: [['cw_gland', 2, 100], ['cw_gem', 1, 5]] },
  q_elite_vk: { name: 'Tempered Emberhide', type: 'elite', stars: 5, reqHR: 4, monster: 'varkhul', tempered: 1.6, timeLimit: 3000, maxFaints: 2, minClear: 150, prereq: ['q_vk_hunt'],
    desc: 'A battle-hardened Varkhul with a hide like forged iron. Only seasoned hunters may apply.',
    objectives: [{ k: 'slay' }], coins: 4800, xp: 900, rewards: [['vk_gem', 1, 30], ['vk_hide', 2, 100]] },
  q_gv1: { name: 'The Cinderfist', type: 'slay', stars: 6, reqHR: 5, monster: 'brute', timeLimit: 3000, maxFaints: 3, minClear: 180, prereq: ['q_cw1'],
    desc: 'The ground shakes beyond the cliffs. A colossal brute wreathed in cinder has woken. Slay Gorvath.',
    objectives: [{ k: 'slay' }], coins: 5200, xp: 1200, rewards: [['gv_plate', 2, 100], ['gv_slag', 2, 100]] },
  q_elite_gv: { name: 'Last Stand of the Cinderfist', type: 'elite', stars: 7, reqHR: 6, monster: 'brute', tempered: 1.5, timeLimit: 3000, maxFaints: 2, minClear: 240, prereq: ['q_gv1'],
    desc: 'A tempered Gorvath, burning itself out in fury. Survive its final rage — and end it.',
    objectives: [{ k: 'slay' }], coins: 9000, xp: 2000, rewards: [['gv_core', 1, 25], ['gv_knuckle', 2, 100]] },
};

// ---------------------------------------------------------------- shop
// stock: per-player stock that refills every `restockMinutes`.
export const SHOP = {
  restockMinutes: 30,
  stock: { potion: 20, antidote: 10, energyDrink: 5, flashPod: 3, snareCoil: 1, tranqBomb: 4, sunpetal: 20, honey: 10, brinesalt: 10, ironOre: 8, monsterBone: 8 },
};

// ---------------------------------------------------------------- progression
export const HR_XP = [0, 0, 300, 800, 1600, 2800, 4500, 7000, 10500]; // cumulative xp needed for HR index
export const hrForXp = (xp) => { let hr = 1; for (let i = 2; i < HR_XP.length; i++) if (xp >= HR_XP[i]) hr = i; return hr; };
export const POUCH = { slots: 16 };
export const START = { coins: 1500, box: { potion: 5, sunpetal: 3, glowcap: 2, honey: 2 }, pouch: { potion: 5 } };

// ---------------------------------------------------------------- derived helpers (pure)
export const weaponStats = (defId, lv) => { const d = WEAPONS[defId]; if (!d) return null; const L = d.levels[Math.min(lv, d.levels.length - 1)]; return { ...L, rarity: d.rarity, name: d.name, maxLv: d.levels.length - 1, effect: d.effect }; };
export const armorStats = (defId, lv) => { const d = ARMOR[defId]; if (!d) return null; return { def: d.def + d.perLv * lv, res: d.res, skills: d.skills, rarity: d.rarity, name: d.name, slot: d.slot, maxLv: d.maxLv }; };
export const nextWeaponCost = (defId, lv) => WEAPONS[defId]?.levels[lv + 1]?.cost || null;
export const nextArmorCost = (defId, lv) => { const d = ARMOR[defId]; if (!d || lv >= d.maxLv) return null; return d.upgrade(lv); };
// Totals for a loadout: { attack, affinity, element, sharp, defense, res, skills }
export function loadoutStats(equipList, loadout) {
  const byUid = Object.fromEntries((equipList || []).map((e) => [e.uid, e]));
  const out = { attack: 480, affinity: 0, element: null, sharp: 1, defense: 0, res: { fire: 0, water: 0, thunder: 0, ice: 0, dragon: 0 }, skills: {} };
  const we = byUid[loadout?.weapon]; if (we && WEAPONS[we.def]) Object.assign(out, (({ attack, affinity, element, sharp }) => ({ attack, affinity, element, sharp }))(weaponStats(we.def, we.lvl)));
  for (const slot of ARMOR_SLOTS) {
    const a = byUid[loadout?.[slot]]; if (!a || !ARMOR[a.def]) continue; const s = armorStats(a.def, a.lvl);
    out.defense += s.def; for (const k in s.res) out.res[k] += s.res[k]; for (const [sk, p] of Object.entries(s.skills)) out.skills[sk] = Math.min(SKILLS[sk].max, (out.skills[sk] || 0) + p);
  }
  return out;
}
export function recipeUnlocked(r, save) {
  const u = r.unlock; if (!u) return true;
  if (u.hr) return (save.profile?.hr || 1) >= u.hr;
  if (u.slain) return (save.hunts?.[u.slain]?.slain || 0) + (save.hunts?.[u.slain]?.captured || 0) > 0;
  if (u.quest) return (save.quests?.cleared?.[u.quest] || 0) > 0;
  return false;
}
export const unlockText = (u) => (!u ? '' : u.hr ? `Reach Hunter Rank ${u.hr}` : u.slain ? `Hunt ${MONSTERS[u.slain]?.name || u.slain}` : u.quest ? `Clear "${QUESTS[u.quest]?.name}"` : 'Locked');
export function questAvailable(qid, save) {
  const q = QUESTS[qid]; if (!q) return { ok: false, why: 'Unknown quest' };
  if ((save.profile?.hr || 1) < q.reqHR) return { ok: false, why: `Requires Hunter Rank ${q.reqHR}` };
  for (const p of q.prereq || []) if (!(save.quests?.cleared?.[p] > 0)) return { ok: false, why: `Clear "${QUESTS[p].name}" first` };
  return { ok: true };
}

// ---------------------------------------------------------------- world map destinations (expeditions)
// Each destination is one hunting field. `field` selects the field layout in src/world (createWorld reads
// game.fieldId), `monster` the boss that lives there. map: normalised position on the world map (0..1).
// Quests travel to the destination of their monster (destForMonster); free expeditions pick any destination.
export const DESTINATIONS = {
  ember_foothills: { monster: 'varkhul', field: 'foothills', name: 'Emberfall Foothills', region: 'The Cinder Reach', map: { x: 0.585, y: 0.64 }, danger: 2, recHR: 1,
    desc: 'The open flanks of Mount Kaldrith: black lava plains, steaming vents and old basalt ridges under a smouldering summit. Varkhul hunts the foothills.' },
  ashfang_wastes: { monster: 'wyvern', field: 'wastes', name: 'Ashfang Wastes', region: 'The Cinder Reach', map: { x: 0.69, y: 0.5 }, danger: 4, recHR: 3,
    desc: 'An ash-choked badland of lava moats, toppled rock pillars and broken stone bridges, where Cindral bombs anything that moves from the sky.' },
  cinderdeep_hollow: { monster: 'brute', field: 'hollow', name: 'Cinderdeep Hollow', region: 'The Cinder Reach', map: { x: 0.55, y: 0.44 }, danger: 6, recHR: 5,
    desc: 'A vast cavern beneath the volcano, lit by lavafalls and choked with steam. The ground trembles with Gorvath\'s footsteps.' },
};
export const destForMonster = (m) => Object.keys(DESTINATIONS).find((k) => DESTINATIONS[k].monster === m) || 'ember_foothills';
export const FREE_EXPEDITION = { timeLimit: 3000, minClear: 20, slayMinClear: 60, gatherCap: 10 };

// Field-guide entries (shown in the world map's boss details). Facts mirror the implemented AI in src/monster.
export const MONSTER_INFO = {
  varkhul: { danger: 2, recHR: 1, size: '≈16 m', habitat: 'ember_foothills', element: 'fire',
    desc: 'A heat-scarred quadruped wyvern with an armoured crest, a spiked club tail and ember vents along its back that blaze when it is enraged.',
    traits: ['Enrages below 50% health: faster, vents blaze, new combos', 'Limps when below 20% health', 'Tires after long fights — exhausted, its breath fizzles', 'Tail can be severed; horn, forelegs and back can be broken'],
    attacks: ['Bite', '360° tail sweep', 'Charge', 'Leap slam', 'Fire breath cone (burns)', 'Roar (stuns nearby hunters)'] },
  wyvern: { danger: 4, recHR: 3, size: '≈16 m wingspan', habitat: 'ashfang_wastes', element: 'fire',
    desc: 'A flying wyvern that rains timed rock bombs from the air and detonates them with fire or its jaws.',
    traits: ['Fights mostly in the air; lands to bite or when exhausted', 'Breaking its wings or tail sends it crashing down', 'Glare Pods ground it', 'Inflicts burns and deadly poison'],
    attacks: ['Hover rock-bombing (timed blasts)', 'Forced detonation (fireball or bite)', 'Back-jump rock spit', 'Great roar → follow-up', 'Dragon wind pressure (long stun)', 'Sweeping breath (burning ground)', 'Chained talon dives (deadly poison)'] },
  brute: { danger: 6, recHR: 5, size: '≈6 m at the shoulder', habitat: 'cinderdeep_hollow', element: 'fire',
    desc: 'A colossal knuckle-walking brute. Molten cinder growths on its brow, fists and tail heat to white-hot and tear off as bombs.',
    traits: ['Growths turn critical when heated or struck', 'Hitting a hot growth makes it drop and explode (blastblight)', 'Water/ice weapons cool the growths', 'Below 35%: seals the arena — final stand', 'Burns itself with its own blasts'],
    attacks: ['Fist slam / double slam', 'Sweeping backhand', 'Brow slam', 'Leap slam', 'Tail swipe', 'Charge', 'Cinder sea pools', 'Cataclysm — chained detonation of every pool'] },
};
