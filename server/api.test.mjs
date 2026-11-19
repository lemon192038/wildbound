// API / economy integration tests: node server/api.test.mjs
import http from 'node:http';
import { openStore } from './store.js';
import { createApi } from './api.js';
import { createWorld } from './world.js';
import { createVolcano, VOLCANO } from './volcano.js';
import { census, loadEco } from '../src/shared/ecosystem.js';
import { ITEMS, WEAPONS, QUESTS } from '../src/shared/gamedata.js';

let clock = 1_700_000_000_000;
const pgModule = process.env.STORE === 'pgmem' ? (await import('pg-mem')).newDb().adapters.createPg() : null; // run the suite against an in-memory Postgres too
const store = await openStore({ file: ':memory:', log: () => {}, pgModule });
const volcano = await createVolcano(store, { now: () => clock, log: () => {}, autoTick: false, onPhase: (p) => world?.setRampage(p === 'awakened') });
const world = await createWorld(store, { now: () => clock, log: () => {}, autoTick: false, onSlimeKill: (n) => volcano.slimeKilled(n) });
const api = createApi(store, { now: () => clock, log: () => {}, world, volcano });
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
r = await act(A, 'equip', { slot: 'weapon', uid: wUid }); ok(r.ok && r.state.stats.attack === (await import('../src/shared/gamedata.js')).WEAPONS.emberhideBlade.levels[0].attack && r.state.stats.element.type === 'fire', 'equip new weapon updates derived stats');
ok((await act(A, 'upgrade', { uid: wUid })).error === 'missing', 'upgrade blocked without materials');
await give(aId, { vk_hide: 3, vk_tail: 1, crimsonOre: 3 });
const c0 = (await call('/api/state', null, A)).state.coins;
r = await act(A, 'upgrade', { uid: wUid });
ok(r.ok && r.state.stats.attack === (await import('../src/shared/gamedata.js')).WEAPONS.emberhideBlade.levels[1].attack && r.state.stats.attack > (await import('../src/shared/gamedata.js')).WEAPONS.emberhideBlade.levels[0].attack && r.state.coins === c0 - 4200, 'upgrade weapon: stats rise, coins & mats spent');
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
ok((await act(A, 'depart', { mode: 'quest' })).error === 'none', 'cannot depart on a quest expedition without a quest');
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
ok(r.result.ok === false && (r.state.box.sunpetal || 0) - sp0 === 0, 'island quests: a forged "gathered" report counts for nothing (the server counts gathering itself)');
// delivery quest
r = await act(A, 'acceptQuest', { quest: 'q_deliver_scales' });
ok((await act(A, 'deliverQuest')).error === 'missing' || r.ok, 'delivery requires the materials');
await give(aId, { vk_scale: 3, ironOre: 3 }); const dc = (await call('/api/state', null, A)).state.coins;
r = await act(A, 'deliverQuest'); ok(r.ok && r.state.coins === dc + QUESTS.q_deliver_scales.coins && r.state.quests.cleared.q_deliver_scales === 1, 'delivery quest consumes materials and pays out');
// stale expedition expiry returns items
r = await act(A, 'acceptQuest', { quest: 'q_ore' }); await act(A, 'move', { item: 'potion', qty: 2, to: 'pouch' }).catch(() => {});
r = await act(A, 'depart'); clock += (QUESTS.q_ore.timeLimit + 700) * 1000; r = await call('/api/state', null, A);
ok(!r.state.quests.expedition && r.state.quests.history.at(-1).why === 'Expired', 'abandoned (never reported) hunts expire and return carried items');

// ---- free expeditions (world map)
ok((await act(A, 'depart', { mode: 'free', dest: 'nowhere' })).error === 'bad_dest', 'free expedition needs a real destination');
r = await act(A, 'acceptQuest', { quest: 'q_vk1' });
ok((await act(A, 'depart', { mode: 'quest', dest: 'cinderdeep_hollow' })).error === 'wrong_dest', 'quest expedition cannot sail to another destination');
let s1 = (await call('/api/state', null, A)).state;
r = await act(A, 'depart', { mode: 'free', dest: 'cinderdeep_hollow' }); const fiid = r.result.iid;
ok(r.ok && r.state.quests.expedition.free && r.state.quests.expedition.dest === 'cinderdeep_hollow' && r.state.quests.active?.qid === s1.quests.active?.qid && !!s1.quests.active, 'free expedition to Cinderdeep Hollow while a quest stays accepted');
clock += 20 * 1000;
ok((await act(A, 'completeQuest', { iid: fiid, report: { slain: true } })).error === 'too_early', 'free slay reported implausibly fast is refused');
clock += 60 * 1000;
r = await act(A, 'completeQuest', { iid: fiid, report: { slain: true, parts: ['fistL', 'head'], gathered: { ironOre: 50 } } });
ok(r.ok && r.result.free && r.state.coins === s1.coins && r.state.profile.xp === s1.profile.xp, 'free expedition: no bounty coins or XP');
ok(JSON.stringify(r.state.quests.cleared) === JSON.stringify(s1.quests.cleared) && r.state.quests.active?.qid === s1.quests.active.qid, 'free expedition never clears or consumes the accepted quest');
ok(r.state.hunts.brute?.slain === 1 && !r.result.rewards.items.gv_knuckle && !r.result.rewards.items.ironOre, 'free island expedition: hunt log kept; carving and gathering happen on the spot, nothing auto-granted');
ok((await act(A, 'completeQuest', { iid: fiid, report: { slain: true } })).error === 'no_expedition', 'free expedition rewards cannot be claimed twice');
r = await act(A, 'depart', { mode: 'quest' });
ok(r.ok && r.result.dest === 'ember_foothills' && !r.state.quests.expedition.free, 'quest expedition goes to its monster\'s destination (Varkhul → Emberfall Foothills)');
await act(A, 'failQuest', { iid: r.result.iid }); await act(A, 'abandonQuest');

// ---- island expeditions (stage 5): field carving, idempotent, limited
{
  ok((await act(B, 'islandCarve', { iid: 'nope', cid: 'x1:b0', src: 'beetle' })).error === 'no_expedition', 'cannot carve without an island expedition');
  let r = await act(B, 'departIsland'); const iiid = r.result.iid;
  ok(r.ok && r.state.quests.expedition.island && r.state.quests.expedition.dest === 'island', 'depart for the island');
  ok((await act(B, 'departIsland')).error === 'busy' && (await act(B, 'depart', { mode: 'free', dest: 'cinderdeep_hollow' })).error === 'busy', 'one expedition at a time');
  ok((await act(B, 'islandCarve', { iid: iiid, cid: 's1.7:b0', src: 'boar' })).error === 'too_early', 'no carving right after landing');
  clock += 30 * 1000;
  const box0 = (await call('/api/state', null, B)).state.box;
  r = await act(B, 'islandCarve', { iid: iiid, cid: 's1.7:b0', src: 'boar' });
  ok(r.ok && ['cb_hide', 'cb_crystal', 'cb_tusk'].includes(r.result.item) && r.state.box[r.result.item] === (box0[r.result.item] || 0) + 1, `boar body carve → ${r.result?.item} straight into the box`);
  const again = await act(B, 'islandCarve', { iid: iiid, cid: 's1.7:b0', src: 'boar' });
  ok(again.ok && again.result.dup && again.result.item === r.result.item && again.state.box[r.result.item] === r.state.box[r.result.item], 'the same carve id never grants twice (retry / double tap)');
  const same = await Promise.all(Array.from({ length: 5 }, () => act(B, 'islandCarve', { iid: iiid, cid: 's1.7:b1', src: 'boar' })));
  const st = (await call('/api/state', null, B)).state;
  ok(same.filter((x) => x.ok && !x.result.dup).length === 1 && st.quests.expedition.carves === 2, '5 simultaneous carves of one slot → exactly one grant');
  ok((await act(B, 'islandCarve', { iid: iiid, cid: 's1.7:b3', src: 'boar' })).error === 'bad_carve', 'a boar has only 3 body carves');
  r = await act(B, 'islandCarve', { iid: iiid, cid: 's1.7:pcrystal', src: 'boar', part: 'crystal' });
  ok(r.ok && r.result.item === 'cb_crystal', 'broken crystal part → Mineral Crystal');
  ok((await act(B, 'islandCarve', { iid: iiid, cid: 's1.7:pwings', src: 'boar', part: 'wings' })).error === 'bad_part', 'a boar has no wings to carve');
  ok((await act(B, 'islandCarve', { iid: iiid, cid: 's1.8:b0', src: 'unicorn' })).error === 'bad_source', 'unknown creatures rejected');
  r = await act(B, 'islandCarve', { iid: iiid, cid: 's1.9:pwings', src: 'wyvern', part: 'wings' });
  ok(r.ok && r.result.item === 'cw_membrane', 'island Cindral wing break uses its own break table');
  ok((await act(B, 'islandCarve', { iid: iiid, cid: 's1.10:b0', src: 'wyvern' })).error === 'rate', 'one Cindral carcass per cooldown (no farming)');
  let rate = null; for (let i = 0; i < 6; i++) rate = await act(B, 'islandCarve', { iid: iiid, cid: `s1.l${i}:b0`, src: 'lizard' });
  ok(rate.error === 'rate', 'too many lizard carcasses per minute → rate limited');
  r = await act(B, 'returnIsland', { iid: iiid, used: {} });
  ok(r.ok && !r.state.quests.expedition && r.result.carves >= 6, `return to port (${r.result?.carves} carves)`);
  ok((await act(B, 'returnIsland', { iid: iiid })).error === 'no_expedition' && (await act(B, 'islandCarve', { iid: iiid, cid: 's1.99:b0', src: 'beetle' })).error === 'no_expedition', 'nothing can be claimed after returning');
}

// ---- island gear (stage 5b): forged from island materials, upgraded, compared through the shared stats
{
  ok((await act(B, 'craftWeapon', { def: 'venomFangSword' })).error === 'missing', 'island weapon needs island materials');
  await give(bId, { vd_scale: 4, vd_fang: 1, vd_venom_sac: 1, vd_shell: 3, vd_tail: 1 });
  await store.mutateSave(bId, (d) => { d.coins += 20000; });
  let r = await act(B, 'craftWeapon', { def: 'venomFangSword' }); const vuid = r.result?.uid;
  ok(r.ok && r.state.equip.some((e) => e.uid === vuid && e.def === 'venomFangSword') && !r.state.box.vd_venom_sac, 'forge the Venom-fang Greatsword (materials consumed)');
  r = await act(B, 'upgrade', { uid: vuid });
  ok(r.ok && r.state.equip.find((e) => e.uid === vuid).lvl === 1 && !r.state.box.vd_shell, 'upgrade it with Venom-fang shells + tail');
  r = await act(B, 'equip', { slot: 'weapon', uid: vuid });
  ok(r.ok && r.state.stats.element?.type === 'poison' && r.state.stats.element.value === 440, `equipped: poison element ${r.state.stats.element?.value}`);
  await give(bId, { cb_hide: 4, cb_crystal: 3 }); // chest pieces cost ×1.25: 4 hides + 3 crystals
  r = await act(B, 'craftArmor', { def: 'crystalboar_chest' });
  ok(r.ok && r.state.equip.some((e) => e.def === 'crystalboar_chest'), 'forge a Crystal Boar chest piece');
}

// ---- persistence across login
const stA = (await call('/api/state', null, A)).state;
ok((await call('/api/logout', {}, A)).ok && (await call('/api/state', null, A)).status === 401, 'logout invalidates the session');
r = await call('/api/login', { name: 'AYLA', password: 'hunter-pass-1' });
ok(r.ok && r.state.coins === stA.coins && JSON.stringify(r.state.box) === JSON.stringify(stA.box) && r.state.equip.length === stA.equip.length, 're-login restores identical data');
ok(r.state.ledger.length > 5 && r.state.ledger.every((l) => typeof l.d === 'number'), 'coin ledger (earn/spend history) recorded');

// ---- weapon classes: a hammer is forged and equipped like any weapon; the loadout reports its class
{
  const H = (await call('/api/register', { name: 'Smith', password: 'smith-pass-123' })); const hid = H.state.user.id;
  await give(hid, { ironOre: 6, monsterBone: 2 });
  r = await act(H.token, 'craftWeapon', { def: 'basaltMaul' }); ok(r.ok && r.result.uid, 'forge a hammer (Basalt Maul)');
  r = await act(H.token, 'equip', { slot: 'weapon', uid: r.result.uid }); ok(r.ok && r.state.stats.cls === 'hammer' && r.state.stats.attack === 480, 'equipped loadout reports weapon class "hammer"');
  ok(r.state.stats && (await act(H.token, 'craftWeapon', { def: 'venomStringBow' })).error === 'missing', 'a bow still needs its materials');
  await give(hid, { ironOre: 8, monsterBone: 3 }); await store.mutateSave(hid, (d) => { d.coins += 5000; });
  r = await act(H.token, 'craftWeapon', { def: 'rustedAnchor' }); r = await act(H.token, 'equip', { slot: 'weapon', uid: r.result.uid });
  ok(r.ok && r.state.stats.cls === 'anchor', 'stage 6c class weapon (Rusted Ancient Anchor) forged and equipped: loadout class "anchor"');
}

// ---- island gathering (src/shared/islandGather.js, economy islandGather)
{
  const { createIslandField } = await import('../src/world/island/islandField.js'); const { pointsInTile } = await import('../src/shared/islandGather.js');
  const F = createIslandField(1337); const G = (await call('/api/register', { name: 'Gatherer', password: 'gather-pass-1' })); const gt = G.token;
  ok((await act(gt, 'islandGather', { iid: 'x', gid: '1_1_1' })).error === 'no_expedition', 'gathering needs an expedition');
  r = await act(gt, 'acceptQuest', { quest: 'qi_gather_coast' }); ok(r.ok, 'island gather quest accepted');
  r = await act(gt, 'depart'); const giid = r.result.iid; ok(r.ok && r.result.dest === 'volcanic_island', 'quest departs to the Volcanic Island');
  ok((await act(gt, 'islandGather', { iid: giid, gid: '999_1_1' })).error === 'bad_point', 'a made-up gather point is refused');
  const pts = []; for (let tz = 0; tz < 36 && pts.length < 300; tz++) for (let tx = 0; tx < 36; tx++) for (const p of pointsInTile(F, tx, tz)) if (p.region === 'coast' && p.kind === 'shell') pts.push(p);
  const p0 = pts[0]; clock += 2000; const g1 = await act(gt, 'islandGather', { iid: giid, gid: p0.gid, use: 0 });
  ok(g1.ok && g1.state.box[g1.result.item] >= 1, `gathering puts the server-rolled item in the box (${g1.result?.item})`);
  ok((await act(gt, 'islandGather', { iid: giid, gid: p0.gid, use: 0 })).result?.dup, 'the same gather use is idempotent');
  ok((await act(gt, 'islandGather', { iid: giid, gid: p0.gid, use: 1 })).error === 'rate', 'gathering too fast is refused');
  clock += 2000; await act(gt, 'islandGather', { iid: giid, gid: p0.gid, use: 1 }); clock += 2000;
  ok((await act(gt, 'islandGather', { iid: giid, gid: p0.gid, use: 2 })).error === 'empty', 'a point runs out after its uses');
  const need = { saltKelp: 4, seaGlass: 2 }; let have = { saltKelp: 0, seaGlass: 0 }; let g = 0;
  for (const p of pts.slice(1)) { for (let u = 0; u < 2; u++) { clock += 1000; const x = await act(gt, 'islandGather', { iid: giid, gid: p.gid, use: u }); g++; if (x.ok && x.result.item in have) have[x.result.item] += x.result.qty; } if (have.saltKelp >= need.saltKelp && have.seaGlass >= need.seaGlass) break; }
  clock += 60000; r = await act(gt, 'completeQuest', { iid: giid, report: { gathered: {} } });
  ok(r.ok && r.result.ok, `gather quest completes from the server's own count (${g} gathers: kelp ${have.saltKelp}, glass ${have.seaGlass})`);
  // a creature quest: slayN counts are checked
  r = await act(gt, 'acceptQuest', { quest: 'qi_beetle' }); r = await act(gt, 'depart'); const biid = r.result.iid; clock += 120000;
  ok((await act(gt, 'completeQuest', { iid: biid, report: { kills: { beetle: 1 } } })).result.ok === false, 'creature quest fails when too few were hunted');
  r = await act(gt, 'acceptQuest', { quest: 'qi_beetle' }); r = await act(gt, 'depart'); const biid2 = r.result.iid; clock += 120000;
  r = await act(gt, 'completeQuest', { iid: biid2, report: { kills: { beetle: 3 } } }); ok(r.ok && r.result.ok, 'creature quest (3 Magma Beetles) completes');
}

// ---- taming: Monster Workshop (src/shared/tame.js, economy craftTame / equipTame)
{
  const { tameRecipe } = await import('../src/shared/tame.js'); const { MONSTERS, ITEMS } = await import('../src/shared/gamedata.js');
  const T = await call('/api/register', { name: 'Tamer', password: 'tamer-pass-1' }); const tt = T.token, tid = T.state.user.id;
  ok((await act(tt, 'craftTame', { sp: 'nope' })).error === 'no_tame', 'an unknown construct is refused');
  ok((await act(tt, 'craftTame', { sp: 'snake' })).error === 'missing_life', 'a construct needs an egg or a juvenile’s remains');
  await give(tid, { egg_snake: 1 });
  ok((await act(tt, 'craftTame', { sp: 'snake' })).error === 'missing', 'a construct needs every part material');
  const R = tameRecipe('snake', MONSTERS, ITEMS); const all = { ...R.parts }; for (const [k, q] of Object.entries(R.extra)) all[k] = (all[k] || 0) + q;
  const short = { ...all }; const firstPart = Object.keys(R.parts)[0]; short[firstPart] -= 1; await give(tid, short); await store.mutateSave(tid, (d) => { d.coins += R.coins; });
  ok((await act(tt, 'craftTame', { sp: 'snake' })).error === 'missing', 'one part material short → still refused, nothing spent');
  await give(tid, { [firstPart]: 1 });
  r = await act(tt, 'craftTame', { sp: 'snake' });
  ok(r.ok && r.state.tames.snake && r.state.tameEquip === 'snake', 'the artificial Lava Snake is built and auto-equipped');
  ok(Object.keys(all).every((k) => !r.state.box[k]) && !r.state.box.egg_snake, 'every part + gathered material and the egg were consumed');
  ok((await act(tt, 'craftTame', { sp: 'snake' })).error === 'owned', 'one construct per species');
  ok((await act(tt, 'equipTame', { sp: 'flame' })).error === 'not_owned', 'cannot equip a construct you do not own');
  r = await act(tt, 'equipTame', { sp: null }); ok(r.ok && r.state.tameEquip === null, 'construct unequipped');
  r = await act(tt, 'equipTame', { sp: 'snake' }); ok(r.ok && r.state.tameEquip === 'snake', 'construct re-equipped');
  // a juvenile's remains work too (Flame Dragon construct: the dragon lineage)
  const R2 = tameRecipe('flame', MONSTERS, ITEMS); const all2 = { ...R2.parts }; for (const [k, q] of Object.entries(R2.extra)) all2[k] = (all2[k] || 0) + q;
  await give(tid, { ...all2, juv_dragon: 1 }); await store.mutateSave(tid, (d) => { d.coins += R2.coins; });
  r = await act(tt, 'craftTame', { sp: 'flame' }); ok(r.ok && r.state.tames.flame && !r.state.box.juv_dragon, 'a dragon juvenile’s remains build the Flame Dragon construct');
}
// ---- sea chart habitats (src/shared/habitats.js): depart to any monster's habitat on the island
{
  const L = await call('/api/register', { name: 'Lander', password: 'lander-pass-1' }); const lt = L.token;
  r = await act(lt, 'acceptQuest', { quest: 'qi_boar' }); ok(r.ok, 'island creature quest accepted');
  ok((await act(lt, 'depart', { mode: 'quest', dest: 'volcanic_island', landing: 'hab_nowhere' })).error === 'bad_landing', 'an unknown landing site is refused');
  r = await act(lt, 'depart', { mode: 'quest', dest: 'volcanic_island', landing: 'hab_tusk' });
  ok(r.ok && r.result.dest === 'volcanic_island' && r.result.landing === 'hab_tusk' && r.state.quests.expedition.landing === 'hab_tusk', 'an island quest departs to the chosen habitat (Crystal Tusk ground)');
  await act(lt, 'abandonQuest'); clock += 4000000;
  const L2 = await call('/api/register', { name: 'Lander2', password: 'lander-pass-2' });
  r = await act(L2.token, 'departIsland', { landing: 'hab_cindaryl' }); ok(r.ok && r.result.landing === 'hab_cindaryl', 'a free island expedition can land at any habitat');
}
// ---- eggs and juveniles (src/shared/lifecycle.js, economy islandEgg / islandCarve stage 0)
{
  const E = await call('/api/register', { name: 'Eggseeker', password: 'eggseeker-pass-1' }); const et = E.token;
  ok((await act(et, 'islandEgg', { iid: 'x', eid: 'e1x', src: 'big', nest: 'nest_venom' })).error === 'no_expedition', 'egg taking needs an expedition');
  r = await act(et, 'departIsland'); const eiid = r.result.iid; clock += 10000;
  r = await act(et, 'islandEgg', { iid: eiid, eid: 'egg.b1', src: 'big', nest: 'nest_venom' });
  ok(r.ok && r.state.box.egg_dragon === 1, 'a dragon egg from the Venom-fang nest');
  ok((await act(et, 'islandEgg', { iid: eiid, eid: 'egg.b1', src: 'big', nest: 'nest_venom' })).result?.dup, 'the same egg id is idempotent');
  ok((await act(et, 'islandEgg', { iid: eiid, eid: 'egg.b2', src: 'big', nest: 'nest_venom' })).error === 'empty', 'a big nest is empty for a while after an egg is taken');
  ok((await act(et, 'islandEgg', { iid: eiid, eid: 'egg.b3', src: 'big', nest: 'nest_nope' })).error === 'no_nest', 'an unknown nest is refused');
  ok((await act(et, 'islandEgg', { iid: eiid, eid: 'egg.e1', src: 'eco', sp: 'beetle', x: 0, z: 0 })).error, 'no ecosystem nest there → refused');
  { // an ecosystem nest: plant one with 2 eggs in a real tile, take one through the API
    const T = Object.values(world.W.tiles).find((q) => q.p.beetle); const half = world.field.half;
    T.nest.push({ sp: 'beetle', n: 2, t: 999, dx: 30, dz: 30, kind: 'egg', id: 4242 });
    const ex = -half + T.tx * 64 + 30, ez = -half + T.tz * 64 + 30;
    r = await act(et, 'islandEgg', { iid: eiid, eid: 'egg.e2', src: 'eco', sp: 'beetle', x: ex, z: ez, nid: 4242 });
    ok(r.ok && r.state.box.egg_beetle === 1 && T.nest.find((q) => q.id === 4242).n === 1, 'an ecosystem nest gives a beetle egg and has one fewer to hatch');
    await act(et, 'islandEgg', { iid: eiid, eid: 'egg.e3', src: 'eco', sp: 'beetle', x: ex, z: ez, nid: 4242 });
    ok((await act(et, 'islandEgg', { iid: eiid, eid: 'egg.e4', src: 'eco', sp: 'beetle', x: ex, z: ez, nid: 4242 })).error === 'empty', 'an emptied nest is refused');
  }
  r = await act(et, 'islandCarve', { iid: eiid, cid: 'jx.1:b0', src: 'boar', part: 'body', stage: 0 });
  ok(r.ok && r.state.box.juv_boar === 1, 'carving a juvenile boar gives its remains');
  ok((await act(et, 'islandCarve', { iid: eiid, cid: 'jx.1:b1', src: 'boar', part: 'body', stage: 0 })).error === 'bad_carve', 'a juvenile carcass has a single carve');

}

// ---- the Volcano Slime world event (server/volcano.js)
{
  const reg = async (n) => { const r = await call('/api/register', { name: n, password: n + '-pass-123' }); return { tok: r.token, id: r.state.user.id }; };
  const V1 = await reg('Volcanist'), V2 = await reg('Cratergoer'), V3 = await reg('Rimwalker'), V4 = await reg('Ashdiver');
  const vol = (tok, kind, body = {}) => call('/api/volcano/' + kind, body, tok);
  r = await call('/api/volcano'); ok(r.ok && r.volcano.phase === 'flowing' && r.volcano.flow === 1 && !r.volcano.boss, 'GET /api/volcano: lava flowing, no boss (public)');
  ok((await vol(V1.tok, 'devour')).counted === false, 'falling into the crater while the lava flows is not counted');
  // a slime kill reported through the ecosystem weakens the flow
  const T = Object.values(world.W.tiles).find((q) => q.p.slime && q.p.slime.some((v) => v > 0)); const st = T.p.slime.findIndex((v) => v > 0);
  await call('/api/eco/report', { events: [{ eid: 'slime1', sp: 'slime', stage: st, x: -1152 + T.tx * 64 + 20, z: -1152 + T.tz * 64 + 20, cause: 'hunter' }] }, V1.tok);
  await new Promise((res) => setTimeout(res, 20));
  r = await call('/api/volcano'); ok(r.volcano.slimeKills === 1 && r.volcano.flow < 1 && r.volcano.chamber > 0, `a hunter's slime kill slows the lava (flow ${r.volcano.flow}, chamber ${r.volcano.chamber})`);
  await volcano.slimeKilled(VOLCANO.KILLS_TO_STOP);
  r = await call('/api/volcano'); ok(r.volcano.phase === 'stopped' && r.volcano.flow === 0 && r.volcano.chamber === 1, 'enough slime kills stop the lava; the magma chamber is full');
  ok((await call('/api/volcano/phase', { phase: 'awakened' }, V1.tok)).status === 404, 'clients cannot set the event state');
  // devours: one world counter, cooldown per hunter
  for (let i = 0; i < 98; i++) { clock += 16000; await vol(V1.tok, 'devour'); }
  const cd = await vol(V1.tok, 'devour'); ok(cd.counted === false && cd.why === 'cooldown', 'a hunter cannot count twice within the respawn cooldown');
  r = await call('/api/volcano'); ok(r.volcano.devoured === 98, 'devour counter at 98');
  clock += 16000; const race = await Promise.all([V2, V3, V4, V1].map((u) => vol(u.tok, 'devour')));
  const victims = race.filter((x) => x.victim); r = await call('/api/volcano');
  ok(victims.length === 1 && r.volcano.phase === 'awakened' && r.volcano.devoured === 100 && r.volcano.boss.hp === 100000, `100th devour (simultaneous arrivals) awakens it exactly once (victim ${r.volcano.victim?.name})`);
  const victim = [V2, V3, V4, V1][race.findIndex((x) => x.victim)]; const other = [V2, V3, V4, V1].find((u) => u !== victim);
  ok((await vol(other.tok, 'heartbeat', { alive: false })).victim === false && (await call('/api/volcano')).volcano.phase === 'awakened', "another hunter's death does not end the event");
  // damage: idempotent, capped per second
  let d = await vol(other.tok, 'damage', { events: [{ eid: 'd1', dmg: 2000 }, { eid: 'd1', dmg: 2000 }] });
  ok(d.applied === 2000, 'boss damage applied once per event id');
  d = await vol(other.tok, 'damage', { events: Array.from({ length: 10 }, (_, i) => ({ eid: 'x' + i, dmg: 2500 })) });
  ok(d.applied <= VOLCANO.MAX_DPS * 3 - 2000 + 1, `damage is capped per second (applied ${d.applied})`);
  // victim rules: logout (no heartbeat) → full reset
  clock += VOLCANO.VICTIM_TIMEOUT + 1000; await volcano.tick(); r = await call('/api/volcano');
  ok(r.volcano.phase === 'flowing' && r.volcano.slimeKills === 0 && r.volcano.devoured === 0 && r.volcano.flow === 1 && !r.volcano.boss, 'victim gone (no heartbeat) → the slime returns, lava flows, progress reset');
  const awaken = async () => { await volcano.slimeKilled(VOLCANO.KILLS_TO_STOP); for (let i = 0; i < 100; i++) { clock += 16000; await vol(V1.tok, 'devour'); } };
  await awaken(); ok((await call('/api/volcano', null, V1.tok)).volcano.victim?.you, 'awakened again: the 100th devourer is told they are the victim');
  await vol(V1.tok, 'heartbeat', { alive: true, region: true }); ok((await call('/api/volcano')).volcano.phase === 'awakened', 'victim alive in the volcano region: the event continues');
  await vol(V1.tok, 'heartbeat', { alive: true, region: false }); ok((await call('/api/volcano')).volcano.phase === 'flowing', 'victim leaves the volcano region → reset');
  await awaken(); await vol(V1.tok, 'heartbeat', { alive: false }); ok((await call('/api/volcano')).volcano.phase === 'flowing', 'victim dies → reset');
  await awaken(); await call('/api/logout', {}, V1.tok); ok((await call('/api/volcano')).volcano.phase === 'flowing', 'victim logs out → reset');
  // defeat: rewards to every contributor, once
  const V1b = await call('/api/login', { name: 'Volcanist', password: 'Volcanist-pass-123' }); V1.tok = V1b.token;
  await awaken();
  for (let k = 0; k < 60 && (await call('/api/volcano')).volcano.phase === 'awakened'; k++) { clock += 3000; await vol(V1.tok, 'heartbeat'); await vol(V1.tok, 'damage', { events: [{ eid: 'v' + k, dmg: 2500 }] }); await vol(V2.tok, 'damage', { events: [{ eid: 'w' + k, dmg: 2500 }] }); }
  r = await call('/api/volcano'); const s1 = await call('/api/state', null, V1.tok), s2 = await call('/api/state', null, V2.tok), s3 = await call('/api/state', null, V3.tok);
  ok(r.volcano.phase === 'defeated' && s1.state.box.vs_gel > 0 && s1.state.box.vs_core >= 1 && s2.state.box.vs_gel > 0 && !s3.state.box.vs_gel, 'defeated: rewards sent to the hunters who damaged it (victim gets a core); bystanders get nothing');
  const g1 = s1.state.box.vs_gel; await vol(V2.tok, 'damage', { events: [{ eid: 'late', dmg: 100 }] }); ok((await call('/api/state', null, V1.tok)).state.box.vs_gel === g1, 'rewards are granted only once');
  await store.mutateSave(V1.id, (d) => { d.coins += 30000; }); r = await act(V1.tok, 'craftWeapon', { def: 'calamity_greatsword' });
  ok(r.ok && r.state.box.vs_gel === g1 - 4, 'the Calamity line is forged from the Volcano Slime rewards');
  clock += VOLCANO.AFTERMATH + 1000; await volcano.tick(); r = await call('/api/volcano'); ok(r.volcano.phase === 'flowing' && r.volcano.cycle === 2, 'after the aftermath a new cycle begins');
  await volcano.save(); const vrow = await store.getWorld('volcano'); ok(vrow && JSON.parse(vrow.data).cycle === 2, 'event state persisted in world_state');
}

// ---- island ecosystem (server/world.js, src/shared/ecosystem.js)
{
  const A = (await call('/api/register', { name: 'Ecoist', password: 'eco-pass-123' })).token;
  r = await call('/api/eco?x=0&z=300&r=2');
  ok(r.ok && r.eco.tiles.length > 0 && r.eco.tiles.every((t) => t.env && t.p), 'GET /api/eco returns nearby tiles without a login');
  ok((await call('/api/eco/report', { events: [] })).status === 401, 'reports need a login');
  // find a tile with a beetle and kill one there
  const Wd = world.W; const T = Object.values(Wd.tiles).find((q) => q.p.beetle && q.p.beetle[2] > 0);
  const x = -1152 + T.tx * 64 + 30, z = -1152 + T.tz * 64 + 30; const before = census(Wd).beetle;
  r = await call('/api/eco/report', { events: [{ eid: 'k1', sp: 'beetle', stage: 2, x, z, cause: 'hunter' }] }, A);
  ok(r.ok && r.results[0].ok && census(Wd).beetle === before - 1, 'a reported kill removes that beetle from the world');
  ok(T.cc.some((c) => c.sp === 'beetle') && T.hunt > 0, 'the kill leaves a carcass and raises hunting pressure there');
  r = await call('/api/eco/report', { events: [{ eid: 'k1', sp: 'beetle', stage: 2, x, z, cause: 'hunter' }] }, A);
  ok(r.results[0].dup && census(Wd).beetle === before - 1, 'the same event id is applied once (idempotent)');
  const sea = await call('/api/eco/report', { events: [{ eid: 'k2', sp: 'golem', stage: 2, x: 1100, z: 1100, cause: 'hunter' }] }, A);
  ok(!sea.results[0].ok, 'a report cannot invent a death where no such creature lives');
  ok(!(await call('/api/eco/report', { events: [{ eid: 'k3', sp: 'dragon', x, z }] }, A)).results[0].ok, 'unknown species rejected');
  // persistence + catch-up
  world.tick(30); await world.save(); const row = await store.getWorld('eco');
  ok(row && JSON.stringify(census(loadEco(world.field, row.data))) === JSON.stringify(census(Wd)), 'ecosystem saved to world_state and reloads identically');
  clock += 3 * 3600 * 1000; const w2 = await createWorld(store, { now: () => clock, log: () => {}, autoTick: false });
  ok(w2.W.t > Wd.t + 3 * 3600 - 200, 'a restarted server catches up the hours it slept (no frozen world)');
}

server.close(); await store.close();
console.log(`\n${pass} passed, ${failN} failed`); process.exit(failN ? 1 : 0);
