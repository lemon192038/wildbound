// Riding artificial monsters (taming). The equipped construct (account state `tameEquip`, server-validated) is
// summoned with the RIDE button (T / touch 呼出 / gamepad D-pad up): first press summons it beside you, the next press
// mounts it on the spot, a press while riding dismounts on the spot. Constructs never fight; they carry you fast.
// Traits (src/shared/tame.js): lavaSwim · fly · unseen · camo · heatproof · poisonproof · sprint · climb · bounce ·
// sturdy · charge — enforced here and through the hooks player.js / status.js / perception read (P.unseen,
// P.lavaSafe, ride.immune(kind), ride.sturdy).
import * as THREE from 'three';
import { TAMES } from '../shared/tame.js';
import { createMountModel } from './mountModel.js';
import { t, monsterShort } from '../shared/i18n.js';

const GRAV = 22;
// seated pose (also used for co-op riders): thighs forward and apart, shins down, arms resting on the pommel
export function seatPose(bones) {
  if (!bones) return;
  for (const [s, k] of [[1, 'L'], [-1, 'R']]) {
    bones['thigh' + k]?.rotation.set(-1.35, 0, 0.42 * s); bones['shin' + k]?.rotation.set(1.25, 0, 0); bones['foot' + k]?.rotation.set(0.15, 0, 0);
    bones['upperArm' + k]?.rotation.set(-0.5, 0, 0.2 * s); bones['foreArm' + k]?.rotation.set(-0.7, 0, 0);
  }
}
export function createRide(game) {
  const { scene } = game; const W = () => game.world;
  let sp = null, T = null, model = null, summoned = false, active = false;
  const pos = new THREE.Vector3(); let yaw = 0, vy = 0, flying = false, onGround = true, speed = 0, idleT = 0, lastToast = 0;
  const vel = new THREE.Vector3(); const _v = new THREE.Vector3(), _f = new THREE.Vector3();
  const stats = { summons: 0, mounts: 0, dismounts: 0, thrown: 0, lavaBlocked: 0, maxAlt: 0, maxSpeed: 0 };
  const has = (tr) => !!T?.traits.includes(tr);
  const toast = (msg) => game.events?.emit('tame:msg', { text: msg });
  const name = () => t('tm.name', { m: monsterShort(sp) });

  // the server's choice when signed in; ?tame=<sp> only for offline / headless play (no account, nothing is earned there)
  function equipped() { const s = game.account?.state; if (s) return s.tameEquip && s.tames?.[s.tameEquip] ? s.tameEquip : null; return TAMES[game.tameOverride] ? game.tameOverride : null; }
  // the real monster model loads asynchronously (the dragons come from a GLB): it is preloaded as soon as the equipped
  // construct is known; a RIDE press before it is ready summons it the moment it arrives
  let loading = null, pendingSummon = false;
  function ensureModel() {
    const want = equipped(); if (want !== sp) { if (model) { scene.remove(model.root); model.dispose(); } model = null; loading = null; sp = want; T = sp ? TAMES[sp] : null; summoned = false; active = false; }
    if (sp && !model && !loading) {
      const want2 = sp;
      loading = createMountModel(sp).then((m) => {
        loading = null; if (sp !== want2) { m.dispose(); return; }
        model = m; model.root.visible = false; model.root.userData.global = true; scene.add(model.root);
        if (pendingSummon) { pendingSummon = false; if (game.player && !game.player.dead) summon(game.player); }
      }).catch((e) => { loading = null; pendingSummon = false; console.error('[wildbound] construct model failed', e); });
    }
    return !!model;
  }
  const lavaSurface = (x, z) => W().lavaSurfaceAt?.(x, z) ?? null;
  function groundAt(x, z) { const g = W().getHeight(x, z); if (has('lavaSwim')) { const l = lavaSurface(x, z); if (l != null && l > g) return l; } return g; }
  function summon(P) {
    if (!equipped()) { toast(t('f.noTame')); return false; }
    if (!ensureModel()) { pendingSummon = true; return false; }
    _f.set(Math.sin(P.facing + Math.PI / 2), 0, Math.cos(P.facing + Math.PI / 2));
    let x = P.position.x + _f.x * 2.8, z = P.position.z + _f.z * 2.8;
    if ((W().lavaAt?.(x, z) && !has('lavaSwim')) || (W().canWalk && !W().canWalk(x, z))) { x = P.position.x; z = P.position.z; }
    pos.set(x, groundAt(x, z), z); yaw = P.facing; vel.set(0, 0, 0); vy = 0; flying = false;
    summoned = true; model.root.visible = true; place(); stats.summons++;
    W().spawnDust?.(pos.clone().setY(pos.y + 0.5), 1.2); game.events?.emit('sfx', { name: 'draw', position: pos.clone(), volume: 0.7 });
    toast(t('f.summoned', { m: name() })); return true;
  }
  function mount(P) {
    if (!summoned) return false;
    if (Math.hypot(pos.x - P.position.x, pos.z - P.position.z) > 8) { pos.set(P.position.x, groundAt(P.position.x, P.position.z), P.position.z); } // ride on the spot
    else { pos.x = P.position.x; pos.z = P.position.z; pos.y = groundAt(pos.x, pos.z); }
    yaw = P.facing; active = true; P.onMount?.(); stats.mounts++; idleT = 0;
    game.events?.emit('tame:mount', { sp }); return true;
  }
  function dismount(P, why = 'manual') {
    if (!active) return; active = false; flying = false; onGround = true;
    // step off beside the saddle, on the spot (a lava swimmer drops you on the nearest bank direction you face)
    _f.set(Math.sin(yaw + Math.PI / 2), 0, Math.cos(yaw + Math.PI / 2));
    let x = pos.x + _f.x * 1.6 * T.s, z = pos.z + _f.z * 1.6 * T.s;
    if (W().canWalk && !W().canWalk(x, z)) { x = pos.x; z = pos.z; }
    P.position.set(x, W().getHeight(x, z), z);
    pos.y = groundAt(pos.x, pos.z); vy = 0; place();
    P.onDismount?.(why === 'thrown'); stats[why === 'thrown' ? 'thrown' : 'dismounts']++; P.unseen = false; P.lavaSafe = false;
    if (why === 'thrown') toast(t('f.thrown'));
    game.events?.emit('tame:dismount', { sp, why });
  }
  // RIDE button: summon → mount → dismount
  function toggle(P) {
    if (!P || P.dead) return;
    if (active) return dismount(P);
    if (!summoned || !model || equipped() !== sp) return summon(P);
    return mount(P);
  }
  function place() { if (!model) return; model.root.position.copy(pos); model.root.rotation.y = yaw; }

  // driving: called by player.js instead of its own locomotion while mounted
  function drive(P, dt, inp, wish, wishLen) {
    const cam = game.camera; cam.getWorldDirection(_v);
    const sprint = !!inp.sprint && wishLen > 0.1 && (has('sprint') || P.stamina > 1);
    if (sprint && !has('sprint')) P.stamina = Math.max(0, P.stamina - 6 * dt); else P.stamina = Math.min(P.maxStamina, P.stamina + 20 * dt);
    let max = T.speed * (sprint ? 1.35 : 1) * wishLen;
    // slopes slow most constructs down (climbers ignore them)
    if (!flying && wishLen > 0.01 && !has('climb')) { const ahead = groundAt(pos.x + wish.x * 1.5, pos.z + wish.z * 1.5) - groundAt(pos.x, pos.z); const sl = ahead / 1.5; if (sl > 0.35) max *= Math.max(0.3, 1 - (sl - 0.35) * 1.6); }
    _f.copy(wish).multiplyScalar(max); const k = Math.min(1, dt * (flying ? 2.5 : 5)); vel.x += (_f.x - vel.x) * k; vel.z += (_f.z - vel.z) * k;
    if (wishLen > 0.05) { const want = Math.atan2(vel.x, vel.z); let d = want - yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); yaw += d * Math.min(1, dt * (flying ? 4 : 7)); }
    let nx = pos.x + vel.x * dt, nz = pos.z + vel.z * dt;
    // lava: only lava swimmers (and fliers in the air) may cross it
    if (!flying && !has('lavaSwim') && W().lavaAt?.(nx, nz)) { nx = pos.x; nz = pos.z; vel.multiplyScalar(0.2); stats.lavaBlocked++; if (performance.now() - lastToast > 2500) { lastToast = performance.now(); toast(t('f.lavaBlock')); } }
    if (W().canWalk && !W().canWalk(nx, nz)) { nx = pos.x; nz = pos.z; vel.multiplyScalar(0.2); }
    pos.x = nx; pos.z = nz;
    if (!has('charge') && !flying) { const R = 0.9 * T.s; for (const c of W().colliders || []) { const dx = pos.x - c.x, dz = pos.z - c.z, d = Math.hypot(dx, dz), rr = c.r + R; if (d < rr && d > 1e-5) { pos.x = c.x + dx / d * rr; pos.z = c.z + dz / d * rr; } } }
    const R0 = (W().bounds?.radius ?? 1e9) - 1, dd = Math.hypot(pos.x, pos.z); if (dd > R0) { pos.x *= R0 / dd; pos.z *= R0 / dd; }
    // vertical
    const gh = groundAt(pos.x, pos.z);
    if (has('fly')) {
      if (inp.jump) { if (!flying) { flying = true; vy = 9; } else vy = Math.min(14, vy + 7); }
      if (flying) {
        const pitchClimb = wishLen > 0.1 ? THREE.MathUtils.clamp(_v.y * 1.6, -1, 1) * max * 0.6 : 0; // fly where the camera looks
        if (inp.dodge) vy = Math.max(-16, vy - 8);
        vy += (pitchClimb - vy) * Math.min(1, dt * 1.5); pos.y += vy * dt;
        const ceil = gh + (T.ceiling || 50); if (pos.y > ceil) { pos.y = ceil; vy = Math.min(0, vy); }
        if (pos.y <= gh + 0.05 && vy <= 0) { pos.y = gh; flying = false; vy = 0; }
        stats.maxAlt = Math.max(stats.maxAlt, pos.y - gh);
      } else pos.y = gh;
    } else {
      if (inp.jump && onGround) { vy = has('bounce') ? 15 : 7.5; onGround = false; }
      if (!onGround) { vy -= GRAV * dt; pos.y += vy * dt; if (pos.y <= gh) { pos.y = gh; onGround = true; vy = 0; } }
      else { pos.y = gh; }
    }
    speed = Math.hypot(vel.x, vel.z); stats.maxSpeed = Math.max(stats.maxSpeed, speed);
    place(); model.update(dt, speed, { flying, swimming: has('lavaSwim') && W().lavaAt?.(pos.x, pos.z) });
    // rider: on the saddle, facing the construct's heading
    model.seatWorld(P.position); P.position.y -= 0.9; P.facing = yaw;
    idleT = speed < 0.3 ? idleT + dt : 0;
    P.unseen = has('unseen') || (has('camo') && idleT > 1); P.lavaSafe = has('lavaSwim');
  }
  // a construct that is out but not ridden just stands; far behind → it trots after you, too far → it is recalled
  function update(dt) {
    if (!model) { if (equipped()) ensureModel(); return; } const P = game.player;
    if (!active && summoned && P) {
      const d = Math.hypot(P.position.x - pos.x, P.position.z - pos.z);
      if (d > 120) { summoned = false; model.root.visible = false; return; }
      if (d > 10) { _f.set(P.position.x - pos.x, 0, P.position.z - pos.z).normalize(); const sp2 = Math.min(T.speed, d * 0.8); const nx = pos.x + _f.x * sp2 * dt, nz = pos.z + _f.z * sp2 * dt; if (!(W().lavaAt?.(nx, nz) && !has('lavaSwim'))) { pos.x = nx; pos.z = nz; } yaw = Math.atan2(_f.x, _f.z); speed = sp2; } else speed *= Math.max(0, 1 - dt * 5);
      pos.y = groundAt(pos.x, pos.z); place(); model.update(dt, speed, {});
    }
  }
  const pose = seatPose;
  const immune = (kind) => active && ((kind === 'burn' && (has('heatproof') || has('lavaSwim'))) || (kind === 'poison' && has('poisonproof')));
  function reset() { if (model) { scene.remove(model.root); model.dispose(); } model = null; loading = null; sp = null; T = null; summoned = false; active = false; }
  return {
    toggle, summon, mount, dismount, drive, update, pose, immune, reset, whenReady: () => { ensureModel(); return loading || Promise.resolve(); },
    get active() { return active; }, get summoned() { return summoned; }, get sp() { return sp; }, get flying() { return flying; }, get sturdy() { return has('sturdy'); },
    get scale() { return T?.s || 1; }, get position() { return pos; }, get model() { return model; }, has, stats, equipped,
  };
}
