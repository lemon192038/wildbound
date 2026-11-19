// Weapon classes (user spec §11-1). One table for every class so balance lives in one place.
// The great sword keeps its original move set in src/player/player.js (ATTACKS); the other classes add theirs here.
//
// Class fields
//   hands      2 (two-handed) · 1 (one-handed, shield in the off hand) · 'dual' (a blade in each hand) · 'bow'
//   dmg        cut | blunt | pierce | ranged
//                blunt  : never glances off hard parts, breaks parts better
//                pierce : glances off only the very hardest parts
//                ranged : arrows; no edge to wear
//   drawT / sheatheT   seconds to draw / sheathe (the hold-to-sheathe input stays 0.45 s; this is the motion length)
//   parry      parry window (s) after releasing the button in the counter stance
//   walk       move speed with the weapon drawn (m/s)
//   breakMul   part-break aptitude: damage to a part's own HP ×breakMul (body damage unchanged)
//   wear       edge wear per hit ×wear
//   guard      null (cannot guard) | 'blade' | 'shield' | 'tower'
//   guardMul   damage taken through the guard · guardPush: knockback through the guard ×
//   roll       roll distance (m) · items: can drink without sheathing
//   light      the light combo opener · heavy: what HEAVY starts (a move, or a charge)
//
// Move fields (same shape as the great sword's ATTACKS in player.js)
//   mv motion value · active [t0, t1] hit window · move [[t0, t1, metres]] · turn: aimable until t
//   next: the light follow-up in the combo window · hnext: the heavy follow-up · combo [t0, t1] · cancel: dodge allowed after
//   stop hitstop · shake camera · slam: ground impact at t · rehit: times the hit list resets (multi-hit)
//   clip: animation (src/player/weaponClips.js) · stam: stamina cost · shoot: [{ t, arrows, spread, mv }] (bow)
export const WEAPON_CLASSES = {
  greatsword: { ja: '大剣', en: 'Great Sword', hands: 2, dmg: 'cut', drawT: 0.72, sheatheT: 0.75, parry: 0.25, walk: 2.7, breakMul: 1.15, wear: 1, guard: 'blade', guardMul: 0.15, guardPush: 1, roll: 3.2, items: false },
  sword: { ja: '片手剣', en: 'Sword & Shield', hands: 1, dmg: 'cut', drawT: 0.36, sheatheT: 0.4, parry: 0.32, walk: 4.0, breakMul: 0.9, wear: 0.8, guard: 'shield', guardMul: 0.22, guardPush: 1.1, roll: 3.4, items: true,
    light: 'sw_1', heavy: 'sw_bash' },
  dual: { ja: '双剣', en: 'Dual Blades', hands: 'dual', dmg: 'cut', drawT: 0.3, sheatheT: 0.35, parry: 0.2, walk: 4.3, breakMul: 0.8, wear: 1.35, guard: null, roll: 3.6, items: false,
    light: 'db_1', heavy: 'db_dance' },
  longsword: { ja: '太刀', en: 'Long Sword', hands: 2, dmg: 'cut', drawT: 0.55, sheatheT: 0.6, parry: 0.35, walk: 3.3, breakMul: 1.0, wear: 1, guard: null, roll: 3.3, items: false,
    light: 'ls_1', heavy: 'ls_thrust', focus: true },
  hammer: { ja: 'ハンマー', en: 'Hammer', hands: 2, dmg: 'blunt', drawT: 0.65, sheatheT: 0.7, parry: 0.2, walk: 3.0, breakMul: 1.5, wear: 0.4, guard: null, roll: 3.1, items: false,
    light: 'hm_1', heavy: 'hcharge' },
  lance: { ja: 'ランス', en: 'Lance', hands: 1, dmg: 'pierce', drawT: 0.6, sheatheT: 0.7, parry: 0.3, walk: 2.2, breakMul: 1.05, wear: 0.9, guard: 'tower', guardMul: 0.06, guardPush: 0.35, roll: 1.8, items: false,
    light: 'ln_1', heavy: 'ln_dash' },
  bow: { ja: '弓', en: 'Bow', hands: 'bow', dmg: 'ranged', drawT: 0.4, sheatheT: 0.45, parry: 0.2, walk: 3.6, breakMul: 0.7, wear: 0, guard: null, roll: 3.4, items: false,
    light: 'bw_quick', heavy: 'bcharge', range: [5, 24], scope: { zoom: 2.2, reticle: 'pins' } },
};
// Damage balance across classes (user request: weapons of the same rank should not differ much in damage). Measured
// sustained damage (light-attack chains, same weapon attack — src/player/__weapons.test.mjs) is brought to ≈155/s for
// melee classes and ≈145/s for ranged ones (they fight from safety). Class identity stays in HOW the damage comes
// (hits, reach, breaks, buffs), not in how much.
export const DMG_SCALE = { greatsword: 0.93, sword: 1.06, dual: 1.11, longsword: 0.93, hammer: 0.735, lance: 1.03, bow: 1.38, tri: 1.17, machete: 1.63, mace: 1.0,
  horn: 0.76, cannonlance: 1.12, shiftaxe: 0.91, bulwarkaxe: 1.21, staff: 0.77, lightxbow: 1.54, heavyxbow: 1.38, pistol: 1.71, machinegun: 1.48, anchor: 0.93 };
export const CLASS_IDS = Object.keys(WEAPON_CLASSES);

// charged moves: hold HEAVY; levels at lv[i] seconds; released into release[level]
export const CHARGES = {
  hcharge: { lv: [0.5, 1.05, 1.6], max: 3, release: ['hm_up', 'hm_up', 'hm_slam', 'hm_spin'], move: 2.6, clip: 'hm_charge', stamina: 6 },
  bcharge: { lv: [0.3, 0.75, 1.25], max: 99, release: ['bw_shot', 'bw_shot', 'bw_shot', 'bw_shot'], move: 1.3, clip: 'bw_draw', stamina: 4 },
};

const M = (o) => ({ turn: 0.1, next: null, combo: [0.3, 0.7], cancel: 0.3, stop: 0.06, shake: 0.2, move: [], ...o });
export const CLASS_MOVES = {
  // ---- sword & shield: quick four-hit chain, shield bash (blunt), backstep-free roll
  sw_1: M({ clip: 'sw_1', mv: 0.17, active: [0.12, 0.22], move: [[0.06, 0.2, 0.5]], next: 'sw_2', hnext: 'sw_bash', combo: [0.2, 0.5], cancel: 0.2, stop: 0.05, shake: 0.15 }),
  sw_2: M({ clip: 'sw_2', mv: 0.17, active: [0.1, 0.2], move: [[0.04, 0.18, 0.4]], next: 'sw_3', hnext: 'sw_bash', combo: [0.18, 0.48], cancel: 0.18, stop: 0.05, shake: 0.15 }),
  sw_3: M({ clip: 'sw_3', mv: 0.2, active: [0.14, 0.26], move: [[0.08, 0.24, 0.5]], next: 'sw_4', combo: [0.24, 0.55], cancel: 0.24, stop: 0.06, shake: 0.2 }),
  sw_4: M({ clip: 'sw_4', mv: 0.3, active: [0.2, 0.44], move: [[0.1, 0.4, 0.9]], rehit: [0.32], combo: [0.5, 0.8], cancel: 0.45, stop: 0.08, shake: 0.32 }),
  sw_bash: M({ clip: 'sw_bash', mv: 0.16, blunt: true, shield: true, active: [0.14, 0.26], move: [[0.05, 0.22, 0.9]], next: 'sw_3', combo: [0.3, 0.6], cancel: 0.3, stop: 0.09, shake: 0.3 }),
  // ---- dual blades: two-blade chains (each swing hits twice), stamina-hungry blade dance
  db_1: M({ clip: 'db_1', mv: 0.09, active: [0.08, 0.24], rehit: [0.16], move: [[0.04, 0.2, 0.5]], next: 'db_2', hnext: 'db_dance', combo: [0.2, 0.42], cancel: 0.16, stop: 0.035, shake: 0.1 }),
  db_2: M({ clip: 'db_2', mv: 0.09, active: [0.08, 0.24], rehit: [0.16], move: [[0.04, 0.2, 0.4]], next: 'db_3', hnext: 'db_dance', combo: [0.2, 0.42], cancel: 0.16, stop: 0.035, shake: 0.1 }),
  db_3: M({ clip: 'db_3', mv: 0.12, active: [0.1, 0.36], rehit: [0.19, 0.28], move: [[0.05, 0.32, 0.7]], next: 'db_1', hnext: 'db_dance', combo: [0.32, 0.6], cancel: 0.25, stop: 0.05, shake: 0.18 }),
  db_dance: M({ clip: 'db_dance', mv: 0.1, stam: 22, active: [0.12, 1.08], rehit: [0.28, 0.44, 0.6, 0.76, 0.92], move: [[0.1, 1.0, 1.6]], turn: 0.12, combo: [1.1, 1.35], next: 'db_1', cancel: 0.9, stop: 0.04, shake: 0.14 }),
  // ---- long sword: flowing slashes that build Focus; heavy = thrust → rising slash; spirit roundslash spends Focus
  ls_1: M({ clip: 'ls_1', mv: 0.24, active: [0.2, 0.32], move: [[0.12, 0.3, 0.7]], next: 'ls_2', hnext: 'ls_thrust', combo: [0.34, 0.75], cancel: 0.3, stop: 0.06, shake: 0.2 }),
  ls_2: M({ clip: 'ls_2', mv: 0.22, active: [0.16, 0.3], move: [[0.08, 0.28, 0.5]], next: 'ls_3', hnext: 'ls_thrust', combo: [0.32, 0.72], cancel: 0.28, stop: 0.06, shake: 0.2 }),
  ls_3: M({ clip: 'ls_3', mv: 0.3, active: [0.22, 0.4], move: [[0.14, 0.36, 0.8]], next: 'ls_1', hnext: 'ls_spirit', combo: [0.45, 0.85], cancel: 0.36, stop: 0.07, shake: 0.26 }),
  ls_thrust: M({ clip: 'ls_thrust', mv: 0.2, pierce: true, active: [0.12, 0.22], move: [[0.04, 0.2, 1.0]], hnext: 'ls_rise', next: 'ls_2', combo: [0.24, 0.6], cancel: 0.24, stop: 0.05, shake: 0.15 }),
  ls_rise: M({ clip: 'ls_rise', mv: 0.24, active: [0.14, 0.3], move: [[0.06, 0.26, 0.3]], next: 'ls_1', hnext: 'ls_spirit', combo: [0.32, 0.7], cancel: 0.3, stop: 0.06, shake: 0.2 }),
  ls_spirit: M({ clip: 'ls_spirit', mv: 0.62, focusCost: 0.5, active: [0.3, 0.52], move: [[0.2, 0.5, 1.1]], combo: [0.8, 1.1], cancel: 0.6, stop: 0.12, shake: 0.5, slam: 0.46 }),
  // ---- hammer: heavy blunt swings; charge while moving (levels 1–3)
  hm_1: M({ clip: 'hm_1', mv: 0.42, blunt: true, active: [0.3, 0.42], move: [[0.2, 0.4, 0.6]], next: 'hm_2', hnext: 'hcharge', combo: [0.5, 0.85], cancel: 0.45, stop: 0.09, shake: 0.32, turn: 0.2 }),
  hm_2: M({ clip: 'hm_2', mv: 0.45, blunt: true, active: [0.28, 0.4], move: [[0.18, 0.38, 0.5]], next: 'hm_3', hnext: 'hcharge', combo: [0.48, 0.82], cancel: 0.45, stop: 0.09, shake: 0.32, turn: 0.18 }),
  hm_3: M({ clip: 'hm_3', mv: 0.75, blunt: true, active: [0.48, 0.6], move: [[0.3, 0.56, 0.7]], combo: [0.9, 1.15], cancel: 0.75, stop: 0.13, shake: 0.6, slam: 0.58, turn: 0.3 }),
  hm_up: M({ clip: 'hm_up', mv: 0.32, blunt: true, active: [0.06, 0.2], move: [[0.02, 0.16, 0.6]], next: 'hm_2', combo: [0.36, 0.7], cancel: 0.36, stop: 0.07, shake: 0.25, turn: 0 }),
  hm_slam: M({ clip: 'hm_slam', mv: 0.6, blunt: true, active: [0.12, 0.24], move: [[0.04, 0.2, 0.8]], next: 'hm_3', combo: [0.5, 0.9], cancel: 0.5, stop: 0.12, shake: 0.5, slam: 0.22, turn: 0 }),
  hm_spin: M({ clip: 'hm_spin', mv: 0.3, blunt: true, active: [0.08, 0.95], rehit: [0.3, 0.55], move: [[0.05, 0.9, 2.2]], combo: [1.0, 1.3], cancel: 0.9, stop: 0.08, shake: 0.35, slam: 1.0, finisher: { t: 0.98, mv: 0.7 }, turn: 0.4 }),
  // ---- lance: long reach thrusts behind a tower shield, shield-charge dash (multi-hit)
  ln_1: M({ clip: 'ln_1', mv: 0.22, pierce: true, active: [0.14, 0.26], move: [[0.08, 0.24, 0.35]], next: 'ln_2', hnext: 'ln_dash', combo: [0.28, 0.6], cancel: 0.28, stop: 0.06, shake: 0.15 }),
  ln_2: M({ clip: 'ln_2', mv: 0.22, pierce: true, active: [0.14, 0.26], move: [[0.08, 0.24, 0.35]], next: 'ln_3', hnext: 'ln_dash', combo: [0.28, 0.6], cancel: 0.28, stop: 0.06, shake: 0.15 }),
  ln_3: M({ clip: 'ln_3', mv: 0.28, pierce: true, active: [0.18, 0.32], move: [[0.1, 0.3, 0.5]], next: 'ln_1', hnext: 'ln_dash', combo: [0.36, 0.7], cancel: 0.34, stop: 0.07, shake: 0.2 }),
  ln_dash: M({ clip: 'ln_dash', mv: 0.18, pierce: true, stam: 18, active: [0.25, 1.35], rehit: [0.55, 0.85, 1.15], move: [[0.2, 1.35, 7.5]], turn: 1.3, combo: [1.4, 1.65], next: 'ln_3', cancel: 1.2, stop: 0.05, shake: 0.2, armor: true }),
  // ---- bow: quick shot, charged shot (more arrows per level), no edge
  bw_quick: M({ clip: 'bw_quick', mv: 0, active: [9, 9], shoot: [{ t: 0.16, arrows: 1, spread: 0, mv: 0.2 }], next: 'bw_quick', hnext: 'bcharge', combo: [0.26, 0.55], cancel: 0.2, turn: 0.16, stop: 0, shake: 0.05 }),
  bw_shot: M({ clip: 'bw_shot', mv: 0, active: [9, 9], shoot: [{ t: 0.04, arrows: 'lvl', spread: 0.07, mv: 0.15 }], next: 'bw_quick', hnext: 'bcharge', combo: [0.2, 0.5], cancel: 0.16, turn: 0.04, stop: 0, shake: 0.12 }),
};
export const ARROWS_BY_LEVEL = [1, 2, 3, 4];

// damage falloff for arrows by distance (bow range [near, far])
export function arrowFalloff(d, range = [5, 24]) { if (d < range[0]) return 0.8 + 0.2 * (d / range[0]); if (d <= range[1]) return 1; return Math.max(0.55, 1 - (d - range[1]) / 40); }
export const classOf = (id) => WEAPON_CLASSES[id] || WEAPON_CLASSES.greatsword;

// ================================================================ more classes (stage 6c)
// New fields
//   ammo { clip, reload }  ranged classes: shots use the clip; empty → automatic reload (dodge cancels it)
//   shot { speed, gravity, kind }  projectile flight for ranged classes (kind: bolt | bullet | slug)
//   modes { name: { light, heavy } }  transforming weapons; guardAction 'switch' changes mode
//   guardAction  'switch' (Shift Axe) · 'perform' (War Horn recital) · null
//   air  the aerial move (Vault Staff) · tri: a third blade held in the teeth
// Names: classes inspired by well-known play styles carry original names here (戦角笛, 砲槍, 変形斧, 蓄力盾斧, 跳躍棍).
Object.assign(WEAPON_CLASSES, {
  tri: { ja: '三刀流', en: 'Three-Blade Style', hands: 'dual', tri: true, dmg: 'cut', drawT: 0.4, sheatheT: 0.45, parry: 0.22, walk: 3.9, breakMul: 0.85, wear: 1.5, guard: null, roll: 3.4, items: false, light: 'tb_1', heavy: 'tb_storm' },
  machete: { ja: '鉈', en: 'Machete', hands: 1, noShield: true, dmg: 'cut', drawT: 0.28, sheatheT: 0.3, parry: 0.28, walk: 4.1, breakMul: 1.1, wear: 1.6, guard: null, roll: 3.4, items: true, light: 'mc_1', heavy: 'mc_hack' },
  mace: { ja: 'メイス', en: 'Mace', hands: 1, noShield: true, dmg: 'blunt', drawT: 0.38, sheatheT: 0.42, parry: 0.3, walk: 3.6, breakMul: 1.35, wear: 0.5, guard: null, roll: 3.3, items: true, light: 'ma_1', heavy: 'ma_crush' },
  horn: { ja: '戦角笛', en: 'War Horn', hands: 2, dmg: 'blunt', drawT: 0.6, sheatheT: 0.65, parry: 0.2, walk: 3.1, breakMul: 1.3, wear: 0.5, guard: null, guardAction: 'perform', roll: 3.2, items: false, light: 'hr_1', heavy: 'hr_2' },
  cannonlance: { ja: '砲槍', en: 'Cannon Lance', hands: 1, dmg: 'pierce', drawT: 0.65, sheatheT: 0.7, parry: 0.28, walk: 2.3, breakMul: 1.0, wear: 1.1, guard: 'tower', guardMul: 0.08, guardPush: 0.45, roll: 1.9, items: false,
    light: 'cl_1', heavy: 'clcharge', ammo: { clip: 5, reload: 1.4 } },
  shiftaxe: { ja: '変形斧', en: 'Shift Axe', hands: 2, dmg: 'cut', drawT: 0.6, sheatheT: 0.65, parry: 0.25, walk: 3.0, breakMul: 1.1, wear: 1.0, guard: null, guardAction: 'switch', roll: 3.2, items: false,
    modes: { axe: { light: 'sx_a1', heavy: 'sx_aheavy' }, sword: { light: 'sx_s1', heavy: 'sx_discharge' } } },
  bulwarkaxe: { ja: '蓄力盾斧', en: 'Bulwark Axe', hands: 1, dmg: 'cut', drawT: 0.55, sheatheT: 0.6, parry: 0.3, walk: 3.3, breakMul: 1.15, wear: 1.0, guard: 'shield', guardMul: 0.2, guardPush: 1, roll: 3.2, items: false,
    modes: { sword: { light: 'ba_s1', heavy: 'ba_charge' }, axe: { light: 'ba_a1', heavy: 'ba_burst' } } },
  staff: { ja: '跳躍棍', en: 'Vault Staff', hands: 2, dmg: 'cut', drawT: 0.45, sheatheT: 0.5, parry: 0.25, walk: 3.8, breakMul: 0.9, wear: 0.9, guard: null, roll: 3.5, items: false, light: 'st_1', heavy: 'st_vault', air: 'st_air' },
  lightxbow: { ja: '軽弩', en: 'Light Crossbow', hands: 'gun2', dmg: 'ranged', drawT: 0.45, sheatheT: 0.5, parry: 0.2, walk: 3.7, breakMul: 0.7, wear: 0, guard: null, roll: 3.4, items: false,
    light: 'lx_shot', heavy: 'lx_scatter', ammo: { clip: 8, reload: 1.0 }, range: [4, 22], shot: { speed: 75, gravity: 3, kind: 'bolt' }, scope: { zoom: 3.5, reticle: 'mil' } },
  heavyxbow: { ja: '重弩', en: 'Heavy Crossbow', hands: 'gun2', dmg: 'ranged', drawT: 0.8, sheatheT: 0.85, parry: 0.2, walk: 2.0, breakMul: 0.9, wear: 0, guard: null, roll: 2.2, items: false,
    light: 'hx_shot', heavy: 'xcharge', ammo: { clip: 4, reload: 2.2 }, range: [6, 30], shot: { speed: 90, gravity: 2, kind: 'slug' }, scope: { zoom: 6, reticle: 'mil' } },
  pistol: { ja: '拳銃', en: 'Pistol', hands: 'gun1', dmg: 'ranged', drawT: 0.2, sheatheT: 0.25, parry: 0.3, walk: 4.4, breakMul: 0.6, wear: 0, guard: null, roll: 3.7, items: true,
    light: 'ps_shot', heavy: 'ps_fan', ammo: { clip: 8, reload: 0.9 }, range: [3, 16], shot: { speed: 85, gravity: 1.5, kind: 'bullet' }, scope: { zoom: 1.8, reticle: 'dot' } },
  machinegun: { ja: 'マシンガン', en: 'Machine Gun', hands: 'gun2', dmg: 'ranged', drawT: 0.6, sheatheT: 0.65, parry: 0.2, walk: 2.6, breakMul: 0.6, wear: 0, guard: null, roll: 3.0, items: false,
    light: 'mg_burst', heavy: 'mgfire', range: [4, 20], shot: { speed: 95, gravity: 1, kind: 'bullet' }, heat: { perShot: 0.045, cool: 0.35, lock: 3 }, scope: { zoom: 2.8, reticle: 'mil' } },
  anchor: { ja: '古の碇', en: 'Ancient Anchor', hands: 2, dmg: 'blunt', drawT: 0.9, sheatheT: 0.95, parry: 0.2, walk: 2.4, breakMul: 1.6, wear: 0.3, guard: null, roll: 2.8, items: false, light: 'an_1', heavy: 'an_throw' },
});
CLASS_IDS.splice(0, CLASS_IDS.length, ...Object.keys(WEAPON_CLASSES));
for (const [k, v] of Object.entries(DMG_SCALE)) if (WEAPON_CLASSES[k]) WEAPON_CLASSES[k].dmgScale = v; // after every class is registered
Object.assign(CHARGES, {
  xcharge: { lv: [0.6, 1.3, 9], max: 2.2, release: ['hx_cannon', 'hx_cannon', 'hx_cannon2', 'hx_cannon2'], move: 0.6, clip: 'gun_aim', stamina: 5 },
  clcharge: { lv: [0.7, 9, 9], max: 1.6, release: ['cl_shell', 'cl_bigshell', 'cl_bigshell', 'cl_bigshell'], move: 0.5, clip: 'cl_aim', stamina: 3 },
});
// blast: { t, r: radius, ahead: m in front, dmg: fixed base damage (× weapon attack) } — shells, vial bursts
// chain: { reach } — the anchor's thrown head sweeps a line out to `reach` metres and back
// gauge / vials / notes / bounce: class resources (see player.js)
Object.assign(CLASS_MOVES, {
  // ---- three-blade style: each swing cuts with all three blades; whirlwind multi-hit
  tb_1: M({ clip: 'tb_1', mv: 0.07, active: [0.1, 0.3], rehit: [0.17, 0.24], move: [[0.05, 0.25, 0.5]], next: 'tb_2', hnext: 'tb_storm', combo: [0.26, 0.5], cancel: 0.2, stop: 0.04, shake: 0.14 }),
  tb_2: M({ clip: 'tb_2', mv: 0.07, active: [0.1, 0.3], rehit: [0.17, 0.24], move: [[0.05, 0.25, 0.5]], next: 'tb_3', hnext: 'tb_storm', combo: [0.26, 0.5], cancel: 0.2, stop: 0.04, shake: 0.14 }),
  tb_3: M({ clip: 'tb_3', mv: 0.11, active: [0.16, 0.42], rehit: [0.25, 0.33], move: [[0.08, 0.38, 0.9]], next: 'tb_1', hnext: 'tb_storm', combo: [0.4, 0.7], cancel: 0.3, stop: 0.06, shake: 0.24 }),
  tb_storm: M({ clip: 'tb_storm', mv: 0.085, stam: 20, active: [0.15, 1.15], rehit: [0.3, 0.45, 0.6, 0.75, 0.9, 1.05], move: [[0.1, 1.1, 2.4]], combo: [1.2, 1.45], next: 'tb_1', cancel: 0.95, stop: 0.04, shake: 0.18, turn: 0.3 }),
  // ---- machete: very fast short chops, hacking heavy that bites into parts
  mc_1: M({ clip: 'mc_1', mv: 0.15, active: [0.09, 0.18], move: [[0.04, 0.16, 0.35]], next: 'mc_2', hnext: 'mc_hack', combo: [0.16, 0.42], cancel: 0.15, stop: 0.05, shake: 0.14 }),
  mc_2: M({ clip: 'mc_2', mv: 0.15, active: [0.08, 0.17], move: [[0.04, 0.16, 0.35]], next: 'mc_1', hnext: 'mc_hack', combo: [0.15, 0.4], cancel: 0.15, stop: 0.05, shake: 0.14 }),
  mc_hack: M({ clip: 'mc_hack', mv: 0.34, active: [0.2, 0.3], move: [[0.12, 0.28, 0.6]], breakBonus: 1.4, next: 'mc_1', combo: [0.36, 0.7], cancel: 0.34, stop: 0.09, shake: 0.32 }),
  // ---- mace: one-handed blunt, short chain, crushing overhead
  ma_1: M({ clip: 'ma_1', mv: 0.24, blunt: true, active: [0.16, 0.26], move: [[0.08, 0.24, 0.45]], next: 'ma_2', hnext: 'ma_crush', combo: [0.26, 0.56], cancel: 0.24, stop: 0.07, shake: 0.24 }),
  ma_2: M({ clip: 'ma_2', mv: 0.24, blunt: true, active: [0.15, 0.25], move: [[0.08, 0.22, 0.4]], next: 'ma_1', hnext: 'ma_crush', combo: [0.25, 0.55], cancel: 0.24, stop: 0.07, shake: 0.24 }),
  ma_crush: M({ clip: 'ma_crush', mv: 0.46, blunt: true, active: [0.26, 0.36], move: [[0.16, 0.32, 0.6]], next: 'ma_1', combo: [0.5, 0.85], cancel: 0.45, stop: 0.12, shake: 0.45, slam: 0.34 }),
  // ---- war horn: blunt swings that add notes (a / b); melodies are performed with GUARD
  hr_1: M({ clip: 'hr_1', mv: 0.3, blunt: true, note: 'a', active: [0.24, 0.36], move: [[0.14, 0.34, 0.5]], next: 'hr_1b', hnext: 'hr_2', combo: [0.4, 0.75], cancel: 0.38, stop: 0.08, shake: 0.28 }),
  hr_1b: M({ clip: 'hr_1b', mv: 0.3, blunt: true, note: 'a', active: [0.22, 0.34], move: [[0.12, 0.32, 0.5]], next: 'hr_1', hnext: 'hr_2', combo: [0.38, 0.72], cancel: 0.36, stop: 0.08, shake: 0.28 }),
  hr_2: M({ clip: 'hr_2', mv: 0.42, blunt: true, note: 'b', active: [0.3, 0.42], move: [[0.2, 0.4, 0.6]], next: 'hr_1', hnext: 'hr_2', combo: [0.5, 0.9], cancel: 0.48, stop: 0.1, shake: 0.38, slam: 0.42 }),
  hr_perform: M({ clip: 'hr_perform', mv: 0.2, blunt: true, active: [0.5, 0.7], perform: 0.9, combo: [1.3, 1.5], cancel: 1.0, stop: 0.06, shake: 0.3 }),
  // ---- cannon lance: thrusts, shells (fixed blast damage, uses the clip), charged shell, reload
  cl_1: M({ clip: 'ln_1', mv: 0.2, pierce: true, active: [0.14, 0.26], move: [[0.08, 0.24, 0.35]], next: 'cl_2', hnext: 'clcharge', combo: [0.28, 0.6], cancel: 0.28, stop: 0.06, shake: 0.15 }),
  cl_2: M({ clip: 'ln_3', mv: 0.24, pierce: true, active: [0.18, 0.32], move: [[0.1, 0.3, 0.5]], next: 'cl_1', hnext: 'clcharge', combo: [0.36, 0.7], cancel: 0.34, stop: 0.07, shake: 0.2 }),
  cl_shell: M({ clip: 'cl_fire', mv: 0, ammo: 1, active: [9, 9], blast: { t: 0.12, r: 2.6, ahead: 2.6, dmg: 26 }, next: 'cl_1', hnext: 'clcharge', combo: [0.3, 0.6], cancel: 0.3, stop: 0, shake: 0.35, turn: 0.1 }),
  cl_bigshell: M({ clip: 'cl_fire', mv: 0, ammo: 1, active: [9, 9], blast: { t: 0.08, r: 3.4, ahead: 3, dmg: 62 }, next: 'cl_1', combo: [0.35, 0.7], cancel: 0.36, stop: 0, shake: 0.6, turn: 0 }),
  // ---- shift axe: axe mode (reach, gauge refills), sword mode (stronger, spends the gauge), discharge finisher
  sx_a1: M({ clip: 'sx_a1', mv: 0.3, active: [0.26, 0.38], move: [[0.16, 0.34, 0.5]], next: 'sx_a2', hnext: 'sx_aheavy', combo: [0.42, 0.8], cancel: 0.38, stop: 0.08, shake: 0.26, gauge: 0.06 }),
  sx_a2: M({ clip: 'sx_a2', mv: 0.3, active: [0.24, 0.36], move: [[0.14, 0.32, 0.5]], next: 'sx_a1', hnext: 'sx_aheavy', combo: [0.4, 0.78], cancel: 0.36, stop: 0.08, shake: 0.26, gauge: 0.06 }),
  sx_aheavy: M({ clip: 'sx_aheavy', mv: 0.5, active: [0.36, 0.48], move: [[0.24, 0.44, 0.6]], next: 'sx_a1', combo: [0.6, 0.95], cancel: 0.55, stop: 0.11, shake: 0.42, slam: 0.46, gauge: 0.1 }),
  sx_s1: M({ clip: 'sx_s1', mv: 0.26, active: [0.14, 0.26], move: [[0.08, 0.24, 0.5]], next: 'sx_s2', hnext: 'sx_discharge', combo: [0.28, 0.6], cancel: 0.26, stop: 0.07, shake: 0.22, gauge: -0.09, elemBoost: 1.35 }),
  sx_s2: M({ clip: 'sx_s2', mv: 0.26, active: [0.13, 0.25], move: [[0.07, 0.22, 0.5]], next: 'sx_s1', hnext: 'sx_discharge', combo: [0.27, 0.58], cancel: 0.25, stop: 0.07, shake: 0.22, gauge: -0.09, elemBoost: 1.35 }),
  sx_discharge: M({ clip: 'sx_discharge', mv: 0.16, active: [0.2, 1.3], rehit: [0.42, 0.64, 0.86, 1.08], move: [[0.1, 0.3, 0.6]], gaugeAll: true, finisher: { t: 1.2, mv: 0.7 }, blast: { t: 1.25, r: 3, ahead: 1.6, dmg: 40 }, combo: [1.45, 1.7], cancel: 1.3, stop: 0.06, shake: 0.4, armor: true }),
  sx_morph: M({ clip: 'sx_morph', mv: 0.28, active: [0.16, 0.3], move: [[0.06, 0.26, 0.5]], morph: true, combo: [0.34, 0.7], cancel: 0.3, stop: 0.08, shake: 0.28 }),
  // ---- bulwark axe: sword mode builds energy, heavy stores it in vials; axe mode bursts the vials
  ba_s1: M({ clip: 'sw_1', mv: 0.18, active: [0.12, 0.22], move: [[0.06, 0.2, 0.5]], next: 'ba_s2', hnext: 'ba_charge', combo: [0.2, 0.5], cancel: 0.2, stop: 0.05, shake: 0.16, energy: 0.12 }),
  ba_s2: M({ clip: 'sw_2', mv: 0.18, active: [0.1, 0.2], move: [[0.04, 0.18, 0.4]], next: 'ba_s3', hnext: 'ba_charge', combo: [0.18, 0.48], cancel: 0.18, stop: 0.05, shake: 0.16, energy: 0.12 }),
  ba_s3: M({ clip: 'sw_3', mv: 0.22, active: [0.14, 0.26], move: [[0.08, 0.24, 0.5]], next: 'ba_s1', hnext: 'ba_charge', combo: [0.24, 0.55], cancel: 0.24, stop: 0.06, shake: 0.2, energy: 0.14 }),
  ba_charge: M({ clip: 'ba_charge', mv: 0, active: [9, 9], vialCharge: 0.5, next: 'ba_s1', combo: [0.6, 0.9], cancel: 0.5, stop: 0, shake: 0.1 }),
  ba_morph: M({ clip: 'ba_morph', mv: 0.32, active: [0.22, 0.36], move: [[0.1, 0.3, 0.5]], morph: true, combo: [0.45, 0.8], cancel: 0.4, stop: 0.08, shake: 0.3 }),
  ba_a1: M({ clip: 'ba_a1', mv: 0.34, active: [0.26, 0.38], move: [[0.16, 0.34, 0.5]], next: 'ba_a2', hnext: 'ba_burst', combo: [0.44, 0.82], cancel: 0.4, stop: 0.09, shake: 0.3 }),
  ba_a2: M({ clip: 'ba_a2', mv: 0.34, active: [0.24, 0.36], move: [[0.14, 0.32, 0.5]], next: 'ba_a1', hnext: 'ba_burst', combo: [0.42, 0.8], cancel: 0.4, stop: 0.09, shake: 0.3 }),
  ba_burst: M({ clip: 'ba_burst', mv: 0.55, active: [0.4, 0.52], move: [[0.26, 0.5, 0.8]], vialBurst: { t: 0.5, r: 2.2, ahead: 1.8, step: 0.9, dmg: 30 }, next: 'ba_a1', combo: [0.8, 1.1], cancel: 0.75, stop: 0.13, shake: 0.6, slam: 0.5 }),
  // ---- vault staff: spinning combo; HEAVY vaults into the air; LIGHT in the air = aerial slash that bounces
  st_1: M({ clip: 'st_1', mv: 0.2, active: [0.12, 0.3], rehit: [0.21], move: [[0.06, 0.26, 0.5]], next: 'st_2', hnext: 'st_vault', combo: [0.3, 0.6], cancel: 0.26, stop: 0.05, shake: 0.18 }),
  st_2: M({ clip: 'st_2', mv: 0.24, active: [0.14, 0.32], move: [[0.08, 0.28, 0.6]], next: 'st_1', hnext: 'st_vault', combo: [0.32, 0.65], cancel: 0.28, stop: 0.06, shake: 0.2 }),
  st_vault: M({ clip: 'st_vault', mv: 0, active: [9, 9], vault: { t: 0.18, vy: 9, fwd: 6 }, combo: [9, 9], cancel: 0.1, stop: 0, shake: 0.1, stam: 12 }),
  st_air: M({ clip: 'st_air', mv: 0.26, active: [0.06, 0.26], move: [], bounce: 5.5, combo: [9, 9], cancel: 9, stop: 0.06, shake: 0.2, airborne: true }),
  // ---- light crossbow: quick bolts, scatter shot
  lx_shot: M({ clip: 'gun_shot', mv: 0, active: [9, 9], ammo: 1, shoot: [{ t: 0.06, arrows: 1, spread: 0, mv: 0.21 }], next: 'lx_shot', hnext: 'lx_scatter', combo: [0.16, 0.45], cancel: 0.12, turn: 0.06, stop: 0, shake: 0.06 }),
  lx_scatter: M({ clip: 'gun_shot', mv: 0, active: [9, 9], ammo: 1, shoot: [{ t: 0.06, arrows: 5, spread: 0.06, mv: 0.09 }], next: 'lx_shot', hnext: 'lx_scatter', combo: [0.26, 0.55], cancel: 0.2, turn: 0.06, stop: 0, shake: 0.14 }),
  // ---- heavy crossbow: slugs; hold HEAVY to charge a cannon shot
  hx_shot: M({ clip: 'gun_shot_h', mv: 0, active: [9, 9], ammo: 1, shoot: [{ t: 0.08, arrows: 1, spread: 0, mv: 0.5 }], next: 'hx_shot', hnext: 'xcharge', combo: [0.45, 0.8], cancel: 0.3, turn: 0.08, stop: 0, shake: 0.22 }),
  hx_cannon: M({ clip: 'gun_shot_h', mv: 0, active: [9, 9], ammo: 1, shoot: [{ t: 0.05, arrows: 1, spread: 0, mv: 0.62 }], next: 'hx_shot', combo: [0.5, 0.85], cancel: 0.35, turn: 0, stop: 0, shake: 0.4 }),
  hx_cannon2: M({ clip: 'gun_shot_h', mv: 0, active: [9, 9], ammo: 1, shoot: [{ t: 0.05, arrows: 1, spread: 0, mv: 0.95 }], blast: { t: 0.05, r: 1.5, ahead: 0.3, dmg: 0, recoil: 3 }, next: 'hx_shot', combo: [0.55, 0.9], cancel: 0.4, turn: 0, stop: 0, shake: 0.6 }),
  // ---- pistol: fast single shots, fan of three
  ps_shot: M({ clip: 'pistol_shot', mv: 0, active: [9, 9], ammo: 1, shoot: [{ t: 0.04, arrows: 1, spread: 0, mv: 0.19 }], next: 'ps_shot', hnext: 'ps_fan', combo: [0.1, 0.35], cancel: 0.08, turn: 0.04, stop: 0, shake: 0.04 }),
  ps_fan: M({ clip: 'pistol_fan', mv: 0, active: [9, 9], ammo: 3, shoot: [{ t: 0.05, arrows: 1, spread: 0, mv: 0.12 }, { t: 0.15, arrows: 1, spread: 0, mv: 0.12 }, { t: 0.25, arrows: 1, spread: 0, mv: 0.12 }], next: 'ps_shot', combo: [0.32, 0.6], cancel: 0.28, turn: 0.25, stop: 0, shake: 0.08 }),
  // ---- machine gun: short burst on LIGHT; hold HEAVY for sustained fire until it overheats
  mg_burst: M({ clip: 'gun_shot', mv: 0, active: [9, 9], shoot: [{ t: 0.03, arrows: 1, spread: 0.02, mv: 0.06 }, { t: 0.12, arrows: 1, spread: 0.03, mv: 0.06 }, { t: 0.21, arrows: 1, spread: 0.03, mv: 0.06 }], next: 'mg_burst', hnext: 'mgfire', combo: [0.26, 0.5], cancel: 0.2, turn: 0.2, stop: 0, shake: 0.06 }),
  // ---- ancient anchor: huge sweeps, chain throw that reaches far
  an_1: M({ clip: 'an_1', mv: 0.48, blunt: true, active: [0.4, 0.56], move: [[0.28, 0.5, 0.6]], next: 'an_2', hnext: 'an_throw', combo: [0.62, 1.0], cancel: 0.6, stop: 0.11, shake: 0.42, turn: 0.3 }),
  an_2: M({ clip: 'an_2', mv: 0.6, blunt: true, active: [0.46, 0.6], move: [[0.3, 0.56, 0.7]], next: 'an_1', hnext: 'an_throw', combo: [0.75, 1.15], cancel: 0.7, stop: 0.13, shake: 0.55, slam: 0.58, turn: 0.35 }),
  an_throw: M({ clip: 'an_throw', mv: 0.4, blunt: true, active: [0.3, 0.95], chain: { reach: 10, out: [0.3, 0.6], back: [0.7, 0.95] }, rehit: [0.7], next: 'an_1', combo: [1.0, 1.3], cancel: 0.9, stop: 0.08, shake: 0.35, turn: 0.28 }),
});
// War Horn melodies: the last three notes; performing (GUARD) plays every stored melody
export const MELODIES = { aab: { buff: 'atk', mul: 1.12, t: 60 }, abb: { buff: 'def', mul: 0.85, t: 60 }, bab: { buff: 'stam', t: 60 }, aba: { buff: 'heal', amount: 30 } };
