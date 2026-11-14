// Wildbound i18n core (browser only). English text for UI keys lives in i18n-en.js; every other language
// is a pack (i18n-ja.js …) with the same shape: { ui: {key: text}, items, weapons, armorSets, slots, skills,
// quests, monsters, parts, elements, npcs, facilities }. Missing entries fall back to English / gamedata.js.
// Adding a language: write i18n-<code>.js, register it in PACKS + LANGS below. Ids in gamedata.js never change.
//   getLang() → 'ja' | 'en'      setLang(l) → stores + reloads      t(key, {name}) → text
//   itemName/itemDesc/weaponName/weaponEffect/armorName/skillName/skillDesc/questName/questDesc/monsterName …
//   serverMsg(message, error) → server/API English message translated (templates + embedded names)
import { ITEMS, WEAPONS, ARMOR, SKILLS, QUESTS, MONSTERS, DESTINATIONS } from './gamedata.js';
import EN from './i18n-en.js';
import JA from './i18n-ja.js';

const PACKS = { en: EN, ja: JA };
export const LANGS = [['ja', '日本語'], ['en', 'English']];
const LS_KEY = 'wildbound.lang';

let current = null;
export function getLang() {
  if (current) return current;
  let l = null;
  try { l = new URLSearchParams(location.search).get('lang'); } catch { /* no location */ }
  if (!PACKS[l]) { try { l = localStorage.getItem(LS_KEY); } catch { l = null; } }
  if (!PACKS[l]) { try { l = /^ja\b/i.test(navigator.language || '') ? 'ja' : 'en'; } catch { l = 'en'; } }
  return (current = PACKS[l] ? l : 'en');
}
export function setLang(l) {
  if (!PACKS[l]) return;
  try { localStorage.setItem(LS_KEY, l); } catch { /* private mode */ }
  try { const u = new URL(location.href); if (u.searchParams.has('lang')) { u.searchParams.set('lang', l); location.href = u.toString(); return; } } catch { /* */ }
  location.reload();
}
export const isJa = () => getLang() === 'ja';
const P = () => PACKS[getLang()] || EN;
const interp = (s, p) => (p ? String(s).replace(/\{(\w+)\}/g, (m, k) => (p[k] != null ? p[k] : m)) : String(s));
export function t(key, params) { const s = P().ui?.[key] ?? EN.ui[key] ?? key; return interp(s, params); }
export const locale = () => (isJa() ? 'ja-JP' : 'en-GB');

// ------------------------------------------------------------------ game data lookups
const pick = (table, id, i) => { const e = P()[table]?.[id]; return Array.isArray(e) ? e[i] : i === 0 ? e : undefined; };
export const itemName = (id) => pick('items', id, 0) ?? ITEMS[id]?.name ?? id;
export const itemDesc = (id) => pick('items', id, 1) ?? ITEMS[id]?.desc ?? '';
export const weaponName = (id) => pick('weapons', id, 0) ?? WEAPONS[id]?.name ?? id;
export const weaponEffect = (id) => pick('weapons', id, 1) ?? WEAPONS[id]?.effect ?? '';
export function armorName(id) {
  const a = ARMOR[id]; if (!a) return id;
  const set = P().armorSets?.[a.set], slot = P().slots?.[a.slot];
  return set != null && slot != null ? interp(P().ui?.armorPiece ?? '{set} {slot}', { set, slot }) : a.name;
}
export const armorSetName = (setId) => P().armorSets?.[setId] ?? EN.armorSets[setId] ?? setId;
export const equipDefName = (kind, def) => (kind === 'weapon' ? weaponName(def) : armorName(def));
export const skillName = (id) => pick('skills', id, 0) ?? SKILLS[id]?.name ?? id;
export const skillDesc = (id) => pick('skills', id, 1) ?? SKILLS[id]?.desc ?? '';
// destinations (world map): [name, desc, region]
export const destName = (id) => pick('dests', id, 0) ?? DESTINATIONS[id]?.name ?? id;
export const destDesc = (id) => pick('dests', id, 1) ?? DESTINATIONS[id]?.desc ?? '';
export const destRegion = (id) => pick('dests', id, 2) ?? DESTINATIONS[id]?.region ?? '';
export const questName = (id) => pick('quests', id, 0) ?? QUESTS[id]?.name ?? id;
export const questDesc = (id) => pick('quests', id, 1) ?? QUESTS[id]?.desc ?? '';
const monsterIdOf = (x) => (MONSTERS[x] ? x : Object.keys(MONSTERS).find((k) => MONSTERS[k].name === x || MONSTERS[k].name.split(',')[0] === x) || null);
const monEntry = (id) => P().monsters?.[id] || EN.monsters[id];
/** Full name ("Varkhul, the Emberhide" / 「燼皮のヴァルクル」). Accepts an id or the English full/short name. */
export function monsterName(x) { const id = monsterIdOf(x); return id ? monEntry(id).full : String(x || ''); }
/** Short name ("Varkhul" / 「ヴァルクル」). */
export function monsterShort(x) { const id = monsterIdOf(x); return id ? monEntry(id).short : String(x || '').split(',')[0]; }
/** Epithet ("The Emberhide" / 「燼皮」). */
export function monsterTitle(x) { const id = monsterIdOf(x); return id ? monEntry(id).title : ''; }
export const partName = (p) => P().parts?.[p] ?? EN.parts[p] ?? String(p).replace(/[_-]/g, ' ');
export const elementName = (e) => P().elements?.[e] ?? EN.elements[e] ?? String(e);
export const slotLabel = (s) => P().slotLabel?.[s] ?? EN.slotLabel[s] ?? s;
export const npcName = (id, fallback) => P().npcs?.[id] ?? fallback ?? EN.npcs[id] ?? '';
export const facilityName = (id, fallback) => P().facilities?.[id] ?? fallback ?? EN.facilities[id] ?? '';
export function unlockText(u) {
  if (!u) return '';
  if (u.hr) return t('unlock.hr', { hr: u.hr });
  if (u.slain) return t('unlock.slain', { m: monsterName(u.slain) });
  if (u.quest) return t('unlock.quest', { q: questName(u.quest) });
  return t('unlock.locked');
}

// ------------------------------------------------------------------ server message translation
// English names embedded in server strings → localized names.
let rev = null;
function reverse() {
  if (rev) return rev;
  rev = new Map();
  for (const k in ITEMS) rev.set(ITEMS[k].name, () => itemName(k));
  for (const k in WEAPONS) rev.set(WEAPONS[k].name, () => weaponName(k));
  for (const k in ARMOR) rev.set(ARMOR[k].name, () => armorName(k));
  for (const k in QUESTS) rev.set(QUESTS[k].name, () => questName(k));
  for (const k in MONSTERS) rev.set(MONSTERS[k].name, () => monsterName(k));
  return rev;
}
const nm = (s) => { const f = reverse().get(String(s).trim()); return f ? f() : s; };
// [regex, ui key, (match) → params]. Order matters (more specific first).
const N = (x) => x; // numbers keep their separators
const TEMPLATES = [
  [/^Not enough coins \(([\d,]+) needed\)$/, 'srv.coins', (m) => ({ n: N(m[1]) })],
  [/^Not enough (.+)$/, 'srv.notEnough', (m) => ({ item: nm(m[1]) })],
  [/^Missing materials: (.+)$/, 'srv.missingMats', (m) => ({ item: nm(m[1]) })],
  [/^Only (\d+) left in stock$/, 'srv.stock', (m) => ({ n: m[1] })],
  [/^Bought (\d+)× (.+)$/, 'srv.bought', (m) => ({ n: m[1], item: nm(m[2]) })],
  [/^Sold (\d+)× (.+) for ([\d,]+) coins$/, 'srv.soldFor', (m) => ({ n: m[1], item: nm(m[2]), c: m[3] })],
  [/^Sold (\d+)× (.+)$/, 'srv.sold', (m) => ({ n: m[1], item: nm(m[2]) })],
  [/^Sold for ([\d,]+) coins$/, 'srv.soldEquip', (m) => ({ c: m[1] })],
  [/^Sold (.+)$/, 'srv.soldLedger', (m) => ({ item: nm(m[1]) })],
  [/^Forged (.+)$/, 'srv.forged', (m) => ({ item: nm(m[1]) })],
  [/^Upgraded (.+) to Lv (\d+)$/, 'srv.upgradedLedger', (m) => ({ item: nm(m[1]), lv: m[2] })],
  [/^(.+) upgraded to Lv (\d+)$/, 'srv.upgraded', (m) => ({ item: nm(m[1]), lv: m[2] })],
  [/^Loaded “(.+)”$/, 'srv.loaded', (m) => ({ name: setLabel(m[1]) })],
  [/^Brewed (\d+)× (.+)$/, 'srv.brewed', (m) => ({ n: m[1], item: nm(m[2]) })],
  [/^You can carry at most (\d+)$/, 'srv.carryMax', (m) => ({ n: m[1] })],
  [/^Packed (\d+)× (.+)$/, 'srv.packed', (m) => ({ n: m[1], item: nm(m[2]) })],
  [/^Stored (\d+)× (.+)$/, 'srv.stored', (m) => ({ n: m[1], item: nm(m[2]) })],
  [/^Requires Hunter Rank (\d+)$/, 'srv.reqHR', (m) => ({ hr: m[1] })],
  [/^Clear "(.+)" first$/, 'srv.clearFirst', (m) => ({ q: nm(m[1]) })],
  [/^Accepted “(.+)”$/, 'srv.accepted', (m) => ({ q: nm(m[1]) })],
  [/^Deliver (\d+)× (.+)$/, 'srv.deliver', (m) => ({ n: m[1], item: nm(m[2]) })],
  [/^Quest complete: (.+)$/, 'srv.questComplete', (m) => ({ q: nm(m[1]) })],
  [/^Quest failed: (.+)$/, 'srv.questFailed', (m) => ({ why: serverMsg(m[1]) })],
  [/^Quest reward: (.+)$/, 'srv.questReward', (m) => ({ q: nm(m[1]) })],
  [/^Departing for “(.+)”$/, 'srv.departing', (m) => ({ q: nm(m[1]) })],
  [/^Report again in (\d+)s$/, 'srv.tooEarly', (m) => ({ s: m[1] })],
  [/^Need (\d+)× (.+)$/, 'srv.need', (m) => ({ n: m[1], item: nm(m[2]) })],
  [/^Alchemy: (.+)$/, 'srv.alchemyLedger', (m) => ({ item: nm(m[1]) })],
  [/^Hunter Rank (\d+) reached!$/, 'srv.rankUp', (m) => ({ hr: m[1] })],
  [/^Server error \((\d+)\)$/, 'srv.serverErrorN', (m) => ({ n: m[1] })],
];
// Fixed strings → key (exact match). Error codes are a last resort when the message is unknown.
const FIXED = {
  'Invalid quantity': 'srv.badQty', 'Cannot be crafted': 'srv.cannotCraft', 'That is not for sale': 'srv.notSold',
  'The merchant will not buy that': 'srv.unsellable', 'Cannot forge that': 'srv.cannotForge', 'Unknown equipment': 'srv.noEquip',
  'Already at its highest level': 'srv.max', 'Unequip it first': 'srv.equipped', 'A hunter needs a weapon': 'srv.needWeapon',
  Unequipped: 'srv.unequipped', 'Does not fit that slot': 'srv.badSlot', 'Cannot change gear during a hunt': 'srv.busyGear',
  Equipped: 'srv.equipDone', 'Equipment set saved': 'srv.setSaved', 'Empty set': 'srv.emptySet', 'Unknown recipe': 'srv.noRecipe',
  'You have not learned that recipe': 'srv.recipeLocked', 'Cannot reorganise during a hunt': 'srv.busyBox',
  'Only consumables and tools go in the pouch': 'srv.noPouch', 'Your pouch is full': 'srv.pouchFull', 'Unknown quest': 'srv.unknownQuest',
  'You are already on a hunt': 'srv.busyHunt', 'Abandon your current quest first': 'srv.activeQuest', 'Return from the hunt first': 'srv.returnFirst',
  'No active quest': 'srv.noQuest', 'Quest abandoned': 'srv.abandoned', 'No delivery quest active': 'srv.noDelivery',
  'Accept a quest at the guild first': 'srv.acceptFirst', 'Deliveries are turned in at the guild counter': 'srv.deliverCounter',
  'Already on a hunt': 'srv.busyHunt', 'That hunt is not active (already reported?)': 'srv.noExpedition2', 'That hunt is not active': 'srv.noExpedition',
  'Returned to port': 'srv.returned', 'Report rejected (implausibly fast)': 'srv.tooFast', 'Time expired': 'srv.timeExpired',
  'Fainted too many times': 'srv.tooManyFaints', 'Target not slain': 'srv.notSlain', 'Target not hunted': 'srv.notHunted',
  'Required parts not broken': 'srv.partsNotBroken', Fainted: 'srv.fainted', 'Too slow': 'srv.tooSlow', Expired: 'srv.expired',
  abandoned: 'srv.abandonedHunt', Abandoned: 'srv.abandonedHunt', 'Starting funds': 'srv.startFunds',
  'Origin not allowed': 'srv.origin', 'Too many attempts — wait a minute': 'srv.rateAuth', 'Name and password required': 'srv.badInput',
  'Name: 3–16 letters, numbers, spaces, _ or -': 'acct.badName', 'Password: 8–72 characters': 'acct.badPw', 'That name is already taken': 'srv.taken',
  'Wrong name or password': 'srv.auth', 'Please log in': 'srv.session', 'Slow down': 'srv.rate', 'Unknown action': 'srv.badAction',
  'Please retry': 'srv.conflict', 'Server error': 'srv.server', 'Request failed': 'srv.failed',
  'Cannot reach the server. Check your connection and try again.': 'srv.network', 'Something went wrong. Try again.': 'srv.oops',
};
const CODES = { network: 'srv.network', rate: 'srv.rate', session: 'srv.session', server: 'srv.server', coins: 'srv.coinsShort', missing: 'srv.missingShort', busy: 'srv.busyHunt', locked: 'srv.cannotCraft', conflict: 'srv.conflict' };
/** Translate a server/API message (English) for display. English UI returns it unchanged. */
export function serverMsg(message, error) {
  const s = String(message ?? '').trim();
  if (getLang() === 'en') return s || (error ? String(error) : '');
  if (FIXED[s]) return t(FIXED[s]);
  for (const [re, key, f] of TEMPLATES) { const m = s.match(re); if (m) return t(key, f(m)); }
  const viaName = reverse().get(s); if (viaName) return viaName(); // a bare item / quest name
  if (error && CODES[error]) return t(CODES[error]); // unknown wording, known error code
  return s;
}
/** Saved equipment-set names: the server default "Set N" is shown localized. */
export function setLabel(name) { const m = String(name || '').match(/^Set (\d+)$/); return m ? t('box.setN', { n: m[1] }) : String(name || ''); }

// ------------------------------------------------------------------ fonts & typography per language
const FONT_JA = 'https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700;800&family=Noto+Serif+JP:wght@500;700;900&display=swap';
const BASE_CSS = `
  .wb-lang { display: inline-flex; gap: 0; pointer-events: auto; vertical-align: middle; border: 1px solid rgba(217,182,115,.45); border-radius: 1em; overflow: hidden; background: rgba(10,7,4,.55); }
  .wb-lang button { pointer-events: auto; cursor: pointer; border: 0; margin: 0; padding: .35em .9em; min-height: 32px; background: transparent; color: #b9aa8b;
    font: 600 12px/1 'Inter', 'Noto Sans JP', 'Hiragino Kaku Gothic ProN', 'Yu Gothic', Meiryo, system-ui, sans-serif; letter-spacing: .02em; text-transform: none; }
  .wb-lang button.on { background: linear-gradient(180deg,#f6e2aa,#c9a25a); color: #1a1208; }
  .tw-gate-lang { position: absolute; top: max(14px, env(safe-area-inset-top)); right: max(14px, env(safe-area-inset-right)); }
  .wb-title-lang { margin-left: .8em; pointer-events: auto; }
  .wb-lang-seg button { min-height: 36px; font-size: 13px; }`;
export function applyLangDocument() {
  if (typeof document === 'undefined') return;
  const l = getLang(); document.documentElement.lang = l;
  if (!document.getElementById('wb-i18n-base')) { const b = document.createElement('style'); b.id = 'wb-i18n-base'; b.textContent = BASE_CSS; document.head.appendChild(b); }
  if (l !== 'ja' || document.getElementById('wb-i18n-ja')) return;
  const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = FONT_JA; link.dataset.wbFontsJa = '1';
  link.onerror = () => link.remove(); document.head.appendChild(link);
  const st = document.createElement('style'); st.id = 'wb-i18n-ja';
  // Latin glyphs keep Cinzel/Inter; kana/kanji fall through to Noto JP (then the OS Japanese fonts).
  // Wide Cinzel-style tracking and all-caps look wrong in Japanese → tighten everything except the logo words.
  st.textContent = `
  #ui-root, .tc-root, .qr-overlay {
    --serif: 'Cinzel', 'Noto Serif JP', 'Hiragino Mincho ProN', 'Yu Mincho', 'YuMincho', 'HG Mincho E', serif;
    --sans: 'Inter', 'Noto Sans JP', 'Hiragino Kaku Gothic ProN', 'Hiragino Sans', 'Yu Gothic UI', 'Yu Gothic', 'YuGothic', Meiryo, system-ui, sans-serif;
  }
  #ui-root, #ui-root input, #ui-root button, .tc-root { font-family: var(--sans); }
  #ui-root *:not(.tw-gate-word):not(.wb-logo-word):not(.tw-stars):not(kbd):not(.wb-kbd) { letter-spacing: 0.03em !important; }
  #ui-root .wb-card-name, #ui-root .wb-banner h1, #ui-root .tw-banner h1, #ui-root .qr-card h1, #ui-root .qr-banner h2,
  #ui-root .wb-faint h2, #ui-root .wb-break-name, #ui-root .wb-panel h2 { letter-spacing: 0.08em !important; padding-left: 0.08em !important; }
  #ui-root .wb-card-kicker, #ui-root .wb-break-kicker, #ui-root .wb-cta, #ui-root .wb-logo-tag, #ui-root .tw-gate-tag, #ui-root .wb-banner .wb-sub,
  #ui-root .wb-next, #ui-root .wb-card-title { letter-spacing: 0.12em !important; padding-left: 0.12em !important; }
  #ui-root * { font-style: normal !important; } /* synthesized oblique kana looks broken */
  #ui-root .tw-btn, #ui-root .tw-tab { line-height: 1.2; }
  #ui-root p, #ui-root li, #ui-root .tw-dlg-text, #ui-root .tw-flavor { line-break: strict; word-break: normal; overflow-wrap: anywhere; }
  .tc-btn { font-family: 'Noto Sans JP', 'Hiragino Kaku Gothic ProN', 'Yu Gothic', Meiryo, sans-serif !important; letter-spacing: 0 !important; font-weight: 700 !important; }
  `;
  document.head.appendChild(st);
}
applyLangDocument();

// ------------------------------------------------------------------ small formatting helpers
export function durationText(ms) { const m = Math.floor(ms / 60000); const h = Math.floor(m / 60); return h ? t('time.hm', { h, m: String(m % 60).padStart(2, '0') }) : t('time.m', { m }); }
export function agoText(tm, now = Date.now()) {
  const s = Math.max(0, (now - tm) / 1000);
  if (s < 60) return t('time.now'); if (s < 3600) return t('time.mAgo', { n: Math.floor(s / 60) });
  if (s < 86400) return t('time.hAgo', { n: Math.floor(s / 3600) }); return t('time.dAgo', { n: Math.floor(s / 86400) });
}
/** Small inline language toggle markup: buttons carry data-lang. */
export const langToggleHtml = (cls = '') => `<span class="wb-lang ${cls}" role="group" aria-label="Language">${LANGS.map(([k, label]) => `<button type="button" class="${k === getLang() ? 'on' : ''}" data-lang="${k}" lang="${k}">${label}</button>`).join('')}</span>`;
export function bindLangToggle(root) { root.querySelectorAll('[data-lang]').forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); if (b.dataset.lang !== getLang()) setLang(b.dataset.lang); })); }
