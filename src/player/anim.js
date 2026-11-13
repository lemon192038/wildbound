// Hand-written animation system: keyframed euler clips + procedural locomotion, crossfaded in quaternion space,
// followed by IK passes (two-handed weapon grip driven by a keyed weapon trajectory, terrain foot placement).
import * as THREE from 'three';
import { BONE_DEFS, BONE_INDEX, BACK_SOCKET, basisQuat } from './model.js';
import { BLADE } from './weapon.js';

const NB = BONE_DEFS.length;
// flat layout: eulers NB*3 | hip offset 3 | weapon grip 3 | blade dir 3 | edge dir 3 | ik weights: R, L, legs
const OH = NB * 3, OG = OH + 3, OB = OG + 3, OE = OB + 3, OK = OE + 3, SIZE = OK + 3;

// ---------------- authored stances ----------------
const STAND = {
  upperArmL: [0.05, 0, 0.13], upperArmR: [0.05, 0, -0.13], foreArmL: [-0.28, 0, 0], foreArmR: [-0.28, 0, 0], handL: [0, 0.2, 0.08], handR: [0, -0.2, -0.08],
  spine: [0.03, 0, 0], chest: [0.02, 0, 0], neck: [0, 0, 0], head: [-0.03, 0, 0], thighL: [0, 0, 0.03], thighR: [0, 0, -0.03], hips: [0, 0, 0], hip: [0, 0, 0],
  shinL: [0.02, 0, 0], shinR: [0.02, 0, 0], footL: [0, 0, 0], footR: [0, 0, 0],
  w: 'back', ik: [0, 0, 1],
};
const READY_W = { g: [-0.17, -0.3, 0.3], b: [-0.28, -0.42, 1], e: [0, -1, -0.35] };
const READY = {
  ...STAND, hips: [0, 0.35, 0], spine: [0.1, 0.05, 0], chest: [0.08, -0.25, 0], neck: [0, 0.1, 0], head: [0.02, -0.1, 0], hip: [0, -0.06, 0],
  thighL: [-0.3, -0.2, 0.12], shinL: [0.35, 0, 0], footL: [-0.05, 0, 0], thighR: [0.25, -0.35, -0.12], shinR: [0.25, 0, 0], footR: [0.0, 0.0, 0],
  w: READY_W, ik: [1, 1, 1],
};
const GUARD_W = { g: [-0.05, 0.05, 0.33], b: [0.12, 1, 0.05], e: [1, 0, 0.15] };
const TUCK_W = { g: [-0.12, 0.0, 0.22], b: [-0.15, 0.95, -0.25], e: [0, 0, 1] };

const lunge = (d = 1, y = -0.12) => ({ hip: [0, y * d, 0.05 * d], thighL: [-0.75 * d, -0.1, 0.1], shinL: [0.55 * d, 0, 0], footL: [0.2 * d, 0, 0], thighR: [0.45 * d, -0.35, -0.12], shinR: [0.35 * d, 0, 0], footR: [-0.1, 0, 0] });

export const CLIPS = {
  draw: { dur: 0.72, from: STAND, keys: [
    { t: 0 },
    { t: 0.22, upperArmR: [-2.5, 0, -0.35], foreArmR: [-1.7, 0, 0], chest: [0.02, -0.25, 0], head: [0, -0.2, 0], ik: [1, 0, 1] },
    { t: 0.4, w: { g: [-0.27, 0.48, -0.22], b: BACK_SOCKET.b, e: BACK_SOCKET.e }, chest: [-0.05, -0.35, 0], hips: [0, 0.15, 0], ik: [1, 0, 1] },
    { t: 0.56, w: { g: [-0.22, 0.25, 0.25], b: [-0.2, 0.35, 1], e: [0, -1, 0.3] }, ik: [1, 0.6, 1], ...READY, ease: 'out' },
    { t: 0.72, ...READY },
  ] },
  sheathe: { dur: 0.75, from: READY, keys: [
    { t: 0 },
    { t: 0.22, w: { g: [-0.22, 0.25, 0.25], b: [-0.2, 0.35, 1], e: [0, -1, 0.3] }, ik: [1, 0.3, 1], chest: [0, -0.3, 0], hips: [0, 0.1, 0] },
    { t: 0.38, w: { g: [-0.27, 0.48, -0.22], b: BACK_SOCKET.b, e: BACK_SOCKET.e }, ik: [1, 0, 1] },
    { t: 0.5, w: 'back', ik: [1, 0, 1] },
    { t: 0.75, ...STAND, ik: [0, 0, 1] },
  ] },
  light1: { dur: 0.92, from: READY, keys: [
    { t: 0 },
    { t: 0.2, w: { g: [-0.22, 0.33, 0.04], b: [-0.35, 0.78, -0.5], e: [0.3, -0.3, 1] }, chest: [-0.08, -0.65, 0], spine: [-0.05, -0.25, 0], hips: [0, -0.15, 0], head: [0, 0.4, 0], ease: 'inOut' },
    { t: 0.29, w: { g: [-0.05, 0.12, 0.47], b: [0.1, 0.25, 1], e: [0.5, -1, 0.5] }, chest: [0.15, -0.1, 0], spine: [0.15, 0, 0], hips: [0, 0.1, 0], head: [0.1, 0.05, 0], ...lunge(0.7), ease: 'in' },
    { t: 0.37, w: { g: [0.14, -0.33, 0.33], b: [0.55, -0.75, 0.35], e: [0.45, -1, -0.65] }, chest: [0.3, 0.45, 0], spine: [0.25, 0.15, 0], hips: [0, 0.3, 0], head: [0.05, -0.4, 0], ...lunge(1), ease: 'out' },
    { t: 0.56, w: { g: [0.15, -0.36, 0.3], b: [0.6, -0.72, 0.2], e: [0.3, 0.2, -1] }, chest: [0.28, 0.5, 0], ...lunge(1, -0.14) },
    { t: 0.92, ...READY },
  ] },
  light2: { dur: 0.88, from: READY, keys: [
    { t: 0 },
    { t: 0.16, w: { g: [0.16, -0.26, 0.24], b: [0.85, -0.3, 0.3], e: [-0.3, 0.25, 1] }, chest: [0.15, 0.65, 0], spine: [0.15, 0.2, 0], hips: [0, 0.4, 0], head: [0, -0.5, 0], ...lunge(0.6), ease: 'inOut' },
    { t: 0.25, w: { g: [0.0, 0.02, 0.5], b: [0.1, 0.15, 1], e: [-1, 0.3, 0] }, chest: [0.05, 0, 0], spine: [0.05, 0, 0], hips: [0, 0.1, 0], head: [0, 0, 0], ...lunge(0.9), ease: 'in' },
    { t: 0.35, w: { g: [-0.26, 0.2, 0.22], b: [-0.9, 0.35, -0.2], e: [-0.3, 0.2, -1] }, chest: [-0.05, -0.7, 0], spine: [0, -0.25, 0], hips: [0, -0.2, 0], head: [0, 0.5, 0], ...lunge(1), ease: 'out' },
    { t: 0.52, w: { g: [-0.27, 0.18, 0.18], b: [-0.85, 0.3, -0.35], e: [0, 1, 0] }, chest: [-0.05, -0.72, 0] },
    { t: 0.88, ...READY },
  ] },
  light3: { dur: 1.35, from: READY, keys: [
    { t: 0 },
    { t: 0.32, w: { g: [-0.04, 0.52, -0.02], b: [-0.05, 0.55, -1], e: [0, 1, 0.3] }, spine: [-0.25, 0, 0], chest: [-0.2, -0.1, 0], hips: [0, 0.05, 0], head: [-0.25, 0, 0], hip: [0, 0.0, 0], thighL: [-0.4, -0.1, 0.1], shinL: [0.2, 0, 0], thighR: [0.2, -0.3, -0.1], ease: 'inOut' },
    { t: 0.42, w: { g: [-0.02, 0.42, 0.32], b: [0, 1, 0.35], e: [0, -0.35, 1] }, spine: [0.1, 0, 0], chest: [0.05, 0, 0], head: [-0.1, 0, 0], ease: 'in' },
    { t: 0.5, w: { g: [0.0, -0.32, 0.52], b: [0.05, -0.32, 1], e: [0, -1, -0.3] }, spine: [0.5, 0, 0], chest: [0.35, 0, 0], head: [0.2, 0, 0], hips: [0, 0.15, 0], ...lunge(1.25, -0.24), ease: 'out' },
    { t: 0.85, w: { g: [0.0, -0.34, 0.5], b: [0.05, -0.38, 1], e: [0, -1, -0.3] }, spine: [0.5, 0, 0], chest: [0.33, 0, 0] },
    { t: 1.35, ...READY },
  ] },
  charge: { dur: 0.4, hold: true, from: READY, keys: [
    { t: 0 },
    { t: 0.4, w: { g: [-0.2, 0.3, -0.02], b: [-0.3, -0.3, -0.9], e: [0, 1, 0.15] }, chest: [0.05, -0.8, 0], spine: [0.15, -0.3, 0], hips: [0, -0.25, 0], head: [0.05, 0.7, 0], hip: [0, -0.17, -0.03],
      thighL: [-0.55, 0.1, 0.18], shinL: [0.7, 0, 0], thighR: [0.15, -0.5, -0.2], shinR: [0.5, 0, 0], ease: 'out' },
  ] },
  heavy: { dur: 1.25, keys: [
    { t: 0, w: { g: [-0.2, 0.3, -0.02], b: [-0.3, -0.3, -0.9], e: [0, 1, 0.15] }, ...READY, chest: [0.05, -0.8, 0], spine: [0.15, -0.3, 0], hips: [0, -0.25, 0], head: [0.05, 0.7, 0], hip: [0, -0.17, -0.03] },
    { t: 0.05, w: { g: [-0.12, 0.45, 0.12], b: [-0.1, 1, -0.1], e: [0.1, 0.1, 1] }, chest: [0.0, -0.5, 0], spine: [0.05, -0.15, 0], ease: 'in' },
    { t: 0.1, w: { g: [-0.02, 0.22, 0.5], b: [0.05, 0.5, 1], e: [0.4, -1, 0.5] }, chest: [0.2, -0.15, 0], spine: [0.2, 0, 0], hips: [0, 0.05, 0], head: [0.1, 0.1, 0], ...lunge(1.1, -0.18), ease: 'in' },
    { t: 0.17, w: { g: [0.16, -0.38, 0.38], b: [0.6, -0.72, 0.3], e: [0.4, -1, -0.7] }, chest: [0.4, 0.55, 0], spine: [0.35, 0.2, 0], hips: [0, 0.35, 0], head: [0.1, -0.45, 0], ...lunge(1.35, -0.3), ease: 'out' },
    { t: 0.62, w: { g: [0.17, -0.4, 0.36], b: [0.62, -0.7, 0.25], e: [0.3, 0.2, -1] }, chest: [0.38, 0.55, 0], ...lunge(1.3, -0.3) },
    { t: 1.25, ...READY },
  ] },
  // Shoulder tackle: bridge out of a charge/charged slash, super armour; sword pulled back along the hip
  tackle: { dur: 0.62, from: READY, keys: [
    { t: 0 },
    { t: 0.1, w: { g: [-0.2, -0.05, -0.05], b: [-0.25, 0.25, -1], e: [0, 1, 0.2] }, hips: [0, 0.75, 0], spine: [0.25, 0.25, 0], chest: [0.2, 0.35, 0], head: [0.05, -0.8, 0], hip: [0, -0.16, -0.04],
      thighL: [-0.5, 0.2, 0.15], shinL: [0.8, 0, 0], thighR: [0.2, -0.2, -0.15], shinR: [0.5, 0, 0], ik: [1, 0.3, 1], ease: 'out' },
    { t: 0.24, hips: [0, 0.95, 0], spine: [0.4, 0.3, 0.1], chest: [0.25, 0.45, 0.1], head: [0.0, -1.0, 0], hip: [0, -0.24, 0.12], thighL: [-0.95, 0.2, 0.15], shinL: [0.8, 0, 0], footL: [0.3, 0, 0], thighR: [0.55, -0.3, -0.15], shinR: [0.3, 0, 0], ease: 'out' },
    { t: 0.4, hip: [0, -0.22, 0.12] },
    { t: 0.62, ...READY },
  ] },
  // True Charge finisher: higher wind-up, longer two-handed overhead cleave
  trueslash: { dur: 1.5, keys: [
    { t: 0, w: { g: [-0.2, 0.3, -0.02], b: [-0.3, -0.3, -0.9], e: [0, 1, 0.15] }, ...READY, chest: [0.05, -0.8, 0], spine: [0.15, -0.3, 0], hips: [0, -0.25, 0], head: [0.05, 0.7, 0], hip: [0, -0.17, -0.03] },
    { t: 0.07, w: { g: [-0.05, 0.55, 0.05], b: [-0.05, 0.9, -0.5], e: [0, 0.4, 1] }, chest: [-0.25, -0.2, 0], spine: [-0.2, -0.1, 0], hips: [0, -0.05, 0], head: [-0.2, 0.2, 0], hip: [0, 0.02, 0], thighL: [-0.5, -0.1, 0.12], shinL: [0.3, 0, 0], ease: 'out' },
    { t: 0.13, w: { g: [0.0, 0.45, 0.4], b: [0, 1, 0.45], e: [0, -0.4, 1] }, spine: [0.05, 0, 0], chest: [0.0, 0, 0], ease: 'in' },
    { t: 0.21, w: { g: [0.0, -0.36, 0.55], b: [0.03, -0.35, 1], e: [0, -1, -0.35] }, spine: [0.6, 0, 0], chest: [0.4, 0, 0], head: [0.25, 0, 0], hips: [0, 0.1, 0], ...lunge(1.45, -0.32), ease: 'out' },
    { t: 0.85, w: { g: [0.0, -0.38, 0.54], b: [0.03, -0.4, 1], e: [0, -1, -0.35] }, spine: [0.6, 0, 0], chest: [0.4, 0, 0], ...lunge(1.45, -0.33) },
    { t: 1.5, ...READY },
  ] },
  guard: { dur: 0.18, hold: true, from: READY, keys: [
    { t: 0 }, { t: 0.18, w: GUARD_W, chest: [0.05, -0.1, 0], spine: [0.12, 0, 0], hips: [0, 0.2, 0], hip: [0, -0.12, 0], ...lunge(0.5, -0.12), head: [0.08, 0, 0], ease: 'out' },
  ] },
  dodge: { dur: 0.62, keys: [
    { t: 0, ...STAND, w: null, ik: [null, 0, 1] },
    { t: 0.07, hip: [0, -0.3, 0.05], spine: [0.7, 0, 0], chest: [0.35, 0, 0], head: [0.4, 0, 0], thighL: [-1.3, 0, 0.05], shinL: [1.4, 0, 0], thighR: [-0.6, 0, -0.05], shinR: [1.0, 0, 0],
      upperArmL: [-1.2, 0, 0.3], foreArmL: [-1.2, 0, 0], upperArmR: [-1.0, 0, -0.3], foreArmR: [-1.4, 0, 0], ik: [null, 0, 0.6] },
    { t: 0.16, hips: [1.6, 0, 0], hip: [0, -0.5, 0.1], spine: [0.8, 0, 0], chest: [0.5, 0, 0], head: [0.6, 0, 0], thighL: [-1.9, 0, 0.1], shinL: [2.1, 0, 0], thighR: [-1.8, 0, -0.1], shinR: [2.1, 0, 0], ik: [null, 0, 0] },
    { t: 0.3, hips: [3.4, 0, 0], hip: [0, -0.56, 0.1] },
    { t: 0.42, hips: [5.2, 0, 0], hip: [0, -0.48, 0.05], thighL: [-1.6, 0, 0.1], thighR: [-1.2, 0, -0.1], shinL: [2.0, 0, 0], shinR: [1.6, 0, 0] },
    { t: 0.52, hips: [6.283, 0, 0], hip: [0, -0.32, 0], spine: [0.45, 0, 0], chest: [0.2, 0, 0], head: [0.1, 0, 0], thighL: [-1.2, 0, 0.1], shinL: [1.3, 0, 0], thighR: [0.3, 0, -0.1], shinR: [1.2, 0, 0], ik: [null, 0, 1], ease: 'out' },
    { t: 0.62, hips: [6.283, 0, 0], hip: [0, -0.1, 0], spine: [0.15, 0, 0], thighL: [-0.4, 0, 0.05], shinL: [0.5, 0, 0], thighR: [0.1, 0, -0.05], shinR: [0.3, 0, 0] },
  ] },
  hit: { dur: 0.5, keys: [
    { t: 0 },
    { t: 0.07, spine: [-0.35, 0.15, 0.1], chest: [-0.25, 0.2, 0], head: [-0.45, 0, 0.15], hip: [0, -0.06, -0.06], upperArmL: [-0.6, 0, 0.6], upperArmR: [-0.5, 0, -0.6], thighL: [-0.3, 0, 0.1], thighR: [0.2, 0, -0.1], ease: 'out' },
    { t: 0.5 },
  ] },
  knockdown: { dur: 1.2, hold: true, keys: [
    { t: 0, ik: [null, 0, 1] },
    { t: 0.14, hips: [-0.6, 0, 0.1], hip: [0, -0.15, -0.15], spine: [-0.3, 0, 0], chest: [-0.2, 0, 0], head: [0.4, 0, 0], thighL: [-0.9, 0, 0.1], shinL: [0.8, 0, 0], thighR: [-0.5, 0, -0.1], shinR: [0.5, 0, 0],
      upperArmL: [-1.4, 0, 0.9], foreArmL: [-0.6, 0, 0], upperArmR: [-1.4, 0, -0.9], foreArmR: [-0.6, 0, 0], ik: [null, 0, 0], ease: 'out' },
    { t: 0.45, hips: [-1.52, 0, 0.05], hip: [0, -0.78, -0.4], spine: [0.1, 0, 0], chest: [0.05, 0, 0], head: [0.25, 0.3, 0], thighL: [-0.35, 0, 0.15], shinL: [0.4, 0, 0], thighR: [-0.1, 0, -0.2], shinR: [0.2, 0, 0],
      upperArmL: [-0.3, 0, 1.0], foreArmL: [-0.3, 0, 0], upperArmR: [-0.4, 0, -1.1], foreArmR: [-0.5, 0, 0], footL: [-0.6, 0, 0], footR: [-0.6, 0, 0], ease: 'in' },
    { t: 0.6, hip: [0, -0.74, -0.42], head: [0.35, 0.3, 0] }, { t: 1.2, hip: [0, -0.77, -0.42] },
  ] },
  getup: { dur: 0.95, keys: [
    { t: 0 },
    { t: 0.3, hips: [-0.9, 0, 0], hip: [0, -0.62, -0.3], spine: [0.7, 0, 0], chest: [0.3, 0, 0], head: [0.1, 0, 0], thighL: [-1.5, 0, 0.2], shinL: [2.0, 0, 0], thighR: [-0.4, 0, -0.2], shinR: [0.6, 0, 0], footL: [0.2, 0, 0],
      upperArmL: [0.4, 0, 0.4], foreArmL: [-0.2, 0, 0], upperArmR: [0.5, 0, -0.4], foreArmR: [-0.2, 0, 0] },
    { t: 0.62, hips: [0, 0, 0], hip: [0, -0.4, 0], spine: [0.55, 0, 0], chest: [0.2, 0, 0], thighL: [-1.4, 0, 0.15], shinL: [1.9, 0, 0], thighR: [-0.5, 0, -0.15], shinR: [1.6, 0, 0], ik: [null, 0, 1] },
    { t: 0.95 },
  ] },
  dead: { dur: 1.4, hold: true, keys: [
    { t: 0, ik: [null, 0, 1] },
    { t: 0.4, hip: [0, -0.48, 0], spine: [0.45, 0, 0.1], chest: [0.2, 0, 0], head: [0.5, 0, 0], thighL: [-0.15, 0, 0.12], shinL: [1.6, 0, 0], thighR: [-0.25, 0, -0.1], shinR: [1.6, 0, 0], footL: [0.8, 0, 0], footR: [0.8, 0, 0],
      upperArmL: [-0.3, 0, 0.2], upperArmR: [-0.3, 0, -0.2], ik: [null, 0, 0], ease: 'out' },
    { t: 0.6, hip: [0, -0.5, 0] },
    { t: 1.1, hips: [1.5, 0, 0.2], hip: [0, -0.84, 0.35], spine: [0.0, 0, 0], chest: [0.0, 0, 0], head: [-0.4, 0.9, 0], thighL: [0.1, 0, 0.15], shinL: [0.3, 0, 0], thighR: [0.0, 0, -0.1], shinR: [0.6, 0, 0], footL: [0.9, 0, 0], footR: [0.9, 0, 0],
      upperArmL: [-2.6, 0, 0.3], foreArmL: [-0.3, 0, 0], upperArmR: [-0.4, 0, -0.5], foreArmR: [-0.6, 0, 0], ease: 'in' },
    { t: 1.4, hip: [0, -0.86, 0.35] },
  ] },
  potion: { dur: 1.5, from: STAND, keys: [
    { t: 0 },
    { t: 0.3, upperArmR: [-1.55, 0, -0.32], foreArmR: [-1.9, 0, 0], handR: [0.4, 0, 0], head: [-0.15, 0, 0], ease: 'out' },
    { t: 0.55, upperArmR: [-1.95, 0, -0.3], foreArmR: [-2.0, 0, 0], handR: [0.8, 0, 0], head: [-0.45, 0, 0], chest: [-0.12, 0, 0], spine: [-0.05, 0, 0] },
    { t: 1.05, head: [-0.5, 0, 0] },
    { t: 1.5, ...STAND },
  ] },
  whetstone: { dur: 1.8, from: STAND, keys: [
    { t: 0 },
    { t: 0.3, hip: [0, -0.3, 0], spine: [0.5, 0, 0], chest: [0.15, 0, 0], head: [0.35, 0, 0], thighL: [-1.2, 0, 0.15], shinL: [1.4, 0, 0], thighR: [0.2, 0, -0.1], shinR: [1.6, 0, 0], footR: [0.9, 0, 0],
      upperArmL: [-0.9, 0, 0.1], foreArmL: [-1.0, 0, 0], upperArmR: [-0.8, 0, -0.1], foreArmR: [-1.1, 0, 0], ease: 'out' },
    { t: 1.5 },
    { t: 1.8, ...STAND },
  ] },
};

// -------- resolve clip keys into flat arrays (carry-forward) --------
function writeKey(arr, k) {
  for (const [name, v] of Object.entries(k)) {
    if (name in BONE_INDEX) { const o = BONE_INDEX[name] * 3; arr[o] = v[0]; arr[o + 1] = v[1]; arr[o + 2] = v[2]; }
  }
  if (k.hip) { arr[OH] = k.hip[0]; arr[OH + 1] = k.hip[1]; arr[OH + 2] = k.hip[2]; }
  if (k.w !== undefined && k.w !== null) {
    const w = k.w === 'back' ? BACK_SOCKET : k.w;
    for (let i = 0; i < 3; i++) { arr[OG + i] = w.g[i]; arr[OB + i] = w.b[i]; arr[OE + i] = w.e[i]; }
  }
  if (k.ik) for (let i = 0; i < 3; i++) if (k.ik[i] !== null && k.ik[i] !== undefined) arr[OK + i] = k.ik[i];
}
const BASE = new Float32Array(SIZE); writeKey(BASE, STAND);
const READY_ARR = new Float32Array(SIZE); writeKey(READY_ARR, READY);
for (const clip of Object.values(CLIPS)) {
  let prev = new Float32Array(SIZE); prev.set(BASE); if (clip.from) writeKey(prev, clip.from);
  clip.resolved = clip.keys.map((k) => { const a = new Float32Array(prev); writeKey(a, k); prev = a; return { t: k.t, ease: k.ease || 'inOut', a, dyn: k.ik ? k.ik.map((v) => v === null) : [false, false, false] }; });
}
const EASE = { inOut: (x) => x * x * (3 - 2 * x), in: (x) => x * x * x, out: (x) => 1 - (1 - x) ** 3, linear: (x) => x };
const cr = (p0, p1, p2, p3, t) => { const t2 = t * t, t3 = t2 * t; return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3); };

export function sampleClip(name, t, out) {
  const clip = CLIPS[name], R = clip.resolved;
  t = Math.min(Math.max(t, 0), clip.dur);
  let i = 0; while (i < R.length - 2 && t > R[i + 1].t) i++;
  const A = R[i], B = R[Math.min(i + 1, R.length - 1)];
  if (A === B || B.t <= A.t) { out.set(A.a); return out; }
  const u = EASE[B.ease]((t - A.t) / (B.t - A.t));
  for (let j = 0; j < SIZE; j++) out[j] = A.a[j] + (B.a[j] - A.a[j]) * u;
  // weapon grip path: catmull-rom through neighbouring keys for round arcs
  const P0 = R[Math.max(0, i - 1)].a, P3 = R[Math.min(R.length - 1, i + 2)].a;
  for (let j = OG; j < OG + 3; j++) out[j] = cr(P0[j], A.a[j], B.a[j], P3[j], u);
  return out;
}

// procedural locomotion (idle / walk / run / sprint), drawn or sheathed
export function sampleLoco(out, phase, amt, drawn, sprint, time) {
  out.set(drawn ? READY_ARR : BASE);
  const s = Math.sin(phase), c = Math.cos(phase), a = amt, sp = sprint ? 1 : 0;
  const set = (b, x, y = 0, z = 0) => { const o = BONE_INDEX[b] * 3; out[o] += x; out[o + 1] += y; out[o + 2] += z; };
  const br = Math.sin(time * 1.7) * (1 - Math.min(1, a));
  set('chest', 0.025 * br); set('upperArmL', 0, 0, 0.02 * br); set('upperArmR', 0, 0, -0.02 * br); set('head', -0.015 * br);
  if (a > 0.001) {
    const st = 0.5 + 0.18 * sp; // stride amplitude
    if (drawn) { // settle into a forward walking stance from the wide ready stance
      for (const b of ['thighL', 'thighR', 'shinL', 'shinR', 'footL', 'footR']) { const o = BONE_INDEX[b] * 3; for (let k = 0; k < 3; k++) out[o + k] = BASE[o + k] + (out[o + k] - BASE[o + k]) * Math.max(0, 1 - a * 1.5); }
      out[BONE_INDEX.hips * 3 + 1] = 0.35 * Math.max(0.3, 1 - a);
    }
    set('thighL', -st * a * s); set('thighR', st * a * s);
    const kneeL = Math.pow(Math.max(0, c), 1.4), kneeR = Math.pow(Math.max(0, -c), 1.4);
    const run = Math.min(1, Math.max(0, (a - 0.55) / 0.45)); // 0 walk .. 1 run: heavier, more grounded gait
    set('shinL', a * (0.12 + (0.9 + 0.5 * sp) * kneeL) + 0.32 * run * Math.max(0, s) ** 2); set('shinR', a * (0.12 + (0.9 + 0.5 * sp) * kneeR) + 0.32 * run * Math.max(0, -s) ** 2);
    set('thighL', -0.12 * run * Math.max(0, s) ** 2); set('thighR', -0.12 * run * Math.max(0, -s) ** 2);
    out[OH + 1] += -0.05 * run * Math.sin(phase) ** 2 - 0.03 * run; // weight drop on each foot strike
    set('hips', 0, 0, 0.06 * run * s); set('chest', 0.04 * run, 0, -0.05 * run * s); set('spine', 0.1 * run); set('head', -0.04 * run);
    set('footL', a * 0.35 * Math.max(0, -s) - a * 0.2 * kneeL); set('footR', a * 0.35 * Math.max(0, s) - a * 0.2 * kneeR);
    out[OH + 1] += -0.025 * a - 0.035 * a * Math.abs(Math.sin(phase)) * (0.6 + 0.6 * sp) + (drawn ? 0.02 * a : 0);
    set('hips', 0.02 * a, 0.1 * a * s, 0.03 * a * c); set('spine', (0.06 + 0.22 * sp) * a, -0.06 * a * s); set('chest', 0.02 * a, -0.08 * a * s); set('head', -0.05 * a * (1 + sp));
    if (!drawn) {
      const arm = 0.42 + 0.35 * sp;
      set('upperArmL', arm * a * s, 0, 0.05 * sp); set('upperArmR', -arm * a * s, 0, -0.05 * sp);
      set('foreArmL', -a * (0.25 + 0.7 * sp) - 0.25 * a * Math.max(0, -s)); set('foreArmR', -a * (0.25 + 0.7 * sp) - 0.25 * a * Math.max(0, s));
    } else {
      out[OG + 1] += 0.02 * a * Math.cos(phase * 2); out[OG + 2] += 0.03 * a; out[OB + 1] += 0.1 * a;
    }
  }
  return out;
}

// ---------------- IK helpers ----------------
const _pa = new THREE.Vector3(), _pb = new THREE.Vector3(), _pc = new THREE.Vector3(), _d = new THREE.Vector3(), _pv = new THREE.Vector3(), _kn = new THREE.Vector3(), _en = new THREE.Vector3();
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion(), _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion();
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _s = new THREE.Vector3();
const wpos = (b, v) => v.setFromMatrixPosition(b.matrixWorld);
const wquat = (b, q) => { b.matrixWorld.decompose(_v1, q, _s); return q; };
function rotateToward(bone, from, to) {
  _q1.setFromUnitVectors(from.normalize(), to.normalize());
  wquat(bone, _q2); wquat(bone.parent, _q3);
  _q2.premultiply(_q1); bone.quaternion.copy(_q3.invert().multiply(_q2));
  bone.updateMatrixWorld(true);
}
export function setWorldQuat(bone, q, w = 1) {
  wquat(bone.parent, _q3); _qa.copy(_q3.invert().multiply(q));
  bone.quaternion.slerp(_qa, w); bone.updateMatrixWorld(true);
}
export function twoBoneIK(A, B, C, target, pole, w = 1) {
  if (w <= 0.001) return;
  _qa.copy(A.quaternion); _qb.copy(B.quaternion);
  wpos(A, _pa); wpos(B, _pb); wpos(C, _pc);
  const lab = _pa.distanceTo(_pb), lbc = _pb.distanceTo(_pc);
  _d.subVectors(target, _pa); const d = Math.min(Math.max(_d.length(), 0.02), (lab + lbc) * 0.9995); _d.normalize();
  _pv.subVectors(pole, _pa); _pv.addScaledVector(_d, -_pv.dot(_d));
  if (_pv.lengthSq() < 1e-8) { _pv.subVectors(_pb, _pa); _pv.addScaledVector(_d, -_pv.dot(_d)); }
  _pv.normalize();
  const cosA = Math.min(1, Math.max(-1, (lab * lab + d * d - lbc * lbc) / (2 * lab * d))), sinA = Math.sqrt(1 - cosA * cosA);
  _kn.copy(_pa).addScaledVector(_d, cosA * lab).addScaledVector(_pv, sinA * lab);
  _en.copy(_pa).addScaledVector(_d, d);
  rotateToward(A, _v2.subVectors(_pb, _pa), _kn.clone().sub(_pa));
  wpos(B, _pb); wpos(C, _pc);
  rotateToward(B, _v2.subVectors(_pc, _pb), _en.clone().sub(_pb));
  if (w < 1) { A.quaternion.copy(_qa.slerp(A.quaternion, w)); B.quaternion.copy(_qb.slerp(B.quaternion, w)); A.updateMatrixWorld(true); }
}

// ---------------- Animator ----------------
const _e = new THREE.Euler(), _b = new THREE.Vector3(), _ed = new THREE.Vector3();
export class Animator {
  constructor(rig) {
    this.rig = rig; this.cur = new Float32Array(SIZE); this.tmp = new Float32Array(SIZE);
    this.outQ = Array.from({ length: NB }, () => new THREE.Quaternion()); this.snapQ = Array.from({ length: NB }, () => new THREE.Quaternion());
    this.tgtQ = Array.from({ length: NB }, () => new THREE.Quaternion());
    this.outH = new THREE.Vector3(); this.snapH = new THREE.Vector3(); this.outG = new THREE.Vector3(); this.snapG = new THREE.Vector3();
    this.outWQ = new THREE.Quaternion(); this.snapWQ = new THREE.Quaternion(); this.outK = [0, 0, 1]; this.snapK = [0, 0, 1];
    this.fade = 0; this.fadeDur = 0; this.key = null; this.hipDrop = 0;
  }
  crossfade(dur) {
    for (let i = 0; i < NB; i++) this.snapQ[i].copy(this.outQ[i]);
    this.snapH.copy(this.outH); this.snapG.copy(this.outG); this.snapWQ.copy(this.outWQ); this.snapK = [...this.outK];
    this.fade = 0; this.fadeDur = dur;
  }
  // flat: pose array; dt for fade progress. Dynamic ik weights (null in keys) keep the previous value.
  apply(flat, dt, dynIK) {
    const f = this.fadeDur > 0 ? Math.min(1, (this.fade += dt) / this.fadeDur) : 1, k = f * f * (3 - 2 * f);
    for (let i = 0; i < NB; i++) {
      _e.set(flat[i * 3], flat[i * 3 + 1], flat[i * 3 + 2]); this.tgtQ[i].setFromEuler(_e);
      this.outQ[i].copy(this.snapQ[i]).slerp(this.tgtQ[i], k);
    }
    this.outH.set(flat[OH], flat[OH + 1], flat[OH + 2]).lerp(this.snapH, 1 - k);
    this.outG.set(flat[OG], flat[OG + 1], flat[OG + 2]).lerp(this.snapG, 1 - k);
    _b.set(flat[OB], flat[OB + 1], flat[OB + 2]); _ed.set(flat[OE], flat[OE + 1], flat[OE + 2]);
    basisQuat(_b, _ed, _q1); this.outWQ.copy(this.snapWQ).slerp(_q1, k);
    for (let i = 0; i < 3; i++) this.outK[i] = this.snapK[i] + (flat[OK + i] - this.snapK[i]) * k;
  }
  writeBones() {
    const { bones, BIND } = this.rig;
    BONE_DEFS.forEach(([name], i) => bones[name].quaternion.copy(this.outQ[i]));
    bones.hips.position.set(this.outH.x, BIND.hips.y + this.outH.y - this.hipDrop, this.outH.z);
  }
}
export { SIZE as POSE_SIZE, OG, OB, OE, OK };
export const READY_POSE = READY_ARR;
// generic clips (dodge/hit/knockdown...) were authored without the weapon: when it is in hand, hold it tucked
export function applyTuck(flat, ikL = 0) {
  for (let i = 0; i < 3; i++) { flat[OG + i] = TUCK_W.g[i]; flat[OB + i] = TUCK_W.b[i]; flat[OE + i] = TUCK_W.e[i]; }
  flat[OK] = 1; flat[OK + 1] = ikL;
}
