// Item box: Box ↔ Pouch transfer, loadout & derived stats, equipment sets.
import { ITEMS, ARMOR, ARMOR_SLOTS, SKILLS } from '../../shared/gamedata.js';
import { esc, fmt, stepper, applyQty, btn, empty, rarityTag, equipName, equipRarity, equipKind, elementTag, cap } from './common.js';
import { itemIcon, equipIcon, rarityColor, glyph } from './icons.js';
import { compareHtml, statsBlock } from './forgePanel.js';
import { t, itemName, itemDesc, skillName, skillDesc, slotLabel, elementName, setLabel } from '../../shared/i18n.js';

const KIND = new Proxy({}, { get: (_, k) => t('kind.' + String(k)) });
const FILTERS = ['all', 'consumable', 'material', 'tool'];
const SORTS = ['rarity', 'name', 'count'];
const SLOTS = ['weapon', ...ARMOR_SLOTS];
const RES = ['fire', 'water', 'thunder', 'ice', 'dragon'];

export function statsSheet(st) {
  return `<div class="tw-sheet"><div class="tw-sheet-big"><div><small>${t('st.attack')}</small><b class="tw-num">${fmt(st.attack)}</b></div><div><small>${t('st.defense')}</small><b class="tw-num">${fmt(st.defense)}</b></div></div>
    <dl class="tw-stats"><dt>${t('st.affinity')}</dt><dd class="tw-num ${st.affinity < 0 ? 'tw-bad' : st.affinity > 0 ? 'tw-good' : ''}">${st.affinity}%</dd><dt>${t('st.element')}</dt><dd>${elementTag(st.element)}</dd><dt>${t('st.sharp')}</dt><dd class="tw-num">×${(+st.sharp).toFixed(2)}</dd></dl>
    <div class="tw-res">${RES.map((r) => `<span class="${st.res[r] > 0 ? 'tw-good' : st.res[r] < 0 ? 'tw-bad' : ''}"><i class="tw-el-dot e-${r}"></i>${elementName(r)} <b class="tw-num">${st.res[r] > 0 ? '+' : ''}${st.res[r]}</b></span>`).join('')}</div>
    <h4>${t('box.activeSkills')}</h4><div class="tw-skillbars">${Object.entries(st.skills).filter(([, v]) => v).map(([k, v]) => `<div class="tw-skillbar" title="${esc(skillDesc(k))}"><span>${esc(skillName(k))}</span><i>${Array.from({ length: SKILLS[k].max }, (_, i) => `<u class="${i < v ? 'on' : ''}"></u>`).join('')}</i><b>Lv ${v}</b><small>${esc(skillDesc(k))}</small></div>`).join('') || `<p class="tw-dim">${t('box.noSkills')}</p>`}</div></div>`;
}

export function createStoragePanel(ctx) {
  let tab = 'items'; let filter = 'all'; let sort = 'rarity'; let sel = { bag: 'box', id: 'potion' }; let qty = 1; let slot = 'weapon'; let cand = null;
  const st = () => ctx.state();
  const sortIds = (ids, bag) => ids.sort((a, b) => sort === 'name' ? itemName(a).localeCompare(itemName(b)) : sort === 'count' ? bag[b] - bag[a] : ITEMS[b].rarity - ITEMS[a].rarity || itemName(a).localeCompare(itemName(b)));
  const tile = (bag, id, n) => `<button class="tw-tile ${sel.bag === bag && sel.id === id ? 'sel' : ''}" data-a="pick" data-bag="${bag}" data-id="${id}" title="${esc(itemName(id))}">${itemIcon(id, { count: fmt(n) })}</button>`;
  const maxMove = (s) => {
    const it = ITEMS[sel.id]; if (!it) return 0;
    if (sel.bag === 'box') { if (!it.pouchMax) return 0; const room = it.pouchMax - (s.pouch[sel.id] || 0); const slotOk = s.pouch[sel.id] || Object.keys(s.pouch).length < s.pouchSlots; return slotOk ? Math.max(0, Math.min(room, s.box[sel.id] || 0)) : 0; }
    return s.pouch[sel.id] || 0;
  };
  function items(s) {
    const ids = sortIds(Object.keys(s.box).filter((k) => ITEMS[k] && s.box[k] > 0 && (filter === 'all' || ITEMS[k].kind === filter)), s.box);
    const pids = Object.keys(s.pouch).filter((k) => ITEMS[k] && s.pouch[k] > 0); const used = pids.length;
    const it = ITEMS[sel.id]; const max = maxMove(s); qty = Math.max(1, Math.min(qty, Math.max(1, max)));
    const why = !it ? '' : sel.bag === 'box' ? (!it.pouchMax ? t('box.matsStay') : (s.pouch[sel.id] || 0) >= it.pouchMax ? t('box.carryMax', { n: it.pouchMax }) : !s.pouch[sel.id] && used >= s.pouchSlots ? t('box.pouchFull') : !(s.box[sel.id] > 0) ? t('box.noneLeft') : '') : '';
    const busy = s.quests.expedition ? t('box.busy') : '';
    const det = it ? `<header class="tw-dh">${itemIcon(sel.id, { size: 'xl' })}<div><h2 style="color:${rarityColor(it.rarity)}">${esc(itemName(sel.id))}</h2><div class="tw-dh-tags">${rarityTag(it.rarity)}<span class="tw-pill dim">${KIND[it.kind]}</span></div></div></header>
      <p class="tw-flavor">${esc(itemDesc(sel.id))}</p>
      <dl class="tw-kv wide"><dt>${t('m.inBoxLabel')}</dt><dd class="tw-num">${fmt(s.box[sel.id] || 0)}</dd><dt>${t('box.inPouch')}</dt><dd class="tw-num">${fmt(s.pouch[sel.id] || 0)}${it.pouchMax ? ` / ${it.pouchMax}` : ''}</dd>${it.sell ? `<dt>${t('box.sellValue')}</dt><dd class="tw-num">${t('m.each', { c: fmt(it.sell) })}</dd>` : ''}</dl>
      ${max ? `<div class="tw-qtyrow"><span>${t('box.move')}</span>${stepper(qty, max)}</div>` : ''}
      <footer class="tw-qd-f">${sel.bag === 'box' ? btn(`${t('box.pack')} ${glyph('arrowR')}`, 'move', { cls: 'tw-primary', dis: !!(why || busy) || !max, why: busy || why }) : btn(`${glyph('arrowL')} ${t('box.store')}`, 'move', { cls: 'tw-primary', dis: !!busy || !max, why: busy })}</footer>`
      : empty(t('box.select'));
    return `<div class="tw-box3">
      <section class="tw-bag"><div class="tw-bag-h"><h4>${t('fac.storage')} <small>${t('box.kinds', { n: ids.length })}</small></h4>
        <div class="tw-chips">${FILTERS.map((k) => `<button class="tw-chip ${filter === k ? 'on' : ''}" data-a="filter" data-id="${k}">${t('box.f.' + k)}</button>`).join('')}</div>
        <div class="tw-sort"><span>${t('box.sort')}</span>${SORTS.map((k) => `<button class="tw-chip sm ${sort === k ? 'on' : ''}" data-a="sort" data-id="${k}">${t('box.s.' + k)}</button>`).join('')}</div></div>
        <div class="tw-grid tw-scroll" data-keep="box">${ids.map((k) => tile('box', k, s.box[k])).join('') || empty(t('box.nothing'))}</div></section>
      <section class="tw-mid tw-scroll">${det}</section>
      <section class="tw-bag pouch"><div class="tw-bag-h"><h4>${t('box.pouch')} <small class="${used >= s.pouchSlots ? 'tw-bad' : ''}">${t('box.slots', { a: used, b: s.pouchSlots })}</small></h4><p class="tw-dim">${t('box.pouchSub')}</p></div>
        <div class="tw-grid tw-scroll" data-keep="pouch">${pids.map((k) => tile('pouch', k, s.pouch[k])).join('')}${Array.from({ length: Math.max(0, s.pouchSlots - used) }, () => '<span class="tw-tile empty"></span>').join('')}</div></section></div>`;
  }
  function equipment(s) {
    const worn = (sl) => s.equip.find((e) => e.uid === s.loadout[sl]);
    const fits = s.equip.filter((e) => (slot === 'weapon' ? e.kind === 'weapon' : e.kind === 'armor' && ARMOR[e.def]?.slot === slot));
    if (!fits.find((e) => e.uid === cand)) cand = s.loadout[slot] || fits[0]?.uid || null;
    const c = s.equip.find((e) => e.uid === cand); const busy = s.quests.expedition ? t('box.busyGear') : '';
    return `<div class="tw-eq3">
      <section class="tw-slots">${SLOTS.map((sl) => { const e = worn(sl); return `<button class="tw-slot ${slot === sl ? 'sel' : ''}" data-a="slot" data-id="${sl}">${e ? equipIcon(equipKind(e), equipRarity(e)) : `<span class="tw-ico empty">${glyph(sl)}</span>`}
        <span><small>${slotLabel(sl)}</small><b style="color:${e ? rarityColor(equipRarity(e)) : ''}">${e ? esc(equipName(e)) : t('box.empty')}</b>${e ? `<em>Lv ${e.lvl + 1}</em>` : ''}</span></button>`; }).join('')}</section>
      <section class="tw-cands"><h4>${t('box.ownedFor', { s: slotLabel(slot) })} <small>${fits.length}</small></h4><div class="tw-scroll tw-cand-list" data-keep="cand">${fits.map((e) => `<button class="tw-row ${cand === e.uid ? 'sel' : ''}" data-a="cand" data-id="${e.uid}">${equipIcon(equipKind(e), equipRarity(e))}
          <span class="tw-row-m"><b style="color:${rarityColor(equipRarity(e))}">${esc(equipName(e))}</b><small>Lv ${e.lvl + 1}</small></span><span class="tw-row-r">${s.loadout[slot] === e.uid ? `<i class="tw-pill gold">${t('f.equipped')}</i>` : ''}</span></button>`).join('') || empty(t('box.noneForSlot'), t('box.forgeSome'))}</div>
        ${c ? `<div class="tw-cand-det">${statsBlock(c)}${compareHtml(s, c)}<div class="tw-actrow">${s.loadout[slot] === c.uid ? (slot !== 'weapon' ? btn(t('box.unequip'), 'unequip', { cls: 'tw-ghost', dis: !!busy, why: busy }) : '') : btn(t('box.equip'), 'equip', { cls: 'tw-primary', dis: !!busy, why: busy })}</div></div>` : ''}</section>
      <section class="tw-scroll" data-keep="sheet"><h4>${t('box.hunterStats')}</h4>${statsSheet(s.stats)}</section></div>`;
  }
  function sets(s) {
    return `<div class="tw-sets">${[0, 1, 2, 3].map((i) => { const set = s.sets[i]; const lo = set?.loadout || {}; const wpn = s.equip.find((e) => e.uid === lo.weapon);
      const pieces = ARMOR_SLOTS.map((sl) => s.equip.find((e) => e.uid === lo[sl])).filter(Boolean);
      return `<div class="tw-setcard tw-frame ${set ? '' : 'empty'}"><div class="tw-setcard-h"><span class="tw-set-n">${i + 1}</span><input class="tw-input sm" maxlength="20" data-setname="${i}" value="${esc(set ? setLabel(set.name) : '')}" placeholder="${t('box.setN', { n: i + 1 })}" aria-label="${t('box.setName')}"></div>
        ${set ? `<div class="tw-set-icons">${wpn ? equipIcon('weapon', equipRarity(wpn), { size: 'sm' }) : ''}${pieces.map((e) => equipIcon(equipKind(e), equipRarity(e), { size: 'sm' })).join('')}</div><p class="tw-dim">${wpn ? esc(equipName(wpn)) : t('box.noWeapon')} · ${t('box.armourN', { n: pieces.length })}</p>` : `<p class="tw-dim">${t('box.emptySet')}</p>`}
        <div class="tw-actrow">${btn(t('box.save'), 'saveSet', { cls: 'tw-ghost', data: `data-i="${i}"` })}${btn(t('box.load'), 'loadSet', { cls: 'tw-primary', dis: !set || !!s.quests.expedition, data: `data-i="${i}"` })}</div></div>`; }).join('')}</div>
      <div class="tw-hint">${glyph('card')}<span>${t('box.setsHint')}</span></div>`;
  }
  return {
    id: 'storage', get title() { return t('fac.storage'); }, icon: 'storage',
    get tabs() { return [{ id: 'items', label: t('box.tabItems') }, { id: 'equip', label: t('box.tabEquip') }, { id: 'sets', label: t('box.tabSets') }]; },
    get tab() { return tab; }, set tab(v) { tab = v; },
    render() { const s = st(); return tab === 'items' ? items(s) : tab === 'equip' ? equipment(s) : sets(s); },
    on: {
      pick(d) { if (sel.bag !== d.bag || sel.id !== d.id) qty = 1; sel = { bag: d.bag, id: d.id }; },
      filter(d) { filter = d.id; }, sort(d) { sort = d.id; },
      qty(d) { qty = applyQty(qty, d.d, Math.max(1, maxMove(st()))); },
      async move() { const to = sel.bag === 'box' ? 'pouch' : 'box'; const r = await ctx.act('move', { item: sel.id, qty, to }); if (r.ok) { qty = 1; const s = st(); if (!(s[sel.bag][sel.id] > 0)) sel = { bag: to, id: sel.id }; } },
      slot(d) { slot = d.id; cand = null; }, cand(d) { cand = d.id; },
      async equip() { await ctx.act('equip', { slot, uid: cand }); },
      async unequip() { await ctx.act('equip', { slot, uid: null }); },
      async saveSet(d, node) {
        const i = +d.i; const name = node.closest('.tw-setcard')?.querySelector('input')?.value.trim() || t('box.setN', { n: i + 1 });
        if (st().sets[i] && !(await ctx.confirm({ title: t('box.overwriteQ'), body: `<p>${t('box.overwriteBody', { x: `<b>${esc(setLabel(st().sets[i].name))}</b>` })}</p>`, ok: t('box.overwrite') }))) return;
        await ctx.act('saveSet', { index: i, name });
      },
      async loadSet(d) { await ctx.act('loadSet', { index: +d.i }); },
    },
  };
}
