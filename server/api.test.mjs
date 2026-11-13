// API / economy integration tests: node server/api.test.mjs
import http from 'node:http';
import { openStore } from './store.js';
import { createApi } from './api.js';
import { ITEMS, WEAPONS, QUESTS } from '../src/shared/gamedata.js';

let clock = 1_700_000_000_000;
const pgModule = process.env.STORE === 'pgmem' ? (await import('pg-mem')).newDb().adapters.createPg() : null; // run the suite against an in-memory Postgres too
const store = await openStore({ file: ':memory:', log: () => {}, pgModule });
const api = createApi(store, { now: () => clock, log: () => {} });
const server = http.createServer((req, res) => api.handle(req, res, new URL(req.url, 'http://x').pathname));
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
let pass = 0, failN = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok  ', m); } else { failN++; console.log('  FAIL', m); } };
const call = async (path, body, token, method = body ? 'POST' : 'GET') => {
  const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, ...(await r.json()) };
};
const act = (tok, type, p = {}) => call('/api/action', { type, ...p }, tok);
const give = (uid, bag) => store.mutateSave(uid, (d) => { for (const [k, v] of Object.entries(bag)) d.box[k] = (d.box[k] || 0) + v; });

// ---- accounts
let r = await call('/api/register', { name: 'Ayla', password: 'hunter-pass-1' });
ok(r.ok && r.token && r.state.coins === 1500, 'register returns token + starting state (1,500 coins)');
const A = r.token; const aId = r.state.user.id;
ok((await call('/api/register', { name: 'ayla', password: 'another-pass' })).error === 'taken', 'duplicate name (case-insensitive) rejected');
ok((await call('/api/register', { name: 'Bo', password: 'longenough' })).error === 'bad_name', 'too-short name rejected');
ok((await call('/api/register', { name: 'Bram', password: 'short' })).error === 'bad_password', 'short password rejected');
r = await call('/api/register', { name: 'Bram', password: 'bram-secret-9' }); const B = r.token; const bId = r.state.user.id;
ok((await call('/api/login', { name: 'Ayla', password: 'wrong-pass' })).error === 'auth', 'wrong password rejected');
ok((await call('/api/state')).status === 401, 'state without token → 401');
ok((await call('/api/state', null, 'x'.repeat(43))).status === 401, 'forged token → 401');
const rawUser = await store.getUserByNameKey('ayla'); ok(rawUser.pass.startsWith('scrypt$') && !rawUser.pass.includes('hunter-pass-1'), 'password stored as scrypt hash, not plain text');

// ---- shop
r = await act(A, 'buy', { item: 'potion', qty: 3 });
ok(r.ok && r.state.coins === 1500 - 180 && r.state.box.potion === 8, 'buy 3 potions: −180 coins, +3 in box');
ok((await act(A, 'buy', { item: 'potion', qty: 50 })).error === 'stock', 'cannot exceed shop stock');
ok((await act(A, 'buy', { item: 'vk_gem', qty: 1 })).error === 'not_sold', 'cannot buy unsold items');
ok((await act(A, 'buy', { item: 'snareCoil', qty: 1 })).ok, 'buy a Snare Coil');
await store.mutateSave(aId, (d) => { d.coins = 100; });
ok((await act(A, 'buy', { item: 'ironOre', qty: 2 })).error === 'coins', 'insufficient coins blocks purchase');
ok((await act(A, 'buy', { item: 'potion', qty: -2 })).error === 'bad_qty' && (await act(A, 'buy', { item: 'potion', qty: 1.5 })).error === 'bad_qty', 'negative / fractional quantities rejected');
r = await act(A, 'sell', { item: 'potion', qty: 2 });
ok(r.ok && r.state.box.potion === 6 && r.result.earned === 2 * ITEMS.potion.sell, 'sell 2 potions: −2 box, +coins');
ok((await act(A, 'sell', { item: 'potion', qty: 99 })).error === 'missing', 'cannot sell more than owned');
ok((await act(B, 'state')).error === 'bad_action', 'unknown action type rejected');

// ---- isolation
r = await call('/api/state', null, B); ok(r.state.coins === 1500 && r.state.box.potion === 5 && r.state.user.id === bId, 'second account unaffected by first');

// ---- concurrency: 12 parallel purchases with funds for exactly N
await store.mutateSave(bId, (d) => { d.coins = 5 * 60; });
const results = await Promise.all(Array.from({ length: 12 }, () => act(B, 'buy', { item: 'potion', qty: 1 })));
r = await call('/api/state', null, B);
ok(results.filter((x) => x.ok).length === 5 && r.state.coins === 0 && r.state.box.potion === 10, 'parallel buys: exactly 5 succeed, coins never negative');

// ---- smithing
await store.mutateSave(aId, (d) => { d.coins = 20000; });
ok((await act(A, 'craftWeapon', { def: 'emberhideBlade' })).error === 'missing', 'forge blocked without materials');
await give(aId, { vk_scale: 5, vk_horn: 1, ironOre: 6 });
r = await act(A, 'craftWeapon', { def: 'emberhideBlade' });
ok(r.ok && r.state.coins === 20000 - WEAPONS.emberhideBlade.craft.coins && !r.state.box.vk_scale && !r.state.box.vk_horn, 'forge Emberhide Greatblade consumes coins + materials');
const wUid = r.result.uid;
r = await act(A, 'equip', { slot: 'weapon', uid: wUid }); ok(r.ok && r.state.stats.attack === 624 && r.state.stats.element.type === 'fire', 'equip new weapon updates derived stats');
ok((await act(A, 'upgrade', { uid: wUid })).error === 'missing', 'upgrade blocked without materials');
await give(aId, { vk_hide: 3, vk_tail: 1, crimsonOre: 3 });
const c0 = (await call('/api/state', null, A)).state.coins;
r = await act(A, 'upgrade', { uid: wUid });
ok(r.ok && r.state.stats.attack === 672 && r.state.coins === c0 - 4200, 'upgrade weapon: stats rise, coins & mats spent');
ok((await act(A, 'sellEquip', { uid: wUid })).error === 'equipped', 'cannot sell equipped gear');
await give(aId, { ironOre: 4, monsterBone: 2 });
r = await act(A, 'craftArmor', { def: 'iron_head' }); const hUid = r.result.uid;
r = await act(A, 'equip', { slot: 'head', uid: hUid }); ok(r.ok && r.state.stats.skills.steadfast === 1, 'armour piece equips and grants its skill');
ok((await act(A, 'equip', { slot: 'chest', uid: hUid })).error === 'bad_slot', 'armour cannot go in the wrong slot');
ok((await act(A, 'equip', { slot: 'head', uid: 'e999' })).error === 'no_equip', 'cannot equip gear you do not own');
ok((await act(B, 'upgrade', { uid: wUid })).error === 'no_equip', "cannot touch another player's equipment");

// ---- alchemy
ok((await act(A, 'alchemy', { recipe: 'coolingSalve', qty: 1 })).error === 'locked', 'locked recipe cannot be brewed');
const s0 = (await call('/api/state', null, A)).state;
r = await act(A, 'alchemy', { recipe: 'potion', qty: 2 });
ok(r.ok && r.state.box.potion === (s0.box.potion || 0) + 2 && (r.state.box.sunpetal || 0) === s0.box.sunpetal - 2 && r.state.crafted.potion === 2, 'alchemy: 2 Draughts from 2 Sunpetal + 2 Glowcap');
ok((await act(A, 'alchemy', { recipe: 'potion', qty: 5 })).error === 'missing', 'alchemy blocked when ingredients run out');

// ---- storage
r = await act(A, 'move', { item: 'potion', qty: 3, to: 'pouch' }); ok(r.ok && r.state.pouch.potion === 8, 'move potions box → pouch');
ok((await act(A, 'move', { item: 'potion', qty: 5, to: 'pouch' })).error === 'pouch_max', 'pouch item cap enforced');
ok((await act(A, 'move', { item: 'ironOre', qty: 1, to: 'pouch' })).error === 'no_pouch', 'materials cannot go in the pouch');

// ---- quests
ok((await act(A, 'acceptQuest', { quest: 'q_cw1' })).error === 'unavailable', 'quest locked behind rank/prerequisites');
ok((await act(A, 'depart')).error === 'none', 'cannot depart without a quest');
r = await act(A, 'acceptQuest', { quest: 'q_vk1' }); ok(r.ok && r.state.quests.active.qid === 'q_vk1', 'accept "Emberhide Awakens"');
ok((await act(A, 'acceptQuest', { quest: 'q_ore' })).error === 'active', 'only one active quest at a time');
r = await act(A, 'depart'); const iid = r.result.iid;
ok(r.ok && iid && !r.state.pouch.potion && r.result.carried.potion === 8, 'depart: expedition created, pouch carried out');
ok((await act(A, 'equip', { slot: 'weapon', uid: 'e1' })).error === 'busy', 'no gear changes mid-hunt');
const coinsBefore = r.state.coins, xpBefore = r.state.profile.xp;
clock += 30 * 1000;
r = await act(A, 'completeQuest', { iid, report: { slain: true, used: { potion: 2 } } });
ok(r.ok === false && r.error === 'too_early' && r.state.quests.expedition?.iid === iid, 'implausibly fast report refused without consuming the expedition');
r = await act(A, 'failQuest', { iid, report: { used: { potion: 2 } } });
ok(r.ok && r.state.pouch.potion === 6 && r.state.quests.active?.qid === 'q_vk1', 'failQuest returns unused items and keeps the quest accepted');
r = await act(A, 'depart'); const iid2 = r.result.iid;
clock += 8 * 60 * 1000;
r = await act(A, 'completeQuest', { iid: iid2, report: { slain: true, parts: ['head', 'tail', 'nonsense'], used: { potion: 1 }, gathered: { vk_gem: 99 } } });
const items = r.result?.rewards?.items || {};
ok(r.ok && r.result.ok && r.state.coins > coinsBefore && r.state.profile.xp > xpBefore && r.state.quests.cleared.q_vk1 === 1, 'valid clear: coins + xp + cleared count');
ok(items.vk_horn >= 1 && items.vk_tail >= 1 && !items.vk_gem_fake && (items.vk_gem || 0) <= 2, 'part-break rewards granted; forged "gathered" monster gems ignored');
ok(r.state.hunts.varkhul.slain === 1 && r.state.recipes.mightSeed === true, 'hunt log updated; slain-gated recipe unlocked');
ok((await act(A, 'completeQuest', { iid: iid2, report: { slain: true } })).error === 'no_expedition', 'double reward prevented (expedition single-use)');
// gather quest
r = await act(A, 'acceptQuest', { quest: 'q_gather_intro' }); r = await act(A, 'depart'); const iid3 = r.result.iid; clock += 120 * 1000;
ok((await act(A, 'completeQuest', { iid: iid3, report: { gathered: { sunpetal: 2, glowcap: 3 } } })).result.ok === false, 'gather quest fails when target counts not met');
r = await act(A, 'acceptQuest', { quest: 'q_gather_intro' }); r = await act(A, 'depart'); const iid4 = r.result.iid; clock += 120 * 1000; const sp0 = r.state.box.sunpetal || 0;
r = await act(A, 'completeQuest', { iid: iid4, report: { gathered: { sunpetal: 500, glowcap: 3 } } });
ok(r.result.ok && r.state.box.sunpetal - sp0 <= 12, 'gathered amounts are capped server-side');
// delivery quest
r = await act(A, 'acceptQuest', { quest: 'q_deliver_scales' });
ok((await act(A, 'deliverQuest')).error === 'missing' || r.ok, 'delivery requires the materials');
await give(aId, { vk_scale: 3, ironOre: 3 }); const dc = (await call('/api/state', null, A)).state.coins;
r = await act(A, 'deliverQuest'); ok(r.ok && r.state.coins === dc + QUESTS.q_deliver_scales.coins && r.state.quests.cleared.q_deliver_scales === 1, 'delivery quest consumes materials and pays out');
// stale expedition expiry returns items
r = await act(A, 'acceptQuest', { quest: 'q_ore' }); await act(A, 'move', { item: 'potion', qty: 2, to: 'pouch' }).catch(() => {});
r = await act(A, 'depart'); clock += (QUESTS.q_ore.timeLimit + 700) * 1000; r = await call('/api/state', null, A);
ok(!r.state.quests.expedition && r.state.quests.history.at(-1).why === 'Expired', 'abandoned (never reported) hunts expire and return carried items');

// ---- persistence across login
const stA = (await call('/api/state', null, A)).state;
ok((await call('/api/logout', {}, A)).ok && (await call('/api/state', null, A)).status === 401, 'logout invalidates the session');
r = await call('/api/login', { name: 'AYLA', password: 'hunter-pass-1' });
ok(r.ok && r.state.coins === stA.coins && JSON.stringify(r.state.box) === JSON.stringify(stA.box) && r.state.equip.length === stA.equip.length, 're-login restores identical data');
ok(r.state.ledger.length > 5 && r.state.ledger.every((l) => typeof l.d === 'number'), 'coin ledger (earn/spend history) recorded');

server.close(); await store.close();
console.log(`\n${pass} passed, ${failN} failed`); process.exit(failN ? 1 : 0);
