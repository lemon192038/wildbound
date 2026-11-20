// Dragon ecology on the open island (user request: "some dragons settle in a territory, others soar the sky and prey on
// Ash Birds and ground monsters"). Reasoning in ECOLOGY.md. The Flame Dragon ♂ and Venom-fang Dragon ♀ are the two
// sexes of one species (design document):
//   resident (Venom-fang ♀, Cindaryl): ground-loving; holds a territory around her nest, patrols it on foot / in low
//            glides, hunts only inside it (ground prey), never strays far from the clutch.
//   roamer   (Flame ♂, the upper Flame individual, Cindral): soars high over the whole island on long circuits, stoops on
//            Ash Birds in the air and on ground animals in the open (boars, Cinderskins, lizards, wolves — never prey too
//            small to be worth it: beetles, slimes), eats at the kill, and a mated male carries food back to his
//            female's nest (provisioning) before soaring off again.
// Only steers an UNAWARE dragon (m.wander, read by wyvern.js); the moment it notices a hunter the normal boss fight runs.
// Far from every hunter the bosses are frozen (islandBosses.js LOD): a roamer still travels its circuit there (moved
// directly), so it can come into view from anywhere. Host / solo only (co-op clients follow the host's dragons).
import * as THREE from 'three';

export const DRAGON_LIFE = {
  flame: { role: 'roamer', mate: 'venom', range: 700, alt: 34, speed: 13 },
  flameRoam: { role: 'roamer', mate: 'venom2', range: 700, alt: 30, speed: 12 },
  flameUpper: { role: 'roamer', range: 800, alt: 40, speed: 14 },
  wyvern: { role: 'roamer', range: 650, alt: 36, speed: 13 },              // Cindral (special male): solitary
  venom: { role: 'resident', range: 120, alt: 0, speed: 6 },
  venom2: { role: 'resident', range: 120, alt: 0, speed: 6 },
  cindaryl: { role: 'resident', range: 140, alt: 0, speed: 6 },            // special female: solitary, holds the biggest ground
};
// what a dragon will take: aerial prey only for roamers; size-worthy ground prey for both
const PREY_AIR = new Set(['bird']);
const PREY_GROUND = new Set(['boar', 'drake', 'lizard', 'wolf']);

export function createDragonLife(game, homes, isActive) {
  const W = game.world, F = W.island; const S = new Map(); const stats = { kills: {}, stoops: 0, provisions: 0, patrolLegs: 0 };
  let seed = 4471; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const homeOf = (id) => homes.find((h) => h.id === id)?.home;
  const nestOf = (id) => game.broods?.nests?.find((n) => n.home === id);
  function landPoint(cx, cz, rMin, rMax) {
    for (let i = 0; i < 16; i++) { const a = rnd() * Math.PI * 2, r = rMin + rnd() * (rMax - rMin), x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (Math.abs(x) > F.half - 80 || Math.abs(z) > F.half - 80 || !W.canWalk(x, z) || F.height(x, z) < 4) continue; return new THREE.Vector3(x, 0, z); }
    return new THREE.Vector3(cx, 0, cz);
  }
  function stateOf(m) {
    const id = m.islandId; if (!DRAGON_LIFE[id] || m.kind !== 'wyvern') return null; let s = S.get(m);
    if (!s) { const h = homeOf(id) || [m.position.x, m.position.z]; s = { id, L: DRAGON_LIFE[id], home: new THREE.Vector3(h[0], 0, h[1]), mode: 'patrol', wp: null, t: 0, hunger: 0.3 + rnd() * 0.5, prey: null }; S.set(m, s); }
    return s;
  }
  const wander = (m, pos, alt, speed, extra = {}) => { (m.wander ||= { pos: new THREE.Vector3() }).pos.copy(pos); Object.assign(m.wander, { alt, speed, dive: false, turn: 0.9 }, extra); };
  function pickPrey(m, s) {
    const R = s.L.role === 'roamer' ? 110 : 70; let best = null, bd = R;
    for (const c of game.fauna?.list || []) {
      if (c.dead || c.under || c.ai === 'burrowed' || c.ai === 'dive' || c.ai === 'hideDeep') continue;
      const air = PREY_AIR.has(c.sp) && c.alt > 3, ground = PREY_GROUND.has(c.sp) && (c.sp !== 'wolf' || c.stage <= 1 || !c.group);
      if (!(air && s.L.role === 'roamer') && !ground) continue;
      if (s.L.role === 'resident' && Math.hypot(c.pos.x - s.home.x, c.pos.z - s.home.z) > s.L.range) continue; // residents hunt inside their territory only
      const d = Math.hypot(c.pos.x - m.position.x, c.pos.z - m.position.z) - (c.stage <= 1 ? 25 : 0); // the young are the easy catch
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }
  const _g = new THREE.Vector3();
  function step(m, s, dt, active) {
    s.t += dt; s.hunger = Math.min(1, s.hunger + dt / 240);
    const L = s.L, gy = (x, z) => W.getHeight(x, z);
    if (!active) { // frozen far from hunters: roamers keep travelling their circuit (moved directly), residents rest at home
      m.wander = null; if (L.role !== 'roamer') return;
      if (!s.wp || Math.hypot(s.wp.x - m.position.x, s.wp.z - m.position.z) < 20) { s.wp = landPoint(s.home.x, s.home.z, 120, L.range); stats.patrolLegs++; }
      _g.set(s.wp.x - m.position.x, 0, s.wp.z - m.position.z).normalize(); m.position.x += _g.x * L.speed * dt; m.position.z += _g.z * L.speed * dt;
      m.position.y = gy(m.position.x, m.position.z) + L.alt; m.yaw = Math.atan2(_g.x, _g.z); if (m.object3d) m.object3d.rotation.y = m.yaw; return;
    }
    if (m.aggro || m.action) { m.wander = null; s.mode = 'patrol'; s.prey = null; return; }
    m.perception?.setHome?.(m.position); // its range is wide: "home" is wherever it is now (no leash back to the spawn)
    switch (s.mode) {
      case 'stoop': {
        const p = s.prey; if (!p || p.dead || p.under || p.ai === 'burrowed' || p.ai === 'dive' || s.t > 18) { s.mode = 'patrol'; s.prey = null; s.t = 0; break; }
        const air = p.sp === 'bird' && p.alt > 1; const targetAlt = air ? Math.max(3, p.alt - 1) : 3.6;
        wander(m, p.pos, targetAlt, L.role === 'roamer' ? 24 : 10, { dive: true, turn: 2.4 });
        const dx = p.pos.x - m.position.x, dz = p.pos.z - m.position.z; const dy = (p.pos.y + (air ? 0 : 1)) - (m.position.y - 2);
        if (Math.hypot(dx, dz) < 5 + (air ? 3 : 0) && Math.abs(dy) < 6) {
          game.fauna?.kill?.(p, m); stats.kills[p.sp] = (stats.kills[p.sp] || 0) + 1; s.hunger = 0; s.t = 0;
          const mate = L.mate && nestOf(L.mate); s.mode = mate && rnd() < 0.6 ? 'provision' : 'feed'; s.carcass = p; game.events?.emit?.('dragon:kill', { dragon: m, prey: p });
        }
        break;
      }
      case 'feed': { // lands at the kill and eats
        const p = s.carcass; wander(m, p ? p.pos : m.position, 3.6, 4, { turn: 1.5 }); if (s.t > 18) { if (p) p.eaten = true; s.mode = 'patrol'; s.t = 0; s.carcass = null; } break;
      }
      case 'provision': { // carries food to his mate's nest, lands beside it, then soars off
        const N = nestOf(L.mate); if (!N) { s.mode = 'feed'; break; } if (s.carcass) { s.carcass.eaten = true; s.carcass = null; }
        _g.set(N.x + 9, 0, N.z + 9); const d = Math.hypot(_g.x - m.position.x, _g.z - m.position.z);
        wander(m, _g, d > 30 ? L.alt : 3.6, d > 30 ? L.speed * 1.2 : 5, { turn: 1.2 }); if (d < 8) { s.landed = (s.landed || 0) + dt; if (s.landed > 10) { stats.provisions++; s.mode = 'patrol'; s.t = 0; s.landed = 0; } } break;
      }
      default: { // patrol: long sky circuits (roamer) / a ground beat around the nest (resident)
        const myNest = L.role === 'resident' ? game.broods?.nests?.find((n) => n.home === s.id && n.eggs > 0) : null; // a female with eggs sits close to them
        if (!s.wp || Math.hypot(s.wp.x - m.position.x, s.wp.z - m.position.z) < (L.role === 'roamer' ? 25 : 6) || s.t > 120) { s.wp = L.role === 'roamer' ? landPoint(s.home.x, s.home.z, 100, L.range) : myNest ? landPoint(myNest.x, myNest.z, 6, 40) : landPoint(s.home.x, s.home.z, 10, L.range * 0.8); s.t = 0; stats.patrolLegs++; }
        wander(m, s.wp, L.role === 'roamer' ? L.alt : 3.6, L.speed);
        if (s.hunger > 0.45 && Math.floor(s.t * 2) !== Math.floor((s.t - dt) * 2)) { const p = pickPrey(m, s); if (p) { s.prey = p; s.mode = 'stoop'; s.t = 0; stats.stoops++; } }
      }
    }
  }
  function update(dt) {
    if (game.net?.connected && !game.net.isHost) return;
    for (const m of game.monsters || []) { if (m.state === 'dead' || m.remoteControlled) continue; const s = stateOf(m); if (s) step(m, s, dt, isActive(m)); }
  }
  return { update, stats, states: S };
}
