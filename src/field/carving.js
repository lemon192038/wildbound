// Field carving on the open island (stage 5).
//  • Broken parts fall to the ground as glowing pieces you can pick up — only if YOU damaged that part.
//  • Carcasses can be carved a few times (per species) — only if you damaged the creature at all.
//  • Nothing is added to the inventory automatically: you walk up, press E / the touch CARVE button.
//  • Pieces and carcasses do not last: pieces crumble after a while, carcasses decay or get scavenged
//    (fauna.js); a carcass you have rights to is kept a little longer so you have time to carve it.
//  • Every carve is an idempotent server action (islandCarve) with a unique carve id, so a retry or a double tap
//    never grants twice. Without an expedition (offline / not logged in) carving shows why nothing is recorded.
import { ISLAND_LOOT } from '../shared/islandLoot.js';
import { SPECIES } from '../fauna/species.js';
import { hasBodyRight, hasPartRight } from '../core/rights.js';
import { t, itemName, partName } from '../shared/i18n.js';

const CSS = `.cv-prompt{position:fixed;left:50%;bottom:22%;transform:translateX(-50%);z-index:12;padding:.45em 1em;background:rgba(10,7,4,.72);border:1px solid rgba(217,182,115,.45);
color:#f2e6c8;font:600 clamp(13px,1.9vh,17px) 'Cinzel','Noto Serif JP',serif;letter-spacing:.06em;border-radius:4px;display:none;pointer-events:none;white-space:nowrap}
.cv-picks{position:fixed;right:max(16px,3vw);bottom:30%;z-index:12;display:flex;flex-direction:column;gap:.3em;align-items:flex-end;pointer-events:none}
.cv-picks span{padding:.3em .8em;background:rgba(10,7,4,.78);border-left:3px solid #d9b673;color:#f6e2aa;font:600 clamp(12px,1.7vh,15px) 'Noto Sans JP',system-ui,sans-serif;animation:cv-in .3s ease}
.cv-picks span.cv-bad{border-left-color:#e05a2a;color:#ffc7b0}
@keyframes cv-in{from{opacity:0;transform:translateX(20px)}}`;

const PIECE_LIFE = 150, REACH = 2.8;

export function createCarving(game, { expedition = null } = {}) {
  const { THREE, events } = game;
  if (!document.getElementById('cv-css')) { const s = document.createElement('style'); s.id = 'cv-css'; s.textContent = CSS; document.head.appendChild(s); }
  const root = document.getElementById('ui-root') || document.body;
  const prompt = document.createElement('div'); prompt.className = 'cv-prompt'; root.appendChild(prompt);
  const picks = document.createElement('div'); picks.className = 'cv-picks'; root.appendChild(picks);
  const nonce = Math.random().toString(36).slice(2, 8);
  const pieces = []; const stats = { carved: 0, pieces: 0, refused: 0 };
  const show = (txt, bad = false) => { const sp = document.createElement('span'); sp.textContent = txt; if (bad) sp.className = 'cv-bad'; picks.appendChild(sp); setTimeout(() => sp.remove(), 2800); };

  // what loot table a creature / boss uses
  const srcOf = (o) => {
    if (o.isFauna) { const k = Object.keys(SPECIES).find((key) => SPECIES[key] === o.S) || o.sp; return ISLAND_LOOT[k] ? k : null; }
    const id = o.islandId === 'flameUpper' ? 'flame' : o.islandId || o.kind; return ISLAND_LOOT[id] ? id : null;
  };
  const keyOf = (o) => (o.isFauna ? `${nonce}.${o.id}` : `${nonce}.B${o.islandId || o.kind}`);

  // ---- dropped pieces (one draw call)
  const pieceMesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.28, 0), new THREE.MeshStandardMaterial({ color: 0x3a2a1a, emissive: 0xffa040, emissiveIntensity: 1.4, roughness: 0.5 }), 32);
  pieceMesh.count = 0; pieceMesh.frustumCulled = false; pieceMesh.name = 'carve-pieces'; game.scene.add(pieceMesh);
  function dropPiece(o, part) {
    const src = srcOf(o); if (!src) return; const L = ISLAND_LOOT[src];
    if (!L.from && !L.parts?.[part]) return; // nothing to drop for this part
    const hb = (o.getHitboxes?.() || []).find((h) => h.part === part);
    const p = (hb?.sphere.center || o.position).clone(); p.x += (Math.random() - 0.5) * 1.5; p.z += (Math.random() - 0.5) * 1.5;
    p.y = game.world.getHeight(p.x, p.z) + 0.3;
    pieces.push({ o, src, part, pos: p, t: 0, right: hasPartRight(o, 'local', part), done: false }); stats.pieces++;
  }
  events.on('fauna:partBreak', (e) => e?.creature && dropPiece(e.creature, e.part));
  events.on('monster:partBreak', (e) => { if (e?.monster && !e.monster.isFauna) dropPiece(e.monster, typeof e.part === 'string' ? e.part : e.part?.name); });
  // carcasses you have rights to stay a little longer
  events.on('fauna:died', (e) => { const c = e?.creature; if (c && hasBodyRight(c, 'local') && !c.eaten) c.corpseT = Math.max(c.corpseT, 150); });

  // ---- nearest carvable thing in reach
  function bodyLeft(o) { const src = srcOf(o); if (!src) return 0; return ISLAND_LOOT[src].carves - (o.carvedLocal || 0); }
  function nearest(P) {
    let best = null, bd = REACH;
    for (const pc of pieces) { if (pc.done || !pc.right) continue; const d = pc.pos.distanceTo(P); if (d < bd) { bd = d; best = { kind: 'piece', pc }; } }
    for (const c of game.fauna?.list || []) {
      if (!c.dead || c.eaten || c.corpseT <= 0 || !hasBodyRight(c, 'local') || bodyLeft(c) <= 0) continue;
      const d = Math.hypot(c.pos.x - P.x, c.pos.z - P.z) - c.scale * 0.6; if (d < bd) { bd = d; best = { kind: 'body', o: c }; }
    }
    for (const m of game.monsters || []) {
      if (m.state !== 'dead' || !hasBodyRight(m, 'local') || bodyLeft(m) <= 0) continue;
      const d = Math.hypot(m.position.x - P.x, m.position.z - P.z) - 4; if (d < bd) { bd = d; best = { kind: 'body', o: m }; }
    }
    return best;
  }

  // ---- carving
  let lockUntil = 0, busy = false; // carving animation lock in REAL time (frame rate independent)
  async function carve(target) {
    let cid, src, part, label;
    if (target.kind === 'piece') { const pc = target.pc; pc.done = true; src = pc.src; part = pc.part; cid = `${keyOf(pc.o)}:p${part}`; label = 'piece'; }
    else { const o = target.o; const k = o.carvedLocal || 0; o.carvedLocal = k + 1; src = srcOf(o); part = 'body'; cid = `${keyOf(o)}:b${k}`; label = 'body'; }
    events.emit('sfx', { name: 'scrape', position: game.player.position.clone(), volume: 0.8 });
    if (!expedition?.iid || !game.account?.loggedIn) { stats.refused++; show(t('cv.offline'), true); return; }
    busy = true;
    const r = await game.account.act('islandCarve', { iid: expedition.iid, cid, src, part });
    busy = false;
    if (r.ok) { stats.carved++; show(`+1 ${itemName(r.result.item)}${r.result.dup ? ' ✓' : ''}`); events.emit('carve:done', { item: r.result.item, src, part }); return; }
    stats.refused++;
    if (r.error === 'network') { // let the hunter try again: the same carve id is idempotent on the server
      if (label === 'piece') target.pc.done = false; else target.o.carvedLocal--;
    }
    show(t('cv.err.' + r.error) !== 'cv.err.' + r.error ? t('cv.err.' + r.error) : r.message || t('cv.failed'), true);
  }

  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1);
  function update(dt) {
    let n = 0; const time = performance.now() / 1000;
    for (let i = pieces.length - 1; i >= 0; i--) {
      const pc = pieces[i]; pc.t += dt;
      if (pc.done || pc.t > PIECE_LIFE) { pieces.splice(i, 1); continue; }   // carved, or crumbled to nothing
      if (n < 32) { const fade = pc.t > PIECE_LIFE - 10 ? (PIECE_LIFE - pc.t) / 10 : 1; _q.setFromAxisAngle(_s.set(0, 1, 0), time * 1.5 + i); _s.setScalar(fade * (pc.right ? 1 : 0.6));
        _m.compose(pc.pos.clone().setY(pc.pos.y + Math.sin(time * 2 + i) * 0.08), _q, _s); pieceMesh.setMatrixAt(n++, _m); }
    }
    pieceMesh.count = n; pieceMesh.instanceMatrix.needsUpdate = true;
  }

  // input: E / touch CARVE when something carvable is in reach
  const poll = game.input.poll.bind(game.input);
  game.input.poll = () => {
    const s = poll(); const P = game.player;
    const now = performance.now(); const locked = now < lockUntil;
    const tg = P && !P.dead ? nearest(P.position) : null;
    if (tg) {
      const what = tg.kind === 'piece' ? `${t('pt.piece')}: ${partName(tg.pc.part)}` : `${tg.o.name} (${bodyLeft(tg.o)})`;
      prompt.style.display = 'block'; prompt.textContent = t('cv.prompt', { k: game.input.touch?.enabled ? '' : 'E · ', w: what });
      game.input.touch?.setAction(t('touch.carve'));
    } else if (prompt.style.display !== 'none') { prompt.style.display = 'none'; game.input.touch?.setAction(null); }
    if (locked) { s.move.x = s.move.y = 0; s.lightAttack = s.heavyAttack = s.dodge = false; }
    if (s.interact && tg && !locked && !busy) {
      s.interact = false;
      if (P.weaponDrawn) { show(t('qr.sheathe'), true); return s; }
      lockUntil = now + 900; carve(tg);
    }
    return s;
  };
  return { update, stats, pieces, nearest };
}
