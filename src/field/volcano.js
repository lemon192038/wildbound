// Client side of the Volcano Slime event (server/volcano.js decides everything; this module shows it and reports facts).
//   • polls GET /api/volcano (10 s; 2.5 s while awake) and applies it: lava flow / crust, the magma chamber glow,
//     the rampage of the Magma Slimes, the world boss itself
//   • the crater devours any hunter who enters it (always — spec §6-2). While the lava is stopped the server counts it;
//     the 100th makes this hunter the victim
//   • the victim's client sends heartbeats (alive, in the volcano region); death sends one at once
//   • damage to the boss is batched to the server (idempotent ids); the HP shown is the server's
// Offline / tests: ?volcano=stopped|awakened shows the state locally (nothing is reported, nothing is rewarded).
import { createVolcanoSlime } from '../monster/volcanoSlime.js';
import { t } from '../shared/i18n.js';

const DEVOUR_R = 100, WARN_R = 135, REGION_R = 430;

export function createVolcanoEvent(game) {
  const F = game.world.island, C = F.crater, P = () => game.player;
  const local = game.params?.get('volcano'); // debug view only
  let S = local ? { phase: local, flow: local === 'flowing' ? 1 : 0, chamber: local === 'flowing' ? 0 : 1, boss: local === 'awakened' ? { hp: 100000, maxHp: 100000, t0: Date.now() - 70000, seed: 7 } : null, victim: null, serverTime: Date.now() } : { phase: 'flowing', flow: 1, chamber: 0 };
  let skew = 0, pollT = 0, inflight = false, boss = null, pending = [], nEv = 0, flushT = 0, hbT = 0, devouring = 0, warned = false, lastPhase = S.phase;
  const nonce = Math.random().toString(36).slice(2, 7);
  const req = (path, body) => game.account?.request?.(path, body, { retries: 0 });
  const online = () => !local && !!game.account?.loggedIn;
  const now = () => Date.now() + skew;

  // ---- HUD: boss bar + event banner
  let bar = null, fill = null, label = null, banner = null;
  if (typeof document !== 'undefined') {
    const root = document.getElementById('ui-root') || document.body;
    bar = document.createElement('div'); bar.style.cssText = 'position:fixed;left:50%;top:14px;transform:translateX(-50%);width:min(560px,70vw);z-index:12;display:none;pointer-events:none;font:700 13px Georgia,serif;color:#ffd9a0;text-align:center;letter-spacing:.12em;text-shadow:0 1px 3px #000';
    bar.innerHTML = '<div class="vs-l"></div><div style="height:10px;margin-top:4px;background:rgba(20,8,4,.75);border:1px solid rgba(255,140,60,.7)"><div class="vs-f" style="height:100%;width:100%;background:linear-gradient(90deg,#ff3a10,#ffb040)"></div></div>';
    root.appendChild(bar); fill = bar.querySelector('.vs-f'); label = bar.querySelector('.vs-l');
    banner = document.createElement('div'); banner.style.cssText = 'position:fixed;left:50%;top:32%;transform:translateX(-50%);z-index:13;display:none;pointer-events:none;font:700 clamp(18px,3.4vh,30px) Georgia,serif;color:#ffcf8a;text-shadow:0 0 12px #ff5010,0 2px 4px #000;letter-spacing:.14em;text-align:center';
    root.appendChild(banner);
  }
  let bannerT = 0; const announce = (txt, sec = 4) => { if (!banner) return; banner.textContent = txt; banner.style.display = 'block'; bannerT = sec; };

  function apply(v) {
    if (!v) return; if (v.serverTime) skew = v.serverTime - Date.now();
    const prev = S.phase; S = v;
    if (prev !== v.phase) onPhase(prev, v.phase);
  }
  function onPhase(prev, ph) {
    if (ph === 'stopped') announce(t('vs.stopped'));
    if (ph === 'awakened') announce(t('vs.awake'), 6);
    if (ph === 'flowing' && prev === 'awakened') announce(t('vs.reset'), 5);
    if (ph === 'defeated') announce(t('vs.defeated'), 6);
    game.events?.emit?.('volcano:phase', { phase: ph, prev });
  }
  async function poll() {
    if (local || inflight || !game.account?.request) return; inflight = true;
    try { const r = await req('/api/volcano'); if (r?.ok) apply(r.volcano); } finally { inflight = false; }
  }
  async function flush() {
    if (!pending.length || !online()) { if (!online()) pending = []; return; }
    const events = pending.splice(0, 40); const r = await req('/api/volcano/damage', { events }).catch(() => null);
    if (r?.volcano) apply(r.volcano); else if (!r) pending.unshift(...events);
  }
  async function heartbeat(alive) {
    if (!online() || S.phase !== 'awakened' || !S.victim?.you) return;
    const p = P().position; const region = Math.hypot(p.x - C.x, p.z - C.z) < REGION_R;
    const r = await req('/api/volcano/heartbeat', { alive, region }).catch(() => null); if (r?.volcano) apply(r.volcano);
  }
  game.events?.on?.('player:died', () => { if (devouring <= 0) heartbeat(false); });

  // ---- the crater devours
  async function devour() {
    const pl = P(); if (!pl || pl.dead) return; devouring = 6;
    announce(t('vs.devoured'), 3.5); game.events?.emit?.('camera:shake', { intensity: 1, duration: 1 });
    game.world.spawnDust?.(pl.position.clone(), 3); pl.devour?.();
    if (!online()) return;
    const r = await req('/api/volcano/devour', {}).catch(() => null);
    if (r?.volcano) apply(r.volcano);
    if (r?.victim) { // the 100th: this hunter is the victim — respawn on the rim, inside the volcano region
      const a = Math.atan2(pl.position.z - C.z, pl.position.x - C.x); const x = C.x + Math.cos(a) * (C.r + 30), z = C.z + Math.sin(a) * (C.r + 30);
      pl.respawnAt = { x, z }; announce(t('vs.victim'), 7);
    }
  }

  function syncBoss() {
    const want = (S.phase === 'awakened') && S.boss;
    if (want && !boss) {
      boss = createVolcanoSlime(game, { seed: S.boss.seed, t0: S.boss.t0, clock: now, hp: S.boss.hp, maxHp: S.boss.maxHp,
        onDamage: (d) => { if (online()) pending.push({ eid: `${nonce}.${++nEv}`, dmg: Math.round(d) }); } });
      game.monsters.push(boss); game.volcanoBoss = boss;
    } else if (!want && boss) {
      const i = game.monsters.indexOf(boss); if (i >= 0) game.monsters.splice(i, 1); if (game.player?.lockTarget === boss) game.player.lockTarget = null;
      boss.dispose(); boss = null; game.volcanoBoss = null;
    }
    if (boss && !local) { const unsent = pending.reduce((a, e) => a + e.dmg, 0); boss.setServerHp(Math.max(0, S.boss.hp - unsent), S.boss.maxHp); }
  }

  function update(dt, rawDt) {
    const pl = P(); if (!pl) return;
    pollT -= rawDt; if (pollT <= 0) { pollT = S.phase === 'awakened' ? 2.5 : 10; poll(); }
    flushT -= rawDt; if (flushT <= 0) { flushT = 1; flush(); }
    hbT -= rawDt; if (hbT <= 0) { hbT = 5; heartbeat(!pl.dead); }
    if (bannerT > 0 && (bannerT -= rawDt) <= 0 && banner) banner.style.display = 'none';
    devouring = Math.max(0, devouring - rawDt);
    // world reactions
    game.volcanoFlow = S.flow ?? 1; game.volcanoChamber = S.chamber ?? 0; game.volcanoRampage = S.phase === 'awakened';
    syncBoss(); boss?.update(dt);
    // the crater
    const d = Math.hypot(pl.position.x - C.x, pl.position.z - C.z);
    if (!pl.dead && devouring <= 0 && d < DEVOUR_R && pl.position.y < C.lake + 40) devour();
    else if (!warned && d < WARN_R && !pl.dead) { warned = true; game.ui?.toast?.(t('vs.heat')); }
    if (d > WARN_R + 40) warned = false;
    // boss bar
    if (bar) {
      const show = !!boss && Math.hypot(pl.position.x - boss.position.x, pl.position.z - boss.position.z) < 500; bar.style.display = show ? 'block' : 'none';
      if (show) { fill.style.width = `${(100 * boss.hp / boss.maxHp).toFixed(1)}%`; const txt = `${boss.name} · ${t('vs.stage', { n: boss.stage })}${S.victim ? ' · ' + t('vs.victimIs', { n: S.victim.name }) : ''}`; if (label.textContent !== txt) label.textContent = txt; }
    }
    if (S.phase !== lastPhase) lastPhase = S.phase;
  }
  return { update, get state() { return S; }, get boss() { return boss; }, devour, poll, apply, pending: () => pending };
}
