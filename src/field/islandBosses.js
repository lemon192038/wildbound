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
import { t } from '../shared/i18n.js';

export const TERRITORIES = [
  { kind: 'varkhul', near: [150, 400], site: {} },
  { kind: 'wyvern', near: [560, -80], site: { flatR: 18 } },
  { kind: 'brute', near: [-120, -560], site: { maxSlope: 0.3 } },
  // Dragons of one species (design document): Flame Dragons ♂ (lower / upper individuals) and Venom-fang Dragons ♀,
  // each solitary with its own territory; Cindaryl is the special female (Cindral, above, is the special male).
  // HP values are ASSUMED (the design document gives none): lower < upper < Cindral (19,000) ≈ Cindaryl.
  { kind: 'wyvern', id: 'flame', near: [-420, -380], site: { flatR: 18, maxSlope: 0.3 }, opts: { variant: 'flame', scale: 0.78, hp: 11000, nameKey: 'dragon.flame' } },
  { kind: 'wyvern', id: 'flameUpper', near: [250, -650], site: { flatR: 18, maxSlope: 0.3 }, opts: { variant: 'flame', scale: 0.92, hp: 15500, nameKey: 'dragon.flameUpper' } },
  { kind: 'wyvern', id: 'venom', near: [-380, 300], site: { flatR: 16, maxSlope: 0.3 }, opts: { variant: 'venom', scale: 0.85, hp: 13000, nameKey: 'dragon.venom' } },
  // more dragons (user request: more monsters): a second Venom-fang female holding a southern territory and the Flame
  // male that hunts for her (the species' pairs: a ground-guarding ♀ + a sky-hunting ♂ — src/field/dragonLife.js)
  { kind: 'wyvern', id: 'venom2', near: [420, 380], site: { flatR: 16, maxSlope: 0.3 }, opts: { variant: 'venom', scale: 0.82, hp: 12500, nameKey: 'dragon.venom' } },
  { kind: 'wyvern', id: 'flameRoam', near: [-180, 560], site: { flatR: 18, maxSlope: 0.3 }, opts: { variant: 'flame', scale: 0.8, hp: 11500, nameKey: 'dragon.flame' } },
  { kind: 'wyvern', id: 'cindaryl', near: [-660, -260], site: { flatR: 18, maxSlope: 0.3 }, opts: { variant: 'cindaryl', scale: 1.02, hp: 19500, nameKey: 'dragon.cindaryl', epithetKey: 'dragon.cindaryl.title' } },
];
const MAKERS = { varkhul: createMonster, wyvern: createWyvern, brute: createBrute };
const AI_FAR = 260, AI_NEAR = 240; // hysteresis

export function territoryHomes(F) { return TERRITORIES.map((T) => ({ kind: T.kind, id: T.id || T.kind, opts: T.opts, home: F.findSite(T.near[0], T.near[1], T.site) })); }

export function createIslandBosses(game, homes) {
  const { THREE } = game; const W = game.world, F = W.island;
  const state = { loaded: 0, failed: 0, active: new Set() };
  const hunters = () => { const l = []; if (game.player?.position && !game.player.unseen) l.push(game.player.position); for (const r of game.remotePlayers?.values?.() || []) { const p = r.position || r.object3d?.position; if (p) l.push(p); } return l; };

  async function spawnAll() {
    for (const { kind, id, opts, home } of homes) {
      const t0 = performance.now();
      try {
        const saved = W.spawn.monster;
        W.spawn.monster = new THREE.Vector3(home[0], F.height(home[0], home[1]), home[1]);
        const before = new Set(game.scene.children);
        const o = opts ? { ...opts, name: opts.nameKey ? t(opts.nameKey) : undefined, epithet: opts.epithetKey ? t(opts.epithetKey) : undefined } : undefined;
        const m = await MAKERS[kind](game, o);
        W.spawn.monster = saved;
        // everything this boss added at the scene root (its lights, particle/fx systems) rests with it when far away
        m.islandExtras = game.scene.children.filter((o) => !before.has(o) && o !== m.object3d && !o.userData.global); // global: added meanwhile by other systems (construct mount, camp, gathering)
        m.kind = kind; m.islandId = id; m.islandHome = new THREE.Vector3(home[0], 0, home[1]);
        if (game.net?.connected && !game.net.isHost) m.remoteControlled = true; // the host simulates every boss
        game.monsters.push(m); state.loaded++;
        game.bootTimings[`boss_${id}`] = Math.round(performance.now() - t0);
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
      if (m.object3d && m.object3d.visible !== on) { m.object3d.visible = on; for (const o of m.islandExtras || []) o.visible = on; }
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
    for (const c of game.fauna?.engaged?.() || []) { const d = c.position.distanceTo(P); if (d < 40 && d < bd) { bd = d; best = c; } } // a lizard / lava snake fighting you
    if (best) return best;
    for (const m of game.monsters) { const d = m.position.distanceTo(P); if (d < 70 && d < bd) { bd = d; best = m; } }
    return best;
  }

  return { spawnAll, update, focus, state, homes, isActive: (m) => state.active.has(m) };
}
