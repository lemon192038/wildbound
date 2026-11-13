// Status ailments on the local hunter.
//   burn (fireblight): small 2.5 HP/s for 8 s, large 4.5 HP/s for 14 s. Each dodge roll smothers 4 s.
//   poison 'deadly': 6 HP/s for 16 s, enough to faint a careless hunter. Drinking a draught halves what remains.
//   blast (blastblight): after 9 s it detonates for 32 damage; each new exposure shortens the fuse; 3 dodge rolls shake it off.
// API: game.status.apply(kind, level), .clear(), .list() -> [{kind, level, t, dps}]
// Events: 'status:apply' {kind, level}, 'status:clear' {kind}
export function createStatus(game) {
  const DEF = {
    burn: { small: { t: 8, dps: 2.5 }, large: { t: 14, dps: 4.5 } },
    poison: { normal: { t: 14, dps: 2.5 }, deadly: { t: 16, dps: 6 } },
    // blastblight: no drain; when the timer runs out it detonates on the hunter (dodge rolls shake it off)
    blast: { normal: { t: 9, dps: 0, burst: 32 } },
  };
  const active = new Map(); // kind -> {kind, level, t, dps}
  let lastState = '', tick = 0;
  const api = {
    apply(kind, level) {
      const d = DEF[kind]?.[level]; if (!d || game.player?.dead) return;
      const cur = active.get(kind);
      // A stronger level replaces a weaker one; the same level refreshes to the longer duration.
      if (kind === 'blast' && cur) cur.t = Math.max(1.2, cur.t - 1.5); // more blight → it goes off sooner
      else if (!cur || d.dps >= cur.dps) active.set(kind, { kind, level, t: Math.max(cur?.dps === d.dps ? cur.t : 0, d.t), dps: d.dps, burst: d.burst });
      game.events.emit('status:apply', { kind, level });
    },
    clear(kind) { for (const k of kind ? [kind] : [...active.keys()]) if (active.delete(k)) game.events.emit('status:clear', { kind: k }); },
    list: () => [...active.values()],
    has: (kind) => active.has(kind),
    update(dt) {
      const P = game.player; if (!P || !active.size) { lastState = P?.state || ''; return; }
      if (P.dead) { api.clear(); return; }
      // Rolling smothers flames.
      if (P.state === 'dodge' && lastState !== 'dodge' && active.has('burn')) { const b = active.get('burn'); b.t -= 4; game.events.emit('sfx', { name: 'dodge', position: P.position.clone(), volume: 0.4 }); }
      if (P.state === 'dodge' && lastState !== 'dodge' && active.has('blast')) { const b = active.get('blast'); b.rolls = (b.rolls || 0) + 1; if (b.rolls >= 3) { active.delete('blast'); game.events.emit('status:clear', { kind: 'blast', shaken: true }); } }
      lastState = P.state;
      let drain = 0;
      for (const s of active.values()) { s.t -= dt; drain += s.dps * dt; }
      for (const s of [...active.values()]) if (s.t <= 0) {
        if (s.kind === 'blast') { // blight detonates on the hunter
          P.drain?.(s.burst || 30); const p = P.position.clone(); p.y += 1;
          game.world?.spawnDust?.(p, 1.2); game.events.emit('sfx', { name: 'slam', position: p, volume: 0.9 }); game.events.emit('camera:shake', { intensity: 0.6, duration: 0.4 });
          game.events.emit('status:blastburst', { position: p });
        }
        api.clear(s.kind);
      }
      if (drain > 0) P.drain?.(drain);
      // Small embers / toxic wisps on the hunter, a few per second.
      tick += dt;
      if (tick > 0.25) { tick = 0; if (active.has('burn')) game.world?.spawnDust?.(P.position.clone().setY(P.position.y + 1.1), 0.15); }
    },
  };
  game.events.on('item:used', (e) => { if (e?.kind === 'potion' && active.has('poison')) { const p = active.get('poison'); p.t *= 0.5; } });
  game.events.on('player:died', () => api.clear());
  game.events.on('quest:start', () => api.clear());
  return (game.status = api);
}
