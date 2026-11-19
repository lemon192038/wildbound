// Animation clips for the weapon classes other than the great sword (src/shared/weaponClasses.js).
// Same keyframe format as anim.js: bone eulers, hip offset, weapon path w = { g: grip (chest space), b: blade dir,
// e: edge dir }, ik = [right-arm grip IK, left-hand second grip, leg IK]. One-handed classes keep ik[1] = 0 and pose the
// off arm (shield / second blade / bow) with eulers; anim.js merges these into CLIPS before resolving.
export function weaponClips({ STAND, READY, lunge }) {
  const R1 = { ...READY, ik: [1, 0, 1] };                                        // one-handed ready stance
  const SHIELD = { upperArmL: [-0.95, 0.35, 0.55], foreArmL: [-1.25, 0, 0], handL: [0, 0.3, 0] }; // shield carried in front
  const SHIELD_UP = { upperArmL: [-1.35, 0.55, 0.35], foreArmL: [-1.0, 0, 0], handL: [0, 0.4, 0] };
  const OFF_LOW = { upperArmL: [-0.55, 0, 0.35], foreArmL: [-0.9, 0, 0] };     // second blade held low
  const w = (g, b, e) => ({ g, b, e });
  // reusable arcs (chest space)
  const HI_L = w([-0.22, 0.3, 0.1], [-0.4, 0.75, -0.4], [0.3, -0.3, 1]), LO_R = w([0.14, -0.3, 0.32], [0.55, -0.7, 0.35], [0.45, -1, -0.6]);
  const MID = w([-0.02, 0.08, 0.48], [0.1, 0.2, 1], [0.5, -1, 0.5]);
  const R_SIDE = w([0.18, -0.15, 0.28], [0.9, -0.2, 0.3], [-0.3, 0.25, 1]), L_SIDE = w([-0.26, 0.15, 0.24], [-0.9, 0.3, -0.2], [-0.3, 0.2, -1]);
  const FRONT_MID = w([0.0, 0.02, 0.5], [0.1, 0.12, 1], [-1, 0.3, 0]);
  const OVER = w([-0.03, 0.5, 0.0], [-0.05, 0.6, -1], [0, 1, 0.3]), OVER_HIT = w([0.0, -0.3, 0.52], [0.05, -0.32, 1], [0, -1, -0.3]);
  const THRUST0 = w([0.12, -0.08, 0.08], [0.05, 0.05, 1], [0, -1, 0]), THRUST1 = w([0.06, 0.02, 0.62], [0.02, 0.04, 1], [0, -1, 0]);
  const C = {};

  // ================= sword & shield =================
  C.sw_1 = { dur: 0.48, from: R1, keys: [{ t: 0, ...SHIELD }, { t: 0.1, w: HI_L, chest: [-0.05, -0.5, 0], spine: [0, -0.2, 0], ...SHIELD, ease: 'out' },
    { t: 0.17, w: MID, chest: [0.1, -0.05, 0], ...lunge(0.6), ease: 'in' }, { t: 0.24, w: LO_R, chest: [0.25, 0.4, 0], spine: [0.2, 0.12, 0], ...lunge(0.8), ease: 'out' }, { t: 0.48, ...R1, ...SHIELD }] };
  C.sw_2 = { dur: 0.46, from: R1, keys: [{ t: 0, ...SHIELD }, { t: 0.08, w: R_SIDE, chest: [0.1, 0.5, 0], hips: [0, 0.3, 0], ...SHIELD, ease: 'out' },
    { t: 0.15, w: FRONT_MID, chest: [0.05, 0, 0], ...lunge(0.6), ease: 'in' }, { t: 0.22, w: L_SIDE, chest: [-0.05, -0.6, 0], spine: [0, -0.2, 0], ...lunge(0.8), ease: 'out' }, { t: 0.46, ...R1, ...SHIELD }] };
  C.sw_3 = { dur: 0.55, from: R1, keys: [{ t: 0, ...SHIELD }, { t: 0.12, w: OVER, spine: [-0.2, 0, 0], chest: [-0.15, 0, 0], ...SHIELD, ease: 'out' },
    { t: 0.2, w: w([0, 0.35, 0.35], [0, 1, 0.35], [0, -0.35, 1]), ease: 'in' }, { t: 0.27, w: OVER_HIT, spine: [0.4, 0, 0], chest: [0.25, 0, 0], ...lunge(1, -0.2), ease: 'out' }, { t: 0.55, ...R1, ...SHIELD }] };
  C.sw_4 = { dur: 0.85, from: R1, keys: [{ t: 0, ...SHIELD }, { t: 0.15, w: R_SIDE, hips: [0, 1.2, 0], chest: [0.1, 0.6, 0], ...SHIELD, ease: 'out' },
    { t: 0.3, w: FRONT_MID, hips: [0, -1.4, 0], chest: [0, -0.5, 0], ...lunge(0.9), ease: 'inOut' }, { t: 0.45, w: L_SIDE, hips: [0, -3.4, 0], chest: [-0.05, -0.7, 0], ...lunge(1), ease: 'out' },
    { t: 0.55, hips: [0, -6.28, 0] }, { t: 0.85, ...R1, ...SHIELD, hips: [0, -6.28, 0] }] };
  C.sw_bash = { dur: 0.62, from: R1, keys: [{ t: 0, ...SHIELD }, { t: 0.12, ...SHIELD_UP, chest: [0, 0.4, 0], hips: [0, 0.3, 0], ease: 'out' },
    { t: 0.22, upperArmL: [-1.55, 0.1, 0.05], foreArmL: [-0.25, 0, 0], handL: [0, 0.2, 0], chest: [0.15, -0.55, 0], spine: [0.15, -0.2, 0], ...lunge(1.1), ease: 'out' },
    { t: 0.36, upperArmL: [-1.5, 0.1, 0.05], foreArmL: [-0.3, 0, 0], chest: [0.15, -0.5, 0], ...lunge(1.05) }, { t: 0.62, ...R1, ...SHIELD }] };
  C.sw_guard = { dur: 0.12, hold: true, from: R1, keys: [{ t: 0 }, { t: 0.12, ...SHIELD_UP, w: w([0.12, -0.25, 0.1], [0.3, -0.6, 0.5], [0.4, 0, 1]), chest: [0.05, 0.2, 0], hips: [0, 0.2, 0], ...lunge(0.5, -0.12), ease: 'out' }] };

  // ================= dual blades =================
  const OFF_HI = { upperArmL: [-2.3, 0, 0.5], foreArmL: [-0.6, 0, 0] }, OFF_X = { upperArmL: [-1.2, 0, -0.55], foreArmL: [-0.4, 0, 0] }, OFF_OUT = { upperArmL: [-1.0, 0, 1.0], foreArmL: [-0.2, 0, 0] };
  const D1 = { ...READY, ik: [1, 0, 1], ...OFF_LOW };
  C.db_1 = { dur: 0.42, from: D1, keys: [{ t: 0 }, { t: 0.07, w: HI_L, ...OFF_OUT, chest: [-0.05, -0.4, 0], ease: 'out' }, { t: 0.14, w: LO_R, ...OFF_LOW, chest: [0.2, 0.35, 0], ...lunge(0.7), ease: 'out' },
    { t: 0.2, ...OFF_X, chest: [0.15, -0.3, 0], ease: 'out' }, { t: 0.42, ...D1 }] };
  C.db_2 = { dur: 0.42, from: D1, keys: [{ t: 0 }, { t: 0.07, w: R_SIDE, ...OFF_HI, chest: [0.05, 0.45, 0], ease: 'out' }, { t: 0.14, w: L_SIDE, ...OFF_X, chest: [-0.05, -0.55, 0], ...lunge(0.7), ease: 'out' },
    { t: 0.21, ...OFF_OUT, chest: [0, 0.3, 0], ease: 'out' }, { t: 0.42, ...D1 }] };
  C.db_3 = { dur: 0.62, from: D1, keys: [{ t: 0 }, { t: 0.09, w: OVER, ...OFF_HI, spine: [-0.2, 0, 0], ease: 'out' }, { t: 0.17, w: OVER_HIT, ...OFF_X, spine: [0.35, 0, 0], ...lunge(0.9, -0.18), ease: 'out' },
    { t: 0.26, w: R_SIDE, ...OFF_OUT, hips: [0, 0.8, 0], ease: 'out' }, { t: 0.34, w: L_SIDE, ...OFF_X, hips: [0, -0.4, 0], ...lunge(1), ease: 'out' }, { t: 0.62, ...D1 }] };
  const dance = [{ t: 0 }];
  for (let i = 0; i < 6; i++) { const t0 = 0.12 + i * 0.16; dance.push({ t: t0, w: i % 2 ? L_SIDE : R_SIDE, ...(i % 2 ? OFF_OUT : OFF_X), hips: [0, -(i + 1) * 1.05, 0], chest: [0.1, i % 2 ? -0.4 : 0.4, 0], ...lunge(0.8), ease: 'inOut' }); }
  dance.push({ t: 1.1, w: OVER_HIT, ...OFF_X, hips: [0, -6.28, 0], spine: [0.35, 0, 0], ...lunge(1, -0.2), ease: 'out' }, { t: 1.35, ...D1, hips: [0, -6.28, 0] });
  C.db_dance = { dur: 1.35, from: D1, keys: dance };

  // ================= long sword =================
  const LS = { ...READY, w: w([-0.12, -0.2, 0.3], [-0.2, 0.5, 1], [0, -1, 0.4]) };
  C.ls_1 = { dur: 0.72, from: LS, keys: [{ t: 0 }, { t: 0.16, w: OVER, spine: [-0.2, 0, 0], chest: [-0.15, -0.1, 0], ease: 'inOut' }, { t: 0.24, w: w([0, 0.4, 0.4], [0, 1, 0.4], [0, -0.4, 1]), ease: 'in' },
    { t: 0.32, w: OVER_HIT, spine: [0.45, 0, 0], chest: [0.3, 0, 0], ...lunge(1.1, -0.2), ease: 'out' }, { t: 0.72, ...LS }] };
  C.ls_2 = { dur: 0.68, from: LS, keys: [{ t: 0 }, { t: 0.12, w: HI_L, chest: [-0.05, -0.6, 0], ease: 'inOut' }, { t: 0.2, w: MID, ...lunge(0.7), ease: 'in' },
    { t: 0.3, w: LO_R, chest: [0.3, 0.45, 0], spine: [0.25, 0.15, 0], ...lunge(1), ease: 'out' }, { t: 0.68, ...LS }] };
  C.ls_3 = { dur: 0.9, from: LS, keys: [{ t: 0 }, { t: 0.16, w: R_SIDE, chest: [0.1, 0.6, 0], hips: [0, 0.4, 0], ease: 'inOut' }, { t: 0.26, w: FRONT_MID, ...lunge(0.9), ease: 'in' },
    { t: 0.38, w: L_SIDE, chest: [-0.05, -0.75, 0], spine: [0, -0.25, 0], hips: [0, -0.3, 0], ...lunge(1.15), ease: 'out' }, { t: 0.9, ...LS }] };
  C.ls_thrust = { dur: 0.62, from: LS, keys: [{ t: 0 }, { t: 0.1, w: THRUST0, chest: [0, 0.3, 0], ease: 'out' }, { t: 0.18, w: THRUST1, chest: [0.1, -0.1, 0], spine: [0.15, 0, 0], ...lunge(1.2, -0.15), ease: 'out' },
    { t: 0.3, w: THRUST1, ...lunge(1.15, -0.15) }, { t: 0.62, ...LS }] };
  C.ls_rise = { dur: 0.66, from: LS, keys: [{ t: 0, w: THRUST1 }, { t: 0.1, w: w([0.05, -0.35, 0.4], [0.1, -0.5, 1], [0, 1, 0.3]), spine: [0.3, 0, 0], ease: 'in' },
    { t: 0.24, w: w([-0.02, 0.5, 0.15], [-0.05, 1, -0.2], [0, 0.3, 1]), spine: [-0.25, 0, 0], chest: [-0.15, 0, 0], ease: 'out' }, { t: 0.66, ...LS }] };
  C.ls_spirit = { dur: 1.15, from: LS, keys: [{ t: 0 }, { t: 0.2, w: R_SIDE, hips: [0, 1.4, 0], chest: [0.1, 0.7, 0], ...lunge(0.6), ease: 'inOut' },
    { t: 0.36, w: FRONT_MID, hips: [0, -1.0, 0], ...lunge(1), ease: 'in' }, { t: 0.5, w: L_SIDE, hips: [0, -3.6, 0], chest: [0, -0.7, 0], ...lunge(1.25, -0.22), ease: 'out' },
    { t: 0.62, hips: [0, -6.28, 0] }, { t: 1.15, ...LS, hips: [0, -6.28, 0] }] };

  // ================= hammer =================
  const HM = { ...READY, w: w([0.15, -0.25, 0.15], [0.4, 0.6, -0.7], [0, 0, 1]) };       // head over the shoulder, haft down
  C.hm_1 = { dur: 0.9, from: HM, keys: [{ t: 0 }, { t: 0.24, w: R_SIDE, hips: [0, 0.5, 0], chest: [0.1, 0.65, 0], ease: 'inOut' }, { t: 0.34, w: FRONT_MID, ...lunge(0.9), ease: 'in' },
    { t: 0.44, w: L_SIDE, chest: [-0.05, -0.7, 0], hips: [0, -0.3, 0], ...lunge(1.1), ease: 'out' }, { t: 0.9, ...HM }] };
  C.hm_2 = { dur: 0.86, from: HM, keys: [{ t: 0 }, { t: 0.22, w: L_SIDE, chest: [-0.05, -0.7, 0], ease: 'inOut' }, { t: 0.32, w: FRONT_MID, ...lunge(0.9), ease: 'in' },
    { t: 0.42, w: R_SIDE, chest: [0.1, 0.7, 0], hips: [0, 0.4, 0], ...lunge(1.1), ease: 'out' }, { t: 0.86, ...HM }] };
  C.hm_3 = { dur: 1.25, from: HM, keys: [{ t: 0 }, { t: 0.36, w: OVER, spine: [-0.3, 0, 0], chest: [-0.25, 0, 0], head: [-0.2, 0, 0], ease: 'inOut' },
    { t: 0.5, w: w([0, 0.4, 0.4], [0, 1, 0.4], [0, -0.4, 1]), ease: 'in' }, { t: 0.6, w: OVER_HIT, spine: [0.55, 0, 0], chest: [0.35, 0, 0], ...lunge(1.3, -0.28), ease: 'out' },
    { t: 0.95, w: OVER_HIT, spine: [0.5, 0, 0], ...lunge(1.25, -0.28) }, { t: 1.25, ...HM }] };
  C.hm_charge = { dur: 0.35, hold: true, from: HM, keys: [{ t: 0 }, { t: 0.35, w: w([-0.2, -0.2, -0.1], [-0.4, -0.2, -1], [0, 1, 0.2]), chest: [0.05, -0.6, 0], spine: [0.15, -0.2, 0], hip: [0, -0.12, 0], ease: 'out' }] };
  C.hm_up = { dur: 0.72, keys: [{ t: 0, ...HM, w: w([-0.2, -0.2, -0.1], [-0.4, -0.2, -1], [0, 1, 0.2]) }, { t: 0.08, w: w([0, -0.3, 0.45], [0.05, -0.2, 1], [0, 1, 0.3]), ...lunge(0.9), ease: 'in' },
    { t: 0.2, w: w([0, 0.5, 0.25], [0, 1, 0.1], [0, 0.2, 1]), spine: [-0.25, 0, 0], ease: 'out' }, { t: 0.72, ...HM }] };
  C.hm_slam = { dur: 0.95, keys: [{ t: 0, ...HM, w: w([-0.2, -0.2, -0.1], [-0.4, -0.2, -1], [0, 1, 0.2]) }, { t: 0.07, w: OVER, spine: [-0.3, 0, 0], ease: 'out' },
    { t: 0.14, w: w([0, 0.4, 0.4], [0, 1, 0.4], [0, -0.4, 1]), ease: 'in' }, { t: 0.22, w: OVER_HIT, spine: [0.55, 0, 0], chest: [0.35, 0, 0], ...lunge(1.3, -0.28), ease: 'out' }, { t: 0.95, ...HM }] };
  const spin = [{ t: 0, ...HM, w: w([-0.2, -0.2, -0.1], [-0.4, -0.2, -1], [0, 1, 0.2]) }];
  for (let i = 0; i < 4; i++) spin.push({ t: 0.08 + i * 0.22, w: R_SIDE, hips: [0, -(i + 1) * 6.28 / 4 * 1.0, 0], chest: [0.05, 0.6, 0], ...lunge(0.8), ease: 'linear' });
  spin.push({ t: 1.0, w: OVER_HIT, hips: [0, -6.28, 0], spine: [0.55, 0, 0], chest: [0.35, 0, 0], ...lunge(1.3, -0.28), ease: 'out' }, { t: 1.35, ...HM, hips: [0, -6.28, 0] });
  C.hm_spin = { dur: 1.35, keys: spin };

  // ================= lance =================
  const LN = { ...READY, ik: [1, 0, 1], w: w([0.16, -0.1, 0.2], [0.05, 0.08, 1], [0, -1, 0]), ...SHIELD_UP, chest: [0.05, -0.2, 0], hips: [0, -0.2, 0] };
  const thrust = (hi) => ({ dur: 0.58, from: LN, keys: [{ t: 0 }, { t: 0.1, w: w([0.2, hi - 0.05, 0.02], [0.05, hi * 0.3, 1], [0, -1, 0]), chest: [0.05, 0.1, 0], ease: 'out' },
    { t: 0.2, w: w([0.12, hi, 0.55], [0.03, hi * 0.3, 1], [0, -1, 0]), chest: [0.1, -0.35, 0], spine: [0.1, -0.1, 0], ...lunge(0.9, -0.14), ease: 'out' }, { t: 0.3, w: w([0.12, hi, 0.5], [0.03, hi * 0.3, 1], [0, -1, 0]) }, { t: 0.58, ...LN }] });
  C.ln_1 = thrust(0); C.ln_2 = thrust(0); C.ln_3 = thrust(0.25);
  C.ln_dash = { dur: 1.65, from: LN, keys: [{ t: 0 }, { t: 0.2, w: w([0.14, 0, 0.3], [0.03, 0, 1], [0, -1, 0]), spine: [0.3, 0, 0], chest: [0.15, -0.3, 0], ...lunge(1, -0.18), ease: 'out' },
    { t: 1.3, w: w([0.14, 0, 0.32], [0.03, 0, 1], [0, -1, 0]), spine: [0.3, 0, 0], ...lunge(1, -0.18) }, { t: 1.42, w: w([0.1, 0.35, 0.5], [0.03, 0.6, 1], [0, -1, 0]), spine: [0.1, 0, 0], ease: 'out' }, { t: 1.65, ...LN }] };
  C.ln_guard = { dur: 0.12, hold: true, from: LN, keys: [{ t: 0 }, { t: 0.12, upperArmL: [-1.45, 0.4, 0.15], foreArmL: [-0.8, 0, 0], chest: [0.1, -0.15, 0], spine: [0.15, 0, 0], hip: [0, -0.16, 0], ...lunge(0.7, -0.16), ease: 'out' }] };

  // ================= bow (held in the left hand; the right hand draws) =================
  const BW = { ...STAND, ik: [0, 0, 1], upperArmL: [-0.25, 0, 0.25], foreArmL: [-0.5, 0, 0] };
  const AIM = { upperArmL: [-1.5, 0, -0.05], foreArmL: [-0.05, 0, 0], handL: [0, 0, 0], chest: [0, 0.75, 0], spine: [0, 0.2, 0], head: [0, -0.85, 0], hips: [0, 0.3, 0], ...lunge(0.5, -0.06) };
  const NOCK = { upperArmR: [-1.45, 0, -0.35], foreArmR: [-1.6, 0, 0] }, FULL = { upperArmR: [-1.4, 0, -0.95], foreArmR: [-2.3, 0, 0] }, LOOSE = { upperArmR: [-1.2, 0, -1.2], foreArmR: [-1.2, 0, 0] };
  C.bw_quick = { dur: 0.5, from: BW, keys: [{ t: 0 }, { t: 0.08, ...AIM, ...NOCK, ease: 'out' }, { t: 0.15, ...FULL, ease: 'out' }, { t: 0.2, ...LOOSE, ease: 'out' }, { t: 0.5, ...BW }] };
  C.bw_draw = { dur: 0.3, hold: true, from: BW, keys: [{ t: 0 }, { t: 0.12, ...AIM, ...NOCK, ease: 'out' }, { t: 0.3, ...AIM, ...FULL, ease: 'out' }] };
  C.bw_shot = { dur: 0.45, keys: [{ t: 0, ...BW, ...AIM, ...FULL }, { t: 0.05, ...LOOSE, ease: 'out' }, { t: 0.45, ...BW }] };

  // ---- grappling hook: arm thrown forward (fire), both hands on the rope (pull)
  C.rope_fire = { dur: 0.3, keys: [{ t: 0 }, { t: 0.1, upperArmR: [-2.0, 0, -0.3], foreArmR: [-0.6, 0, 0], chest: [0, 0.3, 0], ik: [0, null, 1], ease: 'out' }, { t: 0.3, upperArmR: [-1.6, 0, -0.1], foreArmR: [-0.1, 0, 0], ik: [0, null, 1] }] };
  C.rope_pull = { dur: 0.3, hold: true, keys: [{ t: 0, ik: [0, null, 0] }, { t: 0.3, upperArmR: [-2.4, 0, -0.15], foreArmR: [-0.3, 0, 0], upperArmL: [-2.2, 0, 0.15], foreArmL: [-0.5, 0, 0],
    thighL: [-1.0, 0, 0.12], shinL: [1.4, 0, 0], thighR: [-0.4, 0, -0.12], shinR: [0.9, 0, 0], spine: [0.15, 0, 0], ik: [0, null, 0], ease: 'out' }] };
  return C;
}
