// Hunter's journal (Esc / MENU): hunter card, hunt log & ledger, settings, log out.
import { QUESTS, MONSTERS, WEAPONS } from '../../shared/gamedata.js';
import { esc, fmt, duration, clock, ago, empty, btn, equipName, equipRarity } from './common.js';
import { equipIcon, glyph } from './icons.js';
import { statsSheet } from './storagePanel.js';

export function createMenuPanel(ctx) {
  let tab = 'card';
  const st = () => ctx.state(); const S = ctx.settings;
  function card(s) {
    const p = s.profile; const span = p.nextXp ? p.nextXp - p.hrXp : 1; const prog = p.nextXp ? Math.min(1, (p.xp - p.hrXp) / span) : 1;
    const totalClears = Object.values(s.quests.cleared).reduce((a, b) => a + b, 0);
    const w = s.equip.find((e) => e.uid === s.loadout.weapon);
    const hunts = Object.entries(MONSTERS).map(([k, m]) => { const h = s.hunts[k] || {}; const n = (h.slain || 0) + (h.captured || 0);
      return `<div class="tw-hunt ${n ? '' : 'unknown'}"><b>${n ? esc(m.name.split(',')[0]) : '???'}</b><small>${n ? esc(m.name.split(', ')[1] || '') : 'Not yet encountered'}</small><span class="tw-num">Slain ${fmt(h.slain || 0)} · Captured ${fmt(h.captured || 0)}</span></div>`; }).join('');
    return `<div class="tw-card3"><section class="tw-hcard tw-frame">
        <div class="tw-hcard-crest"><span>HR</span><b>${p.hr}</b></div><h2>${esc(s.user.name)}</h2><p class="tw-dim">Hunter of the harbour · since ${new Date(s.user.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
        <div class="tw-xpbar big"><i style="transform:scaleX(${prog})"></i></div><p class="tw-xpnum tw-num">${p.nextXp ? `${fmt(p.xp - p.hrXp)} / ${fmt(span)} XP to HR ${p.hr + 1}` : `${fmt(p.xp)} XP · highest rank`}</p>
        <dl class="tw-kv wide"><dt>Play time</dt><dd>${duration(p.playTime)}</dd><dt>Coins</dt><dd class="tw-num">${fmt(s.coins)}</dd><dt>Quests cleared</dt><dd class="tw-num">${fmt(totalClears)}</dd><dt>Equipment owned</dt><dd class="tw-num">${s.equip.length}</dd></dl>
        ${w ? `<div class="tw-loadline">${equipIcon('weapon', equipRarity(w))}<div><b>${esc(equipName(w))}</b><small>Lv ${w.lvl + 1} · ${esc(WEAPONS[w.def].effect)}</small></div></div>` : ''}</section>
      <section class="tw-scroll"><h4>Hunt log</h4><div class="tw-hunts">${hunts}</div><h4>Current loadout</h4>${statsSheet(s.stats)}</section></div>`;
  }
  function log(s) {
    const h = [...s.quests.history].reverse(); const led = [...(s.ledger || [])].reverse();
    return `<div class="tw-split even"><div class="tw-list tw-scroll"><h5 class="tw-sub">Quest history</h5>${h.length ? h.map((e) => `<div class="tw-hist-row ${e.ok ? 'ok' : 'no'}"><i>${e.ok ? '✔' : '✕'}</i><b>${esc(QUESTS[e.qid]?.name || e.qid)}</b><span>${e.ok ? 'Cleared' : esc(e.why || 'Failed')}</span><span class="tw-num">${e.s ? clock(e.s) : '—'}</span><small>${ago(e.t, ctx.now())}</small></div>`).join('') : empty('No expeditions yet.')}</div>
      <div class="tw-detail tw-scroll"><h5 class="tw-sub">Coin ledger</h5>${led.map((e) => `<div class="tw-led-row"><span>${esc(e.r)}</span><b class="tw-num ${e.d > 0 ? 'tw-good' : 'tw-bad'}">${e.d > 0 ? '+' : '−'}${fmt(Math.abs(e.d))}</b><small class="tw-num">${fmt(e.b)}</small><em>${ago(e.t, ctx.now())}</em></div>`).join('') || empty('No transactions.')}</div></div>`;
  }
  function settings() {
    const low = new URLSearchParams(location.search).get('low') === '1' || ctx.game.params.get('low') === '1';
    return `<div class="tw-settings"><section class="tw-frame tw-pad"><h4>Controls & audio</h4>
      <div class="tw-set"><label for="tw-sens">Look sensitivity</label><input id="tw-sens" type="range" min="0.2" max="3" step="0.05" value="${S.sens}" data-set="sens" style="--p:${((S.sens - 0.2) / 2.8) * 100}%"><output class="tw-num">${S.sens.toFixed(2)}</output></div>
      <div class="tw-set"><label for="tw-vol">Master volume</label><input id="tw-vol" type="range" min="0" max="1" step="0.01" value="${S.vol}" data-set="vol" style="--p:${S.vol * 100}%"><output class="tw-num">${Math.round(S.vol * 100)}%</output></div>
      <div class="tw-set"><label>Graphics</label><div class="tw-seg"><button class="tw-chip ${low ? '' : 'on'}" data-a="gfx" data-id="high">High</button><button class="tw-chip ${low ? 'on' : ''}" data-a="gfx" data-id="low">Low</button></div><span></span></div></section>
      <section class="tw-frame tw-pad"><h4>Account</h4><p>Signed in as <b>${esc(st().user.name)}</b>. Your progress is saved on the guild server after every action.</p>
      <div class="tw-actrow">${btn(`${glyph('logout')} Log out`, 'logout', { cls: 'tw-ghost tw-danger-ghost' })}</div>
      <h4>Keys</h4><div class="tw-keys">${[['WASD', 'Move'], ['Mouse', 'Look'], ['Shift', 'Sprint'], ['E', 'Talk'], ['Esc', 'Menu / close']].map(([k, v]) => `<span><kbd>${k}</kbd>${v}</span>`).join('')}</div></section></div>`;
  }
  return {
    id: 'menu', title: "Hunter's Journal", icon: 'card', npc: 'Menu',
    tabs: [{ id: 'card', label: 'Hunter Card' }, { id: 'log', label: 'Logs & Ledger' }, { id: 'settings', label: 'Settings' }],
    get tab() { return tab; }, set tab(v) { tab = v; },
    render() { const s = st(); return tab === 'card' ? card(s) : tab === 'log' ? log(s) : settings(); },
    input(node) { const k = node.dataset.set; const v = +node.value; S[k] = v; ctx.saveSettings(); const out = node.nextElementSibling; out.textContent = k === 'vol' ? Math.round(v * 100) + '%' : v.toFixed(2); node.style.setProperty('--p', ((v - node.min) / (node.max - node.min)) * 100 + '%'); },
    on: {
      gfx(d) {
        const u = new URL(location.href); const p = u.searchParams;
        if (d.id === 'low') { p.set('low', '1'); p.delete('hq'); } else { p.delete('low'); if (ctx.game.input.touch) p.set('hq', '1'); }
        if (u.href !== location.href) location.href = u.href;
      },
      async logout() { if (await ctx.confirm({ title: 'Log out?', body: '<p>Your progress is saved on the server. You can sign in again at any time.</p>', ok: 'Log out', danger: true })) ctx.logout(); },
    },
  };
}
