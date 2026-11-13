// Hunters' Guild quest board: browse by type, inspect, accept / abandon / deliver, quest history.
import { QUESTS, MONSTERS } from '../../shared/gamedata.js';
import { t, questName, questDesc, monsterName, partName, serverMsg } from '../../shared/i18n.js';
import { esc, fmt, stars, coins, itemName, monName, monShort, clock, ago, btn, empty, tabsHtml } from './common.js';
import { itemIcon, glyph } from './icons.js';

const TYPE = (k) => t('qtype.' + k);
const TABS = [
  { id: 'slay', key: 'q.tabSlay', types: ['slay', 'hunt'] },
  { id: 'gather', key: 'q.tabGather', types: ['gather', 'deliver'] },
  { id: 'survey', key: 'q.tabSurvey', types: ['survey'] },
  { id: 'elite', key: 'q.tabElite', types: ['elite'] },
  { id: 'history', key: 'q.tabHistory' },
];
export function objectiveText(o, q, box) {
  const m = monShort(q.monster);
  switch (o.k) {
    case 'slay': return t('obj.slay', { m });
    case 'slayOrCapture': return t('obj.slayOrCapture', { m });
    case 'gather': return t('obj.gather', { n: o.qty, item: itemName(o.item) });
    case 'deliver': { const have = box?.[o.item] || 0; return `${t('obj.deliver', { n: o.qty, item: itemName(o.item) })} <b class="${have >= o.qty ? 'tw-good' : 'tw-bad'} tw-num">(${fmt(have)}/${o.qty})</b>`; }
    case 'break': return t('obj.break', { parts: o.parts.map(partName).join(t('obj.and')) });
    case 'noFaint': return t('obj.noFaint');
    case 'within': return t('obj.within', { t: clock(o.s) });
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
      <span class="tw-qrow-l">${stars(q.stars)}<span class="tw-qtype t-${q.type}">${TYPE(q.type)}</span></span>
      <span class="tw-qrow-m"><b>${esc(questName(qid))}</b><small>${av.ok ? (q.monster ? esc(monShort(q.monster)) + (q.ambient ? t('q.roamingSuffix') : '') : t('q.counter')) : `${glyph('lock', 'tw-lock')} ${esc(serverMsg(av.why))}`}</small></span>
      <span class="tw-qrow-r">${active ? `<i class="tw-pill gold">${t('q.accepted')}</i>` : cleared ? `<i class="tw-pill">${t('q.clearedN', { n: cleared })}</i>` : `<i class="tw-pill dim">HR ${q.reqHR}</i>`}</span></button>`;
  }
  function detail(qid, s) {
    const q = QUESTS[qid]; if (!q) return empty(t('q.select'));
    const av = s.quests.available[qid] || { ok: false }; const act = s.quests.active; const ex = s.quests.expedition; const isActive = act?.qid === qid;
    const rewards = (q.rewards || []).map(([it, n, ch]) => `<li>${itemIcon(it, { size: 'sm' })}<span>${esc(itemName(it))} ×${n}</span><em class="${ch >= 100 ? 'sure' : ''}">${ch >= 100 ? t('q.guaranteed') : ch + '%'}</em></li>`).join('');
    const mon = q.monster && MONSTERS[q.monster];
    let actions = '';
    if (ex) actions = btn(t('q.onExp'), 'noop', { dis: true, why: ex.qid === qid ? t('q.underway') : t('q.finishFirst') });
    else if (isActive) {
      actions = q.type === 'deliver'
        ? `<div class="tw-actrow">${btn(t('q.deliverBtn'), 'deliver', { cls: 'tw-primary', dis: !q.objectives.every((o) => (s.box[o.item] || 0) >= o.qty), why: t('q.deliverWhy') })}${btn(t('q.abandon'), 'abandon', { cls: 'tw-ghost tw-danger-ghost' })}</div>`
        : `<div class="tw-hint">${glyph('dock')}<span>${t('q.acceptedHint')}</span></div><div class="tw-actrow">${btn(t('q.abandonQuest'), 'abandon', { cls: 'tw-ghost tw-danger-ghost' })}</div>`;
    } else if (!av.ok) actions = btn(`${glyph('lock')} ${t('q.locked')}`, 'noop', { dis: true, why: serverMsg(av.why) });
    else if (act) actions = btn(t('q.accept'), 'accept', { cls: 'tw-primary', dis: true, why: t('q.alreadyAccepted', { q: questName(act.qid) }) });
    else actions = `<div class="tw-actrow">${btn(t('q.accept'), 'accept', { cls: 'tw-primary' })}</div>`;
    return `<div class="tw-qd">
      <header class="tw-qd-h"><div>${stars(q.stars, 7)}<span class="tw-qtype t-${q.type}">${TYPE(q.type)}${q.tempered ? t('q.temperedSuffix') : ''}</span></div>
        <h2>${esc(questName(qid))}</h2>${mon ? `<p class="tw-qd-mon">${q.ambient ? t('q.roaming') : t('q.target')}: <b>${esc(monsterName(q.monster))}</b></p>` : `<p class="tw-qd-mon">${t('q.turnIn')}</p>`}</header>
      <p class="tw-flavor">${t('c.quote', { s: esc(questDesc(qid)) })}</p>
      <div class="tw-qd-grid">
        <section><h4>${t('q.objectives')}</h4><ul class="tw-obj">${q.objectives.map((o) => `<li><i class="tw-bullet">◆</i><span>${objectiveText(o, q, s.box)}</span></li>`).join('')}</ul></section>
        <section><h4>${t('q.conditions')}</h4><dl class="tw-kv">
          <dt>${t('q.timeLimit')}</dt><dd>${q.timeLimit ? t('q.min', { n: Math.round(q.timeLimit / 60) }) : '—'}</dd>
          <dt>${t('q.faintLimit')}</dt><dd>${q.maxFaints ? q.maxFaints + (q.maxFaints === 1 ? t('q.noFaints') : '') : '—'}</dd>
          <dt>${t('q.hr')}</dt><dd>HR ${q.reqHR}+</dd><dt>${t('q.timesCleared')}</dt><dd>${fmt(s.quests.cleared[qid] || 0)}</dd></dl></section>
      </div>
      <section><h4>${t('q.rewards')}</h4><div class="tw-rw-top">${coins(q.coins)}<span class="tw-xp">+${fmt(q.xp)} HR XP</span>${mon && !q.ambient ? `<span class="tw-dim">${t('q.carves')}</span>` : ''}</div>
        <ul class="tw-rw">${rewards}</ul></section>
      <footer class="tw-qd-f">${actions}</footer></div>`;
  }
  function history(s) {
    const h = [...(s.quests.history || [])].reverse();
    if (!h.length) return empty(t('q.noHistory'), t('q.noHistorySub'));
    return `<div class="tw-scroll tw-hist" data-keep="hist">${h.map((e) => `<div class="tw-hist-row ${e.ok ? 'ok' : 'no'}"><i>${e.ok ? '✔' : '✕'}</i>
      <b>${esc(questName(e.qid))}</b><span>${e.ok ? t('q.clearedWord') : esc(serverMsg(e.why || 'Failed'))}</span><span class="tw-num">${e.s ? clock(e.s) : '—'}</span><small>${ago(e.t, ctx.now())}</small></div>`).join('')}</div>`;
  }
  return {
    id: 'quest', get title() { return t('fac.quest'); }, icon: 'quest',
    get tabs() { const s = st(); const n = (t) => t.types && Object.keys(QUESTS).filter((k) => t.types.includes(QUESTS[k].type) && s.quests.available[k]?.ok && !s.quests.cleared[k]).length; return TABS.map((x) => ({ ...x, label: t(x.key), badge: x.types ? n(x) || '' : '' })); },
    get tab() { return tab; }, set tab(v) { tab = v; if (v !== 'history') { const t = TABS.find((x) => x.id === v); if (!sel || !t.types.includes(QUESTS[sel]?.type)) sel = firstOf(v); } },
    onOpen() { const a = st().quests.active?.qid; if (a) { tab = TABS.find((t) => t.types?.includes(QUESTS[a].type))?.id || 'slay'; sel = a; } else this.tab = tab; },
    render() {
      const s = st(); if (tab === 'history') return history(s);
      const tb = TABS.find((x) => x.id === tab); const ids = Object.keys(QUESTS).filter((k) => tb.types.includes(QUESTS[k].type)).sort((a, b) => QUESTS[a].stars - QUESTS[b].stars);
      return `<div class="tw-split"><div class="tw-list tw-scroll" data-keep="ql">${ids.map((k) => row(k, s)).join('') || empty(t('q.none'))}</div>
        <div class="tw-detail tw-scroll" data-keep="qd">${detail(sel, s)}</div></div>`;
    },
    on: {
      sel(d) { sel = d.id; },
      async accept() { await ctx.act('acceptQuest', { quest: sel }); },
      async abandon() { const q = QUESTS[st().quests.active?.qid]; if (await ctx.confirm({ title: t('q.abandonQ'), body: `<p>${t('q.abandonBody', { q: `<b>${esc(questName(st().quests.active?.qid))}</b>` })}</p>`, ok: t('q.abandon'), danger: true })) await ctx.act('abandonQuest'); },
      async deliver() {
        const q = QUESTS[sel]; const list = q.objectives.filter((o) => o.k === 'deliver').map((o) => `<li>${itemIcon(o.item, { size: 'sm' })} ${esc(itemName(o.item))} ×${o.qty}</li>`).join('');
        if (!(await ctx.confirm({ title: t('q.deliverQ'), body: `<p>${t('q.deliverBody')}</p><ul class="tw-mlist">${list}</ul>`, ok: t('q.deliverOk') }))) return;
        const r = await ctx.act('deliverQuest'); if (r.ok) ctx.rewards(r.result?.rewards, questName(sel));
      },
    },
  };
}
