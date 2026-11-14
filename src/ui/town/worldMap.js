// Interactive world map (the captain's sea chart). A persistent DOM component mounted inside the dock window:
//   const map = createWorldMap(ctx) → { el, mount(host), refresh(), select(destId), prewarm() }
// - Art: procedural chart painted once (worldMapArt.js), shown on a transformed stage (pan/zoom with inertia,
//   wheel, pinch, double-tap, +/− buttons; clamped to the chart).
// - Overlay: screen-sized canvas for the animated sea route and selection glow; DOM markers that keep their
//   screen size (≥ 56 px touch targets) for Port Halvane and every DESTINATIONS entry.
// - Detail drawer: boss field-guide (portrait, danger/HR, weaknesses, recommended gear, traits/attacks,
//   materials, rewards) and the departure flow (quest vs free expedition → confirm → cinematic → field).
import './worldMap.css';
import { DESTINATIONS, MONSTER_INFO, MONSTERS, QUESTS, ITEMS, WEAPONS, ARMOR, destForMonster } from '../../shared/gamedata.js';
import { t, isJa, destName, destDesc, destRegion, monsterName, monsterShort, questName, itemName, elementName, partName, weaponName, armorSetName, skillName, serverMsg } from '../../shared/i18n.js';
import { esc, fmt, stars, coins, rarityTag, equipName, clock } from './common.js';
import { itemIcon, glyph, ELEMENT, rarityColor } from './icons.js';
import { paintWorldMap, MAP_W, MAP_H, GEO, routeFor, catmull, drawShip } from './worldMapArt.js';

const BASE = (import.meta.env && import.meta.env.BASE_URL) || './';
export const portraitUrl = (m) => `${BASE}portraits/${m}.webp`;
const ELEMS = ['water', 'ice', 'thunder', 'dragon', 'blast', 'fire'];
const mark = (v) => (v >= 1.3 ? ['◎', 'x3'] : v >= 1.15 ? ['○', 'x2'] : v >= 0.95 ? ['△', 'x1'] : ['×', 'x0']);
const miText = (m, f) => { const k = `mi.${m}.${f}`; const v = t(k); return v === k ? null : v; };
const miList = (m, f) => miText(m, f)?.split('|') || MONSTER_INFO[m]?.[f] || [];
const miDesc = (m) => miText(m, 'desc') || MONSTER_INFO[m]?.desc || '';
const miSize = (m) => miText(m, 'size') || MONSTER_INFO[m]?.size || '';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export function fieldUrl(param, value) {
  const keep = new URLSearchParams(location.search); const q = new URLSearchParams();
  q.set('mode', 'field'); q.set(param, value);
  for (const k of ['low', 'hq', 'touch', 'lang']) if (keep.has(k)) q.set(k, keep.get(k));
  return `${location.pathname}?${q.toString()}`;
}
// Accepted quest that can sail (not a delivery) → its destination id.
export function questDest(s) { const a = s?.quests?.active; const q = a && QUESTS[a.qid]; return q && q.type !== 'deliver' && q.monster ? destForMonster(q.monster) : null; }

// ------------------------------------------------------------------ art cache (painted once per language)
let artPromise = null;
function art(game) {
  if (artPromise) return artPromise;
  const ja = isJa();
  const serif = "Cinzel, 'Trajan Pro', Georgia, serif", serifJa = ja ? "'Noto Serif JP', 'Hiragino Mincho ProN', 'Yu Mincho', serif" : '';
  const labels = {
    title: t('wm.title'), subtitle: t('wm.subtitle'), reach: destRegion('ember_foothills'), volcano: t('wm.volcano'),
    regions: Object.fromEntries(GEO.regions.map((r) => [r.id, t('wm.r.' + r.id)])), seas: Object.fromEntries(GEO.seas.map((s) => [s.id, t('wm.sea.' + s.id)])),
    ruins: [t('wm.ruin.0'), t('wm.ruin.1'), t('wm.ruin.2')],
  };
  const fonts = (async () => {
    if (!document.fonts?.load) return;
    const wait = (p) => Promise.race([p, new Promise((r) => setTimeout(r, 2500))]);
    try { await wait(Promise.all([document.fonts.load('700 38px Cinzel'), document.fonts.load('900 38px Cinzel'), ja ? document.fonts.load(`700 38px 'Noto Serif JP'`, labels.title + labels.reach) : null])); } catch { /* fall back to serif */ }
  })();
  const scale = game?.params?.has('low') ? 0.8 : 1;
  artPromise = fonts.then(() => paintWorldMap({ scale, labels, serif, serifJa })).catch((e) => { artPromise = null; throw e; });
  return artPromise;
}

export function createWorldMap(ctx) {
  const st = () => ctx.state();
  const touch = !!ctx.game?.input?.touch;
  const root = document.createElement('div'); root.className = 'wm' + (touch ? ' wm-touch' : '');
  root.innerHTML = `
    <div class="wm-view" aria-label="${esc(t('wm.title'))}">
      <div class="wm-stage"></div>
      <canvas class="wm-fx"></canvas>
      <div class="wm-pins"></div>
      <div class="wm-wait"><span class="tw-spin"></span><p>${esc(t('wm.charting'))}</p></div>
    </div>
    <div class="wm-ctrl" role="group" aria-label="${esc(t('wm.zoom'))}">
      <button class="wm-cb" data-z="in" aria-label="${esc(t('wm.zoomIn'))}">+</button><button class="wm-cb" data-z="out" aria-label="${esc(t('wm.zoomOut'))}">−</button>
      <button class="wm-cb wm-cb-fit" data-z="fit" aria-label="${esc(t('wm.fit'))}"><svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" stroke-width="2"/></svg></button>
    </div>
    <aside class="wm-ledger tw-frame"></aside>
    <aside class="wm-detail" aria-live="polite"></aside>
    <div class="wm-hint">${esc(touch ? t('wm.hintTouch') : t('wm.hintMouse'))}</div>`;
  const view = root.querySelector('.wm-view'), stage = root.querySelector('.wm-stage'), fx = root.querySelector('.wm-fx'), pins = root.querySelector('.wm-pins');
  const ledger = root.querySelector('.wm-ledger'), detail = root.querySelector('.wm-detail'), waitEl = root.querySelector('.wm-wait');
  const fxg = fx.getContext('2d');
  let artCanvas = null, selected = null, hover = null, mode = {}; let busy = false;
  // view transform: screen = map * s + (tx, ty)
  const V = { s: 0.5, tx: 0, ty: 0, vx: 0, vy: 0, w: 1, h: 1, dirty: true, anim: null, fitted: false };

  // ---------------------------------------------------------------- markers
  const destIds = Object.keys(DESTINATIONS);
  pins.innerHTML = `<div class="wm-port" style="--x:${GEO.port.x};--y:${GEO.port.y}"><span class="wm-port-ico">${anchorSvg()}</span><b>${esc(t('wm.port'))}</b><small>${esc(t('wm.home'))}</small></div>`
    + GEO.regions.filter((r) => !r.home).map((r) => `<div class="wm-lock" style="--x:${r.x};--y:${r.y + 0.045}">${glyph('lock')}<span>${esc(t('wm.uncharted'))}</span></div>`).join('')
    + destIds.map((id) => { const D = DESTINATIONS[id]; return `<button class="wm-pin" data-dest="${id}" style="--x:${D.map.x};--y:${D.map.y}" aria-label="${esc(monsterName(D.monster) + ' — ' + destName(id))}">
        <span class="wm-pin-medal"><img src="${portraitUrl(D.monster)}" alt="" draggable="false" onerror="this.remove()"><i class="wm-pin-sigil">${esc(monsterShort(D.monster).slice(0, 1))}</i></span>
        <span class="wm-pin-plate"><b>${esc(monsterShort(D.monster))}</b><small>${esc(destName(id))}</small><em class="wm-pin-danger">${'◆'.repeat(Math.min(7, D.danger))}</em></span>
        <span class="wm-pin-badge"></span></button>`; }).join('');
  const pinEls = [...pins.children];

  // ---------------------------------------------------------------- transform helpers
  const minS = () => Math.min(V.w / MAP_W, V.h / MAP_H);
  const maxS = () => Math.max(minS() * 4, 1.4);
  function clampView() {
    V.s = clamp(V.s, minS(), maxS());
    const mw = MAP_W * V.s, mh = MAP_H * V.s;
    V.tx = mw <= V.w ? (V.w - mw) / 2 : clamp(V.tx, V.w - mw, 0);
    V.ty = mh <= V.h ? (V.h - mh) / 2 : clamp(V.ty, V.h - mh, 0);
  }
  function zoomAt(ns, sx, sy) { ns = clamp(ns, minS(), maxS()); const mx = (sx - V.tx) / V.s, my = (sy - V.ty) / V.s; V.s = ns; V.tx = sx - mx * ns; V.ty = sy - my * ns; clampView(); V.dirty = true; }
  function animateTo(ns, mx, my, sx = V.w / 2, sy = V.h / 2, dur = 420) { // put map point (mx,my) at screen (sx,sy) with scale ns
    ns = clamp(ns, minS(), maxS());
    const from = { s: V.s, tx: V.tx, ty: V.ty }; const save = { ...from }; V.s = ns; V.tx = sx - mx * ns; V.ty = sy - my * ns; clampView();
    const to = { s: V.s, tx: V.tx, ty: V.ty }; Object.assign(V, save); V.vx = V.vy = 0; V.anim = { from, to, t0: performance.now(), dur };
  }
  const detailW = () => (detail.classList.contains('on') ? detail.offsetWidth : 0);
  const ledgerW = () => (ledger.offsetParent && !ledger.classList.contains('min') ? ledger.offsetWidth + 16 : 0);
  function fit(animate = true) {
    const s = minS() * 1.08; const cx = MAP_W * 0.5, cy = MAP_H * 0.52;
    if (animate) animateTo(s, cx, cy); else { V.s = s; V.tx = V.w / 2 - cx * s; V.ty = V.h / 2 - cy * s; clampView(); V.dirty = true; }
  }
  function focusDest(id, zoom) {
    const D = DESTINATIONS[id]; const s = zoom ? Math.max(V.s, minS() * 2) : V.s;
    const free = V.w - detailW(); animateTo(s, D.map.x * MAP_W - 120, D.map.y * MAP_H, free / 2, V.h * 0.52);
  }

  // ---------------------------------------------------------------- input: drag / inertia / pinch / wheel / double-tap
  const ptrs = new Map(); let drag = null, pinch = null, moved = 0, lastTap = { t: 0, x: 0, y: 0 }, lastMove = 0;
  const local = (e) => { const r = view.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  view.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return; const [x, y] = local(e); ptrs.set(e.pointerId, { x, y }); V.anim = null; V.vx = V.vy = 0;
    if (ptrs.size === 1) { drag = { x, y, t: performance.now() }; moved = 0; } else if (ptrs.size === 2) startPinch();
    e.preventDefault();
  });
  function startPinch() { const [a, b] = [...ptrs.values()]; const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, s: V.s, mx: (mx - V.tx) / V.s, my: (my - V.ty) / V.s }; drag = null; moved = 99; }
  addEventListener('pointermove', (e) => {
    const p = ptrs.get(e.pointerId); if (!p) { if (!touch && root.isConnected) hoverAt(e); return; }
    const [x, y] = local(e); const dx = x - p.x, dy = y - p.y; p.x = x; p.y = y;
    if (pinch && ptrs.size >= 2) {
      const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y) || 1; const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      V.s = clamp(pinch.s * (d / pinch.d), minS(), maxS()); V.tx = mx - pinch.mx * V.s; V.ty = my - pinch.my * V.s; clampView(); V.dirty = true; return;
    }
    if (!drag) return; moved += Math.abs(dx) + Math.abs(dy);
    if (moved > 6) root.classList.add('dragging');
    V.tx += dx; V.ty += dy; clampView(); V.dirty = true;
    const now = performance.now(), dt = Math.max(1, now - lastMove); lastMove = now; V.vx = V.vx * 0.6 + (dx / dt) * 16 * 0.4; V.vy = V.vy * 0.6 + (dy / dt) * 16 * 0.4;
  }, { passive: true });
  const up = (e) => {
    const p = ptrs.get(e.pointerId); if (!p) return; ptrs.delete(e.pointerId); root.classList.remove('dragging');
    if (ptrs.size === 1 && pinch) { pinch = null; const [q] = [...ptrs.values()]; drag = { x: q.x, y: q.y }; return; }
    if (ptrs.size) return; pinch = null;
    if (performance.now() - lastMove > 80) V.vx = V.vy = 0;
    if (moved <= 6 && drag && e.type === 'pointerup') {
      const onPin = e.target.closest?.('.wm-pin'); const now = performance.now();
      if (!onPin && now - lastTap.t < 320 && Math.hypot(p.x - lastTap.x, p.y - lastTap.y) < 36) { // double-tap → zoom
        lastTap.t = 0; const ns = V.s * 2 > maxS() * 0.98 ? minS() * 1.08 : V.s * 2; animateTo(ns, (p.x - V.tx) / V.s, (p.y - V.ty) / V.s, p.x, p.y, 320);
      } else { lastTap = { t: now, x: p.x, y: p.y }; if (!onPin && e.target.closest?.('.wm-view')) singleTap(); }
    }
    drag = null;
  };
  addEventListener('pointerup', up); addEventListener('pointercancel', up);
  root.addEventListener('click', (e) => { if (moved > 6 && e.target.closest('.wm-view')) { e.stopPropagation(); e.preventDefault(); } }, true);
  view.addEventListener('wheel', (e) => { e.preventDefault(); const [x, y] = local(e); V.anim = null; zoomAt(V.s * Math.exp(-clamp(e.deltaY, -120, 120) * 0.0022), x, y); }, { passive: false });
  view.addEventListener('dragstart', (e) => e.preventDefault());
  let tapTimer = 0;
  function singleTap() { clearTimeout(tapTimer); tapTimer = setTimeout(() => { if (lastTap.t && selected) select(null); }, 330); }
  function hoverAt(e) { const pin = e.target.closest?.('.wm-pin'); const id = pin?.dataset.dest || null; if (id !== hover) { hover = id; } }
  root.querySelector('.wm-ctrl').addEventListener('click', (e) => {
    const b = e.target.closest('[data-z]'); if (!b) return; const z = b.dataset.z;
    if (z === 'fit') return fit();
    const ns = V.s * (z === 'in' ? 1.6 : 1 / 1.6); animateTo(ns, (V.w / 2 - V.tx) / V.s, (V.h / 2 - V.ty) / V.s);
  });
  pins.addEventListener('click', (e) => { const pin = e.target.closest('.wm-pin'); if (!pin) return; clearTimeout(tapTimer); lastTap.t = 0; select(pin.dataset.dest === selected ? selected : pin.dataset.dest, true); });
  pins.addEventListener('pointerover', (e) => { const pin = e.target.closest('.wm-pin'); if (pin) hover = pin.dataset.dest; });
  pins.addEventListener('pointerout', (e) => { const pin = e.target.closest('.wm-pin'); if (pin && !pin.contains(e.relatedTarget)) hover = null; });

  // ---------------------------------------------------------------- frame loop
  let raf = 0, detachedSince = 0;
  function frame(now) {
    raf = 0;
    if (!root.isConnected) { detachedSince ||= now; if (now - detachedSince > 1500) return; } else detachedSince = 0;
    const r = view.getBoundingClientRect();
    if (r.width && (Math.abs(r.width - V.w) > 0.5 || Math.abs(r.height - V.h) > 0.5)) {
      V.w = r.width; V.h = r.height; const dpr = Math.min(2, devicePixelRatio || 1); fx.width = Math.round(V.w * dpr); fx.height = Math.round(V.h * dpr); fxg.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!V.fitted) { V.fitted = true; fit(false); if (pendingSelect) { const p = pendingSelect; pendingSelect = null; select(p, true); } } else clampView(); V.dirty = true;
    }
    if (V.anim) {
      const k = clamp((now - V.anim.t0) / V.anim.dur, 0, 1), e = 1 - Math.pow(1 - k, 3); const { from, to } = V.anim;
      // interpolate in log-scale so zooms feel even
      V.s = Math.exp(Math.log(from.s) + (Math.log(to.s) - Math.log(from.s)) * e); V.tx = from.tx + (to.tx - from.tx) * e; V.ty = from.ty + (to.ty - from.ty) * e;
      if (k >= 1) V.anim = null; V.dirty = true;
    } else if (!drag && !pinch && (Math.abs(V.vx) > 0.05 || Math.abs(V.vy) > 0.05)) { V.tx += V.vx; V.ty += V.vy; V.vx *= 0.92; V.vy *= 0.92; const ox = V.tx, oy = V.ty; clampView(); if (ox !== V.tx) V.vx = 0; if (oy !== V.ty) V.vy = 0; V.dirty = true; }
    if (V.dirty) {
      V.dirty = false; stage.style.transform = `translate3d(${V.tx}px,${V.ty}px,0) scale(${V.s})`;
      for (const p of pinEls) { const x = +p.style.getPropertyValue('--x') * MAP_W * V.s + V.tx, y = +p.style.getPropertyValue('--y') * MAP_H * V.s + V.ty; p.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`; }
      root.classList.toggle('wm-far', V.s < minS() * 1.25);
    }
    drawFx(now);
    raf = requestAnimationFrame(frame);
  }
  const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };
  const toScreen = (u, v) => [u * MAP_W * V.s + V.tx, v * MAP_H * V.s + V.ty];
  function drawFx(now) {
    const g = fxg; g.clearRect(0, 0, V.w, V.h); const tt = now / 1000; const s = st();
    const ex = s?.quests?.expedition;
    const showRoute = selected || hover || (ex && ex.dest);
    for (const id of [ex?.dest, selected].filter(Boolean)) { // selection / expedition glow around the destination
      const D = DESTINATIONS[id]?.map; if (!D) continue; const [x, y] = toScreen(D.x, D.y); const R = Math.max(46, 0.05 * MAP_W * V.s);
      const hot = id === selected; const pulse = 0.85 + Math.sin(tt * 2.4) * 0.15;
      const gr = g.createRadialGradient(x, y, R * 0.2, x, y, R * 1.25 * pulse); gr.addColorStop(0, hot ? 'rgba(255,190,90,0.38)' : 'rgba(255,120,50,0.3)'); gr.addColorStop(1, 'rgba(255,120,40,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, R * 1.3, 0, Math.PI * 2); g.fill();
      g.save(); g.translate(x, y); g.rotate(tt * 0.25); g.setLineDash([10, 8]); g.lineWidth = 2; g.strokeStyle = hot ? 'rgba(255,226,160,0.9)' : 'rgba(255,140,70,0.8)'; g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.stroke(); g.restore();
    }
    if (!showRoute) return;
    const id = selected || hover || ex.dest; const pts = catmull(routeFor(id), 18).map(([u, v]) => toScreen(u, v));
    g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
    g.strokeStyle = 'rgba(20,12,6,0.55)'; g.lineWidth = 6; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
    g.setLineDash([2, 11]); g.lineDashOffset = -tt * 26; g.strokeStyle = selected === id ? '#ffe6a8' : 'rgba(255,230,170,0.75)'; g.lineWidth = 4.2; g.stroke();
    // little ship riding the route
    const k = (tt * 0.12) % 1; const n = pts.length - 1; const f = k * n, i = Math.floor(f); const a = pts[i], b = pts[Math.min(n, i + 1)];
    const x = a[0] + (b[0] - a[0]) * (f - i), y = a[1] + (b[1] - a[1]) * (f - i); g.setLineDash([]);
    drawShip(g, x, y, 0.85, clamp((b[1] - a[1]) * 0.02, -0.3, 0.3), '#fff4d8');
    g.restore();
  }

  // ---------------------------------------------------------------- ledger (pouch, loadout, quest, open expedition)
  function renderLedger() {
    const s = st(); if (!s) return; const ex = s.quests.expedition; const act = s.quests.active; const q = act && QUESTS[act.qid]; const qd = questDest(s);
    const bag = ex ? ex.carried || {} : s.pouch || {}; const ids = Object.keys(bag).filter((k) => bag[k] > 0);
    const w = s.equip.find((e) => e.uid === s.loadout.weapon); const S = s.stats;
    ledger.innerHTML = `<button class="wm-ledger-t" data-wm="ledger"><span>${glyph('scroll')}${esc(t('wm.ledger'))}</span><i>▾</i></button><div class="wm-ledger-b">
      ${ex ? `<section class="wm-l-ex"><small>${glyph('sail')} ${esc(t('d.underway'))}</small><b>${esc(ex.free ? t('wm.freeTo', { d: destName(ex.dest) }) : questName(ex.qid))}</b>
        <p>${esc(destName(ex.dest))} · ${esc(monsterName(DESTINATIONS[ex.dest]?.monster))}</p><button class="tw-btn tw-primary wm-l-btn" data-wm="resume">${glyph('sail')} ${esc(t('d.resume'))}</button></section>`
      : q ? `<section><small>${esc(t('d.accepted'))} ${stars(q.stars)}</small><b>${esc(questName(act.qid))}</b>
        ${qd ? `<button class="wm-link" data-wm="focus" data-d="${qd}">${glyph('arrowR')} ${esc(t('wm.questLeads', { d: destName(qd) }))}</button>` : `<p class="wm-dim">${esc(t('d.deliverHint'))}</p>`}</section>`
      : `<section><small>${esc(t('wm.noQuest'))}</small><p class="wm-dim">${esc(t('wm.noQuestSub'))}</p></section>`}
      <section><small>${esc(ex ? t('d.supplies') : t('box.pouch'))} <em>${ex ? '' : esc(t('box.slots', { a: ids.length, b: s.pouchSlots }))}</em></small>
        <div class="wm-pouch">${ids.slice(0, 12).map((k) => `<span class="tw-tile static" title="${esc(itemName(k))}">${itemIcon(k, { count: bag[k], size: 'sm' })}</span>`).join('') || `<p class="tw-bad">${esc(t('d.pouchEmpty'))}</p>`}</div>
        ${ex ? '' : `<button class="wm-link" data-wm="storage">${glyph('storage')} ${esc(t('d.repack'))}</button>`}</section>
      <section><small>${esc(t('d.loadout'))}</small><b class="wm-l-w">${w ? esc(equipName(w)) : '—'}</b>
        <p class="wm-dim">${esc(t('st.attack'))} ${fmt(S.attack)} · ${S.element ? `<span style="color:${ELEMENT[S.element.type]}">${esc(elementName(S.element.type))} ${fmt(S.element.value)}</span>` : esc(t('st.raw'))} · ${esc(t('st.defense'))} ${fmt(S.defense)} · <span style="color:${ELEMENT.fire}">${esc(elementName('fire'))}</span> ${S.res.fire > 0 ? '+' : ''}${S.res.fire}</p></section></div>`;
  }

  // ---------------------------------------------------------------- pins state (quest badge / resume / selected)
  function renderPins() {
    const s = st(); const ex = s?.quests?.expedition; const qd = questDest(s); const hr = s?.profile?.hr || 1;
    for (const p of pinEls) {
      const id = p.dataset?.dest; if (!id) continue; const badge = p.querySelector('.wm-pin-badge'); const D = DESTINATIONS[id];
      const isEx = ex?.dest === id, isQ = !ex && qd === id;
      p.classList.toggle('sel', selected === id); p.classList.toggle('ex', isEx); p.classList.toggle('quest', isQ); p.classList.toggle('under', hr < D.recHR);
      badge.innerHTML = isEx ? `<span class="wm-b-res">${glyph('sail')}${esc(t('wm.resumeBadge'))}</span>` : isQ ? `<span class="wm-b-q">!</span><span class="wm-b-ql">${esc(t('wm.questBadge'))}</span>` : '';
    }
  }

  // ---------------------------------------------------------------- detail drawer
  function gearHtml(s, mon) {
    const W = MONSTERS[mon].weakness; const best = Object.entries(W).filter(([, v]) => v >= 1.15).sort((a, b) => b[1] - a[1]).map(([k]) => k);
    const owned = s.equip.filter((e) => e.kind === 'weapon' && WEAPONS[e.def]).map((e) => ({ e, el: WEAPONS[e.def].levels[Math.min(e.lvl, WEAPONS[e.def].levels.length - 1)].element })).filter((o) => o.el && best.includes(o.el.type))
      .sort((a, b) => W[b.el.type] * b.el.value - W[a.el.type] * a.el.value);
    const forge = Object.keys(WEAPONS).filter((k) => WEAPONS[k].craft && best.includes(WEAPONS[k].levels[0].element?.type) && !s.equip.some((e) => e.def === k));
    const res = s.stats.res.fire; const el = MONSTER_INFO[mon].element;
    const fireSets = [...new Set(Object.values(ARMOR).filter((a) => a.res.fire > 0).map((a) => a.set))];
    const ownFire = [...new Set(s.equip.filter((e) => e.kind !== 'weapon' && ARMOR[e.def]?.res.fire > 0).map((e) => ARMOR[e.def].set))];
    return `<div class="wm-gear">
      <div class="wm-g-row"><span class="wm-g-k">${esc(t('wm.bestEl'))}</span><span>${best.map((k) => `<b class="tw-el" style="--ec:${ELEMENT[k]}">${esc(elementName(k))}</b>`).join(' ')}</span></div>
      <div class="wm-g-row"><span class="wm-g-k">${esc(t('wm.weapons'))}</span><span>${owned.length ? owned.slice(0, 3).map((o) => `<span class="wm-g-item${o.e.uid === s.loadout.weapon ? ' eq' : ''}">${esc(equipName(o.e))} <i style="color:${ELEMENT[o.el.type]}">${esc(elementName(o.el.type))} ${fmt(o.el.value)}</i>${o.e.uid === s.loadout.weapon ? `<em>${esc(t('wm.equipped'))}</em>` : ''}</span>`).join('')
        : `<span class="wm-dim">${esc(t('wm.noneOwned'))}</span>${forge.length ? `<span class="wm-g-item forge">${esc(t('wm.forgeable'))}: ${forge.map((k) => esc(weaponName(k))).join(' / ')}</span>` : ''}`}</span></div>
      <div class="wm-g-row"><span class="wm-g-k">${esc(t('wm.resist', { e: elementName(el) }))}</span><span><b class="${res > 0 ? 'tw-good' : 'tw-bad'}">${esc(t('wm.yourRes', { n: (res > 0 ? '+' : '') + res }))}</b>
        <span class="wm-dim"> · ${esc(ownFire.length ? t('wm.ownSets', { s: ownFire.map(armorSetName).join(' / ') }) : t('wm.tryArmor', { s: fireSets.map(armorSetName).join(' / ') }))} · ${esc(skillName('heatward'))} · ${esc(itemName('coolingSalve'))}</span></span></div></div>`;
  }
  function detailHtml(id) {
    const s = st(); const D = DESTINATIONS[id]; const mon = D.monster; const info = MONSTER_INFO[mon] || {}; const M = MONSTERS[mon];
    const hr = s.profile.hr; const ex = s.quests.expedition; const act = s.quests.active; const q = act && QUESTS[act.qid]; const qd = questDest(s);
    const questHere = !ex && qd === id; const m = (mode[id] ||= questHere ? 'quest' : 'free'); const useQuest = questHere && m === 'quest';
    const carve = M.carves.map(([k, w]) => [k, w]); const tot = carve.reduce((a, [, w]) => a + w, 0);
    const brk = Object.entries(M.breaks);
    const weak = ELEMS.map((k) => { const v = M.weakness[k] ?? 1; const [sym, cls] = mark(v); return `<li class="wm-wk ${cls}" style="--ec:${ELEMENT[k]}"><span>${esc(elementName(k))}</span><b>${sym}</b></li>`; }).join('');
    const rw = useQuest ? `<div class="wm-rw-q"><small>${esc(t('wm.questRewards'))}</small><b>${esc(questName(act.qid))}</b><div class="wm-rw-line">${coins(q.coins, 'sm')}<span class="wm-xp">+${fmt(q.xp)} XP</span></div>
        <div class="wm-mats">${q.rewards.map(([k, n, p]) => `<span class="wm-mat" title="${esc(itemName(k))}">${itemIcon(k, { size: 'sm' })}<span>${esc(itemName(k))} ×${n}</span><i>${p}%</i></span>`).join('')}</div><p class="wm-dim">${esc(t('wm.plusCarves'))}</p></div>`
      : `<div class="wm-rw-f"><b>${esc(t('wm.freeRewards'))}</b><p class="wm-dim">${esc(t('wm.freeRewardsSub'))}</p></div>`;
    // departure block
    let foot;
    if (ex && ex.dest === id) foot = `<div class="wm-dep-note ex">${glyph('sail')}<span>${esc(t('wm.exHere', { t: clock(Math.max(0, ((ex.free ? 3000 : QUESTS[ex.qid]?.timeLimit || 3000) + 600) - (ctx.now() - ex.at) / 1000)) }))}</span></div>
      <button class="tw-btn tw-primary tw-big wm-go" data-wm="resume">${glyph('sail')} ${esc(t('d.resume'))}</button>`;
    else if (ex) foot = `<div class="wm-dep-note warn">${glyph('sail')}<span>${esc(t('wm.exElsewhere', { d: destName(ex.dest) }))}</span></div><button class="tw-btn tw-ghost wm-go" data-wm="focus" data-d="${ex.dest}">${esc(t('wm.showEx'))}</button>`;
    else {
      const opts = questHere ? `<div class="wm-modes" role="radiogroup">
          <button class="wm-mode ${m === 'quest' ? 'on' : ''}" data-wm="mode" data-m="quest" role="radio" aria-checked="${m === 'quest'}"><i></i><span><b>${esc(t('wm.modeQuest'))}</b><small>${esc(t('wm.modeQuestSub', { q: questName(act.qid), c: fmt(q.coins), x: fmt(q.xp) }))}</small></span></button>
          <button class="wm-mode ${m === 'free' ? 'on' : ''}" data-wm="mode" data-m="free" role="radio" aria-checked="${m === 'free'}"><i></i><span><b>${esc(t('wm.modeFree'))}</b><small>${esc(t('wm.modeFreeSub'))}</small></span></button></div>`
        : `<div class="wm-dep-note">${glyph('dock')}<span><b>${esc(t('wm.modeFree'))}</b> — ${esc(t('wm.modeFreeSub'))}${qd && qd !== id ? ' ' + esc(t('wm.questElsewhere', { q: questName(act.qid), d: destName(qd) })) : q?.type === 'deliver' ? ' ' + esc(t('d.deliverHint')) : ''}</span></div>`;
      foot = `${opts}<button class="tw-btn tw-primary tw-big wm-go" data-wm="depart" ${busy ? 'disabled' : ''}>${glyph('sail')} ${esc(busy ? t('d.casting') : t('wm.depart'))}</button>`;
    }
    return `<div class="wm-d-scroll tw-scroll">
      <header class="wm-d-hero"><img src="${portraitUrl(mon)}" alt="" draggable="false" onerror="this.closest('.wm-d-hero').classList.add('noimg');this.remove()">
        <button class="wm-d-x" data-wm="close" aria-label="${esc(t('hud.close'))}">${glyph('close')}</button>
        <div class="wm-d-title"><small>${esc(destRegion(id))} · ${esc(destName(id))}</small><h2>${esc(monsterName(mon))}</h2></div></header>
      <div class="wm-d-stats">
        <div><span>${esc(t('wm.danger'))}</span>${stars(info.danger || D.danger, 7)}</div>
        <div class="${hr >= (info.recHR || D.recHR) ? 'ok' : 'warn'}"><span>${esc(t('wm.recHR'))}</span><b>HR ${info.recHR || D.recHR}+</b><em>${esc(t('wm.yourHR', { hr }))}${hr >= (info.recHR || D.recHR) ? '' : ' ⚠'}</em></div>
        <div><span>${esc(t('wm.size'))}</span><b>${esc(miSize(mon))}</b></div>
        <div><span>${esc(t('wm.habitat'))}</span><b>${esc(destName(info.habitat || id))}</b></div></div>
      <p class="wm-d-desc">${esc(miDesc(mon))}</p><p class="wm-d-dest">${esc(destDesc(id))}</p>
      <h4>${esc(t('wm.weak'))} <small>${esc(t('wm.weakKey'))}</small></h4><ul class="wm-weak">${weak}</ul>
      <h4>${esc(t('wm.gear'))}</h4>${gearHtml(s, mon)}
      <h4>${esc(t('wm.traits'))}</h4><ul class="wm-traits">${miList(mon, 'traits').map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      <h4>${esc(t('wm.attacks'))}</h4><div class="wm-attacks">${miList(mon, 'attacks').map((x) => `<span>${esc(x)}</span>`).join('')}</div>
      <h4>${esc(t('wm.materials'))}</h4>
      <div class="wm-mats">${carve.map(([k, w]) => `<span class="wm-mat" title="${esc(itemName(k))}">${itemIcon(k, { size: 'sm' })}<span>${esc(itemName(k))}</span>${rarityTag(ITEMS[k]?.rarity || 1)}<i>${Math.round((w / tot) * 100)}%</i></span>`).join('')}</div>
      <div class="wm-breaks">${brk.map(([p, k]) => `<span class="wm-brk"><em>${esc(t('wm.breakPart', { p: partName(p) }))}</em>${itemIcon(k, { size: 'sm' })}<span style="color:${rarityColor(ITEMS[k]?.rarity || 1)}">${esc(itemName(k))}</span></span>`).join('')}</div>
      <h4>${esc(t('wm.rewards'))}</h4>${rw}
    </div><footer class="wm-d-foot">${foot}</footer>`;
  }
  function renderDetail(keepScroll = true) {
    if (!selected) { detail.classList.remove('on'); detail.innerHTML = ''; return; }
    const sc = detail.querySelector('.wm-d-scroll'); const top = keepScroll && sc ? sc.scrollTop : 0;
    detail.innerHTML = detailHtml(selected); detail.classList.add('on');
    const n = detail.querySelector('.wm-d-scroll'); if (n) n.scrollTop = top;
  }
  let pendingSelect = null;
  function select(id, focus) {
    if (id && !DESTINATIONS[id]) return;
    if (id && !V.fitted) { pendingSelect = id; return; }
    const changed = id !== selected; selected = id; root.classList.toggle('has-sel', !!id);
    renderPins(); renderDetail(!changed); if (id && focus) requestAnimationFrame(() => focusDest(id, true));
    if (id && changed && innerWidth < 1100) ledger.classList.add('min');
  }

  // ---------------------------------------------------------------- actions
  root.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-wm]'); if (!b || b.disabled) return; e.stopPropagation();
    const a = b.dataset.wm; const s = st();
    if (a === 'close') return select(null);
    if (a === 'ledger') return ledger.classList.toggle('min');
    if (a === 'storage') return ctx.open('storage');
    if (a === 'focus') return select(b.dataset.d, true);
    if (a === 'mode') { mode[selected] = b.dataset.m; return renderDetail(); }
    if (a === 'resume') { const ex = s?.quests?.expedition; if (ex) ctx.navigate(fieldUrl('quest', ex.iid), t('d.resuming')); return; }
    if (a === 'depart') return depart(selected);
  });
  async function depart(id) {
    const s = st(); if (busy || !id || !s || s.quests.expedition) return;
    const D = DESTINATIONS[id]; const questHere = questDest(s) === id; const m = questHere ? mode[id] || 'quest' : 'free';
    const pouchN = Object.keys(s.pouch || {}).length;
    const body = `<div class="wm-cf"><img src="${portraitUrl(D.monster)}" alt="" onerror="this.remove()"><div><b>${esc(destName(id))}</b><small>${esc(destRegion(id))}</small>
      <p>${esc(m === 'quest' ? t('wm.cfQuest', { q: questName(s.quests.active.qid) }) : t('wm.cfFree'))}</p></div></div>
      ${pouchN ? `<p class="wm-dim">${esc(t('d.sailSub'))}</p>` : `<p class="tw-bad">${esc(t('d.noSupBody'))}</p>`}
      ${s.profile.hr < D.recHR ? `<p class="tw-bad">${esc(t('wm.cfUnder', { hr: D.recHR }))}</p>` : ''}`;
    const ok = await ctx.confirm({ title: t('wm.confirmQ', { m: monsterShort(D.monster) }), body, ok: t('wm.go'), cancel: t('wm.back') });
    if (!ok) return;
    busy = true; renderDetail();
    const r = await ctx.acct.act('depart', { mode: m, dest: id });
    if (!r.ok) { busy = false; renderDetail(); ctx.toast(errText(r), 'err'); return; }
    const iid = r.result?.iid; const dest = r.result?.dest;
    if (!iid || dest !== id) { busy = false; renderDetail(); ctx.toast(t('wm.err.mismatch'), 'err'); return; }
    await cinematic(id, m);
    ctx.navigate(fieldUrl('quest', iid), t('wm.landing', { d: destName(id) }));
  }
  function errText(r) {
    const map = { wrong_dest: 'wm.err.wrongDest', bad_dest: 'wm.err.badDest', bad_mode: 'wm.err.badDest', busy: 'srv.busyHunt', none: 'srv.acceptFirst', deliver: 'srv.deliverCounter' };
    return map[r.error] ? t(map[r.error]) : serverMsg(r.message || 'Request failed', r.error);
  }

  // ---------------------------------------------------------------- departure cinematic (≈2.6 s)
  function cinematic(id, m) {
    return new Promise((resolve) => {
      const host = root.closest('.tw-root') || document.body; const D = DESTINATIONS[id];
      const ov = document.createElement('div'); ov.className = 'wm-cine';
      ov.innerHTML = `<canvas></canvas><div class="wm-cine-t"><small>${esc(m === 'quest' ? t('wm.modeQuest') : t('wm.modeFree'))}</small><h1>${esc(t('wm.setSail'))}</h1>
        <p><b>${esc(destName(id))}</b><span>${esc(destRegion(id))}</span></p><em>${esc(t('wm.target', { m: monsterName(D.monster) }))}</em></div>`;
      host.appendChild(ov); const cv = ov.querySelector('canvas'); const g = cv.getContext('2d');
      const dpr = Math.min(2, devicePixelRatio || 1); const W = innerWidth, H = innerHeight; cv.width = W * dpr; cv.height = H * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const route = catmull(routeFor(id), 24); const xs = route.map((p) => p[0] * MAP_W), ys = route.map((p) => p[1] * MAP_H);
      const bx = [Math.min(...xs), Math.max(...xs)], by = [Math.min(...ys), Math.max(...ys)];
      const cx = (bx[0] + bx[1]) / 2, cy = (by[0] + by[1]) / 2; const span = Math.max((bx[1] - bx[0]) / W, (by[1] - by[0]) / H) * 1.9;
      const t0 = performance.now(), DUR = 2600;
      requestAnimationFrame(() => ov.classList.add('on'));
      const step = (now) => {
        const k = clamp((now - t0) / DUR, 0, 1); const sc = (1 / span) * (1 + k * 0.25); const ox = W / 2 - cx * sc, oy = H / 2 - cy * sc;
        g.fillStyle = '#0a0705'; g.fillRect(0, 0, W, H);
        if (artCanvas) { g.globalAlpha = 0.9; g.drawImage(artCanvas, ox, oy, MAP_W * sc, MAP_H * sc); g.globalAlpha = 1; }
        const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.hypot(W, H) * 0.6); vg.addColorStop(0, 'rgba(10,6,3,0.05)'); vg.addColorStop(1, 'rgba(10,6,3,0.92)'); g.fillStyle = vg; g.fillRect(0, 0, W, H);
        const e = clamp((k - 0.08) / 0.8, 0, 1); const ee = e < 0.5 ? 2 * e * e : 1 - Math.pow(-2 * e + 2, 2) / 2; const n = Math.max(1, Math.round(ee * (route.length - 1)));
        const P = route.map(([u, v]) => [u * MAP_W * sc + ox, v * MAP_H * sc + oy]);
        g.lineCap = 'round'; g.setLineDash([3, 12]); g.lineDashOffset = -now / 40; g.strokeStyle = '#ffe2a0'; g.lineWidth = 5; g.beginPath(); P.slice(0, n + 1).forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); g.setLineDash([]);
        const [ex2, ey] = P[Math.min(n, P.length - 1)]; const [px2] = P[Math.max(0, n - 1)];
        for (let i = 1; i < 6; i++) { const [wx, wy] = P[Math.max(0, n - i * 2)]; g.fillStyle = `rgba(255,255,255,${0.22 - i * 0.035})`; g.beginPath(); g.ellipse(wx, wy + 6, 10 - i, 3, 0, 0, Math.PI * 2); g.fill(); }
        drawShip(g, ex2, ey, 2.2, 0, '#fff2d2'); void px2;
        const [dx, dy] = P[P.length - 1]; const pr = 18 + Math.sin(now / 160) * 4; g.strokeStyle = `rgba(255,140,60,${0.4 + ee * 0.5})`; g.lineWidth = 3; g.beginPath(); g.arc(dx, dy, pr, 0, Math.PI * 2); g.stroke();
        if (k < 1) requestAnimationFrame(step); else resolve();
      };
      requestAnimationFrame(step);
    });
  }

  // ---------------------------------------------------------------- lifecycle
  let painting = false;
  function ensureArt() {
    if (artCanvas || painting) return; painting = true;
    art(ctx.game).then((cv) => {
      artCanvas = cv; const c = cv; c.className = 'wm-art'; c.style.width = MAP_W + 'px'; c.style.height = MAP_H + 'px'; stage.appendChild(c); waitEl.classList.add('off'); root.classList.add('ready');
    }).catch((e) => { console.warn('world map art failed', e); waitEl.querySelector('p').textContent = t('srv.oops'); }).finally(() => { painting = false; });
  }
  function refresh() { renderLedger(); renderPins(); if (selected) renderDetail(); }
  return {
    el: root,
    mount(host) { // (re)attach to the dock window body; keeps canvas/state across panel re-renders
      const sc = detail.querySelector('.wm-d-scroll')?.scrollTop || 0; const lsc = ledger.querySelector('.wm-ledger-b')?.scrollTop || 0;
      if (root.parentNode !== host) host.appendChild(root); ensureArt(); refresh(); kick();
      const n = detail.querySelector('.wm-d-scroll'); if (n) n.scrollTop = sc; const l = ledger.querySelector('.wm-ledger-b'); if (l) l.scrollTop = lsc;
    },
    open({ focus } = {}) { busy = false; V.fitted = false; selected = null; hover = null; detail.classList.remove('on'); root.classList.remove('has-sel'); ledger.classList.remove('min'); if (focus) pendingSelect = focus; },
    refresh, select, prewarm: () => art(ctx.game).catch(() => {}),
    get selected() { return selected; }, get view() { return { s: V.s, tx: V.tx, ty: V.ty, min: minS(), max: maxS(), w: V.w, h: V.h }; },
  };
}
function anchorSvg() { return '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><circle cx="24" cy="9" r="4"/><path d="M24 13v28M15 20h18M8 28c2 8 8 13 16 13s14-5 16-13M8 28l-3 3M8 28l4 2M40 28l3 3M40 28l-4 2"/></svg>'; }
