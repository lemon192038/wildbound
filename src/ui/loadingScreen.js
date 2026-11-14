// Field loading screen: shown from the start of bootField until the world, hunter and boss are built
// (window.__ready), then fades out. Reads the destination as soon as it is known — game.destId (server
// expedition, set by prepareQuest) or, for legacy ?hunt= free hunts, the boss's home destination.
//   showLoadingScreen(game) → { done() }   (also finishes by itself once window.__ready is set)
import { DESTINATIONS, destForMonster } from '../shared/gamedata.js';
import { t, destName, destRegion, monsterName } from '../shared/i18n.js';

const CSS = `
.wb-load { position: fixed; inset: 0; z-index: 9000; overflow: hidden; color: #e9dcc0; background: radial-gradient(ellipse at 70% 60%, #3a1408 0%, #140806 45%, #060303 100%);
  font-family: 'Inter', 'Noto Sans JP', system-ui, sans-serif; transition: opacity 0.8s ease; user-select: none; -webkit-user-select: none; }
.wb-load.out { opacity: 0; pointer-events: none; }
.wb-load-art { position: absolute; right: -4%; top: 50%; width: min(78vw, 1100px); aspect-ratio: 4/3; transform: translateY(-52%); background-size: cover; background-position: 50% 45%; opacity: 0;
  -webkit-mask-image: radial-gradient(ellipse at 55% 50%, #000 30%, transparent 70%); mask-image: radial-gradient(ellipse at 55% 50%, #000 30%, transparent 70%); transition: opacity 1.2s ease; filter: saturate(1.1) contrast(1.05); }
.wb-load-art.on { opacity: 0.85; animation: wb-load-drift 14s ease-in-out infinite alternate; }
@keyframes wb-load-drift { to { transform: translateY(-50%) scale(1.04); } }
.wb-load-txt { position: absolute; left: max(6vw, 24px); bottom: 18vh; max-width: min(46em, 88vw); }
.wb-load-txt small { display: block; font: 700 clamp(11px, 1.5vh, 15px)/1.3 'Cinzel', 'Noto Serif JP', serif; letter-spacing: 0.32em; text-transform: uppercase; color: #ff8a3d; }
.wb-load-txt h1 { margin: 0.2em 0 0.15em; font: 900 clamp(28px, 6.5vh, 64px)/1.05 'Cinzel', 'Noto Serif JP', Georgia, serif; letter-spacing: 0.08em;
  background: linear-gradient(180deg, #fff6dc, #f6e2aa 45%, #c9a35c); -webkit-background-clip: text; background-clip: text; color: transparent; filter: drop-shadow(0 3px 6px #000); }
.wb-load-txt p { margin: 0; font: 600 clamp(13px, 2.2vh, 22px)/1.3 'Cinzel', 'Noto Serif JP', serif; letter-spacing: 0.1em; color: #e9dcc0; text-shadow: 0 2px 4px #000; }
.wb-load-txt p em { font-style: normal; color: #b3a487; font-size: 0.75em; letter-spacing: 0.25em; text-transform: uppercase; margin-right: 0.8em; }
.wb-load-bar { position: absolute; left: max(6vw, 24px); right: max(6vw, 24px); bottom: 10vh; height: 3px; background: rgba(217, 182, 115, 0.18); }
.wb-load-bar i { position: absolute; left: 0; top: 0; bottom: 0; width: 100%; transform-origin: 0 50%; transform: scaleX(0); background: linear-gradient(90deg, #8a3a10, #ff8a3d 70%, #ffe2a0); box-shadow: 0 0 12px rgba(255, 138, 61, 0.9); transition: transform 0.5s ease; }
.wb-load-bar b { position: absolute; top: -5px; width: 13px; height: 13px; margin-left: -6px; border-radius: 50%; background: #ffe2a0; box-shadow: 0 0 16px 4px rgba(255, 140, 60, 0.85); transition: left 0.5s ease; }
.wb-load-tip { position: absolute; left: max(6vw, 24px); bottom: calc(10vh - 2.6em); font-size: clamp(11px, 1.6vh, 15px); color: #b3a487; letter-spacing: 0.04em; }
.wb-load-st { position: absolute; right: max(6vw, 24px); bottom: calc(10vh - 2.6em); font: 600 clamp(11px, 1.5vh, 14px) 'Cinzel', 'Noto Serif JP', serif; letter-spacing: 0.2em; color: #d9b673; text-transform: uppercase; }
.wb-load-em { position: absolute; bottom: -10px; width: 4px; height: 4px; border-radius: 50%; background: #ffb060; box-shadow: 0 0 8px 2px rgba(255, 120, 40, 0.8); animation: wb-load-rise linear infinite; opacity: 0; }
@keyframes wb-load-rise { 0% { transform: translate(0, 0); opacity: 0; } 10% { opacity: 1; } 100% { transform: translate(var(--dx), -105vh); opacity: 0; } }
`;

export function showLoadingScreen(game) {
  if (typeof document === 'undefined') return { done() {} };
  if (!document.getElementById('wb-load-css')) { const s = document.createElement('style'); s.id = 'wb-load-css'; s.textContent = CSS; document.head.appendChild(s); }
  if (!document.querySelector('link[data-wb-fonts]')) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.dataset.wbFonts = '1'; l.href = 'https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700;900&family=Inter:wght@400;500;600;700;800&display=swap'; document.head.appendChild(l); }
  const root = document.createElement('div'); root.className = 'wb-load'; root.setAttribute('role', 'status');
  const tip = t('ld.tip.' + Math.floor(Math.random() * 5));
  root.innerHTML = `<div class="wb-load-art"></div>${Array.from({ length: 22 }, (_, i) => `<span class="wb-load-em" style="left:${(i * 37) % 100}%;--dx:${((i * 53) % 80) - 40}px;animation-duration:${4 + ((i * 7) % 6)}s;animation-delay:${(i * 0.37) % 5}s"></span>`).join('')}
    <div class="wb-load-txt"><small></small><h1>${t('ld.sailing')}</h1><p></p></div>
    <div class="wb-load-bar"><i></i><b style="left:0%"></b></div><div class="wb-load-tip">${tip}</div><div class="wb-load-st"></div>`;
  document.body.appendChild(root);
  const $ = (s) => root.querySelector(s); const bar = $('.wb-load-bar i'), dot = $('.wb-load-bar b');
  let shown = '', finished = false; const t0 = performance.now();
  const BASE = (import.meta.env && import.meta.env.BASE_URL) || './';
  function info() {
    const id = game.destId || (game.hunt ? destForMonster(game.hunt) : null); if (!id || !DESTINATIONS[id]) return null;
    return { id, mon: game.hunt || DESTINATIONS[id].monster, free: game.expeditionFree ?? !game.params?.has('quest') };
  }
  function tick(now) {
    if (finished) return;
    const I = info(); const key = I ? I.id + I.mon + I.free : '';
    if (key && key !== shown) {
      shown = key; $('.wb-load-txt small').textContent = destRegion(I.id); $('.wb-load-txt h1').textContent = destName(I.id);
      $('.wb-load-txt p').innerHTML = `<em>${t('ld.target')}</em>${monsterName(I.mon)}`; $('.wb-load-st').textContent = I.free ? t('ld.free') : t('ld.quest');
      const art = $('.wb-load-art'); const img = new Image(); img.onload = () => { art.style.backgroundImage = `url("${img.src}")`; art.classList.add('on'); }; img.src = `${BASE}portraits/${I.mon}.webp`;
    }
    // staged progress: destination → world → hunter → boss → ready; eases forward in between
    const stage = window.__ready ? 1 : game.monsters?.length ? 0.86 : game.player ? 0.68 : game.world ? 0.45 : I ? 0.18 : 0.06;
    const p = Math.min(stage + (1 - stage) * 0.25 * (1 - Math.exp(-(now - t0) / 9000)), 1);
    bar.style.transform = `scaleX(${p})`; dot.style.left = (p * 100).toFixed(1) + '%';
    if (window.__ready) return void setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(done)), 350);
    requestAnimationFrame(tick);
  }
  function done() { if (finished) return; finished = true; $('.wb-load-st').textContent = t('ld.ready'); bar.style.transform = 'scaleX(1)'; dot.style.left = '100%'; root.classList.add('out'); setTimeout(() => root.remove(), 900); }
  requestAnimationFrame(tick);
  return { done };
}
