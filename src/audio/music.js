// Adaptive procedural score. Three layers share one clock so crossfades stay
// in time: explore (pads + modal harp), combat (taiko, string ostinato, low
// strings, brass stabs), climax (choir, doubled ostinato, extra drums, cymbals).
// A lookahead scheduler places every note on the AudioContext clock.
import { rand, pick } from './core.js';
import { drum, tick, strings, pad, pluck, brass, choir, cymbal } from './instruments.js';

const BPM = 112, STEP = 60 / BPM / 4, BAR = 16;
// D aeolian/dorian colours. Each chord lasts 2 bars; 8-bar cycle.
const CHORDS = [
  { root: 50, third: 3, pad: [50, 57, 60, 64, 65], harp: [62, 64, 65, 69, 72, 74, 76] },      // Dm9
  { root: 46, third: 4, pad: [46, 53, 57, 62, 64], harp: [62, 65, 69, 70, 72, 74, 77] },      // Bbmaj9(#11-ish)
  { root: 53, third: 4, pad: [41, 53, 57, 60, 67], harp: [60, 65, 67, 69, 72, 77, 79] },      // Fadd9
  { root: 48, third: 4, pad: [48, 55, 62, 64, 67], harp: [62, 64, 67, 69, 72, 74, 76] },      // Cadd9
];
// combat variant of the cycle: darker last chord (A minor -> pull back to D)
const COMBAT_ROOTS = [50, 46, 53, 45];

export function createMusic(G, H) {
  const ctx = G.ctx;
  const layer = (v) => { const g = H.gain(v, G.music); const r = H.gain(0.35); g.connect(r); r.connect(G.revSend); return g; };
  const L = { explore: layer(0), combat: layer(0), climax: layer(0), sting: layer(1) };
  // explore layer feeds more reverb
  const exRev = H.gain(0.5); L.explore.connect(exRev); exRev.connect(G.revSend);
  const target = { explore: 0, combat: 0, climax: 0 }, fadeUntil = { explore: 0, combat: 0, climax: 0 };
  let step = 0, nextTime = 0, started = false, intensity = 0, lockUntil = -1;
  let harpPhrase = null;

  function setLayer(name, v, when, tc) {
    if (v < 0.01 && target[name] >= 0.01) fadeUntil[name] = when + tc * 4;
    target[name] = v; const p = L[name].gain; p.cancelScheduledValues(when); p.setTargetAtTime(v, when, tc);
  }
  function setIntensity(x, when = ctx.currentTime) {
    if (when < lockUntil) return;
    const prev = intensity; intensity = x;
    if (Math.abs(prev - x) < 1e-3 && started) return;
    const combat = Math.min(1, Math.max(0, x)), climax = Math.min(1, Math.max(0, x - 1));
    const up = x > prev;
    setLayer('explore', 1 - 0.8 * combat, when, up ? 0.6 : 2.5);
    setLayer('combat', combat, when, up ? 0.35 : 2.5);
    setLayer('climax', climax, when, up ? 0.8 : 2);
  }
  function start(when) {
    if (started) return; started = true; nextTime = when + 0.1; step = 0;
    const p = L.explore.gain; p.setValueAtTime(0, when); target.explore = 1; p.setTargetAtTime(1, when, 1.5);
  }
  const active = (n, t) => target[n] > 0.01 || t < fadeUntil[n];

  function playStep(s, t) {
    const bar = Math.floor(s / BAR), st = s % BAR, ci = Math.floor(bar / 2) % 4, C = CHORDS[ci];
    const barInChord = bar % 2, cycleBar = bar % 8;
    // ---------- explore ----------
    if (active('explore', t)) {
      if (st === 0 && barInChord === 0) {
        const len = BAR * 2 * STEP;
        for (const m of C.pad) pad(H, L.explore, t, m, len - 0.2, 0.06, 1.6, 2.4, 1000);
        pad(H, L.explore, t, C.root - 12, len - 0.2, 0.03, 2, 2.4, 380);
      }
      // sparse modal harp phrases: occasionally an arpeggio, otherwise single notes
      if (st === 0) harpPhrase = Math.random() < 0.35 ? { start: pick([0, 4, 8]), n: 4 + ((Math.random() * 3) | 0), dir: Math.random() < 0.5 ? 1 : -1 } : null;
      if (harpPhrase && st >= harpPhrase.start && st < harpPhrase.start + harpPhrase.n * 2 && (st - harpPhrase.start) % 2 === 0) {
        const k = (st - harpPhrase.start) / 2, idx = harpPhrase.dir > 0 ? k : C.harp.length - 1 - k;
        pluck(H, L.explore, t + rand(0, 0.012), C.harp[Math.max(0, Math.min(C.harp.length - 1, idx))], 0.16, 2.4);
      } else if (!harpPhrase && st % 2 === 0 && Math.random() < 0.13) {
        pluck(H, L.explore, t + rand(0, 0.015), pick(C.harp) + (Math.random() < 0.2 ? 12 : 0), rand(0.09, 0.16), 2.6);
      }
    }
    // ---------- combat ----------
    const root = COMBAT_ROOTS[ci], third = ci === 3 ? 3 : C.third;
    if (active('combat', t)) {
      const out = L.combat;
      // taiko: big drum on a 3+3+2 feel, mid drums answer
      const big = { 0: 1, 6: 0.55, 8: 0.85, 11: 0.5, 14: 0.7 };
      if (big[st] !== undefined) drum(H, out, t, { freq: 54, decay: 0.9, vel: big[st] * 0.9, slap: 0.35 });
      if (st === 4 || st === 12) drum(H, out, t, { freq: 96, decay: 0.42, vel: 0.6, slap: 0.6 });
      if (st % 2 === 1 || st === 2 || st === 10) tick(H, out, t, st % 4 === 2 ? 0.14 : 0.06);
      if (cycleBar === 7 && st >= 12) drum(H, out, t, { freq: 100 + (st - 12) * 8, decay: 0.3, vel: 0.35 + (st - 12) * 0.12, slap: 0.6 });
      // ostinato strings (16ths), accents 3+3+2
      const pat = [0, 12, 7, 12, 0, 12, 7, 12 + third, 0, 12, 7, 12, 0, 12 + third, 7, 12];
      const acc = [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0][st];
      strings(H, out, t, root + pat[st], STEP * 0.7, acc ? 0.15 : 0.085, acc ? 0.6 : 0.3);
      // low strings: sustained root, re-bowed each chord
      if (st === 0 && barInChord === 0) {
        const len = BAR * 2 * STEP - 0.05;
        pad(H, out, t, root - 12, len, 0.08, 0.15, 0.5, 480);
      }
      // brass stabs on the second bar of each chord
      if (barInChord === 1 && (st === 0 || st === 3)) {
        for (const m of [root + 12, root + 12 + third, root + 19]) brass(H, out, t, m, st === 0 ? STEP * 2.2 : STEP * 1.6, st === 0 ? 0.42 : 0.32);
      }
    }
    // ---------- climax ----------
    if (active('climax', t)) {
      const out = L.climax;
      strings(H, out, t, root + 24 + [0, 7, 12, 7][st % 4] , STEP * 0.6, 0.06, 0.8);
      if (st % 4 === 2) drum(H, out, t, { freq: 72, decay: 0.5, vel: 0.5, slap: 0.4 });
      if (st === 15) drum(H, out, t, { freq: 120, decay: 0.25, vel: 0.4, slap: 0.7 });
      if (st === 0 && barInChord === 0) {
        const len = BAR * 2 * STEP;
        for (const m of [root + 12, root + 12 + third, root + 19]) choir(H, out, t, m, len - 0.6, 0.07);
        if (ci === 0) cymbal(H, out, t, 2.5, 0.08);
      }
      // brass counter-line (original): rising call on bar 2 of each chord
      if (barInChord === 1 && st === 8) brass(H, out, t, root + 24, STEP * 3, 0.38);
      if (barInChord === 1 && st === 11) brass(H, out, t, root + 24 + (ci % 2 ? 5 : 7), STEP * 5, 0.42);
    }
  }

  function schedule(until) {
    if (!started) return;
    if (nextTime < ctx.currentTime - 0.3) { nextTime = ctx.currentTime + 0.05; step = Math.ceil(step / BAR) * BAR; } // resync after a stall
    while (nextTime < until) { playStep(step, nextTime); step++; nextTime += STEP; }
  }

  // Victory: drop the battle layers, play a fanfare on the stinger bus, ease back to exploration.
  function victory(when = ctx.currentTime, playFanfare) {
    for (const n of ['combat', 'climax']) setLayer(n, 0, when, 0.4);
    setLayer('explore', 0, when, 0.4);
    playFanfare?.(L.sting, when + 0.6);
    // resolve on a long D major pad under the fanfare
    for (const m of [38, 50, 54, 57, 62, 66]) pad(H, L.sting, when + 0.6, m, 4.5, 0.035, 0.6, 3, 1400);
    lockUntil = when + 9; intensity = 0;
    setLayer('explore', 1, when + 6, 2);
  }

  return { start, schedule, setIntensity, victory, get intensity() { return intensity; }, layers: L, STEP };
}
