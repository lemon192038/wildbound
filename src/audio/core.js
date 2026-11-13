// Wildbound audio core: mixer graph, shared noise buffers, procedural impulse
// response and small synthesis helpers. Works with AudioContext and
// OfflineAudioContext alike (the offline path is used by the render tests).

export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];
export const cents = (c) => Math.pow(2, c / 1200);
export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// --- Noise buffers (generated once per context, reused by every voice) ------
function makeNoise(ctx, kind, seconds = 3) {
  const sr = ctx.sampleRate, n = Math.floor(sr * seconds);
  const buf = ctx.createBuffer(1, n, sr), d = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === 'white') d[i] = w * 0.5;
    else if (kind === 'pink') { // Paul Kellet's refined pink filter
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
    } else { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } // brown
  }
  // crossfade the loop seam so looping noise never clicks
  const fade = Math.floor(sr * 0.05);
  for (let i = 0; i < fade; i++) { const a = i / fade; d[n - fade + i] = d[n - fade + i] * (1 - a) + d[i] * a; }
  return buf;
}

// --- Procedural outdoor-valley impulse response ------------------------------
// Sparse early reflections (ground + near slopes), a few distinct late echoes
// off distant valley walls, and a diffuse tail whose highs decay faster.
export function makeValleyIR(ctx, seconds = 3.6) {
  const sr = ctx.sampleRate, n = Math.floor(sr * seconds);
  const ir = ctx.createBuffer(2, n, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      // high frequencies die quicker: one-pole lowpass whose cutoff falls with time
      const k = clamp(0.85 * Math.exp(-t * 1.6), 0.03, 0.85);
      lp += k * ((Math.random() * 2 - 1) - lp);
      const env = Math.exp(-t * 2.1) * (t < 0.02 ? t / 0.02 : 1); // ~3.3s RT60
      d[i] = lp * env * 0.55;
    }
    const tap = (time, amp, width = 0.004) => {
      const s = Math.floor(time * sr), w = Math.floor(width * sr);
      for (let j = 0; j < w && s + j < n; j++) d[s + j] += (Math.random() * 2 - 1) * amp * (1 - j / w);
    };
    // early reflections
    for (let e = 0; e < 9; e++) tap(rand(0.008, 0.09), rand(0.15, 0.45) * (ch ? rand(0.7, 1) : 1));
    // distinct valley-wall echoes (slightly different per ear)
    tap(0.29 + ch * 0.013, 0.22, 0.03); tap(0.47 - ch * 0.009, 0.16, 0.05); tap(0.81 + ch * 0.02, 0.09, 0.08);
  }
  return ir;
}

// --- The mixer graph ----------------------------------------------------------
// voices -> [panner] -> sfx / punch / music / amb buses
//   bed (music+amb+sfx) -> duck lowpass (hitstop) -> mix
//   punch (impacts) -------------------------------> mix   (bypasses duck)
//   reverb send -> convolver -> return ------------> mix
//   mix -> master -> glue comp -> limiter -> destination
export function createGraph(ctx) {
  const g = (v = 1) => { const n = ctx.createGain(); n.gain.value = v; return n; };
  const G = { ctx };
  G.noise = { white: makeNoise(ctx, 'white'), pink: makeNoise(ctx, 'pink'), brown: makeNoise(ctx, 'brown') };

  G.limiter = ctx.createDynamicsCompressor();
  G.limiter.threshold.value = -3; G.limiter.knee.value = 0; G.limiter.ratio.value = 20;
  G.limiter.attack.value = 0.002; G.limiter.release.value = 0.12;
  G.glue = ctx.createDynamicsCompressor();
  G.glue.threshold.value = -12; G.glue.knee.value = 10; G.glue.ratio.value = 2;
  G.glue.attack.value = 0.008; G.glue.release.value = 0.25;
  G.master = g(0.9);
  // final safety clipper: transparent below ~-1.5 dBFS, soft-knees anything the limiter lets through
  G.clip = ctx.createWaveShaper();
  G.clip.curve = (() => { const n = 4096, c = new Float32Array(n); for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1, a = Math.abs(x), k = 0.84;
    c[i] = Math.sign(x) * (a <= k ? a : k + (1 - k) * Math.tanh((a - k) / (1 - k))) * 0.985; } return c; })();
  G.master.connect(G.glue); G.glue.connect(G.limiter); G.limiter.connect(G.clip); G.clip.connect(ctx.destination);
  G.mix = g(1); G.mix.connect(G.master);

  G.duck = ctx.createBiquadFilter(); G.duck.type = 'lowpass'; G.duck.frequency.value = 20000; G.duck.Q.value = 0.5;
  G.duck.connect(G.mix);
  G.sfx = g(0.5); G.sfx.connect(G.duck);
  G.punch = g(0.5); G.punch.connect(G.mix);
  G.music = g(0.08); G.music.connect(G.duck);
  G.amb = g(0.35); G.amb.connect(G.duck);

  G.convolver = ctx.createConvolver(); G.convolver.normalize = true; G.convolver.buffer = makeValleyIR(ctx);
  G.revSend = g(1);
  // keep reverb out of the low end (24 dB/oct at 200 Hz) so thumps stay tight
  const revHP = ctx.createBiquadFilter(); revHP.type = 'highpass'; revHP.frequency.value = 200;
  const revHP2 = ctx.createBiquadFilter(); revHP2.type = 'highpass'; revHP2.frequency.value = 200;
  G.revSend.connect(revHP); revHP.connect(revHP2); revHP2.connect(G.convolver);
  G.revReturn = g(0.55); G.convolver.connect(G.revReturn); G.revReturn.connect(G.mix);

  // soft clipper curve used for grit/saturation
  G.satCurve = (() => { const n = 2048, c = new Float32Array(n); for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(x * 2.5) / Math.tanh(2.5); } return c; })();
  return G;
}

// --- helpers used by instruments ---------------------------------------------
export function mk(G) {
  const ctx = G.ctx;
  const H = {
    ctx,
    gain(v = 0, dest) { const n = ctx.createGain(); n.gain.value = v; if (dest) n.connect(dest); return n; },
    filter(type, freq, Q = 0.707, dest) { const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = Q; if (dest) f.connect(dest); return f; },
    osc(type, freq, t, dur, dest) {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
      if (dest) o.connect(dest); o.start(t); o.stop(t + dur + 0.05); return o;
    },
    noise(kind, t, dur, dest, rate = 1) {
      const s = ctx.createBufferSource(); s.buffer = G.noise[kind]; s.loop = true; s.playbackRate.value = rate;
      if (dest) s.connect(dest); s.start(t, Math.random() * 2.5); s.stop(t + dur + 0.05); return s;
    },
    shaper(dest, drive = 1) {
      const w = ctx.createWaveShaper(); w.curve = G.satCurve; w.oversample = '2x';
      if (drive !== 1) { const pre = H.gain(drive); pre.connect(w); if (dest) w.connect(dest); return { input: pre, output: w }; }
      if (dest) w.connect(dest); return { input: w, output: w };
    },
    // percussive envelope: linear attack, exponential decay
    perc(param, t, a, peak, dec, floor = 0.0001) {
      param.cancelScheduledValues(t); param.setValueAtTime(floor, t);
      param.linearRampToValueAtTime(peak, t + a);
      param.setTargetAtTime(floor, t + a, dec / 4.6);
    },
    // attack/sustain/release envelope over a known duration
    asr(param, t, a, peak, dur, r) {
      param.setValueAtTime(0, t); param.linearRampToValueAtTime(peak, t + a);
      param.setValueAtTime(peak, t + Math.max(a, dur)); param.setTargetAtTime(0, t + Math.max(a, dur), r / 4.6);
    },
  };
  return H;
}
