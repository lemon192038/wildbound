// Group-living fauna: Crystal Boar herds (optionally led by a Crystal Tusk) and Magma Wolf packs (always with a leader).
// Behaviour from the user's design document:
//  Boar herd — grazes; a hunter at mid range makes heads come up, closer the lead animal paws and snorts, closer still
//   it bares its tusks, then charges. Others ring the juveniles; the Tusk steps forward and will not back off while
//   juveniles are near. Striking any member turns the whole herd hostile. Charges are fast, straight, poor at turning
//   and they do not pursue for long. The Tusk's crystal charge glows and must be followed by a rest.
//  Wolf pack — moves as a unit around its den following the leader; juveniles stay at the den. One wolf spotting a
//   hunter alerts the pack, which encircles and attacks from the flanks in turns while the leader may come head-on.
//   Hunts juvenile/weak boars (often gives up when a Tusk guards the herd), lizards, beetles, small slimes, grounded
//   birds, and feeds on carcasses. The leader's short howl orders a retreat: when half the pack is down, the leader is
//   badly hurt, or a boss comes near.
// Creature-vs-creature damage goes through the same hit() as hunter damage (ctx.hitCreature).
import { disabled } from '../core/parts.js';

export function createHerdAI(ctx) {
  const { game, rnd, setAi, steer, nearestOf, nearestHunter, die, ground, wrapA, pickSpot, hitCreature } = ctx;
  const TAU = Math.PI * 2;
  const groups = new Set(); let gid = 1;
  const face = (c, x, z, dt, rate = 3) => { c.yaw += Math.max(-rate * dt, Math.min(rate * dt, wrapA(Math.atan2(x - c.pos.x, z - c.pos.z) - c.yaw))); };
  const hurtLocal = (h, a, from) => { if (!h?.local) return false; const ok = game.player.receiveHit?.({ damage: a.damage, knockback: a.knockback ?? 4, from: from.clone() }); if (ok !== false && a.status) game.status?.apply?.(...a.status); return ok !== false; };
  const alive = (g) => g.members.filter((m) => !m.dead);
  const bossNear = (p, r) => (game.monsters || []).some((m) => m.state !== 'dead' && m.position.distanceTo(p) < r);
  const posOf = (t) => t?.pos || t?.position;

  function newGroup(sp, home) { const g = { id: gid++, sp, members: [], home: home.clone(), center: home.clone(), state: sp === 'wolf' ? 'rest' : 'graze', t: 0, think: 0, target: null, hostile: null, hunger: rnd() * 0.4, waypoint: null, ringA: rnd() * TAU }; groups.add(g); return g; }
  function join(g, c, role) { c.group = g; c.role = role; g.members.push(c); c.attackCd = rnd() * 2; c.slot = null; }
  function remove(g) { groups.delete(g); }
  function centerOf(g) { const a = alive(g).filter((m) => m.stage > 0); if (!a.length) return g.center; let x = 0, z = 0; for (const m of a) { x += m.pos.x; z += m.pos.z; } g.center.set(x / a.length, 0, z / a.length); return g.center; }
  const lead = (g) => alive(g).find((m) => m.role === 'leader' || m.role === 'tusk') || alive(g).find((m) => m.stage >= 2);

  // ------------------------------------------------------------------ group brains (a few times per second)
  function thinkGroup(g, dt) {
    g.t += dt; g.think -= dt; if (g.think > 0) return; const step = 0.3 - g.think; g.think = 0.3;
    const live = alive(g); if (!live.length) { remove(g); return; }
    const C = centerOf(g); const [h, dH] = nearestHunter(C.x, C.z);
    if (g.sp === 'boar') boarBrain(g, step, live, C, h, dH); else wolfBrain(g, step, live, C, h, dH);
  }

  function boarBrain(g, dt, live, C, h, dH) {
    const D = live[0].S.distances || { observe: 26, warn: 16, threat: 10, charge: 6 };
    const juvs = live.filter((m) => m.stage === 0); const L = lead(g);
    // wolves closing in on the herd count as a threat too
    const wolf = L && nearestOf(L, 26, (o) => o.sp === 'wolf' && !o.dead && o.group?.state === 'hunt');
    if (g.hostile && (posOf(g.hostile) == null || g.hostile.dead || g.hostile.hp <= 0)) g.hostile = null;
    let threat = g.hostile || null, td = threat ? posOf(threat).distanceTo(C) : Infinity;
    if (!threat && wolf) { threat = wolf; td = wolf.pos.distanceTo(C); }
    if (!threat && h && dH < D.observe) { threat = h.ref || game.player; td = dH; }
    const totalHp = live.reduce((a, m) => a + m.hp / m.maxHp, 0) / g.members.length;
    const crippled = live.some((m) => m.stage > 0 && disabled(m.parts || [], 'run'));
    if (threat && ((totalHp < 0.35 && !live.some((m) => m.role === 'tusk')) || (crippled && threat.sp === 'wolf'))) { g.state = 'flee'; g.threat = threat; return; } // an injured member: the herd withdraws around its young
    if (!threat) { if (g.state !== 'graze' && (g.calmT = (g.calmT || 0) + dt) > 6) { g.state = 'graze'; g.hostile = null; } if (g.state === 'graze') grazeMove(g, dt, C); return; }
    g.calmT = 0; g.threat = threat;
    const tp = posOf(threat); const nearJuv = juvs.some((j) => j.pos.distanceTo(tp) < D.charge + 3); // someone right next to a juvenile
    if (g.hostile || threat.sp === 'wolf' || td < D.charge || (nearJuv && td < D.warn)) g.state = 'defend';
    else if (td < D.threat) g.state = g.state === 'defend' ? 'defend' : 'threat';
    else if (td < D.warn) g.state = g.state === 'defend' ? 'defend' : 'warn';
    else if (g.state !== 'defend') g.state = 'observe';
    if (g.state === 'defend' && !g.hostile && threat.sp !== 'wolf' && td > D.warn + 6 && !nearJuv) g.state = 'warn'; // backed off: stand down
  }
  function grazeMove(g, dt, C) {
    if (!g.waypoint || C.distanceTo(g.waypoint) < 3 || g.t > 40) { g.t = 0; const s = pickSpot(g.home.x, g.home.z, 0, 60, 'boar'); g.waypoint = s ? new g.home.constructor(s[0], 0, s[1]) : g.home.clone(); }
  }

  function wolfBrain(g, dt, live, C, h, dH) {
    g.hunger = Math.min(1, g.hunger + dt / 200);
    const L = lead(g); const adults = live.filter((m) => m.stage > 0);
    const down = g.members.filter((m) => m.dead && m.stage > 0).length; const start = g.members.filter((m) => m.stage > 0).length;
    // retreat: half the pack down, leader badly hurt, or a boss near → leader howls, everyone runs to the den
    if ((down >= Math.ceil(start / 2) || (L && L.role === 'leader' && L.hp < L.maxHp * 0.35) || bossNear(C, 40)) && g.state !== 'retreat') { g.state = 'retreat'; g.t = 0; game.events?.emit?.('fauna:howl', { group: g, pos: C.clone() }); return; }
    if (g.state === 'retreat') { if (g.t > 12) { g.state = 'rest'; g.target = null; g.hostile = null; } return; }
    if (g.state === 'feed') { if (g.t > 15 || !g.target) { g.state = 'rest'; g.target = null; g.hunger = 0; } return; }
    // hunters: anyone spotting / hearing one alerts the pack (unless sated and far from the den)
    if (h) {
      const spotted = adults.some((m) => { const d = m.pos.distanceTo(h.pos); return d < m.S.senses.sight || d < m.S.senses.hearing * (/sprint|light|heavy|charge|slash/.test(h.state || '') ? 1 : 0.5); });
      const nearDen = h.pos.distanceTo(g.home) < 30;
      if (g.hostile === (h.ref || game.player) || (spotted && (g.hunger > 0.25 || nearDen))) {
        if (g.state !== 'engage') { g.state = 'engage'; g.t = 0; game.events?.emit?.('fauna:howl', { group: g, pos: C.clone(), alert: true }); }
        g.target = h.ref || game.player; return;
      }
    }
    if (g.state === 'engage') { const tp = posOf(g.target); if (!tp || !h || tp.distanceTo(C) > 45) { g.state = 'rest'; g.target = null; } return; }
    // hunting prey
    if (g.state === 'hunt') {
      const p = g.target; if (!p || p.dead) { if (p?.dead && p.pos.distanceTo(C) < 20) { g.state = 'feed'; g.t = 0; g.target = p; } else { g.state = 'rest'; g.target = null; } return; }
      if (g.t > 40 || p.pos.distanceTo(g.home) > g.members[0].S.territory * 1.5) { g.state = 'rest'; g.target = null; } return;
    }
    if (g.hunger > 0.5 && L) {
      const prey = nearestOf(L, 60, (o) => !o.dead && (o.sp === 'lizard' || (o.sp === 'beetle' && o.ai !== 'burrowed') || (o.sp === 'slime' && o.stage <= 1) || (o.sp === 'bird' && o.alt < 1) || ((o.sp === 'boar') && (o.stage === 0 || o.hp < o.maxHp * 0.4))));
      if (prey) {
        const tuskGuard = prey.group && alive(prey.group).some((m) => m.role === 'tusk');
        if (!(tuskGuard && rnd() < 0.6)) { g.state = 'hunt'; g.t = 0; g.target = prey; return; }   // a guarding Tusk often makes them give up
      }
      const carcass = nearestOf(L, 50, (o) => o.dead && !o.eaten && o.corpseT > 5 && o.scale > 0.6);
      if (carcass) { g.state = 'feed'; g.t = 0; g.target = carcass; return; }
    }
    if (g.state === 'rest' && g.t > 30 + rnd() * 30) { g.state = 'patrol'; g.t = 0; const s = pickSpot(g.home.x, g.home.z, 30, g.members[0].S.territory, 'wolf'); g.waypoint = s ? g.home.clone().set(s[0], 0, s[1]) : g.home.clone(); }
    if (g.state === 'patrol' && L && (L.pos.distanceTo(g.waypoint) < 4 || g.t > 60)) { g.state = 'rest'; g.t = 0; g.waypoint = null; }
  }

  // ------------------------------------------------------------------ individuals
  function chargeStep(c, dt, A) { // straight, fast, poor turning; hits once per target
    const sp = c.S.chargeSpeed; const t = posOf(c.chargeAt); if (t) face(c, t.x, t.z, dt, 0.7);
    const nx = c.pos.x + Math.sin(c.yaw) * sp * dt, nz = c.pos.z + Math.cos(c.yaw) * sp * dt;
    if (ctx.okSpot(nx, nz, c.sp)) { c.pos.x = nx; c.pos.z = nz; } else c.t = 99; // ran into rock / lava edge
    c.move = 1; c.mode = 3; c.heat = c.crystal ? 1.4 : 0.4;
    const R = 1.5 * c.scale + 0.5;
    const [h, dH] = nearestHunter(c.pos.x, c.pos.z);
    if (h && dH < R && !c.hitH) { c.hitH = true; hurtLocal(h, A, c.pos); }
    const o = nearestOf(c, R + 1, (q) => !q.dead && q.group !== c.group && q.sp !== 'bird' && q.sp !== 'snake' && !(c.hitSet ||= new Set()).has(q));
    if (o && o.pos.distanceTo(c.pos) < R + 0.5 * o.scale) { c.hitSet.add(o); hitCreature(o, A.creature, c, 'ram'); }
  }
  function thinkBoar(c, dt) {
    const g = c.group; const S = c.S, A = S.attacks; c.attackCd -= dt;
    if (!g) { c.mode = 0; c.move = 0; return; }
    if (c.ai === 'charge') { chargeStep(c, dt, c.crystal ? A.crystalCharge : A.charge); if (c.t > 1.4) { setAi(c, 'recover'); c.dur = c.crystal ? A.crystalCharge.rest : 1.0; c.hitH = false; c.hitSet = null; c.crystal = false; } return; }
    if (c.ai === 'recover') { c.move = 0; c.mode = c.dur > 2 ? 2 : 0; c.heat = Math.max(0, c.heat - dt); if (c.t > c.dur) setAi(c, 'herd'); return; }
    if (c.ai === 'paw') { c.move = 0; c.mode = 1; c.heat = 0.6; const t = posOf(c.chargeAt); if (t) face(c, t.x, t.z, dt, 2.5); if (c.t > (c.role === 'tusk' ? 1.1 : 0.9)) { setAi(c, 'charge'); c.chargeAt = c.chargeAt; c.crystal = c.role === 'tusk' && rnd() < 0.5; } return; }
    if (c.ai === 'gore') { c.move = 0; c.mode = 1; const t = posOf(c.target); if (t) face(c, t.x, t.z, dt, 4); if (c.t > 0.45 && !c.hitDone && t && t.distanceTo(c.pos) < 2.6 * c.scale) { c.hitDone = true; if (c.target === game.player) hurtLocal({ local: true }, A.gore, c.pos); else if (c.target.receiveHit) hitCreature(c.target, A.gore.creature, c, 'bite'); } if (c.t > 0.8) { c.hitDone = false; setAi(c, 'herd'); c.attackCd = 1.5; } return; }
    const C = g.center, th = g.threat, tp = posOf(th);
    c.ai = 'herd';
    if (g.state === 'flee' && tp) { const a = Math.atan2(c.pos.x - tp.x, c.pos.z - tp.z); steer(c, c.pos.x + Math.sin(a) * 8, c.pos.z + Math.cos(a) * 8, S.runSpeed, dt, 2); c.mode = 3; if (tp.distanceTo(c.pos) > 50) g.state = 'graze'; return; }
    const isLead = c === lead(g);
    if (c.stage === 0) { // juveniles keep to the middle of the herd
      const adult = alive(g).find((m) => m.stage > 0); const to = adult ? adult.pos : C; const d = Math.hypot(to.x - c.pos.x, to.z - c.pos.z);
      if (d > 2.5) steer(c, to.x, to.z, g.state === 'graze' ? S.speed * 1.3 : S.runSpeed, dt, 3); else c.move = 0; c.mode = 0; return;
    }
    if (g.state === 'graze') {
      const wp = g.waypoint || C; if (!c.off) c.off = [(rnd() - 0.5) * 10, (rnd() - 0.5) * 10];
      const d = steer(c, wp.x + c.off[0], wp.z + c.off[1], S.speed, dt, 1.5); c.mode = d < 2 ? 0 : 0; if (d < 2) { c.move = 0; c.mode = 2 * 0; }
      return;
    }
    if (tp) {
      if (g.state === 'observe') { face(c, tp.x, tp.z, dt, 1.5); c.move = 0; c.mode = 0; c.heat = 0.2; return; }
      if (g.state === 'warn' || g.state === 'threat') {
        face(c, tp.x, tp.z, dt, 2); c.move = 0;
        if (isLead) { c.mode = 1; c.heat = g.state === 'threat' ? 0.8 : 0.4; } else c.mode = 0;
        return;
      }
      if (g.state === 'defend') {
        const d = tp.distanceTo(c.pos);
        if (isLead || c.role === 'tusk' || (th === g.hostile && c.attackCd <= 0 && rnd() < dt * 0.6)) {
          if (d < 2.4 * c.scale && c.attackCd <= 0 && !disabled(c.parts, 'gore')) { setAi(c, 'gore'); c.target = th; return; }
          if (d > 6 && d < 22 && c.attackCd <= 0 && !disabled(c.parts, 'charge')) { setAi(c, 'paw'); c.chargeAt = th; c.attackCd = 4; return; }
          if (disabled(c.parts, 'charge') && disabled(c.parts, 'gore')) { const a = Math.atan2(c.pos.x - tp.x, c.pos.z - tp.z); steer(c, c.pos.x + Math.sin(a) * 6, c.pos.z + Math.cos(a) * 6, S.runSpeed, dt, 2); c.mode = 3; return; } // can neither ram nor gore: falls back
          if (d >= 22) { steer(c, tp.x, tp.z, S.runSpeed * 0.7, dt, 2); c.mode = 3; return; }
          // too close for a charge run-up: back off a few steps
          const a = Math.atan2(c.pos.x - tp.x, c.pos.z - tp.z); steer(c, c.pos.x + Math.sin(a) * 4, c.pos.z + Math.cos(a) * 4, S.speed * 1.5, dt, 2); c.mode = 0; return;
        }
        // others ring the juveniles
        const juv = alive(g).filter((m) => m.stage === 0); const mid = juv.length ? juv[0].pos : C;
        const idx = alive(g).filter((m) => m.stage > 0 && m !== lead(g)).indexOf(c); const a = Math.atan2(tp.x - mid.x, tp.z - mid.z) + (idx - 1) * 0.9;
        steer(c, mid.x + Math.sin(a) * 3.5, mid.z + Math.cos(a) * 3.5, S.runSpeed * 0.6, dt, 3); c.mode = 0; c.heat = 0.5;
        if (d < 2.4 * c.scale && c.attackCd <= 0 && !disabled(c.parts, 'gore')) { setAi(c, 'gore'); c.target = th; }
      }
    }
  }

  function thinkWolf(c, dt) {
    const g = c.group; const S = c.S, A = S.attacks; c.attackCd -= dt;
    if (!g) { c.move = 0; return; }
    const L = lead(g); const den = g.home;
    if (c.ai === 'lunge') { // dash in, bite on contact, peel away
      const t = posOf(c.target); if (t) face(c, t.x, t.z, dt, 5);
      steer(c, t ? t.x : c.pos.x, t ? t.z : c.pos.z, 13, dt, 6); c.mode = 3;
      if (t && t.distanceTo(c.pos) < 1.6 * c.scale + 0.4 && !c.hitDone) { c.hitDone = true; if (c.target === game.player) hurtLocal({ local: true }, c.role === 'leader' ? A.lunge : A.bite, c.pos); else if (c.target.receiveHit) hitCreature(c.target, A.lunge.creature, c); }
      if (c.hitDone || c.t > 0.9) { c.hitDone = false; setAi(c, 'pack'); c.attackCd = 2 + rnd() * 2.5; }
      return;
    }
    c.ai = 'pack';
    if (c.stage === 0 || g.state === 'rest' || g.state === 'retreat') { // juveniles always at the den
      if (!c.off) c.off = [(rnd() - 0.5) * 8, (rnd() - 0.5) * 8];
      const d = steer(c, den.x + c.off[0], den.z + c.off[1], g.state === 'retreat' ? S.runSpeed : S.speed, dt, 3);
      c.mode = d < 1.5 && g.state === 'rest' ? 2 : g.state === 'retreat' ? 3 : 0; if (d < 1.5) c.move = 0; return;
    }
    if (g.state === 'patrol') { // follow the leader in a loose file
      if (c === L) { steer(c, g.waypoint.x, g.waypoint.z, S.speed * 1.3, dt, 2); c.mode = 0; return; }
      const i = alive(g).indexOf(c); const back = 3 + (i % 3) * 2.2, side = ((i % 2) * 2 - 1) * (1.5 + Math.floor(i / 2));
      const fx = Math.sin(L.yaw), fz = Math.cos(L.yaw);
      const d = steer(c, L.pos.x - fx * back + fz * side, L.pos.z - fz * back - fx * side, S.speed * 1.6, dt, 3); if (d < 1) c.move = 0; c.mode = 0; return;
    }
    if (g.state === 'feed') { const t = g.target; if (t) { const d = steer(c, t.pos.x + Math.sin(c.id) * 1.5, t.pos.z + Math.cos(c.id) * 1.5, S.runSpeed * 0.5, dt, 3); if (d < 1) { c.move = 0; c.mode = 1; t.squash = Math.max(0.3, (t.squash || 1) - dt * 0.01); } } return; }
    if (g.state === 'hunt' || g.state === 'engage') { // encircle, then attack in turns from the flanks; leader may come head-on
      const t = g.target; const tp = posOf(t); if (!tp) return;
      const ring = alive(g).filter((m) => m.stage > 0); const i = ring.indexOf(c); g.ringA += dt * 0.15 / ring.length;
      const R = g.state === 'hunt' ? 7 : 9; const a = g.ringA + (i / ring.length) * TAU;
      const sx = tp.x + Math.sin(a) * R, sz = tp.z + Math.cos(a) * R;
      const d = steer(c, sx, sz, S.runSpeed, dt, 4); c.mode = d > 3 ? 3 : 1;
      if (d < 3) face(c, tp.x, tp.z, dt, 4);
      // attack turn: only a couple of wolves at once
      const attacking = ring.filter((m) => m.ai === 'lunge').length;
      const tYaw = t === game.player ? game.player.facing : t.yaw || 0; const behind = Math.abs(wrapA(Math.atan2(c.pos.x - tp.x, c.pos.z - tp.z) - tYaw)) > 1.4;
      if (c.attackCd <= 0 && attacking < 2 && d < 4 && (behind || c === L || g.state === 'hunt') && !disabled(c.parts, 'lunge')) { setAi(c, 'lunge'); c.target = t; } // broken jaw: stays on the ring, harrying
    }
  }

  function onHit(c, dealt, by) {
    const g = c.group; if (!g) return;
    if (g.sp === 'boar') { g.hostile = by || game.player; g.state = 'defend'; }
    if (g.sp === 'wolf' && g.state !== 'retreat') { if (by && by.sp !== 'wolf') { g.hostile = by; g.target = by; g.state = by === game.player || !by.sp ? 'engage' : g.state; } }
  }
  return { groups, newGroup, join, thinkGroup, thinkBoar, thinkWolf, onHit, alive, centerOf, lead };
}
