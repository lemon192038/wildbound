// Hunters' Guild quest board: browse by type, inspect, accept / abandon / deliver, quest history.
import { QUESTS, ITEMS, MONSTERS } from '../../shared/gamedata.js';
import { esc, fmt, stars, coins, itemName, monName, monShort, clock, ago, btn, empty, tabsHtml } from './common.js';
import { itemIcon, glyph } from './icons.js';

const TYPES = { slay: 'Slay', hunt: 'Hunt', gather: 'Gather', deliver: 'Deliver', survey: 'Survey', elite: 'Elite' };
const TABS = [
  { id: 'slay', label: 'Slay & Hunt', types: ['slay', 'hunt'] },
  { id: 'gather', label: 'Gather & Deliver', types: ['gather', 'deliver'] },
  { id: 'survey', label: 'Surveys', types: ['survey'] },
  { id: 'elite', label: 'Elite', types: ['elite'] },
  { id: 'history', label: 'History' },
];
export function objectiveText(o, q, box) {
  const m = monShort(q.monster);
  switch (o.k) {
    case 'slay': return `Slay ${m}`;
    case 'slayOrCapture': return `Slay or capture ${m}`;
    case 'gather': return `Gather ${o.qty}× ${itemName(o.item)}`;
    case 'deliver': { const have = box?.[o.item] || 0; return `Deliver ${o.qty}× ${itemName(o.item)} <b class="${have >= o.qty ? 'tw-good' : 'tw-bad'} tw-num">(${fmt(have)}/${o.qty})</b>`; }
    case 'break': return `Break its ${o.parts.join(' & ')}`;
    case 'noFaint': return 'Do not faint';
    case 'within': return `Finish within ${clock(o.s)}`;
    default: return o.k;
  }
}

export function createQuestPanel(ctx) {
  let sel = null; let tab = 'slay';
  const st = () => ctx.state();
  const firstOf = (t) => Object.keys(QUESTS).find((k) => TABS.find((x) => x.id === t)?.types?.includes(QUESTS[k].type));
  function row(qid, s) {
    const q = QUESTS[qid]; const av = s.quests.available[qid] || { ok: false }; const active = s.quests.active?.qid === qid; const cleared = s.quests.cleared[qid] || 0;
    return `<button class="tw-row tw-qrow ${sel === qid ? 'sel' : ''} ${av.ok ? '' : 'locked'} ${active ? 'active' : ''}" data-a="sel" data-id="${qid}">
      <span class="tw-qrow-l">${stars(q.stars)}<span class="tw-qtype t-${q.type}">${TYPES[q.type]}</span></span>
      <span class="tw-qrow-m"><b>${esc(q.name)}</b><small>${av.ok ? (q.monster ? esc(monShort(q.monster)) + (q.ambient ? ' · roaming' : '') : 'Guild counter') : `${glyph('lock', 'tw-lock')} ${esc(av.why)}`}</small></span>
      <span class="tw-qrow-r">${active ? '<i class="tw-pill gold">Accepted</i>' : cleared ? `<i class="tw-pill">Cleared ×${cleared}</i>` : `<i class="tw-pill dim">HR ${q.reqHR}</i>`}</span></button>`;
  }
  function detail(qid, s) {
    const q = QUESTS[qid]; if (!q) return empty('Select a quest from the board.');
    const av = s.quests.available[qid] || { ok: false }; const act = s.quests.active; const ex = s.quests.expedition; const isActive = act?.qid === qid;
    const rewards = (q.rewards || []).map(([it, n, ch]) => `<li>${itemIcon(it, { size: 'sm' })}<span>${esc(itemName(it))} ×${n}</span><em class="${ch >= 100 ? 'sure' : ''}">${ch >= 100 ? 'Guaranteed' : ch + '%'}</em></li>`).join('');
    const mon = q.monster && MONSTERS[q.monster];
    let actions = '';
    if (ex) actions = btn('On an expedition', 'noop', { dis: true, why: ex.qid === qid ? 'This hunt is under way — resume it from the Departure Dock.' : 'Finish your current hunt first.' });
    else if (isActive) {
      actions = q.type === 'deliver'
        ? `<div class="tw-actrow">${btn('Deliver Goods', 'deliver', { cls: 'tw-primary', dis: !q.objectives.every((o) => (s.box[o.item] || 0) >= o.qty), why: 'You do not have everything yet — materials are taken from your item box.' })}${btn('Abandon', 'abandon', { cls: 'tw-ghost tw-danger-ghost' })}</div>`
        : `<div class="tw-hint">${glyph('dock')}<span>Quest accepted. Speak with <b>Captain Maro</b> at the Departure Dock to set sail.</span></div><div class="tw-actrow">${btn('Abandon Quest', 'abandon', { cls: 'tw-ghost tw-danger-ghost' })}</div>`;
    } else if (!av.ok) actions = btn(`${glyph('lock')} Locked`, 'noop', { dis: true, why: av.why });
    else if (act) actions = btn('Accept Quest', 'accept', { cls: 'tw-primary', dis: true, why: `You already accepted “${QUESTS[act.qid]?.name}”. Abandon it first.` });
    else actions = `<div class="tw-actrow">${btn('Accept Quest', 'accept', { cls: 'tw-primary' })}</div>`;
    return `<div class="tw-qd">
      <header class="tw-qd-h"><div>${stars(q.stars, 7)}<span class="tw-qtype t-${q.type}">${TYPES[q.type]}${q.tempered ? ' · Tempered' : ''}</span></div>
        <h2>${esc(q.name)}</h2>${mon ? `<p class="tw-qd-mon">${q.ambient ? 'Roaming threat' : 'Target'}: <b>${esc(mon.name)}</b></p>` : '<p class="tw-qd-mon">Turn-in at the guild counter</p>'}</header>
      <p class="tw-flavor">“${esc(q.desc)}”</p>
      <div class="tw-qd-grid">
        <section><h4>Objectives</h4><ul class="tw-obj">${q.objectives.map((o) => `<li>${glyph('check')}<span>${objectiveText(o, q, s.box)}</span></li>`).join('')}</ul></section>
        <section><h4>Conditions</h4><dl class="tw-kv">
          <dt>Time limit</dt><dd>${q.timeLimit ? Math.round(q.timeLimit / 60) + ' min' : '—'}</dd>
          <dt>Faint limit</dt><dd>${q.maxFaints ? q.maxFaints + (q.maxFaints === 1 ? ' (no faints)' : '') : '—'}</dd>
          <dt>Hunter Rank</dt><dd>HR ${q.reqHR}+</dd><dt>Times cleared</dt><dd>${fmt(s.quests.cleared[qid] || 0)}</dd></dl></section>
      </div>
      <section><h4>Rewards</h4><div class="tw-rw-top">${coins(q.coins)}<span class="tw-xp">+${fmt(q.xp)} HR XP</span>${mon && !q.ambient ? `<span class="tw-dim">+ carves &amp; bounty</span>` : ''}</div>
        <ul class="tw-rw">${rewards}</ul></section>
      <footer class="tw-qd-f">${actions}</footer></div>`;
  }
  function history(s) {
    const h = [...(s.quests.history || [])].reverse();
    if (!h.length) return empty('No expeditions on record yet.', 'Your hunts will be logged here by the guild scribe.');
    return `<div class="tw-scroll tw-hist" data-keep="hist">${h.map((e) => `<div class="tw-hist-row ${e.ok ? 'ok' : 'no'}"><i>${e.ok ? '✔' : '✕'}</i>
      <b>${esc(QUESTS[e.qid]?.name || e.qid)}</b><span>${e.ok ? 'Cleared' : esc(e.why || 'Failed')}</span><span class="tw-num">${e.s ? clock(e.s) : '—'}</span><small>${ago(e.t, ctx.now())}</small></div>`).join('')}</div>`;
  }
  return {
    id: 'quest', title: "Hunters' Guild", icon: 'quest',
    get tabs() { const s = st(); const n = (t) => t.types && Object.keys(QUESTS).filter((k) => t.types.includes(QUESTS[k].type) && s.quests.available[k]?.ok && !s.quests.cleared[k]).length; return TABS.map((t) => ({ ...t, badge: t.types ? n(t) || '' : '' })); },
    get tab() { return tab; }, set tab(v) { tab = v; if (v !== 'history') { const t = TABS.find((x) => x.id === v); if (!sel || !t.types.includes(QUESTS[sel]?.type)) sel = firstOf(v); } },
    onOpen() { const a = st().quests.active?.qid; if (a) { tab = TABS.find((t) => t.types?.includes(QUESTS[a].type))?.id || 'slay'; sel = a; } else this.tab = tab; },
    render() {
      const s = st(); if (tab === 'history') return history(s);
      const t = TABS.find((x) => x.id === tab); const ids = Object.keys(QUESTS).filter((k) => t.types.includes(QUESTS[k].type)).sort((a, b) => QUESTS[a].stars - QUESTS[b].stars);
      return `<div class="tw-split"><div class="tw-list tw-scroll" data-keep="ql">${ids.map((k) => row(k, s)).join('') || empty('No quests posted.')}</div>
        <div class="tw-detail tw-scroll" data-keep="qd">${detail(sel, s)}</div></div>`;
    },
    on: {
      sel(d) { sel = d.id; },
      async accept() { await ctx.act('acceptQuest', { quest: sel }); },
      async abandon() { const q = QUESTS[st().quests.active?.qid]; if (await ctx.confirm({ title: 'Abandon quest?', body: `<p>Withdraw from <b>${esc(q?.name)}</b>? The contract fee is not charged, but the request returns to the board.</p>`, ok: 'Abandon', danger: true })) await ctx.act('abandonQuest'); },
      async deliver() {
        const q = QUESTS[sel]; const list = q.objectives.filter((o) => o.k === 'deliver').map((o) => `<li>${itemIcon(o.item, { size: 'sm' })} ${esc(ITEMS[o.item].name)} ×${o.qty}</li>`).join('');
        if (!(await ctx.confirm({ title: 'Deliver goods?', body: `<p>Hand over from your item box:</p><ul class="tw-mlist">${list}</ul>`, ok: 'Deliver' }))) return;
        const r = await ctx.act('deliverQuest'); if (r.ok) ctx.rewards(r.result?.rewards, q.name);
      },
    },
  };
}
