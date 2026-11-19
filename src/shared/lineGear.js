// Material lines: about ten weapons per class (user request). Each line is one monster's materials and gives its
// weapons a character (design document §11: fire / poison / hardness / keen edge / weight …). Every class gets the lines
// it does not already have from classGear.js / islandGear.js, always including the Volcano Slime line (Calamity), whose
// materials only come from driving back the hidden world boss (server/volcano.js).
// Generated deterministically, merged into WEAPONS by gamedata.js; JA names go into the ja pack.
import { CLASS_IDS } from './weaponClasses.js';
import { CLASS_WEAPONS } from './classGear.js';
import { ISLAND_WEAPONS } from './islandGear.js';

const w = (attack, affinity = 0, element = null, sharp = 1, cost = null) => ({ attack, affinity, element, sharp, cost });
// id, ja prefix, en prefix, rarity, base attack, affinity, element, sharpness, craft mats, lv2 mats, lv3 mats
export const LINES = [
  ['carapace', '甲殻の', 'Carapace', 2, 552, 0, null, 1.15, { mb_shell: 3, mb_shard: 2 }, { mb_shell: 3 }, { mb_core: 1, mb_mandible: 1 }],
  ['ashfeather', '灰羽の', 'Ashfeather', 3, 576, 15, null, 1.0, { ab_feather: 3, ab_beak: 1 }, { ab_feather: 2 }, { ab_core: 1, ab_flight: 1 }],
  ['packfang', '群狼の', 'Packfang', 3, 600, 15, null, 1.05, { mw_fang: 3, mw_pelt: 2 }, { mw_fang: 2, mw_core: 1 }, { mw_fang_l: 1, mw_pelt_l: 1 }],
  ['crystal', '結晶の', 'Crystal', 4, 640, 0, null, 1.2, { cb_crystal: 3, cb_hide: 2 }, { cb_crystal: 3, cb_tusk: 1 }, { cb_tusk_great: 1, cb_crystal_l: 1 }],
  ['bedrock', '岩盤の', 'Bedrock', 4, 664, -5, null, 1.05, { sm_plate: 3, sm_claw: 1 }, { sm_plate: 2, sm_ore: 2 }, { sm_plate_l: 1, sm_claw_l: 1 }],
  ['lavaserpent', '溶蛇の', 'Lavaserpent', 4, 624, 5, { type: 'fire', value: 300 }, 1.05, { ls_shell: 3, ls_magma: 2 }, { ls_shell: 3, ls_magma: 2 }, { ls_core: 1, ls_fang: 1 }],
  ['golemstone', '岩塊の', 'Golemstone', 5, 720, -10, null, 1.0, { bg_stone: 4, bg_ore: 2 }, { bg_stone: 4, bg_ore: 2 }, { bg_core: 1, sm_plate_l: 1 }],
  ['flamedragon', '火焔龍の', 'Flame Dragon', 5, 690, 5, { type: 'fire', value: 420 }, 1.1, { fd_scale: 3, fd_claw: 2, fd_flame_sac: 1 }, { fd_shell: 3, fd_fang: 1 }, { fd_tail: 1, fd_membrane: 1 }],
  ['venomfang', '毒牙龍の', 'Venom-fang', 5, 672, 5, { type: 'poison', value: 380 }, 1.1, { vd_scale: 3, vd_fang: 1, vd_venom_sac: 1 }, { vd_shell: 3, vd_tail: 1 }, { vd_gem: 1, vd_venom_sac: 1 }],
  ['empress', '猛毒姫の', "Empress's", 7, 792, 10, { type: 'poison', value: 560 }, 1.2, { cy_scale: 3, cy_fang: 1, cy_venom_sac: 1 }, { cy_shell: 3, cy_tail: 1 }, { cy_gem: 1, cy_membrane: 1 }],
  ['emberhide', '燼皮の', 'Emberhide', 3, 624, 0, { type: 'fire', value: 240 }, 1.05, { vk_scale: 4, vk_horn: 1 }, { vk_hide: 3, vk_tail: 1 }, { vk_gem: 1, vk_talon: 2 }],
  ['ashwing', '燼翼の', 'Ashwing', 4, 600, 15, { type: 'blast', value: 300 }, 1.05, { cw_scale: 4, cw_gland: 2 }, { cw_fang: 1, cw_barb: 1 }, { cw_gem: 1, cw_gland: 2 }],
  ['cinderfist', '剛拳の', 'Cinderfist', 6, 768, 0, { type: 'fire', value: 360 }, 1.1, { gv_plate: 3, gv_knuckle: 1, gv_slag: 2 }, { gv_plate: 3, gv_horn: 1 }, { gv_core: 1, gv_tail: 1 }],
  ['calamity', '古災の', 'Calamity', 8, 864, 10, { type: 'fire', value: 680 }, 1.25, { vs_gel: 4, vs_shell: 3, vs_tendril: 1 }, { vs_gel: 4, vs_tendril: 2 }, { vs_core: 1, vs_shell: 3 }],
];
// class noun (JA / EN) used in the weapon name
export const NOUN = {
  greatsword: ['大剣', 'Greatsword'], sword: ['片手剣', 'Sword'], dual: ['双剣', 'Twinblades'], longsword: ['太刀', 'Longblade'], hammer: ['大槌', 'Maul'], lance: ['突槍', 'Lance'], bow: ['弓', 'Bow'],
  tri: ['三刀', 'Triblades'], machete: ['鉈', 'Machete'], mace: ['メイス', 'Mace'], horn: ['戦角笛', 'War Horn'], cannonlance: ['砲槍', 'Cannon Lance'], shiftaxe: ['変形斧', 'Shift Axe'],
  bulwarkaxe: ['蓄力盾斧', 'Bulwark Axe'], staff: ['跳躍棍', 'Vault Staff'], lightxbow: ['軽弩', 'Light Crossbow'], heavyxbow: ['重弩', 'Heavy Crossbow'], pistol: ['拳銃', 'Pistol'], machinegun: ['機関銃', 'Machine Gun'], anchor: ['碇', 'Anchor'],
};
const EFFECT = {
  carapace: ['硬い外殻を重ねた、刃こぼれしにくい作り。', 'Layered shell: hard to chip.'], ashfeather: ['灰羽で軽く仕上げた。会心が出やすい。', 'Light with ash feathers; keen.'],
  packfang: ['群狼の牙を連ねた。会心が出やすい。', 'Pack fangs: keen and quick.'], crystal: ['結晶をまとい、切れ味が長く続く。', 'Crystal-clad; stays sharp.'],
  bedrock: ['重い岩盤で鍛えた。打たれ強い。', 'Forged from bedrock plates: heavy and sturdy.'], lavaserpent: ['溶岩核を封じた。火属性。', 'Fire element from a lava core.'],
  golemstone: ['動く岩から削り出した。攻撃力が高い。', 'Carved from a moving stone: crushing.'], flamedragon: ['火焔龍の素材。強い火属性。', 'Strong fire from the flame dragon.'],
  venomfang: ['毒牙龍の素材。毒属性。', 'Poison from the venom-fang.'], empress: ['猛毒姫の素材。非常に強い毒属性。', 'Very strong poison from the venom empress.'],
  emberhide: ['燼皮の鱗を張った。火属性。', 'Emberhide scale: fire element.'], ashwing: ['燼翼の分泌腺を仕込んだ。爆破属性。', 'Ashwing glands: blast element.'],
  cinderfist: ['剛拳の甲殻で鍛えた。重く熱い。', 'Cinderfist plates: heavy and hot.'], calamity: ['目覚めた災いの身体から得た素材。最強の火属性。', 'From the body of the woken calamity. The strongest fire.'],
};
// lines per class: every class gets eight lines it lacks (rotating so classes differ) + the Calamity line
const TAKEN = new Set(Object.values({ ...ISLAND_WEAPONS, ...CLASS_WEAPONS }).map((v) => v.ja)); // never repeat an existing weapon's name
const PICK = (ci, cls) => { const base = LINES.slice(0, LINES.length - 1); const out = []; for (let k = 0; out.length < 8 && k < base.length; k++) { const L = base[(ci * 3 + k) % base.length]; if (!TAKEN.has(L[1] + NOUN[cls][0])) out.push(L); } return out; };
export const LINE_WEAPONS = {};
CLASS_IDS.forEach((cls, ci) => {
  const lines = cls === 'greatsword' ? [LINES[LINES.length - 1]] : [...PICK(ci, cls), LINES[LINES.length - 1]];
  for (const [id, jaP, enP, rar, atk, aff, el, sh, craft, m2, m3] of lines) {
    const key = `${id}_${cls}`; const coins = 400 + rar * rar * 260;
    const elv = (k) => (el ? { type: el.type, value: el.value + 60 * k } : null);
    LINE_WEAPONS[key] = { cls, line: id, name: `${enP} ${NOUN[cls][1]}`, ja: `${jaP}${NOUN[cls][0]}`, jaEffect: EFFECT[id][0], effect: EFFECT[id][1], rarity: rar,
      craft: { coins, mats: { ...craft, ironOre: rar < 5 ? 2 : 0 } },
      levels: [w(atk, aff, elv(0), sh), w(atk + 48, aff, elv(1), sh, { coins: Math.round(coins * 0.7), mats: m2 }), w(atk + 96, aff + 5, elv(2), +(sh + 0.05).toFixed(2), { coins: Math.round(coins * 1.4), mats: m3 })] };
    if (!LINE_WEAPONS[key].craft.mats.ironOre) delete LINE_WEAPONS[key].craft.mats.ironOre;
  }
});
