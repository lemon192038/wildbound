// Alchemy atelier: recipes (locked ones show how to learn them), batch brewing, crafting journal.
import { RECIPES, ITEMS } from '../../shared/gamedata.js';
import { t, unlockText, itemDesc } from '../../shared/i18n.js';
import { esc, fmt, matsList, costLine, stepper, applyQty, btn, empty, rarityTag, coins, ago, itemName } from './common.js';
import { itemIcon, rarityColor } from './icons.js';

export function maxBrew(r, s) {
  let n = 20; for (const [m, q] of Object.entries(r.in)) n = Math.min(n, Math.floor((s.box[m] || 0) / q));
  if (r.coins) n = Math.min(n, Math.floor(s.coins / r.coins)); return Math.max(0, n);
}
export function createAlchemyPanel(ctx) {
  let tab = 'recipes'; let sel = 'potion'; let qty = 1;
  const st = () => ctx.state();
  function row(id, s) {
    const r = RECIPES[id]; const out = ITEMS[r.out[0]]; const known = s.recipes[id]; const max = known ? maxBrew(r, s) : 0;
    return `<button class="tw-row ${sel === id ? 'sel' : ''} ${known ? '' : 'locked'}" data-a="sel" data-id="${id}">${itemIcon(r.out[0])}
      <span class="tw-row-m"><b style="color:${known ? rarityColor(out.rarity) : ''}">${esc(itemName(r.out[0]))}${r.out[1] > 1 ? ` ×${r.out[1]}` : ''}</b>
      <small>${known ? Object.entries(r.in).map(([m, q]) => t('al.ing', { n: q, item: esc(itemName(m)) })).join(' + ') : '🔒 ' + esc(unlockText(r.unlock))}</small></span>
      <span class="tw-row-r">${known ? (max ? `<i class="tw-pill ok">${t('al.canBrew', { n: max })}</i>` : '') : ''}</span></button>`;
  }
  function detail(s) {
    const r = RECIPES[sel]; if (!r) return empty(t('al.choose')); const out = ITEMS[r.out[0]]; const known = s.recipes[sel];
    const head = `<header class="tw-dh">${itemIcon(r.out[0], { size: 'xl' })}<div><h2 style="color:${rarityColor(out.rarity)}">${esc(itemName(r.out[0]))}</h2>
      <div class="tw-dh-tags">${rarityTag(out.rarity)}<span class="tw-pill dim">${t('al.yields', { n: r.out[1] })}</span><span class="tw-pill dim">${t('al.inBox', { n: fmt(s.box[r.out[0]] || 0) })}</span>${s.crafted[sel] ? `<span class="tw-pill gold">${t('al.brewedN', { n: fmt(s.crafted[sel]) })}</span>` : ''}</div></div></header>
      <p class="tw-flavor">${esc(itemDesc(r.out[0]))}</p>`;
    if (!known) return `${head}<div class="tw-locked-box">🔒<div><b>${t('al.notLearned')}</b><p>${esc(t('al.learnHow', { u: unlockText(r.unlock) }))}</p></div></div>
      <section><h4>${t('al.ingredients')}</h4>${matsList(r.in, s.box).html}</section>`;
    const max = maxBrew(r, s); qty = Math.max(1, Math.min(qty, Math.max(1, max)));
    const m = matsList(r.in, s.box, qty); const c = costLine(r.coins * qty, s.coins);
    const why = max === 0 ? (!matsList(r.in, s.box).ok ? t('al.missing') : t('al.noCoins')) : '';
    return `${head}<section><h4>${t('al.ingredients')} <small>${t('al.forN', { n: qty })}</small></h4>${m.html}</section>
      <div class="tw-qtyrow"><span>${t('al.batches')}</span>${stepper(qty, Math.max(1, max))}<span class="tw-dim">→ <b class="tw-good">${fmt(qty * r.out[1])}× ${esc(itemName(r.out[0]))}</b></span></div>${c.html}
      <footer class="tw-qd-f">${btn(t('al.brewN', { n: qty }), 'brew', { cls: 'tw-primary', dis: !!why, why })}</footer>`;
  }
  function journal(s) {
    const log = [...(s.craftLog || [])].reverse(); const tot = Object.entries(s.crafted || {}).sort((a, b) => b[1] - a[1]);
    return `<div class="tw-split"><div class="tw-list tw-scroll"><h5 class="tw-sub">${t('al.totals')}</h5>${tot.length ? tot.map(([k, n]) => `<div class="tw-row static">${itemIcon(RECIPES[k]?.out[0] || k, { size: 'sm' })}<span class="tw-row-m"><b>${esc(itemName(RECIPES[k]?.out[0] || k))}</b></span><span class="tw-row-r tw-num">${t('al.batchesN', { n: fmt(n) })}</span></div>`).join('') : empty(t('al.nothing'))}</div>
      <div class="tw-detail tw-scroll"><h5 class="tw-sub">${t('al.recent')}</h5>${log.length ? log.map((e) => `<div class="tw-hist-row ok"><i>⚗</i><b>${esc(itemName(RECIPES[e.recipe]?.out[0]))} ×${(RECIPES[e.recipe]?.out[1] || 1) * e.qty}</b><span></span><span></span><small>${ago(e.t, ctx.now())}</small></div>`).join('') : empty(t('al.emptyJ'), t('al.emptyJSub'))}</div></div>`;
  }
  return {
    id: 'alchemy', get title() { return t('fac.alchemy'); }, icon: 'alchemy',
    get tabs() { return [{ id: 'recipes', label: t('al.tabRecipes') }, { id: 'journal', label: t('al.tabJournal') }]; },
    get tab() { return tab; }, set tab(v) { tab = v; },
    render() {
      const s = st(); if (tab === 'journal') return journal(s);
      const ids = Object.keys(RECIPES).sort((a, b) => (s.recipes[b] ? 1 : 0) - (s.recipes[a] ? 1 : 0));
      return `<div class="tw-split"><div class="tw-list tw-scroll" data-keep="al">${ids.map((k) => row(k, s)).join('')}</div><div class="tw-detail tw-scroll" data-keep="ad">${detail(s)}</div></div>`;
    },
    on: {
      sel(d) { if (sel !== d.id) qty = 1; sel = d.id; },
      qty(d) { qty = applyQty(qty, d.d, Math.max(1, maxBrew(RECIPES[sel], st()))); },
      async brew() {
        const r = RECIPES[sel]; const s = st(); const out = ITEMS[r.out[0]];
        if (qty >= 5 || r.coins * qty >= 200) {
          const ok = await ctx.confirm({ title: t('al.brewQ', { n: qty }), body: `<p>${t('al.brewBody', { x: `<b>${qty * r.out[1]}× ${esc(itemName(r.out[0]))}</b>`, c: coins(r.coins * qty) })}</p>${matsList(r.in, s.box, qty).html}`, ok: t('al.brew') });
          if (!ok) return;
        }
        const res = await ctx.act('alchemy', { recipe: sel, qty }); if (res.ok) { ctx.flourish(t('al.brewedFl', { x: `${qty * r.out[1]}× ${itemName(r.out[0])}` })); qty = 1; }
      },
    },
  };
}
