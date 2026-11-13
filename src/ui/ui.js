// Wildbound HUD — DOM overlay in #ui-root. Original dark-fantasy design.
// Reads game.player / game.monsters / game.net defensively (any may be stubs or late-bound).
// Cheap per frame: DOM is written only when a quantised value changes; moving things use transforms.
import './ui.css';
import { t, monsterShort, monsterTitle, itemName as iName, partName, langToggleHtml, bindLangToggle } from '../shared/i18n.js';

const SVG = {
  weapon: `<svg viewBox="0 0 64 64" class="wb-weapon" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round">
    <path d="M44 8 L54 10 L52 20 L26 46 L18 38 Z" fill="rgba(246,226,170,.18)"/><path d="M48 14 L24 38"/>
    <path d="M14 34 L30 50"/><path d="M20 44 L11 53"/><circle cx="9.5" cy="54.5" r="2.6" fill="currentColor"/></svg>`,
  potion: `<svg viewBox="0 0 48 48"><defs><linearGradient id="wbPot" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b8ffcf"/><stop offset=".5" stop-color="#3fc077"/><stop offset="1" stop-color="#145a36"/></linearGradient></defs>
    <path d="M19 6h10v4h-2v8.5c6 2 10 7.2 10 13.5 0 7.7-6.3 13-13 13s-13-5.3-13-13c0-6.3 4-11.5 10-13.5V10h-2z" fill="#1a130d" stroke="#d9b673" stroke-width="1.6"/>
    <path d="M13.2 30c2.5-1.4 5.6-1.2 8.8 0s7.6 1.6 12.8-.4c.3 1 .5 1.8.5 2.6 0 6.4-5.1 10.8-11.2 10.8S12.8 38.5 12.8 32.2c0-.8.1-1.5.4-2.2z" fill="url(#wbPot)"/>
    <path d="M17 24c1.2-1.6 2.6-2.6 4-3.2" stroke="rgba(255,255,255,.55)" stroke-width="1.6" fill="none" stroke-linecap="round"/><rect x="18" y="4" width="12" height="3" rx="1" fill="#8a6a35"/></svg>`,
  limp: `<svg viewBox="0 0 32 32" fill="currentColor"><ellipse cx="16" cy="21" rx="6.5" ry="5.5"/><ellipse cx="7.5" cy="13" rx="2.6" ry="3.4" transform="rotate(-20 7.5 13)"/>
    <ellipse cx="13" cy="8.5" rx="2.6" ry="3.4" transform="rotate(-6 13 8.5)"/><ellipse cx="19.5" cy="8.5" rx="2.6" ry="3.4" transform="rotate(6 19.5 8.5)"/><ellipse cx="25" cy="13" rx="2.6" ry="3.4" transform="rotate(20 25 13)"/>
    <path d="M12 16 L17 21 L14 23 L19 28" stroke="#140d08" stroke-width="1.8" fill="none"/></svg>`,
  rage: `<svg viewBox="0 0 32 32" fill="currentColor"><path d="M16 2c1.5 5 6.5 7.5 6.5 13.5 0 2-.6 3.5-1.5 4.6.3-2.6-.8-4.8-2.6-6.2.2 3-1.4 5-3.3 5.6 1-2.3.2-4.8-1.9-6.4-.4 3.5-4.7 5-4.7 9.4 0 1.6.6 3 1.6 4.1C6.3 25.3 4 22 4 18.2 4 10.5 13 9 16 2z"/><path d="M16 30c-3 0-5-2-5-4.6 0-2.6 2.3-3.7 3.2-6.2 1.3 1.5 1 3.4 0 4.6 1.8-.2 3.6-1.6 3.6-4.2 2 1.4 3.2 3.4 3.2 5.6C21 28 19 30 16 30z" opacity=".55"/></svg>`,
  tired: `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 9h8l-8 9h8"/><path d="M17 5h6l-6 7h6"/><path d="M19 21c0 3 1.5 5 3.5 7 2-2 3.5-4 3.5-7a3.5 3.5 0 0 0-7 0z" fill="currentColor" stroke="none" opacity=".8"/></svg>`,
  whet: `<svg viewBox="0 0 48 48"><path d="M9 30 L30 9 Q34 6 38 10 L39 11 Q42 15 38 18 L17 39 Q13 42 9 38 L8 37 Q5 34 9 30z" fill="#6f7680" stroke="#d9b673" stroke-width="1.6"/><path d="M12 31 L31 12" stroke="#b9c2cc" stroke-width="2" stroke-linecap="round"/><path d="M36 30 l3 -6 l1 6 l6 1 l-6 2 l-1 6 l-2 -6 l-6 -1z" fill="#fff1c4"/></svg>`,
  flash: `<svg viewBox="0 0 48 48"><g stroke="#f6e2aa" stroke-width="2" stroke-linecap="round"><path d="M24 4v6M24 38v6M4 24h6M38 24h6M10 10l4 4M34 34l4 4M38 10l-4 4M14 34l-4 4"/></g><circle cx="24" cy="24" r="10" fill="#c9b27a" stroke="#d9b673" stroke-width="1.6"/><path d="M19 21c2-3 6-3 8 0" stroke="#fff8e0" stroke-width="2" fill="none" stroke-linecap="round"/></svg>`,
  trap: `<svg viewBox="0 0 48 48" fill="none" stroke="#c9ccd2" stroke-width="2.2" stroke-linejoin="round"><ellipse cx="24" cy="32" rx="17" ry="7" stroke="#d9b673"/><path d="M8 31 L12 17 L16 27 L20 15 L24 27 L28 15 L32 27 L36 17 L40 31"/><circle cx="24" cy="32" r="3" fill="#d9b673" stroke="none"/></svg>`,
  shard: `<svg viewBox="0 0 64 64"><path d="M32 3 L46 22 L32 61 L18 22 Z" fill="url(#wbShardG)" stroke="#fff3cf" stroke-width="1.5"/><path d="M32 3 L36 30 L32 61 M18 22 L36 30 L46 22" stroke="rgba(60,30,8,.55)" stroke-width="1.4" fill="none"/>
    <defs><linearGradient id="wbShardG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff2c8"/><stop offset=".55" stop-color="#ffb34d"/><stop offset="1" stop-color="#b8430b"/></linearGradient></defs></svg>`,
  edge: `<svg viewBox="0 0 40 40"><path d="M36 20 L10 6 L16 20 L10 34 Z" fill="currentColor" stroke="#120d0a" stroke-width="2" stroke-linejoin="round"/></svg>`,
  reticle: `<svg viewBox="0 0 64 64" fill="none" stroke="#ffb066" stroke-width="2"><circle cx="32" cy="32" r="20" stroke-dasharray="20 11.4" opacity=".85"/>
    <path d="M32 4 L36 11 L28 11 Z M32 60 L36 53 L28 53 Z M4 32 L11 28 L11 36 Z M60 32 L53 28 L53 36 Z" fill="#ffb066" stroke="none"/><circle cx="32" cy="32" r="2.2" fill="#fff1d6" stroke="none"/></svg>`,
  emblem: `<svg viewBox="0 0 120 120" class="wb-emblem"><defs><linearGradient id="wbG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff2c8"/><stop offset=".5" stop-color="#d9b673"/><stop offset="1" stop-color="#7c531b"/></linearGradient>
    <linearGradient id="wbE" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd08a"/><stop offset="1" stop-color="#c2410c"/></linearGradient></defs>
    <path d="M60 6 L104 30 L104 74 C104 94 84 108 60 116 C36 108 16 94 16 74 L16 30 Z" fill="rgba(12,8,6,.7)" stroke="url(#wbG)" stroke-width="2.4"/>
    <path d="M60 14 L96 34 L96 73 C96 89 80 101 60 108 C40 101 24 89 24 73 L24 34 Z" fill="none" stroke="rgba(217,182,115,.35)" stroke-width="1"/>
    <path d="M38 30 C44 44 42 60 34 74 M52 26 C58 44 58 64 50 84 M68 26 C74 44 74 64 66 84 M82 30 C88 44 86 60 78 74" stroke="url(#wbE)" stroke-width="5" stroke-linecap="round" fill="none" transform="translate(4 4) skewX(-12)"/>
    <circle cx="60" cy="96" r="3" fill="url(#wbG)"/></svg>`,
};

const CONTROLS = [['WASD', 'key.move'], ['key.mouse', 'key.look'], ['key.lmb', 'key.light'], ['key.rmb', 'key.heavy'], ['Space', 'key.dodge'], ['Shift', 'key.sprint'], ['Q', 'key.guard'], ['F / Tab', 'key.lock'], ['R', 'key.drink'], ['E', 'key.interact'], ['Enter', 'key.chat'], ['Esc', 'key.menu']].map(([k, v]) => [k.startsWith('key.') ? t(k) : k, t(v)]);
const TIERS = [ // sharpness tiers (original naming/colours)
  [0.85, t('sh.keen'), '#9fe8ff'], [0.65, t('sh.honed'), '#7fe08f'], [0.45, t('sh.worn'), '#f2d65a'], [0.25, t('sh.dull'), '#f39a3c'], [-1, t('sh.blunt'), '#e2443a'],
];

function el(tag, cls, html, parent) {
  const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; if (parent) parent.appendChild(e); return e;
}
const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const fmtTime = (s) => { s = Math.max(0, Math.ceil(s)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lsGet = (k, d) => { try { const v = localStorage.getItem('wb.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem('wb.' + k, JSON.stringify(v)); } catch { /* private mode */ } };

function loadFonts() {
  if (document.getElementById('wb-fonts')) return;
  const pre = el('link'); pre.rel = 'preconnect'; pre.href = 'https://fonts.gstatic.com'; pre.crossOrigin = ''; document.head.appendChild(pre);
  const l = el('link'); l.id = 'wb-fonts'; l.rel = 'stylesheet';
  l.href = 'https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700;900&family=Inter:wght@400;600;700;800&display=swap';
  l.onerror = () => l.remove(); // offline: fall back to the serif/sans stacks in ui.css
  document.head.appendChild(l);
}

export function createUI(game) {
  loadFonts();
  const { THREE, events, params } = game;
  const shot = params.get('shot') === '1';
  const root = document.getElementById('ui-root') || el('div', null, null, document.body);
  root.id = 'ui-root'; root.innerHTML = '';
  const hud = el('div', 'wb-hud', null, root);
  el('div', 'wb-scrim wb-scrim-tl', null, hud); el('div', 'wb-scrim wb-scrim-tr', null, hud); el('div', 'wb-scrim wb-scrim-br', null, hud);
  const v3 = new THREE.Vector3(), v3b = new THREE.Vector3();
  let W = innerWidth, H = innerHeight;
  addEventListener('resize', () => { W = innerWidth; H = innerHeight; fs = parseFloat(getComputedStyle(root).fontSize) || 13; });

  const P = () => game.player || {};
  const M = () => (game.monsters && game.monsters[0]) || null;

  // ---------------------------------------------------------------- vitals
  const vit = el('div', 'wb-vitals', null, hud);
  const crest = el('div', 'wb-crest', `<svg class="wb-ring" viewBox="0 0 100 100"><circle class="wb-ring-bg" cx="50" cy="50" r="46" stroke-width="5" fill="none"/>
    <circle class="wb-ring-fg" cx="50" cy="50" r="46" stroke-width="3.2" fill="none" stroke="currentColor" stroke-linecap="round" pathLength="100" stroke-dasharray="100" stroke-dashoffset="0"/></svg>${SVG.weapon}`, vit);
  const ringFg = crest.querySelector('.wb-ring-fg');
  const bars = el('div', 'wb-bars', null, vit);
  const nameRow = el('div', 'wb-name-row', `<span class="wb-name">${t('f.hunter')}</span><span class="wb-hpnum wb-num"></span>`, bars);
  const nameEl = nameRow.firstChild, hpNum = nameRow.lastChild;
  const mkBar = (cls) => { const b = el('div', 'wb-bar ' + cls, `<div class="wb-bar-inner"><div class="wb-trail"></div><div class="wb-fill"></div><div class="wb-ticks"></div><div class="wb-sheen"></div></div>`, bars); return { b, fill: b.querySelector('.wb-fill'), trail: b.querySelector('.wb-trail') }; };
  const hpBar = mkBar('wb-hp'), stBar = mkBar('wb-stam');
  stBar.trail.remove();
  const blade = el('div', 'wb-blade', `<div class="wb-blade-shape"><div class="wb-blade-fill"></div></div><span class="wb-blade-tier"></span>`, bars);
  const bladeFill = blade.querySelector('.wb-blade-fill'), bladeTier = blade.querySelector('.wb-blade-tier');
  // Status ailments (src/core/status.js): chips under the bars, tinted HP bar.
  const ailRow = el('div', 'wb-ail-row', null, bars);
  const AIL = { burn: { cls: 'wb-ail-burn', label: { small: t('ail.burn'), large: t('ail.blaze') } }, poison: { cls: 'wb-ail-poison', label: { normal: t('ail.poison'), deadly: t('ail.deadly') } }, blast: { cls: 'wb-ail-blast', label: { normal: t('ail.blast') } } };
  const ailEls = {};

  // ---------------------------------------------------------------- nav: minimap, timer, limp
  const nav = el('div', 'wb-nav', null, hud);
  const map = el('div', 'wb-map', null, nav);
  const cvs = el('canvas', null, null, map);
  const ring = el('div', null, `<svg class="wb-map-ring" viewBox="0 0 200 200">
    <circle cx="100" cy="100" r="97" fill="none" stroke="#d9b673" stroke-width="1.2" opacity=".85"/>
    <circle cx="100" cy="100" r="93" fill="none" stroke="#000" stroke-width="3" opacity=".6"/>
    <circle cx="100" cy="100" r="90.5" fill="none" stroke="#d9b673" stroke-width=".7" opacity=".45"/>
    <g id="wbTicks"></g><g id="wbCard" font-family="Cinzel, Georgia, serif" font-weight="700" font-size="13" text-anchor="middle" dominant-baseline="central"></g></svg>`, map).firstChild;
  map.appendChild(ring);
  const ticksG = ring.querySelector('#wbTicks'), cardG = ring.querySelector('#wbCard');
  { let s = ''; for (let i = 0; i < 72; i++) { const a = (i / 72) * Math.PI * 2, r1 = 97, r2 = i % 18 === 0 ? 0 : i % 6 === 0 ? 91 : 94; if (!r2) continue; s += `<line x1="${100 + Math.sin(a) * r1}" y1="${100 - Math.cos(a) * r1}" x2="${100 + Math.sin(a) * r2}" y2="${100 - Math.cos(a) * r2}" stroke="#d9b673" stroke-width=".8" opacity=".55"/>`; } ticksG.innerHTML = s; }
  const cards = ['N', 'E', 'S', 'W'].map((t) => { const g = document.createElementNS('http://www.w3.org/2000/svg', 'g'); g.innerHTML = `<circle r="8" fill="#120d0a" stroke="#d9b673" stroke-width=".8"/><text fill="${t === 'N' ? '#ff9a4d' : '#e9dcc0'}" font-size="${t === 'N' ? 11 : 9.5}">${t}</text>`; cardG.appendChild(g); return g; });
  const ctx = cvs.getContext('2d');
  const timer = el('div', 'wb-frame wb-timer', `<span class="wb-t-label">${t('f.quest')}</span><span class="wb-t-val wb-num">50:00</span>`, nav);
  const timerVal = timer.lastChild;
  const status = el('div', 'wb-status', null, nav);
  const chip = (cls, icon, label) => el('div', `wb-frame wb-chip ${cls} wb-hidden`, `${icon}<span>${label}</span>`, status);
  const chipRage = chip('wb-chip-rage', SVG.rage, t('chip.rage')), chipTired = chip('wb-chip-tired', SVG.tired, t('chip.tired')), limp = chip('wb-chip-limp', SVG.limp, t('chip.limp'));
  let monState = '';
  events.on('monster:state', (e) => { if (e?.state) monState = String(e.state); });

  const party = el('div', 'wb-party wb-hidden', `<div class="wb-party-h">${t('f.party')}</div>`, nav);
  const partyRows = new Map();

  // ---------------------------------------------------------------- item slot
  // Quest hunts: the bar shows what you actually carried (game.fieldItems from src/field/questRuntime.js).
  const iconFor = (id) => (id === 'whetstone' ? SVG.whet : id === 'flashPod' ? SVG.flash : id === 'snareCoil' || id === 'tranqBomb' ? SVG.trap : SVG.potion);
  const ITEMS = game.fieldItems ? game.fieldItems.list().map((it) => ({ ...it, icon: iconFor(it.id) })) : [
    { id: 'potion', name: iName('potion'), desc: t('it.restoresVigor'), icon: SVG.potion },
    { id: 'whetstone', name: t('it.whetstone'), desc: t('it.whetDesc'), icon: SVG.whet },
    { id: 'flash', name: iName('flashPod'), desc: t('it.noneInPouch'), icon: SVG.flash, stub: true },
    { id: 'trap', name: iName('snareCoil'), desc: t('it.noneInPouch'), icon: SVG.trap, stub: true },
  ];
  let sel = Math.max(0, Math.min(ITEMS.length - 1, lsGet('item', 0) | 0));
  const item = el('div', 'wb-items', `<div class="wb-item-name"><b></b><span></span></div><div class="wb-item-row"></div>`, hud);
  const itemName = item.querySelector('.wb-item-name b'), itemDesc = item.querySelector('.wb-item-name span');
  const slots = ITEMS.map((it, i) => { const e = el('div', 'wb-slot' + (it.stub ? ' wb-stub' : ''), `${it.icon}<span class="wb-slot-n">${i < 9 ? i + 1 : ''}</span><span class="wb-slot-c wb-num">${it.stub ? '0' : it.id === 'whetstone' ? '∞' : ''}</span>`, item.lastChild); return { e, c: e.querySelector('.wb-slot-c') }; });
  el('span', 'wb-item-key', 'R', item.lastChild);
  const itemCount = slots[0].c;
  function selectItem(i, quiet) {
    sel = (i + ITEMS.length) % ITEMS.length; lsSet('item', sel);
    slots.forEach((s2, k) => s2.e.classList.toggle('wb-sel', k === sel));
    itemName.textContent = ITEMS[sel].name; itemDesc.textContent = ITEMS[sel].desc;
    if (!quiet) { item.classList.remove('wb-cycle'); void item.offsetWidth; item.classList.add('wb-cycle'); }
  }
  selectItem(sel, true);
  function useSelected() {
    const it = ITEMS[sel], p = P();
    if (game.fieldItems) {
      const okUse = it.id !== 'whetstone' && game.fieldItems.count(it.id) <= 0 ? false : game.fieldItems.use(it.id);
      if (!okUse) { slots[sel].e.classList.remove('wb-deny'); void slots[sel].e.offsetWidth; slots[sel].e.classList.add('wb-deny'); }
      return false;
    }
    if (it.stub) { toast(t('it.noneOf', { item: it.name })); slots[sel].e.classList.remove('wb-deny'); void slots[sel].e.offsetWidth; slots[sel].e.classList.add('wb-deny'); return false; }
    if (it.id === 'potion' && num(p.potions, 1) <= 0) { slots[sel].e.classList.remove('wb-deny'); void slots[sel].e.offsetWidth; slots[sel].e.classList.add('wb-deny'); return false; }
    if (typeof p.useItem === 'function' && !p.dead) { try { p.useItem(it.id); } catch (e) { console.warn(e); } return false; }
    return true; // no player API: let the raw R input through
  }
  let wheelT = 0;
  addEventListener('wheel', (e) => {
    if (title || pause || typing || !started || e.target?.closest?.('.wb-panel')) return;
    const now = performance.now(); if (now - wheelT < 110 || !e.deltaY) return; wheelT = now;
    selectItem(sel + (e.deltaY > 0 ? 1 : -1));
  }, { passive: true });
  let localPotions = 10;

  // ---------------------------------------------------------------- reticle, damage numbers, vignettes
  const fx = el('div', 'wb-fx', null, hud);
  const vigLow = el('div', 'wb-vig wb-vig-low', null, fx), vigHit = el('div', 'wb-vig wb-vig-hit', null, fx);
  const reticle = el('div', 'wb-reticle wb-hidden', SVG.reticle, hud);
  const DMG_POOL = 40, dmg = [];
  for (let i = 0; i < DMG_POOL; i++) { const d = el('div', 'wb-dmg wb-num', '', hud); d.style.opacity = '0'; dmg.push({ el: d, life: 0, max: 1, p: new THREE.Vector3(), ox: 0, oy: 0 }); }
  let dmgIdx = 0, stackN = 0, fs = 13; // fs: root font px, for em-relative offsets

  const edges = []; // [{el, lab}] pool: 0 = local hunter, 1..3 = remote hunters
  for (let i = 0; i < 4; i++) { const e = el('div', 'wb-edge wb-hidden' + (i ? ' wb-edge-ally' : ''), `<div class="wb-edge-arrow">${SVG.edge}</div><span></span>`, hud); edges.push({ e, a: e.firstChild, lab: e.lastChild, on: false, name: '' }); }
  const ev = new THREE.Vector3();
  function edgeFor(slot, pos, label) {
    const E = edges[slot]; let show = false;
    if (pos) {
      ev.set(pos.x, pos.y + 1.2, pos.z).project(game.camera);
      let x = ev.x, y = -ev.y; const behind = ev.z > 1;
      if (behind) { x = -x; y = -y; }
      if (behind || Math.abs(x) > 1 || Math.abs(y) > 1) {
        show = true;
        const hw = W / 2, hh = H / 2, m = 3.2 * fs; let dx = x * hw, dy = y * hh;
        if (Math.abs(dx) < 1e-3 && Math.abs(dy) < 1e-3) dy = 1;
        const t = Math.min((hw - m) / Math.abs(dx || 1e-6), (hh - m) / Math.abs(dy || 1e-6));
        const sx = hw + dx * t, sy = hh + dy * t, ang = Math.atan2(dy, dx);
        E.e.style.transform = `translate3d(${sx.toFixed(1)}px,${sy.toFixed(1)}px,0)`;
        E.a.style.transform = `rotate(${ang.toFixed(3)}rad)`;
      }
    }
    if (E.on !== show) { E.on = show; E.e.classList.toggle('wb-hidden', !show); }
    if (show && E.name !== label) { E.name = label; E.lab.textContent = label; }
  }
  const toasts = el('div', 'wb-toasts', null, hud);
  const card = el('div', 'wb-card', `<div class="wb-card-line"></div><div class="wb-card-kicker">${t('f.sighted')}</div><div class="wb-card-name"></div><div class="wb-card-title"></div><div class="wb-card-line"></div>`, hud);

  // ---------------------------------------------------------------- chat
  const chat = el('div', 'wb-chat', `<div class="wb-chat-log"></div><div class="wb-frame wb-chat-input wb-hidden"><label>${t('chat.say')}</label><input maxlength="140" spellcheck="false" placeholder="${t('chat.ph')}"></div><div class="wb-chat-hint"><span class="wb-net"><i></i><span>${t('net.solo')}</span></span><kbd>Enter</kbd> ${t('chat.chat')} · <kbd>Esc</kbd> ${t('chat.menu')}</div>`, hud);
  const netPill = chat.querySelector('.wb-net'), netText = netPill.lastChild;
  const chatLog = chat.firstChild, chatBox = chat.children[1], chatInput = chatBox.querySelector('input'), chatHint = chat.lastChild;
  let typing = false;
  function addChat(name, text, sys) {
    const m = el('div', 'wb-msg' + (sys ? ' wb-sys' : ''), null, chatLog); // textContent only: chat is untrusted
    if (name) el('b', null, null, m).textContent = String(name).slice(0, 32);
    m.appendChild(document.createTextNode(String(text ?? '').slice(0, 200)));
    while (chatLog.children.length > 8) chatLog.firstChild.remove();
    setTimeout(() => m.classList.add('wb-old'), 9000);
  }
  function openChat() { typing = true; chatBox.classList.remove('wb-hidden'); chatHint.classList.add('wb-hidden'); chat.classList.add('wb-typing'); chatInput.value = ''; setTimeout(() => chatInput.focus(), 0); }
  function closeChat() { typing = false; chatBox.classList.add('wb-hidden'); chatHint.classList.remove('wb-hidden'); chat.classList.remove('wb-typing'); chatInput.blur(); }
  chatInput.addEventListener('keydown', (e) => {
    e.stopPropagation(); // keep gameplay Input from seeing typed keys
    if (e.key === 'Enter') {
      const msg = chatInput.value.trim();
      if (msg) { let sent = false; try { sent = !!(game.net?.connected && game.net.sendChat?.(msg)); } catch (err) { console.warn(err); } if (!sent) addChat(P().name || t('chat.you'), msg); }
      closeChat(); e.preventDefault();
    } else if (e.key === 'Escape') { closeChat(); e.preventDefault(); }
  });
  // keyup is allowed through so held movement keys are released in Input.

  // ---------------------------------------------------------------- toasts
  function toast(text, kind = '', ms = 3200) {
    const t = el('div', 'wb-toast' + (kind ? ' wb-' + kind : ''), null, toasts); t.textContent = String(text);
    while (toasts.children.length > 4) toasts.firstChild.remove();
    setTimeout(() => { t.classList.add('wb-out'); setTimeout(() => t.remove(), 500); }, ms);
    return t;
  }

  // ---------------------------------------------------------------- overlays
  let faint = null, faintT = 0, faintShownSec = -1;
  function showFaint() {
    if (faint) return;
    faintT = num(P().respawnTime, 0) > 0 ? P().respawnTime : 8;
    faint = el('div', 'wb-overlay wb-faint', `<h2>${t('f.fainted')}</h2><p>${t('f.carried', { n: `<b class="wb-num">${Math.ceil(faintT)}</b>` })}</p>`, root);
    faintShownSec = -1; hud.classList.add('wb-dim');
  }
  function hideFaint() { if (!faint) return; faint.remove(); faint = null; if (!questOver) hud.classList.remove('wb-dim'); }

  let questTime = game.questTimeLimit || 50 * 60, questOver = false, questOv = null, nextEl = null;
  const brokenParts = [];
  const nextLine = () => `<div class="wb-next">${t('f.nextHunt', { t: '<b class="wb-num">--</b>' })}</div>`;
  function showComplete(mon) {
    if (game.questRuntime) return; // real quests: the quest runtime shows server-granted rewards instead
    if (questOver) return; questOver = true; hud.classList.add('wb-dim'); hideFaint();
    const used = 50 * 60 - questTime;
    const name = parseName(mon?.name).name;
    const rew = makeRewards(name, brokenParts, (Math.floor(used) * 7919 + name.length * 131) >>> 0);
    const ov = el('div', 'wb-overlay wb-complete', `<div class="wb-banner"><h1>${t('f.questComplete')}</h1>
      <div class="wb-sub">${t('f.slainSub', { m: esc(name.toUpperCase()) })} · <b class="wb-num">${fmtTime(used)}</b></div></div><div class="wb-rule"></div>
      <div class="wb-frame wb-rewards"><h3>${t('f.spoils')}</h3>${rew.items.map((r, i) => `<div class="wb-reward r${r.rarity}" style="animation-delay:${0.9 + i * 0.12}s"><i></i><span>${esc(r.name)}</span><b class="wb-num">×${r.qty}</b></div>`).join('')}
      <div class="wb-bounty">${t('f.bounty', { n: `<b class="wb-num">${rew.bounty.toLocaleString()}</b>` })}</div></div>${nextLine()}`, root);
    questOv = ov; nextEl = ov.querySelector('.wb-next b');
    return ov;
  }
  function showFailed() {
    if (questOver) return; questOver = true;
    if (game.questRuntime) { events.emit('quest:failed', { reason: 'Time expired' }); return; } // runtime shows the result
    hud.classList.add('wb-dim');
    questOv = el('div', 'wb-overlay wb-complete', `<div class="wb-banner"><h1 style="filter:grayscale(.7) drop-shadow(0 .05em .05em #000)">${t('f.questFailed')}</h1><div class="wb-sub">${t('f.cold')}</div></div>${nextLine()}`, root);
    nextEl = questOv.querySelector('.wb-next b');
    events.emit('quest:failed', {});
  }

  // ---------------------------------------------------------------- monster name card
  let cardShown = false;
  function parseName(raw, english) {
    raw = String(raw || 'Monster').trim();
    const m = M() || {};
    if (!english && monsterTitle(raw)) return { name: monsterShort(raw), title: monsterTitle(raw) };
    let name = raw, title = '';
    const sp = raw.split(/\s*[·,—–:]\s*|\s+-\s+/);
    if (sp.length > 1) { name = sp[0]; title = sp.slice(1).join(' '); }
    else { const k = raw.search(/\s+the\s+/i); if (k > 0) { name = raw.slice(0, k); title = raw.slice(k).trim(); } }
    if (!title) title = m.epithet || (m.title ? 'The ' + m.title : t('f.apex'));
    title = title.replace(/^the\b/i, 'The');
    return { name, title };
  }
  function showCard() {
    const mon = M(); if (cardShown || !mon) return; cardShown = true;
    const { name, title } = parseName(mon.name);
    card.querySelector('.wb-card-name').textContent = name.toUpperCase();
    card.querySelector('.wb-card-title').textContent = title.replace(/^the\b/i, 'The'); card.querySelector('.wb-card-kicker').textContent = t('f.sighted');
    card.classList.remove('wb-show'); void card.offsetWidth; card.classList.add('wb-show');
  }

  // ---------------------------------------------------------------- title screen
  let title = null;
  if (!shot) {
    const controls = CONTROLS;
    title = el('div', 'wb-title', `<div class="wb-embers"></div><div class="wb-logo">${SVG.emblem}<div class="wb-logo-word">WILDBOUND</div><div class="wb-logo-tag">${t('title.tag')}</div></div>
      <div class="wb-quests"><div class="wb-quest-label">${t('title.choose')}</div><div class="wb-quest-row">
        ${[['varkhul', 'title.ground'], ['wyvern', 'title.sky'], ['brute', 'title.colossal']].map(([k, d]) => `<button class="wb-quest${(k === 'varkhul' ? game.hunt !== 'wyvern' && game.hunt !== 'brute' : game.hunt === k) ? ' wb-on' : ''}" data-hunt="${k}"><b>${esc(monsterShort(k).toUpperCase())}</b><span>${esc(monsterTitle(k))} · ${t(d)}</span></button>`).join('')}</div></div>
      <div class="wb-cta">${t('title.cta')}</div>
      <div class="wb-frame wb-controls">${controls.map(([k, v]) => `<div><span class="wb-kbd">${k}</span>${v}</div>`).join('')}</div><div class="wb-ver">v0.1 · <span class="wb-ver-net">${params.get('online') === '1' ? t('net.connecting') : t('net.soloOffline')}</span> ${langToggleHtml('wb-title-lang')}</div>`, root);
    bindLangToggle(title);
    title.querySelectorAll('[data-lang]').forEach((b) => b.addEventListener('mousedown', (e) => e.stopPropagation()));
    const emb = title.firstChild;
    for (let i = 0; i < 28; i++) { const e = el('i', null, null, emb); e.style.cssText = `left:${Math.random() * 100}%;animation-duration:${7 + Math.random() * 9}s;animation-delay:${-Math.random() * 14}s;--dx:${(Math.random() - 0.5) * 160}px;transform:scale(${0.5 + Math.random()})`; }
    hud.style.opacity = '0';
    // Quarry selection: switching reloads with ?hunt= (the monster is built at boot).
    title.querySelectorAll('.wb-quest').forEach((b) => {
      const pick = (e) => {
        e.stopPropagation(); e.preventDefault();
        if (b.classList.contains('wb-on')) return;
        const u = new URL(location.href); b.dataset.hunt !== 'varkhul' ? u.searchParams.set('hunt', b.dataset.hunt) : u.searchParams.delete('hunt'); location.href = u.toString();
      };
      b.addEventListener('mousedown', pick); b.addEventListener('touchend', pick);
    });
    title.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      try { game.renderer?.domElement?.requestPointerLock?.(); } catch { /* headless */ }
      title.classList.add('wb-leave'); hud.style.transition = 'opacity 1.2s 0.3s'; hud.style.opacity = '1';
      setTimeout(() => { title?.remove(); title = null; }, 950);
      started = true; events.emit('ui:start', {});
      setTimeout(() => toast(t('f.startToast')), 900);
    });
  }
  let started = shot || !title;

  // ---------------------------------------------------------------- pause menu & settings
  const settings = { sens: lsGet('sens', 1), vol: (() => { try { const v = parseFloat(localStorage.getItem('wildbound.volume')); if (isFinite(v)) return v; } catch { /* */ } return lsGet('vol', 0.8); })(), low: params.get('low') === '1' };
  const applyVol = () => { try { game.audio?.setVolume?.(settings.vol); } catch (e) { console.warn(e); } };
  let pause = null, savedScale = 1;
  function openPause() {
    if (pause || !started || questOver) return;
    if (typing) closeChat();
    pause = el('div', 'wb-overlay wb-pause', `<div class="wb-frame wb-panel"><h2>${t('pause.title')}</h2><div class="wb-rule"></div>
      <div class="wb-set"><label>${t('set.sens')}</label><input type="range" min="0.2" max="3" step="0.05" data-k="sens"><output class="wb-num"></output></div>
      <div class="wb-set"><label>${t('set.vol')}</label><input type="range" min="0" max="1" step="0.01" data-k="vol"><output class="wb-num"></output></div>
      <div class="wb-set"><label>${t('set.gfx')}</label><div class="wb-seg"><button class="wb-btn" data-q="high">${t('set.high')}</button><button class="wb-btn" data-q="low">${t('set.low')}</button></div></div>
      <div class="wb-set"><label>${t('set.lang')}</label>${langToggleHtml('wb-seg wb-lang-seg')}</div>
      <div class="wb-actions"><button class="wb-btn wb-primary" data-a="resume">${t('pause.resume')}</button>${game.questRuntime ? `<button class="wb-btn" data-a="abandon">${t('pause.abandon')}</button>` : ''}</div>
      <div class="wb-pause-hint">${game.net?.connected ? t('pause.online') : t('pause.offline')}</div>
      <div class="wb-keys">${CONTROLS.map(([k, v]) => `<span><span class="wb-kbd">${k}</span>${v}</span>`).join('')}</div></div>`, root);
    pause.querySelectorAll('input[type=range]').forEach((inp) => {
      const k = inp.dataset.k, out = inp.nextElementSibling;
      const sync = () => { const v = +inp.value; settings[k] = v; out.textContent = k === 'vol' ? Math.round(v * 100) + '%' : v.toFixed(2); inp.style.setProperty('--p', ((v - inp.min) / (inp.max - inp.min)) * 100 + '%'); lsSet(k, v); if (k === 'vol') applyVol(); };
      inp.value = settings[k]; sync(); inp.addEventListener('input', sync);
      inp.addEventListener('keydown', (e) => e.stopPropagation());
    });
    pause.querySelectorAll('[data-q]').forEach((b) => {
      b.classList.toggle('wb-on', (b.dataset.q === 'low') === settings.low);
      b.addEventListener('click', () => {
        const low = b.dataset.q === 'low'; if (low === settings.low) return;
        const u = new URL(location.href); low ? u.searchParams.set('low', '1') : u.searchParams.delete('low'); location.href = u.toString();
      });
    });
    pause.querySelector('[data-a=resume]').addEventListener('click', closePause);
    bindLangToggle(pause);
    pause.querySelector('[data-a=abandon]')?.addEventListener('click', () => { if (confirm(t('pause.abandonQ'))) { closePause(); game.questRuntime?.abandon(); } });
    pause.addEventListener('mousedown', (e) => { if (e.target === pause) closePause(); });
    if (!game.net?.connected && game.engine) { savedScale = game.engine.timeScale || 1; game.engine.timeScale = 0; }
  }
  function closePause() {
    if (!pause) return; pause.remove(); pause = null;
    if (game.engine && game.engine.timeScale === 0) game.engine.timeScale = savedScale;
    try { game.renderer?.domElement?.requestPointerLock?.(); } catch { /* ignore */ }
  }
  addEventListener('keydown', (e) => {
    if (title || typing) return;
    if (e.code === 'Escape') { pause ? closePause() : openPause(); }
    else if (e.code === 'Enter' && !pause && started) { openChat(); e.preventDefault(); }
    else if (!pause && started && /^Digit[1-9]$/.test(e.code) && +e.code.slice(5) <= ITEMS.length) selectItem(+e.code.slice(5) - 1);
  });
  let lockedOnce = false;
  document.addEventListener('pointerlockchange', () => {
    const locked = !!document.pointerLockElement;
    if (locked) lockedOnce = true;
    else if (lockedOnce && !typing && !questOver) openPause(); // Esc while locked is eaten by the browser
  });
  applyVol();

  // Input shaping: apply look sensitivity and swallow gameplay input while a menu/chat/title is up.
  if (game.input && typeof game.input.poll === 'function') {
    const orig = game.input.poll.bind(game.input);
    game.input.poll = () => {
      const s = orig();
      if (s?.look) { s.look.x *= settings.sens; s.look.y *= settings.sens; }
      if (s?.item && !(title || pause || typing)) s.item = useSelected();
      if (s && (title || pause || typing)) {
        for (const k in s) if (typeof s[k] === 'boolean') s[k] = false;
        if (s.move) s.move.x = s.move.y = 0; if (s.look) s.look.x = s.look.y = 0;
      }
      return s;
    };
  }

  // ---------------------------------------------------------------- events
  const hitzoneOf = (part) => {
    if (part && typeof part === 'object') return num(part.hitzone, 1);
    const mon = M(); const p = mon?.parts?.find?.((q) => q.name === part); return num(p?.hitzone, 1);
  };
  let lastHitT = 0;
  events.on('hit', (h) => {
    const nowT = performance.now(); if (nowT - lastHitT > 450) stackN = -1; lastHitT = nowT;
    if (!h || h.target === game.player || h.target === 'player') return;
    const pt = h.point; if (!pt) return;
    const d = dmg[dmgIdx]; dmgIdx = (dmgIdx + 1) % DMG_POOL;
    const weak = hitzoneOf(h.part) > 1 || h.isCrit; // both get the bigger pop; colour differs via class
    const val = Math.max(1, Math.round(num(h.damage, 0)));
    d.p.set(num(pt.x, 0), num(pt.y, 0), num(pt.z, 0)); d.max = weak ? 1.15 : 0.95; d.life = d.max; stackN = (stackN + 1) % 7; const ang = stackN * 2.39996, rad = stackN ? fs * (1.1 + 0.25 * stackN) : 0; d.ox = Math.cos(ang) * rad * 1.6; d.oy = Math.sin(ang) * rad * 0.8; // golden-angle spread so bursts don't stack
    d.el.className = 'wb-dmg wb-num' + (h.isCrit ? ' wb-crit' : hitzoneOf(h.part) > 1 ? ' wb-weak' : '');
    d.el.textContent = val;
  });
  let hitFlash = 0;
  events.on('player:damaged', (e) => {
    const p = P(); const frac = clamp01(num(e?.amount, 10) / Math.max(1, num(p.maxHp, 150)));
    hitFlash = Math.min(1, 0.45 + frac * 3);
    vigHit.style.transition = 'none'; vigHit.style.opacity = hitFlash.toFixed(2); void vigHit.offsetWidth; vigHit.style.transition = ''; vigHit.style.opacity = '0';
    hpBar.b.classList.remove('wb-hurt'); void hpBar.b.offsetWidth; hpBar.b.classList.add('wb-hurt');
    trailHold = 0.7;
  });
  events.on('player:died', showFaint);
  events.on('player:respawn', hideFaint);
  events.on('monster:roar', () => showCard());
  events.on('monster:partBreak', (e) => {
    const part = e?.part; const nm = typeof part === 'string' ? part : part?.name || 'Part';
    brokenParts.push(nm);
    breakQueue.push(partName(nm)); if (!breakBusy) nextBreak();
  });
  const breakEl = el('div', 'wb-break', `<div class="wb-break-burst"></div>${SVG.shard}<div class="wb-break-kicker">${t('f.partBroken')}</div><div class="wb-break-name"></div><div class="wb-break-sub">${t('f.bonus')}</div>`, hud);
  const breakQueue = []; let breakBusy = false;
  function nextBreak() {
    const nm = breakQueue.shift(); if (!nm) { breakBusy = false; return; }
    breakBusy = true;
    const mon = M(); const who = parseName(mon?.name).name;
    breakEl.querySelector('.wb-break-name').textContent = nm.toUpperCase();
    breakEl.querySelector('.wb-break-sub').textContent = t('f.shattered', { m: who, p: nm });
    breakEl.classList.remove('wb-show'); void breakEl.offsetWidth; breakEl.classList.add('wb-show');
    setTimeout(nextBreak, breakQueue.length ? 1600 : 2700);
  }
  events.on('monster:died', (e) => setTimeout(() => showComplete(e?.monster || M()), shot ? 0 : 1500));
  // New hunt (boss respawned by src/core/quest.js): clear the result screen and reset quest state.
  events.on('quest:start', () => {
    questOv?.remove(); questOv = nextEl = null; questOver = false; questTime = 50 * 60; brokenParts.length = 0; cardShown = false;
    for (const k in warned) delete warned[k];
    hud.classList.remove('wb-dim'); toast(t('f.newQuarry'));
  });
  events.on('net:chat', (m) => { if (!m) return; addChat(m.name || m.from || t('f.hunterName'), m.text ?? m.message ?? ''); });
  events.on('net:join', (m) => { if (!m?.self) addChat(null, t('net.joined', { name: m?.name || t('net.aHunter') }), true); });
  events.on('net:status', (st) => {
    if (!st) return;
    const was = netState.connected;
    Object.assign(netState, st);
    if (st.connected && !was) toast((st.isHost ? t('net.hosting') : t('net.joinedHunt')) + (st.room ? ' · ' + st.room : ''));
    else if (!st.connected && was) toast(t('net.lost'));
    last.net = null; refreshNet();
  });
  events.on('net:leave', (m) => addChat(null, t('net.left', { name: m?.name || t('net.aHunter') }), true));
  events.on('item:used', () => { localPotions = Math.max(0, localPotions - 1); });
  events.on('player:heal', () => flashItem(0));
  function flashItem(i = sel) { const e = slots[i]?.e; if (!e) return; e.classList.remove('wb-used'); void e.offsetWidth; e.classList.add('wb-used'); }

  // ---------------------------------------------------------------- per-frame update
  const last = {}; // change-detection cache
  const set = (key, v, fn) => { if (last[key] !== v) { last[key] = v; fn(v); } };
  let trail = 1, trailHold = 0, mapAcc = 0, partyAcc = 0, lastHp = null, warned = {};
  const proj = (p, out) => { v3.copy(p).project(game.camera); out.x = (v3.x * 0.5 + 0.5) * W; out.y = (-v3.y * 0.5 + 0.5) * H; return v3.z < 1 && v3.z > -1; };
  const sp = { x: 0, y: 0 };

  function update(dt, rawDt) {
    // Clamp: the main loop can hand us a negative first-frame delta (rAF timestamp < boot time).
    rawDt = Math.min(0.1, Math.max(0, num(rawDt, 1 / 60))); dt = Math.min(0.1, Math.max(0, num(dt, rawDt)));
    const p = P(); const mon = M();

    // name & vitals
    set('name', String(p.name || t('f.hunterName')).toUpperCase(), (v) => (nameEl.textContent = v));
    const maxHp = Math.max(1, num(p.maxHp, 150)), hp = Math.max(0, Math.min(maxHp, num(p.hp, maxHp)));
    const hpF = hp / maxHp;
    if (lastHp !== null && hp > lastHp && trail < hpF) trail = hpF;
    lastHp = hp;
    // redHp (player module) is the absolute top of the recoverable segment; fall back to a pure delayed trail.
    const red = num(p.redHp ?? p.recoverableHp, NaN);
    const trailTarget = isFinite(red) && red > hp ? clamp01(red / maxHp) : hpF;
    if (trailHold > 0) trailHold -= rawDt; else if (trail > trailTarget) trail = Math.max(trailTarget, trail - rawDt * 0.35);
    if (trail < hpF) trail = hpF;
    set('hpW', Math.round(maxHp), (v) => hpBar.b.style.setProperty('--w', `${Math.min(34, 12 + v * 0.0533)}em`));
    set('hpF', Math.round(hpF * 1000), (v) => (hpBar.fill.style.transform = `scaleX(${v / 1000})`));
    set('hpT', Math.round(trail * 1000), (v) => (hpBar.trail.style.transform = `scaleX(${v / 1000})`));
    set('hpN', `${Math.ceil(hp)} / ${Math.round(maxHp)}`, (v) => (hpNum.textContent = v));
    set('low', hpF < 0.3 && hp > 0, (v) => { hpBar.b.classList.toggle('wb-low', v); vigLow.style.opacity = v ? '1' : '0'; });

    const maxSt = Math.max(1, num(p.maxStamina, 100)), st = Math.max(0, num(p.stamina, maxSt));
    set('stW', Math.round(maxSt), (v) => stBar.b.style.setProperty('--w', `${Math.min(32, 6 + v * 0.13)}em`));
    set('stF', Math.round((st / maxSt) * 500), (v) => (stBar.fill.style.transform = `scaleX(${v / 500})`));
    set('exh', !!(p.exhausted || st / maxSt < 0.12), (v) => stBar.b.classList.toggle('wb-exhaust', v));

    const sh = clamp01(num(p.sharpness, 1));
    const tier = TIERS.find((t) => sh >= t[0]);
    set('shF', Math.round(sh * 200), (v) => { bladeFill.style.transform = `scaleX(${Math.max(0.04, v / 200)})`; ringFg.style.strokeDashoffset = String(100 - v / 2); });
    set('shT', tier[1], () => { bladeFill.style.color = tier[2]; bladeTier.style.color = tier[2]; bladeTier.textContent = tier[1]; crest.style.color = tier[2]; });

    // item
    if (game.fieldItems) { // live counts for every carried item
      ITEMS.forEach((it, k) => { if (it.id === 'whetstone') return; const c = game.fieldItems.count(it.id); set('fi' + k, c, (v) => { slots[k].c.textContent = v; slots[k].e.classList.toggle('wb-empty', v <= 0); }); });
    }
    const pot = num(p.potions ?? p.healItems ?? p.items?.potion ?? p.inventory?.potion, localPotions);
    const prevPot = last.pot;
    if (!game.fieldItems) set('pot', pot, (v) => { if (prevPot != null && v < prevPot) flashItem(0); itemCount.textContent = v; slots[0].e.classList.toggle('wb-empty', v <= 0); });
    const shState = p.state === 'whetstone';
    set('whet', shState, (v) => { if (v) flashItem(1); });

    // quest timer (gameplay time; frozen until the hunt starts and while paused)
    if (started && !questOver && !pause) questTime -= dt;
    { // ailments
      const list = game.status?.list?.() || [];
      const key = list.map((a) => a.kind + a.level + Math.ceil(a.t)).join('|');
      set('ail', key, () => {
        for (const k in ailEls) if (!list.some((a) => a.kind === k)) { ailEls[k].remove(); delete ailEls[k]; }
        for (const a of list) {
          const d = AIL[a.kind]; if (!d) continue;
          const e = ailEls[a.kind] || (ailEls[a.kind] = el('div', 'wb-ail ' + d.cls, '<i></i><span></span><b class="wb-num"></b>', ailRow));
          e.children[1].textContent = d.label[a.level] || a.kind.toUpperCase(); e.children[2].textContent = Math.max(0, Math.ceil(a.t)) + 's';
        }
        hpBar.b.classList.toggle('wb-poisoned', list.some((a) => a.kind === 'poison'));
        hpBar.b.classList.toggle('wb-burning', list.some((a) => a.kind === 'burn'));
      });
    }
    if (nextEl && game.quest?.respawnAt != null) set('qn', fmtTime(Math.max(0, game.quest.respawnAt - (game.quest.clock || 0))), (v) => { if (nextEl) nextEl.textContent = v; });
    set('qt', fmtTime(questTime), (v) => (timerVal.textContent = v));
    set('qw', questTime < 300, (v) => timer.classList.toggle('wb-warn', v));
    for (const mins of [10, 5, 1]) if (questTime < mins * 60 && !warned[mins] && started) { warned[mins] = 1; toast(t('f.minsLeft', { n: mins, s: mins > 1 ? 's' : '' })); }
    if (questTime <= 0 && !questOver) showFailed();

    // monster: card trigger, limp, lock-on
    if (mon && mon.position && p.position && !cardShown && started) {
      const dx = mon.position.x - p.position.x, dz = mon.position.z - p.position.z;
      if (dx * dx + dz * dz < 1600) showCard();
    }
    const mf = mon ? num(mon.hp, 1) / Math.max(1, num(mon.maxHp, 1)) : 1;
    const alive = !!mon && mf > 0 && mon.state !== 'dead';
    const mst = String(mon?.state || monState || '');
    set('limp', alive && (mf < 0.25 || !!mon.limping), (v) => { limp.classList.toggle('wb-hidden', !v); if (v) toast(t('f.limping')); });
    set('rage', alive && !!(mon.enraged || mst === 'enraged' || mst === 'rage'), (v) => { chipRage.classList.toggle('wb-hidden', !v); if (v) toast(t('f.enraged')); });
    set('tired', alive && !!(mon.exhausted || mon.tired || mst === 'exhausted' || monState === 'exhausted'), (v) => { chipTired.classList.toggle('wb-hidden', !v); if (v) toast(t('f.exhausted')); });

    const lt = p.lockTarget;
    let lp = null;
    if (lt) {
      if (typeof lt.getLockPoint === 'function') lp = lt.getLockPoint(v3b);
      else if (lt.isVector3) lp = lt;
      else if (lt.center?.isVector3 && lt.center.lengthSq() > 0) lp = lt.center;
      else if (lt.lockPoint?.isVector3) lp = lt.lockPoint;
      else if (lt.position) { lp = v3b.copy(lt.position); if (lt.object3d && !lt.lockPoint) lp.y += num(lt.lockHeight, 0); }
      else if (lt.sphere?.center) lp = lt.sphere.center;
    }
    const showRet = !!lp && proj(lp, sp);
    set('ret', showRet, (v) => { reticle.classList.toggle('wb-hidden', !v); if (v) { reticle.classList.remove('wb-in'); void reticle.offsetWidth; reticle.classList.add('wb-in'); } });
    if (showRet) reticle.style.transform = `translate3d(${sp.x.toFixed(1)}px,${sp.y.toFixed(1)}px,0)`;

    // off-screen hunter indicators
    edgeFor(0, !p.dead && started ? p.position : null, t('f.you'));
    let ei = 1;
    game.remotePlayers?.forEach?.((rp, id) => { if (ei > 3) return; const pos = rp?.object3d?.position || rp?.position; const info = Array.isArray(game.net?.roomPlayers) ? game.net.roomPlayers.find((q) => q.id === id) : null; edgeFor(ei++, pos, String(info?.name || rp?.name || t('f.ally')).slice(0, 12)); });
    for (; ei < 4; ei++) edgeFor(ei, null, '');

    // damage numbers
    for (const d of dmg) {
      if (d.life <= 0) continue;
      d.life -= rawDt;
      if (d.life <= 0 || !proj(d.p, sp)) { d.el.style.opacity = '0'; d.life = 0; continue; }
      const t = 1 - d.life / d.max; // 0..1
      const rise = (1 - Math.pow(1 - t, 3)) * fs * 3.2;
      const pop = t < 0.12 ? 1.5 - (t / 0.12) * 0.5 : 1;
      const op = t < 0.65 ? 1 : 1 - (t - 0.65) / 0.35;
      d.el.style.transform = `translate3d(${(sp.x + d.ox).toFixed(1)}px,${(sp.y + d.oy - fs - rise).toFixed(1)}px,0) translate(-50%,-50%) scale(${pop.toFixed(3)})`;
      d.el.style.opacity = op.toFixed(3);
    }

    // death overlay
    if (!faint && hp <= 0 && (p.state === 'dead' || p.state === 'fainted' || p.dead)) showFaint();
    if (faint) {
      faintT -= rawDt;
      if (num(p.respawnTime, 0) > 0) faintT = p.respawnTime;
      const s = Math.max(0, Math.ceil(faintT));
      if (s !== faintShownSec) { faintShownSec = s; const b = faint.querySelector('b'); if (b) b.textContent = s; }
      if (faintT < -0.5 && hp > 0) hideFaint();
    }

    // minimap ~30Hz
    mapAcc += rawDt; if (mapAcc >= 1 / 30) { mapAcc = 0; drawMap(p, mon); }
    partyAcc += rawDt; if (partyAcc >= 0.2) { partyAcc = 0; updateParty(p); }
  }

  // ---------------------------------------------------------------- minimap
  const fwd = new THREE.Vector3();
  function drawMap(p, mon) {
    const dpr = Math.min(2, devicePixelRatio || 1);
    const size = Math.round(cvs.clientWidth * dpr) || 160;
    if (cvs.width !== size) { cvs.width = cvs.height = size; }
    const r = size / 2, range = 70, k = r / range;
    game.camera.getWorldDirection(fwd); let fx = fwd.x, fz = fwd.z; const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
    const rx = -fz, rz = fx; // camera right on ground plane
    const toMap = (wx, wz) => { const dx = wx - (p.position?.x || 0), dz = wz - (p.position?.z || 0); return [r + (dx * rx + dz * rz) * k, r - (dx * fx + dz * fz) * k]; };
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, size, size);
    ctx.save(); ctx.beginPath(); ctx.arc(r, r, r, 0, Math.PI * 2); ctx.clip();
    const g = ctx.createRadialGradient(r, r * 0.9, r * 0.1, r, r, r);
    g.addColorStop(0, 'rgba(58,48,34,0.9)'); g.addColorStop(1, 'rgba(14,11,8,0.92)'); ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
    // cached terrain relief, drawn in world space under the camera-aligned transform
    const rel = getRelief(p);
    if (rel) {
      ctx.save(); ctx.translate(r, r); ctx.transform(rx * k, -fx * k, rz * k, -fz * k, 0, 0);
      ctx.globalAlpha = 0.85; ctx.imageSmoothingEnabled = true;
      ctx.drawImage(rel.c, rel.x0 - (p.position?.x || 0), rel.z0 - (p.position?.z || 0), rel.span, rel.span);
      ctx.restore();
      const v = ctx.createRadialGradient(r, r, r * 0.55, r, r, r); v.addColorStop(0, 'rgba(14,11,8,0)'); v.addColorStop(1, 'rgba(14,11,8,0.75)');
      ctx.fillStyle = v; ctx.fillRect(0, 0, size, size);
    }
    // range rings
    ctx.strokeStyle = 'rgba(217,182,115,0.13)'; ctx.lineWidth = dpr;
    for (const rr of [20, 40, 60]) { ctx.beginPath(); ctx.arc(r, r, rr * k, 0, Math.PI * 2); ctx.stroke(); }
    // world boundary
    const br = num(game.world?.bounds?.radius, 0);
    if (br) { const [cx, cy] = toMap(0, 0); ctx.strokeStyle = 'rgba(255,138,61,0.45)'; ctx.lineWidth = 2 * dpr; ctx.setLineDash([4 * dpr, 4 * dpr]); ctx.beginPath(); ctx.arc(cx, cy, br * k, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
    // view cone
    ctx.fillStyle = 'rgba(246,226,170,0.07)'; ctx.beginPath(); ctx.moveTo(r, r); ctx.arc(r, r, r, -Math.PI / 2 - 0.5, -Math.PI / 2 + 0.5); ctx.closePath(); ctx.fill();
    // remote players
    if (game.remotePlayers?.forEach) game.remotePlayers.forEach((rp) => {
      const pos = rp?.object3d?.position || rp?.position; if (!pos) return;
      const [x, y] = toMap(pos.x, pos.z); const cl = clampToDisc(x, y, r, 6 * dpr);
      ctx.fillStyle = '#5fd4e8'; ctx.strokeStyle = '#06121a'; ctx.lineWidth = 1.5 * dpr; ctx.beginPath(); ctx.arc(cl[0], cl[1], 4 * dpr, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    });
    // monster
    if (mon?.position && num(mon.hp, 1) > 0) {
      const [x, y] = toMap(mon.position.x, mon.position.z); const cl = clampToDisc(x, y, r, 9 * dpr); const s = 7 * dpr * (cl[2] ? 0.8 : 1);
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 260);
      ctx.fillStyle = `rgba(255,110,40,${0.18 + pulse * 0.22})`; ctx.beginPath(); ctx.arc(cl[0], cl[1], s * 2, 0, Math.PI * 2); ctx.fill();
      ctx.save(); ctx.translate(cl[0], cl[1]); ctx.rotate(Math.PI / 4);
      ctx.fillStyle = '#ff7a2e'; ctx.strokeStyle = '#2a0e04'; ctx.lineWidth = 1.5 * dpr; ctx.fillRect(-s * 0.7, -s * 0.7, s * 1.4, s * 1.4); ctx.strokeRect(-s * 0.7, -s * 0.7, s * 1.4, s * 1.4);
      ctx.restore();
    }
    ctx.restore();
    // player arrow (facing relative to camera)
    const f = num(p.facing, 0); const pfx = Math.sin(f), pfz = Math.cos(f);
    const ang = Math.atan2(pfx * rx + pfz * rz, pfx * fx + pfz * fz);
    ctx.save(); ctx.translate(r, r); ctx.rotate(ang); const a = 8 * dpr;
    ctx.fillStyle = '#fff4d6'; ctx.strokeStyle = '#1a120b'; ctx.lineWidth = 1.6 * dpr;
    ctx.beginPath(); ctx.moveTo(0, -a * 1.25); ctx.lineTo(a * 0.8, a * 0.85); ctx.lineTo(0, a * 0.4); ctx.lineTo(-a * 0.8, a * 0.85); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    // compass letters on the ring (north = -Z)
    const heading = Math.atan2(fx, -fz); // 0 when looking north
    const hq = Math.round(heading * 200);
    if (last.hd !== hq) {
      last.hd = hq;
      cards.forEach((c, i) => { const a2 = i * Math.PI / 2 - heading; c.setAttribute('transform', `translate(${(100 + Math.sin(a2) * 93).toFixed(1)} ${(100 - Math.cos(a2) * 93).toFixed(1)})`); });
    }
  }
  let relief = null, reliefFailed = false;
  function getRelief(p) {
    const w = game.world; if (reliefFailed || typeof w?.getHeight !== 'function' || !p.position) return null;
    const px = p.position.x, pz = p.position.z;
    if (relief && Math.hypot(px - relief.cx, pz - relief.cz) < 22) return relief.flat ? null : relief;
    try {
      const N = 72, span = 220, x0 = px - span / 2, z0 = pz - span / 2, st = span / N;
      const hs = new Float32Array(N * N); let mn = Infinity, mx = -Infinity;
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const h = num(w.getHeight(x0 + (i + 0.5) * st, z0 + (j + 0.5) * st), 0); hs[j * N + i] = h; if (h < mn) mn = h; if (h > mx) mx = h; }
      const c = relief?.c || document.createElement('canvas'); c.width = c.height = N;
      const g = c.getContext('2d'), img = g.createImageData(N, N), d = img.data, rng = Math.max(1e-3, mx - mn);
      const water = num(w.waterLevel ?? w.water?.level, -Infinity);
      const br = num(w.bounds?.radius, Infinity);
      const whAt = typeof w.waterHeightAt === 'function' ? w.waterHeightAt : null;
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const o = j * N + i, h = hs[o], t = (h - mn) / rng;
        const hx = hs[j * N + Math.min(N - 1, i + 1)] - hs[j * N + Math.max(0, i - 1)], hz = hs[Math.min(N - 1, j + 1) * N + i] - hs[Math.max(0, j - 1) * N + i];
        const shade = Math.max(-1, Math.min(1, (-hx - hz) / (st * 2.2))); // light from north-west
        const band = Math.abs(((h - mn) / 6) % 1 - 0.5) < 0.06 ? -14 : 0; // contour lines every 6m
        let R = 70 + t * 70 + shade * 38 + band, G = 60 + t * 58 + shade * 32 + band, B = 42 + t * 36 + shade * 22 + band;
        const wx = x0 + (i + 0.5) * st, wz = z0 + (j + 0.5) * st;
        const wh = whAt ? whAt(wx, wz) : null;
        if ((wh != null && wh > h - 0.05) || (!whAt && h < water)) { R = 46; G = 84; B = 96; }
        if (Math.hypot(wx, wz) > br) { R *= 0.45; G *= 0.45; B *= 0.45; }
        d[o * 4] = R; d[o * 4 + 1] = G; d[o * 4 + 2] = B; d[o * 4 + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      relief = { c, x0, z0, span, cx: px, cz: pz, flat: rng < 0.5 };
      return relief.flat ? null : relief;
    } catch (e) { reliefFailed = true; console.warn('[ui] minimap relief disabled', e); return null; }
  }
  function clampToDisc(x, y, r, pad) {
    const dx = x - r, dy = y - r, d = Math.hypot(dx, dy), m = r - pad;
    return d > m ? [r + (dx / d) * m, r + (dy / d) * m, true] : [x, y, false];
  }

  // ---------------------------------------------------------------- party list
  const netState = { connected: false, isHost: false, room: '' };
  function refreshNet() {
    const n = game.net; const on = !!(n?.connected ?? netState.connected);
    const count = Math.max(1, Array.isArray(n?.roomPlayers) && n.roomPlayers.length ? n.roomPlayers.length : num(n?.onlineCount, 1));
    const rtt = num(n?.rtt, NaN);
    const txt = on ? `${netState.isHost ? t('net.host') : t('net.coop')}${netState.room ? ' · ' + netState.room : ''} · ${t('net.hunters', { n: count, s: count === 1 ? '' : 's' })}${isFinite(rtt) && rtt > 0 ? ` · ${Math.round(rtt)}ms` : ''}` : (params.get('online') === '1' ? t('net.offlineSolo') : t('net.solo'));
    set('net', txt + on, () => {
      netText.textContent = txt; netPill.classList.toggle('wb-on', on);
      const v = root.querySelector('.wb-ver-net'); if (v) v.textContent = on ? t('net.coopOnline') : t('net.soloOffline');
    });
  }
  const PCOL = ['#6fcf86', '#5fd4e8', '#e8a35f', '#c58cf0'];
  function updateParty(p) {
    refreshNet();
    const on = !!game.net?.connected;
    set('party', on, (v) => party.classList.toggle('wb-hidden', !v));
    if (!on) return;
    const rows = [{ id: '__self', name: p.name || t('f.hunterName'), hp: num(p.hp, 0), max: num(p.maxHp, 150) }];
    game.remotePlayers?.forEach?.((rp, id) => {
      const s = rp?.state || rp?.lastState || rp || {};
      const rpInfo = Array.isArray(game.net?.roomPlayers) ? game.net.roomPlayers.find((q) => q.id === id) : null;
      rows.push({ id, name: rpInfo?.name || rp?.name || s.name || `${t('f.hunterName')} ${String(id).slice(-4)}`, hp: num(rp?.hp ?? s.hp, 1), max: num(rp?.maxHp ?? s.maxHp, 150) });
    });
    const seen = new Set();
    rows.forEach((r, i) => {
      seen.add(r.id);
      let row = partyRows.get(r.id);
      if (!row) {
        const e = el('div', 'wb-frame wb-pm', `<div class="wb-pm-top"><span class="wb-pm-name"><i></i><span></span></span><span class="wb-num"></span></div><div class="wb-pm-bar"><b></b></div>`, party);
        row = { e, nm: e.querySelector('.wb-pm-name span'), dot: e.querySelector('i'), hp: e.querySelector('.wb-pm-top > .wb-num'), bar: e.querySelector('b'), k: '' };
        partyRows.set(r.id, row);
      }
      const f = clamp01(r.hp / Math.max(1, r.max));
      const key = `${r.name}|${Math.ceil(r.hp)}|${i}`;
      if (row.k !== key) {
        row.k = key; row.nm.textContent = r.name; row.dot.style.background = PCOL[i % 4]; row.hp.textContent = Math.ceil(r.hp);
        row.bar.style.transform = `scaleX(${f})`; row.e.classList.toggle('wb-down', r.hp <= 0);
      }
    });
    for (const [id, row] of partyRows) if (!seen.has(id)) { row.e.remove(); partyRows.delete(id); }
  }

  fs = parseFloat(getComputedStyle(root).fontSize) || 13;
  if (shot) started = true;
  return { update, toast: (t) => toast(t), chat: addChat, showCard, openPause, closePause, get paused() { return !!pause; } };
}

// ---------------------------------------------------------------- procedural loot
function makeRewards(monName, broken, seed) {
  let s = seed || 1; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const base = monName && monName !== 'Monster' ? monName : t('loot.wildbeast');
  const mats = t('loot.mats').split('|');
  const adj = t('loot.adj').split('|');
  const items = [];
  const used = new Set();
  for (let i = 0; i < 4; i++) {
    let m; do m = pick(mats); while (used.has(m)); used.add(m);
    const rarity = rnd() < 0.15 ? 3 : rnd() < 0.5 ? 2 : 1;
    items.push({ name: t('loot.item', { adj: rarity >= 2 ? pick(adj) : '', base, mat: m }).trim(), qty: 1 + Math.floor(rnd() * 3), rarity });
  }
  for (const b of broken.slice(0, 3)) items.push({ name: t('loot.frag', { base, part: partName(b).replace(/\b\w/g, (c) => c.toUpperCase()) }), qty: 1, rarity: 3 });
  if (rnd() < 0.35) items.push({ name: t('loot.heart', { base }), qty: 1, rarity: 4 });
  items.sort((a, b) => b.rarity - a.rarity);
  return { items: items.slice(0, 7), bounty: 3000 + Math.floor(rnd() * 40) * 50 };
}
