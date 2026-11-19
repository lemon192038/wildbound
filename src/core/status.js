// Status ailments on the local hunter.
//  Damage over time
//   burn (fireblight): small 2.5 HP/s 8 s · medium 3.5 HP/s 11 s · large 4.5 HP/s 14 s (+ attack down). Each dodge roll smothers 4 s.
//   poison: normal / deadly / lethal (Cindaryl; + heal down). Drinking a draught halves what remains (lethal ×0.85).
//   blast (blastblight): after 9 s it detonates for 32 damage; each new exposure shortens the fuse; 3 dodge rolls shake it off.
//  Control (src/player/player.js reads them)
//   sleep: the hunter lies down until the timer ends or a hit wakes them (the waking hit deals ×1.5).
//   stun short / long: dazed on the spot (mashing movement / dodge shakes it off faster).
//   flinch short / long: an instant stagger, not kept in the list.
//   confusion short / long: movement directions are scrambled.
//   silence: no tackle, no True Charge and no parry.
//  Debuffs (multipliers via mods()): atkDown, defDown, speedDown, atkSpeedDown, critDown, critDmgDown, elemAtkDown,
//   elemResDown, healDown, stamRegenDown.
// Rules
//   • the same ailment never stacks: a stronger level replaces a weaker one, the same level refreshes to the longer timer
//   • sleep and stun leave a short immunity after they end (no stun-locking)
//   • wards (consumables) block an ailment for a while; armour skills shorten / weaken / block some
// API: game.status.apply(kind, level), .clear(kind?), .cure(kinds[]), .list(), .has(kind), .mods(), .blocks()
// Events: 'status:apply' {kind, level, t}, 'status:clear' {kind}
export const DEF = {
  burn: { small: { t: 8, dps: 2.5 }, medium: { t: 11, dps: 3.5 }, large: { t: 14, dps: 4.5, also: ['atkDown', 'normal'] } },
  poison: { normal: { t: 14, dps: 2.5 }, deadly: { t: 16, dps: 6 }, lethal: { t: 24, dps: 8, also: ['healDown', 'normal'] } },
  blast: { normal: { t: 9, dps: 0, burst: 32 } },
  sleep: { normal: { t: 7, immune: 20, rank: 1 } },
  stun: { short: { t: 1.6, immune: 6, rank: 1 }, long: { t: 3.2, immune: 8, rank: 2 } },
  flinch: { short: { t: 0.55, instant: true, rank: 1 }, long: { t: 1.3, instant: true, rank: 2 } },
  confusion: { short: { t: 6, rank: 1 }, long: { t: 12, rank: 2 } },
  silence: { normal: { t: 10, rank: 1 } },
};
// debuffs: one level each, `mag` is the multiplier (or the affinity subtraction for critDown)
const DEBUFF = { atkDown: 0.85, defDown: 0.8, speedDown: 0.75, atkSpeedDown: 0.8, critDown: 20, critDmgDown: 0.8, elemAtkDown: 0.75, elemResDown: 0.75, healDown: 0.5, stamRegenDown: 0.5 };
for (const k in DEBUFF) DEF[k] = { normal: { t: 25, mag: DEBUFF[k], rank: 1, debuff: true } };
export const AILMENTS = Object.keys(DEF);

export function createStatus(game) {
  const active = new Map(); // kind -> {kind, level, t, dps, ...}
  const immune = {}; // kind -> seconds of post-ailment immunity
  let lastState = '', tick = 0;
  const strength = (d) => (d.dps != null && d.dps > 0 ? d.dps : d.rank || 0);
  const api = {
    DEF,
    apply(kind, level = 'normal') {
      let d = DEF[kind]?.[level]; if (!d || game.player?.dead) return false;
      const sk = game.player?.gear?.skills || {};
      if (api.wards[kind] > 0 || immune[kind] > 0) return false;
      if (game.player?.ride?.immune?.(kind)) return false; // taming traits: heatproof / lava swimmer / poisonproof constructs
      if (kind === 'burn' && sk.heatward) d = { ...d, t: d.t * (1 - 0.3 * sk.heatward) };
      if (kind === 'poison') { if (sk.antivenom >= 3) return false; if (sk.antivenom) d = { ...d, dps: d.dps * (1 - 0.3 * sk.antivenom) }; }
      if (kind === 'blast') { if (sk.blastward >= 3) return false; if (sk.blastward) d = { ...d, t: d.t + 3 * sk.blastward }; }
      if ((kind === 'stun' || kind === 'flinch') && sk.steadfast) d = { ...d, t: d.t * Math.max(0.2, 1 - 0.3 * sk.steadfast) };
      if (d.instant) { game.events.emit('status:apply', { kind, level, t: d.t, instant: true }); return true; }
      const cur = active.get(kind);
      if (kind === 'blast' && cur) cur.t = Math.max(1.2, cur.t - 1.5); // more blight → it goes off sooner
      else if (!cur || strength(d) > strength(cur)) active.set(kind, { kind, level, t: d.t, dur: d.t, dps: d.dps || 0, burst: d.burst, mag: d.mag, debuff: !!d.debuff, immune: d.immune || 0 });
      else if (strength(d) === strength(cur)) cur.t = Math.max(cur.t, d.t); // same level: refresh, never stack
      else return false; // weaker: ignored
      game.events.emit('status:apply', { kind, level, t: active.get(kind)?.t });
      if (d.also) api.apply(...d.also);
      return true;
    },
    clear(kind) {
      for (const k of kind ? [kind] : [...active.keys()]) {
        const s = active.get(k); if (!s) continue; active.delete(k);
        if (s.immune) immune[k] = s.immune;
        game.events.emit('status:clear', { kind: k });
      }
    },
    // cure a list of kinds ('debuffs' = every stat-down)
    cure(kinds) {
      const set = new Set(kinds); let n = 0;
      for (const s of [...active.values()]) if (set.has(s.kind) || (s.debuff && set.has('debuffs')) || set.has('all')) { api.clear(s.kind); n++; }
      return n;
    },
    list: () => [...active.values()],
    wards: {}, // kind → seconds of immunity (e.g. Frostfern Salve wards burns)
    ward(kind, sec) { api.wards[kind] = Math.max(api.wards[kind] || 0, sec); api.clear(kind); },
    has: (kind) => active.has(kind),
    get: (kind) => active.get(kind),
    immune,
    // multipliers for the player (1 = unaffected)
    mods() {
      const m = (k) => active.get(k)?.mag ?? 1;
      return { atk: m('atkDown'), def: m('defDown'), speed: m('speedDown'), atkSpeed: m('atkSpeedDown'), affinity: -(active.get('critDown')?.mag || 0),
        critDmg: m('critDmgDown'), elem: m('elemAtkDown'), elemRes: m('elemResDown'), heal: m('healDown'), stamRegen: m('stamRegenDown') };
    },
    blocks() {
      return { asleep: active.has('sleep'), stunned: active.has('stun'), confused: active.get('confusion')?.level || null, silenced: active.has('silence') };
    },
    // shorten a control ailment (mashing out of a stun / waking up)
    shake(kind, sec) { const s = active.get(kind); if (s) { s.t -= sec; if (s.t <= 0) api.clear(kind); } },
    update(dt) {
      for (const k in api.wards) api.wards[k] = Math.max(0, api.wards[k] - dt);
      for (const k in immune) immune[k] = Math.max(0, immune[k] - dt);
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
  game.events.on('item:used', (e) => { if (e?.kind === 'potion' && active.has('poison')) { const p = active.get('poison'); p.t *= p.level === 'lethal' ? 0.85 : 0.5; } });
  game.events.on('player:died', () => { api.clear(); for (const k in immune) immune[k] = 0; });
  game.events.on('quest:start', () => api.clear());
  return (game.status = api);
}
