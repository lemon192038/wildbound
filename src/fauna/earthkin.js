// Creatures of rock and ground: Stone Mole (+ Grand Mole, its old giant individual) and Boulder Golem.
// Behaviour from the user's design document:
//  Stone Mole — lives underground and rarely surfaces. Feels footsteps: far → keeps foraging; mid range → turns
//   toward the vibration; closer → follows the hunter underground (a moving mound + dust); if the hunter stops, it
//   waits just below. It bursts up (knock-up) when the hunter lingers moving right above it, when the mound is
//   struck, or on strong vibrations (heavy hits nearby). On the surface: giant claw swipes and a short digging
//   charge; after a while (or badly hurt) it digs back down and escapes. It hunts burrowed beetles underground and
//   avoids lava snakes. The Grand Mole chases much longer near its nest.
//  Boulder Golem — indistinguishable from a rock. Distance-graded reaction: mid range → alert (no visible change),
//   nearer → the magma core glows faintly, close → it slowly stands, very close / attacked → fully awake and
//   hostile. Some individuals wait and rise right AFTER the hunter has walked past. Slow; rock fist, two-armed ground
//   slam (staggers), rock throw at range, short heavy charge. Defends its territory only: pursues to the edge, a bit
//   further when attacked, then walks home and settles back into a rock. Ash Birds perch on dormant golems and burst
//   away when one wakes.
import { disabled } from '../core/parts.js';

export function createEarthAI(ctx) {
  const { game, rnd, setAi, steer, nearestOf, nearestHunter, noiseOf, ground, wrapA, pickSpot, shoot, W } = ctx;
  const face = (c, x, z, dt, rate = 2) => { c.yaw += Math.max(-rate * dt, Math.min(rate * dt, wrapA(Math.atan2(x - c.pos.x, z - c.pos.z) - c.yaw))); };
  const hurtLocal = (h, a, from) => { if (!h?.local) return false; const ok = game.player.receiveHit?.({ damage: a.damage, knockback: a.knockback ?? 4, from: from.clone() }); if (ok !== false && a.status) game.status?.apply?.(...a.status); return ok !== false; };
  const bossNear = (p, r) => (game.monsters || []).some((m) => m.state !== 'dead' && m.position.distanceTo(p) < r);
  const moving = (h) => /run|sprint|walk|light|heavy|charge|slash|tackle|dodge|roll/.test(h?.state || '') || (h?.ref?.speed || 0) > 0.5;

  // strong vibrations: heavy hits on the ground near a mole make it surface
  const quakes = [];
  game.events?.on?.('camera:shake', (e) => { if ((e?.intensity || 0) >= 0.5 && game.player?.position) quakes.push({ p: game.player.position.clone(), t: 0 }); });

  // ------------------------------------------------------------------ Stone Mole
  function thinkMole(c, dt) {
    const S = c.S, A = S.attacks; const [h, dH] = nearestHunter(c.pos.x, c.pos.z);
    c.cd -= dt;
    for (let i = quakes.length - 1; i >= 0; i--) { quakes[i].t += dt; if (quakes[i].t > 1) quakes.splice(i, 1); }
    const under = c.ai === 'roam' || c.ai === 'track' || c.ai === 'lurk' || c.ai === 'flee' || c.ai === 'feed';
    if (under) {
      c.mode = 2; c.under = true; c.dustT = (c.dustT || 0) - dt;
      if (c.move > 0.2 && c.dustT <= 0) { c.dustT = 0.45; W.spawnDust?.(c.pos.clone(), 0.5 + 0.4 * c.scale); }
      // vibration sensing (hearing = footsteps through the ground)
      const vib = h && moving(h) ? S.senses.hearing * noiseOf(h) * 1.4 : h ? 4 : 0;
      const snake = nearestOf(c, 14, (o) => o.sp === 'snake' && !o.dead && o.ai !== 'dive');
      if (snake && c.ai !== 'flee') { setAi(c, 'flee'); c.fleeFrom = snake.pos.clone(); }
      if (c.ai === 'flee') { const a = Math.atan2(c.pos.x - c.fleeFrom.x, c.pos.z - c.fleeFrom.z); dig(c, c.pos.x + Math.sin(a) * 8, c.pos.z + Math.cos(a) * 8, S.digSpeed, dt); if (c.t > 5) setAi(c, 'roam'); return; }
      if (quakes.some((q) => q.p.distanceTo(c.pos) < 12)) { burst(c, h); return; }
      if (h && dH < vib && dH < S.chase + 10) {
        if (c.ai !== 'track' && c.ai !== 'lurk') setAi(c, 'track');
        if (c.ai === 'track') {
          const d = dig(c, h.pos.x, h.pos.z, S.digSpeed * (dH > 8 ? 1 : 0.5), dt);
          if (d < 2.2) { c.aboveT = (c.aboveT || 0) + (moving(h) ? dt : 0); if (!moving(h)) setAi(c, 'lurk'); }
          if (c.aboveT > 1.6 && c.cd <= 0) { c.aboveT = 0; burst(c, h); }
          return;
        }
      }
      if (c.ai === 'lurk') { c.move = 0; if (h && dH < 4 && moving(h)) { c.lurkT = (c.lurkT || 0) + dt; if (c.lurkT > 0.8 && c.cd <= 0) { c.lurkT = 0; burst(c, h); } } else if (!h || dH > 8) setAi(c, 'roam'); return; }
      // forage: hunts burrowed beetles (larvae) along its tunnels
      const larva = nearestOf(c, 6, (o) => o.sp === 'beetle' && !o.dead && o.ai === 'burrowed');
      if (larva && rnd() < dt * 0.3) { ctx.die(larva, 'predation', c); setAi(c, 'feed'); c.dur = 6; return; }
      if (c.ai === 'feed') { c.move = 0; if (c.t > c.dur) setAi(c, 'roam'); return; }
      if (!c.target || c.t > 25) { c.t = 0; const s = pickSpot(c.home.x, c.home.z, 4, 35, 'mole'); c.target = s || [c.home.x, c.home.z]; }
      dig(c, c.target[0], c.target[1], S.digSpeed * 0.35, dt);
      return;
    }
    // ---- above ground ----
    c.under = false; c.engaged = !!h && dH < 30;
    if (c.ai !== 'burst' && c.ai !== 'dig') c.surfT = (c.surfT ?? 15) - dt; // surface time runs during attacks too
    if (c.ai === 'burst') { // erupting out of the ground
      c.mode = 1; c.rise = Math.min(1, c.t / 0.5); c.move = 0;
      if (c.t > 0.35 && !c.hitDone) { c.hitDone = true; W.spawnDust?.(c.pos.clone(), 2.2 * c.scale); game.events?.emit?.('camera:shake', { intensity: 0.35, duration: 0.4 }); if (h && dH < 3.2 * c.scale) hurtLocal(h, A.burst, c.pos); }
      if (c.t > 1.0) { c.hitDone = false; setAi(c, 'fight'); c.surfT = S.surfaceTime[0] + rnd() * (S.surfaceTime[1] - S.surfaceTime[0]); c.cd = 1; }
      return;
    }
    if (c.ai === 'claw') { c.move = 0; c.mode = 1; if (h) face(c, h.pos.x, h.pos.z, dt, 3); if (c.t > 0.55 && !c.hitDone) { c.hitDone = true; if (h && dH < 3.4 * c.scale) hurtLocal(h, A.claw, c.pos); } if (c.t > 1.0) { c.hitDone = false; setAi(c, 'fight'); c.cd = 1.6; } return; }
    if (c.ai === 'digcharge') { const T = c.chargeAt; face(c, T.x, T.z, dt, 0.8); const nx = c.pos.x + Math.sin(c.yaw) * S.chargeSpeed * dt, nz = c.pos.z + Math.cos(c.yaw) * S.chargeSpeed * dt; if (ctx.okSpot(nx, nz, 'mole')) { c.pos.x = nx; c.pos.z = nz; } c.move = 1; c.mode = 3; if (h && dH < 2.6 * c.scale && !c.hitDone) { c.hitDone = true; hurtLocal(h, A.dig, c.pos); } if (c.t > 1.1) { c.hitDone = false; setAi(c, 'fight'); c.cd = 2; } return; }
    if (c.ai === 'dig') { c.rise = Math.max(0, 1 - c.t / 1.2); c.move = 0; c.mode = 1; if (c.t > 1.2) { W.spawnDust?.(c.pos.clone(), 1.5 * c.scale); setAi(c, c.hp < c.maxHp * 0.4 ? 'flee' : 'roam'); c.fleeFrom = h ? h.pos.clone() : c.pos.clone(); c.cd = 8; } return; }
    // fight on the surface
    c.mode = 0;
    if ((c.surfT <= 0 || c.hp < c.maxHp * 0.4 || !h || dH > S.chase) && !disabled(c.parts, 'dig')) { setAi(c, 'dig'); return; }
    if (disabled(c.parts, 'dig') && (c.hp < c.maxHp * 0.4 || !h || dH > S.chase)) { const a = h ? Math.atan2(c.pos.x - h.pos.x, c.pos.z - h.pos.z) : c.yaw; steer(c, c.pos.x + Math.sin(a) * 5, c.pos.z + Math.cos(a) * 5, S.speed, dt, 1.5); return; } // broken claws: cannot dig — flees on foot
    if (h) {
      if (c.cd <= 0 && dH < 3.2 * c.scale && !disabled(c.parts, 'claw')) { setAi(c, 'claw'); return; }
      if (c.cd <= 0 && dH < 4 && disabled(c.parts, 'claw')) { setAi(c, 'digcharge'); c.chargeAt = h.pos.clone(); return; } // no claws: rams with its armoured head
      if (c.cd <= 0 && dH > 5 && dH < 14) { setAi(c, 'digcharge'); c.chargeAt = h.pos.clone(); return; }
      if (dH > 2.8 * c.scale) steer(c, h.pos.x, h.pos.z, S.speed, dt, 1.6); else { face(c, h.pos.x, h.pos.z, dt); c.move = 0; }
    }
  }
  function dig(c, tx, tz, speed, dt) { // underground: ignores rocks and props, but never under lava
    const dx = tx - c.pos.x, dz = tz - c.pos.z, d = Math.hypot(dx, dz); if (d < 0.3) { c.move = 0; return d; }
    const want = Math.atan2(dx, dz); c.yaw += Math.max(-2.5 * dt, Math.min(2.5 * dt, wrapA(want - c.yaw)));
    const step = Math.min(d, speed * dt), nx = c.pos.x + Math.sin(c.yaw) * step, nz = c.pos.z + Math.cos(c.yaw) * step;
    if (ctx.okSpot(nx, nz, 'mole')) { c.pos.x = nx; c.pos.z = nz; c.move = Math.min(1, speed / 6); } else { c.yaw += dt * 2; c.move = 0; }
    return d;
  }
  function burst(c, h) { setAi(c, 'burst'); c.under = false; c.rise = 0; c.cd = 0.5; if (h) { c.pos.x += (h.pos.x - c.pos.x) * 0.8; c.pos.z += (h.pos.z - c.pos.z) * 0.8; c.yaw = Math.atan2(h.pos.x - c.pos.x, h.pos.z - c.pos.z); } }

  // ------------------------------------------------------------------ Boulder Golem
  function thinkGolem(c, dt) {
    const S = c.S, A = S.attacks, D = S.distances; const [h, dH] = nearestHunter(c.pos.x, c.pos.z);
    c.cd -= dt; c.slamCd -= dt; c.throwCd -= dt; c.chargeCd -= dt;
    const homeD = Math.hypot(c.pos.x - c.home.x, c.pos.z - c.home.z);
    if (c.ai === 'dormant') {
      c.rise = Math.max(0, (c.rise || 0) - dt * 0.4); c.move = 0; c.mode = 2;
      // distance-graded reaction; a "patient" individual lets the hunter pass first
      const glowT = !h ? 0 : dH < D.glow ? 0.35 : dH < D.alert ? 0.08 : 0; c.heat += (glowT - c.heat) * Math.min(1, dt * 1.5);
      if (h && dH < D.rise) {
        const away = h.ref?.facing != null ? Math.abs(wrapA(Math.atan2(c.pos.x - h.pos.x, c.pos.z - h.pos.z) - h.ref.facing)) > 1.8 : true;
        if (!c.patient || away || dH < D.wake) { setAi(c, 'rising'); game.events?.emit?.('fauna:golemWake', { creature: c }); }
      }
      return;
    }
    if (c.ai === 'rising') { // ash falls off, the core shines through the cracks, it slowly stands up
      c.rise = Math.min(1, c.t / 2.4); c.heat = 0.35 + c.rise * 0.5; c.mode = 1; if (h) face(c, h.pos.x, h.pos.z, dt, 0.6);
      if (c.t > 0.3 && !c.dusted) { c.dusted = true; W.spawnDust?.(c.pos.clone(), 2.5); }
      if (c.t > 2.4) { c.dusted = false; setAi(c, 'awake'); c.calmT = 0; game.events?.emit?.('fauna:roar', { creature: c }); }
      return;
    }
    c.rise = 1; c.mode = 0;
    if (c.ai === 'fist') { c.move = 0; c.arm = Math.min(1, c.t / 0.8); if (h) face(c, h.pos.x, h.pos.z, dt, 1.2); if (c.t > 0.85 && !c.hitDone) { c.hitDone = true; c.arm = -1; W.spawnDust?.(c.pos.clone().addScaledVector(fwd(c), 2.2), 1.2); if (h && dH < 4 * c.scale) hurtLocal(h, A.fist, c.pos); } if (c.t > 1.6) { c.hitDone = false; c.arm = 0; setAi(c, 'awake'); c.cd = 1.4; } return; }
    if (c.ai === 'slam') { c.move = 0; c.arm = Math.min(1, c.t / 1.0) * 1.3; if (c.t > 1.05 && !c.hitDone) { c.hitDone = true; c.arm = -1.3; W.spawnDust?.(c.pos.clone(), 3); game.events?.emit?.('camera:shake', { intensity: 0.5, duration: 0.5 }); if (h && dH < A.slam.radius * c.scale) hurtLocal(h, A.slam, c.pos); } if (c.t > 1.9) { c.hitDone = false; c.arm = 0; setAi(c, 'awake'); c.cd = 1.5; c.slamCd = A.slam.cooldown; } return; }
    if (c.ai === 'throw') { c.move = 0; c.arm = Math.min(1, c.t / 0.9); if (h) face(c, h.pos.x, h.pos.z, dt, 1.5); if (c.t > 0.95 && !c.hitDone && h) { c.hitDone = true; shoot(c, h.pos, { ...A.throw, status: null, big: true }, 0.8); } if (c.t > 1.5) { c.hitDone = false; c.arm = 0; setAi(c, 'awake'); c.cd = 1.2; c.throwCd = A.throw.cooldown; } return; }
    if (c.ai === 'charge') { const T = c.chargeAt; face(c, T.x, T.z, dt, 0.5); const nx = c.pos.x + Math.sin(c.yaw) * S.chargeSpeed * dt, nz = c.pos.z + Math.cos(c.yaw) * S.chargeSpeed * dt; if (ctx.okSpot(nx, nz, 'golem')) { c.pos.x = nx; c.pos.z = nz; } c.move = 1; c.mode = 3; if (h && dH < 2.8 * c.scale && !c.hitDone) { c.hitDone = true; hurtLocal(h, A.charge, c.pos); } if (c.t > 1.2) { c.hitDone = false; setAi(c, 'awake'); c.chargeCd = A.charge.cooldown; c.cd = 1; } return; }
    if (c.ai === 'return') { const d = steer(c, c.home.x, c.home.z, S.speed, dt, 1); c.heat = Math.max(0.1, c.heat - dt * 0.05); if (d < 1.2) { setAi(c, 'settle'); } return; }
    if (c.ai === 'settle') { c.rise = Math.max(0, 1 - c.t / 2.5); c.move = 0; c.heat = Math.max(0, c.heat - dt * 0.2); if (c.t > 2.5) { setAi(c, 'dormant'); c.hostile = false; } return; }
    // awake: defend the territory
    c.engaged = !!h && dH < 30;
    const inTerr = h && Math.hypot(h.pos.x - c.home.x, h.pos.z - c.home.z) < S.territory + (c.hostile ? 15 : 0);
    if (bossNear(c.pos, 35)) { c.move = 0; c.calmT += dt; if (c.calmT > 6) setAi(c, 'return'); return; } // a dragon / boss: halt and wait it out
    if (!inTerr || homeD > S.territory + 18) { c.calmT += dt; if (c.calmT > 4) { setAi(c, 'return'); c.engaged = false; } else c.move = 0; return; }
    c.calmT = 0;
    if (c.cd <= 0) {
      const fist = !disabled(c.parts, 'fist');
      if (dH < 4 * c.scale && (fist || c.slamCd <= 0)) { setAi(c, c.slamCd <= 0 && (!fist || rnd() < 0.4) ? 'slam' : 'fist'); return; } // arm shattered: slams the ground instead
      if (dH > A.throw.range[0] && dH < A.throw.range[1] && c.throwCd <= 0 && fist && !disabled(c.parts, 'throw')) { setAi(c, 'throw'); return; }
      if (dH > 6 && dH < 12 && c.chargeCd <= 0) { setAi(c, 'charge'); c.chargeAt = h.pos.clone(); return; }
    }
    if (dH > 3.6 * c.scale) steer(c, h.pos.x, h.pos.z, S.speed, dt, 0.9); else { face(c, h.pos.x, h.pos.z, dt, 1.2); c.move = 0; }
  }
  const fwd = (c) => new c.pos.constructor(Math.sin(c.yaw), 0, Math.cos(c.yaw));

  function onHit(c, dealt, by) {
    if (c.sp === 'golem') { c.hostile = true; if (c.ai === 'dormant' || c.ai === 'settle' || c.ai === 'return') setAi(c, 'rising'); }
    if (c.sp === 'mole') { if (c.under) burst(c, ctx.nearestHunter(c.pos.x, c.pos.z)[0]); else c.surfT = Math.max(c.surfT || 0, 6); }
  }
  return { thinkMole, thinkGolem, onHit };
}
