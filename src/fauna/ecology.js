// Behaviour that follows from the island's ecology (ECOLOGY.md, user request: "think like a field biologist").
// These rules sit on top of each species' own AI and only run while the creature is not fighting:
//   • a dragon overhead — prey and the animals that fear dragons react the way their biology implies:
//       Ash Birds drop low and scatter (they are the dragons' aerial prey); Crystal Boars bunch with the young inside;
//       Lava Snakes sink below the lava crust; Cinderskins (flightless dragons, out-competed) slink away and lie flat;
//       Fire Lizards freeze against the rock; Boulder Golems stay dormant (a rock is not food). Beetles, slimes and
//       moles are too small / too deep to matter to a dragon and carry on.
//   • juveniles stay near their nest ground (lifecycle.js juvRange) and run to the nearest adult of their kind when a
//     predator or a hunter comes close (adults of guarding species turn to face the threat).
//   • ectotherms (Fire Lizards, Cinderskins, Magma Beetles) cool down away from heat and go to bask by lava or vents
//     before hunting/foraging again; the warm ground is where their predators learn to look for them.
import { LIFE, LINEAGE } from '../shared/lifecycle.js';
import { ECO } from '../shared/ecosystem.js';

const TAU = Math.PI * 2;
export function createEcologyAI({ game, F, W, rnd, setAi, steer, nearestOf, nearestHunter, ground, nestsNear = () => [], provoke = () => {} }) {
  const Ls = {}; let dragons = [], scanT = 0; const stats = { dragonReact: 0, huddle: 0, bask: 0, juvHome: 0, juvRun: 0, nestSit: 0, nestDefend: 0, mob: 0 };
  const flying = (m) => m.kind === 'wyvern' && m.state !== 'dead' && m.position.y - W.getHeight(m.position.x, m.position.z) > 4;
  function tick(dt) { if ((scanT -= dt) > 0) return; scanT = 0.5; dragons = (game.monsters || []).filter(flying); }
  const nearDragon = (c, r) => { let best = null, bd = r; for (const m of dragons) { const d = Math.hypot(m.position.x - c.pos.x, m.position.z - c.pos.z); if (d < bd) { bd = d; best = m; } } return best; };
  const away = (c, from, dist, speed, dt) => { const a = Math.atan2(c.pos.x - from.x, c.pos.z - from.z); return steer(c, c.pos.x + Math.sin(a) * dist, c.pos.z + Math.cos(a) * dist, speed, dt, 4); };
  const warmAt = (x, z) => { const sd = F.lava(x, z, Ls).sd; return sd > 2.5 && sd < 14 || F.regionAt(x, z) === 'geotherm'; };

  function busy(c) { return c.engaged || c.aggroT > 0 || c.under || c.ai === 'burrowed' || c.ai === 'eat' || (c.group && (c.group.state === 'engage' || c.group.state === 'defend')); }

  function dragonReaction(c, dt) {
    const m = nearDragon(c, c.sp === 'bird' ? 70 : 55); if (!m) { c.dragonT = 0; return false; }
    c.dragonT = (c.dragonT || 0) + dt; stats.dragonReact++;
    switch (c.sp) {
      case 'bird': if (c.alt > 1) { c.altT = 2.5; c.alt += (c.altT - c.alt) * Math.min(1, dt * 1.2); away(c, m.position, 20, c.S.speed * 1.3, dt); c.mode = 1; c.ai = 'evade'; return true; } return false;
      case 'boar': { // the herd bunches; the young go to the middle
        const g = c.group; if (!g) return false; let cx = 0, cz = 0, n = 0; for (const o of g.members) if (!o.dead) { cx += o.pos.x; cz += o.pos.z; n++; }
        cx /= n; cz /= n; const d = Math.hypot(c.pos.x - cx, c.pos.z - cz); const want = c.stage <= 1 ? 0.5 : 2.6;
        if (d > want) steer(c, cx, cz, c.S.runSpeed || 5, dt, 4); else { c.move = 0; if (c.stage >= 2) c.yaw = Math.atan2(c.pos.x - cx, c.pos.z - cz); }
        c.mode = 2; stats.huddle++; return true;
      }
      case 'snake': if (c.ai !== 'dive' && c.ai !== 'hideDeep' && !c.engaged) { setAi(c, 'dive'); } return false;
      case 'drake': away(c, m.position, 12, (c.S.speed || 2) * 1.6, dt); if (c.dragonT > 3) { c.move = 0; c.mode = 2; } return true; // slink off, then lie flat
      case 'lizard': c.move = 0; c.mode = 2; return true;                    // freeze against the rock
      case 'golem': if (c.ai === 'dormant') { c.move = 0; return true; } return false;
      default: return false;
    }
  }
  function juvenile(c, dt) {
    if (c.stage !== 0 || c.sp === 'snake' || c.sp === 'mole') return false;
    const L = LIFE[LINEAGE[c.sp]]; if (!L) return false;
    // danger: a predator of its kind or a hunter close → run to the nearest adult kin (or away)
    const [h, dH] = nearestHunter(c.pos.x, c.pos.z);
    const pred = nearestOf(c, 14, (o) => !o.dead && o.sp !== c.sp && ['lizard', 'wolf', 'snake', 'drake', 'bird'].includes(o.sp) && o.stage >= 2);
    if (dH < 12 || pred) {
      const adult = nearestOf(c, 40, (o) => !o.dead && o.sp === c.sp && o.stage >= 2);
      if (adult) { steer(c, adult.pos.x, adult.pos.z, (c.S.runSpeed || c.S.speed || 1.5) * 1.5, dt, 5); if ((ECO[c.sp]?.protect || 0) >= 0.3) adult.guardT = Math.max(adult.guardT || 0, 4); }
      else away(c, pred ? pred.pos : h.pos, 8, (c.S.speed || 1.5) * 1.8, dt);
      c.mode = c.sp === 'beetle' ? 2 : c.mode; stats.juvRun++; return true;
    }
    if (c.group) return false; // herd / pack young follow the group (herds.js)
    if (Math.hypot(c.pos.x - c.home.x, c.pos.z - c.home.z) > L.juvRange) { steer(c, c.home.x, c.home.z, (c.S.speed || 1.5), dt, 3); stats.juvHome++; return true; }
    return false;
  }
  function bask(c, dt) {
    if (c.sp !== 'lizard' && c.sp !== 'drake' && c.sp !== 'beetle') return false;
    const warm = warmAt(c.pos.x, c.pos.z); c.cold = Math.max(0, Math.min(1.5, (c.cold ?? rnd() * 0.8) + (warm ? -dt / 20 : dt / (c.sp === 'beetle' ? 240 : 150))));
    if (c.ai === 'bask') {
      if (!c.baskAt) { setAi(c, c.homeAi || 'roam'); return false; }
      const d = steer(c, c.baskAt[0], c.baskAt[1], (c.S.speed || 1.5) * 0.9, dt, 2.5);
      if (d < 1.2) { c.move = 0; c.mode = c.sp === 'beetle' ? 0 : 2; c.heat = Math.min(1, c.heat + dt * 0.2); }
      if (c.cold <= 0 || c.t > 60) { c.baskAt = null; c.home.set(c.pos.x, 0, c.pos.z); setAi(c, c.homeAi || 'roam'); } // the warm rock becomes its new ambush / foraging ground
      return true;
    }
    if (c.cold < 1 || c.hunger > 0.85) return false; // starving animals hunt cold
    for (let i = 0; i < 10; i++) { const a = rnd() * TAU, r = 6 + rnd() * 34, x = c.pos.x + Math.cos(a) * r, z = c.pos.z + Math.sin(a) * r; if (warmAt(x, z) && W.canWalk(x, z) && ground(x, z) > 1.5) { c.baskAt = [x, z]; setAi(c, 'bask'); stats.bask++; return true; } }
    c.cold = 0.6; return false; // nowhere warm in reach: try again later
  }
  // guardians: an adult whose young / nest is threatened stands its ground facing the threat
  function guard(c, dt) {
    if (!(c.guardT > 0)) return false; c.guardT -= dt; const [h, dH] = nearestHunter(c.pos.x, c.pos.z);
    if (h && dH < 25) { c.yaw += Math.atan2(Math.sin(Math.atan2(h.pos.x - c.pos.x, h.pos.z - c.pos.z) - c.yaw), Math.cos(Math.atan2(h.pos.x - c.pos.x, h.pos.z - c.pos.z) - c.yaw)) * Math.min(1, dt * 3); c.move = 0; c.mode = 2; if (dH < 6) c.aggroT = Math.max(c.aggroT || 0, 6); return true; }
    return false;
  }
  // females of most species keep near their eggs (user request): a female whose species has a clutch within 45 m sits
  // within ~10 m of it; a hunter coming within 16 m of the eggs is met head-on (species that fight attack — temperament)
  function nestSitter(c, dt) {
    if (!c.female || c.stage < 2 || c.group || c.sp === 'snake' || c.sp === 'slime' || c.sp === 'beetle') return false;
    if (!c.nestRef || c.nestRef.n <= 0 || (c.nestT = (c.nestT || 0) - dt) <= 0) { c.nestT = 3; c.nestRef = nestsNear(c.home.x, c.home.z, 45, c.sp)[0] || null; }
    const q = c.nestRef; if (!q) return false;
    const [h] = nearestHunter(q.x, q.z); const dHn = h ? Math.hypot(h.pos.x - q.x, h.pos.z - q.z) : Infinity;
    if (dHn < 16) { stats.nestDefend++; provoke(c, 12); return false; } // let its own fighting AI take the hunter on
    const d = Math.hypot(c.pos.x - q.x, c.pos.z - q.z);
    if (d > 10) { steer(c, q.x, q.z, (c.S.speed || 1.5), dt, 3); stats.nestSit++; return true; }
    if (c.ai === 'ambush' || c.ai === 'patrol' || c.ai === 'roam' || c.ai === 'feed') { c.move = 0; c.mode = 2; stats.nestSit++; return true; }
    return false;
  }
  // Ash Birds mob an egg thief: swoop low around the hunter, screeching, for a while (no damage — they drive it off)
  function mob(c, dt) {
    if (c.sp !== 'bird' || !(c.mobT > 0)) return false; c.mobT -= dt; const [h] = nearestHunter(c.pos.x, c.pos.z); if (!h) return false;
    c.mobA = (c.mobA ?? rnd() * 6.28) + dt * 1.6; const r = 6 + 2 * Math.sin(c.mobA * 0.7);
    c.altT = 3.5 + Math.sin(c.mobA * 2) * 1.5; c.alt += (c.altT - c.alt) * Math.min(1, dt * 2); steer(c, h.pos.x + Math.cos(c.mobA) * r, h.pos.z + Math.sin(c.mobA) * r, c.S.speed, dt, 5); c.mode = 0; c.ai = 'mob'; stats.mob++; return true;
  }
  function react(c, dt) {
    if (mob(c, dt)) return true;
    if (busy(c)) return false;
    return dragonReaction(c, dt) || juvenile(c, dt) || guard(c, dt) || nestSitter(c, dt) || bask(c, dt);
  }
  return { tick, react, stats, get dragons() { return dragons; } };
}
