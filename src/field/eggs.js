// Taking eggs on the open island (user request: constructs need an egg or a juvenile's remains).
//   ecosystem nests (small fauna; fauna.js props) — the server's ecosystem checks the nest and loses one egg
//   big nests (dragons, Varkhul, Gorvath; broods.js) — fixed sites, refill on a timer per hunter
// E / touch TAKE beside a nest with eggs. The parents notice: guarding species turn on the hunter (fauna.eggTaken /
// broods.eggTaken). Nothing is decided here: the server action islandEgg grants the item (idempotent per egg id).
import { LINEAGE, LIFE, NEST_LIMITS } from '../shared/lifecycle.js';
import { t, itemName, monsterShort } from '../shared/i18n.js';

const REACH = 3.2;
export function createEggs(game, { expedition }) {
  const root = document.getElementById('ui-root') || document.body;
  const prompt = document.createElement('div'); prompt.className = 'cv-prompt'; root.appendChild(prompt);
  const feed = document.createElement('div'); feed.className = 'cv-picks'; root.appendChild(feed);
  const show = (txt, bad) => { const s = document.createElement('span'); s.textContent = txt; if (bad) s.className = 'cv-bad'; feed.appendChild(s); setTimeout(() => s.remove(), 2600); };
  const nonce = Math.random().toString(36).slice(2, 8); let n = 0, busy = false, lock = 0; const stats = { taken: 0, refused: 0 };
  function nearest(P) {
    let best = null, bd = REACH;
    for (const T of game.fauna?.props?.values?.() || []) for (const q of T.nests) { if (!(q.n > 0) || !LINEAGE[q.sp]) continue; const d = Math.hypot(q.x - P.x, q.z - P.z); if (d < bd) { bd = d; best = { kind: 'eco', q }; } }
    for (const N of game.broods?.nests || []) { if (!(N.eggs > 0)) continue; const d = Math.hypot(N.x - P.x, N.z - P.z); if (d < bd + 1.5) { bd = d; best = { kind: 'big', N }; } }
    return best;
  }
  const label = (tg) => (tg.kind === 'eco' ? monsterShort(tg.q.sp) : itemName(LIFE[tg.N.lineage].egg));
  async function take(tg) {
    lock = performance.now() + 900; game.events.emit('sfx', { name: 'click', position: game.player.position.clone(), volume: 0.6 });
    const iid = expedition?.iid || game.expeditionIid;
    if (!iid || !game.account?.loggedIn) { stats.refused++; show(t('cv.offline'), true); return; }
    const eid = `${nonce}.${++n}`;
    const body = tg.kind === 'eco' ? { iid, eid, src: 'eco', sp: tg.q.sp, x: +tg.q.x.toFixed(1), z: +tg.q.z.toFixed(1), nid: tg.q.id } : { iid, eid, src: 'big', nest: tg.N.id };
    busy = true; const r = await game.account.act('islandEgg', body); busy = false;
    if (r.ok) { stats.taken++; show(`+1 ${itemName(r.result.item)}`); if (tg.kind === 'eco') game.fauna?.eggTaken?.(tg.q); else game.broods?.eggTaken?.(tg.N); game.events.emit('egg:taken', { item: r.result.item }); }
    else { stats.refused++; if (r.error === 'empty' && tg.kind === 'eco') tg.q.n = 0; show(r.message || t('cv.failed'), true); }
  }
  const poll = game.input.poll.bind(game.input);
  game.input.poll = () => {
    const s = poll(); const P = game.player; if (!P || P.dead || P.ride?.active) { prompt.style.display = 'none'; return s; }
    const tg = nearest(P.position); const locked = performance.now() < lock;
    if (tg && !game.carving?.nearest?.(P.position)) { prompt.style.display = 'block'; prompt.textContent = t('egg.prompt', { k: game.input.touch?.enabled ? '' : 'E · ', w: label(tg) }); game.input.touch?.setAction(t('touch.egg')); }
    else if (prompt.style.display !== 'none') { prompt.style.display = 'none'; game.input.touch?.clearAction?.(t('touch.egg')); }
    if (s.interact && tg && !locked && !busy) { s.interact = false; if (P.weaponDrawn) show(t('qr.sheathe'), true); else take(tg); }
    return s;
  };
  return { nearest, stats, limits: NEST_LIMITS };
}
