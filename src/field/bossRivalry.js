// Big monsters among themselves (user request). Territories are vast and far apart (shared/territories.js), so meeting
// another big monster is rare — but when it happens, temperament decides (shared/temperament.js):
//   • intrusion: a big monster on the ground inside another's territory is challenged if the owner is territorial
//     enough and not out-matched (a bold owner takes on a stronger intruder; a cautious one only a weaker one)
//   • grudges: the valiant Varkhul attacks a Venom-fang dragon it comes across (not every time)
//   • a hunter who brings two big monsters together: each one weighs the hunter (the damage the hunter dealt it recently)
//     against the other monster (power × temperament × whose ground it is) and may turn on the other monster instead
//   • a fight ends when one is dead, they drift apart, or one breaks off (hp below its caution threshold) and retreats
// Mated pairs (Flame ♂ + Venom-fang ♀) never fight each other; a mate joins in to defend its partner.
// Blows are the bosses' own attacks: their attack hitboxes (CONTRACTS.md) against the opponent's hitboxes.
// Host / solo only (co-op clients see the host's bosses).
import { temperOf, powerOf } from '../shared/temperament.js';

const CHECK = 0.5, MEET = 75, APART = 130, HIT_GAP = 0.9, DMG_K = 32; // blow damage is in hunter-HP units: × DMG_K vs a monster
export function createBossRivalry(game, homes, isActive) {
  const W = game.world; const stats = { fights: 0, blows: 0, intrusions: 0, grudges: 0, playerDrawn: 0, retreats: 0, kills: 0, byPair: {} };
  const homeOf = (id) => homes.find((h) => h.id === id);
  const idOf = (m) => m.islandId || m.kind;
  const mateOf = (m) => homeOf(idOf(m))?.mate || null;
  const ground = (m) => m.position.y - W.getHeight(m.position.x, m.position.z) < 9;
  // whose territory is a point in (a mated male shares his female's ground)
  function ownerAt(x, z) { for (const h of homes) { if (h.mate && homeOf(h.mate) && h.kind === 'wyvern' && /^flame/.test(h.id)) continue; if (Math.hypot(x - h.home[0], z - h.home[1]) < h.range) return h.id; } return null; }
  const inOwnGround = (m) => { const o = ownerAt(m.position.x, m.position.z); return o === idOf(m) || o === mateOf(m); };
  let t = 0; const lastHit = new Map();
  function playerThreat(m) { // the hunter's recent pressure on this monster, 0.35 … ~2
    const th = (m.threat?.get?.('local') || 0) + (m.threat?.get?.(String(game.player?.id)) || 0);
    return 0.35 + Math.min(1.6, th / Math.max(1, m.maxHp) * 8) + (m.target === game.player ? 0.25 : 0);
  }
  function startFight(a, b, why) {
    if (a.rival === b) return; a.rival = b; a.aggro = true; a.rivalWhy = why; a.perception?.engage?.(b); a.wander = null;
    stats.fights++; stats[why] = (stats[why] || 0) + 1; const k = idOf(a) + '>' + idOf(b); stats.byPair[k] = (stats.byPair[k] || 0) + 1;
    game.events?.emit?.('boss:rival', { a, b, why });
    // the challenged one answers — or backs off if it is cautious and clearly out-matched
    if (b.rival !== a) {
      const tb = temperOf(idOf(b)); const pa = powerOf(a, idOf(a)), pb = powerOf(b, idOf(b));
      if (pb * (0.5 + tb.bold) >= pa * 0.6 || inOwnGround(b)) { b.rival = a; b.aggro = true; b.rivalWhy = 'answer'; b.perception?.engage?.(a); b.wander = null; }
      else retreat(b);
    }
    // a mate close by joins in on its partner's side
    for (const m of game.monsters) if (m !== a && m !== b && m.state !== 'dead' && idOf(m) === mateOf(b) && m.position.distanceTo(b.position) < 160 && !m.rival) { m.rival = a; m.aggro = true; m.rivalWhy = 'mate'; m.perception?.engage?.(a); m.wander = null; }
  }
  function endFight(m) { if (!m.rival) return; m.rival = null; m.rivalRef = null; m.rivalWhy = null; m.target = null; m.aggro = false; }
  function retreat(m) { endFight(m); m.retreatT = 25; stats.retreats++; const h = homeOf(idOf(m)); if (h) m.perception?.setHome?.({ x: h.home[0], y: 0, z: h.home[1], clone() { return this; } }); game.events?.emit?.('boss:retreat', { monster: m }); }

  function decide(a, b) {
    const ta = temperOf(idOf(a)), tb = temperOf(idOf(b));
    if (mateOf(a) === idOf(b) || (a.retreatT || 0) > 0) return null;
    const pa = powerOf(a, idOf(a)), pb = powerOf(b, idOf(b));
    // 1) a hunter brought them together: compare the hunter with the other monster
    if (a.aggro && !a.rival && (a.target === game.player || a.target?.local)) {
      const P = game.player?.position; if (P && P.distanceTo(b.position) < 70) {
        const monsterThreat = (pb / Math.max(0.2, pa)) * (b.aggro && b.target !== game.player ? 1.2 : 1) * (inOwnGround(a) ? 1.3 : 0.8) * (0.4 + ta.territorial * 0.6);
        if (monsterThreat * (0.4 + ta.aggression) > playerThreat(a)) return 'playerDrawn';
      }
      return null;
    }
    if (a.aggro || a.rival) return null;
    // 2) grudge: the valiant Varkhul and the Venom-fang dragons
    if ((ta.hates || []).includes(idOf(b)) && ground(b) && Math.random() < 0.35) return 'grudges';
    // 3) intrusion: b on the ground inside a's territory, a at home and up to the challenge
    const own = ownerAt(b.position.x, b.position.z);
    if (ground(b) && (own === idOf(a) || own === mateOf(a)) && ta.territorial >= 0.5 && pa * (0.4 + ta.bold) >= pb * 0.7 && Math.random() < ta.territorial * ta.aggression) return 'intrusions';
    return null;
  }

  // blows: a's active attack hitboxes against b's hitboxes (one blow per HIT_GAP per pair)
  function blows(a) {
    const b = a.rival; if (!b || b.state === 'dead' || !a.getAttackHitboxes) return;
    const key = idOf(a) + '>' + idOf(b); if (t - (lastHit.get(key) || -9) < HIT_GAP) return;
    const atk = a.getAttackHitboxes(); if (!atk.length) return; const hbs = b.getHitboxes?.() || [];
    for (const A of atk) for (const H of hbs) {
      if (A.sphere.center.distanceTo(H.sphere.center) > A.sphere.radius + H.sphere.radius) continue;
      lastHit.set(key, t); stats.blows++;
      const res = b.receiveHit?.({ damage: (A.damage || 20) * DMG_K, part: H.part, point: H.sphere.center.clone(), attackerId: 'boss:' + idOf(a), breakMul: 0.6, motion: 'monster' });
      game.events?.emit?.('boss:clash', { a, b, damage: res?.damage, part: H.part, point: H.sphere.center.clone() });
      if (b.state === 'dead' || b.hp <= 0) { stats.kills++; endFight(a); }
      return;
    }
  }
  let acc = 0;
  function update(dt) {
    if (game.net?.connected && !game.net.isHost) return; t += dt; acc += dt;
    const live = (game.monsters || []).filter((m) => m.state !== 'dead' && !m.remoteControlled && idOf(m) && homeOf(idOf(m)) && isActive(m));
    for (const m of live) { if (m.retreatT > 0) m.retreatT -= dt; if (m.rival) blows(m); }
    if (acc < CHECK) return; acc = 0;
    for (const m of live) { // keep or end fights
      const r = m.rival; if (!r) continue; const tm = temperOf(idOf(m));
      if (r.state === 'dead' || r.hp <= 0) { endFight(m); continue; }
      if (m.position.distanceTo(r.position) > APART) { endFight(m); continue; }
      if (m.hp < m.maxHp * (0.12 + tm.caution * 0.35)) { retreat(m); continue; } // breaks off a losing fight
    }
    for (const a of live) for (const b of live) {
      if (a === b || a.rival === b || a.position.distanceTo(b.position) > MEET) continue;
      const why = decide(a, b); if (why) startFight(a, b, why);
    }
  }
  return { update, stats, ownerAt, endFight };
}
