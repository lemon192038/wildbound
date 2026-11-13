// Local hunter: state machine, camera-relative movement, stamina, greatsword combat (startup/active/recovery,
// charge levels, hitstop), damage intake, death/respawn, lock-on, autoplay debug. Also remote hunters for co-op.
import * as THREE from 'three';
import { HunterView } from './hunterView.js';
import { CLIPS } from './anim.js';
import { WeaponTrail, Sparks } from './vfx.js';

const ATTACK_POWER = 210;
// t in seconds within the clip. move: [t0, t1, metres forward]. turn: until t the attack can still be aimed.
const ATTACKS = {
  light1: { mv: 0.34, active: [0.22, 0.39], move: [[0.16, 0.36, 0.7]], turn: 0.16, next: 'light2', combo: [0.4, 0.86], cancel: 0.6, stop: 0.07, shake: 0.28 },
  light2: { mv: 0.3, active: [0.17, 0.37], move: [[0.1, 0.32, 0.6]], turn: 0.12, next: 'light3', combo: [0.37, 0.82], cancel: 0.56, stop: 0.07, shake: 0.26 },
  light3: { mv: 0.6, active: [0.4, 0.54], move: [[0.3, 0.5, 0.9]], turn: 0.3, next: null, combo: [0.9, 1.3], cancel: 0.95, stop: 0.13, shake: 0.55, slam: 0.5 },
  heavy: { mv: [0.45, 0.72, 1.0, 1.4], active: [0.06, 0.2], move: [[0.0, 0.16, 0.85]], turn: 0.0, next: null, combo: [0.7, 1.2], cancel: 0.8, stop: [0.09, 0.12, 0.15, 0.19], shake: [0.35, 0.5, 0.7, 0.95], slam: 0.17 },
  // shoulder tackle bridge (super armour) -> True Charge
  tackle: { mv: 0.22, active: [0.14, 0.34], move: [[0.06, 0.3, 1.9]], turn: 0.08, next: null, combo: [0.26, 0.62], cancel: 0.4, stop: 0.08, shake: 0.32, tackle: true },
  trueslash: { mv: [0.85, 1.25, 1.65, 2.2], active: [0.1, 0.24], move: [[0.02, 0.2, 1.0]], turn: 0.0, next: null, combo: [0.95, 1.45], cancel: 1.0, stop: [0.1, 0.14, 0.18, 0.22], shake: [0.45, 0.6, 0.8, 1.0], slam: 0.21 },
};
const CHARGE_LV = [0.55, 1.15, 1.75], CHARGE_MAX = 2.6, TRUE_LV = [0.42, 0.86, 1.3];
const LOCO = new Set(['idle', 'walk', 'run', 'sprint']);
const SELF_MOVE = new Set(['draw', 'sheathe', 'item', 'whetstone', 'getup']); // states that steer/decelerate with normal locomotion physics
const STATE_CLIP = { draw: 'draw', sheathe: 'sheathe', light1: 'light1', light2: 'light2', light3: 'light3', charge: 'charge', tcharge: 'charge', heavy: 'heavy', tackle: 'tackle', trueslash: 'trueslash', guard: 'guard', dodge: 'dodge', hit: 'hit', knockdown: 'knockdown', getup: 'getup', dead: 'dead', item: 'potion', whetstone: 'whetstone' };
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
  let slowT = 0, superArmor = false, sinceHit = 99, clock = 0, prevBlade = [], curBlade = [], speedNow = 0, footSide = 0, stunT = 0;
  const spawn = () => {
    const s = world.spawn.player; P.position.set(s.x, world.getHeight(s.x, s.z), s.z);
    const m = game.monsters?.[0]; P.facing = m ? Math.atan2(m.position.x - s.x, m.position.z - s.z) : Math.PI;
  };
  spawn();

  function setState(s, fade = 0.12) {
    P.state = s; t = 0; attachDone = false;
    if (STATE_CLIP[s]) view.play(STATE_CLIP[s], fade); else view.play('loco', fade);
    if (ATTACKS[s]) { hitSets = new Map(); hitCount = 0; swingFirstHit = false; trail.clear(); }
  }
  P.setState = setState;
  const fwd = (out = tmp) => out.set(Math.sin(P.facing), 0, Math.cos(P.facing));
  const turnToward = (dir, rate, dt) => { if (dir.lengthSq() < 1e-4) return; const want = Math.atan2(dir.x, dir.z); P.facing = wrap(P.facing + clamp(wrap(want - P.facing), -rate * dt, rate * dt)); };
  const targetDir = () => { const m = P.lockTarget; if (!m) return null; return new THREE.Vector3(m.position.x - P.position.x, 0, m.position.z - P.position.z).normalize(); };
  const aimDir = () => (wish.lengthSq() > 0.01 ? wish : targetDir() || new THREE.Vector3());
  const useStamina = (n) => { if (P.stamina < n * 0.5) return false; P.stamina = Math.max(0, P.stamina - n); stamDelay = 0.7; return true; };

  function startAttack(kind) {
    if (!P.weaponDrawn) { queued = kind; setState('draw'); return; }
    if (kind === 'light') setState('light1', 0.1);
    else if (kind === 'heavy') { setState('charge', 0.12); lastLevel = 0; }
  }
  function startDodge() {
    if (!useStamina(25)) return false;
    const d = wish.lengthSq() > 0.01 ? wish.clone() : fwd(new THREE.Vector3());
    P.facing = Math.atan2(d.x, d.z); setState('dodge', 0.06); events.emit('sfx', { name: 'dodge', position: P.position.clone(), volume: 0.7 }); return true;
  }
  function startItem(kind) {
    if (P.weaponDrawn) { queued = 'item:' + kind; setState('sheathe'); return; }
    if (kind === 'potion' && P.potions <= 0) return;
    itemKind = kind; setState(kind === 'potion' ? 'item' : 'whetstone', 0.15);
  }
  P.useItem = startItem;

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
    else curBlade = view.bladeWorld(curBlade);
    if (!prevBlade.length) prevBlade = curBlade.map((v) => v.clone());
    const lvl = P.state === 'heavy' || P.state === 'trueslash' ? heavyLevel : 0;
    const mv = Array.isArray(atk.mv) ? atk.mv[lvl] : atk.mv;
    for (const m of game.monsters) {
      if (!m || m.hp <= 0 || m.state === 'dead') continue;
      let set = hitSets.get(m); if (!set) hitSets.set(m, (set = new Set()));
      for (const hb of m.getHitboxes()) {
        if (set.has(hb.part) || set.size >= 2) continue;
        const sc = hb.sphere.center, R = hb.sphere.radius + (atk.tackle ? 0.55 : 0.18);
        let hitP = null;
        for (let i = 0; i < curBlade.length && !hitP; i++) for (const k of [0, 0.5, 1]) {
          _mid.lerpVectors(prevBlade[i], curBlade[i], k);
          if (_mid.distanceToSquared(sc) < R * R) { hitP = _mid.clone(); break; }
        }
        if (!hitP) continue;
        set.add(hb.part);
        _n.subVectors(hitP, sc).normalize(); const point = sc.clone().addScaledVector(_n, hb.sphere.radius);
        const isCrit = Math.random() < 0.12;
        const damage = mv * ATTACK_POWER * sharpMult(P.sharpness) * (isCrit ? 1.25 : 1);
        const res = m.receiveHit({ damage, part: hb.part, point, normal: _n.clone(), attackerId: 'local', isCrit });
        const hz = m.parts?.find((p) => p.name === hb.part)?.hitzone ?? 1;
        const dealt = res && typeof res === 'object' && res.damage != null ? res.damage : typeof res === 'number' ? res : Math.round(damage * hz);
        events.emit('hit', { attacker: 'local', target: m, damage: dealt, part: hb.part, point, normal: _n.clone(), isCrit, weak: hz >= 1.2, motion: P.state, level: lvl });
        P.sharpness = Math.max(0, P.sharpness - 0.011);
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
  P.receiveHit = ({ damage = 0, knockback = 0, from, kind, stun } = {}) => {
    if (P.dead || iframe > 0 || invuln > 0 || frozen) return false;
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
    if (P.state === 'guard' && fwd(new THREE.Vector3()).dot(away) < -0.3) {
      damage *= 0.15; P.stamina = Math.max(0, P.stamina - 12 - kb); stamDelay = 0.8; vel.copy(away).multiplyScalar(Math.min(6, 1.5 + kb * 0.3));
      const pt = view.bladeWorld()[3]; sparks.burst(pt, away.clone().negate(), 26, 1.4, 1);
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
  function die() {
    P.dead = true; P.hp = 0; setState('dead', 0.1); deadT = 0; P.respawnTime = 5; P.chargeLevel = 0; events.emit('player:died', {});
  }
  function respawn() {
    spawn(); P.hp = P.maxHp; P.redHp = P.maxHp; P.stamina = P.maxStamina; P.dead = false; P.respawnTime = 0; vel.set(0, 0, 0);
    P.weaponDrawn = false; view.setInHand(false); setState('idle', 0.01); view.resetCloth(); invuln = 2; trail.clear();
    events.emit('player:respawn', {});
  }

  // ---------------- update ----------------
  let lastDt = 1 / 60;
  P.update = (dt, input, rawDt = dt) => {
    sparks.update(rawDt);
    if (slowT > 0 && (slowT -= rawDt) <= 0) game.engine.timeScale = 1;
    if (frozen) { view.update(frozenLoco ? 1 / 60 : 0, frozenLoco || animParams()); return; }
    if (dt <= 0) { trail.update(clock); return; }
    lastDt = dt; t += dt; clock += dt; iframe = Math.max(0, iframe - dt); invuln = Math.max(0, invuln - dt);
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
    if (inp.lockOn && !P.dead) {
      if (P.lockTarget) P.lockTarget = null;
      else { let best = null, bd = 80; for (const m of game.monsters) { const d = m.position.distanceTo(P.position); if (d < bd && m.hp > 0) { bd = d; best = m; } } P.lockTarget = best; }
    }
    if (P.lockTarget && (P.lockTarget.hp <= 0 || P.lockTarget.state === 'dead') && !autoplay) P.lockTarget = null;

    const s = P.state, atk = ATTACKS[s];
    let maxSpeed = 0, accel = 14, turnRate = 0, rootMove = 0;
    if (LOCO.has(s)) {
      const sprinting = inp.sprint && wishLen > 0.1 && !P.exhausted;
      if (sprinting && P.weaponDrawn) { setState('sheathe'); }
      else if (take('dodge')) startDodge();
      else if (take('light')) startAttack('light');
      else if (take('heavy')) startAttack('heavy');
      else if (take('potion')) startItem('potion');
      else if (take('whetstone')) startItem('whetstone');
      else if (inp.guard && P.weaponDrawn) setState('guard', 0.1);
      else if (inp.guard && !P.weaponDrawn) { queued = 'guard'; setState('draw'); }
      else {
        maxSpeed = P.weaponDrawn ? 2.7 * wishLen : (sprinting ? 7.2 : 4.7 * wishLen);
        accel = P.weaponDrawn ? 9 : 14; turnRate = P.weaponDrawn ? 7 : 11;
        if (sprinting) { P.stamina = Math.max(0, P.stamina - 20 * dt); stamDelay = 0.6; if (P.stamina <= 0) P.exhausted = true; }
        const ns = speedNow < 0.15 ? 'idle' : sprinting ? 'sprint' : speedNow > 3.2 ? 'run' : 'walk';
        if (ns !== P.state) P.state = ns;
      }
    } else if (s === 'draw' || s === 'sheathe') {
      const rate = queued && s === 'draw' ? 1.45 : 1.2; t += dt * (rate - 1);
      maxSpeed = 1.6 * wishLen; turnRate = 5; accel = 8;
      if (s === 'draw' && !attachDone && t >= 0.24) { attachDone = true; view.setInHand(true); events.emit('sfx', { name: 'draw', position: P.position.clone(), volume: 0.8 }); }
      if (s === 'sheathe' && !attachDone && t >= 0.5) { attachDone = true; view.setInHand(false); events.emit('sfx', { name: 'sheathe', position: P.position.clone(), volume: 0.6 }); }
      if (t >= CLIPS[s].dur) {
        P.weaponDrawn = s === 'draw';
        const q = queued; queued = null; setState(P.weaponDrawn ? 'idle' : 'idle', 0.15);
        if (q === 'light' || q === 'heavy') startAttack(q); else if (q === 'guard') setState('guard'); else if (q?.startsWith('item:')) startItem(q.slice(5));
      }
    } else if (atk) {
      if (t < atk.turn) { const d = aimDir(); turnToward(d, 7, dt); }
      for (const [a, b, dist] of atk.move) if (t >= a && t < b) rootMove = dist / (b - a);
      if (t >= atk.active[0] && t <= atk.active[1]) {
        if (t - dt < atk.active[0]) { prevBlade = []; events.emit('sfx', { name: atk.tackle ? 'tackle' : s === 'heavy' || s === 'light3' || s === 'trueslash' ? 'swingHeavy' : 'swing', position: P.position.clone(), volume: 0.8 + heavyLevel * 0.1 }); }
        doHits(atk); if (!atk.tackle) trailSample();
      } else if (!atk.tackle && t > atk.active[0] - 0.05 && t < atk.active[1] + 0.06) trailSample();
      if (atk.slam && t >= atk.slam && t - dt < atk.slam) {
        const tip = view.bladeWorld()[6]; world.spawnDust?.(new THREE.Vector3(tip.x, world.getHeight(tip.x, tip.z), tip.z), s === 'heavy' || s === 'trueslash' ? 1 + heavyLevel * 0.5 : 1);
        events.emit('camera:shake', { intensity: s === 'heavy' || s === 'trueslash' ? 0.2 + heavyLevel * 0.12 : 0.18, duration: 0.25 });
      }
      superArmor = !!atk.tackle && t > 0.03 && t < 0.46;
      if (t >= atk.combo[0] && t <= atk.combo[1]) {
        if (atk.tackle) { if (inp.heavyHeld || take('heavy')) { setState('tcharge', 0.1); lastLevel = 0; superArmor = false; } }
        else if (atk.next && take('light')) setState(atk.next, 0.08);
        else if ((s === 'heavy' || s === 'trueslash') && take('heavy')) { setState('tackle', 0.06); events.emit('sfx', { name: 'tackle', position: P.position.clone(), volume: 0.8 }); }
        else if (take('heavy')) { setState('charge', 0.12); lastLevel = 0; }
      }
      if (P.state !== s) superArmor = false;
      if (P.state === s && t >= atk.cancel && buffer?.a === 'dodge') { take('dodge'); startDodge(); }
      if (P.state === s && t >= CLIPS[s].dur) { setState('idle', 0.2); }
    } else if (s === 'charge' || s === 'tcharge') {
      turnToward(aimDir(), 2.2, dt);
      const LV = s === 'tcharge' ? TRUE_LV : CHARGE_LV;
      const lvl = t >= LV[2] ? 3 : t >= LV[1] ? 2 : t >= LV[0] ? 1 : 0;
      if (s === 'charge' && take('light')) { P.chargeLevel = 0; setState('tackle', 0.06); events.emit('sfx', { name: 'tackle', position: P.position.clone(), volume: 0.8 }); }
      else {
      if (lvl > lastLevel) {
        lastLevel = lvl; const pts = view.bladeWorld(); sparks.burst(pts[5], new THREE.Vector3(0, 1, 0), 10 + lvl * 8, 0.5 + lvl * 0.25, 1);
        events.emit('sfx', { name: 'charge' + lvl, position: P.position.clone(), volume: 0.6 + lvl * 0.15 }); events.emit('camera:shake', { intensity: 0.06 * lvl, duration: 0.15 });
      }
      P.chargeLevel = lvl;
      if (!inp.heavyHeld || t >= CHARGE_MAX) { heavyLevel = lvl; P.chargeLevel = 0; setState(s === 'tcharge' ? 'trueslash' : 'heavy', 0.03); events.emit('camera:fov', { kick: 4 + heavyLevel * (s === 'tcharge' ? 4 : 3) }); }
      }
    } else if (s === 'guard') {
      turnToward(aimDir(), 3, dt);
      if (!inp.guard) setState('idle', 0.15);
    } else if (s === 'dodge') {
      const d = CLIPS.dodge.dur; iframe = t > 0.03 && t < 0.25 ? 0.02 : iframe;
      rootMove = t < 0.5 ? 7.5 * (1 - t / 0.55) + 0.8 : 0.6;
      if (t > 0.46 && buffer && buffer.a !== 'dodge' && P.weaponDrawn) { const a = buffer.a; buffer = null; t = d; if (a === 'light' || a === 'heavy') startAttack(a); }
      else if (t >= d) setState(P.weaponDrawn ? 'idle' : 'idle', 0.15);
    } else if (s === 'hit') {
      vel.multiplyScalar(Math.max(0, 1 - 8 * dt));
      if (t >= Math.max(0.5, stunT)) { stunT = 0; setState('idle', 0.2); }
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
      view.rig.flask.visible = s === 'item' && t > 0.15 && t < 1.25; view.rig.whet.visible = s === 'whetstone' && t > 0.25 && t < 1.55;
      if (s === 'item' && t >= 0.75 && t - dt < 0.75) { P.potions--; healLeft = 50; events.emit('item:used', { kind: 'potion' }); events.emit('sfx', { name: 'drink', position: P.position.clone() }); }
      if (s === 'whetstone' && t > 0.4 && t < 1.4 && Math.floor(t * 4) !== Math.floor((t - dt) * 4)) { events.emit('sfx', { name: 'whetstone', position: P.position.clone(), volume: 0.6 }); sparks.burst(view.rig.whet.getWorldPosition(new THREE.Vector3()), new THREE.Vector3(0, 1, 0), 5, 0.3, 1); }
      if (s === 'whetstone' && t >= 1.4 && t - dt < 1.4) { P.sharpness = 1; events.emit('player:sharpened', {}); }
      if (t >= CLIPS[STATE_CLIP[s]].dur) { view.rig.flask.visible = view.rig.whet.visible = false; setState('idle', 0.2); }
      if (take('dodge') && t > 0.3) { view.rig.flask.visible = view.rig.whet.visible = false; startDodge(); }
    }
    if (healLeft > 0) { const h = Math.min(healLeft, 70 * dt); healLeft -= h; P.hp = Math.min(P.maxHp, P.hp + h); P.redHp = Math.max(P.redHp, P.hp); if (healLeft <= 0) events.emit('player:heal', {}); }
    // recoverable (red) health: after 1.5s without being hit, hp regenerates toward redHp while redHp slowly decays toward hp
    sinceHit += dt;
    if (P.redHp > P.hp && !P.dead) {
      if (sinceHit > 1.5) P.hp = Math.min(P.redHp, P.hp + 3.5 * dt);
      P.redHp = Math.max(P.hp, P.redHp - 1.5 * dt);
    } else P.redHp = P.hp;
    P.recoverableHp = P.redHp;

    // movement integration
    if (maxSpeed > 0 || LOCO.has(P.state) || SELF_MOVE.has(P.state)) {
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
    P.position.y = world.getHeight(P.position.x, P.position.z);
    speedNow = Math.hypot(vel.x, vel.z);
    object3d.rotation.y = P.facing;

    // stamina
    if ((stamDelay -= dt) <= 0) P.stamina = Math.min(P.maxStamina, P.stamina + (P.state === 'guard' ? 12 : 32) * dt);
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
    return { t, phase, amt, drawn: P.weaponDrawn || view.inHand, sprint: P.state === 'sprint', tremble: P.state === 'charge' || P.state === 'tcharge' ? P.chargeLevel * 0.6 : 0 };
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
  }

  P.serialize = () => ({ sa: superArmor ? 1 : 0,
    p: [+P.position.x.toFixed(2), +P.position.y.toFixed(2), +P.position.z.toFixed(2)], f: +P.facing.toFixed(3), s: P.state, t: +t.toFixed(3),
    hp: Math.round(P.hp), w: view.inHand ? 1 : 0, a: +amt.toFixed(2), c: P.chargeLevel, h: heavyLevel,
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
      const clip = STATE_CLIP[s];
      view.play(clip || 'loco', 0.12);
      view.setGlow(s === 'charge' ? (+st.c || 0) : 0, localT);
      if (dt > 0) view.update(dt, { t: localT, phase, amt, drawn, sprint: s === 'sprint', tremble: s === 'charge' ? (+st.c || 0) * 0.6 : 0 });
      last = st;
    },
    dispose() { view.dispose(); },
  };
}
