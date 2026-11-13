// Original SVG icon set for the town UI. Item icons are keyed by ITEMS[].icon ("shape-hue" or "shape"),
// drawn on a 48×48 grid with a dark ink outline, and placed on a rarity-tinted tile (see .tw-ico in town.css).
import { ITEMS } from '../../shared/gamedata.js';

export const RARITY = ['#bdb6a6', '#bdb6a6', '#8ed08a', '#6cb2f0', '#b38cf5', '#f2c94c', '#ff9450', '#ff5c7a'];
export const rarityColor = (r) => RARITY[Math.max(1, Math.min(7, r | 0))];
export const ELEMENT = { fire: '#ff7a3d', water: '#4fb3ff', thunder: '#ffd84a', ice: '#a6ecff', dragon: '#c86bff', blast: '#ffb347' };

const HUE = { green: '#4fc27a', gold: '#e8b84a', violet: '#a374f0', blue: '#4aa8f0', white: '#e4ecef', teal: '#3cc7b8', red: '#e2553f', grey: '#9aa0a8',
  yellow: '#f2d24a', purple: '#9b6be0', dark: '#4d4652', orange: '#f08a3a', navy: '#41608f' };
const INK = '#140e09';
const o = `stroke="${INK}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"`;
const hl = (d) => `<path d="${d}" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="1.8" stroke-linecap="round"/>`;

const SHAPES = {
  flask: (c) => `<path d="M19 5h10v3h-1.5v9c6.5 2 10.5 7.5 10.5 14 0 8-6.4 13-14 13S10 39 10 31c0-6.5 4-12 10.5-14V8H19z" fill="#2a2420" ${o}/>
    <path d="M12.3 29.5c3-1.6 6.3-1.3 9.5 0s8 1.6 13.9-.5c.2.8.3 1.6.3 2.4 0 6.6-5.3 11.1-12 11.1s-12-4.5-12-11.1c0-.7.1-1.3.3-1.9z" fill="${c}"/>
    ${hl('M16 23c1.3-1.8 2.8-2.9 4.4-3.5')}<rect x="18" y="3" width="12" height="3.5" rx="1" fill="#9a7440" ${o} stroke-width="1.5"/>`,
  jar: (c) => `<rect x="11" y="15" width="26" height="27" rx="6" fill="${c}" ${o}/><rect x="13" y="9" width="22" height="7" rx="2" fill="#8a6a3a" ${o}/>
    <path d="M14 26h20" stroke="rgba(0,0,0,.25)" stroke-width="3"/>${hl('M16 20v14')}`,
  seed: (c) => `<path d="M24 5c8 8 13 15 13 23a13 13 0 0 1-26 0c0-8 5-15 13-23z" fill="${c}" ${o}/><path d="M24 14v26" stroke="rgba(0,0,0,.3)" stroke-width="2"/>${hl('M18 22c-1 3-1.5 6-1 9')}`,
  pod: (c) => `<g stroke="${c}" stroke-width="2.5" stroke-linecap="round"><path d="M24 3v6M24 39v6M3 24h6M39 24h6M9 9l4 4M35 35l4 4M39 9l-4 4M13 35l-4 4"/></g>
    <circle cx="24" cy="24" r="11" fill="${c}" ${o}/><path d="M17 21c3-4 9-4 12 0" stroke="#fff8d8" stroke-width="2.2" fill="none" stroke-linecap="round"/>`,
  coil: () => `<path d="M10 34c0-4 28-4 28 0s-28 4-28 0zM10 27c0-4 28-4 28 0s-28 4-28 0zM10 20c0-4 28-4 28 0s-28 4-28 0z" fill="none" stroke="${INK}" stroke-width="5"/>
    <path d="M10 34c0-4 28-4 28 0s-28 4-28 0zM10 27c0-4 28-4 28 0s-28 4-28 0zM10 20c0-4 28-4 28 0s-28 4-28 0z" fill="none" stroke="#c8ccd2" stroke-width="2.4"/>
    <path d="M24 16V7M20 9l4-3 4 3" stroke="#d9b673" stroke-width="2.4" fill="none" stroke-linecap="round"/>`,
  bomb: (c) => `<circle cx="22" cy="28" r="14" fill="${c}" ${o}/><rect x="18" y="11" width="9" height="5" rx="1.5" fill="#6a5a48" ${o}/>
    <path d="M24 11c2-5 7-6 10-3" fill="none" stroke="#c9a46a" stroke-width="2"/><circle cx="35" cy="8" r="2.6" fill="#ffd36b"/>${hl('M14 24c1-3 3-5 6-6')}`,
  herb: () => `<path d="M24 44V20" stroke="#3d7a3a" stroke-width="3"/><path d="M24 34c-8 0-13-5-14-11 7 0 12 4 14 11zM24 30c7-1 12-6 13-12-7 0-12 4-13 12z" fill="#5fae4a" ${o}/>
    <g fill="#f2c94c" ${o} stroke-width="1.6"><circle cx="24" cy="10" r="4"/><circle cx="18" cy="14" r="4"/><circle cx="30" cy="14" r="4"/><circle cx="20" cy="20" r="4"/><circle cx="28" cy="20" r="4"/></g><circle cx="24" cy="16" r="3.4" fill="#c46b1a"/>`,
  mushroom: () => `<path d="M19 26h10l2 16H17z" fill="#e8dcc0" ${o}/><path d="M6 27c0-11 8-19 18-19s18 8 18 19z" fill="#7fd1c4" ${o}/>
    <g fill="#e9fff8"><circle cx="16" cy="19" r="2.6"/><circle cx="27" cy="15" r="2.2"/><circle cx="33" cy="22" r="2"/><circle cx="22" cy="23" r="1.6"/></g>
    <path d="M6 27c0-11 8-19 18-19" fill="none" stroke="rgba(200,255,240,.5)" stroke-width="4" opacity=".35"/>`,
  lichen: () => `<path d="M5 38c2-10 10-16 19-16s17 6 19 16z" fill="#6b6f73" ${o}/>
    <g fill="#5fb8e0" ${o} stroke-width="1.4"><circle cx="16" cy="28" r="5"/><circle cx="26" cy="25" r="6"/><circle cx="34" cy="31" r="4.5"/><circle cx="21" cy="34" r="3.5"/></g>`,
  honey: () => `<path d="M24 6c7 10 12 16 12 23a12 12 0 0 1-24 0c0-7 5-13 12-23z" fill="#f0a72e" ${o}/>${hl('M18 26c0-3 1.5-6 3-8')}<path d="M16 34c5 3 11 3 16 0" stroke="rgba(120,60,0,.35)" stroke-width="2.4" fill="none"/>`,
  salt: () => `<path d="M6 40l9-14 6 6 6-12 7 9 8 11z" fill="#eef2f4" ${o}/><path d="M15 26l3 14M27 20l-1 20M34 29l-2 11" stroke="rgba(100,130,150,.35)" stroke-width="1.6"/>`,
  ore: (c) => `<path d="M7 33l5-15 12-8 13 5 5 14-8 11H14z" fill="#5a5450" ${o}/><path d="M14 22l8 3 6-7M20 34l7-6 9 2M12 30l5-1" stroke="${c}" stroke-width="3" fill="none" stroke-linecap="round"/>
    <circle cx="22" cy="25" r="2" fill="${c}"/><circle cx="31" cy="30" r="1.8" fill="${c}"/>`,
  crystal: () => `<path d="M20 44l-6-20 7-18 7 18-2 20z" fill="#8fb6ff" ${o}/><path d="M28 44l2-15 7-10 4 12-5 13z" fill="#c4a6ff" ${o}/><path d="M12 44l-3-10 4-8 5 8-1 10z" fill="#a8d8ff" ${o}/>
    <path d="M21 6l1 38" stroke="rgba(255,255,255,.5)" stroke-width="1.4"/><path d="M38 6l-3 5 4-1-3 6" stroke="#ffe36b" stroke-width="2" fill="none"/>`,
  bone: () => `<path d="M13 10a5 5 0 0 1 8 5l13 13a5 5 0 0 1 5 8 5 5 0 0 1-5 6 5 5 0 0 1-8-5L13 24a5 5 0 0 1-8-5 5 5 0 0 1 2-7 5 5 0 0 1 6-2z" fill="#eadfc6" ${o}/>${hl('M16 18l13 13')}`,
  scale: (c) => `<path d="M24 5c10 4 16 12 16 22 0 9-7 16-16 17C15 43 8 36 8 27 8 17 14 9 24 5z" fill="${c}" ${o}/>
    <path d="M24 12c6 3 9 8 9 14M24 12v28" stroke="rgba(0,0,0,.3)" stroke-width="2" fill="none"/>${hl('M15 22c1-4 4-8 8-10')}`,
  plate: (c) => `<path d="M8 12l16-6 16 6v14c0 9-7 15-16 18C15 41 8 35 8 26z" fill="${c}" ${o}/><path d="M14 16l10-4 10 4v9c0 6-4 10-10 12-6-2-10-6-10-12z" fill="rgba(0,0,0,.18)"/>
    <circle cx="13" cy="15" r="1.6" fill="#e8d6a8"/><circle cx="35" cy="15" r="1.6" fill="#e8d6a8"/>${hl('M12 20v6')}`,
  horn: (c) => `<path d="M10 42c4-14 3-24 14-32 6-4 14-4 16-2-8 2-13 8-14 16-1 7 0 13-2 18z" fill="${c}" ${o}/><path d="M16 34c3 1 5 1 8 0M17 27c3 1 6 1 8 0M20 20c3 1 5 1 7 0" stroke="rgba(0,0,0,.3)" stroke-width="1.8" fill="none"/>`,
  club: (c) => `<path d="M6 42l14-14" stroke="${INK}" stroke-width="7" stroke-linecap="round"/><path d="M6 42l14-14" stroke="#7a5a3a" stroke-width="4" stroke-linecap="round"/>
    <circle cx="28" cy="20" r="11" fill="${c}" ${o}/><g fill="#e8dcc0" ${o} stroke-width="1.4"><path d="M28 3l3 7h-6zM45 20l-7 3v-6zM40 8l-3 7-4-4zM16 9l7 2-3 5z"/></g>`,
  claw: () => `<path d="M12 42c0-18 8-30 26-36-8 9-11 19-11 34z" fill="#efe2c4" ${o}/><path d="M17 40c1-12 5-21 13-28" stroke="rgba(0,0,0,.25)" stroke-width="2" fill="none"/>`,
  fang: () => `<path d="M14 6h20c1 10-3 26-10 36-7-10-11-26-10-36z" fill="#f2ead6" ${o}/><path d="M14 6h20v5H14z" fill="#b84a3a" ${o}/>${hl('M19 15c0 7 2 14 4 19')}`,
  barb: () => `<path d="M24 3l6 18-4 2 5 8-4 2 3 13h-12l3-13-4-2 5-8-4-2z" fill="#6b5aa0" ${o}/><path d="M24 7v34" stroke="#c9b8ff" stroke-width="1.6"/>`,
  gem: (c) => `<path d="M24 43L5 19l7-11h24l7 11z" fill="${c}" ${o}/><path d="M5 19h38M12 8l6 11 6-11 6 11 6-11M18 19l6 24 6-24" fill="none" stroke="rgba(0,0,0,.28)" stroke-width="1.6"/>
    <path d="M14 11l3 6" stroke="#fff" stroke-width="2.2" stroke-linecap="round" opacity=".8"/>`,
  membrane: () => `<path d="M6 8c10 2 26 1 36-2-3 10-5 22-4 34-6-4-12-6-18-5-3-9-8-18-14-27z" fill="#8a5a62" ${o}/>
    <path d="M6 8l14 27M12 8l19 21M24 8l13 15" stroke="#3a2226" stroke-width="2" fill="none"/>`,
  gland: () => `<path d="M10 30c-3-8 2-17 10-19 4-6 14-5 17 2 6 3 7 12 2 17-2 7-11 11-18 8-6 1-11-3-11-8z" fill="#e0792e" ${o}/>
    <circle cx="20" cy="24" r="3" fill="#ffd36b"/><circle cx="30" cy="28" r="2.2" fill="#ffd36b"/><circle cx="26" cy="19" r="1.6" fill="#fff0b0"/>`,
  knuckle: () => `<path d="M6 22c0-6 4-10 9-10h20c5 0 8 4 8 9v8c0 6-5 10-11 10H15c-5 0-9-4-9-9z" fill="#4c4a5a" ${o}/>
    <g fill="#8a8aa2" ${o} stroke-width="1.6"><rect x="10" y="14" width="7" height="9" rx="2"/><rect x="19" y="13" width="7" height="10" rx="2"/><rect x="28" y="14" width="7" height="9" rx="2"/></g>
    <path d="M12 32h22" stroke="#ff8a3d" stroke-width="2.4" stroke-linecap="round"/>`,
  slag: () => `<path d="M6 36c0-8 6-11 9-17 4-7 12-9 18-5 7 4 10 11 9 19-1 7-8 10-18 10S6 43 6 36z" fill="#3a3436" ${o}/>
    <path d="M14 34l6-6 5 4 7-9M20 28l-2-6M32 23l4 6" stroke="#ff8a3d" stroke-width="2.4" fill="none" stroke-linecap="round"/>`,
};
const ALIAS = { 'plate-red': ['plate', 'red'], 'plate-navy': ['plate', 'navy'], 'horn-dark': ['horn', 'dark'], 'club-dark': ['club', 'dark'], 'scale-dark': ['scale', 'dark'], horn: ['horn', '#ead9b6'], club: ['club', 'red'] };

export function itemSvg(iconKey) {
  let [shape, hue] = ALIAS[iconKey] || String(iconKey || '').split('-');
  if (!SHAPES[shape]) shape = 'ore';
  const c = HUE[hue] || (hue && hue[0] === '#' ? hue : HUE.grey);
  return `<svg viewBox="0 0 48 48" aria-hidden="true">${SHAPES[shape](c)}</svg>`;
}

// Equipment & facility glyphs (single-colour, use currentColor).
const G = {
  weapon: `<path d="M38 4l6 2-2 6L18 36l-6-6z" fill="currentColor" fill-opacity=".25"/><path d="M38 4l6 2-2 6L18 36l-6-6zM41 8L16 33"/><path d="M8 28l12 12M13 37l-7 7"/>`,
  head: `<path d="M8 30c0-11 7-20 16-20s16 9 16 20v8H8z" fill="currentColor" fill-opacity=".25"/><path d="M8 30c0-11 7-20 16-20s16 9 16 20v8H8zM8 28h32M18 28v6h12v-6M24 10v-5"/>`,
  chest: `<path d="M12 8l6 4h12l6-4 6 8-4 6v20H10V22l-4-6z" fill="currentColor" fill-opacity=".25"/><path d="M12 8l6 4h12l6-4 6 8-4 6v20H10V22l-4-6zM24 12v30M16 22h16"/>`,
  arms: `<path d="M14 8h14l6 18-4 16H16l-4-16z" fill="currentColor" fill-opacity=".25"/><path d="M14 8h14l6 18-4 16H16l-4-16zM12 22h22M15 32h17"/>`,
  waist: `<path d="M6 18h36v10H6z" fill="currentColor" fill-opacity=".25"/><path d="M6 18h36v10H6zM20 15h8v16h-8zM10 28l-2 10M38 28l2 10M17 31l-1 7M31 31l1 7"/>`,
  legs: `<path d="M14 6h20l-2 36h-8l-1-20-1 20h-8z" fill="currentColor" fill-opacity=".25"/><path d="M14 6h20l-2 36h-8l-1-20-1 20h-8zM14 14h20M15 30h7M26 30h7"/>`,
  quest: `<path d="M24 4l16 6v12c0 11-7 18-16 22C15 40 8 33 8 22V10z" fill="currentColor" fill-opacity=".2"/><path d="M24 4l16 6v12c0 11-7 18-16 22C15 40 8 33 8 22V10zM16 32l16-16M32 32L16 16M14 18l4-4M34 18l-4-4"/>`,
  smith: `<path d="M6 16h28c0 6 4 8 8 8v4H30l-2 6h4v6H14v-6h4l-2-6C10 28 6 22 6 16z" fill="currentColor" fill-opacity=".25"/><path d="M6 16h28c0 6 4 8 8 8v4H30l-2 6h4v6H14v-6h4l-2-6C10 28 6 22 6 16zM28 6l6 6M24 10l8-8"/>`,
  alchemy: `<path d="M18 4h12M20 4v12L8 38c-1 3 1 6 4 6h24c3 0 5-3 4-6L28 16V4"/><path d="M13 30h22l5 8c1 3-1 6-4 6H12c-3 0-5-3-4-6z" fill="currentColor" fill-opacity=".3"/><circle cx="22" cy="36" r="2" fill="currentColor"/><circle cx="29" cy="33" r="1.5" fill="currentColor"/>`,
  shop: `<path d="M16 12c0-5 3-8 8-8s8 3 8 8" /><path d="M8 14h32l-3 28H11z" fill="currentColor" fill-opacity=".25"/><path d="M8 14h32l-3 28H11z"/><circle cx="24" cy="28" r="6"/><path d="M24 25v6"/>`,
  storage: `<path d="M6 18h36v22H6z" fill="currentColor" fill-opacity=".25"/><path d="M6 18h36v22H6zM6 18l4-10h28l4 10M6 26h36M21 23h6v6h-6z"/>`,
  dock: `<path d="M24 6v36M16 14h16M8 28c0 8 7 14 16 14s16-6 16-14"/><path d="M4 30l4-4 4 4M36 30l4-4 4 4"/><circle cx="24" cy="8" r="3"/>`,
  menu: `<path d="M8 12h32M8 24h32M8 36h32"/>`,
  close: `<path d="M12 12l24 24M36 12L12 36"/>`,
  lock: `<rect x="11" y="21" width="26" height="20" rx="3" fill="currentColor" fill-opacity=".25"/><rect x="11" y="21" width="26" height="20" rx="3"/><path d="M16 21v-6a8 8 0 0 1 16 0v6M24 29v5"/>`,
  check: `<path d="M8 25l10 10L40 13"/>`,
  card: `<rect x="6" y="9" width="36" height="30" rx="3"/><circle cx="17" cy="22" r="5"/><path d="M10 34c1-4 4-6 7-6s6 2 7 6M28 18h9M28 25h9M28 32h6"/>`,
  gear: `<circle cx="24" cy="24" r="6"/><path d="M24 4v7M24 37v7M4 24h7M37 24h7M10 10l5 5M33 33l5 5M38 10l-5 5M15 33l-5 5"/>`,
  logout: `<path d="M20 8H10v32h10M30 15l9 9-9 9M18 24h21"/>`,
  scroll: `<path d="M12 6h24v32a4 4 0 0 1-4 4H12a4 4 0 0 1-4-4v-4h24"/><path d="M16 14h14M16 20h14M16 26h10"/>`,
  sail: `<path d="M24 4v30M24 6l14 24H24M22 10L10 30h12M6 36h36l-4 6H10z"/>`,
  arrowR: `<path d="M10 24h28M28 14l10 10-10 10"/>`, arrowL: `<path d="M38 24H10M20 14L10 24l10 10"/>`,
};
export function glyph(name, cls = '') {
  return `<svg class="tw-glyph ${cls}" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${G[name] || G.scroll}</svg>`;
}
export const coinSvg = (cls = '') => `<svg class="tw-coin ${cls}" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#c99a3a" stroke="#5a3d12" stroke-width="1.5"/><circle cx="12" cy="12" r="6.8" fill="none" stroke="#f6dc8c" stroke-width="1.4"/><path d="M12 7.5l1.4 3.1 3.3.3-2.5 2.2.8 3.3-3-1.8-3 1.8.8-3.3-2.5-2.2 3.3-.3z" fill="#fff0b8"/></svg>`;

// Rarity tile with an item icon. `id` is an ITEMS key.
export function itemIcon(id, { size = '', count = null } = {}) {
  const it = ITEMS[id] || { rarity: 1, icon: 'ore' };
  return `<span class="tw-ico ${size}" style="--rc:${rarityColor(it.rarity)}">${itemSvg(it.icon)}${count != null ? `<b class="tw-ico-n">${count}</b>` : ''}</span>`;
}
export function equipIcon(kind, rarity, { size = '', element = null } = {}) {
  return `<span class="tw-ico tw-ico-eq ${size}" style="--rc:${rarityColor(rarity)}">${glyph(kind)}${element ? `<i class="tw-ico-el" style="background:${ELEMENT[element] || '#fff'}"></i>` : ''}</span>`;
}
