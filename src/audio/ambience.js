// Outdoor valley ambience: gusting wind bed, FM bird calls placed around the
// listener, pulsing insects, and optional water babble at world water points.
import { rand, pick } from './core.js';

function setPos(p, x, y, z) {
  if (p.positionX) { p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z; } else p.setPosition(x, y, z);
}
function panner(ctx, ref, roll = 1) {
  const p = ctx.createPanner(); p.panningModel = 'HRTF'; p.distanceModel = 'inverse';
  p.refDistance = ref; p.rolloffFactor = roll; p.maxDistance = 500; return p;
}

export function createAmbience(G, H) {
  const ctx = G.ctx, out = G.amb;
  let started = false, nextGust = 0, nextBird = 0, nextBabble = 0;
  const wind = [], insects = [], water = [];
  const birdRev = H.gain(0.5); birdRev.connect(G.revSend);

  function start(t) {
    if (started) return; started = true;
    // wind: two decorrelated noise beds panned apart + a thin whistle band
    for (const side of [-0.7, 0.7]) {
      const bp = H.filter('bandpass', 420, 0.55), g = H.gain(0.12), sp = ctx.createStereoPanner(); sp.pan.value = side;
      const src = H.noise('pink', t, 1e6, bp); bp.connect(g); g.connect(sp); sp.connect(out);
      const lo = H.filter('lowpass', 240, 0.7), gl = H.gain(0.1); H.noise('brown', t, 1e6, lo); lo.connect(gl); gl.connect(sp);
      wind.push({ bp, g, gl, src });
    }
    const wh = H.filter('bandpass', 2300, 7), wg = H.gain(0.01); H.noise('white', t, 1e6, wh); wh.connect(wg); wg.connect(out);
    wind.whistle = { wh, wg };
    // insects: carrier AM-pulsed by a fast square, gated by a slow square
    for (let i = 0; i < 2; i++) {
      const p = panner(ctx, 4, 1.2); p.connect(out); const lvl = H.gain(0.0, p);
      const gate = H.gain(0.5, lvl), am = H.gain(0.5, gate);
      const car = H.osc('sine', rand(4200, 5200), t, 1e6, am);
      const f = H.osc('square', rand(28, 40), t, 1e6); const fd = H.gain(0.5); f.connect(fd); fd.connect(am.gain);
      const s = H.osc('square', rand(0.6, 1.4), t, 1e6); const sd = H.gain(0.5); s.connect(sd); sd.connect(gate.gain);
      lvl.gain.setTargetAtTime(0.02, t, 3);
      insects.push({ p, lvl, car, f, s, next: t + rand(2, 6), off: { x: rand(-12, 12), y: 0.3, z: rand(-12, 12) } });
    }
    // high "field" shimmer
    const fh = H.filter('bandpass', 7200, 2.5), fg = H.gain(0.006); H.noise('white', t, 1e6, fh); fh.connect(fg); fg.connect(out);
    nextGust = t + 0.5; nextBird = t + rand(0.5, 2);
  }

  function setWater(points) {
    if (!started || water.length || !points?.length) return;
    for (const pt of points.slice(0, 2)) {
      const p = panner(ctx, 6, 1.4); setPos(p, pt.x, pt.y ?? 0, pt.z); p.connect(out);
      const b1 = H.filter('bandpass', 800, 0.8), g1 = H.gain(0.35, p); b1.connect(g1); H.noise('pink', ctx.currentTime, 1e6, b1);
      const b2 = H.filter('bandpass', 2400, 3), g2 = H.gain(0.15, p); b2.connect(g2); H.noise('white', ctx.currentTime, 1e6, b2);
      water.push({ b2, g2 });
    }
  }

  function bird(t, lp) {
    const ang = rand(0, Math.PI * 2), dist = rand(18, 55);
    const p = panner(ctx, 8, 1); setPos(p, lp.x + Math.cos(ang) * dist, lp.y + rand(6, 18), lp.z + Math.sin(ang) * dist);
    const env = H.gain(0); env.connect(p); p.connect(out); env.connect(birdRev);
    const type = pick(['chirps', 'whistle', 'trill', 'chirps']);
    const base = rand(2600, 4200), notes = [];
    if (type === 'chirps') { const n = 3 + ((Math.random() * 4) | 0), gap = rand(0.07, 0.12); for (let i = 0; i < n; i++) notes.push([i * gap, 0.05, base * rand(1.05, 1.25), base * rand(0.75, 0.9)]); }
    else if (type === 'whistle') { notes.push([0, 0.22, base * 0.8, base * 0.95], [0.32, 0.3, base * 1.05, base * 0.85]); if (Math.random() < 0.5) notes.push([0.7, 0.18, base, base * 1.1]); }
    else notes.push([0, rand(0.5, 0.9), base * 0.9, base * 0.85]);
    const len = notes[notes.length - 1][0] + notes[notes.length - 1][1];
    const car = H.osc('sine', base, t, len + 0.1, env);
    const mod = H.osc('sine', type === 'trill' ? rand(28, 45) : base * 0.5, t, len + 0.1);
    const md = H.gain(0); mod.connect(md); md.connect(car.frequency);
    const vol = rand(0.05, 0.12);
    for (const [o, d, f1, f2] of notes) {
      const tt = t + o;
      car.frequency.setValueAtTime(f1, tt); car.frequency.exponentialRampToValueAtTime(f2, tt + d);
      md.gain.setValueAtTime(type === 'trill' ? f1 * 0.12 : f1 * 0.05, tt);
      env.gain.setValueAtTime(0, tt); env.gain.linearRampToValueAtTime(vol, tt + Math.min(0.01, d * 0.2));
      env.gain.setValueAtTime(vol, tt + d * 0.6); env.gain.linearRampToValueAtTime(0, tt + d);
    }
    return len;
  }

  // now: audio-clock time; lp: listener position {x,y,z}
  function update(now, lp) {
    if (!started) return;
    if (now >= nextGust) {
      const strength = Math.random() < 0.25 ? rand(0.5, 1) : rand(0.1, 0.45);
      const tc = rand(0.6, 2);
      for (const w of wind) {
        w.bp.frequency.setTargetAtTime(280 + strength * rand(500, 900), now, tc);
        w.g.gain.setTargetAtTime(0.05 + strength * 0.28, now, tc);
        w.gl.gain.setTargetAtTime(0.04 + strength * 0.16, now, tc);
      }
      wind.whistle.wg.gain.setTargetAtTime(strength > 0.6 ? 0.012 * strength : 0.002, now, tc);
      wind.whistle.wh.frequency.setTargetAtTime(rand(1800, 3000), now, tc * 1.5);
      nextGust = now + rand(1.5, 5);
    }
    if (now >= nextBird) {
      let tt = now + 0.05;
      const reps = Math.random() < 0.4 ? 2 : 1;
      for (let i = 0; i < reps; i++) tt += bird(tt, lp) + rand(0.4, 1.2);
      nextBird = now + rand(2, 7);
    }
    for (const ins of insects) if (now >= ins.next) { // keep the chorus irregular: rate, pitch and level drift
      ins.s.frequency.setTargetAtTime(rand(0.4, 1.6), now, 0.5); ins.f.frequency.setTargetAtTime(rand(26, 42), now, 0.3);
      ins.car.frequency.setTargetAtTime(rand(4000, 5400), now, 1); ins.lvl.gain.setTargetAtTime(Math.random() < 0.25 ? 0 : rand(0.008, 0.025), now, 0.8);
      ins.next = now + rand(2, 7);
    }
    for (const ins of insects) setPos(ins.p, lp.x + ins.off.x, ins.off.y + (lp.groundY ?? 0), lp.z + ins.off.z);
    if (water.length && now >= nextBabble) {
      for (const w of water) { w.b2.frequency.setTargetAtTime(rand(1500, 3500), now, 0.05); w.g2.gain.setTargetAtTime(rand(0.05, 0.25), now, 0.04); }
      nextBabble = now + rand(0.06, 0.14);
    }
  }
  return { start, update, setWater, get started() { return started; } };
}
