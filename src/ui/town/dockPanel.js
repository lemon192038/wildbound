// Departure dock: review the accepted quest, the pouch and loadout, then set sail (or resume a hunt).
import { QUESTS, MONSTERS, ITEMS } from '../../shared/gamedata.js';
import { esc, fmt, stars, coins, btn, empty, equipName, equipRarity, elementTag, clock, ago, cap } from './common.js';
import { itemIcon, equipIcon, glyph, ELEMENT } from './icons.js';
import { objectiveText } from './questPanel.js';
import { t, questName, questDesc, monsterName, elementName, itemName } from '../../shared/i18n.js';

export function fieldUrl(param, value) {
  const keep = new URLSearchParams(location.search); const q = new URLSearchParams();
  q.set('mode', 'field'); q.set(param, value);
  for (const k of ['low', 'hq', 'touch', 'lang']) if (keep.has(k)) q.set(k, keep.get(k));
  return `${location.pathname}?${q.toString()}`;
}
export function createDockPanel(ctx) {
  let sailing = false;
  const st = () => ctx.state();
  function questCard(s, qid, label) {
    const q = QUESTS[qid]; const mon = MONSTERS[q.monster];
    return `<div class="tw-voyage tw-frame"><div class="tw-voyage-h"><small>${label}</small>${stars(q.stars)}</div><h2>${esc(questName(qid))}</h2>
      <p class="tw-qd-mon">${mon ? `${q.ambient ? t('q.roaming') : t('q.target')}: <b>${esc(monsterName(q.monster))}</b>` : ''}</p>
      <p class="tw-flavor">${t('c.quote', { s: esc(questDesc(qid)) })}</p>
      ${mon ? `<div class="tw-weak"><span>${t('d.weak')}</span>${Object.entries(mon.weakness).filter(([, v]) => v > 1).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<b class="tw-el" style="--ec:${ELEMENT[k]}">${elementName(k)}${v >= 1.25 ? ' ★' : ''}</b>`).join('')}<span>${t('d.resists')}</span>${Object.entries(mon.weakness).filter(([, v]) => v < 1).map(([k]) => `<i class="tw-el" style="--ec:${ELEMENT[k]}">${elementName(k)}</i>`).join('')}</div>` : ''}
      <ul class="tw-obj">${q.objectives.map((o) => `<li><i class="tw-bullet">◆</i><span>${objectiveText(o, q, s.box)}</span></li>`).join('')}</ul>
      <dl class="tw-kv"><dt>${t('q.timeLimit')}</dt><dd>${t('q.min', { n: Math.round(q.timeLimit / 60) })}</dd><dt>${t('q.faintLimit')}</dt><dd>${q.maxFaints}</dd><dt>${t('d.reward')}</dt><dd>${coins(q.coins, 'sm')} · ${fmt(q.xp)} XP</dd></dl></div>`;
  }
  function pouch(s, bag) {
    const ids = Object.keys(bag || {}).filter((k) => bag[k] > 0);
    return `<div class="tw-pouchrow">${ids.map((k) => `<span class="tw-tile static" title="${esc(itemName(k))}">${itemIcon(k, { count: bag[k] })}</span>`).join('') || `<p class="tw-bad">${t('d.pouchEmpty')}</p>`}</div>`;
  }
  function loadout(s) {
    const w = s.equip.find((e) => e.uid === s.loadout.weapon); const st2 = s.stats;
    return `<div class="tw-loadline">${w ? equipIcon('weapon', equipRarity(w)) : ''}<div><b>${w ? esc(equipName(w)) : '—'}</b><small>${t('st.attack')} ${fmt(st2.attack)} · ${t('st.affinity')} ${st2.affinity}% · ${st2.element ? elementTag(st2.element) : t('st.raw')} · ${t('st.defense')} ${fmt(st2.defense)}</small></div></div>`;
  }
  return {
    id: 'dock', get title() { return t('fac.dock'); }, icon: 'dock', get tabs() { return [{ id: 'voyage', label: t('d.voyage') }]; }, tab: 'voyage',
    render() {
      const s = st(); const ex = s.quests.expedition; const act = s.quests.active;
      if (ex) {
        return `<div class="tw-dock">${questCard(s, ex.qid, t('d.underway'))}
          <div class="tw-dock-side"><section><h4>${t('d.supplies')} <small>${t('d.leftPort', { t: ago(ex.at, ctx.now()) })}</small></h4>${pouch(s, ex.carried)}</section>
          <div class="tw-hint warn">${glyph('sail')}<span>${t('d.anchored', { t: clock(Math.max(0, (QUESTS[ex.qid].timeLimit + 600) - (ctx.now() - ex.at) / 1000)) })}</span></div>
          <footer class="tw-qd-f">${btn(`${glyph('sail')} ${t('d.resume')}`, 'resume', { cls: 'tw-primary tw-big' })}</footer></div></div>`;
      }
      if (!act) return `<div class="tw-dock empty">${empty(t('d.noVoyage'), t('d.noVoyageSub'))}</div>`;
      const q = QUESTS[act.qid];
      if (q.type === 'deliver') return `<div class="tw-dock">${questCard(s, act.qid, t('d.accepted'))}<div class="tw-dock-side"><div class="tw-hint">${glyph('quest')}<span>${t('d.deliverHint')}</span></div></div></div>`;
      return `<div class="tw-dock">${questCard(s, act.qid, t('d.accepted'))}
        <div class="tw-dock-side"><section><h4>${t('box.pouch')} <small>${t('box.slots', { a: Object.keys(s.pouch).length, b: s.pouchSlots })}</small></h4>${pouch(s, s.pouch)}
          <button class="tw-link" data-a="toStorage">${glyph('storage')} ${t('d.repack')}</button></section>
          <section><h4>${t('d.loadout')}</h4>${loadout(s)}</section>
          <footer class="tw-qd-f">${btn(sailing ? t('d.casting') : `${glyph('sail')} ${t('d.sail')}`, 'sail', { cls: 'tw-primary tw-big', dis: sailing })}<p class="tw-dim">${t('d.sailSub')}</p></footer></div></div>`;
    },
    on: {
      resume() { const ex = st().quests.expedition; if (ex) ctx.navigate(fieldUrl('quest', ex.iid), t('d.resuming')); },
      toStorage() { ctx.open('storage'); },
      async sail() {
        const s = st(); if (sailing) return;
        if (!Object.keys(s.pouch).length && !(await ctx.confirm({ title: t('d.noSupQ'), body: `<p>${t('d.noSupBody')}</p>`, ok: t('d.sailAnyway') }))) return;
        sailing = true; ctx.rerender();
        const r = await ctx.act('depart');
        if (r.ok && r.result?.iid) ctx.navigate(fieldUrl('quest', r.result.iid), t('d.settingSail', { q: r.result.quest ? questName(r.result.quest) : '' }));
        else { sailing = false; ctx.rerender(); }
      },
    },
  };
}
