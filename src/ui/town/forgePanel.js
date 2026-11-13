// Master Smith's forge: forge weapons & armour, upgrade owned gear, sell equipment.
import { WEAPONS, ARMOR, ARMOR_SLOTS, SKILLS, weaponStats, armorStats, nextWeaponCost, nextArmorCost, loadoutStats } from '../../shared/gamedata.js';
import { esc, fmt, matsList, costLine, deltaRow, elementTag, skillList, btn, empty, rarityTag, equipName, equipRarity, equipKind, cap, coins } from './common.js';
import { equipIcon, rarityColor } from './icons.js';
import { weaponEffect as weaponEffectOf } from '../../shared/i18n.js';
import { t, weaponName, armorName, armorSetName, skillName, slotLabel, elementName, equipDefName } from '../../shared/i18n.js';

const RES = ['fire', 'water', 'thunder', 'ice', 'dragon'];
const pct = (v) => fmt(v) + '%';

// Full-loadout comparison: what changes if `entry` (an equip-like {kind, def, lvl}) were worn.
export function compareHtml(s, entry, title = t('f.ifEquipped')) {
  const slot = entry.kind === 'weapon' ? 'weapon' : ARMOR[entry.def].slot;
  const cur = s.stats; const fake = { ...entry, uid: '__cmp' };
  const next = loadoutStats([...s.equip.filter((e) => e.uid !== entry.uid), fake], { ...s.loadout, [slot]: '__cmp' });
  if (s.loadout[slot] === entry.uid) return `<section class="tw-cmp"><h4>${title}</h4><p class="tw-dim">${t('f.currentlyEquipped')}</p></section>`;
  const rows = [];
  if (slot === 'weapon') {
    rows.push(deltaRow(t('st.attack'), cur.attack, next.attack), deltaRow(t('st.affinity'), cur.affinity, next.affinity, { suffix: '%' }), deltaRow(t('st.sharp'), cur.sharp, next.sharp, { dp: 2, fmtv: (v) => '×' + v.toFixed(2) }));
    const ce = cur.element, ne = next.element;
    rows.push(`<div class="tw-delta ${ce?.type === ne?.type && ce?.value === ne?.value ? 'eq' : 'chg'}"><span>${t('st.element')}</span><b>${elementTag(ce)}</b><i>→</i><b>${elementTag(ne)}</b><em></em></div>`);
  } else {
    rows.push(deltaRow(t('st.defense'), cur.defense, next.defense));
    for (const r of RES) if (cur.res[r] !== next.res[r]) rows.push(deltaRow(t('st.res', { e: elementName(r) }), cur.res[r], next.res[r]));
  }
  const sk = new Set([...Object.keys(cur.skills), ...Object.keys(next.skills)]);
  for (const k of sk) if ((cur.skills[k] || 0) !== (next.skills[k] || 0)) rows.push(deltaRow(skillName(k), cur.skills[k] || 0, next.skills[k] || 0, { fmtv: (v) => 'Lv ' + v }));
  const worn = s.equip.find((e) => e.uid === s.loadout[slot]);
  return `<section class="tw-cmp"><h4>${title} <small>${t('f.vs', { x: worn ? esc(equipName(worn)) : t('f.emptySlot', { s: slotLabel(slot) }) })}</small></h4>${rows.join('')}</section>`;
}
export function statsBlock(entry) {
  if (entry.kind === 'weapon') {
    const w = weaponStats(entry.def, entry.lvl);
    return `<dl class="tw-stats"><dt>${t('st.attack')}</dt><dd class="tw-num">${fmt(w.attack)}</dd><dt>${t('st.affinity')}</dt><dd class="tw-num ${w.affinity < 0 ? 'tw-bad' : w.affinity > 0 ? 'tw-good' : ''}">${pct(w.affinity)}</dd>
      <dt>${t('st.element')}</dt><dd>${elementTag(w.element)}</dd><dt>${t('st.sharp')}</dt><dd class="tw-num">×${w.sharp.toFixed(2)}</dd><dt>${t('st.level')}</dt><dd class="tw-num">${entry.lvl + 1} / ${w.maxLv + 1}</dd></dl><p class="tw-effect">${esc(weaponEffectOf(entry.def))}</p>`;
  }
  const a = armorStats(entry.def, entry.lvl);
  return `<dl class="tw-stats"><dt>${t('st.defense')}</dt><dd class="tw-num">${fmt(a.def)}</dd><dt>${t('st.level')}</dt><dd class="tw-num">${entry.lvl + 1} / ${a.maxLv + 1}</dd></dl>
    <div class="tw-res">${RES.map((r) => `<span class="${a.res[r] > 0 ? 'tw-good' : a.res[r] < 0 ? 'tw-bad' : ''}"><i class="tw-el-dot e-${r}"></i>${elementName(r)} <b class="tw-num">${a.res[r] > 0 ? '+' : ''}${a.res[r]}</b></span>`).join('')}</div>
    <div class="tw-skills">${skillList(a.skills)}</div>`;
}

export function createForgePanel(ctx) {
  let tab = 'weapon'; const sel = { weapon: null, armor: null, upgrade: null, sell: null };
  const st = () => ctx.state();
  const owned = (s, def) => s.equip.filter((e) => e.def === def).length;
  const isWorn = (s, uid) => Object.values(s.loadout).includes(uid);

  function head(name, rarity, kind, extra = '') {
    return `<header class="tw-dh">${equipIcon(kind, rarity, { size: 'xl' })}<div><h2 style="color:${rarityColor(rarity)}">${esc(name)}</h2><div class="tw-dh-tags">${rarityTag(rarity)}${extra}</div></div></header>`;
  }
  function craftDetail(s, kind, def) {
    const d = kind === 'weapon' ? WEAPONS[def] : ARMOR[def]; if (!d) return empty(t('f.chooseDesign'));
    const entry = { kind, def, lvl: 0 }; const m = matsList(d.craft.mats, s.box); const c = costLine(d.craft.coins, s.coins);
    const n = owned(s, def); const why = !m.ok ? t('f.missingMats') : !c.ok ? t('c.needCoins', { n: fmt(d.craft.coins - s.coins) }) : '';
    return `${head(equipDefName(kind, def), d.rarity, kind === 'weapon' ? 'weapon' : d.slot, `<span class="tw-pill dim">${kind === 'weapon' ? t('f.greatsword') : slotLabel(d.slot)}</span>${n ? `<span class="tw-pill gold">${t('f.ownedN', { n })}</span>` : ''}`)}
      <div class="tw-cols2"><section><h4>${t('f.forgedStats')}</h4>${statsBlock(entry)}</section>${compareHtml(s, entry)}</div>
      <section><h4>${t('f.reqMats')}</h4>${m.html}</section>${c.html}
      <footer class="tw-qd-f">${btn(kind === 'weapon' ? t('f.forgeWeapon') : t('f.forgeArmor'), 'forge', { cls: 'tw-primary', dis: !!why, why })}</footer>`;
  }
  function list(s) {
    if (tab === 'weapon') {
      return Object.entries(WEAPONS).filter(([, d]) => d.craft).map(([id, d]) => { const m = matsList(d.craft.mats, s.box); const can = m.ok && s.coins >= d.craft.coins; const n = owned(s, id);
        return `<button class="tw-row ${sel.weapon === id ? 'sel' : ''}" data-a="sel" data-id="${id}">${equipIcon('weapon', d.rarity, { element: d.levels[0].element?.type })}
        <span class="tw-row-m"><b style="color:${rarityColor(d.rarity)}">${esc(weaponName(id))}</b><small>${t('st.attack')} ${fmt(d.levels[0].attack)} · ${d.levels[0].element ? elementName(d.levels[0].element.type) : t('st.raw')}</small></span>
        <span class="tw-row-r">${n ? `<i class="tw-pill gold">${t('f.owned')}</i>` : ''}${can ? `<i class="tw-pill ok">${t('f.canForge')}</i>` : ''}</span></button>`; }).join('');
    }
    if (tab === 'armor') {
      const sets = {}; for (const [id, a] of Object.entries(ARMOR)) if (a.craft) (sets[a.set] ||= []).push([id, a]);
      return Object.values(sets).map((pieces) => `<div class="tw-group"><h5 style="color:${rarityColor(pieces[0][1].rarity)}">${esc(t('f.setName', { s: armorSetName(pieces[0][1].set) }))}</h5>${pieces.map(([id, a]) => {
        const can = matsList(a.craft.mats, s.box).ok && s.coins >= a.craft.coins; const n = owned(s, id);
        return `<button class="tw-row ${sel.armor === id ? 'sel' : ''}" data-a="sel" data-id="${id}">${equipIcon(a.slot, a.rarity)}<span class="tw-row-m"><b style="color:${rarityColor(a.rarity)}">${esc(armorName(id))}</b><small>${t('st.defense')} ${a.def} · ${Object.keys(a.skills).map((k) => skillName(k)).join(t('c.listSep')) || t('c.noSkillsLower')}</small></span>
          <span class="tw-row-r">${n ? `<i class="tw-pill gold">${t('f.owned')}</i>` : ''}${can ? `<i class="tw-pill ok">${t('f.canForge')}</i>` : ''}</span></button>`; }).join('')}</div>`).join('');
    }
    const items = [...s.equip].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'weapon' ? -1 : 1) || ARMOR_SLOTS.indexOf(ARMOR[a.def]?.slot) - ARMOR_SLOTS.indexOf(ARMOR[b.def]?.slot));
    return items.map((e) => {
      const max = e.kind === 'weapon' ? weaponStats(e.def, 0).maxLv : ARMOR[e.def].maxLv; const worn = isWorn(s, e.uid);
      const right = tab === 'sell' ? `<span class="tw-row-r">${worn ? `<i class="tw-pill dim">${t('f.equipped')}</i>` : coins(e.value, 'sm')}</span>` : `<span class="tw-row-r">${e.lvl >= max ? `<i class="tw-pill dim">${t('c.max')}</i>` : `<i class="tw-pill">Lv ${e.lvl + 1} → ${e.lvl + 2}</i>`}${worn ? `<i class="tw-pill gold">${t('f.worn')}</i>` : ''}</span>`;
      return `<button class="tw-row ${sel[tab] === e.uid ? 'sel' : ''} ${tab === 'sell' && worn ? 'locked' : ''}" data-a="sel" data-id="${e.uid}">${equipIcon(equipKind(e), equipRarity(e))}
        <span class="tw-row-m"><b style="color:${rarityColor(equipRarity(e))}">${esc(equipName(e))}</b><small>${slotLabel(equipKind(e))} · Lv ${e.lvl + 1}</small></span>${right}</button>`;
    }).join('') || empty(t('f.noEquip'));
  }
  function upgradeDetail(s, e) {
    if (!e) return empty(t('f.chooseUp'));
    const kind = equipKind(e); const cost = e.kind === 'weapon' ? nextWeaponCost(e.def, e.lvl) : nextArmorCost(e.def, e.lvl);
    const h = head(equipName(e), equipRarity(e), kind, `<span class="tw-pill dim">Lv ${e.lvl + 1}</span>${isWorn(s, e.uid) ? `<span class="tw-pill gold">${t('f.equipped')}</span>` : ''}`);
    if (!cost) return `${h}<section><h4>${t('f.current')}</h4>${statsBlock(e)}</section><div class="tw-hint">★ ${t('f.maxed')}</div>`;
    const a = e.kind === 'weapon' ? weaponStats(e.def, e.lvl) : armorStats(e.def, e.lvl); const b = e.kind === 'weapon' ? weaponStats(e.def, e.lvl + 1) : armorStats(e.def, e.lvl + 1);
    const rows = e.kind === 'weapon'
      ? [deltaRow(t('st.attack'), a.attack, b.attack), deltaRow(t('st.affinity'), a.affinity, b.affinity, { suffix: '%' }), ...(a.element || b.element ? [deltaRow(t('st.element'), a.element?.value || 0, b.element?.value || 0, { fmtv: (v) => (b.element ? elementName(b.element.type) + ' ' : '') + fmt(v) })] : []), deltaRow(t('st.sharp'), a.sharp, b.sharp, { dp: 2, fmtv: (v) => '×' + v.toFixed(2) })]
      : [deltaRow(t('st.defense'), a.def, b.def)];
    const m = matsList(cost.mats, s.box); const c = costLine(cost.coins, s.coins);
    const why = !m.ok ? t('f.missingShort') : !c.ok ? t('c.needCoins', { n: fmt(cost.coins - s.coins) }) : '';
    return `${h}<section class="tw-cmp"><h4>Lv ${e.lvl + 1} → Lv ${e.lvl + 2}</h4>${rows.join('')}</section>
      <section><h4>${t('f.reqMats')}</h4>${m.html}</section>${c.html}<footer class="tw-qd-f">${btn(t('f.upgrade'), 'upgrade', { cls: 'tw-primary', dis: !!why, why })}</footer>`;
  }
  function sellDetail(s, e) {
    if (!e) return empty(t('f.chooseSell'));
    const worn = isWorn(s, e.uid);
    return `${head(equipName(e), equipRarity(e), equipKind(e), `<span class="tw-pill dim">Lv ${e.lvl + 1}</span>`)}<section><h4>${t('f.stats')}</h4>${statsBlock(e)}</section>
      <div class="tw-cost ok"><span>${t('f.borrikPays')}</span>${coins(e.value)}</div>
      <footer class="tw-qd-f">${btn(t('f.sellEquip'), 'sellEq', { cls: 'tw-danger', dis: worn, why: t('f.sellWhy') })}</footer>`;
  }
  return {
    id: 'smith', get title() { return t('fac.smith'); }, icon: 'smith',
    get tabs() { return [{ id: 'weapon', label: t('f.forgeWeapon') }, { id: 'armor', label: t('f.forgeArmor') }, { id: 'upgrade', label: t('f.upgrade') }, { id: 'sell', label: t('f.sellEquip') }]; },
    get tab() { return tab; }, set tab(v) { tab = v; },
    onOpen() {
      const s = st(); sel.weapon ||= Object.keys(WEAPONS).find((k) => WEAPONS[k].craft); sel.armor ||= Object.keys(ARMOR).find((k) => ARMOR[k].craft && ARMOR[k].set === 'iron') || Object.keys(ARMOR)[0];
      sel.upgrade ||= s.loadout.weapon; sel.sell ||= null;
    },
    render() {
      const s = st(); const e = s.equip.find((x) => x.uid === sel[tab]);
      const det = tab === 'weapon' || tab === 'armor' ? craftDetail(s, tab, sel[tab]) : tab === 'upgrade' ? upgradeDetail(s, e) : sellDetail(s, e);
      return `<div class="tw-split"><div class="tw-list tw-scroll" data-keep="fl-${tab}">${list(s)}</div><div class="tw-detail tw-scroll" data-keep="fd">${det}</div></div>`;
    },
    on: {
      sel(d) { sel[tab] = d.id; },
      async forge() {
        const s = st(); const kind = tab; const def = sel[tab]; const d = kind === 'weapon' ? WEAPONS[def] : ARMOR[def];
        const dn = equipDefName(kind, def);
        const ok = await ctx.confirm({ title: t('f.forgeQ', { x: dn }), body: `<p>${t('f.forgeBody', { c: coins(d.craft.coins) })}</p>${matsList(d.craft.mats, s.box).html}<p class="tw-dim">${t('c.coinsAfter', { n: `<b class="tw-num">${fmt(s.coins - d.craft.coins)}</b>` })}</p>`, ok: t('f.forgeOk') });
        if (ok) { const r = await ctx.act(kind === 'weapon' ? 'craftWeapon' : 'craftArmor', { def }); if (r.ok) ctx.flourish(t('f.forgedFl', { x: dn })); }
      },
      async upgrade() {
        const s = st(); const e = s.equip.find((x) => x.uid === sel.upgrade); if (!e) return; const cost = e.kind === 'weapon' ? nextWeaponCost(e.def, e.lvl) : nextArmorCost(e.def, e.lvl);
        if (await ctx.confirm({ title: t('f.upgradeQ', { x: equipName(e) }), body: `<p>${t('f.upgradeBody', { lv: `<b>Lv ${e.lvl + 2}</b>`, c: coins(cost.coins) })}</p>${matsList(cost.mats, s.box).html}`, ok: t('f.upgrade') })) await ctx.act('upgrade', { uid: e.uid });
      },
      async sellEq() {
        const s = st(); const e = s.equip.find((x) => x.uid === sel.sell); if (!e) return;
        if (await ctx.confirm({ title: t('f.sellQ'), body: `<p>${t('f.sellBody', { x: `<b>${esc(equipName(e))}</b>`, lv: e.lvl + 1, c: coins(e.value) })}</p>`, ok: t('c.sell'), danger: true })) { const r = await ctx.act('sellEquip', { uid: e.uid }); if (r.ok) sel.sell = null; }
      },
    },
  };
}
