// Shared helpers for the town UI: formatting, small HTML builders, the framed window shell,
// confirmation dialog and quantity stepper. Panels return HTML strings and handle clicks through
// `data-a` delegation, so a full re-render on every server state update is cheap and leak-free.
import { WEAPONS, ARMOR } from '../../shared/gamedata.js';
import { t, itemName as iName, monsterName, monsterShort, skillName, skillDesc, weaponName, armorName, elementName, durationText, agoText } from '../../shared/i18n.js';
import { itemIcon, coinSvg, glyph, rarityColor, ELEMENT } from './icons.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fmt = (n) => Math.round(+n || 0).toLocaleString('en-US');
export const signed = (n, dp = 0) => (n > 0 ? '+' : n < 0 ? '−' : '±') + Math.abs(n).toFixed(dp);
export function el(tag, cls, html, parent) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; if (parent) parent.appendChild(e); return e; }
export const coins = (n, cls = '') => `<span class="tw-coins ${cls}">${coinSvg()}<b class="tw-num">${fmt(n)}</b></span>`;
export const stars = (n, max = 0) => `<span class="tw-stars" aria-label="${t('c.stars', { n })}">${'★'.repeat(n)}${max > n ? `<i>${'★'.repeat(max - n)}</i>` : ''}</span>`;
export const rarityTag = (r) => `<span class="tw-rar" style="--rc:${rarityColor(r)}">${t('c.rarity', { r })}</span>`;
export const itemName = (id) => iName(id);
export const monName = (m) => (m ? monsterName(m) : '—');
export const monShort = (m) => (m ? monsterShort(m) : '');
export const duration = (ms) => durationText(ms);
export function clock(s) { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); }
export const ago = (tm, now = Date.now()) => agoText(tm, now);
export const elementTag = (e) => (e ? `<span class="tw-el" style="--ec:${ELEMENT[e.type] || '#fff'}">${esc(elementName(e.type))} ${fmt(e.value)}</span>` : `<span class="tw-dim">${t('c.none')}</span>`);
export const cap = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);
export const equipName = (e) => (e.kind === 'weapon' ? (WEAPONS[e.def] && weaponName(e.def)) : (ARMOR[e.def] && armorName(e.def))) || e.def;
export const equipRarity = (e) => (e.kind === 'weapon' ? WEAPONS[e.def]?.rarity : ARMOR[e.def]?.rarity) || 1;
export const equipKind = (e) => (e.kind === 'weapon' ? 'weapon' : ARMOR[e.def]?.slot || 'chest');
export const skillList = (skills) => {
  const ks = Object.entries(skills || {}).filter(([, v]) => v);
  return ks.length ? ks.map(([k, v]) => `<span class="tw-skill" title="${esc(skillDesc(k))}">${esc(skillName(k))} <b>Lv ${v}</b></span>`).join('') : `<span class="tw-dim">${t('c.noSkills')}</span>`;
};

// Materials checklist: [{id, need, have}] → rows with green/red counts. Returns { html, ok }.
export function matsList(mats, box, times = 1) {
  let ok = true;
  const rows = Object.entries(mats || {}).map(([id, q]) => {
    const need = q * times, have = box?.[id] || 0, good = have >= need; if (!good) ok = false;
    return `<li class="tw-mat ${good ? 'ok' : 'no'}">${itemIcon(id, { size: 'sm' })}<span class="tw-mat-n">${esc(itemName(id))}</span>
      <span class="tw-mat-q tw-num"><b>${fmt(have)}</b> / ${fmt(need)}</span>${good ? glyph('check', 'tw-ok-mark') : '<i class="tw-no-mark">✕</i>'}</li>`;
  });
  return { ok, html: rows.length ? `<ul class="tw-mats">${rows.join('')}</ul>` : `<p class="tw-dim">${t('c.noMats')}</p>` };
}
export function costLine(cost, wallet) {
  const ok = wallet >= cost;
  return { ok, html: `<div class="tw-cost ${ok ? 'ok' : 'no'}"><span>${t('c.cost')}</span>${coins(cost)}<span class="tw-cost-have">${t('c.youHave', { c: coins(wallet, 'sm') })}</span></div>` };
}
// Δ row for comparisons: label, from, to, (higher better?)
export function deltaRow(label, from, to, { dp = 0, suffix = '', better = 1, fmtv } = {}) {
  const d = (to - from) * better; const f = fmtv || ((v) => (dp ? v.toFixed(dp) : fmt(v)) + suffix);
  const cls = Math.abs(to - from) < 1e-9 ? 'eq' : d > 0 ? 'up' : 'down';
  const arrow = cls === 'eq' ? '' : cls === 'up' ? '▲' : '▼';
  return `<div class="tw-delta ${cls}"><span>${label}</span><b class="tw-num">${f(from)}</b><i>→</i><b class="tw-num">${f(to)}</b><em>${arrow}${cls === 'eq' ? '—' : (to - from > 0 ? '+' : '−') + (dp ? Math.abs(to - from).toFixed(dp) : fmt(Math.abs(to - from))) + suffix}</em></div>`;
}
export function stepper(value, max, { min = 1, withMax = true } = {}) {
  const dis = (c) => (c ? 'disabled' : '');
  return `<div class="tw-stepper" role="group" aria-label="${t('c.qty')}">
    <button class="tw-step" data-a="qty" data-d="min" ${dis(value <= min)} aria-label="${t('c.min')}">«</button>
    <button class="tw-step" data-a="qty" data-d="-1" ${dis(value <= min)} aria-label="${t('c.less')}">−</button>
    <output class="tw-num">${fmt(value)}</output>
    <button class="tw-step" data-a="qty" data-d="1" ${dis(value >= max)} aria-label="${t('c.more')}">+</button>
    ${withMax ? `<button class="tw-step tw-step-max" data-a="qty" data-d="max" ${dis(value >= max)}>${t('c.max')}</button>` : ''}</div>`;
}
export const applyQty = (cur, d, max, min = 1) => Math.max(min, Math.min(max, d === 'max' ? max : d === 'min' ? min : cur + +d));
export const btn = (label, a, { cls = '', dis = false, why = '', data = '' } = {}) =>
  `<button class="tw-btn ${cls}" data-a="${a}" ${data} ${dis ? 'disabled' : ''}>${label}</button>${dis && why ? `<p class="tw-why">${esc(why)}</p>` : ''}`;
export const empty = (text, sub = '') => `<div class="tw-empty">${glyph('scroll')}<p>${esc(text)}</p>${sub ? `<small>${esc(sub)}</small>` : ''}</div>`;
export const tabsHtml = (tabs, cur) => tabs.map((t) => `<button class="tw-tab ${t.id === cur ? 'on' : ''}" data-tab="${t.id}" role="tab" aria-selected="${t.id === cur}">${esc(t.label)}${t.badge ? `<i class="tw-badge">${t.badge}</i>` : ''}</button>`).join('');
export const swallowTouch = (node) => { for (const ev of ['touchmove']) node.addEventListener(ev, (e) => e.stopPropagation(), { passive: true }); };

// ------------------------------------------------------------------- modal confirm
export function confirmDialog(root, { title, body = '', ok = t('c.confirm'), cancel = t('c.cancel'), danger = false }) {
  return new Promise((resolve) => {
    const ov = el('div', 'tw-modal-ov', `<div class="tw-modal tw-frame" role="dialog" aria-modal="true"><h3>${esc(title)}</h3><div class="tw-modal-body">${body}</div>
      <div class="tw-modal-actions"><button class="tw-btn tw-ghost" data-r="0">${esc(cancel)}</button><button class="tw-btn ${danger ? 'tw-danger' : 'tw-primary'}" data-r="1">${esc(ok)}</button></div></div>`, root);
    swallowTouch(ov);
    const done = (v) => { if (!ov.isConnected) return; ov.classList.add('out'); removeEventListener('keydown', key, true); setTimeout(() => ov.remove(), 160); resolve(v); };
    const key = (e) => { if (e.code === 'Escape') { e.stopImmediatePropagation(); e.preventDefault(); done(false); } else if (e.code === 'Enter') { e.stopImmediatePropagation(); e.preventDefault(); done(true); } };
    addEventListener('keydown', key, true);
    ov.addEventListener('click', (e) => { const b = e.target.closest('[data-r]'); if (b) done(b.dataset.r === '1'); else if (e.target === ov) done(false); });
    confirmDialog.active = done;
    setTimeout(() => ov.querySelector('[data-r="1"]')?.focus({ preventScroll: true }), 30);
  });
}
