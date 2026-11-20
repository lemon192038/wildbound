// Where every material comes from (user request: Mame Chishikii tells the hunter where each material can be found).
// Pure and derived from the same tables the game and the server use, so the guide can never drift from the drops:
//   island gathering points  REGION_TABLE (src/shared/islandGather.js)       → { t: 'gather', region, kind, pct }
//   boss-field points        FIELD_GATHER (src/shared/fieldGather.js)         → { t: 'field', dest, kind, pct }
//   body carves              ISLAND_LOOT / MONSTERS[...].carves                → { t: 'carve', mon, pct }
//   part breaks              ISLAND_LOOT[...].parts / MONSTERS[...].breaks     → { t: 'break', mon, part }
//   eggs / juvenile remains  LIFE (src/shared/lifecycle.js)                    → { t: 'egg' | 'juv', mons, regions }
//   the market               SHOP.stock                                        → { t: 'shop', price }
// The hidden Volcano Slime's materials are never listed (CLAUDE.md: keep the event out of guides).
import { ITEMS, MONSTERS, SHOP } from './gamedata.js';
import { REGION_TABLE } from './islandGather.js';
import { ISLAND_LOOT } from './islandLoot.js';
import { LIFE, LINEAGE } from './lifecycle.js';
import { FIELD_GATHER, FIELD_GATHER_DESTS } from './fieldGather.js';

export const isHiddenMaterial = (id) => /^vs_/.test(id);
const pctOf = (table, id) => { const tot = table.reduce((a, [, w]) => a + w, 0); const w = table.filter(([k]) => k === id).reduce((a, [, x]) => a + x, 0); return tot ? Math.round((w / tot) * 1000) / 10 : 0; };
const add = (map, id, src) => { if (!ITEMS[id] || isHiddenMaterial(id)) return; (map[id] ||= []).push(src); };

// special individuals and roamers share their species' nests; Cindral (wyvern) keeps no nest on the island
const NOT_NESTERS = new Set(['cindral', 'wyvern', 'flameUpper', 'flameRoam', 'venom2', 'tusk', 'leader', 'grandmole']);
let cache = null;
function build() {
  const S = {};
  for (const [region, kinds] of Object.entries(REGION_TABLE)) for (const [kind, table] of Object.entries(kinds)) for (const [id] of table) add(S, id, { t: 'gather', region, kind, pct: pctOf(table, id) });
  for (const [kind, table] of Object.entries(FIELD_GATHER)) for (const [id] of table) for (const dest of FIELD_GATHER_DESTS) add(S, id, { t: 'field', dest, kind, pct: pctOf(table, id) });
  const carveTables = {};
  for (const [mon, L] of Object.entries(ISLAND_LOOT)) if (!L.from) carveTables[mon] = { body: L.body, parts: L.parts };
  for (const [mon, M] of Object.entries(MONSTERS)) carveTables[mon] = { body: M.carves, parts: M.breaks };
  for (const [mon, { body, parts }] of Object.entries(carveTables)) {
    for (const [id] of body || []) add(S, id, { t: 'carve', mon, pct: pctOf(body, id) });
    for (const [part, id] of Object.entries(parts || {})) add(S, id, { t: 'break', mon, part });
  }
  for (const [lin, L] of Object.entries(LIFE)) {
    const mons = Object.keys(LINEAGE).filter((sp) => LINEAGE[sp] === lin && !NOT_NESTERS.has(sp));
    add(S, L.egg, { t: 'egg', lineage: lin, mons, regions: L.nest.regions });
    add(S, L.juv, { t: 'juv', lineage: lin, mons, regions: L.nest.regions });
  }
  for (const id of Object.keys(SHOP.stock)) if (ITEMS[id]?.kind === 'material') add(S, id, { t: 'shop', price: ITEMS[id].buy });
  const rank = { gather: 0, field: 1, carve: 2, break: 3, egg: 4, juv: 4, shop: 5 };
  for (const list of Object.values(S)) list.sort((a, b) => rank[a.t] - rank[b.t] || (b.pct || 0) - (a.pct || 0)); // likeliest first within a kind of source
  return S;
}
export function materialSources(id) { cache ||= build(); return cache[id] || []; }
// every material the guide knows a source for, by category: gathered / monster parts / eggs & juveniles
export function guideMaterials() {
  cache ||= build(); const out = { gather: [], monster: [], life: [] };
  for (const [id, list] of Object.entries(cache)) {
    if (ITEMS[id]?.kind !== 'material') continue;
    const cat = list.some((s) => s.t === 'egg' || s.t === 'juv') ? 'life' : list.some((s) => s.t === 'gather' || s.t === 'field') ? 'gather' : 'monster';
    out[cat].push(id);
  }
  for (const k of Object.keys(out)) out[k].sort((a, b) => (ITEMS[a].rarity - ITEMS[b].rarity) || a.localeCompare(b));
  return out;
}
// the single best tip: the likeliest gathering point, else the likeliest carve, else a part break, nest or the market
export function bestSource(id) {
  const L = materialSources(id); if (!L.length) return null;
  const by = (t) => L.filter((s) => s.t === t).sort((a, b) => (b.pct || 0) - (a.pct || 0))[0];
  return by('gather') || by('field') || by('carve') || by('break') || by('egg') || by('juv') || by('shop');
}
