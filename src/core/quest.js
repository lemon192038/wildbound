// Quest loop: boss slain (or timer runs out) → quest complete/failed → after a delay a fresh boss
// of the same quarry respawns and the quest restarts.
//   game.quest = { gen, state: 'active'|'complete'|'failed', respawnAt (game seconds) | null, delay }
//   events out: 'quest:complete' {monster, gen}, 'quest:failed' {gen}, 'quest:start' {monster, gen}
// Co-op: every monster snapshot carries the quest generation `g`. A client that sees a newer
// generation from the host respawns at once, and stale snapshots (an older g) are ignored, so
// the host's dead-boss state can never kill a freshly respawned boss.
export function createQuest(game, makeMonster) {
  const delay = Math.max(5, Math.min(600, +(game.params.get('respawn') || 30))); // seconds; ?respawn=N
  const q = (game.quest = { gen: 0, state: 'active', respawnAt: null, delay });
  let clock = 0;

  const wrap = (m) => {
    const ser = m.serialize?.bind(m), app = m.applyRemote?.bind(m);
    if (ser) m.serialize = () => ({ ...ser(), g: q.gen });
    if (app) m.applyRemote = (st) => {
      const g = Number.isInteger(st?.g) ? st.g : q.gen;
      if (g > q.gen) { respawn(g); return; } // host already started the next hunt
      if (g < q.gen) return; // stale snapshot from the previous hunt
      app(st);
    };
    return m;
  };
  game.monsters.forEach(wrap);

  const finish = (state, monster) => {
    if (q.state !== 'active') return;
    q.state = state; q.respawnAt = clock + q.delay;
    if (state === 'complete') game.events.emit('quest:complete', { monster, gen: q.gen });
  };
  game.events.on('monster:died', (e) => finish('complete', e?.monster));
  game.events.on('quest:failed', () => finish('failed'));

  let respawning = false;
  async function respawn(gen = q.gen + 1) {
    if (respawning) return; respawning = true;
    try {
      for (const old of game.monsters.splice(0)) { old.object3d?.removeFromParent(); old.dispose?.(); }
      if (game.player) game.player.lockTarget = null;
      const m = wrap(await makeMonster(game));
      m.remoteControlled = !!(game.net?.connected && !game.net?.isHost);
      game.monsters.push(m);
      q.gen = gen; q.state = 'active'; q.respawnAt = null;
      const P = game.player; // fresh supplies for the new hunt
      if (P) { P.hp = P.maxHp; if ('redHp' in P) P.redHp = P.maxHp; P.stamina = P.maxStamina; if ('sharpness' in P) P.sharpness = 1; if ('potions' in P) P.potions = 10; }
      game.events.emit('quest:start', { monster: m, gen: q.gen });
    } catch (e) { console.error('[quest] respawn failed', e); q.respawnAt = clock + 5; } finally { respawning = false; }
  }
  q.respawnNow = () => respawn();

  return {
    update(dt) {
      clock += dt; q.clock = clock;
      // Only the authority (solo, or the co-op host) decides when to respawn; others follow its generation.
      const authority = !game.net?.connected || game.net?.isHost;
      if (q.respawnAt != null && clock >= q.respawnAt && authority) respawn();
      // A non-host whose host vanished mid-countdown still respawns after a grace period.
      if (q.respawnAt != null && !authority && clock >= q.respawnAt + 10) respawn();
    },
  };
}
