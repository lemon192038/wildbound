// Mid-tier predators of the island: Fire Lizard and Lava Snake (behaviour from the user's design document).
//
// Fire Lizard — solitary, territorial ambusher. Lies flat and dim beside its home rock (rock mimicry), senses prey by
//   heat/vibration, bursts out in a short charge (≈15 m/s, ~1 s) and does NOT pursue far: a missed prey or a hunter
//   that retreats past `giveUp` metres is let go and it walks back. Hunters entering its territory get a threat
//   display (raised front, tail lash) before it fights: hot bite, tail swipe at flankers, charge, short fire spit
//   (long cooldown — the throat overheats). Hides from bosses, flees a surfacing Lava Snake, retreats when badly hurt.
// Lava Snake — lives IN the lava. Lurks with only the head above the crust, swims fast (10 m/s) along the lava body,
//   lunges up to `landReach` m onto the bank to seize prey or hunters near the shore, then slides back. Spits lava
//   balls sparingly (birds flying low, hunters by the lava). On land it is slow and quickly returns. Struck hard it
//   dives (溶岩潜航: no hitboxes) and resurfaces elsewhere. It ignores hunters far from the lava.
// All hunter damage is applied by the client that owns that hunter (local player only), like the bosses.
export function createPredatorAI(ctx) {
  const { game, W, F, rnd, setAi, steer, nearestOf, nearestHunter, noiseOf, die, shoot, ground, wrapA } = ctx;
  const Ls = {};
  const lavaInfo = (x, z) => F.lava(x, z, Ls);
  const inLava = (x, z) => { const L = lavaInfo(x, z); return L.sd < -0.8 && W.getHeight(x, z) < L.level - 0.2; };
  const face = (c, x, z, dt, rate = 3) => { c.yaw += Math.max(-rate * dt, Math.min(rate * dt, wrapA(Math.atan2(x - c.pos.x, z - c.pos.z) - c.yaw))); };
  function hurtLocal(h, a, from) {
    if (!h?.local) return;
    const ok = game.player.receiveHit?.({ damage: a.damage, knockback: a.knockback ?? 4, from: from.clone() });
    if (ok !== false && a.status) game.status?.apply?.(...a.status);
  }
  const bossNear = (c, r) => (game.monsters || []).some((m) => m.state !== 'dead' && m.position.distanceTo(c.pos) < r);

  // ------------------------------------------------------------------ Fire Lizard
  function thinkLizard(c, dt) {
    const S = c.S, A = S.attacks; const [h, dH] = nearestHunter(c.pos.x, c.pos.z);
    c.cd -= dt; c.fireCd -= dt; c.chargeCd -= dt;
    const homeD = Math.hypot(c.pos.x - c.home.x, c.pos.z - c.home.z);
    // dangers first: a surfacing snake or a boss nearby
    const snake = nearestOf(c, 16, (o) => o.sp === 'snake' && !o.dead && o.ai !== 'dive' && o.ai !== 'lurk');
    if (snake && c.ai !== 'flee') { setAi(c, 'flee'); c.fleeFrom = snake.pos.clone(); }
    if (c.ai === 'flee') {
      const from = c.fleeFrom || (h ? h.pos : c.pos); const a = Math.atan2(c.pos.x - from.x, c.pos.z - from.z);
      steer(c, c.pos.x + Math.sin(a) * 6, c.pos.z + Math.cos(a) * 6, S.speed * 2.6, dt, 3); c.mode = 3;
      if (c.t > 5) { c.fleeFrom = null; setAi(c, 'return'); } return;
    }
    if (bossNear(c, 35) && c.ai !== 'fight') { if (homeD > 2) { steer(c, c.home.x, c.home.z, S.speed * 2, dt); c.mode = 3; } else { c.move = 0; c.mode = 2; c.ai = 'hide'; } return; }
    if (c.ai === 'eat') { c.move = 0; c.mode = 0; if (c.prey) c.prey.squash = Math.max(0.3, (c.prey.squash || 1) - dt * 0.08); if (c.t > c.dur) { if (c.prey) c.prey.eaten = true; c.prey = null; setAi(c, 'return'); } return; }
    if (c.ai === 'charge') { // short burst at prey or hunter; no long pursuit
      const T = c.chargeAt; const d = steer(c, T.x, T.z, S.chargeSpeed, dt, 1.4); c.mode = 3;
      if (c.prey && !c.prey.dead && c.prey.pos.distanceTo(c.pos) < 1.5) { die(c.prey, 'predation', c); setAi(c, 'eat'); c.dur = 8; return; }
      if (c.huntH && h && dH < 1.8 * c.scale + 0.5 && !c.hitDone) { c.hitDone = true; hurtLocal(h, A.charge, c.pos); }
      if (d < 0.6 || c.t > 1.1) { c.prey = null; c.hitDone = false; setAi(c, c.huntH ? 'fight' : 'return'); c.huntH = false; c.chargeCd = 5; }
      return;
    }
    if (c.ai === 'bite' || c.ai === 'tail' || c.ai === 'fire') {
      c.move = 0; c.mode = c.ai === 'bite' ? 0 : 1;
      if (c.ai === 'bite') { if (h) face(c, h.pos.x, h.pos.z, dt, 4); if (c.t > 0.45 && !c.hitDone) { c.hitDone = true; if (h && dH < 2.8 * c.scale) hurtLocal(h, A.bite, c.pos); } if (c.t > 0.9) { c.hitDone = false; setAi(c, 'fight'); c.cd = 1.2; } }
      if (c.ai === 'tail') { c.yaw += dt * 9; if (c.t > 0.35 && !c.hitDone) { c.hitDone = true; if (h && dH < 3.4 * c.scale) hurtLocal(h, A.tail, c.pos); } if (c.t > 0.7) { c.hitDone = false; setAi(c, 'fight'); c.cd = 1.4; } }
      if (c.ai === 'fire') { if (h) face(c, h.pos.x, h.pos.z, dt, 3); c.heat = Math.min(1.5, c.t * 2); if (c.t > 0.7 && !c.hitDone && h) { c.hitDone = true; shoot(c, h.pos, A.fire, 0.5); } if (c.t > 1.1) { c.hitDone = false; setAi(c, 'fight'); c.cd = 1.5; c.fireCd = A.fire.cooldown; } }
      return;
    }
    // hunters: territory threat display, then fight; gives up quickly
    const inTerr = h && Math.hypot(h.pos.x - c.home.x, h.pos.z - c.home.z) < S.territory;
    const senses = h && (dH < S.senses.sight || dH < S.senses.hearing * noiseOf(h));
    if (c.ai === 'fight') {
      if (!h || dH > S.giveUp || homeD > S.territory * 1.5 || c.hp < c.maxHp * S.fleeHp) { setAi(c, c.hp < c.maxHp * S.fleeHp ? 'flee' : 'return'); return; }
      const ang = Math.abs(wrapA(Math.atan2(h.pos.x - c.pos.x, h.pos.z - c.pos.z) - c.yaw));
      if (c.cd <= 0) {
        if (dH < 3.4 && ang > 2.0) { setAi(c, 'tail'); return; }
        if (dH < 2.6) { setAi(c, 'bite'); return; }
        if (dH > A.fire.range[0] && dH < A.fire.range[1] && c.fireCd <= 0) { setAi(c, 'fire'); return; }
        if (dH > 4 && dH < 13 && c.chargeCd <= 0) { setAi(c, 'charge'); c.huntH = true; c.chargeAt = h.pos.clone(); return; }
      }
      if (dH > 2.4) { steer(c, h.pos.x, h.pos.z, S.speed * 1.6, dt, 3); c.mode = 0; } else { face(c, h.pos.x, h.pos.z, dt); c.move = 0; }
      c.engaged = true; return;
    }
    c.engaged = false;
    if (c.ai === 'threat') {
      c.move = 0; c.mode = 1; if (h) face(c, h.pos.x, h.pos.z, dt);
      if (!h || !inTerr) { setAi(c, 'return'); return; }
      if (dH < 9 || c.t > 5) setAi(c, 'fight');
      return;
    }
    if (inTerr && senses) { setAi(c, 'threat'); return; }
    // prey: ambush from the home rock
    const prey = nearestOf(c, 10, (o) => !o.dead && ((o.sp === 'beetle' && o.ai !== 'burrowed' && o.ai !== 'curl') || (o.sp === 'slime' && o.stage <= 1) || (o.sp === 'bird' && o.alt < 1)));
    if (prey && c.hunger > 0.3) { setAi(c, 'charge'); c.prey = prey; c.chargeAt = prey.pos.clone(); return; }
    if (c.ai === 'return') { const d = steer(c, c.home.x, c.home.z, S.speed, dt, 2.5); c.mode = 0; if (d < 1) setAi(c, 'ambush'); return; }
    if (c.ai === 'patrol') { if (!c.target) c.target = ctx.pickSpot(c.home.x, c.home.z, 8, S.territory, 'lizard') || [c.home.x, c.home.z]; const d = steer(c, c.target[0], c.target[1], S.speed * 0.8, dt, 2); c.mode = 0; if (d < 1 || c.t > 25) setAi(c, 'return'); return; }
    // ambush (default): flat and dim against the rock, tail still
    c.ai = c.ai === 'ambush' ? 'ambush' : 'ambush'; c.move = 0; c.mode = 2; c.heat = 0;
    c.hunger = Math.min(1, c.hunger + dt / 150);
    if (c.t > 20 + (c.id % 7) * 3 && rnd() < dt * 0.1) setAi(c, 'patrol');
  }

  // ------------------------------------------------------------------ Lava Snake
  function pickLavaSpot(c, r0, r1) {
    for (let i = 0; i < 14; i++) { const a = rnd() * Math.PI * 2, r = r0 + rnd() * (r1 - r0), x = c.pos.x + Math.cos(a) * r, z = c.pos.z + Math.sin(a) * r; if (inLava(x, z) && lavaInfo(x, z).sd < -1.5) return [x, z]; }
    return null;
  }
  function swim(c, tx, tz, speed, dt) { // moves only through lava; slides along the bank otherwise
    const dx = tx - c.pos.x, dz = tz - c.pos.z, d = Math.hypot(dx, dz); if (d < 0.3) { c.move = 0; return d; }
    const want = Math.atan2(dx, dz); c.yaw += Math.max(-4 * dt, Math.min(4 * dt, wrapA(want - c.yaw)));
    const step = Math.min(d, speed * dt), nx = c.pos.x + Math.sin(c.yaw) * step, nz = c.pos.z + Math.cos(c.yaw) * step;
    if (inLava(nx, nz)) { c.pos.x = nx; c.pos.z = nz; } else c.yaw += dt * 3;
    c.move = 1; return d;
  }
  function surfaceY(c, depth) { const L = lavaInfo(c.pos.x, c.pos.z); return L.level - depth; }
  function thinkSnake(c, dt) {
    const S = c.S, A = S.attacks; const [h, dH] = nearestHunter(c.pos.x, c.pos.z);
    c.cd -= dt; c.ballCd -= dt; c.hunger = Math.min(1, c.hunger + dt / 90); // chronically hungry
    const hunterByLava = h && lavaInfo(h.pos.x, h.pos.z).sd < 9;
    if (c.ai === 'dive') { // 溶岩潜航: fast underwater, untouchable, resurfaces elsewhere (behind the hunter if fighting)
      if (!c.target) c.target = (h && hunterByLava && c.hp > c.maxHp * S.fleeHp ? pickLavaSpot(c, 8, 16) : pickLavaSpot(c, 20, 40)) || [c.pos.x, c.pos.z];
      const d = swim(c, c.target[0], c.target[1], S.lavaSpeed * 1.2, dt); c.pos.y = surfaceY(c, 2.2); c.mode = 0;
      if (d < 1 || c.t > 6) setAi(c, c.hp < c.maxHp * S.fleeHp && c.t < 25 ? 'hideDeep' : 'lurk');
      return;
    }
    if (c.ai === 'hideDeep') { c.pos.y = surfaceY(c, 2.2); c.move = 0; if (c.t > 20) setAi(c, 'lurk'); return; }
    if (c.ai === 'lunge') { // head out of the lava onto the bank
      const T = c.lungeAt; const k = Math.min(1, c.t / 0.55);
      c.pos.x = c.lungeFrom.x + (T.x - c.lungeFrom.x) * k; c.pos.z = c.lungeFrom.z + (T.z - c.lungeFrom.z) * k;
      c.pos.y = Math.max(ground(c.pos.x, c.pos.z) + 0.6, c.lungeFrom.y) + Math.sin(k * Math.PI) * 2.2; c.jaw = 1; c.move = 1;
      if (k >= 1 && !c.hitDone) {
        c.hitDone = true;
        if (c.prey && !c.prey.dead && c.prey.pos.distanceTo(c.pos) < 2.4) { die(c.prey, 'predation', c); c.prey.eaten = true; c.hunger = 0; }
        if (c.huntH && h && dH < 2.6 * c.scale + 0.6) hurtLocal(h, A.lunge, c.pos);
      }
      if (c.t > 1.1) { c.hitDone = false; c.prey = null; setAi(c, 'retreat'); }
      return;
    }
    if (c.ai === 'retreat') { const d = Math.hypot(c.pos.x - c.lungeFrom.x, c.pos.z - c.lungeFrom.z); const k = Math.min(1, dt * 2.2); c.pos.x += (c.lungeFrom.x - c.pos.x) * k; c.pos.z += (c.lungeFrom.z - c.pos.z) * k; c.pos.y += (surfaceY(c, 0.15) - c.pos.y) * k; c.jaw = Math.max(0, c.jaw - dt * 2); if (d < 0.6 || c.t > 2) setAi(c, c.huntH ? 'dive' : 'lurk'); return; }
    if (c.ai === 'ball') { c.jaw = Math.min(1, c.t * 2); c.pos.y = surfaceY(c, -0.4); const T = c.ballAt; if (T) face(c, T.pos.x, T.pos.z, dt, 3); if (c.t > 0.8 && !c.hitDone && T) { c.hitDone = true; shoot(c, T.pos, A.lavaBall, T.alt != null ? 0.4 : 1.1, T.alt != null ? T : null); } if (c.t > 1.2) { c.hitDone = false; c.jaw = 0; setAi(c, 'lurk'); } return; }
    // lurking / swimming: only the head breaks the crust
    c.jaw = Math.max(0, (c.jaw || 0) - dt); c.pos.y = surfaceY(c, 0.15);
    c.engaged = !!(h && hunterByLava && dH < 30);
    // hunters by the lava: lunge if close, lava ball if mid range (sparingly)
    if (h && hunterByLava) {
      if (dH < S.landReach - 1 && c.cd <= 0) { c.lungeFrom = c.pos.clone(); c.lungeAt = h.pos.clone(); c.huntH = true; c.cd = 3.5; setAi(c, 'lunge'); return; }
      if (dH > A.lavaBall.range[0] && dH < A.lavaBall.range[1] && c.ballCd <= 0 && dH < S.senses.sight + 8) { c.ballAt = { pos: h.pos }; c.ballCd = A.lavaBall.cooldown; c.huntH = true; setAi(c, 'ball'); return; }
      if (dH < 30) { swim(c, h.pos.x, h.pos.z, S.lavaSpeed * 0.6, dt); return; } // shadow the hunter along the river
    }
    c.huntH = false;
    // prey near the shore
    if (c.hunger > 0.25 && c.cd <= 0) {
      const prey = nearestOf(c, S.landReach, (o) => !o.dead && o.ai !== 'burrowed' && (o.sp === 'beetle' || o.sp === 'slime' || o.sp === 'lizard' || (o.sp === 'bird' && o.alt < 1.5) || (o.sp === 'boar' && o.stage === 0)) && lavaInfo(o.pos.x, o.pos.z).sd < S.landReach);
      if (prey) { c.lungeFrom = c.pos.clone(); c.lungeAt = prey.pos.clone(); c.prey = prey; c.cd = 6; setAi(c, 'lunge'); return; }
      const bird = nearestOf(c, 26, (o) => o.sp === 'bird' && !o.dead && o.alt > 2 && o.alt < 14);
      if (bird && c.ballCd <= 0) { c.ballAt = bird; c.ballCd = A.lavaBall.cooldown * 1.5; setAi(c, 'ball'); return; }
    }
    if (!c.target || c.t > 18) { c.target = pickLavaSpot(c, 6, 30) || [c.pos.x, c.pos.z]; c.t = 0; }
    const d = swim(c, c.target[0], c.target[1], c.hunger > 0.6 ? S.lavaSpeed * 0.5 : S.lavaSpeed * 0.25, dt);
    if (d < 1) { c.move = 0; c.ai = 'lurk'; }
  }

  function onHit(c, dealt) {
    if (c.sp === 'lizard') { if (c.ai === 'ambush' || c.ai === 'patrol' || c.ai === 'threat' || c.ai === 'return' || c.ai === 'hide') setAi(c, 'fight'); if (c.hp < c.maxHp * c.S.fleeHp) setAi(c, 'flee'); }
    if (c.sp === 'snake') { c.hitsTaken = (c.hitsTaken || 0) + dealt; if (c.hitsTaken > c.maxHp * 0.08 || c.hp < c.maxHp * c.S.fleeHp) { c.hitsTaken = 0; if (c.ai !== 'lunge') setAi(c, 'dive'); } }
  }
  return { thinkLizard, thinkSnake, onHit, inLava };
}
