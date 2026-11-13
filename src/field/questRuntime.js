// Quest runtime for the hunting field (?mode=field&quest=<expedition id>).
// Links the field to the server-side quest: loads the expedition + equipment from the account, applies
// gear/consumables, tracks objectives (slay / capture / gather / part breaks / no-faint / time), and reports
// the outcome to the server, which validates it and grants rewards. Then it sends the hunter back to port.
//   const ctx = await prepareQuest(game)         // before the world/monster exist; null → free hunt
//   startQuestRuntime(game, ctx)                 // after player + monster + UI are created
import * as THREE from 'three';
import { QUESTS, ITEMS, MONSTERS } from '../shared/gamedata.js';
import { createGather } from './gather.js';

const HEAL = { heal50: 50, heal100: 100, healFull: 999 };
const navTown = () => { const u = new URL(location.href); const keep = new URLSearchParams(); for (const k of ['low', 'hq', 'touch']) if (u.searchParams.has(k)) keep.set(k, u.searchParams.get(k)); keep.set('mode', 'town'); location.href = `${u.pathname}?${keep}`; };

function overlay(html) {
  const el = document.createElement('div'); el.className = 'qr-overlay'; el.innerHTML = html; document.getElementById('ui-root').appendChild(el); return el;
}
function injectCss() {
  if (document.getElementById('qr-css')) return; const s = document.createElement('style'); s.id = 'qr-css';
  s.textContent = `
  .qr-overlay{position:fixed;inset:0;z-index:40;display:flex;align-items:center;justify-content:center;background:radial-gradient(ellipse at center,rgba(10,6,3,.55),rgba(0,0,0,.85));pointer-events:auto;font-family:var(--sans,Inter,system-ui,sans-serif);color:#e9dcc0;animation:qrIn .5s ease}
  @keyframes qrIn{from{opacity:0}to{opacity:1}}
  .qr-card{min-width:min(560px,92vw);max-width:92vw;max-height:86vh;overflow:auto;padding:28px 34px;background:linear-gradient(180deg,rgba(28,20,13,.97),rgba(14,10,7,.97));border:1px solid rgba(217,182,115,.55);box-shadow:0 0 0 1px rgba(0,0,0,.6),0 0 0 4px rgba(217,182,115,.12),0 20px 60px rgba(0,0,0,.7);text-align:center}
  .qr-card h1{font-family:var(--serif,Cinzel,Georgia,serif);letter-spacing:.24em;margin:0 0 4px;font-size:30px;color:#f6e2aa;text-shadow:0 2px 12px rgba(255,160,60,.35)}
  .qr-card h1.fail{color:#c9b8a6;filter:grayscale(.6)}
  .qr-sub{font-family:var(--serif,Cinzel,serif);letter-spacing:.2em;font-size:12px;opacity:.75;margin-bottom:18px}
  .qr-row{display:flex;justify-content:space-between;gap:16px;padding:8px 2px;border-bottom:1px solid rgba(217,182,115,.15);font-size:15px}
  .qr-row b{color:#f6e2aa;font-variant-numeric:tabular-nums}
  .qr-items{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:6px 14px;margin:14px 0 6px;text-align:left}
  .qr-item{display:flex;justify-content:space-between;padding:7px 10px;background:rgba(255,255,255,.04);border-left:3px solid var(--rc,#aaa);font-size:14px;animation:qrIn .5s ease both}
  .qr-btn{margin-top:20px;min-height:48px;padding:12px 30px;font-family:var(--serif,Cinzel,serif);letter-spacing:.2em;font-size:14px;color:#1a1208;background:linear-gradient(180deg,#f6e2aa,#c9a25a);border:1px solid #f6e2aa;cursor:pointer}
  .qr-btn:disabled{opacity:.5;cursor:wait}
  .qr-obj{position:fixed;left:2.2em;top:13.5em;z-index:12;min-width:15em;padding:.7em .9em;background:linear-gradient(180deg,rgba(16,11,7,.78),rgba(10,7,4,.6));border-left:2px solid rgba(217,182,115,.7);font-family:var(--sans,Inter,sans-serif);color:#e9dcc0;font-size:13px;pointer-events:none}
  .qr-obj h4{margin:0 0 .4em;font-family:var(--serif,Cinzel,serif);letter-spacing:.16em;font-size:11px;color:#f6e2aa}
  .qr-obj div{display:flex;justify-content:space-between;gap:1em;padding:.15em 0;opacity:.9}.qr-obj div.done{color:#9fe08a}.qr-obj div.done::after{content:'✓'}
  .qr-prompt{position:fixed;left:50%;bottom:22%;transform:translateX(-50%);z-index:12;padding:.45em 1em;background:rgba(10,7,4,.72);border:1px solid rgba(217,182,115,.45);font-family:var(--serif,Cinzel,serif);letter-spacing:.1em;color:#f6e2aa;font-size:14px;pointer-events:none;display:none}
  .qr-banner{position:fixed;left:50%;top:22%;transform:translateX(-50%);z-index:30;text-align:center;font-family:var(--serif,Cinzel,serif);color:#f6e2aa;pointer-events:none;text-shadow:0 2px 14px #000}
  .qr-banner h2{margin:0;font-size:34px;letter-spacing:.3em}.qr-banner p{margin:.3em 0 0;letter-spacing:.18em;font-size:13px}
  .qr-pick{position:fixed;right:2.4em;bottom:9.5em;z-index:12;display:flex;flex-direction:column;align-items:flex-end;gap:4px;pointer-events:none;font-size:13px}
  .qr-pick span{padding:.3em .8em;background:rgba(10,7,4,.7);border-right:2px solid #9fe08a;animation:qrIn .3s ease}`;
  document.head.appendChild(s);
}
const RARITY = ['#bbb', '#cfcfcf', '#9fe08a', '#7ec8ff', '#c79bff', '#ffb35c', '#ff6a5c', '#ffe27a'];

export async function prepareQuest(game) {
  const iid = game.params.get('quest'); if (!iid) return null;
  injectCss();
  const state = await game.account.restore();
  const ex = state?.quests?.expedition;
  if (!state || !ex || ex.iid !== iid) {
    const o = overlay(`<div class="qr-card"><h1 class="fail">HUNT UNAVAILABLE</h1><div class="qr-sub">${!state ? 'YOUR SESSION HAS EXPIRED — PLEASE LOG IN AT PORT' : 'THIS EXPEDITION IS NO LONGER ACTIVE'}</div><button class="qr-btn">RETURN TO PORT</button></div>`);
    o.querySelector('button').onclick = navTown;
    await new Promise(() => {}); // halt boot here
  }
  const q = QUESTS[ex.qid];
  game.hunt = q.monster || 'varkhul';
  game.questTimeLimit = q.timeLimit;
  game.questDef = q;
  const carried = { ...ex.carried }; const used = {};
  // Item bar: every carried consumable/tool + the whetstone (infinite).
  const order = Object.keys(carried).filter((k) => ITEMS[k]).sort((a, b) => (ITEMS[a].kind === 'consumable' ? 0 : 1) - (ITEMS[b].kind === 'consumable' ? 0 : 1));
  const ctx = { iid, ex, q, state, carried, used, items: order, runtime: null };
  const rt = { abandon: () => ctx.finish?.('fail', 'Abandoned'), ctx };
  game.questRuntime = rt; ctx.runtime = rt;
  game.fieldItems = {
    list: () => [...order.map((k) => ({ id: k, name: ITEMS[k].name, desc: ITEMS[k].desc })), { id: 'whetstone', name: 'Whetstone', desc: 'Restores the edge' }],
    count: (id) => (id === 'whetstone' ? Infinity : carried[id] || 0),
    use: (id) => ctx.useItem?.(id) ?? false,
  };
  return ctx;
}

export function startQuestRuntime(game, ctx) {
  const { q, carried, used, iid } = ctx; const P = game.player, events = game.events;
  const mon = () => game.monsters[0];
  const toast = (t) => game.ui?.toast?.(t);
  // ---------------------------------------------------------------- gear, monster tuning
  P.setGear?.(ctx.state.stats || {});
  const m0 = mon();
  if (m0) {
    m0.weakness = MONSTERS[game.hunt]?.weakness || {};
    if (q.tempered) { m0.maxHp = m0.hp = Math.round(m0.maxHp * q.tempered); }
    // tempered monsters hit harder
    if (q.tempered) { const orig = P.receiveHit; P.receiveHit = (o = {}) => orig({ ...o, damage: (o.damage || 0) * (o.source === m0 || o.source === mon() ? 1.3 : 1) }); }
    // weapon element extras: blast build-up bursts; water/ice douses Gorvath's growths
    const origHit = m0.receiveHit.bind(m0); let blast = 0, procs = 0;
    m0.receiveHit = (o = {}) => {
      const r = origHit(o);
      if (o.attackerId === 'local' && o.element === 'blast' && m0.state !== 'dead') {
        blast += o.elementValue * 0.035 * (m0.weakness.blast ?? 1);
        if (blast >= 100 * (1 + procs * 0.5)) {
          blast = 0; procs++; const pt = o.point?.clone() || m0.center?.clone() || m0.position.clone();
          origHit({ damage: 140, part: 'body', point: pt, attackerId: 'local' }); game.world.spawnDust?.(pt, 1.2);
          events.emit('sfx', { name: 'slam', position: pt, volume: 0.9 }); events.emit('camera:shake', { intensity: 0.4, duration: 0.3 }); toast('Blast!');
        }
      }
      if ((o.element === 'water' || o.element === 'ice') && m0.heat && o.part in m0.heat) m0.heat[o.part] = Math.max(0, m0.heat[o.part] - 0.06 * (o.elementValue / 300));
      return r;
    };
  }
  // ---------------------------------------------------------------- state
  const clockSkew = (ctx.state.serverTime || Date.now()) - Date.now(); // server − client clock
  const st = { slain: false, captured: false, parts: new Set(), gathered: {}, faints: 0, t: 0, phase: 'hunt', endAt: 0, snaredUntil: 0, tranq: 0, buffs: {} };
  events.on('monster:died', () => { st.slain = true; });
  events.on('monster:partBreak', (e) => { const p = typeof e?.part === 'string' ? e.part : e?.part?.name; if (p) st.parts.add(p); });
  events.on('player:died', () => { st.faints++; if (st.phase === 'hunt') toast(`Fainted ${st.faints}/${q.maxFaints}`); if (st.faints >= q.maxFaints) finish('fail', 'Fainted too many times'); });
  events.on('quest:failed', (e) => finish('fail', e?.reason || 'Time expired'));

  // ---------------------------------------------------------------- items
  const spend = (id) => { carried[id]--; used[id] = (used[id] || 0) + 1; };
  ctx.useItem = (id) => {
    if (st.phase === 'done' || P.dead) return false;
    if (id === 'whetstone') { P.useItem('whetstone'); return true; }
    const it = ITEMS[id]; if (!it || !(carried[id] > 0)) { toast(`No ${it?.name || id} left`); return false; }
    const m = mon(); const dist = m ? m.position.distanceTo(P.position) : 999;
    switch (it.use) {
      case 'heal50': case 'heal100': case 'healFull': case 'stamina': case 'curePoison': case 'cureBurn': case 'cureBlast': case 'attackUp': case 'defenseUp':
        P.useItem('potion', { id, heal: HEAL[it.use] || 0, onUse: () => { spend(id); applyEffect(it.use); } }); return true;
      case 'flash': {
        spend(id); events.emit('sfx', { name: 'clang', position: P.position.clone(), volume: 0.8 }); flashScreen();
        if (m && dist < 30 && m.state !== 'dead') { m.debug?.play?.(m.kind === 'wyvern' ? 'topple' : 'flinch'); toast(m.kind === 'wyvern' ? 'The Ashwing crashes to the ground!' : `${m.name.split(',')[0]} is dazed!`); }
        return true;
      }
      case 'snare': {
        if (!m || dist > 8) { toast('Too far — set the Snare Coil near the monster'); return false; }
        if (!m.limping && m.hp > m.maxHp * 0.25) { toast('It is still too strong to be snared'); return false; }
        spend(id); m.debug?.play?.('topple'); st.snaredUntil = st.t + 9; st.tranq = 0; toast('Snared! Quick — Lull Bombs!'); events.emit('sfx', { name: 'clang', position: m.position.clone() }); return true;
      }
      case 'tranq': {
        spend(id); if (!m || dist > 14) { toast('The gas drifts away…'); return true; }
        if (st.t < st.snaredUntil) { st.tranq++; toast(st.tranq >= 2 ? 'Captured!' : 'The beast grows drowsy…'); if (st.tranq >= 2) capture(m); }
        else toast('It shrugs off the gas — snare it first');
        return true;
      }
    }
    return false;
  };
  function applyEffect(use) {
    const S = game.status;
    if (use === 'healFull') { P.stamina = P.maxStamina; }
    if (use === 'stamina') { P.stamina = P.maxStamina; st.buffs.stam = 60; }
    if (use === 'curePoison') S?.clear('poison');
    if (use === 'cureBurn') S?.ward('burn', 90);
    if (use === 'cureBlast') S?.ward('blast', 60);
    if (use === 'attackUp') st.buffs.atk = 90;
    if (use === 'defenseUp') st.buffs.def = 90;
  }
  function capture(m) {
    st.captured = true; m.captured = true; m.update = () => {}; // sleeps where it lies
    events.emit('monster:captured', { monster: m });
  }
  function flashScreen() { const f = document.createElement('div'); f.style.cssText = 'position:fixed;inset:0;background:#fff;opacity:.9;z-index:35;pointer-events:none;transition:opacity .6s'; document.body.appendChild(f); requestAnimationFrame(() => { f.style.opacity = '0'; }); setTimeout(() => f.remove(), 700); }

  // ---------------------------------------------------------------- gathering
  const gather = createGather(game);
  const prompt = document.createElement('div'); prompt.className = 'qr-prompt'; document.getElementById('ui-root').appendChild(prompt);
  const picks = document.createElement('div'); picks.className = 'qr-pick'; document.getElementById('ui-root').appendChild(picks);
  const poll = game.input.poll.bind(game.input); let gatherLock = 0;
  game.input.poll = () => {
    const s = poll(); const n = st.phase !== 'done' && !P.dead ? gather.nearest(P.position) : null;
    if (n) { prompt.style.display = 'block'; prompt.textContent = `E · Gather — ${n.label}`; game.input.touch?.setAction('GATHER'); }
    else { prompt.style.display = 'none'; game.input.touch?.setAction(null); }
    if (gatherLock > 0) { s.move.x = s.move.y = 0; s.lightAttack = s.heavyAttack = s.dodge = false; }
    if (s.interact && n && gatherLock <= 0 && !P.weaponDrawn) {
      s.interact = false; const g = gather.gather(n);
      if (g) { st.gathered[g.item] = (st.gathered[g.item] || 0) + g.qty; gatherLock = 0.6; events.emit('sfx', { name: 'click', position: P.position.clone(), volume: 0.6 });
        const sp = document.createElement('span'); sp.textContent = `+${g.qty} ${ITEMS[g.item].name}`; picks.appendChild(sp); setTimeout(() => sp.remove(), 2600); }
    } else if (s.interact && n && P.weaponDrawn) { s.interact = false; toast('Sheathe your weapon to gather'); }
    return s;
  };

  // ---------------------------------------------------------------- objectives panel
  const obj = document.createElement('div'); obj.className = 'qr-obj'; document.getElementById('ui-root').appendChild(obj);
  const objLines = () => q.objectives.map((o) => {
    if (o.k === 'slay') return [`Slay ${MONSTERS[q.monster].name.split(',')[0]}`, st.slain];
    if (o.k === 'slayOrCapture') return [`Hunt ${MONSTERS[q.monster].name.split(',')[0]} (slay or capture)`, st.slain || st.captured];
    if (o.k === 'gather') { const n = Math.min(o.qty, st.gathered[o.item] || 0); return [`${ITEMS[o.item].name} ${n}/${o.qty}`, n >= o.qty]; }
    if (o.k === 'break') return [`Break: ${o.parts.join(', ')}`, o.parts.every((p) => st.parts.has(p))];
    if (o.k === 'noFaint') return ['Do not faint', st.faints === 0];
    if (o.k === 'within') return [`Within ${Math.round(o.s / 60)} min`, st.t <= o.s];
    return ['?', false];
  });
  let objKey = '';
  const success = () => objLines().every((l) => l[1]); // noFaint/within lines stay true only while their condition holds

  // ---------------------------------------------------------------- completion
  let banner = null;
  function finish(kind, reason) {
    if (st.phase === 'done' || st.phase === 'submitting') return;
    if (kind === 'success' && st.phase === 'hunt') {
      st.phase = 'complete'; st.endAt = st.t + 20; events.emit('quest:complete', { gen: 0 });
      banner = document.createElement('div'); banner.className = 'qr-banner'; banner.innerHTML = `<h2>QUEST COMPLETE</h2><p>RETURNING TO PORT IN <b>20</b>s — GATHER WHILE YOU CAN</p>`; document.getElementById('ui-root').appendChild(banner);
      return;
    }
    submit(kind, reason);
  }
  ctx.finish = finish;
  async function submit(kind, reason) {
    st.phase = 'submitting'; banner?.remove(); prompt.style.display = 'none'; game.input.touch?.setAction(null);
    const report = { slain: st.slain, captured: st.captured, parts: [...st.parts], gathered: st.gathered, faints: st.faints, used };
    const card = overlay(`<div class="qr-card"><h1>${kind === 'success' ? 'REPORTING…' : 'RETURNING…'}</h1><div class="qr-sub">SENDING YOUR HUNT REPORT TO THE GUILD</div></div>`);
    let r;
    for (let i = 0; i < 6; i++) { r = await game.account.act(kind === 'success' ? 'completeQuest' : 'failQuest', { iid, report, reason }); if (r.ok || (r.error !== 'network' && r.error !== 'too_early')) break; await new Promise((res) => setTimeout(res, r.error === 'too_early' ? 3000 : 1500 * (i + 1))); }
    st.phase = 'done'; card.remove();
    const res = r?.result || {}; const rw = res.rewards;
    const ok = kind === 'success' && r?.ok && res.ok !== false;
    const items = rw ? Object.entries(rw.items).map(([k, n], i) => `<div class="qr-item" style="--rc:${RARITY[ITEMS[k]?.rarity || 1]};animation-delay:${0.4 + i * 0.08}s"><span>${ITEMS[k]?.name || k}</span><b>×${n}</b></div>`).join('') : '';
    const el = overlay(`<div class="qr-card">
      <h1 class="${ok ? '' : 'fail'}">${ok ? 'QUEST COMPLETE' : 'QUEST FAILED'}</h1>
      <div class="qr-sub">${q.name.toUpperCase()}${ok ? '' : ' — ' + (res.why || reason || r?.message || 'Hunt abandoned').toUpperCase()}</div>
      ${ok ? `<div class="qr-row"><span>Bounty</span><b>+${rw.coins.toLocaleString()} coins</b></div><div class="qr-row"><span>Hunter experience</span><b>+${rw.xp} XP${rw.hrUp ? ` · Rank ${rw.hr}!` : ''}</b></div>
      <div class="qr-row"><span>Time</span><b>${fmt(res.elapsed || st.t)}</b></div><div class="qr-items">${items}</div>` : `<div class="qr-row"><span>Unused supplies</span><b>returned to your pouch</b></div>`}
      ${!r?.ok && r?.error === 'network' ? '<div class="qr-row"><span>Connection lost</span><b>your report could not be sent</b></div>' : ''}
      <button class="qr-btn">RETURN TO PORT</button></div>`);
    el.querySelector('button').onclick = navTown;
  }
  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  // ---------------------------------------------------------------- per-frame
  game.addUpdater((dt) => {
    st.t += dt; gatherLock -= dt; gather.update(dt);
    for (const k in st.buffs) st.buffs[k] = Math.max(0, st.buffs[k] - dt);
    P.gear.buffAtk = st.buffs.atk > 0 ? 1.1 : 1; P.gear.buffDef = st.buffs.def > 0 ? 0.85 : 1;
    if (st.buffs.stam > 0) P.stamina = Math.min(P.maxStamina, P.stamina + 6 * dt);
    const lines = objLines(); const key = lines.map((l) => l.join()).join('|');
    if (key !== objKey) { objKey = key; obj.innerHTML = `<h4>${q.name.toUpperCase()}</h4>` + lines.map(([t, d]) => `<div class="${d ? 'done' : ''}"><span>${t}</span></div>`).join(''); }
    if (st.phase === 'hunt' && success()) finish('success');
    if (st.phase === 'complete') {
      // never report before the server's plausibility minimum (server clock), else the report is refused
      const earliest = ctx.ex.at + (q.minClear + 2) * 1000 - (Date.now() + clockSkew);
      const left = Math.max(0, Math.ceil(Math.max(st.endAt - st.t, earliest / 1000))); const b = banner?.querySelector('b'); if (b) b.textContent = left;
      if (st.t >= st.endAt && earliest <= 0) submit('success');
    }
  });
  return ctx;
}
