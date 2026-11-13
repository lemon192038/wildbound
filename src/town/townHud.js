// Town HUD & facility UI (owner: main developer). DOM overlay in #ui-root, wired to the authoritative
// account server through game.account (src/account/client.js). See src/ui/town/* for the panels.
//   createTownHud(game) -> { update(dt, rawDt), toast(text, kind) }
// Layers: account gate → HUD (hunter plate, coins, quest tracker, prompt, toasts) → NPC dialogue →
// facility window (tabs, list/detail) → confirm modal. While any overlay is up, movement input is swallowed.
import '../ui/town/town.css';
import { QUESTS, ITEMS } from '../shared/gamedata.js';
import { el, esc, fmt, coins as coinsHtml, stars, tabsHtml, confirmDialog, swallowTouch, clock } from '../ui/town/common.js';
import { glyph, coinSvg, itemIcon } from '../ui/town/icons.js';
import { createAccountScreen } from '../ui/town/accountScreen.js';
import { createQuestPanel, objectiveText } from '../ui/town/questPanel.js';
import { createForgePanel } from '../ui/town/forgePanel.js';
import { createAlchemyPanel } from '../ui/town/alchemyPanel.js';
import { createMarketPanel } from '../ui/town/marketPanel.js';
import { createStoragePanel } from '../ui/town/storagePanel.js';
import { createDockPanel } from '../ui/town/dockPanel.js';
import { createMenuPanel } from '../ui/town/menuPanel.js';
import { dialogueFor } from '../ui/town/dialogue.js';

const lsGet = (k, d) => { try { const v = localStorage.getItem('wb.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem('wb.' + k, JSON.stringify(v)); } catch { /* private mode */ } };
const FAC = { quest: "Hunters' Guild", smith: 'The Forge', alchemy: 'Alchemy Atelier', shop: 'Harbour Market', storage: 'Item Box', dock: 'Departure Dock' };

export function createTownHud(game) {
  const acct = game.account; const events = game.events; const touch = game.input.touch;
  const uiRoot = document.getElementById('ui-root');
  if (!document.querySelector('link[data-wb-fonts]')) {
    const l = el('link'); l.rel = 'stylesheet'; l.dataset.wbFonts = '1';
    l.href = 'https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700;900&family=Inter:wght@400;500;600;700;800&display=swap'; document.head.appendChild(l);
  }
  const root = el('div', 'tw-root' + (touch ? ' tw-touch' : ''), '', uiRoot);
  const S = { sens: lsGet('sens', 1), vol: (() => { try { const v = parseFloat(localStorage.getItem('wildbound.volume')); if (isFinite(v)) return v; } catch { /* */ } return lsGet('vol', 0.8); })() };
  try { game.audio?.setVolume?.(S.vol); } catch { /* */ }
  let clockOffset = 0;
  const now = () => Date.now() + clockOffset;
  const state = () => acct.state;

  // ------------------------------------------------------------------ HUD skeleton
  const hud = el('div', 'tw-hud tw-hidden', `
    <div class="tw-plate"><div class="tw-crest"><small>HR</small><b class="tw-hr">1</b></div>
      <div class="tw-plate-m"><div class="tw-pname"></div><div class="tw-xpbar"><i></i></div><div class="tw-xptext tw-num"></div></div></div>
    <div class="tw-topright"><div class="tw-purse tw-frame">${coinSvg()}<b class="tw-num tw-purse-n">0</b><span class="tw-purse-d"></span></div>
      <button class="tw-menu-btn tw-frame" data-a="menu" aria-label="Menu">${glyph('menu')}<span>Menu</span>${touch ? '' : '<kbd>Esc</kbd>'}</button></div>
    <div class="tw-tracker tw-frame"></div>
    <div class="tw-prompt"></div>
    <div class="tw-toasts" aria-live="polite"></div>`, root);
  const $ = (s) => hud.querySelector(s);
  const purseN = $('.tw-purse-n'), purseD = $('.tw-purse-d'), tracker = $('.tw-tracker'), prompt = $('.tw-prompt'), toasts = $('.tw-toasts');
  $('[data-a=menu]').addEventListener('click', () => (win?.panel.id === 'menu' ? closeWin() : openPanel('menu')));

  function toast(text, kind = '') {
    if (!text) return; const t = el('div', `tw-toast ${kind}`, `${kind === 'err' ? '<i>!</i>' : kind === 'ok' ? '<i>✔</i>' : ''}<span>${esc(text)}</span>`, toasts);
    while (toasts.children.length > 4) toasts.firstChild.remove();
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 400); }, kind === 'err' ? 4200 : 3000);
  }
  function flourish(text) { const f = el('div', 'tw-flourish', `<span>${esc(text)}</span>`, root); setTimeout(() => f.remove(), 2400); }

  // ------------------------------------------------------------------ HUD data binding
  let coinShown = null, coinTarget = 0, lastKey = '';
  function syncHud() {
    const s = state(); if (!s) return;
    coinTarget = s.coins; if (coinShown == null) { coinShown = s.coins; purseN.textContent = fmt(s.coins); }
    const p = s.profile; const span = p.nextXp ? p.nextXp - p.hrXp : 1; const prog = p.nextXp ? Math.min(1, Math.max(0, (p.xp - p.hrXp) / span)) : 1;
    $('.tw-hr').textContent = p.hr; $('.tw-pname').textContent = s.user.name;
    $('.tw-xpbar i').style.transform = `scaleX(${prog})`; $('.tw-xptext').textContent = p.nextXp ? `${fmt(p.xp - p.hrXp)} / ${fmt(span)} XP` : `${fmt(p.xp)} XP · Max rank`;
    const ex = s.quests.expedition; const act = s.quests.active; const key = JSON.stringify([ex?.iid, act?.qid, act && QUESTS[act.qid]?.type === 'deliver' ? s.box : 0]);
    if (key === lastKey) return; lastKey = key;
    if (ex) { const q = QUESTS[ex.qid]; tracker.className = 'tw-tracker tw-frame warn'; tracker.innerHTML = `<small>${glyph('sail')} Expedition under way</small><b>${esc(q.name)}</b><p>Return to the <em>Departure Dock</em> to resume the hunt.</p>`; }
    else if (act) {
      const q = QUESTS[act.qid];
      tracker.className = 'tw-tracker tw-frame'; tracker.innerHTML = `<small>Active quest ${stars(q.stars)}</small><b>${esc(q.name)}</b><ul>${q.objectives.slice(0, 3).map((o) => `<li>${objectiveText(o, q, s.box)}</li>`).join('')}</ul>
        <p>${q.type === 'deliver' ? 'Turn in at the <em>Hunters’ Guild</em>' : 'Set sail from the <em>Departure Dock</em>'}</p>`;
    } else { tracker.className = 'tw-tracker tw-frame idle'; tracker.innerHTML = `<small>No active quest</small><p>Visit the <em>Hunters’ Guild</em> to take a contract.</p>`; }
  }
  // notices (HR up …) are shown as a banner, then acknowledged on the server.
  let acking = false;
  async function showNotices() {
    const s = state(); if (!s?.notices?.length || acking || gate.open) return; acking = true;
    const list = [...s.notices];
    for (const n of list) await banner(/rank/i.test(n) ? 'Rank Up' : 'Notice', n);
    await acct.act('ackNotices'); acking = false;
  }
  function banner(title, sub, items = '') {
    return new Promise((res) => {
      const b = el('div', 'tw-banner', `<div class="tw-banner-band"><h1>${esc(title)}</h1><p>${esc(sub)}</p>${items}<small>${touch ? 'Tap' : 'Click'} to continue</small></div>`, root);
      const done = () => { if (!b.isConnected) return; b.classList.add('out'); setTimeout(() => { b.remove(); res(); }, 350); };
      b.addEventListener('click', done); setTimeout(done, 5200);
    });
  }
  function rewards(r, name) {
    if (!r) return; const items = Object.entries(r.items || {}).map(([k, n]) => `<li>${itemIcon(k, { size: 'sm' })}<span>${esc(ITEMS[k]?.name || k)}</span><b>×${n}</b></li>`).join('');
    banner('Quest Complete', name, `<div class="tw-banner-rw">${coinsHtml(r.coins)}<span class="tw-xp">+${fmt(r.xp)} XP</span></div>${items ? `<ul class="tw-banner-items">${items}</ul>` : ''}`);
  }

  // ------------------------------------------------------------------ facility windows
  let win = null; let dlg = null; let leaving = false;
  const ctx = {
    game, acct, state, now, settings: S, toast, flourish, rewards,
    saveSettings() { lsSet('sens', S.sens); lsSet('vol', S.vol); try { game.audio?.setVolume?.(S.vol); } catch { /* */ } },
    confirm: (o) => confirmDialog(root, o),
    async act(type, payload) {
      win?.node.classList.add('busy');
      const r = await acct.act(type, payload);
      win?.node.classList.remove('busy');
      toast(r.ok ? r.message || 'Done' : r.message || 'Request failed', r.ok ? 'ok' : 'err');
      render(); return r;
    },
    open: (id) => openPanel(id), rerender: () => render(),
    navigate(url, text) { leaving = true; const v = el('div', 'tw-voyage-fade', `<div><span class="tw-spin"></span><p>${esc(text || 'Setting sail…')}</p></div>`, root); requestAnimationFrame(() => v.classList.add('on')); setTimeout(() => { location.href = url; }, 900); },
    logout: async () => { closeWin(); await acct.logout(); },
  };
  const panels = { quest: createQuestPanel(ctx), smith: createForgePanel(ctx), alchemy: createAlchemyPanel(ctx), shop: createMarketPanel(ctx), storage: createStoragePanel(ctx), dock: createDockPanel(ctx), menu: createMenuPanel(ctx) };
  const npcOf = (id) => (game.world?.interactables || []).find((i) => i.id === id)?.npc || '';

  function openPanel(id) {
    if (!state() || leaving) return; closeDialogue(); if (win) closeWin(true);
    const p = panels[id]; p.onOpen?.(); releasePointer();
    const node = el('div', 'tw-win-ov', `<div class="tw-win tw-frame" data-panel="${id}" role="dialog" aria-label="${esc(p.title)}">
      <header class="tw-win-h"><span class="tw-win-ico">${glyph(p.icon)}</span><div class="tw-win-t"><h1>${esc(p.title)}</h1><small>${esc(p.npc || npcOf(id))}</small></div>
        <div class="tw-win-coins"></div><button class="tw-x" data-close aria-label="Close">${glyph('close')}</button></header>
      <nav class="tw-tabs" role="tablist"></nav><div class="tw-win-body"></div><div class="tw-win-foot">${touch ? '' : '<span><kbd>Esc</kbd> Close</span>'}</div></div>`, root);
    swallowTouch(node);
    win = { id, panel: p, node, body: node.querySelector('.tw-win-body'), tabs: node.querySelector('.tw-tabs'), coins: node.querySelector('.tw-win-coins') };
    node.addEventListener('click', async (e) => {
      if (e.target === node || e.target.closest('[data-close]')) return closeWin();
      const t = e.target.closest('[data-tab]'); if (t) { p.tab = t.dataset.tab; render(); win.body.querySelectorAll('.tw-scroll').forEach((x) => { x.scrollTop = 0; }); return; }
      const a = e.target.closest('[data-a]'); if (!a || a.disabled || !win || !win.body.contains(a)) return;
      const fn = p.on?.[a.dataset.a]; if (!fn) return;
      const r = fn.call(p, a.dataset, a); render(); if (r?.then) await r;
    });
    node.addEventListener('input', (e) => { if (e.target.dataset.set) p.input?.(e.target); });
    node.addEventListener('keydown', (e) => { if (e.target.tagName === 'INPUT' && e.code !== 'Escape') e.stopPropagation(); });
    render(); requestAnimationFrame(() => node.classList.add('on'));
  }
  function render() {
    if (!win || !state()) return; const p = win.panel;
    win.coins.innerHTML = coinsHtml(state().coins, 'lg');
    const tabs = p.tabs || []; win.tabs.innerHTML = tabs.length > 1 ? tabsHtml(tabs, p.tab) : ''; win.tabs.classList.toggle('tw-hidden', tabs.length < 2);
    const keep = {}; win.body.querySelectorAll('[data-keep]').forEach((n) => { keep[n.dataset.keep] = n.scrollTop; });
    const inputs = {}; win.body.querySelectorAll('input[data-setname]').forEach((n) => { inputs[n.dataset.setname] = [n.value, n === document.activeElement]; });
    win.body.innerHTML = p.render();
    win.body.querySelectorAll('[data-keep]').forEach((n) => { if (keep[n.dataset.keep] != null) n.scrollTop = keep[n.dataset.keep]; });
    win.body.querySelectorAll('input[data-setname]').forEach((n) => { const v = inputs[n.dataset.setname]; if (v) { n.value = v[0]; if (v[1]) n.focus({ preventScroll: true }); } });
    tickCountdowns();
  }
  function closeWin(silent) {
    if (!win) return; confirmDialog.active?.(false); const n = win.node; win = null; n.classList.remove('on'); n.classList.add('out'); setTimeout(() => n.remove(), 220);
    if (!silent) restorePointer();
  }
  function tickCountdowns() { if (!win) return; for (const n of win.body.querySelectorAll('[data-countdown]')) { const s = (+n.dataset.countdown - now()) / 1000; n.textContent = s > 0 ? clock(s) : 'moments'; } }

  // ------------------------------------------------------------------ NPC dialogue
  const visits = {};
  function openDialogue(it) {
    if (!state()) return; closeDialogue(); releasePointer();
    const d = dialogueFor(it.id, state(), (visits[it.id] = (visits[it.id] || 0) + 1) - 1);
    const node = el('div', 'tw-dlg', `<div class="tw-dlg-box tw-frame"><div class="tw-dlg-plate"><span class="tw-dlg-ico">${glyph(it.id)}</span><div><b>${esc(it.npc)}</b><small>${esc(it.name || FAC[it.id])}</small></div></div>
      <p class="tw-dlg-text"></p><div class="tw-dlg-foot"><span class="tw-dlg-next">${touch ? 'Tap to continue' : '<kbd>E</kbd> Continue'}</span><div class="tw-dlg-choices"></div></div></div>`, root);
    swallowTouch(node);
    dlg = { it, d, node, line: 0, typed: 0, text: node.querySelector('.tw-dlg-text'), done: false };
    node.querySelector('.tw-dlg-choices').innerHTML = d.choices.map((c, i) => `<button class="tw-btn ${c.id === 'open' ? 'tw-primary' : 'tw-ghost'}" data-c="${c.id}">${touch ? '' : `<kbd>${c.id === 'open' ? 'E' : i + 1}</kbd>`}${esc(c.label)}</button>`).join('');
    node.addEventListener('click', (e) => { const c = e.target.closest('[data-c]'); if (c) return choose(c.dataset.c); if (e.target.closest('.tw-dlg-box')) advance(); });
    requestAnimationFrame(() => node.classList.add('on'));
  }
  function advance() {
    if (!dlg) return; const line = dlg.d.lines[dlg.line] || '';
    if (dlg.typed < line.length) { dlg.typed = line.length; dlg.text.textContent = line; return; }
    if (dlg.line < dlg.d.lines.length - 1) { dlg.line++; dlg.typed = 0; return; }
    choose('open');
  }
  function choose(id) { const it = dlg?.it; if (!it) return; if (id === 'open') openPanel(it.id); else { closeDialogue(); restorePointer(); } }
  function closeDialogue() { if (!dlg) return; const n = dlg.node; dlg = null; n.classList.remove('on'); setTimeout(() => n.remove(), 200); }
  function typeTick(dt) {
    if (!dlg) return; const line = dlg.d.lines[dlg.line] || ''; const last = dlg.line >= dlg.d.lines.length - 1;
    if (dlg.typed < line.length) { dlg.typed = Math.min(line.length, dlg.typed + dt * 70); dlg.text.textContent = line.slice(0, Math.floor(dlg.typed)); }
    const ready = dlg.typed >= line.length && last; if (ready !== dlg.done) { dlg.done = ready; dlg.node.classList.toggle('ready', ready); }
  }

  // ------------------------------------------------------------------ account gate
  const gate = createAccountScreen(root, acct, { onReady: (s, isNew) => { hud.classList.remove('tw-hidden'); syncHud(); if (isNew) setTimeout(() => toast(`Welcome to the harbour, ${s.user.name}!`, 'ok'), 400); else toast(`Welcome back, ${s.user.name}.`); showNotices(); } });
  events.on('account:state', ({ state: s }) => { if (s?.serverTime) clockOffset = s.serverTime - Date.now(); syncHud(); if (win) render(); showNotices(); });
  events.on('account:logout', (e) => { closeWin(true); closeDialogue(); hud.classList.add('tw-hidden'); coinShown = null; lastKey = ''; gate.show(e?.expired ? 'Your session expired — please sign in again.' : 'You have logged out.', e?.expired ? 'err' : 'info'); });
  gate.boot();

  // ------------------------------------------------------------------ pointer lock & keys
  const canvas = game.renderer?.domElement; let suppressUnlock = false; let relock = false;
  function releasePointer() { if (document.pointerLockElement) { relock = true; suppressUnlock = true; try { document.exitPointerLock(); } catch { /* */ } } }
  function restorePointer() { if (relock && !touch) { relock = false; try { canvas?.requestPointerLock?.(); } catch { /* */ } } }
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement) return; if (suppressUnlock) { suppressUnlock = false; return; }
    if (!win && !dlg && !gate.open && state()) { relock = true; openPanel('menu'); } // Esc while locked is eaten by the browser
  });
  addEventListener('keydown', (e) => {
    if (gate.open || leaving) return;
    if (e.code === 'Escape') { e.preventDefault(); if (win) closeWin(); else if (dlg) { closeDialogue(); restorePointer(); } else if (state()) openPanel('menu'); return; }
    if (dlg && (e.code === 'Enter' || e.code === 'Space')) { e.preventDefault(); advance(); }
    if (dlg && e.code === 'Digit2') choose('leave');
    if (dlg && e.code === 'Digit1') choose(dlg.d.choices[0].id);
  });
  const blocked = () => gate.open || !!win || !!dlg || leaving || !!document.querySelector('.tw-modal-ov');
  const orig = game.input.poll.bind(game.input);
  game.input.poll = () => {
    const s = orig();
    if (s?.look) { s.look.x *= S.sens; s.look.y *= S.sens; }
    if (s && blocked()) { for (const k in s) if (typeof s[k] === 'boolean') s[k] = false; if (s.move) s.move.x = s.move.y = 0; if (s.look) s.look.x = s.look.y = 0; }
    return s;
  };

  // ------------------------------------------------------------------ per frame
  let near = null, promptKey = '', cdT = 0;
  function nearest() {
    const p = game.player?.position; if (!p) return null; let best = null, bd = Infinity;
    for (const it of game.world?.interactables || []) { const d = Math.hypot(p.x - it.position.x, p.z - it.position.z); if (d < it.radius && d < bd) { bd = d; best = it; } }
    return best;
  }
  return {
    toast, openPanel, get panel() { return win?.id || null; }, get dialogue() { return dlg?.it.id || null; },
    interact(id) { const it = (game.world?.interactables || []).find((x) => x.id === id) || { id, npc: '', name: FAC[id] }; openDialogue(it); },
    update(dt, rawDt) {
      const step = rawDt ?? dt;
      if (coinShown != null && coinShown !== coinTarget) {
        const diff = coinTarget - coinShown; if (!purseD.dataset.on) { purseD.textContent = (diff > 0 ? '+' : '−') + fmt(Math.abs(diff)); purseD.className = 'tw-purse-d on ' + (diff > 0 ? 'up' : 'down'); purseD.dataset.on = '1'; setTimeout(() => { purseD.className = 'tw-purse-d'; delete purseD.dataset.on; }, 1400); }
        coinShown += Math.sign(diff) * Math.max(1, Math.abs(diff) * Math.min(1, step * 6)); if (Math.abs(coinTarget - coinShown) < 1) coinShown = coinTarget;
        purseN.textContent = fmt(coinShown);
      }
      typeTick(step);
      if ((cdT += step) > 1) { cdT = 0; tickCountdowns(); }
      const interact = game.townInteract; game.townInteract = false;
      const ok = state() && !gate.open && !leaving;
      near = ok && !win ? nearest() : null;
      if (dlg && interact) advance();
      else if (near && !dlg && !win && interact) openDialogue(near);
      const showPrompt = near && !dlg && !win;
      const key = showPrompt ? near.id : '';
      if (key !== promptKey) {
        promptKey = key;
        prompt.innerHTML = showPrompt ? `<div class="tw-prompt-in">${touch ? '' : '<kbd>E</kbd>'}<span class="tw-prompt-act">${near.id === 'dock' && state()?.quests.expedition ? 'Board' : 'Talk'}</span><span class="tw-prompt-sep">·</span><span class="tw-prompt-who"><b>${esc(near.npc)}</b><small>${esc(near.name || FAC[near.id])}</small></span></div>` : '';
        prompt.classList.toggle('on', !!showPrompt);
      }
      touch?.setAction?.(showPrompt ? 'TALK' : null);
    },
  };
}
