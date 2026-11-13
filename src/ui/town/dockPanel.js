// Departure dock: review the accepted quest, the pouch and loadout, then set sail (or resume a hunt).
import { QUESTS, MONSTERS, ITEMS } from '../../shared/gamedata.js';
import { esc, fmt, stars, coins, btn, empty, monName, equipName, equipRarity, elementTag, clock, ago } from './common.js';
import { itemIcon, equipIcon, glyph } from './icons.js';
import { objectiveText } from './questPanel.js';

export function fieldUrl(param, value) {
  const keep = new URLSearchParams(location.search); const q = new URLSearchParams();
  q.set('mode', 'field'); q.set(param, value);
  for (const k of ['low', 'hq', 'touch']) if (keep.has(k)) q.set(k, keep.get(k));
  return `${location.pathname}?${q.toString()}`;
}
export function createDockPanel(ctx) {
  let sailing = false;
  const st = () => ctx.state();
  function questCard(s, qid, label) {
    const q = QUESTS[qid]; const mon = MONSTERS[q.monster];
    return `<div class="tw-voyage tw-frame"><div class="tw-voyage-h"><small>${label}</small>${stars(q.stars)}</div><h2>${esc(q.name)}</h2>
      <p class="tw-qd-mon">${mon ? `${q.ambient ? 'Roaming threat' : 'Target'}: <b>${esc(mon.name)}</b>` : ''}</p>
      <ul class="tw-obj">${q.objectives.map((o) => `<li>${glyph('check')}<span>${objectiveText(o, q, s.box)}</span></li>`).join('')}</ul>
      <dl class="tw-kv"><dt>Time limit</dt><dd>${Math.round(q.timeLimit / 60)} min</dd><dt>Faint limit</dt><dd>${q.maxFaints}</dd><dt>Reward</dt><dd>${coins(q.coins, 'sm')} · ${fmt(q.xp)} XP</dd></dl></div>`;
  }
  function pouch(s, bag) {
    const ids = Object.keys(bag || {}).filter((k) => bag[k] > 0);
    return `<div class="tw-pouchrow">${ids.map((k) => `<span class="tw-tile static" title="${esc(ITEMS[k]?.name)}">${itemIcon(k, { count: bag[k] })}</span>`).join('') || '<p class="tw-bad">Your pouch is empty — you will sail without draughts.</p>'}</div>`;
  }
  function loadout(s) {
    const w = s.equip.find((e) => e.uid === s.loadout.weapon); const st2 = s.stats;
    return `<div class="tw-loadline">${w ? equipIcon('weapon', equipRarity(w)) : ''}<div><b>${w ? esc(equipName(w)) : '—'}</b><small>Attack ${fmt(st2.attack)} · Affinity ${st2.affinity}% · ${st2.element ? elementTag(st2.element) : 'Raw'} · Defense ${fmt(st2.defense)}</small></div></div>`;
  }
  return {
    id: 'dock', title: 'Departure Dock', icon: 'dock', tabs: [{ id: 'voyage', label: 'Voyage' }], tab: 'voyage',
    render() {
      const s = st(); const ex = s.quests.expedition; const act = s.quests.active;
      if (ex) {
        return `<div class="tw-dock">${questCard(s, ex.qid, 'Expedition under way')}
          <div class="tw-dock-side"><section><h4>Supplies taken <small>left port ${ago(ex.at, ctx.now())}</small></h4>${pouch(s, ex.carried)}</section>
          <div class="tw-hint warn">${glyph('sail')}<span>Your crew is still anchored at the hunting grounds. The hunt expires ${clock(Math.max(0, (QUESTS[ex.qid].timeLimit + 600) - (ctx.now() - ex.at) / 1000))} from now.</span></div>
          <footer class="tw-qd-f">${btn(`${glyph('sail')} Resume Hunt`, 'resume', { cls: 'tw-primary tw-big' })}</footer></div></div>`;
      }
      if (!act) return `<div class="tw-dock empty">${empty('No voyage booked.', 'Accept a quest at the Hunters’ Guild first — Guildmistress Ysolde keeps the board by the plaza.')}</div>`;
      const q = QUESTS[act.qid];
      if (q.type === 'deliver') return `<div class="tw-dock">${questCard(s, act.qid, 'Accepted quest')}<div class="tw-dock-side"><div class="tw-hint">${glyph('quest')}<span>Delivery requests are turned in at the guild counter — no voyage needed.</span></div></div></div>`;
      return `<div class="tw-dock">${questCard(s, act.qid, 'Accepted quest')}
        <div class="tw-dock-side"><section><h4>Pouch <small>${Object.keys(s.pouch).length} / ${s.pouchSlots} slots</small></h4>${pouch(s, s.pouch)}
          <button class="tw-link" data-a="toStorage">${glyph('storage')} Repack at the Item Box</button></section>
          <section><h4>Loadout</h4>${loadout(s)}</section>
          <footer class="tw-qd-f">${btn(sailing ? 'Casting off…' : `${glyph('sail')} Set Sail`, 'sail', { cls: 'tw-primary tw-big', dis: sailing })}<p class="tw-dim">Your pouch travels with you. Unused supplies come back after the hunt.</p></footer></div></div>`;
    },
    on: {
      resume() { const ex = st().quests.expedition; if (ex) ctx.navigate(fieldUrl('quest', ex.iid), 'Resuming the hunt…'); },
      toStorage() { ctx.open('storage'); },
      async sail() {
        const s = st(); if (sailing) return;
        if (!Object.keys(s.pouch).length && !(await ctx.confirm({ title: 'Sail without supplies?', body: '<p>Your pouch is empty. You will have no draughts in the field.</p>', ok: 'Sail anyway' }))) return;
        sailing = true; ctx.rerender();
        const r = await ctx.act('depart');
        if (r.ok && r.result?.iid) ctx.navigate(fieldUrl('quest', r.result.iid), `Setting sail — ${QUESTS[r.result.quest]?.name || ''}`);
        else { sailing = false; ctx.rerender(); }
      },
    },
  };
}
