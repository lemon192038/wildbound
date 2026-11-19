// Monster Workshop (モンスター屋): build artificial monsters from every part material of a monster plus gathered island
// materials (server: craftTame), and pick the construct you take on hunts (equipTame). See src/shared/tame.js.
import { MONSTERS, ITEMS } from '../../shared/gamedata.js';
import { TAMES, TAME_ORDER, tameRecipe } from '../../shared/tame.js';
import { t } from '../../shared/i18n.js';
import { esc, matsList, costLine, btn, empty, monShort } from './common.js';
import { glyph } from './icons.js';

export const tameName = (sp) => t('tm.name', { m: monShort(sp) });
export function createTamerPanel(ctx) {
  let tab = 'build'; let sel = TAME_ORDER[0];
  const st = () => ctx.state();
  const recipe = (sp) => tameRecipe(sp, MONSTERS, ITEMS);
  const ready = (sp, s) => { const r = recipe(sp); return matsList(r.parts, s.box).ok && matsList(r.extra, s.box).ok && s.coins >= r.coins; };
  const traits = (sp) => TAMES[sp].traits.map((k) => `<span class="tw-pill gold" title="${esc(t('tm.traitD.' + k))}">${esc(t('tm.trait.' + k))}</span>`).join('');
  function row(sp, s) {
    const own = s.tames?.[sp]; const eq = s.tameEquip === sp;
    return `<button class="tw-row ${sel === sp ? 'sel' : ''}" data-a="sel" data-id="${sp}"><span class="tw-ico" style="--rc:#${TAMES[sp].glow.toString(16).padStart(6, '0')}">${glyph('paw')}</span>
      <span class="tw-row-m"><b>${esc(tameName(sp))}</b><small>${TAMES[sp].traits.map((k) => esc(t('tm.trait.' + k))).join(' · ')}</small></span>
      <span class="tw-row-r">${eq ? `<i class="tw-pill gold">${t('tm.equipped')}</i>` : own ? `<i class="tw-pill ok">${t('tm.owned')}</i>` : ready(sp, s) ? `<i class="tw-pill ok">${t('tm.canBuild')}</i>` : ''}</span></button>`;
  }
  function detail(s) {
    const sp = sel; const T = TAMES[sp]; if (!T) return empty(t('tm.choose'));
    const own = s.tames?.[sp]; const eq = s.tameEquip === sp; const r = recipe(sp);
    const head = `<header class="tw-dh"><span class="tw-ico xl" style="--rc:#${T.glow.toString(16).padStart(6, '0')}">${glyph('paw')}</span><div><h2>${esc(tameName(sp))}</h2>
      <div class="tw-dh-tags">${traits(sp)}<span class="tw-pill dim">${t('tm.speed', { n: T.speed })}</span>${T.ceiling ? `<span class="tw-pill dim">${t('tm.ceiling', { n: T.ceiling })}</span>` : ''}</div></div></header>
      <p class="tw-flavor">${T.traits.map((k) => esc(t('tm.traitD.' + k))).join(' ')}</p><p class="tw-dim">${esc(t('tm.note'))}</p>`;
    if (own) return `${head}<footer class="tw-qd-f">${eq ? btn(t('tm.unequip'), 'unequip', { cls: 'tw-ghost' }) : btn(t('tm.equip'), 'equip', { cls: 'tw-primary', dis: !!s.quests?.expedition, why: t('tm.busy') })}</footer>`;
    const mp = matsList(r.parts, s.box), me = matsList(r.extra, s.box), c = costLine(r.coins, s.coins);
    const why = !mp.ok ? t('tm.missingParts') : !me.ok ? t('tm.missingExtra') : s.coins < r.coins ? t('tm.noCoins') : s.quests?.expedition ? t('tm.busy') : '';
    return `${head}<section><h4>${t('tm.parts')}</h4>${mp.html}</section><section><h4>${t('tm.extra')}</h4>${me.html}</section>${c.html}
      <footer class="tw-qd-f">${btn(t('tm.build'), 'build', { cls: 'tw-primary', dis: !!why, why })}</footer>`;
  }
  function stable(s) {
    const own = TAME_ORDER.filter((k) => s.tames?.[k]);
    if (!own.length) return empty(t('tm.noneOwned'), t('tm.noneOwnedSub'));
    return `<div class="tw-list tw-scroll">${own.map((k) => row(k, s)).join('')}</div>`;
  }
  return {
    id: 'tamer', get title() { return t('fac.tamer'); }, icon: 'paw',
    get tabs() { return [{ id: 'build', label: t('tm.tabBuild') }, { id: 'stable', label: t('tm.tabStable') }]; },
    get tab() { return tab; }, set tab(v) { tab = v; },
    render() {
      const s = st(); if (tab === 'stable') return `<div class="tw-split">${stable(s)}<div class="tw-detail tw-scroll">${detail(s)}</div></div>`;
      return `<div class="tw-split"><div class="tw-list tw-scroll" data-keep="tl">${TAME_ORDER.map((k) => row(k, s)).join('')}</div><div class="tw-detail tw-scroll" data-keep="td">${detail(s)}</div></div>`;
    },
    on: {
      sel(d) { sel = d.id; },
      async build() {
        const r = recipe(sel);
        const ok = await ctx.confirm({ title: t('tm.buildQ', { m: tameName(sel) }), body: `<p>${esc(t('tm.buildBody'))}</p>${matsList(r.parts, st().box).html}${matsList(r.extra, st().box).html}`, ok: t('tm.build') });
        if (!ok) return;
        const res = await ctx.act('craftTame', { sp: sel }); if (res.ok) ctx.flourish(t('tm.built', { m: tameName(sel) }));
      },
      async equip() { const res = await ctx.act('equipTame', { sp: sel }); if (res.ok) ctx.flourish(t('tm.equippedFl', { m: tameName(sel) })); },
      async unequip() { await ctx.act('equipTame', { sp: null }); },
    },
  };
}
