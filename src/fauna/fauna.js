// Small island fauna: Magma Beetle, Magma Slime, Ash Bird (stage 3, first species).
// Behaviour follows the user's design document:
//   Beetle — forages minerals; antennae alert when a hunter approaches; curls up on contact (armour ×0.3);
//            burrows away when struck; when it cannot escape (curled, or badly hurt) it vents a heat burst.
//            Hides from diving Ash Birds by curling/burrowing; dives deep during eruptions.
//   Slime  — grazes ash and minerals (spreads flat); harmless unless attacked, then spits hot mucus and
//            body-slams; a heavy hit splits mature slimes into two fleeing blobs; flattens when predators near.
//   Bird   — soars over its home ground, lands to sweep ash for food, hunts beetles and small slimes by diving
//            (prey that curls/burrows in time makes the hunt fail); keeps its distance from hunters, takes off
//            when approached on the ground, flees for a while below 40 % HP; climbs during eruptions.
// Population (stage 6): the island ecosystem (src/shared/ecosystem.js) is the far layer. When a 64 m tile comes near a
// hunter, its individuals are built from the ecosystem's age classes, herds/packs, nests and carcasses (ecoClient.js:
// the server's world, or the same model locally). When the tile goes far again the individuals are dropped: the
// ecosystem never lost them. Kills by this hunter are reported back; nothing respawns where it died.
// NOT networked yet: each client simulates its own fauna (stage 8).
import { SPECIES, STAGES, PARTS, BREAK_BIT, BODY_SIZE } from './species.js';
import { makePart, resolvePartHit, tickRegen, disabled, pickTargetPart } from '../core/parts.js';
import { createFaunaRender } from './faunaRender.js';
import { createEcoClient } from './ecoClient.js';
import { ECO, ABUNDANCE } from '../shared/ecosystem.js';
import { createPredatorAI } from './predators.js';
import { createHerdAI } from './herds.js';
import { createEarthAI } from './earthkin.js';
import { createEcologyAI } from './ecology.js';
import { isJa } from '../shared/i18n.js';
import { SpatialHash } from '../shared/spatialHash.js';
import { mulberry32 } from '../world/noise.js';
import { log } from '../core/log.js';

const TILE = 64, SPAWN_R = 140, DESPAWN_R = 210, DRAW_R = 170, LOD_NEAR = 90, REGEN_S = 180;
const TAU = Math.PI * 2;
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const ATTACKING = /light|heavy|charge|slash|tackle/;

export function createFauna(game) {
  const { THREE } = game; const W = game.world, F = W.island;
  const render = createFaunaRender(THREE, game.scene, { low: W.low });
  const eco = F?.regionAt ? createEcoClient(game, F) : null;
  const list = []; const census = new Map(); const spawned = new Set();
  const hash = new SpatialHash(16), colHash = new SpatialHash(16); let colN = -1;
  const rnd = mulberry32((F.seed || 1337) + 4141);
  const stats = { spawned: 0, despawned: 0, died: 0, predation: 0, split: 0, regen: 0 };
  let eruptT = 0, frame = 0, spawnT = 0, nextId = 1;
  // eruptions are frequent on this island: only some beetles (the ones nearer the summit, more often) dive deep each time
  game.events?.on?.('world:eruption', () => { eruptT = 12; for (const c of list) if (c.sp === 'beetle' && !c.dead && c.ai !== 'burrowed' && rnd() < 0.15 + 0.35 * Math.max(0, 1 - Math.hypot(c.pos.x, c.pos.z) / 600)) setAi(c, 'burrow'); });

  // ------------------------------------------------------------------ hunters
  const hunters = [];
  function gatherHunters() {
    hunters.length = 0; const P = game.player;
    if (P?.position && !P.dead && !P.unseen) hunters.push({ pos: P.position, state: P.state, ref: P, local: true });
    for (const r of game.remotePlayers?.values?.() || []) { const p = r.position || r.object3d?.position; if (p) hunters.push({ pos: p, state: r.state, ref: r }); }
  }
  function nearestHunter(x, z) { let best = null, bd = Infinity; for (const h of hunters) { const d = Math.hypot(h.pos.x - x, h.pos.z - z); if (d < bd) { bd = d; best = h; } } return [best, bd]; }
  const noiseOf = (h) => (/sprint/.test(h.state || '') ? 1 : ATTACKING.test(h.state || '') ? 1.2 : /roll|dodge/.test(h.state || '') ? 0.8 : 0.45);

  // ------------------------------------------------------------------ terrain helpers
  const Ls = {};
  const ground = (x, z) => W.getHeight(x, z);
  const okSpot = (x, z, sp) => { if (!W.canWalk(x, z)) return false; const h = ground(x, z); if (h < 1.5) return false; const sd = F.lava(x, z, Ls).sd; return sd > (sp === 'slime' ? 3 : 6); };
  function pickSpot(cx, cz, r0, r1, sp) {
    for (let i = 0; i < 10; i++) { const a = rnd() * TAU, r = r0 + rnd() * (r1 - r0), x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r; if (okSpot(x, z, sp) && !insideCollider(x, z, 0.8)) return [x, z]; }
    return null;
  }
  function rebuildColliders() { const cs = W.colliders || []; if (cs.length === colN) return; colN = cs.length; colHash.clear(); for (const c of cs) colHash.insert(c, c.x, c.z); }
  const _cq = [];
  function insideCollider(x, z, pad) { colHash.query(x, z, 4, _cq); for (const c of _cq) if (Math.hypot(x - c.x, z - c.z) < c.r + pad) return c; return null; }
  function pushOut(c, pad) { colHash.query(c.pos.x, c.pos.z, 4, _cq); for (const k of _cq) { const dx = c.pos.x - k.x, dz = c.pos.z - k.z, d = Math.hypot(dx, dz), R = k.r + pad; if (d < R && d > 1e-4) { c.pos.x = k.x + dx / d * R; c.pos.z = k.z + dz / d * R; } } }

  // ------------------------------------------------------------------ census / spawning
  const tkey = (tx, tz) => tz * 1000 + tx;
  function censusOf(tx, tz) {
    const k = tkey(tx, tz); let C = census.get(k); if (C) return C;
    if (eco && !eco.ready) return null; // first seconds: waiting for the server's ecosystem
    const V = eco?.tile(tx, tz);
    if (V) { // from the ecosystem: exact age classes, herds / packs with their composition, nests, carcasses, wariness
      C = { eco: true, cap: {}, stored: {}, stages: {}, groups: [], nests: V.nest || [], cc: V.cc || [], wary: V.wary || {}, regenT: Infinity };
      const x0 = -F.half + tx * TILE, z0 = -F.half + tz * TILE;
      for (const [sp, a] of Object.entries(V.p || {})) { if (!SPECIES[sp]) continue; C.stages[sp] = [...a]; C.stored[sp] = a.reduce((x, y) => x + y, 0); }
      for (const g of V.g || []) {
        const members = []; const n = [...g.n]; const special = SPECIES[g.sp].group?.special;
        if (g.s && special) { const st = n[3] > 0 ? 3 : n[2] > 0 ? 2 : -1; if (st >= 0) { n[st]--; members.push({ role: special, stage: 2 }); } }
        for (let i = 0; i < 4; i++) for (let j = 0; j < n[i]; j++) members.push({ role: 'member', stage: i });
        if (members.length) C.groups.push({ sp: g.sp, x: x0 + 12 + rnd() * (TILE - 24), z: z0 + 12 + rnd() * (TILE - 24), members, eco: true });
      }
      for (const sp of Object.keys(SPECIES)) if (!SPECIES[sp].of && C.stored[sp] == null) C.stored[sp] = 0;
      census.set(k, C); return C;
    }
    const x0 = -F.half + tx * TILE, z0 = -F.half + tz * TILE; const r = mulberry32(k * 31 + 7);
    const regs = [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]].map(([a, b]) => F.regionAt(x0 + a * TILE, z0 + b * TILE));
    C = { cap: {}, stored: {}, groups: [], regenT: REGEN_S * (0.5 + r()) };
    for (const [sp, S] of Object.entries(SPECIES)) {
      if (S.of) continue; // special individuals (Crystal Tusk, pack leader) are members of their species' groups
      const dens = regs.reduce((a, g) => a + (S.regions[g] || 0), 0) / 4 * ABUNDANCE; let n = Math.floor(dens * (0.6 + r() * 0.8)); if (r() < dens - Math.floor(dens)) n++;
      C.cap[sp] = n; C.stored[sp] = n;
    }
    census.set(k, C); return C;
  }
  function spawnTile(tx, tz) {
    const C = censusOf(tx, tz); if (!C) return; const x0 = -F.half + tx * TILE, z0 = -F.half + tz * TILE;
    // group species: stored groups come back with their composition; fresh groups for the rest of the census
    for (const comp of C.groups.splice(0)) { if (comp.eco) comp.members.eco = true; spawnGroup(comp.sp, comp.x, comp.z, comp.members); }
    if (C.eco) placeEcoProps(tx, tz, C);
    for (const sp of Object.keys(SPECIES)) {
      const S = SPECIES[sp]; if (S.of) continue;
      if (S.group) {
        let n = C.stored[sp]; C.stored[sp] = 0;
        while (n-- > 0) { let spot = null; for (let i = 0; i < 10 && !spot; i++) { const x = x0 + rnd() * TILE, z = z0 + rnd() * TILE; if (S.regions[F.regionAt(x, z)] && okSpot(x, z, sp) && !insideCollider(x, z, 2)) spot = [x, z]; } if (spot) spawnGroup(sp, spot[0], spot[1]); else C.stored[sp]++; }
        continue;
      }
      let n = C.stored[sp]; C.stored[sp] = 0;
      while (n-- > 0) {
        let spot = null;
        for (let i = 0; i < (SPECIES[sp].habitat === 'lava' ? 24 : 8) && !spot; i++) {
          const x = x0 + rnd() * TILE, z = z0 + rnd() * TILE; if (!SPECIES[sp].regions[F.regionAt(x, z)]) continue;
          if (SPECIES[sp].habitat === 'lava') { if (PRED.inLava(x, z) && F.lava(x, z, Ls).sd < -2.5) spot = [x, z]; }
          else if (okSpot(x, z, sp) && !insideCollider(x, z, 0.8)) spot = [x, z];
        }
        if (spot) { const c = create(sp, spot[0], spot[1], C.stages ? takeStage(C.stages[sp]) : rollStage()); if (C.eco) { c.fromEco = true; learnFromTile(c, C); } } else C.stored[sp]++; // no room now: stays in the census
      }
    }
    spawned.add(tkey(tx, tz));
  }
  // a herd / pack: fresh composition from the species' group rules, or a stored one (survivors keep their HP)
  function spawnGroup(sp, x, z, members = null) {
    const S = SPECIES[sp], G = S.group; const g = HERD.newGroup(sp, new THREE.Vector3(x, 0, z));
    if (!members) {
      members = []; const n = G.min + Math.floor(rnd() * (G.max - G.min + 1));
      if (rnd() < G.specialChance) members.push({ role: G.special, stage: 2 });
      const j = G.juveniles[0] + Math.floor(rnd() * (G.juveniles[1] - G.juveniles[0] + 1));
      for (let i = 0; i < j && members.length < n; i++) members.push({ role: 'member', stage: 0 });
      while (members.length < n) members.push({ role: 'member', stage: rnd() < 0.3 ? 1 : 2 });
    }
    for (const m of members) {
      const s = pickSpot(x, z, 0, 7, sp) || [x, z];
      const c = create(sp, s[0], s[1], m.stage, { hp: m.hp, S: m.role === 'member' ? null : SPECIES[m.role], noSpecial: true });
      HERD.join(g, c, m.role); if (members.eco) { c.fromEco = true; learnFromTile(c, censusOf(...W.chunks.tileOf(x, z))); }
    }
    return g;
  }
  function storeGroup(g) {
    const live = HERD.alive(g); const C0 = HERD.centerOf(g); const [tx, tz] = W.chunks.tileOf(C0.x, C0.z);
    if (live.length && !eco) censusOf(tx, tz).groups.push({ sp: g.sp, x: g.home.x, z: g.home.z, members: live.map((m) => ({ role: m.role, stage: m.stage, hp: m.hp })) });
    for (const m of g.members) { const i = list.indexOf(m); if (i >= 0) list.splice(i, 1); }
    HERD.groups.delete(g); stats.despawned += live.length;
  }
  function takeStage(a) { if (!a) return rollStage(); for (let i = 0; i < 4; i++) if (a[i] > 0) { a[i]--; return i; } return 2; }
  function rollStage() { const r = rnd(); return r < 0.15 ? 0 : r < 0.4 ? 1 : r < 0.9 ? 2 : 3; }
  function create(sp, x, z, stage, opts = {}) {
    if (sp === 'mole' && stage === 0) stage = 1;                     // mole juveniles stay deep in the nest
    const sx = SPECIES[sp].special; if (!opts.S && !opts.noSpecial && sx && rnd() < sx.chance * (stage === 3 ? 4 : stage === 2 ? 1 : 0)) { opts.S = SPECIES[sx.id]; stage = 2; } // e.g. Grand Mole: an old giant (elders far more often)
    const S0 = opts.S || SPECIES[sp], G = STAGES[stage];
    // each individual gets its own view of the species data so learning can sharpen its senses (S.senses)
    const S = Object.create(S0); S.senses = { ...S0.senses };
    const c = {
      id: nextId++, sp, kind: Object.keys(SPECIES).find((k) => SPECIES[k] === S0) || sp, S, S0, stage, scale: S.size * G.scale, maxHp: Math.round(S.hp * G.hp), hp: 0, pos: new THREE.Vector3(x, ground(x, z), z),
      home: new THREE.Vector3(x, 0, z), yaw: rnd() * TAU, pitch: 0, roll: 0, squash: 1, vel: new THREE.Vector3(), ai: 'roam', t: 0, dur: 2 + rnd() * 4,
      target: null, phase: rnd() * 10, move: 0, mode: 0, heat: 0, flash: 0, hunger: rnd() * 0.5, aggroT: 0, cd: 0, burstCd: 0, curlT: 0, hits: 0, acc: 0,
      alt: 0, altT: 0, dead: false, corpseT: 0, prey: null, hunter: null, fleeT: 0, eaten: false, lastHitAt: -99,
    };
    c.hp = opts.hp ?? c.maxHp;
    if (sp === 'mole') { c.ai = 'roam'; c.under = true; c.mode = 2; c.rise = 0; c.special = S0 !== SPECIES.mole; }
    if (sp === 'golem') { c.ai = 'dormant'; c.patient = rnd() < 0.4; c.slamCd = c.throwCd = c.chargeCd = 0; c.rise = 0; c.arm = 0; c.calmT = 0; }
    if (sp === 'lizard' || sp === 'drake') { c.ai = sp === 'drake' ? 'patrol' : 'ambush'; c.fireCd = 0; c.chargeCd = 0; }
    if (sp === 'snake') { c.ai = 'lurk'; c.ballCd = 3; c.jaw = 0; c.segs = 16; c.spacing = 0.85 * c.scale; c.trail = []; const L = F.lava(x, z, Ls); c.pos.y = L.level - 0.15; for (let i = 0; i < c.segs * 2 + 2; i++) c.trail.push(new THREE.Vector3(x - Math.sin(c.yaw) * i * c.spacing * 0.5, L.level - 0.35, z - Math.cos(c.yaw) * i * c.spacing * 0.5)); }
    if (sp === 'bird') { c.alt = S.altitude[0] + rnd() * (S.altitude[1] - S.altitude[0]); c.altT = c.alt; c.ai = 'soar'; c.orbit = { r: 40 + rnd() * 70, dir: rnd() < 0.5 ? 1 : -1, a: rnd() * TAU }; } // wide soaring circles over the home ground
    Object.assign(c, opts.extra || {});
    c.homeAi = c.ai; c.mem = { hit: 0, kin: 0, nest: 0, young: 0, motion: {}, elem: {}, w: 0 }; c.wary = 0;
    attach(c); list.push(c); stats.spawned++;
    return c;
  }
  function despawn(c) {
    if (eco) { stats.despawned++; return; }
    const [tx, tz] = W.chunks.tileOf(c.pos.x, c.pos.z); const C = censusOf(tx, tz); C.stored[c.sp] = (C.stored[c.sp] || 0) + 1; stats.despawned++;
  }


  // ------------------------------------------------------------------ Magma Slime rampage (user spec §6-7)
  // While the Volcano Slime is awake every Magma Slime turns on everything: hunters and every other creature. They move in
  // swarms (marching out from the crater, converging on prey). The rest of the island reacts: small creatures flee,
  // burrowers go underground, predators withdraw, Golems and Crystal Tusks stand and fight.
  function rampage(c, dt) {
    const C = F.crater;
    if (c.sp === 'slime') {
      c.rcd = (c.rcd || 0) - dt; c.mode = 0; c.engaged = true;
      const prey = nearestOf(c, 28, (o) => !o.dead && o.sp !== 'slime' && !o.under && o.ai !== 'burrowed');
      const [h, dH] = nearestHunter(c.pos.x, c.pos.z);
      const tgt = h && dH < 28 && (!prey || dH < prey.pos.distanceTo(c.pos)) ? { pos: h.pos, hunter: h } : prey ? { pos: prey.pos, creature: prey } : null;
      if (!tgt) { const a = Math.atan2(c.pos.z - C.z, c.pos.x - C.x) + Math.sin(clock * 0.2 + c.id) * 0.4; steer(c, c.pos.x + Math.cos(a) * 10, c.pos.z + Math.sin(a) * 10, (c.S.speed || 0.8) * 2.2, dt, 3); return true; } // the swarm marches outward
      const d = steer(c, tgt.pos.x, tgt.pos.z, (c.S.speed || 0.8) * 3.4, dt, 5);
      if (d < 1.2 * c.scale + 0.9 && c.rcd <= 0) {
        c.rcd = 1.1; c.squash = 0.7;
        if (tgt.creature) { hit(tgt.creature, { damage: 40 * c.scale, by: c, part: 'body' }); stats.rampageHits = (stats.rampageHits || 0) + 1; }
        else if (tgt.hunter?.local) { const ok = game.player.receiveHit?.({ damage: 12 + 4 * c.stage, knockback: 5, from: c.pos.clone(), source: c, kind: 'physical' }); if (ok !== false) game.status?.apply?.('burn', 'small'); }
      }
      return true;
    }
    const sl = nearestOf(c, c.sp === 'golem' || c.role === 'tusk' ? 18 : 16, (o) => o.sp === 'slime' && !o.dead); if (!sl) return false;
    if (c.sp === 'golem' || c.role === 'tusk') { // stands and fights
      c.rcd = (c.rcd || 0) - dt; const d = steer(c, sl.pos.x, sl.pos.z, (c.S.speed || 1.5) * 1.3, dt, 3); c.engaged = true;
      if (d < 2.2 * c.scale && c.rcd <= 0) { c.rcd = 1.6; hit(sl, { damage: 260, by: c, part: 'body' }); W.spawnDust?.(sl.pos.clone(), 1); }
      return true;
    }
    if (c.sp === 'mole') { c.under = true; c.move = 0; return true; }         // burrowers go deep
    if (c.sp === 'snake') return false;                                     // the lava is its own
    if (c.sp === 'bird') { if (c.alt < 1) setAi(c, 'takeoff'); return false; }
    const a = Math.atan2(c.pos.x - sl.pos.x, c.pos.z - sl.pos.z); // everything else (incl. predators) withdraws
    steer(c, c.pos.x + Math.sin(a) * 10, c.pos.z + Math.cos(a) * 10, (c.S.speed || 2) * 1.4, dt, 4); c.mode = 3; c.engaged = false; stats.rampageFled = (stats.rampageFled || 0) + 1;
    return true;
  }

  // ------------------------------------------------------------------ learning (user spec §7-4)
  // Each individual remembers: hits from hunters (and by which move / element), kin killed near it, its nest
  // intruded, its young attacked. Wariness = what the tile's population already learned (ecosystem) + its own
  // memory, scaled by the species' intelligence (ECO.iq: slimes barely learn, wolves learn fast).
  // Effects: sharper senses, retreating from hunters before a fight, side-stepping a move that hurt it before,
  // and protective herds turning on the hunter.
  function applyWary(c) {
    const m = c.mem, iq = ECO[c.sp]?.iq ?? 0.3;
    c.wary = Math.min(1, m.w + iq * (0.12 * m.hit + 0.25 * m.kin + 0.3 * m.nest + 0.2 * m.young));
    const k = 1 + 0.8 * c.wary; for (const key in c.S0.senses) c.S.senses[key] = c.S0.senses[key] * k;
  }
  function learnFromTile(c, C) { if (!C?.wary) return; c.mem.w = Math.min(0.8, (C.wary[c.sp] || 0)); applyWary(c); }
  function kinAlarm(c, cause) {
    if (cause !== 'hunted') return;
    for (const o of near(c.pos, 45)) if (o !== c && !o.dead && o.sp === c.sp) { o.mem.kin++; applyWary(o); }
  }
  const NO_WARY = new Set(['snake', 'golem', 'slime']);
  function wantWary(c, dH) {
    if (c.wary < 0.4 || c.group || NO_WARY.has(c.sp) || c.under || c.aggroT > 0 || c.engaged || dH > 22) return false;
    if (c.sp === 'bird') { if (c.alt < 1 && c.ai !== 'takeoff') { setAi(c, 'takeoff'); } return false; } // wary birds lift off early
    const P = game.player; const el = P?.gear?.element?.type || 'raw'; const extra = (c.mem.elem[el] || 0) >= 3 ? 0.2 : 0; // the weapon that hurt it before
    return dH < (c.S.senses.sight * 0.6 + 6) * (c.wary + extra);
  }
  function thinkWary(c, dt) {
    const [h, dH] = nearestHunter(c.pos.x, c.pos.z);
    if (!h || dH > 30 || c.t > 6 || c.aggroT > 0) { setAi(c, c.homeAi || 'roam'); return; }
    const a = Math.atan2(c.pos.x - h.pos.x, c.pos.z - h.pos.z);
    steer(c, c.pos.x + Math.sin(a) * 10, c.pos.z + Math.cos(a) * 10, (c.S.speed || 2) * 1.3, dt, 4);
  }
  const CHARGED = /charge|heavy|trueslash|tcharge/;
  function learnedDodge(c, dH) {
    if (dH > 6.5 || c.dodgeCd > clock || (ECO[c.sp]?.iq ?? 0) < 0.4 || c.under || c.sp === 'snake' || c.sp === 'golem') return false;
    const P = game.player; if (!P || !/^(charge|tcharge)$/.test(P.state)) return false;
    const n = Object.entries(c.mem.motion).reduce((a, [k, v]) => a + (CHARGED.test(k) ? v : 0), 0); if (n < 2) return false;
    const fx = Math.sin(P.facing), fz = Math.cos(P.facing), dx = c.pos.x - P.position.x, dz = c.pos.z - P.position.z;
    if ((fx * dx + fz * dz) / Math.max(0.1, Math.hypot(dx, dz)) < 0.6) return false; // not aimed at it
    const side = (fx * dz - fz * dx) > 0 ? 1 : -1; c.dodgeDir = [fz * side, -fx * side]; c.dodgeT = 0.4; c.dodgeCd = clock + 4; stats.dodges = (stats.dodges || 0) + 1;
    game.events?.emit?.('fauna:dodge', { creature: c }); return true;
  }

  // ------------------------------------------------------------------ nests and remains from the ecosystem
  // Nests (egg clutches / dens) and old remains (bones, shell) in spawned tiles are instanced props; fresh / eaten /
  // rotten carcasses become real dead bodies that scavengers find. A hunter near a nest is a nest intrusion.
  const eggGeo = new THREE.SphereGeometry(0.22, 7, 5); eggGeo.scale(1, 1.3, 1);
  const nestMesh = new THREE.InstancedMesh(eggGeo, new THREE.MeshStandardMaterial({ color: 0xd8c8a8, roughness: 0.6, emissive: 0x3a1a08, emissiveIntensity: 0.4 }), 160);
  const boneGeo = new THREE.CylinderGeometry(0.06, 0.08, 1.1, 5); boneGeo.rotateZ(Math.PI / 2);
  const boneMesh = new THREE.InstancedMesh(boneGeo, new THREE.MeshStandardMaterial({ color: 0xcfc6b2, roughness: 0.9 }), 160);
  const denGeo = new THREE.SphereGeometry(1, 9, 5); denGeo.scale(1.6, 0.28, 1.6);
  const denMesh = new THREE.InstancedMesh(denGeo, new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 1 }), 40);
  for (const m of [nestMesh, boneMesh, denMesh]) { m.count = 0; m.frustumCulled = false; game.scene.add(m); }
  nestMesh.name = 'eco-nests'; boneMesh.name = 'eco-remains'; denMesh.name = 'eco-dens';
  const props = new Map(); // tile key → { nests: [{sp, n, x, z, y, told}], bones: [{x, z, y, a, s}] }
  let propsDirty = false, nestT = 0;
  function placeEcoProps(tx, tz, C) {
    const x0 = -F.half + tx * TILE, z0 = -F.half + tz * TILE; const P = { nests: [], bones: [] };
    for (const q of C.nests || []) { if (!(q.n > 0)) continue; let x = x0 + q.dx, z = z0 + q.dz; if (SPECIES[q.sp]?.habitat === 'lava') { const s = lavaBank(x, z); if (!s) continue; [x, z] = s; } // lava snakes lay on the warm bank
      P.nests.push({ sp: q.sp, n: Math.min(5, q.n), x, z, y: ground(x, z), told: false, id: q.id, kind: q.kind, tx, tz }); }
    for (const cc of C.cc || []) {
      const x = x0 + cc.dx, z = z0 + cc.dz; if (SPECIES[cc.sp]?.habitat === 'lava' || !okSpot(x, z, cc.sp)) continue;
      if (cc.s === 'remains') { for (let i = 0; i < 3; i++) P.bones.push({ x: x + (rnd() - 0.5) * 1.6, z: z + (rnd() - 0.5) * 1.6, y: ground(x, z) + 0.06, a: rnd() * TAU, s: (BODY_SIZE[cc.sp] || 1) * 0.5 }); continue; }
      const c = create(cc.sp, x, z, 2, { noSpecial: true }); deadPose(c, cc.s === 'rotten' ? 240 : 420); c.eaten = cc.s === 'eaten' && rnd() < 0.5; c.rot = cc.s === 'rotten' ? 0.7 : cc.s === 'eaten' ? 0.3 : 0; c.ecoCarcass = true;
    }
    props.set(tkey(tx, tz), P); propsDirty = true;
  }
  // nearest dry ground beside lava within 14 m (snake egg banks)
  function lavaBank(x, z) { for (let r = 2; r < 14; r += 2) for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r; const sd = F.lava(px, pz, Ls).sd; if (sd > 1.5 && sd < 5 && W.canWalk(px, pz)) return [px, pz]; } return null; }
  // eggs.js took one egg from a nest: one fewer drawn; the parents near it are alarmed (guarding species turn hostile)
  function eggTaken(q) {
    q.n = Math.max(0, q.n - 1); propsDirty = true;
    for (const o of near(_pp.set(q.x, 0, q.z), 60)) if (!o.dead && o.sp === q.sp && o.stage >= 2) { o.mem.nest += 2; applyWary(o); o.aggroT = 12; if (o.group) o.group.hostile = game.player; else if ((ECO[o.sp]?.protect || 0) >= 0.3) o.guardT = 20; }
  }
  function removeEcoProps(k) { if (props.delete(k)) propsDirty = true; }
  const _pm = new THREE.Matrix4(), _pq = new THREE.Quaternion(), _pe = new THREE.Euler(), _ps = new THREE.Vector3(), _pp = new THREE.Vector3();
  function ecoPropsTick(dt) {
    // nest intrusion: a hunter within 7 m of a nest (once per nest)
    if ((nestT -= dt) <= 0) {
      nestT = 0.5; const P = game.player?.position;
      if (P && !game.player.dead) for (const T of props.values()) for (const q of T.nests) {
        if (q.told || Math.hypot(P.x - q.x, P.z - q.z) > 7) continue; q.told = true; stats.nestIntrusions = (stats.nestIntrusions || 0) + 1;
        eco?.report({ type: 'nest', sp: q.sp, x: q.x, z: q.z });
        for (const o of near(_pp.set(q.x, 0, q.z), 50)) if (!o.dead && o.sp === q.sp && o.stage >= 2) { o.mem.nest++; applyWary(o); if (o.group && (ECO[o.sp]?.protect || 0) > 0.5) o.group.hostile = game.player; }
        game.events?.emit?.('fauna:nest', { species: q.sp, pos: _pp.clone() });
      }
    }
    // rotting bodies: flies over them, darker every minute; when they are gone the bones stay a while
    for (const c of list) if (c.dead && !c.eaten) { c.rot = Math.min(1, (c.rot || 0) + dt / 300); if (c.rot > 0.5 && rnd() < dt * 0.15 && game.player && c.pos.distanceTo(game.player.position) < 40) W.spawnDust?.(c.pos.clone().setY(c.pos.y + 0.8), 0.08); }
    if (!propsDirty) return; propsDirty = false;
    let n = 0, b = 0, dn = 0;
    for (const T of props.values()) {
      for (const q of T.nests) {
        if (ECO[q.sp]?.den && dn < 40) { _pm.compose(_pp.set(q.x, q.y, q.z), _pq.identity(), _ps.setScalar((BODY_SIZE[q.sp] || 2) * 0.7)); denMesh.setMatrixAt(dn++, _pm); } // a den / burrow mound with the leathery eggs inside
        for (let i = 0; i < q.n && n < 160; i++) { const a = (i / q.n) * TAU; _pm.compose(_pp.set(q.x + Math.cos(a) * 0.35, q.y + 0.18, q.z + Math.sin(a) * 0.35), _pq.identity(), _ps.setScalar((BODY_SIZE[q.sp] || 1) * 0.35)); nestMesh.setMatrixAt(n++, _pm); }
      }
      for (const o of T.bones) if (b < 160) { _pq.setFromEuler(_pe.set(0, o.a, 0)); _pm.compose(_pp.set(o.x, o.y, o.z), _pq, _ps.setScalar(o.s)); boneMesh.setMatrixAt(b++, _pm); }
    }
    nestMesh.count = n; boneMesh.count = b; denMesh.count = dn; for (const m of [nestMesh, boneMesh, denMesh]) m.instanceMatrix.needsUpdate = true;
  }

  // ------------------------------------------------------------------ combat interface (same shape as bosses)
  const _sph = new THREE.Sphere();
  function attach(c) {
    // stage-4 parts: breakable parts absorb hits (src/core/parts.js); 'body' is the creature itself
    c.parts = (PARTS[c.sp] || []).map((d) => makePart({ ...d, hp: d.hp ? Math.max(20, Math.round(d.hp * c.maxHp)) : 99999, breakable: !!d.hp }));
    if (!c.parts.some((p) => p.name === 'body')) c.parts.push(makePart({ name: 'body', hp: 99999, hitzone: 1, hardness: 0.3 + (c.S.defense || 0.5) * 0.5 }));
    c.breakMask = 0; c.bodySize = (BODY_SIZE[c.kind] || BODY_SIZE[c.sp] || 1) * STAGES[c.stage].scale;
    const N = c.S.name, E = c.S.epithet; c.name = isJa() ? N.ja : N.en; if (E) c.epithet = isJa() ? E.ja : E.en; c.isFauna = true;
    Object.defineProperty(c, 'position', { get() { return c.pos; } });
    Object.defineProperty(c, 'state', { get() { return c.dead ? 'dead' : c.ai; } });
    c.getHitboxes = () => {
      if (c.dead || c.ai === 'burrowed') return [];
      if (c.sp === 'lizard' || c.sp === 'drake') { const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw), s = c.scale, y = c.pos.y + 0.45 * s;
        return [{ part: 'head', sphere: new THREE.Sphere(new THREE.Vector3(c.pos.x + fx * 0.9 * s, y, c.pos.z + fz * 0.9 * s), 0.35 * s) }, { part: 'body', sphere: new THREE.Sphere(new THREE.Vector3(c.pos.x, y, c.pos.z), 0.6 * s) }, { part: 'tail', sphere: new THREE.Sphere(new THREE.Vector3(c.pos.x - fx * 1.3 * s, y - 0.1, c.pos.z - fz * 1.3 * s), 0.35 * s) }]; }
      if (c.sp === 'mole') { const s = c.scale; if (c.under) return c.ai === 'track' || c.ai === 'lurk' ? [{ part: 'mound', sphere: new THREE.Sphere(new THREE.Vector3(c.pos.x, ground(c.pos.x, c.pos.z) + 0.2, c.pos.z), 1.1 * s) }] : [];
        const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw), y = c.pos.y + 1.0 * s;
        return [{ part: 'head', sphere: new THREE.Sphere(new THREE.Vector3(c.pos.x + fx * 1.5 * s, y - 0.2 * s, c.pos.z + fz * 1.5 * s), 0.55 * s) }, { part: 'claw', sphere: new THREE.Sphere(new THREE.Vector3(c.pos.x + fx * 1.1 * s, y - 0.5 * s, c.pos.z + fz * 1.1 * s), 0.7 * s) }, { part: 'body', sphere: new THREE.Sphere(new THREE.Vector3(c.pos.x - fx * 0.4 * s, y, c.pos.z - fz * 0.4 * s), 1.15 * s) }]; }
      if (c.sp === 'golem') { const s = c.scale, k = 0.5 + 0.5 * (c.rise || 0), fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
        const out = [{ part: 'body', sphere: new THREE.Sphere(new THREE.Vector3(c.pos.x, c.pos.y + 1.9 * s * k, c.pos.z), 1.4 * s) }];
        if (c.rise > 0.6) { out.push({ part: 'core', sphere: new THREE.Sphere(new THREE.Vector3(c.pos.x + fx * 0.9 * s, c.pos.y + 2.1 * s, c.pos.z + fz * 0.9 * s), 0.5 * s) }); out.push({ part: 'arm', sphere: new THREE.Sphere(new THREE.Vector3(c.pos.x + fx * 0.6 * s + fz * 1.5 * s, c.pos.y + 1.4 * s, c.pos.z + fz * 0.6 * s - fx * 1.5 * s), 0.7 * s) }); }
        return out; }
      if (c.sp === 'wolf' || c.sp === 'boar') { const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw), s = c.scale, big = c.sp === 'boar' ? 1.25 : 0.85, y = c.pos.y + (c.sp === 'boar' ? 0.85 : 0.7) * s;
        const out = [{ part: 'head', sphere: new THREE.Sphere(new THREE.Vector3(c.pos.x + fx * 1.1 * big * s, y, c.pos.z + fz * 1.1 * big * s), 0.42 * big * s) }, { part: 'body', sphere: new THREE.Sphere(new THREE.Vector3(c.pos.x, y, c.pos.z), 0.62 * big * s) }];
        if (c.sp === 'boar') out.push({ part: 'crystal', sphere: new THREE.Sphere(new THREE.Vector3(c.pos.x - fx * 0.3 * s, y + 0.6 * s, c.pos.z - fz * 0.3 * s), 0.45 * s) });
        out.push({ part: 'legs', sphere: new THREE.Sphere(new THREE.Vector3(c.pos.x + fx * 0.4 * big * s, c.pos.y + 0.3 * s, c.pos.z + fz * 0.4 * big * s), 0.38 * big * s) }); return out; }
      if (c.sp === 'snake') { if (c.ai === 'dive' || c.ai === 'hideDeep') return []; const s = c.scale; const out = [{ part: 'head', sphere: new THREE.Sphere(c.pos.clone(), 0.75 * s) }];
        for (let i = 2; i <= 8; i += 3) { const p = c.trail[i * 2]; if (p) out.push({ part: 'body', sphere: new THREE.Sphere(p.clone(), 0.6 * s) }); } return out; }
      if (c.sp === 'bird' && c.alt > 3.5) return []; // out of a great sword's reach while airborne
      const r = (c.sp === 'bird' ? 0.65 : c.sp === 'slime' ? 0.62 : 0.72) * c.scale;
      _sph.center.set(c.pos.x, c.pos.y + (c.sp === 'bird' ? 0.3 : 0.38 * c.scale), c.pos.z); _sph.radius = r;
      if (c.sp === 'bird') return [{ part: 'body', sphere: _sph.clone() }, { part: 'wings', sphere: new THREE.Sphere(new THREE.Vector3(c.pos.x, c.pos.y + 0.35, c.pos.z), 1.2 * c.scale) }];
      return [{ part: c.sp === 'beetle' ? 'shell' : 'body', sphere: _sph.clone() }];
    };
    c.receiveHit = (h) => hit(c, h);
  }
  function hit(c, { damage = 0, point, attackerId, part = 'body', by = null, motion = null, element = null, breakMul = 1 } = {}) {
    if (c.dead) return { damage: 0, part };
    if (!by) { // learning: being struck by a hunter, by which move and which element
      const m = c.mem; m.hit++; if (motion) m.motion[motion] = (m.motion[motion] || 0) + 1; const el = element || 'raw'; m.elem[el] = (m.elem[el] || 0) + 1; applyWary(c);
      if (c.stage <= 1) for (const o of near(c.pos, 30)) if (o !== c && o.sp === c.sp && !o.dead && o.stage >= 2) { o.mem.young++; applyWary(o); if (o.group && (ECO[o.sp]?.protect || 0) > 0.5) o.group.hostile = game.player; } // its young was attacked
    }
    let mult = c.sp === 'beetle' ? 0.55 : c.sp === 'slime' ? 0.85 : c.sp === 'lizard' ? 0.7 : c.sp === 'drake' ? 0.62 : c.sp === 'snake' ? 0.45 : c.sp === 'boar' ? (1 - c.S.defense * 0.45) : c.sp === 'wolf' ? 0.8 : c.sp === 'mole' ? 0.5 : c.sp === 'golem' ? 0.42 : 0.95;
    const P = c.parts.find((p) => p.name === part) || c.parts.find((p) => p.name === 'body');
    mult *= P?.hitzone ?? 1;
    if (c.ai === 'curl' && !disabled(c.parts, 'curl')) mult *= SPECIES.beetle.curlDefense;
    if (c.ai === 'flatten') mult *= SPECIES.slime.flatDefense;
    if (c.parts.some((p) => p.broken && p.name === 'crystal')) mult *= 1.2; // armour crystals shattered
    const dealt = Math.max(1, Math.round(damage * mult));
    const R = resolvePartHit(P, dealt, breakMul); c.hp -= R.bodyDmg; c.flash = 1;
    if (R.broke) onPartBreak(c, P, by); c.hits++; c.lastHitAt = clock; c.aggroT = 10;
    const atk = by ? null : attackerId === 'local' || attackerId == null ? game.player : game.remotePlayers?.get?.(String(attackerId));
    c.hunter = atk || (by ? c.hunter : game.player);
    if (c.hp <= 0) { die(c, by ? (by.sp === 'wolf' ? 'predation' : 'fight') : 'hunted', by || c.hunter); if (c.group) HERD.onHit(c, dealt, by || atk); return { damage: dealt, part, killed: true }; }
    if (c.group) { HERD.onHit(c, dealt, by || atk); return { damage: dealt, part }; }
    if (c.sp === 'beetle') {
      const cornered = c.ai === 'curl' || c.hp < c.maxHp * 0.35;
      if (cornered && c.burstCd <= 0) heatBurst(c);
      else if (c.ai !== 'curl' || c.hits >= 3) setAi(c, 'burrow');
    } else if (c.sp === 'slime') {
      if (dealt >= c.maxHp * SPECIES.slime.split.threshold && c.stage >= SPECIES.slime.split.minStage && list.length < 400) split(c);
      else if (c.ai !== 'spit') setAi(c, 'angry');
    } else if (c.sp === 'bird') {
      if (c.hp < c.maxHp * SPECIES.bird.fleeHp) setAi(c, 'flee'); else setAi(c, 'takeoff');
    } else if (c.sp === 'mole' || c.sp === 'golem') EARTH.onHit(c, dealt, by);
    else PRED.onHit(c, dealt);
    return { damage: dealt, part };
  }
  // a part broke: lose its ability (AI checks disabled()), show it, tell the HUD (only for the hunter's own breaks)
  function onPartBreak(c, p, by) {
    c.breakMask |= BREAK_BIT[p.name] || 0; stats.breaks = (stats.breaks || 0) + 1;
    if (p.name === 'wings' && c.sp === 'bird') { c.alt = Math.min(c.alt, 2); if (c.ai !== 'flee') setAi(c, 'grounded'); }
    if (p.name === 'claw' && c.sp === 'mole' && c.under) { c.under = false; setAi(c, 'fight'); c.surfT = 30; }
    game.events?.emit?.('fauna:partBreak', { creature: c, part: p.name, by });
    if (!by) game.events?.emit?.('monster:partBreak', { monster: c, part: p.name });
  }
  function die(c, cause, by) {
    if (c.dead) return; deadPose(c, cause === 'predation' ? 30 : 90);
    if (c.sp === 'lizard' || c.sp === 'drake') c.roll = 2.6; if (c.sp === 'wolf' || c.sp === 'boar') { c.roll = 1.5; c.mode = 2; } if (c.sp === 'snake') { c.jaw = 0.6; c.pos.y = F.lava(c.pos.x, c.pos.z, Ls).level - 0.05; }
    stats.died++; if (cause === 'predation') stats.predation++;
    game.events?.emit?.('fauna:died', { creature: c, species: c.sp, cause, by });
    // ecosystem: only kills by THIS hunter are reported (the model already accounts for predation, age, starvation)
    // reported at its HOME (the tile it was spawned from), not where it wandered to — otherwise a neighbour tile loses one and
    // its own tile keeps it (the dead would come back)
    // Deaths seen here are real: a hunter's kill, or a predator's (bird, wolf, dragon…) / a fight. Only one client reports a
    // creature (its own kills, or — for creature-on-creature deaths — the host / solo client), and only once.
    if (eco && c.fromEco && !c.reported) {
      if (cause === 'hunted' && c.hunter === game.player) { c.reported = true; eco.report({ type: 'kill', sp: c.sp, stage: c.stage, x: c.home.x, z: c.home.z, cause: 'hunter' }); }
      else if (cause !== 'hunted' && (!game.net?.connected || game.net.isHost)) { c.reported = true; eco.report({ type: 'kill', sp: c.sp, stage: c.stage, x: c.home.x, z: c.home.z, cause: cause === 'predation' ? 'predation' : 'other' }); }
    }
    kinAlarm(c, cause);
  }
  function deadPose(c, corpseT) {
    c.dead = true; c.hp = 0; c.corpseT = corpseT; c.ai = 'dead'; c.move = 0;
    if (c.sp === 'lizard' || c.sp === 'drake') c.roll = 2.6; if (c.sp === 'wolf' || c.sp === 'boar') { c.roll = 1.5; c.mode = 2; } if (c.sp === 'snake') { c.jaw = 0.6; c.pos.y = F.lava(c.pos.x, c.pos.z, Ls).level - 0.05; }
    if (c.sp === 'beetle') c.roll = Math.PI; if (c.sp === 'bird') { c.alt = 0; c.roll = 1.3; } if (c.sp === 'slime') c.squash = 0.55;
  }
  function heatBurst(c) {
    const B = SPECIES.beetle.heatBurst; c.burstCd = B.cooldown; c.heat = 1.5;
    W.spawnDust?.(c.pos.clone(), 1.2);
    for (const h of hunters) {
      const d = h.pos.distanceTo(c.pos);
      if (d < B.radius && h.local) { const ok = game.player.receiveHit?.({ damage: B.damage, knockback: 4, from: c.pos.clone(), source: c, kind: 'aoe' }); if (ok !== false) game.status?.apply?.(...B.status); }
    }
    setAi(c, 'curl'); c.curlT = 3;
  }
  function split(c) {
    stats.split++; const hp = Math.max(20, Math.round(c.hp / 2)); const st = Math.max(0, c.stage - 1);
    for (const s of [-1, 1]) {
      const a = c.yaw + s * 1.4; const x = c.pos.x + Math.cos(a) * 1.2, z = c.pos.z + Math.sin(a) * 1.2;
      const n = create('slime', x, z, st, { hp }); n.maxHp = Math.max(n.maxHp, hp); n.yaw = a; setAi(n, 'flee'); n.fleeT = 6;
    }
    c.dead = true; c.corpseT = 0.01; c.ai = 'dead'; // the parent body is gone (it became the two halves)
    W.spawnSplash?.(c.pos.clone(), 0.8);
  }

  // ------------------------------------------------------------------ projectiles (slime mucus)
  const shots = []; const shotMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshStandardMaterial({ color: 0x331000, emissive: 0xff6a12, emissiveIntensity: 3 }), 24);
  shotMesh.count = 0; shotMesh.frustumCulled = false; shotMesh.name = 'fauna-shots'; game.scene.add(shotMesh);
  function spit(c, h) { shoot(c, h.pos, SPECIES.slime.spit, 1.1); }
  // ballistic shot from creature c at a position (aim height above it); `creature` = a fauna target (e.g. a bird)
  function shoot(c, at, S, aimY = 1.1, creature = null) {
    const from = c.pos.clone(); from.y += c.sp === 'snake' ? 0.5 : c.sp === 'lizard' ? 0.5 * c.scale : 0.6 * c.scale;
    const to = at.clone(); to.y += aimY; const d = from.distanceTo(to); const tt = Math.max(0.15, d / S.speed);
    const v = to.clone().sub(from).divideScalar(tt); v.y += 0.5 * 9.8 * tt;
    shots.push({ p: from, v, life: tt + 0.8, S, src: c, creature });
  }
  const _m = new THREE.Matrix4();
  function updateShots(dt) {
    let n = 0;
    for (let i = shots.length - 1; i >= 0; i--) {
      const s = shots[i]; s.life -= dt; s.v.y -= 9.8 * dt; s.p.addScaledVector(s.v, dt);
      const P = game.player; let gone = s.life <= 0 || s.p.y < ground(s.p.x, s.p.z);
      if (!gone && s.creature && !s.creature.dead && s.creature.pos.distanceTo(s.p) < 1.6) { die(s.creature, 'predation', s.src); gone = true; }
      if (!gone && P?.position) { const dx = P.position.x - s.p.x, dz = P.position.z - s.p.z, dy = P.position.y + 1 - s.p.y; if (dx * dx + dz * dz + dy * dy < (s.S.big ? 2.6 : 0.9)) { const ok = P.receiveHit?.({ damage: s.S.damage, knockback: 2, from: s.p.clone(), kind: s.S.kind || 'projectile' }); if (ok !== false && s.S.status) game.status?.apply?.(...s.S.status); gone = true; } }
      if (gone) { W.spawnSplash?.(s.p.clone(), 0.3); shots.splice(i, 1); continue; }
      if (n < 24) { const k = s.S.big ? 4.5 : 1; _m.makeScale(k, k, k).setPosition(s.p.x, s.p.y, s.p.z); shotMesh.setMatrixAt(n++, _m); }
    }
    shotMesh.count = n; shotMesh.instanceMatrix.needsUpdate = true;
  }

  // ------------------------------------------------------------------ AI
  function setAi(c, ai) { c.ai = ai; c.t = 0; c.dur = 0; c.target = null; }
  // creature → creature damage (pack bites, boar charges); bosses are left alone
  function hitCreature(target, damage, byCreature, style = 'bite') { if (target?.isFauna) return hit(target, { damage, by: byCreature, part: pickTargetPart(byCreature, target, rnd, style) }); return null; }
  const HERD = createHerdAI({ game, rnd, setAi, steer: (...a) => steer(...a), nearestOf: (...a) => nearestOf(...a), nearestHunter, die, ground, wrapA, pickSpot, hitCreature, okSpot: (...a) => okSpot(...a) });
  const EARTH = createEarthAI({ game, W, rnd, setAi, steer: (...a) => steer(...a), nearestOf: (...a) => nearestOf(...a), nearestHunter, noiseOf, die, shoot: (...a) => shoot(...a), ground, wrapA, pickSpot, okSpot: (...a) => okSpot(...a) });
  const countNear = (c, r, f) => { hash.query(c.pos.x, c.pos.z, r, _q); let n = 0; for (const o of _q) if (o !== c && f(o) && o.pos.distanceTo(c.pos) < r) n++; return n; };
  const PRED = createPredatorAI({ countNear, game, W, F, rnd, setAi, steer: (...a) => steer(...a), nearestOf: (...a) => nearestOf(...a), nearestHunter, noiseOf, die, shoot, ground, wrapA, pickSpot });
  const ECOAI = createEcologyAI({ game, F, W, rnd, setAi, steer: (...a) => steer(...a), nearestOf: (...a) => nearestOf(...a), nearestHunter, ground });
  function steer(c, tx, tz, speed, dt, turn = 3) {
    if (c.breakMask & BREAK_BIT.legs) speed *= 0.45; // crippled leg
    const dx = tx - c.pos.x, dz = tz - c.pos.z, d = Math.hypot(dx, dz); if (d < 0.2) { c.move = 0; return d; }
    const want = Math.atan2(dx, dz); c.yaw += Math.max(-turn * dt, Math.min(turn * dt, wrapA(want - c.yaw)));
    const k = Math.max(0, Math.cos(wrapA(want - c.yaw))); const step = Math.min(d, speed * k * dt);
    const nx = c.pos.x + Math.sin(c.yaw) * step, nz = c.pos.z + Math.cos(c.yaw) * step;
    if (c.sp === 'bird' && c.alt > 2) { c.pos.x = nx; c.pos.z = nz; }
    else if (okSpot(nx, nz, c.sp)) { c.pos.x = nx; c.pos.z = nz; pushOut(c, 0.5 * c.scale); } else c.yaw += 1.2 * dt * 3; // blocked: turn away
    c.move = speed > 0 ? Math.min(1, (step / Math.max(dt, 1e-4)) / Math.max(speed, 0.1)) : 0;
    return d;
  }
  const _q = [];
  function nearestOf(c, r, filter) { hash.query(c.pos.x, c.pos.z, r, _q); let best = null, bd = r; for (const o of _q) { if (o === c || !filter(o)) continue; const d = Math.hypot(o.pos.x - c.pos.x, o.pos.z - c.pos.z); if (d < bd) { bd = d; best = o; } } return best; }

  function thinkBeetle(c, dt) {
    const S = c.S; const [h, dH] = nearestHunter(c.pos.x, c.pos.z);
    if (c.ai === 'curl' && disabled(c.parts, 'curl')) { setAi(c, 'burrow'); return; } // cracked shell: curling is useless → dig away instead
    if (c.ai === 'burrow') { c.move = 0; c.squash = Math.max(0.05, 1 - c.t / 1.0); if (c.t > 1) { setAi(c, 'burrowed'); c.dur = (eruptT > 0 ? 20 : 12) + rnd() * 10; } return; }
    if (c.ai === 'burrowed') { if (c.t > c.dur) { const s = pickSpot(c.pos.x, c.pos.z, 8, 18, 'beetle'); if (s) { c.pos.set(s[0], ground(s[0], s[1]), s[1]); } setAi(c, 'emerge'); } return; }
    if (c.ai === 'emerge') { c.squash = Math.min(1, c.t / 0.8); if (c.t > 0.8) { c.squash = 1; setAi(c, 'roam'); } return; }
    if (c.ai === 'curl') { c.move = 0; c.mode = 1; c.curlT -= dt; if (c.curlT <= 0 && !(dH < 2.6)) { c.mode = 0; c.hits = 0; setAi(c, 'roam'); } return; }
    // predators: a bird diving at it (or landing next to it)
    const bird = nearestOf(c, 12, (o) => o.sp === 'bird' && !o.dead && (o.prey === c || o.alt < 3));
    if (bird) { if (rnd() < 0.55) { setAi(c, 'curl'); c.curlT = 4 + rnd() * 3; } else setAi(c, 'burrow'); return; }
    if (dH < 2.6) { setAi(c, 'curl'); c.curlT = 4 + rnd() * 2; return; }
    const heard = h && dH < S.senses.hearing * noiseOf(h);
    if (heard || dH < S.senses.sight) { // antennae up, watch the hunter, back off if it keeps coming
      c.mode = 2; c.yaw += Math.max(-2 * dt, Math.min(2 * dt, wrapA(Math.atan2(h.pos.x - c.pos.x, h.pos.z - c.pos.z) - c.yaw)));
      if (dH < 5) { const a = Math.atan2(c.pos.x - h.pos.x, c.pos.z - h.pos.z); steer(c, c.pos.x + Math.sin(a) * 4, c.pos.z + Math.cos(a) * 4, S.speed * 0.8, dt, 2); } else c.move = 0;
      return;
    }
    c.mode = 0; roamFeed(c, dt, S.speed, 14);
  }
  function roamFeed(c, dt, speed, radius) {
    if (c.ai === 'feed') { c.move = 0; if (c.t > c.dur) { setAi(c, 'roam'); } return; }
    if (!c.target) { const s = pickSpot(c.home.x, c.home.z, 2, radius, c.sp); c.target = s || [c.pos.x, c.pos.z]; }
    const d = steer(c, c.target[0], c.target[1], speed, dt, 2.2);
    if (d < 0.5 || c.t > 20) { setAi(c, 'feed'); c.dur = 3 + rnd() * 6; }
  }

  function thinkSlime(c, dt) {
    const S = c.S; const [h, dH] = nearestHunter(c.pos.x, c.pos.z);
    c.cd -= dt; c.aggroT -= dt;
    if (c.ai === 'flee') { c.fleeT -= dt; const a = c.yaw; steer(c, c.pos.x + Math.sin(a) * 5, c.pos.z + Math.cos(a) * 5, S.speed * 2.2, dt, 1); if (c.fleeT <= 0) setAi(c, 'roam'); return; }
    if (c.ai === 'spit') { c.mode = 2; c.move = 0; if (c.t > 0.6 && !c.fired) { c.fired = true; if (h) spit(c, h); } if (c.t > 1.1) { c.fired = false; c.mode = 0; setAi(c, 'angry'); } return; }
    if (c.ai === 'slam') { c.mode = 2; const tgt = c.target; if (tgt) steer(c, tgt[0], tgt[1], 6, dt, 6); if (c.t > 0.5) { if (h?.local && dH < 1.6 * c.scale + 0.6) game.player.receiveHit?.({ damage: 5, knockback: 5, from: c.pos.clone(), source: c, kind: 'aoe' }); c.mode = 0; c.cd = 2.5; setAi(c, 'angry'); } return; }
    if (c.ai === 'angry' && c.aggroT > 0 && h && dH < S.spit.range) {
      c.yaw += Math.max(-3 * dt, Math.min(3 * dt, wrapA(Math.atan2(h.pos.x - c.pos.x, h.pos.z - c.pos.z) - c.yaw)));
      if (c.cd <= 0) { if (dH < 2.5) { setAi(c, 'slam'); c.target = [h.pos.x, h.pos.z]; } else { setAi(c, 'spit'); c.cd = S.spit.cooldown; } }
      c.move = 0; return;
    }
    if (c.ai === 'angry') setAi(c, 'roam');
    const pred = nearestOf(c, 10, (o) => o.sp === 'bird' && !o.dead && (o.prey === c || o.alt < 3));
    if (pred) { if (c.ai !== 'flatten') setAi(c, 'flatten'); c.mode = 1; c.move = 0; return; }
    if (c.ai === 'flatten') { c.mode = 1; c.move = 0; if (c.t > 4) { c.mode = 0; setAi(c, 'roam'); } return; }
    c.mode = c.ai === 'feed' ? 1 : 0; roamFeed(c, dt, S.speed, 10);
  }

  function thinkBird(c, dt) {
    const S = c.S; const [h, dH] = nearestHunter(c.pos.x, c.pos.z);
    if (disabled(c.parts, 'fly')) { // torn wings: drops to the ground and escapes on foot until they regrow
      c.perchOn = null; c.prey = null; c.alt = Math.max(0, c.alt - dt * 9); c.mode = 2; c.pitch = 0; c.roll = 0;
      if (h && dH < 18) { const a = Math.atan2(c.pos.x - h.pos.x, c.pos.z - h.pos.z); steer(c, c.pos.x + Math.sin(a) * 4, c.pos.z + Math.cos(a) * 4, S.groundSpeed * 1.6, dt, 3); }
      else c.move = 0;
      c.ai = 'grounded'; return;
    }
    if (c.ai === 'grounded') { c.alt = 0.5; setAi(c, 'takeoff'); return; } // wings regrown
    c.hunger = Math.min(1, c.hunger + dt / 120);
    const gy = ground(c.pos.x, c.pos.z);
    const fly = (tx, tz, speed, alt) => { c.altT = alt; c.alt += (c.altT - c.alt) * Math.min(1, dt * 0.8); const d = steer(c, tx, tz, speed, dt, 1.6); c.mode = c.alt > c.altT + 2 || speed > 10 ? 1 : 0; c.pitch = (c.altT - c.alt) * -0.03; c.roll = Math.max(-0.6, Math.min(0.6, c.roll * 0.9)); return d; };
    if (c.ai === 'flee') { // escape far, high; come back later
      c.fleeT += dt; const a = h ? Math.atan2(c.pos.x - h.pos.x, c.pos.z - h.pos.z) : c.yaw;
      fly(c.pos.x + Math.sin(a) * 30, c.pos.z + Math.cos(a) * 30, S.speed * 1.2, 38);
      if (c.fleeT > 25) { c.fleeT = 0; setAi(c, 'soar'); } return;
    }
    if (c.ai === 'toPerch') {
      const gq = c.perchTarget; if (!gq || gq.dead || gq.ai !== 'dormant') { c.perchTarget = null; setAi(c, 'soar'); return; }
      const d = fly(gq.pos.x, gq.pos.z, S.speed * 0.6, 3.3 * gq.scale + Math.min(10, Math.hypot(gq.pos.x - c.pos.x, gq.pos.z - c.pos.z) * 0.4));
      if (d < 1.2) { c.perchOn = gq; c.perchTarget = null; setAi(c, 'perch'); c.dur = 15 + rnd() * 20; c.alt = 3.3 * gq.scale; }
      if (c.t > 20) setAi(c, 'soar'); return;
    }
    if (c.perchOn && (c.ai !== 'perch' || c.perchOn.ai !== 'dormant')) { c.perchOn = null; if (c.ai === 'perch') { c.alt = 4; setAi(c, 'takeoff'); return; } } // the "rock" moved!
    if (c.ai === 'takeoff') { c.altT = S.altitude[0] + 6; c.alt += (c.altT - c.alt) * Math.min(1, dt * 1.6); c.mode = 0; const a = h ? Math.atan2(c.pos.x - h.pos.x, c.pos.z - h.pos.z) : c.yaw; steer(c, c.pos.x + Math.sin(a) * 10, c.pos.z + Math.cos(a) * 10, S.speed * 0.7, dt, 2); if (c.t > 3) setAi(c, 'soar'); return; }
    if (c.ai === 'perch' || c.ai === 'eat') {
      if (!c.perchOn) c.alt = Math.max(0, c.alt - dt * 6); else { c.alt = 3.3 * c.perchOn.scale; c.pos.x = c.perchOn.pos.x; c.pos.z = c.perchOn.pos.z; } c.mode = c.alt > 0.5 ? 1 : 2; c.pitch = 0; c.roll = 0;
      if (c.alt <= 0.5 || c.perchOn) { c.move = 0; c.mode = 2; if (c.ai === 'perch' && rnd() < dt * 0.4) c.yaw += (rnd() - 0.5); }
      if (c.ai === 'eat' && c.prey) { c.prey.squash = Math.max(0.3, (c.prey.squash || 1) - dt * 0.05); c.hunger = Math.max(0, c.hunger - dt / 6); }
      if (h && dH < 14 * (h && /sprint/.test(h.state || '') ? 1.4 : 1)) { setAi(c, 'takeoff'); return; }
      if (c.t > c.dur) { if (c.prey) c.prey.eaten = true; c.prey = null; setAi(c, 'takeoff'); }
      return;
    }
    if (c.ai === 'hunt') {
      const p = c.prey;
      if (!p || p.dead || p.ai === 'curl' || p.ai === 'burrow' || p.ai === 'burrowed' || p.ai === 'flatten' && rnd() < dt) { c.prey = null; setAi(c, 'soar'); c.hunger *= 0.9; return; } // the prey defended itself
      const d = fly(p.pos.x, p.pos.z, S.speed * 1.35, Math.min(c.alt, Math.max(0, Math.hypot(p.pos.x - c.pos.x, p.pos.z - c.pos.z) * 0.5)));
      if (d < 1.4 && c.alt < 2.2) { die(p, 'predation', c); setAi(c, 'eat'); c.prey = p; c.dur = 6 + rnd() * 4; }
      if (c.t > 14) { c.prey = null; setAi(c, 'soar'); }
      return;
    }
    // soaring (default): orbit the home ground; keep away from hunters when low
    const o = c.orbit; o.a += (dt * S.speed / o.r) * o.dir;
    const tx = c.home.x + Math.cos(o.a) * o.r, tz = c.home.z + Math.sin(o.a) * o.r;
    const want = eruptT > 0 ? S.altitude[1] + 15 : S.altitude[0] + (S.altitude[1] - S.altitude[0]) * (0.5 + 0.5 * Math.sin(clock * 0.05 + c.id));
    fly(tx, tz, S.speed, h && dH < 22 ? Math.max(want, 22) : want);
    c.roll = -o.dir * 0.35;
    if (c.t > 6 && c.hunger > 0.55) {
      const prey = nearestOf(c, 45, (q) => !q.dead && ((q.sp === 'beetle' && q.ai !== 'burrowed' && q.ai !== 'curl') || (q.sp === 'slime' && q.stage <= 1)));
      if (prey) { setAi(c, 'hunt'); c.prey = prey; return; }
    }
    if (c.t > 15 && rnd() < dt * 0.04) { const gq = nearestOf(c, 45, (o) => o.sp === 'golem' && !o.dead && o.ai === 'dormant'); if (gq) { setAi(c, 'toPerch'); c.perchTarget = gq; return; } }
    if (c.t > 25 && rnd() < dt * 0.05 && eruptT <= 0 && !(h && dH < 40)) { // land to sweep ash for food
      if (okSpot(c.pos.x, c.pos.z, 'bird') && !insideCollider(c.pos.x, c.pos.z, 1)) { setAi(c, 'perch'); c.dur = 8 + rnd() * 10; }
    }
  }

  const thinkLizardSafe = (c, dt) => PRED.thinkLizard(c, dt), thinkSnakeSafe = (c, dt) => PRED.thinkSnake(c, dt);
  // the snake's body follows the path its head swam (one point every half segment)
  function trailStep(c) {
    const head = c.trail[0]; if (!head) return;
    if (head.distanceTo(c.pos) >= c.spacing * 0.5) {
      const tail = c.trail.pop(); tail.copy(c.pos); c.trail.unshift(tail);
      const under = c.ai === 'dive' || c.ai === 'hideDeep'; if (!under && c.ai !== 'lunge') tail.y = F.lava(c.pos.x, c.pos.z, Ls).level - 0.35; // back plates break the crust
    } else head.y = c.ai === 'lunge' ? c.pos.y : head.y;
    if (c.ai === 'dive' || c.ai === 'hideDeep') for (const p of c.trail) p.y = Math.min(p.y, F.lava(p.x, p.z, Ls).level - 1.6);
  }
  const _yAxis = new THREE.Vector3(0, 1, 0);
  const _sm = new THREE.Matrix4(), _sq = new THREE.Quaternion(), _sv = new THREE.Vector3(), _sd = new THREE.Vector3(), _up = new THREE.Vector3(0, 0, 1);
  function pushSnake(c) {
    const s = c.scale, glow = c.dead ? 0 : 0.15 + (c.ai === 'lunge' || c.ai === 'ball' ? 0.7 : 0);
    for (let i = 0; i < c.segs; i++) {
      const a = c.trail[i * 2], b = c.trail[i * 2 + 2]; if (!a || !b) break;
      _sd.subVectors(a, b); const len = _sd.length() || 0.01; _sq.setFromUnitVectors(_up, _sd.multiplyScalar(1 / len));
      const taper = s * (i < 2 ? 1.05 : 1 - Math.max(0, i - 6) / (c.segs + 2));
      _sv.set(taper, taper, Math.max(len, c.spacing) * 1.05); _sm.compose(_sd.copy(a).lerp(b, 0.5), _sq, _sv);
      render.pushRaw('snakeSeg', _sm, [0, 0, 0, glow], c.dead ? 0.4 : 1 + c.flash);
    }
    _sq.setFromAxisAngle(new THREE.Vector3(0, 1, 0), c.yaw); _sv.set(s, s, s); _sm.compose(c.pos, _sq, _sv);
    render.pushRaw('snakeHead', _sm, [0, c.jaw || 0, 0, glow], c.dead ? 0.4 : 1 + c.flash);
  }

  // ------------------------------------------------------------------ main loop
  let clock = 0; const sighted = new Set();
  function update(dt, rawDt) {
    if (dt <= 0) return; clock += dt; frame++; eruptT = Math.max(0, eruptT - dt);
    eco?.update(dt, game.player?.position); ecoPropsTick(dt); ECOAI.tick(dt);
    gatherHunters(); rebuildColliders();
    // spawn / despawn around hunters (twice a second)
    spawnT -= dt;
    if (spawnT <= 0) {
      spawnT = 0.5;
      for (const h of hunters) {
        const [cx, cz] = W.chunks.tileOf(h.pos.x, h.pos.z); const r = Math.ceil(SPAWN_R / TILE);
        for (let tz = cz - r; tz <= cz + r; tz++) for (let tx = cx - r; tx <= cx + r; tx++) {
          if (spawned.has(tkey(tx, tz))) continue;
          const mx = -F.half + (tx + 0.5) * TILE, mz = -F.half + (tz + 0.5) * TILE; if (Math.hypot(mx - h.pos.x, mz - h.pos.z) > SPAWN_R) continue;
          try { spawnTile(tx, tz); } catch (e) { log.error('fauna-spawn', `tile ${tx},${tz}: ${e.message}`, e); spawned.add(tkey(tx, tz)); }
        }
      }
      for (let i = list.length - 1; i >= 0; i--) {
        const c = list[i]; if (c.group) continue; const [, d] = nearestHunter(c.pos.x, c.pos.z);
        if (d > DESPAWN_R) { if (!c.dead) despawn(c); list.splice(i, 1); }
      }
      for (const g of [...HERD.groups]) { const far = g.members.every((m) => m.dead || nearestHunter(m.pos.x, m.pos.z)[1] > DESPAWN_R); if (far) storeGroup(g); }
      for (const k of [...spawned]) { const tx = k % 1000, tz = Math.floor(k / 1000); const mx = -F.half + (tx + 0.5) * TILE, mz = -F.half + (tz + 0.5) * TILE; let far = true; for (const h of hunters) if (Math.hypot(mx - h.pos.x, mz - h.pos.z) < DESPAWN_R - 20) far = false; if (far) { spawned.delete(k); if (census.get(k)?.eco) census.delete(k); removeEcoProps(k); } }
      // without an ecosystem (non-island fields): provisional regrowth in stored (unobserved) tiles
      if (!eco) for (const [k, C] of census) { if (spawned.has(k)) continue; C.regenT -= 0.5; if (C.regenT > 0) continue; C.regenT = REGEN_S; for (const sp of Object.keys(C.cap)) if (!SPECIES[sp].group && C.stored[sp] < C.cap[sp]) { C.stored[sp]++; stats.regen++; break; } }
    }
    hash.clear(); for (const c of list) hash.insert(c, c.pos.x, c.pos.z);
    for (const g of [...HERD.groups]) HERD.thinkGroup(g, dt);
    // think (near: every frame; far: every 4th frame with accumulated dt)
    for (let i = list.length - 1; i >= 0; i--) {
      const c = list[i];
      if (c.dead) { c.corpseT -= dt; if (c.eaten) c.corpseT = Math.min(c.corpseT, 5); if (c.corpseT <= 0) list.splice(i, 1); continue; }
      const [, d] = nearestHunter(c.pos.x, c.pos.z);
      c.acc += dt; if (d > LOD_NEAR && (frame + c.id) % 4) continue; const fullDt = c.acc, sdt = Math.min(c.acc, 0.25); c.acc = 0;
      if (c.breakMask) for (const n of tickRegen(c.parts, fullDt, (c.hunger < 0.5 ? 1.2 : 0.7) * (c.hp > c.maxHp * 0.5 ? 1 : 0.6))) { c.breakMask &= ~(BREAK_BIT[n] || 0); game.events?.emit?.('fauna:partRegen', { creature: c, part: n }); }
      c.t += sdt; c.flash = Math.max(0, c.flash - sdt * 4); c.heat = Math.max(0, c.heat - sdt); c.burstCd -= sdt;
      if (c.staggerT > 0) { c.staggerT -= sdt; c.move = 0; c.hitDone = true; } // parried: reeling, no attack lands
      else if (c.dodgeT > 0) { c.dodgeT -= sdt; const nx = c.pos.x + c.dodgeDir[0] * 7 * sdt, nz = c.pos.z + c.dodgeDir[1] * 7 * sdt; if (okSpot(nx, nz, c.sp)) { c.pos.x = nx; c.pos.z = nz; } c.move = 1; }
      else if (game.volcanoRampage && rampage(c, sdt)) { /* the Volcano Slime is awake (src/field/volcano.js) */ }
      else if (learnedDodge(c, d)) { /* side-step started */ }
      else if (c.ai === 'wary') thinkWary(c, sdt);
      else if (wantWary(c, d)) setAi(c, 'wary');
      else if (ECOAI.react(c, sdt)) { /* ecology: dragons overhead, juveniles, guarding, basking (ecology.js) */ }
      else if (c.sp === 'beetle') thinkBeetle(c, sdt); else if (c.sp === 'slime') thinkSlime(c, sdt); else if (c.sp === 'bird') thinkBird(c, sdt);
      else if (c.sp === 'boar') HERD.thinkBoar(c, sdt); else if (c.sp === 'wolf') HERD.thinkWolf(c, sdt);
      else if (c.sp === 'mole') EARTH.thinkMole(c, sdt); else if (c.sp === 'golem') EARTH.thinkGolem(c, sdt);
      else if (c.sp === 'lizard' || c.sp === 'drake') thinkLizardSafe(c, sdt); else if (c.sp === 'snake') thinkSnakeSafe(c, sdt);
      if (c.sp === 'mole') c.pos.y = ground(c.pos.x, c.pos.z) - (c.under ? 3 : (1 - (c.rise ?? 1)) * 2.4 * c.scale);
      else if (c.sp === 'bird' && c.perchOn) c.pos.y = c.perchOn.pos.y + 3.3 * c.perchOn.scale;
      else if (c.sp !== 'snake') c.pos.y = ground(c.pos.x, c.pos.z) + (c.sp === 'bird' ? c.alt + 0.36 * c.scale : 0);
      else trailStep(c);
      c.phase += sdt * (c.sp === 'bird' ? (c.mode === 0 ? 1.4 : 0.6) : 0.5 + c.move * 1.2);
      if (!sighted.has(c.sp) && d < 25) { sighted.add(c.sp); game.events?.emit?.('fauna:sighted', { species: c.sp, creature: c }); }
    }
    updateShots(dt);
    // draw
    render.begin(); const cam = game.camera.position;
    for (const c of list) {
      if (c.ai === 'burrowed') continue;
      if (Math.hypot(c.pos.x - cam.x, c.pos.z - cam.z) > DRAW_R) continue;
      if (c.sp === 'snake') pushSnake(c);
      else if (c.sp === 'mole' && c.under) { if (c.ai === 'track' || c.ai === 'lurk' || c.move > 0.1) { _sm.compose(_sv.set(c.pos.x, ground(c.pos.x, c.pos.z) - 0.1, c.pos.z), _sq.setFromAxisAngle(_yAxis, c.yaw), _sd.set(c.scale * 1.3, c.scale * (c.ai === 'lurk' ? 0.25 : 0.45), c.scale * 1.8)); render.pushRaw('mound', _sm, [c.phase, c.move, 0, 0], 1); } }
      else if (c.sp === 'golem') render.push(c, [c.phase, c.rise || 0, c.arm || 0, c.heat]);
      else render.push(c, [c.phase, c.move, c.mode, c.heat + (c.sp === 'slime' ? 0.4 : 0)]); // aBreak from c.breakMask
    }
    render.end();
  }

  // targets near a point (for the hunter's weapon sweep)
  const _near = [];
  function near(p, r) { hash.query(p.x, p.z, r, _near); const out = _near.filter((c) => !c.dead && Math.hypot(c.pos.x - p.x, c.pos.z - p.z) < r); const b = game.broods?.near?.(p, r); return b?.length ? out.concat(b) : out; } // + big-monster juveniles (broods.js)
  // mid-tier fauna currently fighting the local hunter (the HUD can show them like bosses)
  function engaged() { return list.filter((c) => !c.dead && ((c.engaged && (c.sp === 'lizard' || c.sp === 'drake' || c.sp === 'snake' || c.sp === 'golem' || (c.sp === 'mole' && !c.under))) || (c.group && (c.role === 'leader' || c.role === 'tusk') && ((c.group.state === 'engage' && c.group.target === game.player) || (c.group.state === 'defend' && c.group.threat === game.player))))); }
  return {
    update, near, list, census, stats, render, engaged, eco, props, groups: () => HERD.groups, spawnGroup, eggTaken,
    spawnOne: (sp, x, z, stage = 2, opts = {}) => create(sp, x, z, stage, opts), // tests / scripted scenes
    kill: (c, by) => { if (c && !c.dead && !c.isBrood) die(c, 'predation', by); }, // a dragon / big predator took it (src/field/dragonLife.js)
    ecology: ECOAI,
    debug: () => { const by = { beetle: 0, slime: 0, bird: 0, lizard: 0, snake: 0, boar: 0, wolf: 0, mole: 0, golem: 0, drake: 0 }; const ai = {}; for (const c of list) if (!c.dead) { by[c.sp]++; ai[c.sp + ':' + c.ai] = (ai[c.sp + ':' + c.ai] || 0) + 1; } return { live: by, ai, groups: [...HERD.groups].map((g) => `${g.sp}#${g.id}:${g.state}(${HERD.alive(g).length})`), tiles: spawned.size, census: census.size, ...stats, shots: shots.length, eco: eco?.info(), wary: list.filter((c) => !c.dead && c.wary > 0).length }; },
  };
}
