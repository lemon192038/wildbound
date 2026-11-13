// Harbour market: buy limited stock (restocks on a timer), sell box items back.
import { ITEMS, SHOP } from '../../shared/gamedata.js';
import { esc, fmt, stepper, applyQty, btn, empty, rarityTag, coins, cap } from './common.js';
import { itemIcon, rarityColor } from './icons.js';
import { t, itemName, itemDesc } from '../../shared/i18n.js';

const KIND = new Proxy({}, { get: (_, k) => t('kind.' + String(k)) });
export function createMarketPanel(ctx) {
  let tab = 'buy'; const sel = { buy: 'potion', sell: null }; let qty = 1;
  const st = () => ctx.state();
  const left = (s, id) => s.shop[id]?.left ?? SHOP.stock[id];
  const maxBuy = (s, id) => Math.max(0, Math.min(left(s, id), Math.floor(s.coins / ITEMS[id].buy), 99));
  const sellable = (s) => Object.keys(s.box).filter((k) => ITEMS[k]?.sell > 0 && s.box[k] > 0).sort((a, b) => ITEMS[b].rarity - ITEMS[a].rarity || itemName(a).localeCompare(itemName(b)));

  function buyRow(id, s) {
    const it = ITEMS[id]; const l = left(s, id); const afford = s.coins >= it.buy;
    return `<button class="tw-row ${sel.buy === id ? 'sel' : ''} ${l ? '' : 'locked'}" data-a="sel" data-id="${id}">${itemIcon(id)}
      <span class="tw-row-m"><b style="color:${rarityColor(it.rarity)}">${esc(itemName(id))}</b><small>${KIND[it.kind]} · ${t('m.inBox', { n: fmt(s.box[id] || 0) })}</small></span>
      <span class="tw-row-r">${coins(it.buy, afford ? 'sm' : 'sm no')}<i class="tw-stock ${l ? '' : 'out'} tw-num">${l ? `${l}/${SHOP.stock[id]}` : t('m.soldOut')}</i></span></button>`;
  }
  function buyDetail(s) {
    const id = sel.buy; const it = ITEMS[id]; if (!it) return empty(t('m.choose'));
    const l = left(s, id); const max = maxBuy(s, id); qty = Math.max(1, Math.min(qty, Math.max(1, max)));
    const total = it.buy * qty; const after = s.coins - total; const r = s.shop[id];
    const why = !l ? t('m.soldOutWhy') : s.coins < it.buy ? t('c.needCoins', { n: fmt(it.buy - s.coins) }) : '';
    return `<header class="tw-dh">${itemIcon(id, { size: 'xl' })}<div><h2 style="color:${rarityColor(it.rarity)}">${esc(itemName(id))}</h2><div class="tw-dh-tags">${rarityTag(it.rarity)}<span class="tw-pill dim">${KIND[it.kind]}</span>${it.pouchMax ? `<span class="tw-pill dim">${t('m.carry', { n: it.pouchMax })}</span>` : ''}</div></div></header>
      <p class="tw-flavor">${esc(itemDesc(id))}</p>
      <dl class="tw-kv wide"><dt>${t('m.unit')}</dt><dd>${coins(it.buy)}</dd><dt>${t('m.inStock')}</dt><dd class="tw-num ${l ? '' : 'tw-bad'}">${l} / ${SHOP.stock[id]}</dd>
        <dt>${t('m.restock')}</dt><dd>${l < SHOP.stock[id] && r ? t('m.restockIn', { t: `<b data-countdown="${r.restockAt}">…</b>` }) : `<span class="tw-dim">${t('m.full')}</span>`}</dd><dt>${t('m.youOwn')}</dt><dd class="tw-num">${t('m.ownLine', { a: fmt(s.box[id] || 0), b: fmt(s.pouch[id] || 0) })}</dd></dl>
      <div class="tw-qtyrow"><span>${t('c.qty')}</span>${stepper(qty, Math.max(1, max))}</div>
      <div class="tw-ledger"><div><span>${t('m.total')}</span>${coins(total, s.coins < total ? 'no' : '')}</div><div><span>${t('m.remaining')}</span>${coins(Math.max(0, after), after < 0 ? 'no' : '')}</div></div>
      <footer class="tw-qd-f">${btn(t('m.buyN', { n: qty }), 'buy', { cls: 'tw-primary', dis: !!why || after < 0, why: why || t('m.noCoins') })}</footer>`;
  }
  function sellRow(id, s) {
    const it = ITEMS[id];
    return `<button class="tw-row ${sel.sell === id ? 'sel' : ''}" data-a="sel" data-id="${id}">${itemIcon(id, { count: s.box[id] })}
      <span class="tw-row-m"><b style="color:${rarityColor(it.rarity)}">${esc(itemName(id))}</b><small>${KIND[it.kind]}</small></span><span class="tw-row-r">${coins(it.sell, 'sm')}<i class="tw-stock tw-num">×${fmt(s.box[id])}</i></span></button>`;
  }
  function sellDetail(s) {
    const id = sel.sell; const it = ITEMS[id]; const have = s.box[id] || 0;
    if (!it || !have) return empty(t('m.chooseSell'), t('m.chooseSellSub'));
    qty = Math.max(1, Math.min(qty, have)); const total = it.sell * qty;
    return `<header class="tw-dh">${itemIcon(id, { size: 'xl' })}<div><h2 style="color:${rarityColor(it.rarity)}">${esc(itemName(id))}</h2><div class="tw-dh-tags">${rarityTag(it.rarity)}<span class="tw-pill dim">${KIND[it.kind]}</span></div></div></header>
      <p class="tw-flavor">${esc(itemDesc(id))}</p>
      <dl class="tw-kv wide"><dt>${t('m.pellPays')}</dt><dd>${t('m.each', { c: coins(it.sell) })}</dd><dt>${t('m.inBoxLabel')}</dt><dd class="tw-num">${fmt(have)}</dd></dl>
      ${it.rarity >= 4 ? `<div class="tw-hint warn">◆ ${t('m.rareHint')}</div>` : ''}
      <div class="tw-qtyrow"><span>${t('c.qty')}</span>${stepper(qty, have)}</div>
      <div class="tw-ledger"><div><span>${t('m.receive')}</span>${coins(total, 'ok')}</div><div><span>${t('m.purseAfter')}</span>${coins(s.coins + total)}</div></div>
      <footer class="tw-qd-f">${btn(t('m.sellN', { n: qty }), 'sell', { cls: 'tw-primary' })}</footer>`;
  }
  return {
    id: 'shop', get title() { return t('fac.shop'); }, icon: 'shop',
    get tabs() { return [{ id: 'buy', label: t('m.buy') }, { id: 'sell', label: t('c.sell') }]; },
    get tab() { return tab; }, set tab(v) { tab = v; qty = 1; },
    render() {
      const s = st();
      if (tab === 'buy') return `<div class="tw-split"><div class="tw-list tw-scroll" data-keep="mb">${Object.keys(SHOP.stock).map((k) => buyRow(k, s)).join('')}</div><div class="tw-detail tw-scroll">${buyDetail(s)}</div></div>`;
      const ids = sellable(s); if (!ids.includes(sel.sell)) sel.sell = ids[0] || null;
      return `<div class="tw-split"><div class="tw-list tw-scroll" data-keep="ms">${ids.map((k) => sellRow(k, s)).join('') || empty(t('m.nothing'))}</div><div class="tw-detail tw-scroll">${sellDetail(s)}</div></div>`;
    },
    on: {
      sel(d) { if (sel[tab] !== d.id) qty = 1; sel[tab] = d.id; },
      qty(d) { const s = st(); qty = applyQty(qty, d.d, tab === 'buy' ? Math.max(1, maxBuy(s, sel.buy)) : s.box[sel.sell] || 1); },
      async buy() {
        const s = st(); const it = ITEMS[sel.buy]; const total = it.buy * qty;
        if (total >= 1000 || total > s.coins * 0.4) { if (!(await ctx.confirm({ title: t('m.confirmQ'), body: `<p>${t('m.buyBody', { x: `<b>${qty}× ${esc(itemName(sel.buy))}</b>`, c: coins(total) })}</p><p class="tw-dim">${t('m.remainingCoins', { n: `<b class="tw-num">${fmt(s.coins - total)}</b>` })}</p>`, ok: t('m.buy') }))) return; }
        const r = await ctx.act('buy', { item: sel.buy, qty }); if (r.ok) qty = 1;
      },
      async sell() {
        const it = ITEMS[sel.sell]; const total = it.sell * qty;
        if (it.rarity >= 4 || total >= 1000) { if (!(await ctx.confirm({ title: t('m.sellRareQ'), body: `<p>${t('m.sellBody', { x: `<b>${qty}× ${esc(itemName(sel.sell))}</b>`, c: coins(total) })}</p><p class="tw-dim">${t('m.rareSub')}</p>`, ok: t('c.sell'), danger: true }))) return; }
        const r = await ctx.act('sell', { item: sel.sell, qty }); if (r.ok) qty = 1;
      },
    },
  };
}
