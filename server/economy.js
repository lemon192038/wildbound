// Authoritative game economy. Every function validates against src/shared/gamedata.js and mutates the
// player's save document in place (inside store.mutateSave → atomic per player). Throwing GameError aborts
// the whole action with nothing written, so coins/materials can never be half-spent or duplicated.
import crypto from 'node:crypto';
import {
  ITEMS, WEAPONS, ARMOR, ARMOR_SLOTS, RECIPES, QUESTS, MONSTERS, SHOP, POUCH, START, STARTER_WEAPON, STARTER_ARMOR,
  weaponStats, armorStats, nextWeaponCost, nextArmorCost, loadoutStats, recipeUnlocked, questAvailable, hrForXp, HR_XP,
  DESTINATIONS, destForMonster, FREE_EXPEDITION,
} from '../src/shared/gamedata.js';

export class GameError extends Error { constructor(code, message) { super(message || code); this.code = code; } }
const fail = (code, msg) => { throw new GameError(code, msg); };
const int = (v, lo, hi) => (Number.isInteger(v) && v >= lo && v <= hi ? v : fail('bad_qty', 'Invalid quantity'));
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const LEDGER_MAX = 200, HISTORY_MAX = 100, LOG_MAX = 60;

// ---------------------------------------------------------------- save document
export function newSave(name, now) {
  const d = {
    v: 1, profile: { name, createdAt: now, playTime: 0, hr: 1, xp: 0, lastPing: 0 },
    coins: 0, ledger: [], box: {}, pouch: {}, equip: [], nextUid: 1, loadout: {}, sets: [],
    crafted: {}, craftLog: [], quests: { cleared: {}, active: null, expedition: null, history: [] },
    hunts: {}, areas: ['harbor', 'meadow'], shop: {}, notices: [],
  };
  credit(d, START.coins, 'Starting funds', now);
  for (const [k, q] of Object.entries(START.box)) give(d.box, k, q);
  for (const [k, q] of Object.entries(START.pouch)) give(d.pouch, k, q);
  d.loadout.weapon = addEquip(d, 'weapon', STARTER_WEAPON);
  STARTER_ARMOR.forEach((a) => { d.loadout[ARMOR[a].slot] = addEquip(d, 'armor', a); });
  return d;
}
function addEquip(d, kind, def) { const uid = 'e' + d.nextUid++; d.equip.push({ uid, kind, def, lvl: 0 }); return uid; }

// ---------------------------------------------------------------- primitives
const give = (bag, item, q) => { bag[item] = (bag[item] || 0) + q; };
const count = (bag, item) => bag[item] || 0;
function take(bag, item, q) { if (count(bag, item) < q) fail('missing', `Not enough ${ITEMS[item]?.name || item}`); bag[item] -= q; if (!bag[item]) delete bag[item]; }
function credit(d, n, reason, now) { if (n <= 0) return; d.coins += n; d.ledger.push({ t: now, d: n, r: reason, b: d.coins }); trim(d.ledger, LEDGER_MAX); }
function debit(d, n, reason, now) { if (n <= 0) return; if (d.coins < n) fail('coins', `Not enough coins (${n.toLocaleString()} needed)`); d.coins -= n; d.ledger.push({ t: now, d: -n, r: reason, b: d.coins }); trim(d.ledger, LEDGER_MAX); }
const trim = (a, n) => { if (a.length > n) a.splice(0, a.length - n); };
// Pay a {coins, mats} cost from the box (all-or-nothing: checks everything first).
function pay(d, cost, reason, now, times = 1) {
  if (!cost) fail('locked', 'Cannot be crafted');
  const coins = (cost.coins || 0) * times;
  for (const [m, q] of Object.entries(cost.mats || cost.in || {})) if (count(d.box, m) < q * times) fail('missing', `Missing materials: ${ITEMS[m]?.name || m}`);
  if (d.coins < coins) fail('coins', `Not enough coins (${coins.toLocaleString()} needed)`);
  for (const [m, q] of Object.entries(cost.mats || cost.in || {})) take(d.box, m, q * times);
  debit(d, coins, reason, now);
}
const notice = (d, text) => { d.notices.push(text); trim(d.notices, 10); };
function pouchSlots(d) { return Object.keys(d.pouch).length; }

// ---------------------------------------------------------------- shop stock
function stockFor(d, item, now) {
  const max = SHOP.stock[item]; if (max == null) return 0;
  const s = d.shop[item]; const period = SHOP.restockMinutes * 60000;
  if (!s || now - s.at >= period) { d.shop[item] = { left: max, at: now }; }
  return d.shop[item].left;
}

// ---------------------------------------------------------------- actions
export const ACTIONS = {
  ping(d, p, { now }) { // play time accounting (server clock; at most 2 min per ping)
    const last = d.profile.lastPing || 0; if (last && now > last) d.profile.playTime += Math.min(120000, now - last); d.profile.lastPing = now; return {};
  },
  buy(d, { item, qty }, { now }) {
    const it = ITEMS[item]; if (!it || it.buy == null) fail('not_sold', 'That is not for sale'); int(qty, 1, 99);
    const left = stockFor(d, item, now); if (left < qty) fail('stock', `Only ${left} left in stock`);
    debit(d, it.buy * qty, `Bought ${qty}× ${it.name}`, now); d.shop[item].left -= qty; give(d.box, item, qty);
    return { msg: `Bought ${qty}× ${it.name}`, spent: it.buy * qty };
  },
  sell(d, { item, qty, from = 'box' }, { now }) {
    const it = ITEMS[item]; if (!it || !(it.sell > 0)) fail('unsellable', 'The merchant will not buy that'); int(qty, 1, 9999);
    const bag = from === 'pouch' ? d.pouch : from === 'box' ? d.box : fail('bad_bag'); take(bag, item, qty);
    credit(d, it.sell * qty, `Sold ${qty}× ${it.name}`, now);
    return { msg: `Sold ${qty}× ${it.name} for ${(it.sell * qty).toLocaleString()} coins`, earned: it.sell * qty };
  },
  craftWeapon(d, { def }, { now }) {
    const wd = WEAPONS[def]; if (!wd || !wd.craft) fail('locked', 'Cannot forge that');
    pay(d, wd.craft, `Forged ${wd.name}`, now); const uid = addEquip(d, 'weapon', def);
    return { msg: `Forged ${wd.name}`, uid };
  },
  craftArmor(d, { def }, { now }) {
    const ad = ARMOR[def]; if (!ad || !ad.craft) fail('locked', 'Cannot forge that');
    pay(d, ad.craft, `Forged ${ad.name}`, now); const uid = addEquip(d, 'armor', def);
    return { msg: `Forged ${ad.name}`, uid };
  },
  upgrade(d, { uid }, { now }) {
    const e = d.equip.find((x) => x.uid === uid); if (!e) fail('no_equip', 'Unknown equipment');
    const cost = e.kind === 'weapon' ? nextWeaponCost(e.def, e.lvl) : nextArmorCost(e.def, e.lvl);
    if (!cost) fail('max', 'Already at its highest level');
    const name = e.kind === 'weapon' ? WEAPONS[e.def].name : ARMOR[e.def].name;
    pay(d, cost, `Upgraded ${name} to Lv ${e.lvl + 2}`, now); e.lvl++;
    return { msg: `${name} upgraded to Lv ${e.lvl + 1}` };
  },
  sellEquip(d, { uid }, { now }) {
    const e = d.equip.find((x) => x.uid === uid); if (!e) fail('no_equip', 'Unknown equipment');
    if (Object.values(d.loadout).includes(uid)) fail('equipped', 'Unequip it first');
    const val = equipValue(e); d.equip = d.equip.filter((x) => x !== e);
    for (const s of d.sets) for (const k in s.loadout) if (s.loadout[k] === uid) delete s.loadout[k];
    credit(d, val, `Sold ${e.kind === 'weapon' ? WEAPONS[e.def].name : ARMOR[e.def].name}`, now);
    return { msg: `Sold for ${val.toLocaleString()} coins`, earned: val };
  },
  equip(d, { slot, uid }) {
    if (!['weapon', ...ARMOR_SLOTS].includes(slot)) fail('bad_slot');
    if (uid == null) { if (slot === 'weapon') fail('need_weapon', 'A hunter needs a weapon'); delete d.loadout[slot]; return { msg: 'Unequipped' }; }
    const e = d.equip.find((x) => x.uid === uid); if (!e) fail('no_equip', 'Unknown equipment');
    if (slot === 'weapon' ? e.kind !== 'weapon' : e.kind !== 'armor' || ARMOR[e.def].slot !== slot) fail('bad_slot', 'Does not fit that slot');
    if (d.quests.expedition) fail('busy', 'Cannot change gear during a hunt');
    d.loadout[slot] = uid; return { msg: 'Equipped' };
  },
  saveSet(d, { index, name }) {
    int(index, 0, 3); d.sets[index] = { name: String(name || `Set ${index + 1}`).replace(/[<>\u0000-\u001f]/g, '').slice(0, 20), loadout: { ...d.loadout } }; return { msg: 'Equipment set saved' };
  },
  loadSet(d, { index }) {
    int(index, 0, 3); const s = d.sets[index]; if (!s) fail('empty', 'Empty set'); if (d.quests.expedition) fail('busy', 'Cannot change gear during a hunt');
    const owned = new Set(d.equip.map((e) => e.uid)); const lo = {};
    for (const [k, v] of Object.entries(s.loadout)) if (owned.has(v)) lo[k] = v;
    if (!lo.weapon) lo.weapon = d.loadout.weapon; d.loadout = lo; return { msg: `Loaded “${s.name}”` };
  },
  alchemy(d, { recipe, qty = 1 }, { now }) {
    const r = RECIPES[recipe]; if (!r) fail('no_recipe', 'Unknown recipe'); int(qty, 1, 20);
    if (!recipeUnlocked(r, d)) fail('locked', 'You have not learned that recipe');
    pay(d, { coins: r.coins, mats: r.in }, `Alchemy: ${ITEMS[r.out[0]].name}`, now, qty);
    give(d.box, r.out[0], r.out[1] * qty); d.crafted[recipe] = (d.crafted[recipe] || 0) + qty;
    d.craftLog.push({ t: now, recipe, qty }); trim(d.craftLog, LOG_MAX);
    return { msg: `Brewed ${r.out[1] * qty}× ${ITEMS[r.out[0]].name}` };
  },
  move(d, { item, qty, to }) {
    const it = ITEMS[item]; if (!it) fail('no_item'); int(qty, 1, 999);
    if (d.quests.expedition) fail('busy', 'Cannot reorganise during a hunt');
    if (to === 'pouch') {
      if (!it.pouchMax) fail('no_pouch', 'Only consumables and tools go in the pouch');
      if (!d.pouch[item] && pouchSlots(d) >= POUCH.slots) fail('pouch_full', 'Your pouch is full');
      if (count(d.pouch, item) + qty > it.pouchMax) fail('pouch_max', `You can carry at most ${it.pouchMax}`);
      take(d.box, item, qty); give(d.pouch, item, qty);
    } else if (to === 'box') { take(d.pouch, item, qty); give(d.box, item, qty); } else fail('bad_bag');
    return { msg: to === 'pouch' ? `Packed ${qty}× ${it.name}` : `Stored ${qty}× ${it.name}` };
  },
  acceptQuest(d, { quest }, { now }) {
    const q = QUESTS[quest]; const av = questAvailable(quest, d); if (!av.ok) fail('unavailable', av.why);
    if (d.quests.expedition) fail('busy', 'You are already on a hunt');
    if (d.quests.active) fail('active', 'Abandon your current quest first');
    d.quests.active = { qid: quest, at: now }; return { msg: `Accepted “${q.name}”` };
  },
  abandonQuest(d) {
    if (d.quests.expedition) fail('busy', 'Return from the hunt first'); if (!d.quests.active) fail('none', 'No active quest');
    d.quests.active = null; return { msg: 'Quest abandoned' };
  },
  deliverQuest(d, p, { now, rand }) {
    const a = d.quests.active; const q = a && QUESTS[a.qid]; if (!q || q.type !== 'deliver') fail('none', 'No delivery quest active');
    for (const o of q.objectives) if (o.k === 'deliver' && count(d.box, o.item) < o.qty) fail('missing', `Deliver ${o.qty}× ${ITEMS[o.item].name}`);
    for (const o of q.objectives) if (o.k === 'deliver') take(d.box, o.item, o.qty);
    const rewards = grant(d, q, a.qid, { slain: false }, now, rand);
    d.quests.active = null; return { msg: `Quest complete: ${q.name}`, rewards };
  },
  // depart {mode:'quest'|'free', dest}
  //  quest: travels to the accepted quest's destination (dest, if given, must match it).
  //  free : any destination, no quest needed; the accepted quest (if any) is untouched and cannot complete.
  depart(d, { mode, dest } = {}, { now }) {
    if (d.quests.expedition) fail('busy', 'Already on a hunt');
    const a = d.quests.active; const q = a && QUESTS[a.qid];
    if (!mode) mode = q ? 'quest' : 'free';
    let qid = null;
    if (mode === 'quest') {
      if (!q) fail('none', 'Accept a quest at the guild first');
      if (q.type === 'deliver') fail('deliver', 'Deliveries are turned in at the guild counter');
      const qDest = destForMonster(q.monster);
      if (dest != null && dest !== qDest) fail('wrong_dest', 'Your quest leads elsewhere');
      dest = qDest; qid = a.qid;
    } else if (mode === 'free') {
      if (typeof dest !== 'string' || !has(DESTINATIONS, dest)) fail('bad_dest', 'Unknown destination');
    } else fail('bad_mode', 'Unknown expedition type');
    const carried = { ...d.pouch }; d.pouch = {};
    const iid = crypto.randomBytes(9).toString('base64url');
    d.quests.expedition = { iid, qid, dest, free: mode === 'free', at: now, carried };
    return { msg: qid ? `Departing for “${q.name}”` : `Setting sail for ${DESTINATIONS[dest].name}`, iid, quest: qid, dest, mode, carried, stats: loadoutStats(d.equip, d.loadout) };
  },
  completeQuest(d, { iid, report }, { now, rand }) {
    const ex = d.quests.expedition; if (!ex || ex.iid !== iid) fail('no_expedition', 'That hunt is not active (already reported?)');
    if (ex.free) return completeFree(d, ex, report, now, rand);
    const q = QUESTS[ex.qid]; const elapsed = (now - ex.at) / 1000; const r = sanitizeReport(report, q);
    // Too early: refuse WITHOUT consuming the expedition, so an honest (fast) client can simply retry later.
    if (elapsed < q.minClear) fail('too_early', `Report again in ${Math.ceil(q.minClear - elapsed)}s`);
    const verdict = judge(q, r, elapsed);
    returnCarried(d, ex.carried, r.used);
    d.quests.expedition = null; d.quests.active = null;
    if (!verdict.ok) { pushHistory(d, { t: now, qid: ex.qid, ok: false, why: verdict.why, s: Math.round(elapsed) }); return { msg: `Quest failed: ${verdict.why}`, ok: false, why: verdict.why }; }
    const rewards = grant(d, q, ex.qid, r, now, rand);
    pushHistory(d, { t: now, qid: ex.qid, ok: true, s: Math.round(elapsed) });
    return { msg: `Quest complete: ${q.name}`, ok: true, rewards, elapsed: Math.round(elapsed) };
  },
  failQuest(d, { iid, report, reason }, { now }) {
    const ex = d.quests.expedition; if (!ex || ex.iid !== iid) fail('no_expedition', 'That hunt is not active');
    const r = sanitizeReport(report, ex.free ? freeQuestShape(ex) : QUESTS[ex.qid]); returnCarried(d, ex.carried, r.used);
    d.quests.expedition = null; // the quest stays accepted so it can be retried
    pushHistory(d, { t: now, qid: ex.qid, ok: false, why: String(reason || 'abandoned').slice(0, 40), s: Math.round((now - ex.at) / 1000) });
    return { msg: 'Returned to port', ok: false };
  },
};

// ---------------------------------------------------------------- free expeditions
// No quest: no bounty coins or hunter XP, never clears or advances quests. You keep what you carve,
// break and gather (server-capped), and slays/captures count in your hunt log.
const freeQuestShape = (ex) => ({ monster: DESTINATIONS[ex.dest]?.monster, objectives: [], minClear: FREE_EXPEDITION.minClear, timeLimit: FREE_EXPEDITION.timeLimit, maxFaints: 99 });
function completeFree(d, ex, report, now, rand) {
  const dest = DESTINATIONS[ex.dest]; const elapsed = (now - ex.at) / 1000;
  const r = sanitizeReport(report, freeQuestShape(ex));
  for (const k of Object.keys(r.gathered)) r.gathered[k] = Math.min(r.gathered[k], FREE_EXPEDITION.gatherCap);
  const hunted = r.slain || r.captured;
  if (elapsed < (hunted ? FREE_EXPEDITION.slayMinClear : FREE_EXPEDITION.minClear)) fail('too_early', `Report again in ${Math.ceil((hunted ? FREE_EXPEDITION.slayMinClear : FREE_EXPEDITION.minClear) - elapsed)}s`);
  returnCarried(d, ex.carried, r.used);
  const items = {}; const add = (k, n) => { if (n > 0) items[k] = (items[k] || 0) + n; };
  const mon = MONSTERS[dest.monster];
  if (hunted && mon && elapsed <= FREE_EXPEDITION.timeLimit + 120) {
    for (let i = 0; i < (r.captured ? 4 : 3); i++) add(weighted(mon.carves, rand), 1);
    for (const p of r.parts) if (mon.breaks[p]) add(mon.breaks[p], 1);
    const h = (d.hunts[dest.monster] ||= { slain: 0, captured: 0 }); r.captured ? h.captured++ : h.slain++;
  }
  for (const [k, n] of Object.entries(r.gathered)) add(k, n);
  for (const [k, n] of Object.entries(items)) give(d.box, k, n);
  d.quests.expedition = null;
  pushHistory(d, { t: now, qid: null, dest: ex.dest, free: true, ok: true, hunted, s: Math.round(elapsed) });
  return { msg: `Returned from ${dest.name}`, ok: true, free: true, rewards: { coins: 0, xp: 0, items, hr: d.profile.hr, hrUp: false }, hunted, elapsed: Math.round(elapsed) };
}

// ---------------------------------------------------------------- quest judgement & rewards
function sanitizeReport(rep, q) {
  const r = rep && typeof rep === 'object' ? rep : {};
  const cap = (n, hi) => (Number.isFinite(n) ? Math.max(0, Math.min(hi, Math.floor(n))) : 0);
  const gathered = {}; const gmax = {}; for (const o of q.objectives) if (o.k === 'gather') gmax[o.item] = Math.max(o.qty * 2, 10);
  for (const [k, v] of Object.entries(r.gathered || {})) if (ITEMS[k] && ITEMS[k].kind === 'material' && has(GATHERABLE, k)) gathered[k] = cap(v, gmax[k] || 8);
  const breaks = MONSTERS[q.monster]?.breaks || {};
  const parts = [...new Set((Array.isArray(r.parts) ? r.parts : []).filter((p) => typeof p === 'string' && has(breaks, p)))];
  const used = {}; for (const [k, v] of Object.entries(r.used || {})) if (ITEMS[k]) used[k] = cap(v, 99);
  return { slain: r.slain === true, captured: r.captured === true, gathered, parts, faints: cap(r.faints, 9), used };
}
export const GATHERABLE = { sunpetal: 1, glowcap: 1, tidecap: 1, honey: 1, ironOre: 1, crimsonOre: 1, stormquartz: 1, monsterBone: 1 };
function judge(q, r, elapsed) {
  if (elapsed < q.minClear) return { ok: false, why: 'Report rejected (implausibly fast)' };
  if (elapsed > q.timeLimit + 120) return { ok: false, why: 'Time expired' };
  if (r.faints >= q.maxFaints) return { ok: false, why: 'Fainted too many times' };
  for (const o of q.objectives) {
    if (o.k === 'slay' && !r.slain) return { ok: false, why: 'Target not slain' };
    if (o.k === 'slayOrCapture' && !(r.slain || r.captured)) return { ok: false, why: 'Target not hunted' };
    if (o.k === 'gather' && (r.gathered[o.item] || 0) < o.qty) return { ok: false, why: `Need ${o.qty}× ${ITEMS[o.item].name}` };
    if (o.k === 'break' && !o.parts.every((p) => r.parts.includes(p))) return { ok: false, why: 'Required parts not broken' };
    if (o.k === 'noFaint' && r.faints > 0) return { ok: false, why: 'Fainted' };
    if (o.k === 'within' && elapsed > o.s + 10) return { ok: false, why: 'Too slow' };
  }
  return { ok: true };
}
function weighted(list, rand) { const sum = list.reduce((s, [, w]) => s + w, 0); let x = rand() * sum; for (const [k, w] of list) { if ((x -= w) <= 0) return k; } return list[0][0]; }
function grant(d, q, qid, r, now, rand) {
  const items = {}; const add = (k, n) => { if (n > 0) items[k] = (items[k] || 0) + n; };
  let coins = q.coins; const mon = MONSTERS[q.monster];
  for (const [k, n, ch] of q.rewards || []) if (rand() * 100 < ch) add(k, n);
  if (mon && (r.slain || r.captured) && !q.ambient) {
    const rolls = (r.captured ? 4 : 3) + (q.tempered ? 1 : 0); for (let i = 0; i < rolls; i++) add(weighted(mon.carves, rand), 1);
    for (const p of r.parts || []) if (mon.breaks[p]) add(mon.breaks[p], 1);
    coins += Math.round(mon.coins * (q.tempered ? 1.4 : 1) * (r.captured ? 1.15 : 1));
    const h = (d.hunts[q.monster] ||= { slain: 0, captured: 0 }); r.captured ? h.captured++ : h.slain++;
  }
  for (const [k, n] of Object.entries(r.gathered || {})) add(k, n);
  for (const [k, n] of Object.entries(items)) give(d.box, k, n);
  credit(d, coins, `Quest reward: ${q.name}`, now);
  const before = d.profile.hr; d.profile.xp += q.xp; d.profile.hr = hrForXp(d.profile.xp);
  if (d.profile.hr > before) notice(d, `Hunter Rank ${d.profile.hr} reached!`);
  d.quests.cleared[qid] = (d.quests.cleared[qid] || 0) + 1;
  return { coins, xp: q.xp, items, hr: d.profile.hr, hrUp: d.profile.hr > before };
}
function returnCarried(d, carried, used) {
  for (const [k, n] of Object.entries(carried || {})) { const left = n - Math.min(n, used[k] || 0); if (left > 0) give(d.pouch, k, left); }
}
const pushHistory = (d, h) => { d.quests.history.push(h); trim(d.quests.history, HISTORY_MAX); };
export function equipValue(e) {
  let total = 0;
  if (e.kind === 'weapon') { const wd = WEAPONS[e.def]; total += wd.craft?.coins || 200; for (let i = 1; i <= e.lvl; i++) total += wd.levels[i]?.cost?.coins || 0; }
  else { const ad = ARMOR[e.def]; total += ad.craft?.coins || 80; for (let i = 0; i < e.lvl; i++) total += ad.upgrade(i).coins; }
  return Math.max(20, Math.round(total * 0.3));
}

// Expire hunts that were never reported (crashed tab, closed browser): items carried are returned.
export function expireStale(d, now) {
  const ex = d.quests.expedition; if (!ex) return false;
  const limit = ex.free ? FREE_EXPEDITION.timeLimit : QUESTS[ex.qid]?.timeLimit; if (!limit || now - ex.at > (limit + 600) * 1000) { returnCarried(d, ex.carried, {}); d.quests.expedition = null; pushHistory(d, { t: now, qid: ex.qid, ok: false, why: 'Expired', s: 0 }); return true; }
  return false;
}

// ---------------------------------------------------------------- public view (what the client may see)
export function publicState(d, user, now) {
  for (const k of Object.keys(SHOP.stock)) stockFor(d, k, now); // view only; caller doesn't persist
  return {
    user: { id: user.id, name: user.name, createdAt: d.profile.createdAt },
    profile: { hr: d.profile.hr, xp: d.profile.xp, nextXp: HR_XP[d.profile.hr + 1] ?? null, hrXp: HR_XP[d.profile.hr] ?? 0, playTime: d.profile.playTime },
    coins: d.coins, ledger: d.ledger.slice(-60), box: d.box, pouch: d.pouch, pouchSlots: POUCH.slots,
    equip: d.equip.map((e) => ({ ...e, value: equipValue(e) })), loadout: d.loadout, sets: d.sets, stats: loadoutStats(d.equip, d.loadout),
    crafted: d.crafted, craftLog: d.craftLog.slice(-30),
    recipes: Object.fromEntries(Object.keys(RECIPES).map((k) => [k, recipeUnlocked(RECIPES[k], d)])),
    quests: { cleared: d.quests.cleared, active: d.quests.active, expedition: d.quests.expedition ? { iid: d.quests.expedition.iid, qid: d.quests.expedition.qid, dest: d.quests.expedition.dest || destForMonster(QUESTS[d.quests.expedition.qid]?.monster), free: !!d.quests.expedition.free, at: d.quests.expedition.at, carried: d.quests.expedition.carried } : null, history: d.quests.history.slice(-30),
      available: Object.fromEntries(Object.keys(QUESTS).map((k) => [k, questAvailable(k, d)])) },
    hunts: d.hunts, areas: d.areas,
    shop: Object.fromEntries(Object.entries(d.shop).map(([k, s]) => [k, { left: s.left, restockAt: s.at + SHOP.restockMinutes * 60000 }])),
    notices: d.notices, serverTime: now,
  };
}
export { weaponStats, armorStats };
