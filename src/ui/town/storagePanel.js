// Item box: Box ↔ Pouch transfer, loadout & derived stats, equipment sets.
import { ITEMS, ARMOR, ARMOR_SLOTS, SKILLS } from '../../shared/gamedata.js';
import { esc, fmt, stepper, applyQty, btn, empty, rarityTag, equipName, equipRarity, equipKind, elementTag, cap } from './common.js';
import { itemIcon, equipIcon, rarityColor, glyph } from './icons.js';
import { compareHtml, statsBlock } from './forgePanel.js';

const KIND = { consumable: 'Consumable', tool: 'Hunting tool', material: 'Material' };
const FILTERS = [['all', 'All'], ['consumable', 'Consumables'], ['material', 'Materials'], ['tool', 'Tools']];
const SORTS = [['rarity', 'Rarity'], ['name', 'Name'], ['count', 'Count']];
const SLOTS = ['weapon', ...ARMOR_SLOTS]; const SLOT_LABEL = { weapon: 'Weapon', head: 'Head', chest: 'Chest', arms: 'Arms', waist: 'Waist', legs: 'Legs' };
const RES = ['fire', 'water', 'thunder', 'ice', 'dragon'];

export function statsSheet(st) {
  return `<div class="tw-sheet"><div class="tw-sheet-big"><div><small>Attack</small><b class="tw-num">${fmt(st.attack)}</b></div><div><small>Defense</small><b class="tw-num">${fmt(st.defense)}</b></div></div>
    <dl class="tw-stats"><dt>Affinity</dt><dd class="tw-num ${st.affinity < 0 ? 'tw-bad' : st.affinity > 0 ? 'tw-good' : ''}">${st.affinity}%</dd><dt>Element</dt><dd>${elementTag(st.element)}</dd><dt>Sharpness</dt><dd class="tw-num">×${(+st.sharp).toFixed(2)}</dd></dl>
    <div class="tw-res">${RES.map((r) => `<span class="${st.res[r] > 0 ? 'tw-good' : st.res[r] < 0 ? 'tw-bad' : ''}"><i class="tw-el-dot e-${r}"></i>${cap(r)} <b class="tw-num">${st.res[r] > 0 ? '+' : ''}${st.res[r]}</b></span>`).join('')}</div>
    <h4>Active skills</h4><div class="tw-skillbars">${Object.entries(st.skills).filter(([, v]) => v).map(([k, v]) => `<div class="tw-skillbar" title="${esc(SKILLS[k].desc)}"><span>${esc(SKILLS[k].name)}</span><i>${Array.from({ length: SKILLS[k].max }, (_, i) => `<u class="${i < v ? 'on' : ''}"></u>`).join('')}</i><b>Lv ${v}</b><small>${esc(SKILLS[k].desc)}</small></div>`).join('') || '<p class="tw-dim">No skills active.</p>'}</div></div>`;
}

export function createStoragePanel(ctx) {
  let tab = 'items'; let filter = 'all'; let sort = 'rarity'; let sel = { bag: 'box', id: 'potion' }; let qty = 1; let slot = 'weapon'; let cand = null;
  const st = () => ctx.state();
  const sortIds = (ids, bag) => ids.sort((a, b) => sort === 'name' ? ITEMS[a].name.localeCompare(ITEMS[b].name) : sort === 'count' ? bag[b] - bag[a] : ITEMS[b].rarity - ITEMS[a].rarity || ITEMS[a].name.localeCompare(ITEMS[b].name));
  const tile = (bag, id, n) => `<button class="tw-tile ${sel.bag === bag && sel.id === id ? 'sel' : ''}" data-a="pick" data-bag="${bag}" data-id="${id}" title="${esc(ITEMS[id]?.name)}">${itemIcon(id, { count: fmt(n) })}</button>`;
  const maxMove = (s) => {
    const it = ITEMS[sel.id]; if (!it) return 0;
    if (sel.bag === 'box') { if (!it.pouchMax) return 0; const room = it.pouchMax - (s.pouch[sel.id] || 0); const slotOk = s.pouch[sel.id] || Object.keys(s.pouch).length < s.pouchSlots; return slotOk ? Math.max(0, Math.min(room, s.box[sel.id] || 0)) : 0; }
    return s.pouch[sel.id] || 0;
  };
  function items(s) {
    const ids = sortIds(Object.keys(s.box).filter((k) => ITEMS[k] && s.box[k] > 0 && (filter === 'all' || ITEMS[k].kind === filter)), s.box);
    const pids = Object.keys(s.pouch).filter((k) => ITEMS[k] && s.pouch[k] > 0); const used = pids.length;
    const it = ITEMS[sel.id]; const max = maxMove(s); qty = Math.max(1, Math.min(qty, Math.max(1, max)));
    const why = !it ? '' : sel.bag === 'box' ? (!it.pouchMax ? 'Materials stay in the box — only consumables and tools can be carried.' : (s.pouch[sel.id] || 0) >= it.pouchMax ? `You can carry at most ${it.pouchMax}.` : !s.pouch[sel.id] && used >= s.pouchSlots ? 'Your pouch is full.' : !(s.box[sel.id] > 0) ? 'None left in the box.' : '') : '';
    const busy = s.quests.expedition ? 'Cannot reorganise during a hunt.' : '';
    const det = it ? `<header class="tw-dh">${itemIcon(sel.id, { size: 'xl' })}<div><h2 style="color:${rarityColor(it.rarity)}">${esc(it.name)}</h2><div class="tw-dh-tags">${rarityTag(it.rarity)}<span class="tw-pill dim">${KIND[it.kind]}</span></div></div></header>
      <p class="tw-flavor">${esc(it.desc)}</p>
      <dl class="tw-kv wide"><dt>In box</dt><dd class="tw-num">${fmt(s.box[sel.id] || 0)}</dd><dt>In pouch</dt><dd class="tw-num">${fmt(s.pouch[sel.id] || 0)}${it.pouchMax ? ` / ${it.pouchMax}` : ''}</dd>${it.sell ? `<dt>Sell value</dt><dd class="tw-num">${fmt(it.sell)} each</dd>` : ''}</dl>
      ${max ? `<div class="tw-qtyrow"><span>Move</span>${stepper(qty, max)}</div>` : ''}
      <footer class="tw-qd-f">${sel.bag === 'box' ? btn(`Pack into pouch ${glyph('arrowR')}`, 'move', { cls: 'tw-primary', dis: !!(why || busy) || !max, why: busy || why }) : btn(`${glyph('arrowL')} Store in box`, 'move', { cls: 'tw-primary', dis: !!busy || !max, why: busy })}</footer>`
      : empty('Select an item.');
    return `<div class="tw-box3">
      <section class="tw-bag"><div class="tw-bag-h"><h4>Item Box <small>${ids.length} kinds</small></h4>
        <div class="tw-chips">${FILTERS.map(([k, l]) => `<button class="tw-chip ${filter === k ? 'on' : ''}" data-a="filter" data-id="${k}">${l}</button>`).join('')}</div>
        <div class="tw-sort"><span>Sort</span>${SORTS.map(([k, l]) => `<button class="tw-chip sm ${sort === k ? 'on' : ''}" data-a="sort" data-id="${k}">${l}</button>`).join('')}</div></div>
        <div class="tw-grid tw-scroll" data-keep="box">${ids.map((k) => tile('box', k, s.box[k])).join('') || empty('Nothing here.')}</div></section>
      <section class="tw-mid tw-scroll">${det}</section>
      <section class="tw-bag pouch"><div class="tw-bag-h"><h4>Pouch <small class="${used >= s.pouchSlots ? 'tw-bad' : ''}">${used} / ${s.pouchSlots} slots</small></h4><p class="tw-dim">Taken on every expedition.</p></div>
        <div class="tw-grid tw-scroll" data-keep="pouch">${pids.map((k) => tile('pouch', k, s.pouch[k])).join('')}${Array.from({ length: Math.max(0, s.pouchSlots - used) }, () => '<span class="tw-tile empty"></span>').join('')}</div></section></div>`;
  }
  function equipment(s) {
    const worn = (sl) => s.equip.find((e) => e.uid === s.loadout[sl]);
    const fits = s.equip.filter((e) => (slot === 'weapon' ? e.kind === 'weapon' : e.kind === 'armor' && ARMOR[e.def]?.slot === slot));
    if (!fits.find((e) => e.uid === cand)) cand = s.loadout[slot] || fits[0]?.uid || null;
    const c = s.equip.find((e) => e.uid === cand); const busy = s.quests.expedition ? 'Cannot change gear during a hunt.' : '';
    return `<div class="tw-eq3">
      <section class="tw-slots">${SLOTS.map((sl) => { const e = worn(sl); return `<button class="tw-slot ${slot === sl ? 'sel' : ''}" data-a="slot" data-id="${sl}">${e ? equipIcon(equipKind(e), equipRarity(e)) : `<span class="tw-ico empty">${glyph(sl)}</span>`}
        <span><small>${SLOT_LABEL[sl]}</small><b style="color:${e ? rarityColor(equipRarity(e)) : ''}">${e ? esc(equipName(e)) : 'Empty'}</b>${e ? `<em>Lv ${e.lvl + 1}</em>` : ''}</span></button>`; }).join('')}</section>
      <section class="tw-cands"><h4>${SLOT_LABEL[slot]} · owned <small>${fits.length}</small></h4><div class="tw-scroll tw-cand-list" data-keep="cand">${fits.map((e) => `<button class="tw-row ${cand === e.uid ? 'sel' : ''}" data-a="cand" data-id="${e.uid}">${equipIcon(equipKind(e), equipRarity(e))}
          <span class="tw-row-m"><b style="color:${rarityColor(equipRarity(e))}">${esc(equipName(e))}</b><small>Lv ${e.lvl + 1}</small></span><span class="tw-row-r">${s.loadout[slot] === e.uid ? '<i class="tw-pill gold">Equipped</i>' : ''}</span></button>`).join('') || empty('Nothing owned for this slot.', 'Forge some at the smithy.')}</div>
        ${c ? `<div class="tw-cand-det">${statsBlock(c)}${compareHtml(s, c)}<div class="tw-actrow">${s.loadout[slot] === c.uid ? (slot !== 'weapon' ? btn('Unequip', 'unequip', { cls: 'tw-ghost', dis: !!busy, why: busy }) : '') : btn('Equip', 'equip', { cls: 'tw-primary', dis: !!busy, why: busy })}</div></div>` : ''}</section>
      <section class="tw-scroll" data-keep="sheet"><h4>Hunter stats</h4>${statsSheet(s.stats)}</section></div>`;
  }
  function sets(s) {
    return `<div class="tw-sets">${[0, 1, 2, 3].map((i) => { const set = s.sets[i]; const lo = set?.loadout || {}; const wpn = s.equip.find((e) => e.uid === lo.weapon);
      const pieces = ARMOR_SLOTS.map((sl) => s.equip.find((e) => e.uid === lo[sl])).filter(Boolean);
      return `<div class="tw-setcard tw-frame ${set ? '' : 'empty'}"><div class="tw-setcard-h"><span class="tw-set-n">${i + 1}</span><input class="tw-input sm" maxlength="20" data-setname="${i}" value="${esc(set?.name || '')}" placeholder="Set ${i + 1}" aria-label="Set name"></div>
        ${set ? `<div class="tw-set-icons">${wpn ? equipIcon('weapon', equipRarity(wpn), { size: 'sm' }) : ''}${pieces.map((e) => equipIcon(equipKind(e), equipRarity(e), { size: 'sm' })).join('')}</div><p class="tw-dim">${wpn ? esc(equipName(wpn)) : 'No weapon'} · ${pieces.length}/5 armour</p>` : '<p class="tw-dim">Empty slot — save your current loadout here.</p>'}
        <div class="tw-actrow">${btn('Save current', 'saveSet', { cls: 'tw-ghost', data: `data-i="${i}"` })}${btn('Load', 'loadSet', { cls: 'tw-primary', dis: !set || !!s.quests.expedition, data: `data-i="${i}"` })}</div></div>`; }).join('')}</div>
      <div class="tw-hint">${glyph('card')}<span>Sets remember which pieces you wear. Sold pieces are removed from saved sets automatically.</span></div>`;
  }
  return {
    id: 'storage', title: 'Item Box', icon: 'storage',
    tabs: [{ id: 'items', label: 'Items & Pouch' }, { id: 'equip', label: 'Equipment' }, { id: 'sets', label: 'Equipment Sets' }],
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
        const i = +d.i; const name = node.closest('.tw-setcard')?.querySelector('input')?.value.trim() || `Set ${i + 1}`;
        if (st().sets[i] && !(await ctx.confirm({ title: 'Overwrite set?', body: `<p>Replace <b>${esc(st().sets[i].name)}</b> with your current loadout?</p>`, ok: 'Overwrite' }))) return;
        await ctx.act('saveSet', { index: i, name });
      },
      async loadSet(d) { await ctx.act('loadSet', { index: +d.i }); },
    },
  };
}
