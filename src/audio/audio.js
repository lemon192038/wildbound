// Wildbound audio: fully procedural Web Audio (no asset files).
// createAudio(game) -> { update(dt, rawDt), play(name, pos, vol, opts), setVolume(v), setMusicIntensity(x|null) }
import { createGraph, mk, clamp } from './core.js';
import { recipes, aliases, meta, playVoice } from './sfx.js';
import { createMusic } from './music.js';
import { createAmbience } from './ambience.js';

const NOOP = { update() {}, play() { return null; }, setVolume() {}, setMusicIntensity() {}, get ready() { return false; } };
const CALM = /^(idle|wander|roam|graze|sleep|rest|patrol|walk|dead|die|dying|eat|drink|spawn|none)$/i;
const AGGRO = /attack|flinch|topple|charge|bite|tail|slam|breath|fire|roar|chase|enrage|rage|aggro|combat|pounce|stomp|swipe|hunt|angry|alert|lunge|threat/i;

export function createAudio(game) {
  const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  if (!AC) return NOOP;
  let ctx, G, H, music, amb;
  try {
    ctx = new AC({ latencyHint: 'interactive' });
    G = createGraph(ctx); H = mk(G);
    music = createMusic(G, H); amb = createAmbience(G, H);
  } catch (e) { console.warn('[audio] unavailable:', e?.message || e); return NOOP; }

  const THREE = game.THREE;
  const tmpV = new THREE.Vector3(), fwd = new THREE.Vector3(), up = new THREE.Vector3(), camPos = new THREE.Vector3();
  const voices = [];
  const MAX_VOICES = 40;
  const charge = { level: 0, swingAt: -9 };
  const recent = {}, DEDUPE = { growl: 0.7, inhale: 1.0, snort: 0.8, growlRise: 1, jawCreak: 0.6, scrape: 0.8, roar: 1.2, partBreak: 0.5, monsterStep: 0.09, potion: 0.6, fanfare: 2, slam: 0.15, fire: 0.5, hurt: 0.08 };
  const seen = {}; // event kinds we've received from other modules (disables our defensive fallbacks)
  let volume = 0.8, manualIntensity = null, combatHold = 0, victoryDone = new WeakSet(), unlocked = false;
  try { const v = parseFloat(localStorage.getItem('wildbound.volume')); if (v >= 0 && v <= 1) volume = v; } catch { /* storage blocked */ }
  G.master.gain.value = volume;
  const MUSIC_BASE = G.music.gain.value, AMB_BASE = G.amb.gain.value;

  // ---------- unlock ----------
  const unlock = () => {
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
  };
  const onState = () => {
    if (ctx.state === 'running' && !unlocked) {
      unlocked = true; const t = ctx.currentTime;
      try { amb.start(t); music.start(t); exposeWater(); } catch (e) { console.warn('[audio] start failed', e); }
      for (const ev of ['pointerdown', 'keydown', 'touchstart', 'mousedown']) removeEventListener(ev, unlock, true);
    }
  };
  ctx.onstatechange = onState;
  for (const ev of ['pointerdown', 'keydown', 'touchstart', 'mousedown']) addEventListener(ev, unlock, true);
  if (ctx.state === 'running') onState();

  function exposeWater() {
    const w = game.world; if (!w) return;
    let pts = w.waterSources || w.waterPoints || null;
    if (!pts && w.water) {
      const o = w.water.object3d || w.water.mesh || w.water;
      if (o?.position) pts = [o.position];
      else if (typeof w.water.x === 'number') pts = [w.water];
    }
    if (pts) amb.setWater(pts.map((p) => ({ x: p.x, y: p.y ?? w.waterLevel ?? 0, z: p.z })));
  }

  // ---------- play ----------
  function listenerPos() { return camPos; }
  function play(name, pos, vol = 1, opts = {}) {
    try {
      if (ctx.state !== 'running') return null;
      name = aliases[name] || name;
      if (!recipes[name]) return null;
      const now = ctx.currentTime, m = meta[name];
      // several modules may announce the same moment (e.g. sfx 'roar' + 'monster:roar'): play it once
      if (now - (recent[name] ?? -9) < (DEDUPE[name] ?? 0.025)) return null;
      recent[name] = now;
      // voice limiting: prune finished, then enforce per-name and global caps
      for (let i = voices.length - 1; i >= 0; i--) if (voices[i].end < now) voices.splice(i, 1);
      let same = 0; for (const v of voices) if (v.name === name) same++;
      if (same >= m.max) return null;
      if (voices.length >= MAX_VOICES) {
        if (name === 'footstep' || name === 'click') return null;
        const old = voices.findIndex((v) => v.name === 'footstep' || v.name === 'whoosh');
        if (old < 0) return null;
        stopVoice(voices[old]); voices.splice(old, 1);
      }
      let revScale = 1;
      if (pos) { const d = camPos.distanceTo(pos); revScale = clamp(Math.sqrt((m.ref * 2) / Math.max(d, 1)), 0.3, 1); }
      const t = now + 0.005 + Math.random() * 0.012; // tiny timing humanisation
      const v = playVoice(G, H, name, t, { pos, vol, revScale, pitch: 0.94 + Math.random() * 0.12, ...opts });
      if (!v) return null;
      voices.push(v);
      if (name === 'roar' || name === 'monsterHurt') duckMusic(0.3, v.end - now - 0.6, 1.2);
      // release graph references once finished
      setTimeout(() => { try { v.node.disconnect(); v.panner?.disconnect(); } catch { /* already gone */ } }, (v.end - now + 4) * 1000);
      return { stop: (fade = 0.25) => stopVoice(v, fade), end: v.end };
    } catch (e) { console.warn('[audio] play failed', name, e); return null; }
  }
  function stopVoice(v, fade = 0.05) {
    const t = ctx.currentTime; v.node.gain.cancelScheduledValues(t); v.node.gain.setTargetAtTime(0, t, fade / 3); v.end = Math.min(v.end, t + fade);
  }

  // ---------- events ----------
  const ev = game.events;
  const posOf = (p) => (p && typeof p.x === 'number' ? p : null);
  const headOf = (m) => (m?.position ? tmpV.copy(m.position).setY(m.position.y + 3).clone() : null);
  const isPlayerTarget = (tg) => tg && (tg === game.player || tg === 'player' || (game.player && tg.id === game.player.id));
  if (ev) {
    ev.on('hit', (e = {}) => {
      if (isPlayerTarget(e.target)) return; // player:damaged covers it
      const partName = typeof e.part === 'string' ? e.part : e.part?.name;
      const partObj = (typeof e.part === 'object' && e.part) || e.target?.parts?.find?.((q) => q.name === partName);
      const hz = partObj?.hitzone ?? 1;
      const weak = !!e.weak || hz >= 1.2, armor = hz <= 0.9;
      // charge level of the swing that produced this hit (player announces 'chargeN' then 'swingHeavy')
      const power = ctx.currentTime - charge.swingAt < 1.2 ? charge.level : 0;
      const s = clamp(((e.damage ?? 30) / 80) * (weak ? 1.25 : 1) * (1 + power * 0.15), 0.15, 1);
      const pos = posOf(e.point) || posOf(e.target?.position);
      if (e.blocked || e.bounce || e.deflect) { play('clang', pos, 0.9); return; }
      play('impact', pos, 0.75 + 0.35 * s + power * 0.08, { strength: s, crit: !!e.isCrit, weak, armor, power });
      if (e.isCrit && Math.random() < 0.5) play('clang', pos, 0.25);
    });
    ev.on('footstep', (e = {}) => {
      if (e.heavy) { seen.heavyStep = true; play('monsterStep', posOf(e.position), 1); }
      else { seen.step = true; play('footstep', posOf(e.position), e.volume ?? 0.55); }
    });
    ev.on('sfx', (e = {}) => {
      const raw = String(e.name || ''); let n = aliases[raw] || raw; const opts = {};
      if (raw === 'step') n = e.source === 'monster' ? 'monsterStep' : 'footstep';
      else if (/^charge\d$/.test(raw)) { n = 'charge'; opts.level = +raw.slice(6); }
      else if (raw === 'swingHeavy') { opts.size = 1.45; opts.pitch = 0.8; charge.swingAt = ctx.currentTime; }
      else if (raw === 'swing') { charge.level = 0; charge.swingAt = -9; }
      if (opts.level) charge.level = opts.level;
      else if (raw === 'breath' || raw === 'fireBreath') opts.duration = e.duration ?? 1.8;
      seen[n] = true;
      play(n, posOf(e.position), clamp(e.volume ?? 1, 0, 1.6), opts);
    });
    ev.on('monster:roar', (e = {}) => { seen.roar = true; play('roar', headOf(e.monster), 1.1); combatHold = 10; });
    ev.on('monster:partBreak', (e = {}) => play('partBreak', posOf(e.part?.position) || headOf(e.monster), 1));
    ev.on('player:damaged', (e = {}) => {
      const pos = game.player?.position || null;
      if (e.guarded) play('clang', pos, 0.9); else play('hurt', pos, 0.9, { strength: clamp((e.amount ?? 30) / 60, 0.2, 1) });
    });
    ev.on('monster:died', (e = {}) => onMonsterDied(e.monster));
    ev.on('hitstop', (e = {}) => duck(e.duration ?? 0.08));
    ev.on('ui:click', () => play('click'));
    ev.on('monster:state', (e = {}) => { if (e.monster && ctx.state === 'running') telegraph(e.monster); });
    // 'quest:complete' is silent here: the victory fanfare already plays in onMonsterDied's sequence.
  }
  function onMonsterDied(m) {
    if (m && victoryDone.has(m)) return; if (m) victoryDone.add(m);
    if (ctx.state !== 'running') return;
    play('roar', headOf(m), 1, { dying: true, length: 1.4, pitch: 0.85 });
    setTimeout(() => play('slam', m?.position || null, 0.9), 2600);
    music.victory(ctx.currentTime + 2.4, (out, t) => {
      const v = H.gain(0.5); v.connect(out); recipes.fanfare(H, v, t, {});
    });
  }
  // pull the score (and ambience) down under a big moment, then ease back
  function duckMusic(level, hold, release) {
    const t = ctx.currentTime;
    for (const [bus, base, lv] of [[G.music, MUSIC_BASE, level], [G.amb, AMB_BASE, Math.min(1, level * 1.6)]]) {
      const pr = bus.gain; pr.cancelScheduledValues(t); pr.setValueAtTime(pr.value, t);
      pr.setTargetAtTime(base * lv, t, 0.02); pr.setTargetAtTime(base, t + Math.max(0.03, hold), release / 3);
    }
  }
  function duck(d) {
    if (ctx.state !== 'running') return;
    duckMusic(0.35, clamp(d, 0.03, 0.4), 0.3);
    const t = ctx.currentTime, f = G.duck.frequency;
    f.cancelScheduledValues(t); f.setValueAtTime(f.value, t); f.setTargetAtTime(650, t, 0.006);
    f.setTargetAtTime(20000, t + clamp(d, 0.03, 0.4), 0.09);
  }

  // ---------- per-frame ----------
  const watch = { pState: null, mState: new WeakMap(), pLast: null, mLast: new WeakMap(), pDist: 0, mDist: new WeakMap() };
  function updateListener() {
    const cam = game.camera; if (!cam) return;
    cam.updateMatrixWorld?.();
    camPos.setFromMatrixPosition(cam.matrixWorld);
    fwd.set(0, 0, -1).transformDirection(cam.matrixWorld); up.set(0, 1, 0).transformDirection(cam.matrixWorld);
    const L = ctx.listener;
    if (L.positionX) {
      L.positionX.value = camPos.x; L.positionY.value = camPos.y; L.positionZ.value = camPos.z;
      L.forwardX.value = fwd.x; L.forwardY.value = fwd.y; L.forwardZ.value = fwd.z;
      L.upX.value = up.x; L.upY.value = up.y; L.upZ.value = up.z;
    } else { L.setPosition(camPos.x, camPos.y, camPos.z); L.setOrientation(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z); }
  }

  function defensive(dt) {
    const p = game.player;
    if (p) {
      const st = String(p.state ?? '');
      if (st !== watch.pState) {
        if (/dodge|roll|evade/i.test(st) && !seen.roll) play('roll', p.position, 0.8);
        if (/drink|potion|heal/i.test(st) && !seen.potion) play('potion', p.position, 0.8);
        if (/attack|swing|slash|combo/i.test(st) && !seen.whoosh) play('whoosh', p.position, 0.8);
        watch.pState = st;
      }
      if (!seen.step && p.position) {
        if (watch.pLast) {
          const d = Math.hypot(p.position.x - watch.pLast.x, p.position.z - watch.pLast.z);
          if (d < 2) watch.pDist += d;
          if (watch.pDist > 1.7) { watch.pDist = 0; if (!/dodge|roll/i.test(st)) play('footstep', p.position, 0.45); }
        } else watch.pLast = new THREE.Vector3();
        watch.pLast.copy(p.position);
      }
    }
    for (const m of game.monsters || []) {
      if (!m?.position) continue;
      const st = String(m.state ?? '');
      if (st !== watch.mState.get(m)) {
        if (/roar/i.test(st) && !seen.roar) play('roar', headOf(m), 1.1);
        watch.mState.set(m, st);
      }
      if (m.hp <= 0 && !victoryDone.has(m)) onMonsterDied(m);
      telegraph(m);
      if (!seen.heavyStep) {
        const last = watch.mLast.get(m);
        if (last) {
          const d = Math.hypot(m.position.x - last.x, m.position.z - last.z);
          let acc = (watch.mDist.get(m) || 0) + (d < 5 ? d : 0);
          if (acc > 3.2) { acc = 0; play('monsterStep', m.position, 0.9); }
          watch.mDist.set(m, acc); last.copy(m.position);
        } else watch.mLast.set(m, m.position.clone());
      }
    }
  }

  // Audio telegraphs: when the monster starts an attack, warn the player by ear.
  const TELL = {
    bite: [['jawCreak', 0.9]], fireBreath: [['inhale', 1.1]], charge: [['snort', 1], ['scrape', 0.9, 0.25]],
    leapSlam: [['growlRise', 1]], tailSweep: [['growl', 0.6]],
  };
  const lastAct = new WeakMap();
  function telegraph(m) {
    const key = m.actionSeq ?? m.actionName, name = m.actionName || '';
    if (lastAct.get(m) === key) return; lastAct.set(m, key);
    const tell = TELL[name] || (/bite/i.test(name) ? TELL.bite : /breath|fire/i.test(name) ? TELL.fireBreath : /charge|rush/i.test(name) ? TELL.charge : /leap|slam|jump/i.test(name) ? TELL.leapSlam : null);
    if (!tell) return;
    if (tell === TELL.leapSlam) recent.growl = ctx.currentTime + 0.5; // the wind-up growl replaces the monster's own
    for (const [snd, vol, delay = 0] of tell) {
      if (delay) setTimeout(() => play(snd, headOf(m), vol), delay * 1000); else play(snd, headOf(m), vol);
    }
  }
  function autoIntensity(rawDt) {
    const p = game.player; let x = 0;
    for (const m of game.monsters || []) {
      if (!m?.position || m.hp <= 0) continue;
      const d = p?.position ? p.position.distanceTo(m.position) : 999;
      const st = String(m.state ?? '');
      const aggro = AGGRO.test(st) && !CALM.test(st);
      if (d < 35 || aggro) combatHold = Math.max(combatHold, 6);
      if (combatHold > 0) x = Math.max(x, m.maxHp && m.hp / m.maxHp < 0.3 ? 2 : 1);
    }
    combatHold = Math.max(0, combatHold - rawDt);
    if (combatHold <= 0) x = 0;
    return x;
  }

  function update(dt, rawDt = dt) {
    if (ctx.state !== 'running') return;
    try {
      updateListener();
      defensive(dt);
      const x = manualIntensity ?? autoIntensity(rawDt || 0.016);
      if (x !== music.intensity) music.setIntensity(x);
      const now = ctx.currentTime;
      music.schedule(now + 0.25);
      amb.update(now, { x: camPos.x, y: camPos.y, z: camPos.z, groundY: game.player?.position?.y ?? 0 });
    } catch (e) { if (!update.warned) { update.warned = true; console.warn('[audio] update error', e); } }
  }

  return {
    update, play,
    setVolume(v) { volume = clamp(+v || 0, 0, 1); G.master.gain.setTargetAtTime(volume, ctx.currentTime, 0.05); try { localStorage.setItem('wildbound.volume', String(volume)); } catch { /* ignore */ } },
    setMusicIntensity(x) { manualIntensity = x == null ? null : clamp(+x, 0, 2); },
    get ready() { return ctx.state === 'running'; },
    get volume() { return volume; },
    context: ctx, listenerPos, debug: { G, music, voices },
  };
}
