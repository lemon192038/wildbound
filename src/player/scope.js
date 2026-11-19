// Scope overlay for ranged aiming (user request: aiming zooms in like looking through a rifle scope). Shown while the
// camera is scoped (camera.js rig.scopeK): a dark tube ring around a round window, and a reticle — original design:
//   'mil'  : heavy posts → fine cross, mil dots every 2 units with longer ticks every 10, a small open centre ring,
//            a stadia bar below the centre with a red aiming dot, and a ranging grid in the upper-right quadrant
//   'pins' : bow sight — fine cross with three stacked sight pins below the centre
//   'dot'  : pistol — a compact red-dot window
// Pure DOM/SVG, no per-frame layout work: only opacity / scale change while it fades in.
const NS = 'http://www.w3.org/2000/svg';
function reticleSvg(kind) {
  const L = (x1, y1, x2, y2, w = 0.5, c = '#111') => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="${w}" stroke-linecap="butt"/>`;
  let g = '';
  if (kind === 'dot') {
    g += `<circle r="5.5" fill="none" stroke="#111" stroke-width="0.5"/>` + L(-100, 0, -9, 0, 0.6) + L(9, 0, 100, 0, 0.6) + L(0, -100, 0, -9, 0.6) + L(0, 9, 0, 100, 0.6);
    g += `<circle r="1.1" fill="#ff2a14"><animate attributeName="opacity" values="1;0.75;1" dur="1.6s" repeatCount="indefinite"/></circle>`;
    return g;
  }
  // heavy posts from the edge, fine cross toward the centre
  g += L(-100, 0, -62, 0, 2.4) + L(62, 0, 100, 0, 2.4) + L(0, -100, 0, -62, 2.4) + L(0, 62, 0, 100, 2.4);
  g += L(-62, 0, -3.4, 0, 0.42) + L(3.4, 0, 62, 0, 0.42) + L(0, -62, 0, -3.4, 0.42) + L(0, 3.4, 0, 62, 0.42);
  g += `<circle r="3.4" fill="none" stroke="#111" stroke-width="0.45"/><circle r="0.55" fill="#111"/>`;
  if (kind === 'pins') { // bow sight pins (near / mid / far)
    for (const [y, c] of [[9, '#ffd24a'], [17, '#7cff6a'], [26, '#ff4a2a']]) g += `<line x1="-6" y1="${y}" x2="0" y2="${y}" stroke="#222" stroke-width="0.8"/><circle cx="0" cy="${y}" r="1.2" fill="${c}"/>`;
    return g;
  }
  // mil dots + numbered long ticks on both axes
  for (let i = -60; i <= 60; i += 2) {
    if (!i) continue; const long = i % 10 === 0;
    if (long) { g += L(i, -3, i, 3, 0.4) + L(-3, i, 3, i, 0.4); if (Math.abs(i) <= 40) g += `<text x="${i}" y="-4.6" font-size="2.6" text-anchor="middle" fill="#111">${Math.abs(i / 10)}</text>`; }
    else { g += `<circle cx="${i}" cy="0" r="0.45" fill="#111"/><circle cx="0" cy="${i}" r="0.45" fill="#111"/>`; }
  }
  // stadia bar below the centre with the red aiming dot
  g += L(-30, 26, -3, 26, 0.5) + L(3, 26, 30, 26, 0.5) + `<circle cx="0" cy="26" r="1.3" fill="#ff2a14" opacity="0.92"/>` + `<circle cx="0" cy="26" r="2.6" fill="none" stroke="#ff2a14" stroke-width="0.3" opacity="0.6"/>`;
  // ranging grid (upper-right quadrant): a vertical scale and a horizontal scale meeting at a corner
  const gx = 18, gy = -14;
  g += L(gx, gy, gx, gy - 44, 0.4) + L(gx, gy, gx + 44, gy, 0.4);
  for (let i = 1; i <= 11; i++) { const y = gy - i * 4, x = gx + i * 4, big = i % 2 === 0;
    g += L(gx, y, gx + (big ? 3 : 1.6), y, 0.35) + L(x, gy, x, gy + (big ? 3 : 1.6), 0.35);
    if (big) g += `<text x="${gx - 1.6}" y="${y + 0.9}" font-size="2.2" text-anchor="end" fill="#111">${i * 5}</text><text x="${x}" y="${gy + 6}" font-size="2.2" text-anchor="middle" fill="#111">${i * 5}</text>`; }
  g += `<rect x="${gx + 14}" y="${gy - 18}" width="2.4" height="2.4" fill="#111"/>`;
  return g;
}
export function createScope() {
  if (typeof document === 'undefined') return { set() {}, el: null };
  const el = document.createElement('div'); el.className = 'wb-scope';
  el.innerHTML = `<style>
    .wb-scope{position:fixed;inset:0;z-index:4;pointer-events:none;opacity:0;transition:opacity .12s linear;display:none}
    .wb-scope .ring{position:absolute;inset:0;background:radial-gradient(circle at 50% 50%,transparent 0,transparent calc(var(--r) - 2px),rgba(0,0,0,.55) var(--r),#020202 calc(var(--r) + 10px),#000 100%)}
    .wb-scope .glass{position:absolute;left:50%;top:50%;width:calc(var(--r) * 2);height:calc(var(--r) * 2);margin:calc(var(--r) * -1) 0 0 calc(var(--r) * -1);border-radius:50%;
      box-shadow:inset 0 0 calc(var(--r) * .22) rgba(0,0,0,.75),inset 0 0 0 3px rgba(0,0,0,.85)}
    .wb-scope svg{position:absolute;left:50%;top:50%;width:calc(var(--r) * 2);height:calc(var(--r) * 2);margin:calc(var(--r) * -1) 0 0 calc(var(--r) * -1);overflow:visible}
    .wb-scope text{font-family:system-ui,sans-serif;font-weight:600}
    .wb-scope .zoom{position:absolute;left:50%;top:calc(50% + var(--r) + 14px);transform:translateX(-50%);color:#d8cfb8;font:600 13px/1 system-ui,sans-serif;letter-spacing:.12em;opacity:.8}
  </style><div class="ring"></div><div class="glass"></div><svg viewBox="-100 -100 200 200"></svg><div class="zoom"></div>`;
  // under the HUD (#ui-root z 10) and under the touch controls (z 5): the ATTACK / AIM buttons stay visible and pressable
  document.body.appendChild(el);
  const svg = el.querySelector('svg'), zoomEl = el.querySelector('.zoom'); let kind = null, shownK = -1;
  const resize = () => el.style.setProperty('--r', `${Math.round(Math.min(innerWidth, innerHeight) * 0.46)}px`); resize(); addEventListener('resize', resize);
  return {
    el,
    // k: 0..1 how far the camera is into the scope; reticle kind; zoom factor (label)
    set(k, rk = 'mil', zoom = 1) {
      if (rk !== kind) { kind = rk; svg.innerHTML = reticleSvg(rk); }
      const on = k > 0.55; const op = on ? Math.min(1, (k - 0.55) / 0.3) : 0;
      if (Math.abs(op - shownK) < 0.02) return; shownK = op;
      el.style.display = op > 0 ? 'block' : 'none'; el.style.opacity = op.toFixed(2); zoomEl.textContent = `×${zoom.toFixed(1)}`;
    },
  };
}
