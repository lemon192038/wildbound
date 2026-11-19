// Local hunter: state machine, camera-relative movement, stamina, greatsword combat (startup/active/recovery,
// charge levels, hitstop), damage intake, death/respawn, lock-on, autoplay debug. Also remote hunters for co-op.
import * as THREE from 'three';
import { deflects, wearFactor } from '../core/parts.js';
import { noteDamage } from '../core/rights.js';
import { HunterView } from './hunterView.js';
import { CLIPS } from './anim.js';
import { WeaponTrail, Sparks } from './vfx.js';
import { createGrapple, GRAPPLE } from './grapple.js';
import { t as tr } from '../shared/i18n.js';
import { WEAPON_CLASSES, CLASS_MOVES, CHARGES, classOf, ARROWS_BY_LEVEL, arrowFalloff, MELODIES } from '../shared/weaponClasses.js';

const ATTACK_POWER = 210;
// t in seconds within the clip. move: [t0, t1, metres forward]. turn: until t the attack can still be aimed.
const ATTACKS = {
  light1: { mv: 0.34, active: [0.22, 0.39], move: [[0.16, 0.36, 0.7]], turn: 0.16, next: 'light2', combo: [0.4, 0.86], cancel: 0.6, stop: 0.07, shake: 0.28 },
  light2: { mv: 0.3, active: [0.17, 0.37], move: [[0.1, 0.32, 0.6]], turn: 0.12, next: 'light3', combo: [0.37, 0.82], cancel: 0.56, stop: 0.07, shake: 0.26 },
  light3: { mv: 0.6, active: [0.4, 0.54], move: [[0.3, 0.5, 0.9]], turn: 0.3, next: null, combo: [0.9, 1.3], cancel: 0.95, stop: 0.13, shake: 0.55, slam: 0.5 },
  heavy: { mv: [0.45, 0.72, 1.0, 1.4], active: [0.06, 0.2], move: [[0.0, 0.16, 0.85]], turn: 0.0, next: null, combo: [0.7, 1.2], cancel: 0.8, stop: [0.09, 0.12, 0.15, 0.19], shake: [0.35, 0.5, 0.7, 0.95], slam: 0.17 },
  // shoulder tackle bridge (super armour) -> True Charge
  tackle: { mv: 0.22, active: [0.14, 0.34], move: [[0.06, 0.3, 1.9]], turn: 0.08, next: null, combo: [0.26, 0.62], cancel: 0.4, stop: 0.08, shake: 0.32, tackle: true },
  // jump attack: the overhead slam played from its raised pose once the hunter lands (mv grows with the fall)
  plungeLand: { mv: 0.7, active: [0.4, 0.54], move: [[0.38, 0.5, 0.4]], turn: 0.0, next: null, combo: [0.9, 1.3], cancel: 0.8, stop: 0.14, shake: 0.6, slam: 0.48, clip: 'light3' },
  trueslash: { mv: [0.85, 1.25, 1.65, 2.2], active: [0.1, 0.24], move: [[0.02, 0.2, 1.0]], turn: 0.0, next: null, combo: [0.95, 1.45], cancel: 1.0, stop: [0.1, 0.14, 0.18, 0.22], shake: [0.45, 0.6, 0.8, 1.0], slam: 0.21 },
};
const CHARGE_LV = [0.55, 1.15, 1.75], CHARGE_MAX = 2.6, TRUE_LV = [0.42, 0.86, 1.3];
Object.assign(ATTACKS, CLASS_MOVES); // the other weapon classes (src/shared/weaponClasses.js) share the attack pipeline
const LOCO = new Set(['idle', 'walk', 'run', 'sprint']);
// Rolling: distance (m) and the invulnerable window (s into the roll). Exposed as P.roll for tuning / tests.
const ROLL = { dist: 3.2, iStart: 0.03, iEnd: 0.3 };
const HOLD_SHEATHE = 0.45, PARRY_WIN = 0.25, JUMP_V = 6.4, GRAVITY = 20;
const AIR = new Set(['jump', 'plunge', 'ropePull', 'st_air']);
const SELF_MOVE = new Set(['draw', 'sheathe', 'item', 'whetstone', 'getup', 'parryPrep', 'parry', 'parryMiss']); // states that steer/decelerate with normal locomotion physics
const STATE_CLIP = { draw: 'draw', sheathe: 'sheathe', light1: 'light1', light2: 'light2', light3: 'light3', charge: 'charge', tcharge: 'charge', heavy: 'heavy', tackle: 'tackle', trueslash: 'trueslash', guard: 'guard', dodge: 'dodge', hit: 'hit', knockdown: 'knockdown', getup: 'getup', dead: 'dead', jump: 'jump', plunge: 'light3', plungeLand: 'light3', parryPrep: 'guard', parry: 'guard', parryMiss: 'hit', sleep: 'knockdown', stun: 'hit', ropeFire: 'rope_fire', ropePull: 'rope_pull', item: 'potion', whetstone: 'whetstone' };
// animation clip for a state (per weapon class: shield guards, charged-move holds, class moves)
function clipOf(s, cls = 'greatsword') {
  if (s === 'reload') return cls === 'pistol' ? 'pistol_reload' : 'gun_reload';
  if (s === 'mgfire') return 'mg_fire';
  if (s === 'guard') { const g = classOf(cls).guard; if (g === 'shield') return 'sw_guard'; if (g === 'tower') return 'ln_guard'; }
  return ATTACKS[s]?.clip || CHARGES[s]?.clip || STATE_CLIP[s] || null;
}
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const sharpMult = (s) => (s > 0.66 ? 1.2 : s > 0.4 ? 1.05 : s > 0.2 ? 0.9 : 0.72);

export async function createPlayer(game) {
  const { scene, events, world } = game;
  const view = new HunterView(game, {});
  const object3d = view.root; scene.add(object3d);
  const trail = new WeaponTrail(scene), sparks = new Sparks(scene);
  const autoplay = game.params?.get('autoplay') === '1';

  const P = {
    id: 'local', name: 'Hunter', object3d, position: object3d.position, facing: Math.PI, hp: 150, maxHp: 150, redHp: 150, stamina: 100, maxStamina: 100,
    sharpness: 1, state: 'idle', lockTarget: null, weaponDrawn: false, potions: 10, chargeLevel: 0, dead: false, exhausted: false, respawnTime: 0, view,
  };
  P.recoverableHp = P.redHp;
  const vel = new THREE.Vector3(), wish = new THREE.Vector3(), tmp = new THREE.Vector3(), camF = new THREE.Vector3(), camR = new THREE.Vector3();
  let frozenLoco = null, t = 0, frozen = false, phase = 0, amt = 0, iframe = 0, invuln = 0, stamDelay = 0, queued = null, buffer = null, heavyLevel = 0;
  let hitSets = new Map(), hitCount = 0, swingFirstHit = false, lastLevel = 0, attachDone = false, healLeft = 0, deadT = 0, itemKind = 'potion';
  let holdT = -1, parryReady = false, vy = 0, airborne = false, fallFrom = 0, plungeMv = 0.7, animT = null, pendingFlinch = 0, lastGround = 0, lastX = 0, lastZ = 0;
  let M = { atk: 1, def: 1, speed: 1, atkSpeed: 1, affinity: 0, critDmg: 1, elem: 1, elemRes: 1, heal: 1, stamRegen: 1 }, B = {};
  let slowT = 0, superArmor = false, sinceHit = 99, clock = 0, prevBlade = [], curBlade = [], speedNow = 0, footSide = 0, stunT = 0;
  const spawn = () => {
    const s = P.respawnAt || world.spawn.player; P.respawnAt = null; P.position.set(s.x, world.getHeight(s.x, s.z), s.z); lastGround = P.position.y; lastX = s.x; lastZ = s.z;
    const m = game.monsters?.[0]; P.facing = m ? Math.atan2(m.position.x - s.x, m.position.z - s.z) : Math.PI;
  };
  spawn();

  function setState(s, fade = 0.12) {
    P.state = s; t = 0; attachDone = false; animT = null;
    const clip = clipOf(s, P.cls); if (clip) view.play(clip, fade); else view.play('loco', fade);
    if (ATTACKS[s]) { hitSets = new Map(); hitCount = 0; swingFirstHit = false; trail.clear(); }
  }
  P.setState = setState;
  P.roll = { ...ROLL };
  // ---- weapon class (src/shared/weaponClasses.js): the equipped weapon decides moves, reach, speed, guard, roll
  P.cls = 'greatsword'; let C = classOf('greatsword'), focus = 0, focusLv = 0, focusT = 0;
  // class resources: mode (transforming weapons), gauge (Shift Axe), energy + vials (Bulwark Axe), ammo (guns, Cannon Lance),
  // heat (Machine Gun), notes + melodies + horn buffs (War Horn)
  const RES = { mode: null, gauge: 1, energy: 0, vials: 0, ammo: 0, heat: 0, lock: 0, notes: [], melodies: [], buff: { atk: 0, def: 0, stam: 0 }, fireT: 0 };
  P.res = RES;
  const hornAtk = () => (RES.buff.atk > 0 ? MELODIES.aab.mul : 1), hornDef = () => (RES.buff.def > 0 ? MELODIES.abb.mul : 1);
  const guardOk = () => !!C.guard && !(P.cls === 'bulwarkaxe' && RES.mode === 'axe');
  function setMode(m) { RES.mode = m; view.setWeaponMode?.(m); events.emit('player:mode', { mode: m }); }
  P.setWeaponClass = (id) => {
    if (!WEAPON_CLASSES[id]) id = 'greatsword'; if (id === P.cls && view.cls) return;
    P.cls = id; C = classOf(id); view.setWeaponClass(id); P.roll.dist = C.roll; focus = 0; focusLv = 0;
    RES.mode = C.modes ? Object.keys(C.modes)[0] : null; RES.gauge = 1; RES.energy = 0; RES.vials = 0; RES.ammo = C.ammo?.clip || 0; RES.heat = 0; RES.lock = 0; RES.notes = []; RES.melodies = [];
    if (RES.mode) view.setWeaponMode?.(RES.mode); // model and player start in the same form
    if (ATTACKS[P.state] || CHARGES[P.state] || P.state === 'charge' || P.state === 'tcharge') setState('idle', 0.1);
    events.emit('player:weaponClass', { cls: id });
  };
  Object.defineProperty(P, 'focus', { get: () => ({ gauge: focus, level: focusLv }) });
  events.on('status:apply', (e) => { if (e?.kind === 'flinch') pendingFlinch = Math.max(pendingFlinch, e.t || 0.6); });
  Object.defineProperty(P, 'parryReady', { get: () => parryReady, set: (v) => { parryReady = !!v; } });
  Object.defineProperty(P, 'airborne', { get: () => airborne });
  const fwd = (out = tmp) => out.set(Math.sin(P.facing), 0, Math.cos(P.facing));
  const turnToward = (dir, rate, dt) => { if (dir.lengthSq() < 1e-4) return; const want = Math.atan2(dir.x, dir.z); P.facing = wrap(P.facing + clamp(wrap(want - P.facing), -rate * dt, rate * dt)); };
  // ---- lock-on by part: LOCK picks the nearest monster's first part, each further press moves to the next part, then off
  P.lockPart = null;
  const partsOf = (m) => { const out = []; for (const h of m?.getHitboxes?.() || []) if (!out.includes(h.part)) out.push(h.part); return out; };
  P.lockPointOf = (out = new THREE.Vector3()) => {
    const m = P.lockTarget; if (!m) return null; const hbs = m.getHitboxes?.() || [];
    const hb = hbs.find((h) => h.part === P.lockPart) || hbs[0]; return hb ? out.copy(hb.sphere.center) : out.copy(m.position);
  };
  function cycleLock() {
    if (P.lockTarget) {
      const parts = partsOf(P.lockTarget); const i = parts.indexOf(P.lockPart) + 1;
      if (i <= 0 || i >= parts.length) { P.lockTarget = null; P.lockPart = null; } else P.lockPart = parts[i];
    } else {
      let best = null, bd = 80; const cands = game.fauna ? game.monsters.concat(game.fauna.near(P.position, 40)) : game.monsters;
      for (const m of cands) { if (!m || m.hp <= 0 || m.dead || m.state === 'dead') continue; const d = m.position.distanceTo(P.position); if (d < bd) { bd = d; best = m; } }
      P.lockTarget = best; P.lockPart = best ? partsOf(best)[0] || null : null;
    }
    events.emit('player:lockPart', { target: P.lockTarget, part: P.lockPart });
  }
  const targetDir = () => { const m = P.lockTarget; if (!m) return null; const lp = P.lockPointOf(_lp); return new THREE.Vector3(lp.x - P.position.x, 0, lp.z - P.position.z).normalize(); };
  const _lp = new THREE.Vector3();
  const aimDir = () => (wish.lengthSq() > 0.01 ? wish : targetDir() || new THREE.Vector3());
  // Equipment & buffs (set by the field quest runtime from the server-side loadout; defaults = free hunt).
  P.gear = { atk: 1, affinity: 12, element: null, sharp: 1, defense: 0, res: { fire: 0, water: 0, thunder: 0, ice: 0, dragon: 0 }, skills: {}, buffAtk: 1, buffDef: 1, stamMul: 1 };
  P.setGear = (st) => {
    const sk = st.skills || {}; const g = P.gear;
    g.atk = (st.attack || 480) / 480 * (1 + 0.03 * (sk.attackBoost || 0)); g.affinity = (st.affinity || 0) + 5 * (sk.critEye || 0) + 5;
    g.element = st.element || null; g.sharp = st.sharp || 1; g.defense = st.defense || 0; g.res = { ...g.res, ...(st.res || {}) }; g.skills = sk;
    g.stamMul = 1 - 0.12 * (sk.constitution || 0);
    if (st.cls && !game.params?.get?.('weapon')) P.setWeaponClass(st.cls); // ?weapon=<class> (try-out / tests) wins
    const hpMax = 150 + 15 * (sk.healthBoost || 0); const f = P.hp / P.maxHp; P.maxHp = hpMax; P.hp = Math.round(hpMax * f); P.redHp = Math.max(P.redHp, P.hp);
  };
  const useStamina = (n) => { n *= P.gear.stamMul; if (P.stamina < n * 0.5) return false; P.stamina = Math.max(0, P.stamina - n); stamDelay = 0.7; return true; };

  function startAttack(kind) {
    if (!P.weaponDrawn) { queued = kind; setState('draw'); return; }
    if (P.cls !== 'greatsword') { const set = C.modes ? C.modes[RES.mode] : C; startMove(kind === 'light' ? set.light : set.heavy); return; }
    if (kind === 'light') setState('light1', 0.1);
    else if (kind === 'heavy') { setState('charge', 0.12); lastLevel = 0; }
  }
  // a class move by name (combo links go through here so stamina / Focus requirements always apply)
  function startMove(name) {
    if (name === 'mgfire') { if (RES.lock > 0) { events.emit('player:overheat', {}); return false; } setState('mgfire', 0.06); RES.fireT = 0; return true; }
    if (CHARGES[name]) { if (C.ammo && RES.ammo <= 0) { setState('reload', 0.1); return true; } setState(name, 0.1); lastLevel = 0; return true; }
    const a = ATTACKS[name]; if (!a) return false;
    if (a.ammo && C.ammo && RES.ammo < a.ammo) { setState('reload', 0.1); return true; }                 // empty: reload first
    if (P.cls === 'shiftaxe' && RES.mode === 'sword' && a.gauge < 0 && RES.gauge < -a.gauge) return startMove('sx_morph'); // out of gauge: back to the axe
    if (a.gaugeAll && RES.gauge < 0.3) return false;
    if (a.note) { RES.notes.push(a.note); if (RES.notes.length > 3) RES.notes.shift(); const k = RES.notes.join(''); if (MELODIES[k] && RES.melodies.length < 3 && !RES.melodies.includes(k)) { RES.melodies.push(k); RES.notes = []; events.emit('player:melodyReady', { melody: k }); } }
    if (a.focusCost && focus < a.focusCost) return startMove('ls_rise');      // not enough Focus: the plain rising slash
    if (a.stam && !useStamina(a.stam)) return false;
    if (a.focusCost) focus -= a.focusCost;
    if (a.ammo && C.ammo) RES.ammo -= a.ammo;
    if (a.gauge) RES.gauge = Math.max(0, Math.min(1, RES.gauge + a.gauge));
    if (a.morph) setMode(P.cls === 'shiftaxe' ? (RES.mode === 'axe' ? 'sword' : 'axe') : (RES.mode === 'sword' ? 'axe' : 'sword'));
    setState(name, 0.07); return true;
  }
  function startDodge() {
    if (!useStamina(25)) return false;
    const d = wish.lengthSq() > 0.01 ? wish.clone() : fwd(new THREE.Vector3());
    P.facing = Math.atan2(d.x, d.z); setState('dodge', 0.06); events.emit('sfx', { name: 'dodge', position: P.position.clone(), volume: 0.7 }); return true;
  }
  // useItem('potion' | 'whetstone', opts?) — opts { id, heal, onUse() } lets the quest runtime drive any
  // consumable through the drinking animation (onUse fires at the swallow frame; the runtime owns counts).
  let itemOpts = null, queuedOpts = null;
  function startItem(kind, opts = null) {
    if (P.weaponDrawn && !C.items) { queued = 'item:' + kind; queuedOpts = opts; setState('sheathe'); return; }
    if (kind === 'potion' && !opts && P.potions <= 0) return;
    itemKind = kind; itemOpts = opts; setState(kind === 'potion' ? 'item' : 'whetstone', 0.15);
  }
  P.useItem = startItem;
  function startJump() {
    airborne = true; vy = JUMP_V; fallFrom = P.position.y; setState('jump', 0.08); holdT = -1;
    events.emit('sfx', { name: 'dodge', position: P.position.clone(), volume: 0.5 });
  }
  function startFall() { airborne = true; vy = 0; fallFrom = P.position.y; setState('jump', 0.15); }
  function startPlunge() {
    if (!P.weaponDrawn) { P.weaponDrawn = true; view.setInHand(true); events.emit('sfx', { name: 'draw', position: P.position.clone(), volume: 0.8 }); }
    if (parryReady) { parryReady = false; events.emit('player:parryReady', { on: false }); }
    vy = Math.min(vy, -3); setState('plunge', 0.06);
  }
  // ---------------- grappling hook (aim with the ROPE button, fire, pull, release into the air) ----------------
  const rope = typeof document !== 'undefined' ? createGrapple(game) : null;
  let ropeA = null, ropeCd = 0; const _ra = new THREE.Vector3(), _rw = new THREE.Vector3();
  Object.defineProperty(P, 'ropeCooldown', { get: () => ropeCd });
  Object.defineProperty(P, 'rope', { get: () => ropeA && { kind: ropeA.kind, state: P.state, anchor: ropeA.point } });
  const ROPE_OK = new Set(['idle', 'walk', 'run', 'sprint', 'jump', 'guard', 'parryPrep']);
  // P.grappleTo(hit) — used by input (after picking) and by tests: { point, kind, target?, part?, offset? }
  P.grappleTo = (A) => {
    if (!A || ropeCd > 0 || P.dead || !ROPE_OK.has(P.state)) return false;
    ropeA = { ...A, point: A.point.clone(), from: P.position.clone(), t: 0 }; ropeCd = GRAPPLE.cooldown; holdT = -1;
    P.facing = Math.atan2(A.point.x - P.position.x, A.point.z - P.position.z);
    setState('ropeFire', 0.06); events.emit('sfx', { name: 'swing', position: P.position.clone(), volume: 0.6 }); events.emit('player:rope', { kind: A.kind });
    return true;
  };
  function ropeRelease(reason = 'contact') {
    if (!ropeA) return; ropeA = null; rope?.hide();
    if (P.state === 'ropeFire' || P.state === 'ropePull') {
      if (airborne) { fallFrom = P.position.y; vel.multiplyScalar(0.55); vy = Math.max(vy * 0.4, reason === 'contact' ? 2.5 : 0); setState('jump', 0.12); } // straight into the air (plunge possible)
      else setState('idle', 0.15);
    }
    events.emit('player:ropeRelease', { reason });
  }
  P.ropeRelease = ropeRelease;
  P.ropePick = (screen = 'center') => rope?.pick(screen, P.position) || null;
  const waist = () => view.rig.bones.hips.getWorldPosition(_rw);
  function ropeTick(dt, s) {
    if (!ropeA) { rope?.hide(); return; }
    if (s !== 'ropeFire' && s !== 'ropePull') { ropeRelease('interrupted'); return; }   // hit, knocked down, died…
    const A = rope ? rope.anchorOf(ropeA, _ra) : _ra.copy(ropeA.point);
    if (!A) { ropeRelease('lost'); return; }                                              // the monster died / the part is gone
    ropeA.t += dt;
    if (s === 'ropeFire') {
      rope?.draw(waist(), A, 0.3, Math.min(1, ropeA.t / GRAPPLE.fly));
      if (ropeA.t >= GRAPPLE.fly) { setState('ropePull', 0.08); airborne = true; fallFrom = P.position.y; vy = Math.max(vy, 3); events.emit('sfx', { name: 'clang', position: A.clone(), volume: 0.5 }); }
      return;
    }
    // pull: accelerate along the rope toward the anchor (a moving anchor drags the hunter along)
    _ra.y += 0; const dx = A.x - P.position.x, dy = A.y - (P.position.y + 1.0), dz = A.z - P.position.z, dist = Math.hypot(dx, dy, dz);
    if (dist < 1.4 || ropeA.t > GRAPPLE.maxPull) { ropeRelease(dist < 1.4 ? 'contact' : 'timeout'); return; }
    const want = Math.min(24, 8 + dist * 1.1), k = Math.min(1, 9 * dt);
    vel.x += (dx / dist * want - vel.x) * k; vel.z += (dz / dist * want - vel.z) * k; vy += (dy / dist * want - vy) * k + 4 * dt; // tension beats most of gravity
    P.facing = Math.atan2(dx, dz);
    rope?.draw(waist(), A, 1);
  }
  // ---------------- arrows (bow) ----------------
  const arrows = []; const arrowMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.012, 0.012, 0.75, 4).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xd8cbb0, roughness: 0.6 }), 48);
  arrowMesh.count = 0; arrowMesh.frustumCulled = false; arrowMesh.name = 'arrows'; scene.add(arrowMesh);
  // where a shot goes: the crosshair while aiming (first monster part / creature / ground on the camera ray), else the locked part
  const _ar = new THREE.Vector3(), _ad = new THREE.Vector3(), _ac = new THREE.Vector3();
  function crosshairPoint() {
    const o = game.camera.position; game.camera.getWorldDirection(_ad); let best = 90, out = null;
    const cands = game.fauna ? game.monsters.concat(game.fauna.near(P.position, 60)) : game.monsters;
    for (const m of cands) {
      if (!m || m.hp <= 0 || m.dead || m.state === 'dead') continue;
      for (const h of m.getHitboxes?.() || []) { _ac.subVectors(o, h.sphere.center); const b = _ac.dot(_ad), q = _ac.lengthSq() - h.sphere.radius * h.sphere.radius, disc = b * b - q; if (disc < 0) continue; const tt = -b - Math.sqrt(disc); if (tt > 0.5 && tt < best) { best = tt; out = 'hit'; } }
    }
    for (let tt = 2; tt < best; tt += 1) { _ar.copy(o).addScaledVector(_ad, tt); if (_ar.y < world.getHeight(_ar.x, _ar.z)) { best = tt; break; } }
    return o.clone().addScaledVector(_ad, best);
  }
  P.crosshairPoint = crosshairPoint;
  function aimPoint() {
    if (P.aiming) return crosshairPoint();
    const m = P.lockTarget; if (m && m.hp > 0) return P.lockPointOf(new THREE.Vector3());
    return crosshairPoint();
  }
  let aimEl = null;
  function aimHud(on) {
    if (typeof document === 'undefined') return; if (!aimEl && !on) return;
    if (!aimEl) { aimEl = document.createElement('div'); aimEl.style.cssText = 'position:fixed;left:50%;top:50%;width:30px;height:30px;margin:-15px 0 0 -15px;z-index:12;pointer-events:none;background:radial-gradient(circle,#ffe2a0 0 2px,transparent 3px),linear-gradient(#ffe2a0,#ffe2a0) center/2px 9px no-repeat,linear-gradient(90deg,#ffe2a0,#ffe2a0) center/9px 2px no-repeat;border:2px solid rgba(255,226,160,.85);border-radius:50%;box-shadow:0 0 4px rgba(0,0,0,.7)'; (document.getElementById('ui-root') || document.body).appendChild(aimEl); }
    aimEl.style.display = on ? 'block' : 'none';
  }
  function fireArrows(n, spread, mv) {
    const mz = view.rig.weapon.userData.muzzle; let o;
    if (mz) { view.rig.weapon.updateMatrixWorld(true); o = mz.clone().applyMatrix4(view.rig.weapon.matrixWorld); }
    else { o = view.rig.bones.chest.getWorldPosition(new THREE.Vector3()).addScaledVector(fwd(new THREE.Vector3()), 0.6); o.y += 0.15; }
    const SH = C.shot || { speed: 58, gravity: 4 };
    const dir = aimPoint().sub(o).normalize();
    for (let i = 0; i < n; i++) {
      const a = (i - (n - 1) / 2) * spread, c = Math.cos(a), sn = Math.sin(a);
      const v = new THREE.Vector3(dir.x * c + dir.z * sn, dir.y + (spread ? (Math.random() - 0.5) * spread * 0.5 : 0), -dir.x * sn + dir.z * c).multiplyScalar(SH.speed);
      arrows.push({ p: o.clone(), v, o: o.clone(), life: 1.6, mv, g: SH.gravity });
    }
    events.emit('sfx', { name: 'swing', position: o, volume: 0.55 });
  }
  P.fireArrows = fireArrows;
  const _q2 = new THREE.Quaternion(), _m2 = new THREE.Matrix4(), _one = new THREE.Vector3(1, 1, 1), _z = new THREE.Vector3(0, 0, 1), _prev = new THREE.Vector3(), _seg = new THREE.Vector3(), _cl = new THREE.Vector3();
  function updateArrows(dt) {
    let n = 0;
    for (let i = arrows.length - 1; i >= 0; i--) {
      const a = arrows[i]; _prev.copy(a.p); a.v.y -= (a.g ?? 4) * dt; a.p.addScaledVector(a.v, dt); a.life -= dt;
      let done = a.life <= 0 || a.p.y < world.getHeight(a.p.x, a.p.z);
      if (!done) {
        const targets = game.fauna ? game.monsters.concat(game.fauna.near(a.p, 12)) : game.monsters;
        hitLoop: for (const m of targets) {
          if (!m || m.hp <= 0 || m.state === 'dead' || m.dead) continue;
          for (const hb of m.getHitboxes()) {
            const c = hb.sphere.center; _seg.subVectors(a.p, _prev); const L2 = _seg.lengthSq(); const u = L2 > 0 ? Math.max(0, Math.min(1, _cl.subVectors(c, _prev).dot(_seg) / L2)) : 0;
            _cl.copy(_prev).addScaledVector(_seg, u); if (_cl.distanceTo(c) > hb.sphere.radius + 0.12) continue;
            const G = P.gear, aff = G.affinity + M.affinity, isCrit = aff > 0 && Math.random() < aff / 100;
            let damage = a.mv * ATTACK_POWER * G.atk * G.buffAtk * hornAtk() * G.sharp * (isCrit ? 1 + 0.25 * M.critDmg : 1) * M.atk * arrowFalloff(a.o.distanceTo(_cl), C.range);
            const el = G.element; if (el && el.type !== 'blast') damage += el.value * 0.05 * M.elem * (atk.elemBoost || 1) * (m.weakness?.[el.type] ?? 1) * 0.6;
            noteDamage(m, 'local', hb.part); const nrm = _cl.clone().sub(c).normalize();
            const res = m.receiveHit({ damage, part: hb.part, point: _cl.clone(), normal: nrm, attackerId: 'local', isCrit, element: el?.type, elementValue: el?.value || 0, mv: a.mv, motion: 'arrow', breakMul: C.breakMul });
            const dealt = res && typeof res === 'object' && res.damage != null ? res.damage : Math.round(damage);
            events.emit('hit', { attacker: 'local', target: m, damage: dealt, part: hb.part, point: _cl.clone(), normal: nrm, isCrit, motion: 'arrow', level: 0 });
            sparks.burst(_cl, nrm, 10, 0.6); done = true; break hitLoop;
          }
        }
      }
      if (done) { arrows.splice(i, 1); continue; }
      if (n < 48) { _q2.setFromUnitVectors(_z, _seg.copy(a.v).normalize()); _m2.compose(a.p, _q2, _one); arrowMesh.setMatrixAt(n++, _m2); }
    }
    arrowMesh.count = n; arrowMesh.instanceMatrix.needsUpdate = true;
  }

  // ---------------- class effects inside a move (shells, vial bursts, vaults, melodies, chain) ----------------
  function blastAt(center, r, base, motion) {
    const G = P.gear; let n = 0;
    const targets = game.fauna ? game.monsters.concat(game.fauna.near(center, r + 6)) : game.monsters;
    for (const m of targets) {
      if (!m || m.hp <= 0 || m.state === 'dead' || m.dead) continue;
      let best = null, bd = 1e9; for (const hb of m.getHitboxes()) { const d = hb.sphere.center.distanceTo(center) - hb.sphere.radius; if (d < bd) { bd = d; best = hb; } }
      if (!best || bd > r) continue;
      const damage = base * G.atk * hornAtk() * M.atk; noteDamage(m, 'local', best.part); const pt = best.sphere.center.clone();
      const res = m.receiveHit({ damage, part: best.part, point: pt, normal: new THREE.Vector3(0, 1, 0), attackerId: 'local', mv: 0.3, motion, breakMul: C.breakMul, element: 'blast' });
      events.emit('hit', { attacker: 'local', target: m, damage: res?.damage ?? Math.round(damage), part: best.part, point: pt, normal: new THREE.Vector3(0, 1, 0), motion, level: 0 }); n++;
    }
    world.spawnDust?.(center.clone(), 1.2 + r * 0.3); sparks.burst(center, new THREE.Vector3(0, 1, 0), 40, 2, 1);
    events.emit('sfx', { name: 'slam', position: center.clone(), volume: 0.9 }); events.emit('camera:shake', { intensity: 0.35 + r * 0.06, duration: 0.3 });
    return n;
  }
  P.blastAt = blastAt;
  const chainMat = new THREE.LineBasicMaterial({ color: 0x5a5a62 }); const chainGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const chainLine = new THREE.Line(chainGeo, chainMat); chainLine.visible = false; chainLine.frustumCulled = false; scene.add(chainLine);
  const crossT = (x) => t >= x && t - lastDt < x;
  function classEffects(atk, s) {
    const F = fwd(new THREE.Vector3());
    if (atk.blast && crossT(atk.blast.t)) {
      const B = atk.blast; if (B.dmg > 0) blastAt(P.position.clone().addScaledVector(F, B.ahead).setY(P.position.y + 1.1), B.r, B.dmg, s);
      if (B.recoil) vel.addScaledVector(F, -B.recoil);
    }
    if (atk.vialCharge && crossT(atk.vialCharge)) { const add = RES.energy >= 0.2 ? Math.max(1, Math.round(RES.energy * 5)) : 0; RES.vials = Math.min(5, RES.vials + add); RES.energy = 0; events.emit('player:vials', { vials: RES.vials }); events.emit('sfx', { name: 'charge2', position: P.position.clone(), volume: 0.6 }); }
    if (atk.vialBurst && crossT(atk.vialBurst.t)) { const V = atk.vialBurst; for (let i = 0; i < RES.vials; i++) blastAt(P.position.clone().addScaledVector(F, V.ahead + i * V.step).setY(P.position.y + 0.6), V.r, V.dmg, s); RES.vials = 0; }
    if (atk.vault && crossT(atk.vault.t)) { airborne = true; vy = atk.vault.vy; fallFrom = P.position.y; vel.copy(F).multiplyScalar(atk.vault.fwd); setState('jump', 0.1); return; }
    if (atk.perform && crossT(atk.perform)) { // War Horn recital: every stored melody takes effect
      for (const k of RES.melodies) { const Mm = MELODIES[k]; if (Mm.buff === 'heal') { P.hp = Math.min(P.maxHp, P.hp + Mm.amount); P.redHp = Math.max(P.redHp, P.hp); } else { RES.buff[Mm.buff] = Mm.t; if (Mm.buff === 'stam') P.stamina = P.maxStamina; } }
      events.emit('player:melody', { melodies: [...RES.melodies] }); events.emit('sfx', { name: 'roar', position: P.position.clone(), volume: 0.5 }); RES.melodies = [];
    }
    if (atk.chain) { // the anchor's chain, drawn while thrown
      const pts = curBlade.length ? curBlade : null; chainLine.visible = !!pts && t > atk.chain.out[0] && t < atk.chain.back[1];
      if (pts) { chainGeo.attributes.position.setXYZ(0, pts[0].x, pts[0].y, pts[0].z); const e = pts[pts.length - 1]; chainGeo.attributes.position.setXYZ(1, e.x, e.y, e.z); chainGeo.attributes.position.needsUpdate = true; }
    } else chainLine.visible = false;
  }
  // class resource readout (ammo, heat, gauge, vials, notes)
  let resEl = null, resKey = '';
  function resHud() {
    if (typeof document === 'undefined') return;
    let txt = '';
    if (C.ammo) txt = `${tr('res.ammo')} ${RES.ammo}/${C.ammo.clip}${P.state === 'reload' ? ' · ' + tr('res.reload') : ''}`;
    else if (C.heat) txt = `${tr('res.heat')} ${Math.round(RES.heat * 100)}%${RES.lock > 0 ? ' · ' + tr('res.overheat') : ''}`;
    else if (P.cls === 'shiftaxe') txt = `${tr('res.mode.' + RES.mode)} · ${tr('res.gauge')} ${Math.round(RES.gauge * 100)}%`;
    else if (P.cls === 'bulwarkaxe') txt = `${tr('res.mode.' + RES.mode)} · ${tr('res.energy')} ${Math.round(RES.energy * 100)}% · ${tr('res.vials')} ${'●'.repeat(RES.vials)}${'○'.repeat(5 - RES.vials)}`;
    else if (P.cls === 'horn') txt = `${tr('res.notes')} ${RES.notes.join(' ') || '-'} · ${tr('res.melodies')} ${RES.melodies.length}${RES.buff.atk > 0 ? ' · ' + tr('res.atkUp') : ''}${RES.buff.def > 0 ? ' · ' + tr('res.defUp') : ''}`;
    else if (C.focus) txt = `${tr('res.focus')} ${Math.round(focus * 100)}% · Lv${focusLv}`;
    if (txt === resKey) return; resKey = txt;
    if (!resEl) { resEl = document.createElement('div'); resEl.style.cssText = 'position:fixed;left:max(16px,2vw);top:118px;z-index:12;padding:.2em .7em;border-radius:4px;background:rgba(10,7,4,.6);color:#f6e2aa;font:600 12px Georgia,serif;letter-spacing:.05em;pointer-events:none'; (document.getElementById('ui-root') || document.body).appendChild(resEl); }
    resEl.style.display = txt ? 'block' : 'none'; resEl.textContent = txt;
  }

  function land(gh) {
    const drop = Math.max(0, fallFrom - gh); airborne = false; P.position.y = gh;
    if (P.state === 'plunge') {
      plungeMv = 0.7 + Math.min(0.5, drop * 0.08); setState('plungeLand', 0.03); t = 0.38;
      world.spawnDust?.(P.position.clone(), 1.4 + Math.min(1.5, drop * 0.15)); events.emit('camera:shake', { intensity: 0.4 + Math.min(0.5, drop * 0.05), duration: 0.35 });
      events.emit('sfx', { name: 'slam', position: P.position.clone(), volume: 0.8 });
    } else if (P.state === 'jump') {
      setState('idle', 0.12); vel.multiplyScalar(0.6);
      events.emit('footstep', { position: P.position.clone(), heavy: drop > 3, volume: 0.6, player: true });
      if (drop > 6) { setState('knockdown', 0.05); } // a long fall knocks the hunter flat (no damage)
    }
  }

  // ---------------- autoplay (debug / critics) ----------------
  let apT = 0;
  function autoplayInput(dt) {
    const m = game.monsters?.[0], inp = { move: { x: 0, y: 0 }, worldMove: new THREE.Vector3(), sprint: false, dodge: false, lightAttack: false, heavyAttack: false, heavyHeld: false, guard: false, item: false, lockOn: false, look: { x: 0, y: 0 } };
    if (!m || P.dead) return inp;
    if (P.lockTarget !== m) P.lockTarget = m;
    let dist = Infinity;
    for (const h of m.getHitboxes()) dist = Math.min(dist, Math.hypot(h.sphere.center.x - P.position.x, h.sphere.center.y - P.position.y - 1.1, h.sphere.center.z - P.position.z) - h.sphere.radius);
    const to = new THREE.Vector3(m.position.x - P.position.x, 0, m.position.z - P.position.z).normalize();
    if (dist > 1.3 && !ATTACKS[P.state] && P.state !== 'charge') { inp.worldMove.copy(to); inp.sprint = dist > 10 && !P.weaponDrawn; apT = 0; return inp; }
    apT += dt; const c = apT % 9.6;
    const at = (x) => c >= x && c - dt < x;
    inp.lightAttack = at(0.05) || at(0.6) || at(1.2);
    inp.heavyHeld = (c > 2.75 && c < 4.3) || (c > 5.1 && c < 6.85); inp.heavyAttack = at(2.75) || at(5.1);
    if (at(8.8)) { inp.dodge = true; inp.worldMove.copy(to).negate(); }
    // state-driven bridge so the showcase reliably reaches the True Charge finisher
    if (P.state === 'heavy' && t > 0.75 && t < 1.1) inp.heavyAttack = true;
    if (P.state === 'tackle') inp.heavyHeld = true;
    if (P.state === 'tcharge') inp.heavyHeld = P.chargeLevel < 3 || t < TRUE_LV[2] + 0.1;
    return inp;
  }

  // ---------------- combat ----------------
  const _n = new THREE.Vector3(), _c = new THREE.Vector3(), _mid = new THREE.Vector3();
  function doHits(atk) {
    if (atk.tackle) { const c = view.rig.bones.chest; curBlade = [c.localToWorld(new THREE.Vector3(-0.1, 0.1, 0.35)).addScaledVector(fwd(new THREE.Vector3()), 0.35)]; }
    else if (atk.chain) { // anchor on its chain: a line from the hands out to the thrown head
      const ch = atk.chain, f = t < ch.out[1] ? (t - ch.out[0]) / (ch.out[1] - ch.out[0]) : t < ch.back[0] ? 1 : 1 - (t - ch.back[0]) / (ch.back[1] - ch.back[0]);
      const L = ch.reach * Math.max(0, Math.min(1, f)); const base = view.rig.bones.chest.getWorldPosition(new THREE.Vector3()); const F = fwd(new THREE.Vector3());
      curBlade = []; for (let i = 0; i < 6; i++) curBlade.push(base.clone().addScaledVector(F, 0.6 + L * (i / 5)).setY(base.y - 0.3 * (i / 5)));
    }
    else curBlade = view.bladeWorld(curBlade);
    if (!prevBlade.length) prevBlade = curBlade.map((v) => v.clone());
    const lvl = P.state === 'heavy' || P.state === 'trueslash' ? heavyLevel : 0;
    const mv = P.state === 'plungeLand' ? plungeMv : atk.finisher && t >= atk.finisher.t ? atk.finisher.mv : Array.isArray(atk.mv) ? atk.mv[lvl] : atk.mv;
    const pad = view.rig.weapon.userData.hitPad || 0, blunt = atk.blunt || C.dmg === 'blunt', pierce = atk.pierce || C.dmg === 'pierce';
    // bosses + small fauna close to the hunter (open island) share the same hit pipeline
    const targets = game.fauna ? game.monsters.concat(game.fauna.near(P.position, 7)) : game.monsters;
    for (const m of targets) {
      if (!m || m.hp <= 0 || m.state === 'dead') continue;
      let set = hitSets.get(m); if (!set) hitSets.set(m, (set = new Set()));
      for (const hb of m.getHitboxes()) {
        if (set.has(hb.part) || set.size >= 2) continue;
        const sc = hb.sphere.center, R = hb.sphere.radius + (atk.tackle ? 0.55 : 0.18 + pad);
        let hitP = null;
        for (let i = 0; i < curBlade.length && !hitP; i++) for (const k of [0, 0.5, 1]) {
          _mid.lerpVectors(prevBlade[i], curBlade[i], k);
          if (_mid.distanceToSquared(sc) < R * R) { hitP = _mid.clone(); break; }
        }
        if (!hitP) continue;
        set.add(hb.part);
        _n.subVectors(hitP, sc).normalize(); const point = sc.clone().addScaledVector(_n, hb.sphere.radius);
        const G = P.gear, roll = Math.random();
        const aff = G.affinity + M.affinity; const isCrit = aff > 0 && roll < aff / 100, weakHit = aff < 0 && roll < -aff / 100;
        // part hardness (src/core/parts.js): a blunt edge glances off very hard parts; hard parts wear the edge faster
        const hitPart = m.parts?.find((q) => q.name === hb.part); const hard = hitPart && !hitPart.broken ? hitPart.hardness ?? 0.5 : 0.4;
        const glance = !blunt && deflects(pierce ? hard - 0.2 : hard, P.sharpness, P.state); // blunt never glances; a point slips in more easily
        let damage = mv * ATTACK_POWER * G.atk * G.buffAtk * sharpMult(P.sharpness) * G.sharp * (isCrit ? 1 + 0.25 * M.critDmg : weakHit ? 0.75 : 1) * (glance ? 0.35 : 1) * M.atk * (1 + 0.06 * focusLv) * hornAtk();
        const el = G.element; if (el && el.type !== 'blast') damage += el.value * 0.05 * M.elem * (m.weakness?.[el.type] ?? 1) * Math.min(1.5, mv / 0.4 + 0.3);
        noteDamage(m, 'local', hb.part); // material rights: this hunter damaged this part (and so the body)
        const breakMul = (atk.shield ? 1.3 : C.breakMul) * (atk.breakBonus || 1) * (blunt && hard > 0.6 ? 1.15 : 1); // part-break aptitude of the weapon class
        const res = m.receiveHit({ damage, part: hb.part, point, normal: _n.clone(), attackerId: 'local', isCrit, element: el?.type, elementValue: el?.value || 0, mv, motion: P.state, breakMul });
        const hz = m.parts?.find((p) => p.name === hb.part)?.hitzone ?? 1;
        const dealt = res && typeof res === 'object' && res.damage != null ? res.damage : typeof res === 'number' ? res : Math.round(damage * hz);
        events.emit('hit', { attacker: 'local', target: m, damage: dealt, part: hb.part, point, normal: _n.clone(), isCrit, weak: hz >= 1.2, motion: P.state, level: lvl, deflected: glance });
        P.sharpness = Math.max(0, P.sharpness - 0.011 * (atk.shield ? 0 : C.wear) * wearFactor(hard) * (glance ? 2 : 1) * (1 - 0.25 * (P.gear.skills.sharpEdge || 0)));
        if (atk.energy && !swingFirstHit) RES.energy = Math.min(1, RES.energy + atk.energy);
        if (atk.bounce && !swingFirstHit && airborne) vy = Math.max(vy, atk.bounce); // Vault Staff: a hit in the air bounces you up again
        if (C.focus) { focus = Math.min(1, focus + 0.08); if (P.state === 'ls_spirit' && !swingFirstHit) { focusLv = Math.min(3, focusLv + 1); focusT = 45; events.emit('player:focus', { level: focusLv }); } }
        if (glance) { events.emit('sfx', { name: 'clang', position: point, volume: 0.9 }); events.emit('player:deflect', { part: hb.part, target: m }); }
        const pw = Array.isArray(atk.stop) ? atk.stop[lvl] : atk.stop, sh = Array.isArray(atk.shake) ? atk.shake[lvl] : atk.shake;
        sparks.burst(point, _n, 18 + Math.round(pw * 160), 0.6 + pw * 4);
        const big = lvl === 3 && (P.state === 'heavy' || P.state === 'trueslash') && (hz >= 1.2 || res?.weak);
        if (big && !swingFirstHit) {
          // signature moment: long hitstop, brief slow-motion, white flash
          swingFirstHit = true; events.emit('hitstop', { duration: 0.25 }); events.emit('camera:shake', { intensity: 1, duration: 0.6 });
          game.engine.timeScale = 0.3; slowT = 0.5; flash(0.55); sparks.burst(point, _n, 90, 2.4, 1); events.emit('camera:fov', { kick: 9 });
          events.emit('sfx', { name: 'trueCharge', position: point, volume: 1 });
        }
        if (!swingFirstHit) {
          swingFirstHit = true;
          events.emit('hitstop', { duration: pw * (hz >= 1.2 ? 1.15 : 1) });
          events.emit('camera:shake', { intensity: sh, duration: 0.2 + pw });
        }
        hitCount++;
      }
    }
    for (let i = 0; i < curBlade.length; i++) (prevBlade[i] ||= new THREE.Vector3()).copy(curBlade[i]);
  }
  const _tb = new THREE.Vector3(), _tt = new THREE.Vector3();
  function trailSample() {
    const w = view.rig.weapon; w.updateMatrixWorld(true);
    trail.push(_tb.copy(w.userData.trailBase).applyMatrix4(w.matrixWorld), _tt.copy(w.userData.trailTip).applyMatrix4(w.matrixWorld), clock);
  }

  // white impact flash (full-screen DOM overlay owned by the player module)
  let flashEl = null;
  function flash(strength) {
    if (typeof document === 'undefined') return;
    if (!flashEl) { flashEl = document.createElement('div'); flashEl.style.cssText = 'position:fixed;inset:0;background:#fff;pointer-events:none;opacity:0;z-index:50;mix-blend-mode:screen'; document.body.appendChild(flashEl); }
    flashEl.style.transition = 'none'; flashEl.style.opacity = String(strength);
    requestAnimationFrame(() => { flashEl.style.transition = 'opacity 0.35s ease-out'; flashEl.style.opacity = '0'; });
  }

  // ---------------- damage intake ----------------
  // Parry: only a direct physical blow from a creature we can see (not roars, area bursts, projectiles or ailments).
  const parryable = (kind, source) => !!source && (kind == null || kind === 'physical');
  function parrySuccess(source, from) {
    const pt = P.position.clone(); pt.y += 1.2; const n = new THREE.Vector3(from?.x ?? pt.x, pt.y, from?.z ?? pt.z).sub(pt).normalize();
    sparks.burst(pt.addScaledVector(n, 0.6), n, 60, 2, 1); flash(0.35);
    events.emit('sfx', { name: 'clang', position: pt, volume: 1 }); events.emit('hitstop', { duration: 0.14 }); events.emit('camera:shake', { intensity: 0.45, duration: 0.3 });
    // the attacker reels: small fauna stagger, bosses play their flinch and remember being parried
    if (source.isFauna) source.staggerT = source.S?.big ? 0.9 : 1.5;
    else source.debug?.play?.('flinch');
    source.parried = (source.parried || 0) + 1;
    // iai counter: the blade comes out of the sheath straight into a slash
    parryReady = false; P.weaponDrawn = true; view.setInHand(true); invuln = Math.max(invuln, 0.35);
    if (from) P.facing = Math.atan2(from.x - P.position.x, from.z - P.position.z);
    setState('light2', 0.04);
    events.emit('player:parry', { source }); events.emit('player:parryReady', { on: false });
  }
  P.receiveHit = ({ damage = 0, knockback = 0, from, kind, stun, source } = {}) => {
    if (P.dead || iframe > 0 || invuln > 0 || frozen) return false;
    if (P.state === 'parry' && t <= C.parry && parryable(kind, source) && !B.silenced) {
      const to = from ? new THREE.Vector3(from.x - P.position.x, 0, from.z - P.position.z).normalize() : fwd(new THREE.Vector3());
      if (fwd(new THREE.Vector3()).dot(to) > -0.2) { parrySuccess(source, from); return false; }
    }
    if (P.state === 'sleep') { damage *= 1.5; game.status?.clear('sleep'); } // a rude awakening
    { // armour: defence curve, buffs, fire resistance + Heatward; Steadfast shortens stuns; defence / resistance down
      const G = P.gear; damage *= (1 - G.defense / (G.defense + 500)) * G.buffDef * hornDef() / M.def;
      if (kind && !['physical', 'roar', 'aoe', 'projectile'].includes(kind)) damage /= M.elemRes;
      if (kind === 'fire') damage *= Math.max(0.4, 1 - (G.res.fire || 0) * 0.03 - (G.skills.heatward || 0) * 0.05);
      if (stun) stun *= Math.max(0.1, 1 - 0.3 * (G.skills.steadfast || 0));
    }
    const src = from ? new THREE.Vector3(from.x, 0, from.z) : P.position.clone().add(fwd(new THREE.Vector3()));
    const away = new THREE.Vector3(P.position.x - src.x, 0, P.position.z - src.z); if (away.lengthSq() < 1e-4) away.copy(fwd()).negate(); away.normalize();
    const kb = typeof knockback === 'number' ? knockback : knockback?.length?.() ?? 0;
    if (superArmor) { // tackle: shrug the hit off, take reduced damage, keep going
      if (kind === 'roar') return false;
      P.redHp = Math.max(P.redHp, P.hp); P.hp = Math.max(0, P.hp - damage * 0.7); sinceHit = 0;
      events.emit('player:damaged', { amount: damage * 0.7, source: from, superArmor: true }); events.emit('camera:shake', { intensity: 0.35, duration: 0.25 });
      sparks.burst(P.position.clone().setY(P.position.y + 1.3), away, 16, 1, 1);
      if (P.hp <= 0) die();
      return true;
    }
    if (kind === 'roar') { if (P.state === 'guard') return false; stunT = stun || 1.2; setState('hit', 0.08); return true; }
    if (P.state === 'guard' && fwd(new THREE.Vector3()).dot(away) < (C.guard === 'tower' ? 0 : -0.3)) {
      damage *= C.guardMul ?? 0.15; P.stamina = Math.max(0, P.stamina - (12 + kb) * (C.guard === 'tower' ? 0.6 : 1)); stamDelay = 0.8; vel.copy(away).multiplyScalar(Math.min(6, 1.5 + kb * 0.3) * (C.guardPush ?? 1));
      const bw = view.bladeWorld(); const pt = view.shield ? view.shield.getWorldPosition(new THREE.Vector3()) : bw[Math.min(3, bw.length - 1)]; sparks.burst(pt, away.clone().negate(), 26, 1.4, 1);
      events.emit('sfx', { name: 'clang', position: pt, volume: 1 }); events.emit('camera:shake', { intensity: 0.3, duration: 0.25 });
      P.redHp = Math.max(P.redHp, P.hp); P.hp = Math.max(1, P.hp - damage); sinceHit = 0; events.emit('player:damaged', { amount: damage, source: from, guarded: true });
      return true;
    }
    P.redHp = Math.max(P.redHp, P.hp); P.hp = Math.max(0, P.hp - damage); P.recoverableHp = P.redHp; sinceHit = 0;
    events.emit('player:damaged', { amount: damage, source: from });
    events.emit('camera:shake', { intensity: clamp(damage / 60, 0.2, 0.9), duration: 0.35 });
    P.facing = Math.atan2(-away.x, -away.z); stunT = 0; trail.clear();
    if (P.hp <= 0) { die(); vel.copy(away).multiplyScalar(3); return true; }
    if (kb >= 10 || damage >= 38) { setState('knockdown', 0.05); vel.copy(away).multiplyScalar(Math.min(9, 3 + kb * 0.35)); }
    else { setState('hit', 0.05); vel.copy(away).multiplyScalar(Math.max(1.5, kb * 0.5)); }
    return true;
  };
  // Damage-over-time from status ailments (src/core/status.js): no flinch, no i-frame check, can faint.
  P.drain = (amount) => {
    if (P.dead || frozen || !(amount > 0)) return;
    P.hp = Math.max(0, P.hp - amount); P.redHp = Math.max(P.hp, (P.redHp ?? P.hp) - amount * 0.5); sinceHit = 0;
    if (P.hp <= 0) die();
  };
  function die() {
    P.dead = true; P.hp = 0; setState('dead', 0.1); deadT = 0; P.respawnTime = 5; P.chargeLevel = 0; events.emit('player:died', {});
  }
  // the crater swallows the hunter (src/field/volcano.js): a death without a body
  P.devour = () => { if (P.dead) return; ropeRelease('devoured'); airborne = false; P.devoured = true; die(); view.root.visible = false; events.emit('player:devoured', {}); };
  function respawn() {
    view.root.visible = true; P.devoured = false;
    ropeRelease('respawn'); airborne = false; vy = 0; parryReady = false; holdT = -1; spawn(); P.hp = P.maxHp; P.redHp = P.maxHp; P.stamina = P.maxStamina; P.dead = false; P.respawnTime = 0; vel.set(0, 0, 0);
    P.weaponDrawn = false; view.setInHand(false); setState('idle', 0.01); view.resetCloth(); invuln = 2; trail.clear();
    events.emit('player:respawn', {});
  }

  // ---------------- update ----------------
  let lastDt = 1 / 60, prevGuard = false;
  P.update = (dt, input, rawDt = dt) => {
    sparks.update(rawDt);
    if (slowT > 0 && (slowT -= rawDt) <= 0) game.engine.timeScale = 1;
    if (frozen) { view.update(frozenLoco ? 1 / 60 : 0, frozenLoco || animParams()); return; }
    if (dt <= 0) { trail.update(clock); return; }
    lastDt = dt; t += dt; clock += dt; if (focusLv && (focusT -= dt) <= 0) { focusLv--; focusT = 45; } focus = Math.max(0, focus - dt * 0.01); iframe = Math.max(0, iframe - dt); invuln = Math.max(0, invuln - dt);
    const inp = autoplay ? autoplayInput(dt) : input || {};
    // camera-relative wish direction
    game.camera.getWorldDirection(camF); camF.y = 0; if (camF.lengthSq() < 1e-6) camF.set(0, 0, -1); camF.normalize();
    camR.set(-camF.z, 0, camF.x);
    if (inp.worldMove) wish.copy(inp.worldMove); else wish.set(0, 0, 0).addScaledVector(camF, inp.move?.y || 0).addScaledVector(camR, inp.move?.x || 0);
    const wishLen = Math.min(1, wish.length()); if (wishLen > 0.01) wish.normalize(); else wish.set(0, 0, 0);
    // input buffer (0.3s)
    if (inp.lightAttack) buffer = { a: 'light', t: 0.3 }; else if (inp.heavyAttack) buffer = { a: 'heavy', t: 0.3 }; else if (inp.dodge) buffer = { a: 'dodge', t: 0.25 };
    else if (inp.item) buffer = { a: P.sharpness < 0.6 && P.hp > P.maxHp * 0.7 ? 'whetstone' : 'potion', t: 0.3 }; else if (inp.interact) buffer = { a: 'whetstone', t: 0.3 };
    if (buffer && (buffer.t -= dt) <= 0) buffer = null;
    const take = (a) => { if (buffer && buffer.a === a) { buffer = null; return true; } return false; };
    if (inp.lockOn && !P.dead) cycleLock();
    if (P.lockTarget && (P.lockTarget.hp <= 0 || P.lockTarget.state === 'dead' || P.lockTarget.dead) && !autoplay) { P.lockTarget = null; P.lockPart = null; }
    // ranged aiming: hold GUARD (Q / LT / touch AIM) with a bow or a gun drawn — over-the-shoulder camera, crosshair, shots go
    // exactly where the crosshair points (src/player/camera.js reads P.aiming)
    P.aiming = C.dmg === 'ranged' && P.weaponDrawn && !!inp.guard && !P.dead && !airborne && !['dodge', 'hit', 'knockdown', 'getup', 'sheathe', 'draw', 'ropeFire', 'ropePull'].includes(P.state);
    aimHud(P.aiming);

    // ailments (src/core/status.js): sleep / stun take over the hunter, flinch staggers, debuffs scale everything
    const S = game.status; M = S?.mods?.() || M; B = S?.blocks?.() || {};
    if (!P.dead && !airborne) {
      if (B.asleep && P.state !== 'sleep') { setState('sleep', 0.15); vel.set(0, 0, 0); holdT = -1; }
      else if (B.stunned && !['stun', 'sleep', 'knockdown', 'getup'].includes(P.state)) { setState('stun', 0.08); holdT = -1; }
      else if (pendingFlinch > 0 && !superArmor && !['sleep', 'stun', 'knockdown', 'getup'].includes(P.state)) { stunT = pendingFlinch; setState('hit', 0.05); holdT = -1; }
    }
    pendingFlinch = 0;
    if (B.confused && wishLen > 0.01) { // scrambled directions: long = reversed, short = swung sideways and wobbling
      const a = B.confused === 'long' ? Math.PI : Math.PI / 2 + 0.6 * Math.sin(clock * 1.7); const c = Math.cos(a), sn = Math.sin(a);
      wish.set(wish.x * c + wish.z * sn, 0, -wish.x * sn + wish.z * c);
    }
    if (ATTACKS[P.state] || P.state === 'charge' || P.state === 'tcharge') t += dt * (M.atkSpeed - 1); // attack speed down
    // light button held while drawn → sheathe into the parry stance; released early → an ordinary slash
    if (holdT >= 0) {
      if (!LOCO.has(P.state)) holdT = -1;
      else if (!inp.lightHeld) { holdT = -1; startAttack('light'); }
      else if ((holdT += dt) >= HOLD_SHEATHE) { holdT = -1; queued = 'parryReady'; setState('sheathe'); }
    }
    // grappling hook: cooldown, aiming, firing at the double-tapped / crosshair target
    ropeCd = Math.max(0, ropeCd - dt);
    rope?.hudUpdate(!!inp.ropeHeld, ropeCd, !game.input?.touch?.enabled); game.input?.touch?.setRopeCooldown?.(ropeCd);
    if (inp.ropeTarget && rope && !P.dead) {
      if (ropeCd > 0) events.emit('player:ropeCooldown', { left: ropeCd });
      else { const hit = rope.pick(inp.ropeTarget, P.position); if (hit?.point) P.grappleTo(hit); else events.emit('player:ropeMiss', { why: hit?.refused || 'none' }); }
    }
    const guardEdge = !!inp.guard && !prevGuard; prevGuard = !!inp.guard;
    // class resources tick: Shift Axe gauge refills in axe mode, Machine Gun cools, horn buffs run out
    if (P.cls === 'shiftaxe' && RES.mode === 'axe') RES.gauge = Math.min(1, RES.gauge + 0.04 * dt);
    if (C.heat && P.state !== 'mgfire') RES.heat = Math.max(0, RES.heat - C.heat.cool * dt); RES.lock = Math.max(0, RES.lock - dt);
    for (const k in RES.buff) RES.buff[k] = Math.max(0, RES.buff[k] - dt);
    resHud();
    const s = P.state, atk = ATTACKS[s];
    let maxSpeed = 0, accel = 14, turnRate = 0, rootMove = 0;
    if (LOCO.has(s)) {
      const sprinting = inp.sprint && wishLen > 0.1 && !P.exhausted;
      if (holdT >= 0) { maxSpeed = 2.7 * wishLen; accel = 9; turnRate = 7; } // deciding: tap or hold
      else if (sprinting && P.weaponDrawn) { setState('sheathe'); }
      else if (take('dodge')) startDodge();
      else if (inp.jump && useStamina(8)) startJump();
      else if (take('light')) {
        if (P.weaponDrawn && inp.lightHeld) holdT = 0;
        else if (!P.weaponDrawn && parryReady) { if (B.silenced) events.emit('player:silenced', {}); else setState(inp.lightHeld ? 'parryPrep' : 'parry', 0.06); }
        else startAttack('light');
      }
      else if (take('heavy')) startAttack('heavy');
      else if (take('potion')) startItem('potion');
      else if (take('whetstone')) startItem('whetstone');
      else if (guardEdge && P.weaponDrawn && C.guardAction === 'perform') startMove('hr_perform');
      else if (guardEdge && P.weaponDrawn && C.guardAction === 'switch') { if (RES.mode === 'axe' && RES.gauge < 0.3) events.emit('player:lowGauge', {}); else startMove('sx_morph'); }
      else if (guardEdge && P.weaponDrawn && P.cls === 'bulwarkaxe' && RES.mode === 'axe') startMove('ba_morph');
      else if (inp.guard && guardOk() && P.weaponDrawn) setState('guard', 0.1);
      else if (inp.guard && guardOk() && !P.weaponDrawn) { queued = 'guard'; setState('draw'); }
      else {
        maxSpeed = P.weaponDrawn ? C.walk * wishLen * (P.aiming ? 0.55 : 1) : (sprinting ? 7.2 : 4.7 * wishLen);
        accel = P.weaponDrawn ? 9 : 14; turnRate = P.weaponDrawn ? 7 : 11;
        if (sprinting) { P.stamina = Math.max(0, P.stamina - 20 * dt * P.gear.stamMul); stamDelay = 0.6; if (P.stamina <= 0) P.exhausted = true; }
        const ns = speedNow < 0.15 ? 'idle' : sprinting ? 'sprint' : speedNow > 3.2 ? 'run' : 'walk';
        if (ns !== P.state) P.state = ns;
      }
    } else if (s === 'draw' || s === 'sheathe') {
      const rate = (queued && s === 'draw' ? 1.45 : 1.2) * CLIPS[s].dur / (s === 'draw' ? C.drawT : C.sheatheT) * (P.cls === 'greatsword' ? 1 : 1.1); t += dt * (rate - 1);
      maxSpeed = 1.6 * wishLen; turnRate = 5; accel = 8;
      if (s === 'draw' && !attachDone && t >= 0.24) { attachDone = true; view.setInHand(true); events.emit('sfx', { name: 'draw', position: P.position.clone(), volume: 0.8 }); }
      if (s === 'sheathe' && !attachDone && t >= 0.5) { attachDone = true; view.setInHand(false); events.emit('sfx', { name: 'sheathe', position: P.position.clone(), volume: 0.6 }); }
      if (t >= CLIPS[s].dur) {
        P.weaponDrawn = s === 'draw';
        if (P.weaponDrawn && parryReady) { parryReady = false; events.emit('player:parryReady', { on: false }); }
        if (!P.weaponDrawn && queued === 'parryReady') { queued = null; parryReady = true; events.emit('player:parryReady', { on: true }); }
        const q = queued; queued = null; setState(P.weaponDrawn ? 'idle' : 'idle', 0.15);
        if (q === 'light' || q === 'heavy') startAttack(q); else if (q === 'guard') setState('guard'); else if (q?.startsWith('item:')) { const o = queuedOpts; queuedOpts = null; startItem(q.slice(5), o); }
      }
    } else if (atk) {
      if (t < atk.turn) { const d = C.dmg === 'ranged' ? (P.aiming ? camF : targetDir() || camF) : aimDir(); turnToward(d, C.dmg === 'ranged' ? 14 : 7, dt); }
      classEffects(atk, s);
      for (const [a, b, dist] of atk.move) if (t >= a && t < b) rootMove = dist / (b - a);
      if (atk.rehit) for (const r of atk.rehit) if (t >= r && t - dt < r) { hitSets = new Map(); swingFirstHit = false; } // multi-hit moves
      if (atk.finisher && t >= atk.finisher.t && t - dt < atk.finisher.t) { hitSets = new Map(); swingFirstHit = false; }
      if (atk.shoot) for (const sh of atk.shoot) if (t >= sh.t && t - dt < sh.t) fireArrows(sh.arrows === 'lvl' ? ARROWS_BY_LEVEL[heavyLevel] : sh.arrows, sh.spread, sh.mv * (sh.arrows === 'lvl' ? 1 + 0.12 * heavyLevel : 1));
      if (t >= atk.active[0] && t <= atk.active[1]) {
        if (t - dt < atk.active[0]) { prevBlade = []; events.emit('sfx', { name: atk.tackle ? 'tackle' : s === 'heavy' || s === 'light3' || s === 'trueslash' ? 'swingHeavy' : 'swing', position: P.position.clone(), volume: 0.8 + heavyLevel * 0.1 }); }
        doHits(atk); if (!atk.tackle) trailSample();
      } else if (!atk.tackle && t > atk.active[0] - 0.05 && t < atk.active[1] + 0.06) trailSample();
      if (atk.slam && t >= atk.slam && t - dt < atk.slam) {
        const bw = view.bladeWorld(); const tip = bw[Math.min(6, bw.length - 1)]; world.spawnDust?.(new THREE.Vector3(tip.x, world.getHeight(tip.x, tip.z), tip.z), s === 'heavy' || s === 'trueslash' ? 1 + heavyLevel * 0.5 : 1);
        events.emit('camera:shake', { intensity: s === 'heavy' || s === 'trueslash' ? 0.2 + heavyLevel * 0.12 : 0.18, duration: 0.25 });
      }
      superArmor = (!!atk.tackle && t > 0.03 && t < 0.46) || (!!atk.armor && t > atk.active[0] && t < atk.active[1]);
      if (t >= atk.combo[0] && t <= atk.combo[1]) {
        if (atk.tackle) { if (!B.silenced && (inp.heavyHeld || take('heavy'))) { setState('tcharge', 0.1); lastLevel = 0; superArmor = false; } }
        else if (atk.next && take('light')) { if (ATTACKS[atk.next]?.clip) startMove(atk.next); else setState(atk.next, 0.08); }
        else if (atk.hnext && !B.silenced && take('heavy')) startMove(atk.hnext);
        else if ((s === 'heavy' || s === 'trueslash') && !B.silenced && take('heavy')) { setState('tackle', 0.06); events.emit('sfx', { name: 'tackle', position: P.position.clone(), volume: 0.8 }); }
        else if (P.cls === 'greatsword' && take('heavy')) { setState('charge', 0.12); lastLevel = 0; }
      }
      if (P.state !== s) superArmor = false;
      if (P.state === s && t >= atk.cancel && buffer?.a === 'dodge') { take('dodge'); startDodge(); }
      if (P.state === s && t >= CLIPS[clipOf(s, P.cls)].dur) { if (atk.gaugeAll) { RES.gauge = 0; setMode('axe'); } setState(airborne ? 'jump' : 'idle', 0.2); }
    } else if (s === 'reload') { // guns / Cannon Lance: refill the clip (a roll cancels it; the clip stays empty)
      maxSpeed = 1.2 * wishLen; turnRate = 4; accel = 8;
      if (take('dodge')) startDodge();
      else if (t >= (C.ammo?.reload || 1)) { RES.ammo = C.ammo?.clip || 0; events.emit('sfx', { name: 'draw', position: P.position.clone(), volume: 0.6 }); setState('idle', 0.15); }
    } else if (s === 'mgfire') { // sustained fire while HEAVY is held, until it overheats
      maxSpeed = 1.4 * wishLen; turnRate = 0; accel = 8; turnToward(P.lockTarget ? targetDir() : camF, 10, dt);
      RES.fireT -= dt; if (RES.fireT <= 0) { RES.fireT = 0.09; fireArrows(1, 0.03 + RES.heat * 0.04, 0.055); RES.heat += C.heat.perShot; }
      if (RES.heat >= 1) { RES.heat = 1; RES.lock = C.heat.lock; events.emit('player:overheat', {}); setState('idle', 0.2); }
      else if (take('dodge')) startDodge(); else if (!inp.heavyHeld) setState('idle', 0.15);
    } else if (CHARGES[s]) { // hammer charge (walk while charging) / bow draw (strafe, face the aim)
      const CH = CHARGES[s]; const lvl = t >= CH.lv[2] ? 3 : t >= CH.lv[1] ? 2 : t >= CH.lv[0] ? 1 : 0;
      maxSpeed = CH.move * wishLen; accel = 8;
      if (C.hands === 'bow') { turnRate = 0; turnToward(P.lockTarget ? targetDir() : camF, 10, dt); } else turnRate = 4;
      if (lvl > lastLevel) { lastLevel = lvl; const bw = view.bladeWorld(); sparks.burst(bw[bw.length - 1], new THREE.Vector3(0, 1, 0), 8 + lvl * 6, 0.4 + lvl * 0.2, 1); events.emit('sfx', { name: 'charge' + lvl, position: P.position.clone(), volume: 0.5 + lvl * 0.15 }); }
      P.chargeLevel = lvl; P.stamina = Math.max(0, P.stamina - CH.stamina * dt * P.gear.stamMul); stamDelay = 0.5;
      if (take('dodge')) { P.chargeLevel = 0; startDodge(); }
      else if (!inp.heavyHeld || t >= CH.max || P.stamina <= 0) { heavyLevel = lvl; P.chargeLevel = 0; const rel = CH.release[lvl]; if (ATTACKS[rel]?.ammo) startMove(rel); else setState(rel, 0.04); } // shells use the clip
    } else if (s === 'charge' || s === 'tcharge') {
      turnToward(aimDir(), 2.2, dt);
      const LV = s === 'tcharge' ? TRUE_LV : CHARGE_LV;
      const lvl = t >= LV[2] ? 3 : t >= LV[1] ? 2 : t >= LV[0] ? 1 : 0;
      if (s === 'charge' && !B.silenced && take('light')) { P.chargeLevel = 0; setState('tackle', 0.06); events.emit('sfx', { name: 'tackle', position: P.position.clone(), volume: 0.8 }); }
      else {
      if (lvl > lastLevel) {
        lastLevel = lvl; const pts = view.bladeWorld(); sparks.burst(pts[5], new THREE.Vector3(0, 1, 0), 10 + lvl * 8, 0.5 + lvl * 0.25, 1);
        events.emit('sfx', { name: 'charge' + lvl, position: P.position.clone(), volume: 0.6 + lvl * 0.15 }); events.emit('camera:shake', { intensity: 0.06 * lvl, duration: 0.15 });
      }
      P.chargeLevel = lvl;
      if (!inp.heavyHeld || t >= CHARGE_MAX) { heavyLevel = lvl; P.chargeLevel = 0; setState(s === 'tcharge' ? 'trueslash' : 'heavy', 0.03); events.emit('camera:fov', { kick: 4 + heavyLevel * (s === 'tcharge' ? 4 : 3) }); }
      }
    } else if (s === 'parryPrep') { // counter stance: hand on the hilt, release to parry
      maxSpeed = 0; turnToward(aimDir(), 6, dt);
      if (take('dodge')) startDodge(); else if (!inp.lightHeld || t > 3) setState('parry', 0.04);
    } else if (s === 'parry') {
      turnToward(aimDir(), 8, dt);
      if (t > C.parry) setState('parryMiss', 0.1); // nothing to catch: brief recovery
    } else if (s === 'parryMiss') {
      animT = Math.min(0.5, t * 0.8);
      if (take('dodge')) startDodge(); else if (t >= 0.45) setState('idle', 0.15);
    } else if (s === 'sleep') {
      vel.multiplyScalar(Math.max(0, 1 - 4 * dt)); animT = Math.min(t, 1.2);
      if (!B.asleep) { setState('getup', 0.15); invuln = 0.6; }
    } else if (s === 'stun') { // dazed: wobble on the spot; mashing shakes it off a little faster
      vel.multiplyScalar(Math.max(0, 1 - 6 * dt)); animT = 0.07 + 0.05 * Math.sin(t * 9);
      if (inp.dodge || inp.lightAttack || inp.heavyAttack) S?.shake?.('stun', 0.2);
      if (t % 0.4 < dt) world.spawnDust?.(P.position.clone().setY(P.position.y + 1.9), 0.12);
      if (!B.stunned) setState('idle', 0.2);
    } else if (s === 'ropeFire') { // the hook flies; the hunter braces
      vel.multiplyScalar(Math.max(0, 1 - 10 * dt));
    } else if (s === 'ropePull') { // pulled along the rope (physics in ropeTick); attacks / dodge / jump wait until release
    } else if (s === 'jump' || s === 'plunge') {
      // airborne: keep momentum, a little air control; light / heavy in the air = plunging attack
      if (wishLen > 0.01) { vel.addScaledVector(wish, 3 * dt); const h = Math.hypot(vel.x, vel.z); if (h > 6.5) { vel.x *= 6.5 / h; vel.z *= 6.5 / h; } }
      if (s === 'plunge') animT = Math.min(t * 1.5, 0.32);
      else if (C.air && P.weaponDrawn && take('light')) startMove(C.air); // Vault Staff: aerial slash
      else if (take('light') || take('heavy')) startPlunge();
    } else if (s === 'guard') {
      turnToward(aimDir(), 3, dt);
      if (take('dodge')) startDodge(); else if (P.cls === 'bulwarkaxe' && take('heavy')) startMove('ba_morph'); else if (!inp.guard) setState('idle', 0.15);
    } else if (s === 'dodge') {
      // invulnerable only inside [iStart, iEnd): cleared the frame the window ends (no lingering i-frames)
      const d = CLIPS.dodge.dur; iframe = t >= P.roll.iStart && t < P.roll.iEnd ? 1e-3 : 0;
      rootMove = (t < 0.5 ? 7.5 * (1 - t / 0.55) + 0.8 : 0.6) * (P.roll.dist / 2.5); // base curve covers ~2.5 m
      if (t > 0.46 && buffer && buffer.a !== 'dodge' && P.weaponDrawn) { const a = buffer.a; buffer = null; t = d; if (a === 'light' || a === 'heavy') startAttack(a); }
      else if (t >= d) setState(P.weaponDrawn ? 'idle' : 'idle', 0.15);
    } else if (s === 'hit') {
      vel.multiplyScalar(Math.max(0, 1 - 8 * dt));
      if (t >= Math.max(0.5, stunT)) { stunT = 0; setState('idle', 0.2); }
      else if (stunT <= 0.5 && t > 0.3 && take('dodge')) startDodge();
    } else if (s === 'knockdown') {
      vel.multiplyScalar(Math.max(0, 1 - 4 * dt)); invuln = Math.max(invuln, t > 0.5 ? 0.1 : 0);
      if (t >= 1.25 && (wishLen > 0.1 || t > 1.8 || take('dodge') || buffer)) { setState('getup', 0.12); invuln = 1.3; }
    } else if (s === 'getup') {
      if (t >= CLIPS.getup.dur) setState('idle', 0.2);
    } else if (s === 'dead') {
      vel.multiplyScalar(Math.max(0, 1 - 4 * dt)); deadT += dt; P.respawnTime = Math.max(0, 5 - deadT);
      if (deadT >= 5) respawn();
    } else if (s === 'item' || s === 'whetstone') {
      maxSpeed = s === 'item' ? 1.0 * wishLen : 0; turnRate = 3; accel = 6;
      // drink time: the swallow (effect + consumption) lands at D seconds; the clip is stretched to match
      const D = s === 'item' ? itemOpts?.drink || 0.75 : 0;
      if (s === 'item') animT = t < D ? 0.75 * t / D : 0.75 + (t - D);
      const at = animT ?? t;
      view.rig.flask.visible = s === 'item' && at > 0.15 && at < 1.25; view.rig.whet.visible = s === 'whetstone' && t > 0.25 && t < 1.55;
      if (s === 'item' && t >= D && t - dt < D) { if (itemOpts) { healLeft = (itemOpts.heal || 0) * M.heal; try { itemOpts.onUse?.(); } catch (e) { console.warn(e); } } else { P.potions--; healLeft = 50 * M.heal; } events.emit('item:used', { kind: itemOpts?.id || 'potion' }); events.emit('sfx', { name: 'drink', position: P.position.clone() }); }
      if (s === 'whetstone' && t > 0.4 && t < 1.4 && Math.floor(t * 4) !== Math.floor((t - dt) * 4)) { events.emit('sfx', { name: 'whetstone', position: P.position.clone(), volume: 0.6 }); sparks.burst(view.rig.whet.getWorldPosition(new THREE.Vector3()), new THREE.Vector3(0, 1, 0), 5, 0.3, 1); }
      if (s === 'whetstone' && t >= 1.4 && t - dt < 1.4) { P.sharpness = 1; itemOpts?.onUse?.(); events.emit('player:sharpened', {}); }
      if (at >= CLIPS[STATE_CLIP[s]].dur) { view.rig.flask.visible = view.rig.whet.visible = false; setState('idle', 0.2); }
      else if (take('dodge') && t > 0.1) { // cancel: before the swallow nothing is used up
        const early = s === 'item' ? t < D : t < 1.4; view.rig.flask.visible = view.rig.whet.visible = false;
        if (startDodge() && early) events.emit('item:cancel', { kind: itemOpts?.id || s });
      }
    }
    if (healLeft > 0) { const h = Math.min(healLeft, 70 * dt); healLeft -= h; P.hp = Math.min(P.maxHp, P.hp + h); P.redHp = Math.max(P.redHp, P.hp); if (healLeft <= 0) events.emit('player:heal', {}); }
    // recoverable (red) health: after 1.5s without being hit, hp regenerates toward redHp while redHp slowly decays toward hp
    sinceHit += dt;
    if (P.redHp > P.hp && !P.dead) {
      if (sinceHit > 1.5) P.hp = Math.min(P.redHp, P.hp + 3.5 * M.heal * dt);
      P.redHp = Math.max(P.hp, P.redHp - 1.5 * dt);
    } else P.redHp = P.hp;
    P.recoverableHp = P.redHp;

    if (P.aiming) { turnRate = 0; turnToward(camF, 12, dt); } // strafe while aiming: always face the crosshair
    ropeTick(dt, P.state); updateArrows(dt);
    // movement integration
    maxSpeed *= M.speed; rootMove *= P.state === 'dodge' ? 1 : M.speed;
    if (AIR.has(P.state)) { /* airborne: velocity carried, steered above */ }
    else if (maxSpeed > 0 || LOCO.has(P.state) || SELF_MOVE.has(P.state)) {
      if (wishLen > 0.01) turnToward(wish, turnRate, dt);
      const f = fwd(new THREE.Vector3());
      const align = wishLen > 0.01 ? Math.max(0, f.dot(wish)) : 0;
      const target = f.multiplyScalar(maxSpeed * (0.35 + 0.65 * align));
      const rate = target.lengthSq() > vel.lengthSq() ? accel : 18;
      tmp.subVectors(target, vel); const l = tmp.length(), step = rate * dt; if (l > step) tmp.multiplyScalar(step / l); vel.add(tmp);
    } else if (rootMove > 0 || ATTACKS[P.state] || P.state === 'charge' || P.state === 'tcharge' || P.state === 'dodge' || P.state === 'guard') {
      if (P.state !== 'guard' || vel.lengthSq() < 0.01) vel.copy(fwd(new THREE.Vector3()).multiplyScalar(rootMove));
      else vel.multiplyScalar(Math.max(0, 1 - 6 * dt));
    }
    P.position.x += vel.x * dt; P.position.z += vel.z * dt;
    collide();
    { // vertical: ground snap, or gravity while airborne; walking off a ledge starts a fall
      const gh = world.getHeight(P.position.x, P.position.z);
      if (airborne) {
        vy -= GRAVITY * dt; P.position.y += vy * dt;
        if (P.state === 'ropePull') { if (P.position.y < gh) { P.position.y = gh; vy = Math.max(0, vy); } } // dragged along the ground, never into it
        else if (P.position.y <= gh && vy <= 0) land(gh);
      }
      else if (LOCO.has(P.state) && lastGround - gh > 0.9 && Math.hypot(P.position.x - lastX, P.position.z - lastZ) < 0.5 && !P.dead) { startFall(); P.position.y = lastGround; }
      else P.position.y = gh;
      lastGround = airborne ? gh : P.position.y; lastX = P.position.x; lastZ = P.position.z;
    }
    speedNow = Math.hypot(vel.x, vel.z);
    object3d.rotation.y = P.facing;

    // stamina
    if ((stamDelay -= dt) <= 0) P.stamina = Math.min(P.maxStamina, P.stamina + (P.state === 'guard' ? 12 : 32) * M.stamRegen * (RES.buff.stam > 0 ? 1.5 : 1) * dt);
    if (P.exhausted && P.stamina > 30) P.exhausted = false;

    // locomotion phase + footsteps
    if (LOCO.has(P.state)) {
      amt += (clamp(speedNow / 4.7, 0, 1.35) - amt) * Math.min(1, dt * 10);
      const stride = P.weaponDrawn ? 1.25 : P.state === 'sprint' ? 2.3 : 1.7;
      const prev = phase; phase += (speedNow / stride) * Math.PI * 2 * dt;
      if (Math.floor(prev / Math.PI) !== Math.floor(phase / Math.PI) && speedNow > 0.5) {
        footSide ^= 1; const b = view.rig.bones[footSide ? 'footL' : 'footR'];
        events.emit('footstep', { position: b.getWorldPosition(new THREE.Vector3()), heavy: false, volume: 0.3 + Math.min(0.5, speedNow / 14), player: true });
      }
    } else amt *= Math.max(0, 1 - dt * 6);
    P.weaponDrawnVisual = view.inHand;
    view.setGlow(P.state === 'charge' || P.state === 'tcharge' ? P.chargeLevel : 0, game.time ?? 0);
    view.update(dt, animParams());
    trail.mat.uniforms.uPower.value = P.state === 'heavy' || P.state === 'trueslash' ? 1.2 + heavyLevel * 0.2 : 1;
    trail.update(clock);
  };
  function animParams() {
    return { t: animT ?? t, phase, amt, drawn: P.weaponDrawn || view.inHand, sprint: P.state === 'sprint', tremble: P.state === 'charge' || P.state === 'tcharge' ? P.chargeLevel * 0.6 : 0 };
  }
  function collide() {
    for (const c of world.colliders || []) {
      const dx = P.position.x - c.x, dz = P.position.z - c.z, d = Math.hypot(dx, dz), R = c.r + 0.42;
      if (d < R && d > 1e-5) { P.position.x = c.x + dx / d * R; P.position.z = c.z + dz / d * R; }
    }
    const py = P.position.y;
    for (const m of game.monsters) {
      if (!m?.getHitboxes || m.state === 'dead') continue;
      for (const h of m.getHitboxes()) {
        const c = h.sphere.center, r = h.sphere.radius, cy = clamp(c.y, py, py + 1.8), dy = c.y - cy;
        if (Math.abs(dy) >= r) continue;
        const rh = Math.sqrt(r * r - dy * dy) * 0.85 + 0.4, dx = P.position.x - c.x, dz = P.position.z - c.z, d = Math.hypot(dx, dz);
        if (d < rh && d > 1e-5) { P.position.x = c.x + dx / d * rh; P.position.z = c.z + dz / d * rh; }
      }
    }
    const R = (world.bounds?.radius ?? 1e9) - 0.6, d = Math.hypot(P.position.x, P.position.z);
    if (d > R) { P.position.x *= R / d; P.position.z *= R / d; }
    // open fields (island): no wading out to sea / off the map — snap back to the last walkable spot
    if (world.canWalk) {
      if (!world.canWalk(P.position.x, P.position.z)) { if (lastWalkable) { P.position.x = lastWalkable.x; P.position.z = lastWalkable.z; } }
      else (lastWalkable ||= new THREE.Vector3()).copy(P.position);
    }
  }
  let lastWalkable = null;

  P.serialize = () => ({ sa: superArmor ? 1 : 0,
    p: [+P.position.x.toFixed(2), +P.position.y.toFixed(2), +P.position.z.toFixed(2)], f: +P.facing.toFixed(3), s: P.state, t: +t.toFixed(3),
    hp: Math.round(P.hp), w: view.inHand ? 1 : 0, wc: P.cls, a: +amt.toFixed(2), c: P.chargeLevel, h: heavyLevel,
  });
  // debug hooks for critics: freeze an exact animation moment
  P.debug = {
    freeze(state, time = 0, { drawn } = {}) {
      frozen = false; frozenLoco = null; if (drawn !== undefined) { P.weaponDrawn = drawn; view.setInHand(drawn); }
      if (state === 'charge') heavyLevel = 2;
      setState(state, 0); t = time; if (state === 'charge') P.chargeLevel = time > CHARGE_LV[1] ? 2 : 1;
      view.setGlow(P.chargeLevel, 0); for (let i = 0; i < 8; i++) view.setGlow(state === 'charge' ? P.chargeLevel : 0, 0);
      view.update(1, animParams()); for (let i = 0; i < 60; i++) view.update(1 / 60, animParams());
      trail.clear();
      if (ATTACKS[state]) { const T = t, a0 = ATTACKS[state].active[0] - 0.04; for (let k = 10; k >= 0; k--) { t = T - k * 0.012; if (t < a0) continue; clock = 10 + t; view.update(0.0001, animParams()); trailSample(); } t = T; clock = 10 + T; view.update(0.0001, animParams()); trail.update(clock); }
      frozen = true;
    },
    unfreeze() { frozen = false; frozenLoco = null; },
    loco(phase, amt, { sprint = false, drawn = false } = {}) { this.freeze('idle', 0, { drawn }); frozenLoco = { t: 0, phase, amt, drawn, sprint }; for (let i = 0; i < 30; i++) view.update(1 / 60, frozenLoco); },
    setDrawn(v) { P.weaponDrawn = v; view.setInHand(v); setState('idle', 0); },
    sparks, trail, setState, ATTACKS, get t() { return t; },
  };
  setState('idle', 0);
  { const wq = game.params?.get?.('weapon'); P.setWeaponClass(WEAPON_CLASSES[wq] ? wq : 'greatsword'); }
  return P;
}

// ---------------- remote hunters ----------------
export function createRemoteHunter(game, id) {
  const view = new HunterView(game, { cloth: 0x2f7f95, plume: 0x3fb4cf, mantle: 0x34505e, suit: 0x3a4a58, trim: 0xd8d0c0 });
  const object3d = view.root;
  let last = null, lastS = null, localT = 0, phase = 0, amt = 0, px = null, pz = null;
  return {
    id, object3d, view, ownsTransform: false,
    applyRemote(st = {}) {
      const dt = Math.min(0.1, Math.max(0, st.net?.dt ?? 1 / 60));
      const s = typeof st.s === 'string' ? st.s : 'idle';
      if (s !== lastS) { lastS = s; localT = +st.t || 0; }
      else localT += dt; if (st.t != null && Math.abs(localT - st.t) > 0.25) localT = +st.t;
      const nx = st.net?.x ?? st.p?.[0], nz = st.net?.z ?? st.p?.[2];
      let sp = 0; if (px != null && dt > 0 && nx != null) sp = Math.hypot(nx - px, nz - pz) / dt; px = nx; pz = nz;
      if (sp > 15) sp = 0;
      amt += ((st.a != null ? +st.a : Math.min(1.35, sp / 4.7)) - amt) * Math.min(1, dt * 8);
      const drawn = !!st.w; view.setInHand(drawn);
      phase += (sp / (drawn ? 1.25 : s === 'sprint' ? 2.3 : 1.7)) * Math.PI * 2 * dt;
      if (st.wc) view.setWeaponClass(st.wc);
      const clip = clipOf(s, st.wc || 'greatsword');
      view.play(clip || 'loco', 0.12);
      view.setGlow(s === 'charge' ? (+st.c || 0) : 0, localT);
      if (dt > 0) view.update(dt, { t: localT, phase, amt, drawn, sprint: s === 'sprint', tremble: s === 'charge' ? (+st.c || 0) * 0.6 : 0 });
      last = st;
    },
    dispose() { view.dispose(); },
  };
}
