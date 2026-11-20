// Mame Chishikii's material notes (user request: the sage tells you where every material is found). Read-only: every
// line comes from src/shared/materialSources.js (the same tables the field and the server use), the monsters' homes from
// the sea-chart habitats (src/shared/habitats.js) and the island regions' compass direction from the island field.
import { ITEMS, MONSTER_INFO } from '../../shared/gamedata.js';
import { GATHER_KINDS } from '../../shared/islandGather.js';
import { materialSources, guideMaterials, bestSource } from '../../shared/materialSources.js';
import { habitatSites } from '../../shared/habitats.js';
import { createIslandField } from '../../world/island/islandField.js';
import { SPECIES } from '../../fauna/species.js';
import { t, partName, destName } from '../../shared/i18n.js';
import { esc, empty, itemName, monShort, fmt, rarityTag } from './common.js';
import { itemIcon, rarityColor } from './icons.js';

let GEO = null; // lazily: region → compass word, monster → home region (one island field build, like the sea chart)
function geo() {
  if (GEO) return GEO;
  const F = createIslandField(1337); const acc = {};
  for (let z = -F.half; z < F.half; z += 48) for (let x = -F.half; x < F.half; x += 48) { const r = F.regionAt(x, z); const a = (acc[r] ||= [0, 0, 0]); a[0] += x; a[1] += z; a[2]++; }
  const dir = {};
  for (const [r, [x, z, n]] of Object.entries(acc)) {
    const cx = x / n, cz = z / n; // north is −z (the sea chart draws +z downwards)
    if (r === 'coast') { dir[r] = 'rim'; continue; }
    if (Math.hypot(cx, cz) < 200) { dir[r] = 'c'; continue; }
    dir[r] = ['e', 'se', 's', 'sw', 'w', 'nw', 'n', 'ne'][Math.round(((Math.atan2(cz, cx) + 2 * Math.PI) % (2 * Math.PI)) / (Math.PI / 4)) % 8];
  }
  const home = {}; for (const h of habitatSites(F)) home[h.monster] ||= h.region;
  GEO = { dir, home }; return GEO;
}
const regionName = (r) => t('region.' + r);
const dirWord = (r) => { const d = geo().dir[r]; return d ? t(d === 'rim' ? 'sg.d.rim' : 'sg.d.' + d) : ''; };
const kindName = (s) => (s.t === 'field' ? t('g.' + s.kind) : t('g2.' + s.kind));
const lives = (mon) => { const S = SPECIES[mon]; const R = S && (S.of ? SPECIES[S.of] : S).regions; return R ? Object.entries(R).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([r]) => r) : []; };
const homeOf = (mon) => geo().home[mon] || lives(mon)[0] || null;
const livesText = (mon) => { const r = homeOf(mon), dest = MONSTER_INFO[mon]?.habitat; const w = [dest && destName(dest), r && regionName(r)].filter(Boolean); return w.length ? t('sg.liveIn', { r: w.join(t('sg.sep')) }) : ''; };
const monList = (mons) => [...new Set(mons.map((m) => monShort(m)))].join(t('sg.sep'));
const regList = (rs) => rs.map(regionName).join(t('sg.sep'));

// what the old man says about one material (the best source)
export function sageTip(id) {
  const s = bestSource(id); const item = itemName(id);
  if (!s) return t('sg.unknown');
  const home = (mon) => { const r = homeOf(mon), dest = MONSTER_INFO[mon]?.habitat; // the three original bosses also have their own field
    return dest && r ? t('sg.home2', { mon: monShort(mon), dest: destName(dest), region: regionName(r) }) : r ? t('sg.home', { mon: monShort(mon), region: regionName(r) }) : ''; };
  switch (s.t) {
    case 'gather': { const d = dirWord(s.region); return t('sg.tip.gather', { item, region: regionName(s.region), kind: kindName(s), dir: d ? t('sg.dir', { d }) : '' }); }
    case 'field': return t('sg.tip.field', { item, dest: destName(s.dest), kind: kindName(s) });
    case 'carve': return t('sg.tip.carve', { item, mon: monShort(s.mon), home: home(s.mon) });
    case 'break': return t('sg.tip.break', { item, mon: monShort(s.mon), part: partName(s.part), home: home(s.mon) });
    case 'egg': return t('sg.tip.egg', { item, mon: monList(s.mons), regions: regList(s.regions) });
    case 'juv': return t('sg.tip.juv', { item, mon: monList(s.mons), regions: regList(s.regions) });
    case 'shop': return t('sg.tip.shop', { item });
    default: return t('sg.unknown');
  }
}
// one row per source: where · what · how likely
function sourceRow(s) {
  let where = '', what = '', note = '';
  if (s.t === 'gather') { where = t('sg.src.gather', { region: regionName(s.region) }); what = kindName(s); note = t('sg.chance', { p: s.pct }); const d = dirWord(s.region); if (d) where += ` (${d})`; }
  else if (s.t === 'field') { where = t('sg.src.field', { dest: destName(s.dest) }); what = kindName(s); note = t('sg.chance', { p: s.pct }); }
  else if (s.t === 'carve') { where = t('sg.src.carve', { mon: monShort(s.mon) }); what = livesText(s.mon); note = t('sg.chance', { p: s.pct }); }
  else if (s.t === 'break') { where = t('sg.src.break', { mon: monShort(s.mon), part: partName(s.part) }); what = livesText(s.mon); }
  else if (s.t === 'egg') { where = t('sg.src.egg', { mon: monList(s.mons) }); what = t('sg.nestIn', { r: regList(s.regions) }); }
  else if (s.t === 'juv') { where = t('sg.src.juv', { mon: monList(s.mons) }); what = t('sg.liveIn', { r: regList(s.regions) }); }
  else if (s.t === 'shop') { where = t('sg.src.shop'); note = t('sg.price', { c: fmt(s.price) }); }
  return `<div class="tw-mat ok sg-src"><span><b>${esc(where)}</b>${what ? `<small>${esc(what)}</small>` : ''}</span><b>${esc(note)}</b></div>`;
}
// several boss-field rows with the same point and chance collapse into one line listing the fields
function sourceRows(list) {
  const out = []; const fields = new Map();
  for (const s of list) {
    if (s.t !== 'field') { out.push(sourceRow(s)); continue; }
    const k = s.kind + '|' + s.pct; let f = fields.get(k);
    if (!f) { fields.set(k, (f = { ...s, dests: [] })); out.push(f); } f.dests.push(s.dest);
  }
  return out.map((x) => (typeof x === 'string' ? x : `<div class="tw-mat ok sg-src"><span><b>${esc(x.dests.map(destName).join(t('sg.sep')))}</b><small>${esc(kindName(x))}</small></span><b>${esc(t('sg.chance', { p: x.pct }))}</b></div>`)).join('');
}

export function createSagePanel(ctx) {
  let tab = 'gather'; const sel = { gather: null, monster: null, life: null };
  const lists = () => guideMaterials();
  function row(id, s) {
    const it = ITEMS[id]; const n = s?.box?.[id] || 0;
    return `<button class="tw-row ${sel[tab] === id ? 'sel' : ''}" data-a="sel" data-id="${id}">${itemIcon(id)}<span class="tw-row-m"><b style="color:${rarityColor(it.rarity)}">${esc(itemName(id))}</b><small>${esc(shortWhere(id))}</small></span>
      <span class="tw-row-r">${n ? `<i class="tw-pill ok">${esc(t('sg.have', { n }))}</i>` : ''}</span></button>`;
  }
  function shortWhere(id) {
    const s = bestSource(id); if (!s) return '';
    if (s.t === 'gather') return `${regionName(s.region)} · ${kindName(s)}`;
    if (s.t === 'field') return `${destName(s.dest)} · ${kindName(s)}`;
    if (s.t === 'carve' || s.t === 'break') return monShort(s.mon) + (s.t === 'break' ? ` · ${partName(s.part)}` : '');
    if (s.t === 'egg' || s.t === 'juv') return monList(s.mons);
    return t('sg.src.shop');
  }
  function detail(s) {
    const id = sel[tab]; if (!id) return empty(t('sg.choose'));
    const it = ITEMS[id]; const list = materialSources(id); const best = bestSource(id);
    const uses = best?.t === 'gather' && GATHER_KINDS[best.kind]?.uses;
    return `<header class="tw-dh">${itemIcon(id, { size: 'xl' })}<div><h2 style="color:${rarityColor(it.rarity)}">${esc(itemName(id))}</h2><div class="tw-dh-tags">${rarityTag(it.rarity)}${s?.box?.[id] ? `<span class="tw-pill ok">${esc(t('sg.have', { n: s.box[id] }))}</span>` : ''}${uses ? `<span class="tw-pill dim">${esc(t('sg.uses', { n: uses }))}</span>` : ''}</div></div></header>
      <p class="tw-flavor sg-tip">「${esc(sageTip(id))}」</p>
      <section><h4>${esc(t('sg.where'))}</h4><div class="tw-mats">${sourceRows(list)}</div></section>`;
  }
  return {
    id: 'sage', get title() { return t('sg.title'); }, icon: 'scroll',
    get tabs() { return [{ id: 'gather', label: t('sg.tabGather') }, { id: 'monster', label: t('sg.tabMonster') }, { id: 'life', label: t('sg.tabLife') }]; },
    get tab() { return tab; }, set tab(v) { tab = v; },
    render() {
      const s = ctx.state(); const ids = lists()[tab] || []; if (!sel[tab] && ids.length) sel[tab] = ids[0];
      return `<div class="tw-split"><div class="tw-list tw-scroll" data-keep="sgl-${tab}">${ids.map((k) => row(k, s)).join('')}</div><div class="tw-detail tw-scroll" data-keep="sgd">${detail(s)}</div></div>`;
    },
    on: { sel(d) { sel[tab] = d.id; } },
  };
}
