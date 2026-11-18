// The three existing bosses living in their territories on the open island.
//   Varkhul (Emberhide)  — southern volcanic heartland
//   Cindral (Ashwing)    — eastern ash plain
//   Gorvath (Cinderfist) — northern highlands
// Each keeps its own AI, attacks and part breaks; its spawn becomes its home (perception leash, Gorvath's ring).
// Loading is staged: the hunter can move while bosses are built one by one after the first frame (nearest first
// is not used on purpose — the creation ORDER is fixed so co-op snapshot indices match on every client).
// AI level of detail: a boss farther than AI_FAR from every hunter is frozen and hidden (it rests at home).
// Dead bosses stay as carcasses for this session (no instant respawn — breeding/migration is a later stage).
import { createMonster } from '../monster/monster.js';
import { createWyvern } from '../monster/wyvern.js';
import { createBrute } from '../monster/brute.js';
import { log } from '../core/log.js';

export const TERRITORIES = [
  { kind: 'varkhul', near: [150, 400], site: {} },
  { kind: 'wyvern', near: [560, -80], site: { flatR: 18 } },
  { kind: 'brute', near: [-120, -560], site: { maxSlope: 0.3 } },
];
const MAKERS = { varkhul: createMonster, wyvern: createWyvern, brute: createBrute };
const AI_FAR = 260, AI_NEAR = 240; // hysteresis

export function territoryHomes(F) { return TERRITORIES.map((T) => ({ kind: T.kind, home: F.findSite(T.near[0], T.near[1], T.site) })); }

export function createIslandBosses(game, homes) {
  const { THREE } = game; const W = game.world, F = W.island;
  const state = { loaded: 0, failed: 0, active: new Set() };
  const hunters = () => { const l = []; if (game.player?.position) l.push(game.player.position); for (const r of game.remotePlayers?.values?.() || []) { const p = r.position || r.object3d?.position; if (p) l.push(p); } return l; };

  async function spawnAll() {
    for (const { kind, home } of homes) {
      const t0 = performance.now();
      try {
        const saved = W.spawn.monster;
        W.spawn.monster = new THREE.Vector3(home[0], F.height(home[0], home[1]), home[1]);
        const m = await MAKERS[kind](game);
        W.spawn.monster = saved;
        m.kind = kind; m.islandHome = new THREE.Vector3(home[0], 0, home[1]);
        if (game.net?.connected && !game.net.isHost) m.remoteControlled = true; // the host simulates every boss
        game.monsters.push(m); state.loaded++;
        game.bootTimings[`boss_${kind}`] = Math.round(performance.now() - t0);
      } catch (e) { state.failed++; log.error('boss-spawn', `${kind} failed to spawn: ${e.message}`, e); }
      await new Promise((r) => requestAnimationFrame(() => r())); // one boss per frame batch
    }
  }

  // Monsters never stand in lava: push walkers back along the lava signed-distance gradient.
  const Ls = {};
  function keepOffLava(m) {
    const p = m.position; if (p.y - W.getHeight(p.x, p.z) > 3) return; // airborne
    const sd = F.lava(p.x, p.z, Ls).sd; if (sd >= 4) return;
    const e = 0.6, gx = F.lava(p.x + e, p.z, Ls).sd - F.lava(p.x - e, p.z, Ls).sd, gz = F.lava(p.x, p.z + e, Ls).sd - F.lava(p.x, p.z - e, Ls).sd;
    const gl = Math.hypot(gx, gz) || 1, k = Math.min(4 - sd, 2.5); p.x += (gx / gl) * k; p.z += (gz / gl) * k;
  }

  function update(dt, rawDt) {
    const hs = hunters();
    for (const m of game.monsters) {
      let d = Infinity; for (const h of hs) d = Math.min(d, Math.hypot(h.x - m.position.x, h.z - m.position.z));
      const on = state.active.has(m) ? d < AI_FAR : d < AI_NEAR;
      if (on) state.active.add(m); else state.active.delete(m);
      if (m.object3d) m.object3d.visible = on;
      if (!on) continue;
      m.update(dt, rawDt);
      if (!m.remoteControlled && m.state !== 'dead') keepOffLava(m);
    }
  }

  // HUD focus: an engaged boss within 150 m, else the nearest boss within 70 m.
  function focus() {
    const P = game.player?.position; if (!P) return null; let best = null, bd = Infinity;
    for (const m of game.monsters) { if (!m.aggro || m.state === 'dead') continue; const d = m.position.distanceTo(P); if (d < 150 && d < bd) { bd = d; best = m; } }
    if (best) return best;
    for (const m of game.monsters) { const d = m.position.distanceTo(P); if (d < 70 && d < bd) { bd = d; best = m; } }
    return best;
  }

  return { spawnAll, update, focus, state, homes };
}
