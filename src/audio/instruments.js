// Synthesized instruments shared by the score and the stingers/fanfares.
// Every function: (H, out, t, ...) schedules nodes at time t and connects to `out`.
import { mtof, cents, rand } from './core.js';

const TAU = Math.PI * 2;

function harpWave(ctx) {
  if (!ctx.__harpWave) {
    const n = 12, re = new Float32Array(n), im = new Float32Array(n);
    const amps = [0, 1, 0.42, 0.3, 0.12, 0.09, 0.04, 0.03, 0.015, 0.01, 0.006, 0.004];
    for (let i = 1; i < n; i++) im[i] = amps[i];
    ctx.__harpWave = ctx.createPeriodicWave(re, im);
  }
  return ctx.__harpWave;
}

// Membrane drum: pitch-dropping sine body + skin slap noise + a little overtone.
export function drum(H, out, t, { freq = 70, decay = 0.6, vel = 1, slap = 0.5, tone = 1 } = {}) {
  const ctx = H.ctx;
  const o = ctx.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(freq * 2.1, t);
  o.frequency.exponentialRampToValueAtTime(freq, t + 0.025);
  o.frequency.exponentialRampToValueAtTime(freq * 0.82, t + decay);
  const g = H.gain(0); H.perc(g.gain, t, 0.002, vel * tone, decay);
  o.connect(g); g.connect(out); o.start(t); o.stop(t + decay * 1.6 + 0.05);
  // second mode of the membrane (inharmonic) for a hollow, wooden body
  const o2 = H.osc('sine', freq * 1.59, t, decay * 0.5);
  const g2 = H.gain(0, out); H.perc(g2.gain, t, 0.002, vel * 0.22 * tone, decay * 0.35); o2.connect(g2);
  if (slap > 0) {
    const f = H.filter('lowpass', 900 + freq * 10, 0.8);
    const gs = H.gain(0, out); f.connect(gs); H.perc(gs.gain, t, 0.001, vel * slap, 0.05);
    H.noise('pink', t, 0.12, f);
  }
  return decay * 1.6;
}

// Rim / shime tick: bright woody click.
export function tick(H, out, t, vel = 0.4) {
  const f = H.filter('bandpass', rand(3000, 3800), 2.2);
  const g = H.gain(0, out); f.connect(g); H.perc(g.gain, t, 0.0005, vel, 0.035);
  H.noise('white', t, 0.06, f);
  const o = H.osc('triangle', 820, t, 0.05); const go = H.gain(0, out); o.connect(go); H.perc(go.gain, t, 0.0008, vel * 0.5, 0.03);
}

// Ensemble string note: detuned saws through an enveloped lowpass.
export function strings(H, out, t, midi, dur, vel = 0.5, bright = 0.5) {
  const f0 = mtof(midi);
  const lp = H.filter('lowpass', 500, 1.1);
  lp.frequency.setValueAtTime(500, t);
  lp.frequency.linearRampToValueAtTime(700 + bright * 2600, t + 0.012);
  lp.frequency.setTargetAtTime(600 + bright * 900, t + 0.015, dur * 0.5);
  const g = H.gain(0, out); lp.connect(g);
  H.asr(g.gain, t, 0.006, vel, dur, 0.09);
  for (const c of [-9, 8]) { const o = H.osc('sawtooth', f0 * cents(c), t, dur + 0.15, lp); o.detune.value = rand(-3, 3); }
  return dur + 0.2;
}

// Sustained pad (low strings + soft synth choir feel).
export function pad(H, out, t, midi, dur, vel = 0.2, att = 1.4, rel = 2.2, cutoff = 1100) {
  const f0 = mtof(midi);
  const lp = H.filter('lowpass', cutoff, 0.4);
  lp.frequency.setValueAtTime(cutoff * 0.5, t);
  lp.frequency.linearRampToValueAtTime(cutoff, t + att + dur * 0.4);
  const g = H.gain(0, out); lp.connect(g);
  H.asr(g.gain, t, att, vel, dur, rel);
  const end = dur + rel + 0.2;
  H.osc('sawtooth', f0 * cents(-7), t, end, lp);
  H.osc('sawtooth', f0 * cents(6), t, end, lp);
  const tri = H.osc('triangle', f0, t, end); const gt = H.gain(1.4, lp); tri.connect(gt);
  return end;
}

// Harp-like pluck in a modal scale.
export function pluck(H, out, t, midi, vel = 0.3, decay = 2.4) {
  const ctx = H.ctx, f0 = mtof(midi);
  const lp = H.filter('lowpass', 6000, 0.9);
  lp.frequency.setValueAtTime(6000, t); lp.frequency.exponentialRampToValueAtTime(900, t + 0.5);
  const g = H.gain(0, out); lp.connect(g); H.perc(g.gain, t, 0.002, vel, decay);
  for (const c of [0, 4]) {
    const o = ctx.createOscillator(); o.setPeriodicWave(harpWave(ctx)); o.frequency.value = f0 * cents(c);
    o.connect(lp); o.start(t); o.stop(t + decay * 1.5);
  }
  return decay * 1.5;
}

// Brass section: stacked saws, snappy "blat" filter envelope, gentle saturation.
export function brass(H, out, t, midi, dur, vel = 0.5) {
  const f0 = mtof(midi);
  const sat = H.shaper(out, 1.3);
  const lp = H.filter('lowpass', 300, 1.4);
  lp.frequency.setValueAtTime(300, t);
  lp.frequency.exponentialRampToValueAtTime(600 + vel * 3200, t + 0.06);
  lp.frequency.setTargetAtTime(500 + vel * 1300, t + 0.07, 0.2);
  lp.frequency.setTargetAtTime(300, t + dur, 0.06);
  const g = H.gain(0, sat.input); lp.connect(g);
  H.asr(g.gain, t, 0.025, vel * 0.5, dur, 0.18);
  const end = dur + 0.4;
  const oscs = [-7, 0, 6].map((c) => H.osc('sawtooth', f0 * cents(c), t, end, lp));
  if (dur > 0.5) { // delayed vibrato on held notes
    const lfo = H.osc('sine', 5.2, t, end); const d = H.gain(0); lfo.connect(d);
    d.gain.setValueAtTime(0, t + 0.25); d.gain.linearRampToValueAtTime(14, t + 0.8);
    for (const o of oscs) d.connect(o.detune);
  }
  return end;
}

// Wordless "ah" choir via formant filters.
export function choir(H, out, t, midi, dur, vel = 0.25) {
  const f0 = mtof(midi);
  const g = H.gain(0, out); H.asr(g.gain, t, 0.8, vel, dur, 1.2);
  const end = dur + 1.4;
  const sum = H.gain(1);
  for (const [f, q, a] of [[730, 7, 1], [1100, 9, 0.55], [2650, 12, 0.3]]) {
    const bp = H.filter('bandpass', f, q); sum.connect(bp); const ga = H.gain(a * 2.2, g); bp.connect(ga);
  }
  const lfo = H.osc('sine', 5, t, end); const ld = H.gain(14); lfo.connect(ld);
  for (const c of [-11, 0, 10]) { const o = H.osc('sawtooth', f0 * cents(c), t, end, sum); ld.connect(o.detune); }
  return end;
}

// Cymbal / gong wash. swell=true: reverse-style crescendo ending at t+dur.
export function cymbal(H, out, t, dur = 2, vel = 0.3, swell = false) {
  const hp = H.filter('highpass', 5200, 0.7); const bp = H.filter('peaking', 8500, 1.2); bp.gain.value = 6;
  hp.connect(bp); const g = H.gain(0, out); bp.connect(g);
  if (swell) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vel, t + dur); g.gain.setTargetAtTime(0, t + dur, 0.03); }
  else H.perc(g.gain, t, 0.002, vel, dur);
  H.noise('white', t, dur + 0.3, hp);
  return dur + 0.3;
}

export { TAU };
