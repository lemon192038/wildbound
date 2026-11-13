// Alchemy atelier: recipes (locked ones show how to learn them), batch brewing, crafting journal.
import { RECIPES, ITEMS, unlockText } from '../../shared/gamedata.js';
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
      <span class="tw-row-m"><b style="color:${known ? rarityColor(out.rarity) : ''}">${esc(out.name)}${r.out[1] > 1 ? ` ×${r.out[1]}` : ''}</b>
      <small>${known ? Object.entries(r.in).map(([m, q]) => `${q} ${esc(itemName(m))}`).join(' + ') : '🔒 ' + esc(unlockText(r.unlock))}</small></span>
      <span class="tw-row-r">${known ? (max ? `<i class="tw-pill ok">Can brew ×${max}</i>` : '') : ''}</span></button>`;
  }
  function detail(s) {
    const r = RECIPES[sel]; if (!r) return empty('Choose a recipe.'); const out = ITEMS[r.out[0]]; const known = s.recipes[sel];
    const head = `<header class="tw-dh">${itemIcon(r.out[0], { size: 'xl' })}<div><h2 style="color:${rarityColor(out.rarity)}">${esc(out.name)}</h2>
      <div class="tw-dh-tags">${rarityTag(out.rarity)}<span class="tw-pill dim">Yields ×${r.out[1]}</span><span class="tw-pill dim">In box: ${fmt(s.box[r.out[0]] || 0)}</span>${s.crafted[sel] ? `<span class="tw-pill gold">Brewed ${fmt(s.crafted[sel])}</span>` : ''}</div></div></header>
      <p class="tw-flavor">${esc(out.desc)}</p>`;
    if (!known) return `${head}<div class="tw-locked-box">🔒<div><b>Recipe not yet learned</b><p>${esc(unlockText(r.unlock))} to learn this formula.</p></div></div>
      <section><h4>Ingredients</h4>${matsList(r.in, s.box).html}</section>`;
    const max = maxBrew(r, s); qty = Math.max(1, Math.min(qty, Math.max(1, max)));
    const m = matsList(r.in, s.box, qty); const c = costLine(r.coins * qty, s.coins);
    const why = max === 0 ? (!matsList(r.in, s.box).ok ? 'Missing ingredients — gather them in the field or buy them at the market.' : 'Not enough coins for the reagents.') : '';
    return `${head}<section><h4>Ingredients <small>for ×${qty}</small></h4>${m.html}</section>
      <div class="tw-qtyrow"><span>Batches</span>${stepper(qty, Math.max(1, max))}<span class="tw-dim">→ <b class="tw-good">${fmt(qty * r.out[1])}× ${esc(out.name)}</b></span></div>${c.html}
      <footer class="tw-qd-f">${btn(`Brew ×${qty}`, 'brew', { cls: 'tw-primary', dis: !!why, why })}</footer>`;
  }
  function journal(s) {
    const log = [...(s.craftLog || [])].reverse(); const tot = Object.entries(s.crafted || {}).sort((a, b) => b[1] - a[1]);
    return `<div class="tw-split"><div class="tw-list tw-scroll"><h5 class="tw-sub">Totals</h5>${tot.length ? tot.map(([k, n]) => `<div class="tw-row static">${itemIcon(RECIPES[k]?.out[0] || k, { size: 'sm' })}<span class="tw-row-m"><b>${esc(itemName(RECIPES[k]?.out[0] || k))}</b></span><span class="tw-row-r tw-num">${fmt(n)} batches</span></div>`).join('') : empty('Nothing brewed yet.')}</div>
      <div class="tw-detail tw-scroll"><h5 class="tw-sub">Recent brews</h5>${log.length ? log.map((e) => `<div class="tw-hist-row ok"><i>⚗</i><b>${esc(itemName(RECIPES[e.recipe]?.out[0]))} ×${(RECIPES[e.recipe]?.out[1] || 1) * e.qty}</b><span></span><span></span><small>${ago(e.t, ctx.now())}</small></div>`).join('') : empty('Your journal is empty.', 'Nerith records every batch you brew here.')}</div></div>`;
  }
  return {
    id: 'alchemy', title: 'Alchemy Atelier', icon: 'alchemy',
    tabs: [{ id: 'recipes', label: 'Recipes' }, { id: 'journal', label: 'Journal' }],
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
          const ok = await ctx.confirm({ title: `Brew ${qty} batches?`, body: `<p>Produces <b>${qty * r.out[1]}× ${esc(out.name)}</b> for ${coins(r.coins * qty)}.</p>${matsList(r.in, s.box, qty).html}`, ok: 'Brew' });
          if (!ok) return;
        }
        const res = await ctx.act('alchemy', { recipe: sel, qty }); if (res.ok) { ctx.flourish(`Brewed · ${qty * r.out[1]}× ${out.name}`); qty = 1; }
      },
    },
  };
}
