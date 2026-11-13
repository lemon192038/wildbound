// Procedural sound effects. Each recipe: (H, out, t, p) -> duration (seconds).
// p: {strength, crit, duration, pitch, size} – every play is randomised.
import { rand, clamp, cents, mtof } from './core.js';
import { drum, brass, cymbal, pluck } from './instruments.js';

// Scatter short bursts over [t0,t1] on a gain param (crackle, debris, sparks).
function blips(param, t0, t1, count, amp, { width = 0.004, fall = 2 } = {}) {
  param.setValueAtTime(0, t0);
  const times = [];
  for (let i = 0; i < count; i++) times.push(t0 + Math.pow(Math.random(), fall) * (t1 - t0));
  times.sort((a, b) => a - b);
  for (const tt of times) {
    const k = 1 - (tt - t0) / (t1 - t0 + 1e-6);
    param.setValueAtTime(amp * (0.25 + 0.75 * Math.random()) * (0.3 + 0.7 * k), tt);
    param.setTargetAtTime(0, tt + 0.0005, width * rand(0.6, 1.6));
  }
}

// Pitch-dropping sine thump (the "weight" of any heavy sound).
function thump(H, out, t, f1, f2, glide, amp, dec, drive = 0) {
  const o = H.osc('sine', f1, t, dec * 1.5);
  o.frequency.setValueAtTime(f1, t); o.frequency.exponentialRampToValueAtTime(f2, t + glide);
  let dest = out;
  if (drive) { const s = H.shaper(out, drive); dest = s.input; }
  const g = H.gain(0, dest); o.connect(g); H.perc(g.gain, t, 0.003, amp, dec);
}

function noiseBurst(H, out, t, kind, type, freq, q, a, amp, dec, rate = 1) {
  const f = H.filter(type, freq, q); const g = H.gain(0, out); f.connect(g);
  H.perc(g.gain, t, a, amp, dec); H.noise(kind, t, a + dec * 1.3, f, rate); return f;
}

function sweep(H, out, t, dur, f0, f1, f2, q, amp, kind = 'pink') {
  const bp = H.filter('bandpass', f0, q), bp2 = H.filter('bandpass', f0, q * 0.7);
  for (const b of [bp2]) { b.frequency.setValueAtTime(f0, t); b.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.45); b.frequency.exponentialRampToValueAtTime(f2, t + dur); }
  bp.frequency.setValueAtTime(f0, t);
  bp.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.45);
  bp.frequency.exponentialRampToValueAtTime(f2, t + dur);
  const g = H.gain(0, out); bp.connect(bp2); bp2.connect(g);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(amp * 0.35, t + dur * 0.25);
  g.gain.linearRampToValueAtTime(amp, t + dur * 0.45);
  g.gain.setTargetAtTime(0, t + dur * 0.5, dur * 0.18);
  H.noise(kind, t, dur * 1.3, bp);
  return bp;
}

export const recipes = {
  whoosh(H, out, t, p) {
    const s = p.size || 1, dur = rand(0.22, 0.3) * s;
    sweep(H, out, t, dur, rand(280, 420), rand(1600, 2600) * (p.pitch || 1), rand(500, 750), 2.2, 6);
    const air = H.filter('highpass', 4500, 0.7); const ga = H.gain(0, out); air.connect(ga);
    ga.gain.setValueAtTime(0, t); ga.gain.linearRampToValueAtTime(0.18, t + dur * 0.45); ga.gain.setTargetAtTime(0, t + dur * 0.5, dur * 0.12);
    H.noise('white', t, dur * 1.2, air);
    return dur * 1.6;
  },

  // Heavy flesh / armor impact; strength 0..1, crit adds bright layers.
  // p.weak (soft weak spot: wetter, bone crack), p.armor (hard plate: dull knock + grit),
  // p.power 0..3 (charge level: 3 adds a sub boom, longer crunch and a splitting crack)
  impact(H, out, t, p) {
    const s = clamp(p.strength ?? 0.6, 0.1, 1), crit = !!p.crit, pw = clamp(p.power ?? 0, 0, 3);
    if (p.weak) { // bone crack + wet tear
      const cs = H.shaper(out, 3); noiseBurst(H, cs.input, t + 0.004, 'white', 'bandpass', rand(1500, 2100), 1.4, 0.0004, 1.4, 0.03);
      noiseBurst(H, out, t + 0.01, 'pink', 'bandpass', rand(400, 550), 2, 0.004, 1.3, 0.14);
    }
    if (p.armor) { // dull plate knock: inharmonic low partials, no ring
      for (const [f, a] of [[rand(310, 360), 0.35], [rand(820, 900), 0.2], [rand(1500, 1700), 0.1]]) { const o = H.osc('triangle', f, t, 0.3); const go = H.gain(0, out); o.connect(go); H.perc(go.gain, t, 0.0008, a, 0.16); }
      noiseBurst(H, out, t, 'white', 'bandpass', 3500, 1.5, 0.0005, 0.8, 0.03);
    }
    if (pw >= 2) { // charged blow: extra weight
      thump(H, out, t, 95, 30, 0.35, 0.5 + 0.25 * (pw - 2), 0.45 + 0.2 * (pw - 2), 1.5);
      if (pw >= 3) {
        const post3 = H.gain(2.4, out), sat3 = H.shaper(post3, 5);
        const b3 = H.filter('bandpass', rand(1200, 1700), 1.2); const g3 = H.gain(0, sat3.input); b3.connect(g3);
        blips(g3.gain, t + 0.003, t + 0.22, 30, 1, { width: 0.006, fall: 1.8 }); H.noise('white', t, 0.3, b3);
        noiseBurst(H, out, t, 'brown', 'lowpass', 220, 0.8, 0.003, 1.6, 0.5);
      }
    }
    thump(H, out, t, rand(115, 145), rand(45, 55), 0.12, 0.7 + 0.5 * s, 0.14 + 0.14 * s, 1.6);
    if (s > 0.55) thump(H, out, t, 75, 38, 0.2, 0.55 * s, 0.28);
    // wet smack
    noiseBurst(H, out, t, 'pink', 'lowpass', rand(1300, 2000), 1.2, 0.001, 0.9 + 0.4 * s, 0.07 + 0.05 * s);
    // armor/bone crunch: crackle through a mid band, saturated
    const post = H.gain(2.2, out), sat = H.shaper(post, 4);
    const bp = H.filter('bandpass', rand(1800, 2800), 1.1); const g = H.gain(0, sat.input); bp.connect(g);
    blips(g.gain, t + 0.002, t + 0.06 + 0.06 * s, 8 + ((10 * s) | 0), 1, { width: 0.005, fall: 1.6 });
    noiseBurst(H, out, t, 'pink', 'bandpass', rand(700, 1000), 1.2, 0.001, 1.6, 0.05); // mid slap
    H.noise('white', t, 0.2, bp);
    if (crit) {
      noiseBurst(H, out, t, 'white', 'highpass', 4500, 0.7, 0.0005, 1.4, 0.1);
      for (const [f, a, d] of [[rand(2600, 3000), 0.22, 0.4], [rand(4100, 4500), 0.15, 0.3], [6900, 0.08, 0.18]]) {
        const o = H.osc('sine', f, t, d * 1.5); const go = H.gain(0, out); o.connect(go); H.perc(go.gain, t, 0.001, a, d);
      }
    }
    return 0.9;
  },

  clang(H, out, t, p) {
    const f0 = rand(480, 720) * (p.pitch || 1);
    const ratios = [1, 2.76, 5.4, 8.93, 13.34], amps = [1, 0.6, 0.42, 0.3, 0.18], decs = [1.3, 0.9, 0.6, 0.4, 0.25];
    ratios.forEach((r, i) => {
      for (const dt of i === 0 ? [0, 2.7] : [0]) {
        const o = H.osc('sine', f0 * r * rand(0.995, 1.005) + dt, t, decs[i] * 1.5);
        const g = H.gain(0, out); o.connect(g); H.perc(g.gain, t, 0.0008, amps[i] * 0.16, decs[i]);
      }
    });
    noiseBurst(H, out, t, 'white', 'highpass', 2800, 0.7, 0.0005, 0.9, 0.035);
    // sparks
    const bp = H.filter('bandpass', rand(6000, 8500), 1.5); const g = H.gain(0, out); bp.connect(g);
    blips(g.gain, t + 0.01, t + 0.4, 14, 0.5, { width: 0.003, fall: 1.8 });
    H.noise('white', t, 0.5, bp);
    return 1.6;
  },

  footstep(H, out, t, p) {
    const v = p.strength ?? 1;
    noiseBurst(H, out, t, 'pink', 'bandpass', rand(700, 1100), 0.8, 0.002, 0.6 * v, 0.05);
    thump(H, out, t, rand(90, 110), 60, 0.04, 0.12 * v, 0.05);
    const t2 = t + rand(0.035, 0.07);
    noiseBurst(H, out, t2, 'pink', 'bandpass', rand(1100, 1600), 0.9, 0.003, 0.35 * v, 0.04);
    // grass rustle
    const bp = H.filter('bandpass', rand(3200, 5200), 1.4); const g = H.gain(0, out); bp.connect(g);
    blips(g.gain, t + 0.005, t + rand(0.09, 0.14), 11, 1.1 * v, { width: 0.008, fall: 1.2 });
    H.noise('white', t, 0.2, bp);
    return 0.3;
  },

  monsterStep(H, out, t, p) {
    const s = p.strength ?? 1;
    thump(H, out, t, rand(52, 62), rand(25, 29), 0.4, 1.1 * s, 0.75, 1.4);
    noiseBurst(H, out, t, 'brown', 'lowpass', 190, 0.9, 0.006, 1.6 * s, 0.5);
    noiseBurst(H, out, t, 'pink', 'lowpass', 900, 0.9, 0.001, 0.45 * s, 0.07);
    for (const [f, amp, n] of [[rand(2200, 3200), 0.4, 22], [rand(900, 1400), 0.45, 14]]) {
      const bp = H.filter('bandpass', f, 1.2); const g = H.gain(0, out); bp.connect(g);
      blips(g.gain, t + 0.06, t + rand(0.6, 0.8), n, amp * s, { width: 0.006, fall: 2.2 });
      H.noise('white', t, 0.9, bp);
    }
    return 1.4;
  },

  // Enormous roar: formant-filtered detuned saw stack + sub + noise rasp, growl modulation.
  // Beast roar: a clean, pitched vocal source (detuned saws + sub-octave) driven
  // through a moving vocal-tract formant bank. Pitch contour is the main gesture;
  // growl texture comes from subharmonic AM flutter, not broadband distortion.
  // p.dying: falling death cry, p.rise: rising build-up (telegraph).
  roar(H, out, t, p) {
    const ctx = H.ctx, dying = !!p.dying, rise = !!p.rise;
    const D = rand(2.4, 3.0) * (p.length || 1), f0 = rand(82, 92) * (p.pitch || 1);
    const pc = ctx.createConstantSource(); pc.offset.value = 0; pc.start(t); pc.stop(t + D + 0.3);
    const po = pc.offset; // pitch contour in cents
    if (dying) { po.setValueAtTime(400, t); po.linearRampToValueAtTime(600, t + 0.25 * D); po.linearRampToValueAtTime(-1000, t + D); }
    else if (rise) { po.setValueAtTime(-900, t); po.linearRampToValueAtTime(-300, t + 0.6 * D); po.linearRampToValueAtTime(400, t + D); }
    else {
      po.setValueAtTime(-800, t); po.linearRampToValueAtTime(500, t + 0.3 * D);
      po.linearRampToValueAtTime(300, t + 0.65 * D); po.linearRampToValueAtTime(-1100, t + D);
    }
    // slow, natural wobble (not a buzz) on pitch
    const vib = H.osc('sine', rand(5, 7), t, D + 0.2), vd = H.gain(18); vib.connect(vd);
    const jit = H.osc('triangle', rand(11, 14), t, D + 0.2), jd = H.gain(10); jit.connect(jd);
    // growl: amplitude flutter at a subharmonic-ish rate (vocal-fry rattle)
    const am = H.gain(0.75); const amL = H.osc('sine', rand(30, 38), t, D + 0.2), amD = H.gain(0.25); amL.connect(amD); amD.connect(am.gain);

    const env = H.gain(0); env.connect(am);
    env.gain.setValueAtTime(0, t);
    if (rise) { env.gain.linearRampToValueAtTime(0.3, t + 0.15); env.gain.linearRampToValueAtTime(1, t + 0.85 * D); env.gain.linearRampToValueAtTime(0, t + D); }
    else { env.gain.linearRampToValueAtTime(0.3, t + 0.1); env.gain.linearRampToValueAtTime(1, t + 0.32 * D); env.gain.linearRampToValueAtTime(0.6, t + 0.75 * D); env.gain.linearRampToValueAtTime(0, t + D); }
    const mk = (type, mult, c, dest = env) => { const o = H.osc(type, f0 * mult * cents(c), t, D + 0.2, dest); pc.connect(o.detune); vd.connect(o.detune); jd.connect(o.detune); return o; };
    for (const c of [-6, 0, 6]) mk('sawtooth', 1, c);
    const subG = H.gain(0.6, env); mk('triangle', 0.5, 0, subG); // sub-octave body inside the voice

    // breath: much quieter than before so the pitch reads through
    const nEnv = H.gain(0); nEnv.connect(am);
    nEnv.gain.setValueAtTime(0, t); nEnv.gain.linearRampToValueAtTime(0.18, t + 0.3 * D); nEnv.gain.linearRampToValueAtTime(0, t + D + 0.1);
    H.noise('pink', t, D + 0.3, nEnv);

    // gentle saturation only (warmth), then formants: closed "oo" -> wide "aa" -> "uh"
    const sat = H.shaper(null, 0.9); am.connect(sat.input);
    const F = [[[320, 820, 560], 9, 1.0], [[650, 1300, 950], 11, 0.75], [[2300, 2700, 2400], 14, 0.3], [[3400, 3700, 3500], 14, 0.15]];
    for (const [[a, b, c], q, amp] of F) {
      const bp = H.filter('bandpass', a, q);
      bp.frequency.setValueAtTime(a, t); bp.frequency.linearRampToValueAtTime(b, t + 0.3 * D);
      bp.frequency.linearRampToValueAtTime(b * 0.92, t + 0.7 * D); bp.frequency.linearRampToValueAtTime(c, t + D);
      sat.output.connect(bp); bp.connect(H.gain(amp * 5.5, out));
    }
    const chest = H.filter('lowpass', 380, 0.9); sat.output.connect(chest); chest.connect(H.gain(0.7, out));
    // clean sub-octave that follows the contour (weight in the chest)
    const sub = H.osc('sine', f0 * 0.5, t, D + 0.2); pc.connect(sub.detune);
    const gs = H.gain(0, out); sub.connect(gs);
    gs.gain.setValueAtTime(0, t); gs.gain.linearRampToValueAtTime(0.5, t + 0.3 * D); gs.gain.linearRampToValueAtTime(0.35, t + 0.75 * D); gs.gain.linearRampToValueAtTime(0, t + D);
    if (!rise) thump(H, out, t + 0.05, 80, 32, 0.3, 0.45, 0.6);
    return D + 0.5;
  },

  // rising growl telegraph (leap slam wind-up)
  growlRise(H, out, t, p) { return recipes.roar(H, out, t, { ...p, rise: true, length: rand(0.42, 0.5), pitch: rand(0.85, 0.95) }); },

  // jaw creak telegraph (bite): accelerating creak clicks through bony resonances + low rumble
  jawCreak(H, out, t, p) {
    const D = rand(0.38, 0.48);
    const sum = H.gain(1);
    for (const [f, q, a] of [[rand(450, 600), 7, 1], [rand(1200, 1500), 9, 0.6], [2600, 10, 0.25]]) { const bp = H.filter('bandpass', f, q); sum.connect(bp); bp.connect(H.gain(a * 10, out)); }
    const src = H.gain(0, sum); H.noise('white', t, D + 0.1, src);
    let tt = t, gap = 0.045;
    src.gain.setValueAtTime(0, t);
    while (tt < t + D) { const k = (tt - t) / D; src.gain.setValueAtTime(0.5 + 0.5 * k, tt); src.gain.setTargetAtTime(0, tt + 0.0005, 0.0025); tt += gap * rand(0.8, 1.2); gap = Math.max(0.012, gap * 0.9); }
    const o = H.osc('sawtooth', rand(55, 62), t, D + 0.2); const lp = H.filter('lowpass', 260, 1); o.connect(lp);
    const g = H.gain(0, out); lp.connect(g); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.22, t + D); g.gain.setTargetAtTime(0, t + D, 0.05);
    return D + 0.3;
  },

  // charge telegraph: heavy forefoot scrape in the dirt
  scrape(H, out, t, p) {
    const D = rand(0.45, 0.6);
    const bp = H.filter('bandpass', 700, 1.1); const g = H.gain(0, out); bp.connect(g);
    bp.frequency.setValueAtTime(1100, t); bp.frequency.exponentialRampToValueAtTime(380, t + D);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1.2, t + 0.04); g.gain.linearRampToValueAtTime(0, t + D);
    H.noise('pink', t, D + 0.1, bp);
    const r = H.filter('bandpass', 2600, 1.2); const gr = H.gain(0, out); r.connect(gr);
    blips(gr.gain, t, t + D + 0.2, 26, 0.6, { width: 0.005, fall: 1.4 }); H.noise('white', t, D + 0.4, r);
    thump(H, out, t, 70, 40, 0.15, 0.4, 0.25);
    return D + 0.5;
  },

  bite(H, out, t, p) {
    noiseBurst(H, out, t, 'white', 'highpass', 1800, 0.7, 0.0004, 2.2, 0.03);
    thump(H, out, t, rand(190, 230), 65, 0.08, 0.7, 0.1, 1.5);
    const sq = H.osc('square', rand(1000, 1250), t, 0.05); const bp = H.filter('bandpass', 1500, 3); sq.connect(bp);
    const g = H.gain(0, out); bp.connect(g); H.perc(g.gain, t, 0.0005, 0.8, 0.035);
    noiseBurst(H, out, t + 0.002, 'pink', 'lowpass', 700, 1, 0.002, 0.6, 0.12);
    const t2 = t + rand(0.03, 0.045);
    noiseBurst(H, out, t2, 'white', 'bandpass', 2600, 1.2, 0.0004, 0.6, 0.02);
    return 0.5;
  },

  tail(H, out, t, p) {
    const dur = rand(0.55, 0.7) * (p.size || 1);
    sweep(H, out, t, dur, rand(140, 180), rand(900, 1200), rand(220, 280), 1.5, 4);
    const lp = H.filter('lowpass', 320, 0.8); const g = H.gain(0, out); lp.connect(g);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1.2, t + dur * 0.5); g.gain.setTargetAtTime(0, t + dur * 0.55, dur * 0.2);
    H.noise('brown', t, dur * 1.3, lp);
    return dur * 1.6;
  },

  slam(H, out, t, p) {
    const s = p.strength ?? 1;
    thump(H, out, t, 72, 24, 0.85, 1.2 * s, 1.4, 1.6);
    noiseBurst(H, out, t, 'brown', 'lowpass', 260, 0.8, 0.003, 2 * s, 0.9);
    const crack = noiseBurst(H, out, t, 'white', 'lowpass', 3200, 0.7, 0.0005, 0.9 * s, 0.05);
    for (const [f, amp, n, t1] of [[rand(2000, 3000), 0.45, 34, 1.2], [rand(800, 1200), 0.5, 22, 0.9]]) {
      const bp = H.filter('bandpass', f, 1.1); const g = H.gain(0, out); bp.connect(g);
      blips(g.gain, t + 0.08, t + t1, n, amp * s, { width: 0.007, fall: 2 });
      H.noise('white', t, t1 + 0.2, bp);
    }
    const dust = H.filter('bandpass', 1400, 0.6); const gd = H.gain(0, out); dust.connect(gd);
    gd.gain.setValueAtTime(0, t + 0.04); gd.gain.linearRampToValueAtTime(0.25 * s, t + 0.2); gd.gain.setTargetAtTime(0, t + 0.25, 0.4);
    H.noise('pink', t, 2, dust);
    return 2.2;
  },

  // Roaring fire breath (duration p.duration, default 2.2s, max 8s).
  fire(H, out, t, p) {
    const D = clamp(p.duration ?? 2.2, 0.4, 8);
    const env = (g, peak, a = 0.15, r = 0.45) => { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.setValueAtTime(peak, t + D); g.gain.linearRampToValueAtTime(0, t + D + r); };
    const lp = H.filter('lowpass', 500, 1.5);
    lp.frequency.setValueAtTime(180, t); lp.frequency.exponentialRampToValueAtTime(1400, t + 0.15);
    for (let tt = t + 0.18; tt < t + D; tt += rand(0.06, 0.12)) lp.frequency.setTargetAtTime(rand(450, 1100), tt, 0.04);
    const sat = H.shaper(out, 1.5);
    const g1 = H.gain(0, sat.input); lp.connect(g1); env(g1, 1.4); H.noise('brown', t, D + 0.6, lp);
    const bp = H.filter('bandpass', 1300, 0.7); const g2 = H.gain(0, out); bp.connect(g2); env(g2, 0.45); H.noise('pink', t, D + 0.6, bp);
    const hp = H.filter('highpass', 6500, 0.7); const g3 = H.gain(0, out); hp.connect(g3); env(g3, 0.06); H.noise('white', t, D + 0.6, hp);
    // crackle
    const cr = H.filter('highpass', 2400, 0.7); const g4 = H.gain(0, out); cr.connect(g4);
    blips(g4.gain, t + 0.1, t + D + 0.3, Math.round(D * 18), 0.45, { width: 0.002, fall: 1 });
    H.noise('white', t, D + 0.6, cr);
    // ignition "fwoomp"
    thump(H, out, t, 90, 40, 0.2, 0.6, 0.35);
    return D + 0.8;
  },

  roll(H, out, t, p) {
    const D = rand(0.42, 0.52);
    const bp = H.filter('bandpass', rand(1800, 2600), 0.9); const g = H.gain(0, out); bp.connect(g);
    g.gain.setValueAtTime(0, t);
    for (let tt = t; tt < t + D; tt += rand(0.012, 0.03)) {
      const k = Math.sin(Math.PI * (tt - t) / D);
      g.gain.setTargetAtTime(k * rand(0.15, 0.6), tt, 0.006);
    }
    g.gain.setTargetAtTime(0, t + D, 0.02);
    H.noise('white', t, D + 0.2, bp);
    // body whoosh
    const lp = H.filter('lowpass', 700, 0.7); const gw = H.gain(0, out); lp.connect(gw);
    gw.gain.setValueAtTime(0, t); gw.gain.linearRampToValueAtTime(0.6, t + D * 0.4); gw.gain.linearRampToValueAtTime(0, t + D);
    H.noise('pink', t, D + 0.1, lp);
    thump(H, out, t + 0.02, 120, 60, 0.07, 0.25, 0.09);
    // landing scuff in grass
    const tl = t + D * rand(0.7, 0.85);
    noiseBurst(H, out, tl, 'pink', 'bandpass', 650, 0.8, 0.003, 0.45, 0.08);
    const r = H.filter('bandpass', 4200, 1.3); const gr = H.gain(0, out); r.connect(gr);
    blips(gr.gain, tl, tl + 0.12, 8, 0.25, { width: 0.008, fall: 1 }); H.noise('white', tl, 0.2, r);
    return D + 0.4;
  },

  potion(H, out, t, p) {
    for (const [f, a, d] of [[rand(2550, 2750), 0.09, 0.3], [rand(3850, 4050), 0.06, 0.2], [5800, 0.03, 0.1]]) {
      const o = H.osc('sine', f, t, d * 1.5); const g = H.gain(0, out); o.connect(g); H.perc(g.gain, t, 0.001, a, d);
    }
    let tt = t + rand(0.22, 0.3);
    for (let i = 0; i < 3; i++) {
      const o = H.osc('sine', 170, tt, 0.25); o.frequency.setValueAtTime(rand(150, 190), tt); o.frequency.exponentialRampToValueAtTime(rand(380, 460), tt + 0.07);
      const lp = H.filter('lowpass', 900, 1); o.connect(lp); const g = H.gain(0, out); lp.connect(g); H.perc(g.gain, tt, 0.006, 0.5, 0.12);
      noiseBurst(H, out, tt, 'pink', 'bandpass', 420, 2, 0.004, 0.35, 0.1);
      tt += rand(0.3, 0.4);
    }
    for (let i = 0; i < 6; i++) {
      const bt = t + rand(0.25, 1.2), f = rand(600, 1400);
      const o = H.osc('sine', f, bt, 0.05); o.frequency.setValueAtTime(f, bt); o.frequency.exponentialRampToValueAtTime(f * 1.8, bt + 0.03);
      const g = H.gain(0, out); o.connect(g); H.perc(g.gain, bt, 0.002, 0.06, 0.03);
    }
    // relieved exhale + soft healing shimmer
    const ex = H.filter('bandpass', 1100, 0.8); const ge = H.gain(0, out); ex.connect(ge); H.asr(ge.gain, tt + 0.05, 0.08, 0.12, 0.2, 0.2); H.noise('pink', tt, 0.6, ex);
    [79, 83, 86, 91].forEach((m, i) => pluck(H, out, tt + 0.08 + i * 0.07, m, 0.05, 0.9));
    return tt - t + 1.4;
  },

  partBreak(H, out, t, p) {
    const sat = H.shaper(out, 3);
    noiseBurst(H, sat.input, t, 'white', 'highpass', 900, 0.6, 0.0003, 1.1, 0.04);
    thump(H, out, t, 150, 48, 0.18, 1, 0.3, 1.5);
    const bp = H.filter('bandpass', rand(1500, 2200), 1.5); const g = H.gain(0, out); bp.connect(g);
    blips(g.gain, t + 0.015, t + 0.4, 28, 1.8, { width: 0.004, fall: 1.7 }); H.noise('white', t, 0.5, bp);
    noiseBurst(H, out, t, 'pink', 'bandpass', rand(550, 700), 8, 0.001, 1.4, 0.25); // woody/bony knock
    const o = H.osc('triangle', 330, t, 0.3); o.frequency.exponentialRampToValueAtTime(180, t + 0.2);
    const go = H.gain(0, out); o.connect(go); H.perc(go.gain, t, 0.001, 0.25, 0.2);
    // reward ring so breaking a part reads clearly
    for (const [f, a] of [[1568, 0.05], [2349, 0.035]]) { const r = H.osc('sine', f, t + 0.05, 0.9); const gr = H.gain(0, out); r.connect(gr); H.perc(gr.gain, t + 0.05, 0.003, a, 0.6); }
    return 1.2;
  },

  hurt(H, out, t, p) {
    const s = clamp(p.strength ?? 0.6, 0.2, 1);
    recipes.impact(H, out, t, { strength: s * 0.8 });
    // short breathy grunt
    const o = H.osc('sawtooth', rand(150, 170), t + 0.02, 0.25); o.frequency.exponentialRampToValueAtTime(105, t + 0.2);
    const env = H.gain(0); o.connect(env); H.asr(env.gain, t + 0.02, 0.015, 0.5, 0.1, 0.08);
    const n = H.noise('pink', t + 0.02, 0.25); n.connect(env);
    for (const [f, q, a] of [[620, 6, 1], [1050, 8, 0.6], [2500, 10, 0.25]]) { const bp = H.filter('bandpass', f, q); env.connect(bp); bp.connect(H.gain(a * 0.8, out)); }
    return 0.9;
  },

  click(H, out, t, p) {
    const o = H.osc('sine', 1500, t, 0.05); o.frequency.exponentialRampToValueAtTime(1050, t + 0.02);
    const g = H.gain(0, out); o.connect(g); H.perc(g.gain, t, 0.001, 0.3, 0.04);
    noiseBurst(H, out, t, 'white', 'highpass', 4000, 0.7, 0.0005, 0.2, 0.01);
    return 0.12;
  },

  // Quest complete: short original brass flourish over timpani + cymbal.
  fanfare(H, out, t, p) {
    const q = 0.16;
    const line = [[57, 0, 1], [62, 1, 1], [66, 2, 1], [69, 3, 3.2]];
    for (const [m, s, l] of line) brass(H, out, t + s * q, m + 12, l * q * 0.92, 0.55);
    const chords = [[[67, 71, 74], 7, 2.6], [[69, 73, 76], 10, 2.6], [[62, 66, 69, 74], 13, 12]];
    for (const [notes, s, l] of chords) for (const m of notes) brass(H, out, t + s * q, m, l * q, 0.42);
    brass(H, out, t + 13 * q, 50, 12 * q, 0.5);
    drum(H, out, t + 7 * q, { freq: 98, decay: 0.7, vel: 0.7 });
    drum(H, out, t + 10 * q, { freq: 110, decay: 0.7, vel: 0.7 });
    for (let i = 0; i < 6; i++) drum(H, out, t + 11.5 * q + i * q * 0.25, { freq: 73, decay: 0.4, vel: 0.25 + i * 0.07, slap: 0.2 });
    drum(H, out, t + 13 * q, { freq: 73, decay: 1.4, vel: 1 });
    cymbal(H, out, t + 10 * q, 3 * q, 0.12, true);
    cymbal(H, out, t + 13 * q, 2.5, 0.18);
    return 13 * q + 12 * q + 1.2;
  },

  // --- roar variants ---
  growl(H, out, t, p) { return recipes.roar(H, out, t, { ...p, length: rand(0.38, 0.48), pitch: rand(0.8, 0.9) }); },
  monsterHurt(H, out, t, p) { return recipes.roar(H, out, t, { ...p, dying: true, length: rand(0.3, 0.38), pitch: rand(1.25, 1.45) }); },

  snort(H, out, t, p) { // two nasal puffs
    for (const [o, a] of [[0, 1], [rand(0.16, 0.22), 0.7]]) {
      const bp = H.filter('bandpass', rand(500, 700), 2.2); const g = H.gain(0, out); bp.connect(g);
      H.asr(g.gain, t + o, 0.02, 1.4 * a, 0.08, 0.12); H.noise('pink', t + o, 0.3, bp);
      thump(H, out, t + o, 90, 55, 0.1, 0.3 * a, 0.15);
    }
    return 0.7;
  },

  skid(H, out, t, p) { // heavy body skidding through dirt
    const D = rand(0.7, 0.9);
    const bp = H.filter('bandpass', 500, 0.9); const g = H.gain(0, out); bp.connect(g);
    bp.frequency.setValueAtTime(800, t); bp.frequency.exponentialRampToValueAtTime(300, t + D);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1.3, t + 0.05); g.gain.linearRampToValueAtTime(0, t + D);
    H.noise('brown', t, D + 0.1, bp);
    const r = H.filter('bandpass', 2400, 1.2); const gr = H.gain(0, out); r.connect(gr);
    blips(gr.gain, t, t + D, 40, 0.5, { width: 0.005, fall: 1.3 }); H.noise('white', t, D + 0.1, r);
    return D + 0.3;
  },

  leap(H, out, t, p) { // wing/body heave into the air
    recipes.tail(H, out, t, { size: 1.3 });
    thump(H, out, t, 70, 35, 0.25, 0.7, 0.4, 1.3);
    return 1.2;
  },

  inhale(H, out, t, p) { // deep intake before fire breath: rising, building
    const D = 0.95;
    const bp = H.filter('bandpass', 300, 1.4); const g = H.gain(0, out); bp.connect(g);
    bp.frequency.setValueAtTime(250, t); bp.frequency.exponentialRampToValueAtTime(1400, t + D);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(1.2, t + D); g.gain.setTargetAtTime(0, t + D, 0.04);
    H.noise('pink', t, D + 0.2, bp);
    const lp = H.filter('lowpass', 200, 0.8); const gl = H.gain(0, out); lp.connect(gl);
    gl.gain.setValueAtTime(0, t); gl.gain.linearRampToValueAtTime(0.8, t + D); gl.gain.setTargetAtTime(0, t + D, 0.05);
    H.noise('brown', t, D + 0.2, lp);
    return D + 0.3;
  },

  thud(H, out, t, p) { return recipes.slam(H, out, t, { strength: 0.6 }); },

  whetstone(H, out, t, p) { // one stone stroke along the blade
    const D = rand(0.16, 0.22);
    const bp = H.filter('bandpass', rand(3500, 4500), 2); const g = H.gain(0, out); bp.connect(g);
    bp.frequency.setValueAtTime(rand(3000, 3600), t); bp.frequency.linearRampToValueAtTime(rand(4800, 5600), t + D);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.9, t + 0.03); g.gain.linearRampToValueAtTime(0.5, t + D * 0.8); g.gain.linearRampToValueAtTime(0, t + D);
    H.noise('white', t, D + 0.05, bp);
    const o = H.osc('sine', rand(2900, 3300), t, 0.3); const go = H.gain(0, out); o.connect(go); H.perc(go.gain, t + D * 0.7, 0.01, 0.03, 0.2);
    return D + 0.3;
  },

  draw(H, out, t, p) { // blade leaving the sheath: rising metallic scrape + ring
    const D = 0.32;
    const bp = H.filter('bandpass', 2500, 4); const g = H.gain(0, out); bp.connect(g);
    bp.frequency.setValueAtTime(1800, t); bp.frequency.exponentialRampToValueAtTime(6000, t + D);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + D * 0.8); g.gain.setTargetAtTime(0, t + D, 0.02);
    H.noise('white', t, D + 0.1, bp);
    for (const [f, a] of [[1870, 0.05], [3120, 0.035], [4950, 0.02]]) { const o = H.osc('sine', f * rand(0.98, 1.02), t + D, 0.9); const go = H.gain(0, out); o.connect(go); H.perc(go.gain, t + D, 0.002, a, 0.7); }
    return D + 1;
  },

  sheathe(H, out, t, p) { // falling scrape + soft clack
    const D = 0.28;
    const bp = H.filter('bandpass', 4500, 3.5); const g = H.gain(0, out); bp.connect(g);
    bp.frequency.setValueAtTime(5000, t); bp.frequency.exponentialRampToValueAtTime(1600, t + D);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.8, t + 0.03); g.gain.linearRampToValueAtTime(0, t + D);
    H.noise('white', t, D + 0.1, bp);
    noiseBurst(H, out, t + D, 'pink', 'bandpass', 1400, 2, 0.001, 0.6, 0.04);
    return D + 0.2;
  },

  charge(H, out, t, p) { // charge level-up: rising shimmer, brighter per level
    const lvl = clamp(p.level ?? 1, 1, 3), base = [0, 62, 66, 69][lvl];
    [0, 7, 12].forEach((iv, i) => pluck(H, out, t + i * 0.045, base + iv + 12, 0.12 + lvl * 0.03, 0.6));
    const bp = H.filter('bandpass', 1200, 3); const g = H.gain(0, out); bp.connect(g);
    bp.frequency.setValueAtTime(800, t); bp.frequency.exponentialRampToValueAtTime(3000 + lvl * 1500, t + 0.25);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.4, t + 0.2); g.gain.setTargetAtTime(0, t + 0.22, 0.05);
    H.noise('white', t, 0.4, bp);
    return 0.9;
  },
};

// alias names other modules may emit through the 'sfx' event
export const aliases = {
  swing: 'whoosh', slash: 'whoosh', swingHeavy: 'whoosh', swoosh: 'tail', monsterBreath: 'fire', attack: 'whoosh', woosh: 'whoosh',
  hit: 'impact', flesh: 'impact', armor: 'impact',
  spark: 'clang', sparks: 'clang', metal: 'clang', block: 'clang', guard: 'clang', bounce: 'clang', deflect: 'clang',
  step: 'footstep', heavyStep: 'monsterStep', stomp: 'monsterStep', monsterFootstep: 'monsterStep',
  tailSwipe: 'tail', tailSwoosh: 'tail', swipe: 'tail',
  boom: 'slam', groundSlam: 'slam', breath: 'fire', fireBreath: 'fire', flame: 'fire',
  dodge: 'roll', evade: 'roll', drink: 'potion', heal: 'potion', break: 'partBreak', 'part:break': 'partBreak',
  ui: 'click', uiClick: 'click', quest: 'fanfare', questComplete: 'fanfare', victory: 'fanfare', damaged: 'hurt',
};

// Routing table: bus, reverb send, panner reference distance, voice cap.
export const meta = {
  whoosh: { bus: 'sfx', rev: 0.15, ref: 3, max: 4, trim: 1.8 },
  impact: { bus: 'punch', rev: 0.25, ref: 5, max: 6, trim: 0.45 },
  clang: { bus: 'punch', rev: 0.3, ref: 5, max: 3, trim: 2.4 },
  footstep: { bus: 'sfx', rev: 0.05, ref: 2, max: 4, trim: 3 },
  monsterStep: { bus: 'sfx', rev: 0.4, ref: 14, max: 4, trim: 0.63 },
  roar: { bus: 'sfx', rev: 0.85, ref: 30, max: 2, trim: 0.42 },
  bite: { bus: 'punch', rev: 0.25, ref: 8, max: 3, trim: 0.7 },
  tail: { bus: 'sfx', rev: 0.3, ref: 10, max: 2, trim: 1 },
  slam: { bus: 'punch', rev: 0.6, ref: 18, max: 3, trim: 0.56 },
  fire: { bus: 'sfx', rev: 0.4, ref: 14, max: 2, trim: 0.36 },
  roll: { bus: 'sfx', rev: 0.08, ref: 3, max: 2, trim: 2 },
  potion: { bus: 'sfx', rev: 0.1, ref: 3, max: 1, trim: 1 },
  partBreak: { bus: 'punch', rev: 0.5, ref: 10, max: 2, trim: 0.5 },
  hurt: { bus: 'punch', rev: 0.15, ref: 4, max: 3, trim: 0.5 },
  click: { bus: 'sfx', rev: 0, ref: 1, max: 4, trim: 1, flat: true },
  fanfare: { bus: 'sfx', rev: 0.5, ref: 1, max: 1, trim: 0.25, flat: true },
  growlRise: { bus: 'sfx', rev: 0.55, ref: 20, max: 1, trim: 0.4 },
  jawCreak: { bus: 'sfx', rev: 0.35, ref: 14, max: 1, trim: 0.6 },
  scrape: { bus: 'sfx', rev: 0.35, ref: 14, max: 1, trim: 1.8 },
  growl: { bus: 'sfx', rev: 0.6, ref: 20, max: 2, trim: 0.36 },
  monsterHurt: { bus: 'sfx', rev: 0.6, ref: 20, max: 2, trim: 0.36 },
  snort: { bus: 'sfx', rev: 0.3, ref: 12, max: 2, trim: 1.6 },
  skid: { bus: 'sfx', rev: 0.35, ref: 14, max: 2, trim: 1.3 },
  leap: { bus: 'sfx', rev: 0.4, ref: 14, max: 2, trim: 0.7 },
  inhale: { bus: 'sfx', rev: 0.4, ref: 14, max: 1, trim: 1.0 },
  thud: { bus: 'punch', rev: 0.5, ref: 16, max: 3, trim: 0.5 },
  whetstone: { bus: 'sfx', rev: 0.08, ref: 3, max: 2, trim: 3.6 },
  draw: { bus: 'sfx', rev: 0.15, ref: 3, max: 2, trim: 3.6 },
  sheathe: { bus: 'sfx', rev: 0.1, ref: 3, max: 2, trim: 4.5 },
  charge: { bus: 'sfx', rev: 0.3, ref: 3, max: 2, trim: 1.5 },
};

// Build one voice: recipe -> gain -> [HRTF panner] -> bus (+ reverb send).
export function playVoice(G, H, name, t, { pos = null, vol = 1, revScale = 1, ...p } = {}) {
  const fn = recipes[name], m = meta[name];
  if (!fn) return null;
  const ctx = G.ctx;
  const v = H.gain(vol * (m.trim ?? 1) * (p.gain ?? 1));
  let post = v, panner = null;
  if (pos && !m.flat) {
    panner = ctx.createPanner();
    panner.panningModel = 'HRTF'; panner.distanceModel = 'inverse';
    panner.refDistance = m.ref; panner.maxDistance = 600; panner.rolloffFactor = 1;
    if (panner.positionX) { panner.positionX.value = pos.x; panner.positionY.value = pos.y; panner.positionZ.value = pos.z; }
    else panner.setPosition(pos.x, pos.y, pos.z);
    v.connect(panner); post = panner;
  }
  post.connect(G[m.bus] || G.sfx);
  if (m.rev > 0) { const s = H.gain(m.rev * revScale); v.connect(s); s.connect(G.revSend); } // pre-panner send: distant sounds keep their tail
  const dur = fn(H, v, t, p);
  return { node: v, panner, end: t + dur, name };
}

export { mtof };
