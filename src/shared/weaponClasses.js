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
    light: 'bw_quick', heavy: 'bcharge', range: [5, 24] },
};
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
