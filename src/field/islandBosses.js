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

import { TERRITORIES, territoryHomes } from '../shared/territories.js';
export { TERRITORIES, territoryHomes };
const MAKERS = { varkhul: createMonster, wyvern: createWyvern, brute: createBrute };
const AI_FAR = 260, AI_NEAR = 240; // hysteresis


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
        setResting(m, true); budgetLights(); // its lights take budget slots in the same frame (the light count never changes)
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

  // A far boss rests: it is not drawn and its AI is not stepped. It used to be hidden with .visible = false, which also
  // took its lights (fx flashes, glows) out of the scene: three.js then recompiled EVERY shader whenever a boss rested,
  // woke or spawned (the number of lights is part of each program) — a multi-second stall on iPad that can lose the
  // WebGL context (= the black screen while new ground streams in). Now:
  //   • a resting boss's meshes move to an unrendered layer (their own .visible flags stay the AI's business);
  //   • boss lights share a FIXED budget of point-light slots: awake bosses (nearest first) use real slots, the rest of
  //     the budget is filled by dark placeholder lights, so the scene's light count never changes.
  const REST_LAYER = 31, LIGHT_SLOTS = 8;
  const pad = []; for (let i = 0; i < LIGHT_SLOTS; i++) { const L = new THREE.PointLight(0x000000, 0, 1, 2); L.name = 'boss-light-pad'; L.userData.global = true; game.scene.add(L); pad.push(L); }
  const lightsOf = (m) => (m._lights ||= [m.object3d, ...(m.islandExtras || [])].flatMap((r) => { const l = []; r.traverse((o) => { if (o.isPointLight) l.push(o); }); return l; }));
  function budgetLights() {
    const P = game.player?.position; const d = (m) => (P ? Math.hypot(P.x - m.position.x, P.z - m.position.z) : 0);
    let used = 0;
    for (const m of [...game.monsters].filter((x) => x.object3d).sort((a, b) => (!!a._resting - !!b._resting) || d(a) - d(b))) {
      for (const L of lightsOf(m)) { const on = !m._resting && used < LIGHT_SLOTS; if (on) used++; L.visible = on; }
    }
    pad.forEach((L, i) => { L.visible = i < LIGHT_SLOTS - used; });
  }
  function setResting(m, rest) {
    m._resting = rest;
    for (const root of [m.object3d, ...(m.islandExtras || [])]) root.traverse((o) => {
      if (o.isLight) return;
      if (rest) { if (o.userData._restMask == null) o.userData._restMask = o.layers.mask; o.layers.set(REST_LAYER); }
      else if (o.userData._restMask != null) { o.layers.mask = o.userData._restMask; o.userData._restMask = null; }
    });
  }
  function update(dt, rawDt) {
    const hs = hunters(); let restChanged = false;
    for (const m of game.monsters) {
      // co-op client: the host moves its bosses even while this copy rests (a roaming Flame dragon flies its circuit), so
      // measure from where the HOST has it — this copy's own position froze when it went to rest (user report: the
      // dragon attacked one hunter while the other saw nothing and took no damage)
      const at = m.remoteControlled && m.netPos ? m.netPos : m.position;
      let d = Infinity; for (const h of hs) d = Math.min(d, Math.hypot(h.x - at.x, h.z - at.z));
      const on = state.active.has(m) ? d < AI_FAR : d < AI_NEAR;
      if (on) state.active.add(m); else state.active.delete(m);
      if (m.object3d && !!m._resting === on) {
        if (on && m.remoteControlled && m.netPos) { m.position.x = m.netPos.x; m.position.z = m.netPos.z; } // wake where the host has it, not slide in from far away
        setResting(m, !on); restChanged = true;
      }
      if (!on) { if (m.remoteControlled && m.netPos) { m.position.x = m.netPos.x; m.position.z = m.netPos.z; } continue; } // a resting copy still stands where the host has it (map pins, distance checks)
      m.update(dt, rawDt);
      if (!m.remoteControlled && m.state !== 'dead') keepOffLava(m);
    }
    if (restChanged) budgetLights();
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
