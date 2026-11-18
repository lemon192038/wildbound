// Developer overlay — only with ?debug=1 (never shown to normal players).
//   • frame: FPS, frame time avg/max, draw calls, triangles (whole frame incl. post passes), geometries, textures,
//     shader programs, JS heap (Chrome only), WebGL context loss
//   • chunks (open world): current tile, tiles per state, queue, build ms avg/max, recent builds
//   • monsters: AI state, perception state/alert, distance, senses, target, chase/search timers
//   • boot: timings recorded by main.js (ms since navigation start)
//   • gizmos (button / F3, or ?debug=2): perception ranges on the ground (sight cone, hearing, chase end, leash)
//     and streamed tile borders.
import { log } from '../core/log.js';

export function createDebugOverlay(game) {
  const { THREE, renderer, engine, scene } = game;
  const css = document.createElement('style');
  css.textContent = `.wb-dbg{position:fixed;left:6px;top:6px;z-index:9500;max-width:min(430px,60vw);max-height:92vh;overflow:auto;padding:6px 8px;background:rgba(0,0,0,.66);color:#cfe;font:11px/1.35 ui-monospace,Menlo,Consolas,monospace;white-space:pre;pointer-events:auto;border:1px solid rgba(120,200,255,.25)}
.wb-dbg b{color:#ffd27a;font-weight:600}.wb-dbg i{color:#f77;font-style:normal}.wb-dbg button{font:11px ui-monospace,monospace;margin:0 4px 4px 0;padding:4px 8px;min-height:30px;background:#123;color:#cfe;border:1px solid #4af;cursor:pointer}`;
  document.head.appendChild(css);
  const el = document.createElement('div'); el.className = 'wb-dbg';
  el.innerHTML = '<div><button data-a="giz">gizmos</button><button data-a="min">hide</button></div><div class="wb-dbg-t"></div>';
  document.body.appendChild(el); const txt = el.querySelector('.wb-dbg-t');
  let gizOn = game.params.get('debug') === '2', minimized = false;
  el.addEventListener('click', (e) => { const a = e.target?.dataset?.a; if (a === 'giz') gizOn = !gizOn; if (a === 'min') { minimized = !minimized; txt.style.display = minimized ? 'none' : ''; } });
  addEventListener('keydown', (e) => { if (e.code === 'F3') { gizOn = !gizOn; e.preventDefault(); } });

  // whole-frame renderer stats: composer passes each call render(), so accumulate across the frame
  renderer.info.autoReset = false; const origRender = engine.render.bind(engine); let frameInfo = { calls: 0, triangles: 0 };
  engine.render = (...a) => { renderer.info.reset(); const r = origRender(...a); frameInfo = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles }; return r; };
  let ctxLost = 0;
  renderer.domElement.addEventListener('webglcontextlost', () => { ctxLost++; log.error('webgl-lost', 'WebGL context lost'); });
  renderer.domElement.addEventListener('webglcontextrestored', () => log.warn('webgl-restored', 'WebGL context restored'));

  // frame timing from rAF timestamps
  let last = performance.now(), acc = 0, n = 0, worst = 0, fps = 0, avg = 0, maxMs = 0, t = 0;
  function tick(now) {
    const ms = now - last; last = now; acc += ms; n++; worst = Math.max(worst, ms);
    if (acc >= 500) { fps = (n * 1000) / acc; avg = acc / n; maxMs = worst; acc = 0; n = 0; worst = 0; render(); }
    t += ms / 1000; updateGizmos();
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  function render() {
    const i = renderer.info; const L = [];
    L.push(`<b>FRAME</b> ${fps.toFixed(1)} fps  ${avg.toFixed(1)} ms avg  ${maxMs.toFixed(1)} ms max`);
    L.push(`draw calls ${frameInfo.calls}  tris ${(frameInfo.triangles / 1000).toFixed(1)}k  px ${renderer.getPixelRatio().toFixed(2)}`);
    L.push(`geometries ${i.memory.geometries}  textures ${i.memory.textures}  programs ${i.programs?.length ?? '?'}`);
    const pm = performance.memory; if (pm) L.push(`JS heap ${(pm.usedJSHeapSize / 1048576).toFixed(0)} / ${(pm.jsHeapSizeLimit / 1048576).toFixed(0)} MB`);
    if (ctxLost) L.push(`<i>WebGL context lost ×${ctxLost}</i>`);
    const w = game.world;
    if (w?.chunks) {
      const s = w.chunks.stats(); const c = s.counts;
      L.push(`<b>CHUNKS</b> tile ${s.tile}  region ${w.region}  load r ${s.loadR.toFixed(0)} m  budget ${s.budgetMs} ms/frame`);
      L.push(`active ${c.ACTIVE}  ready ${c.READY}  queued ${c.REQUESTED}  loading ${c.LOADING}  building ${c.BUILDING}  failed ${c.FAILED}  queue ${s.queue}`);
      L.push(`builds ${s.builds}  avg ${s.avgMs} ms  max ${s.maxMs} ms  recent ${s.recent.map((r) => `${r.t}:${r.build}`).join(' ')}`);
      if (w.props) L.push(`props ${Object.entries(w.props.stats()).map(([k, v]) => `${k} ${v}`).join('  ')}  colliders ${w.colliders?.length ?? 0}`);
      if (w.stats?.boot) L.push(`world boot ${Object.entries(w.stats.boot).map(([k, v]) => `${k} ${Math.round(v)}`).join('  ')} ms`);
    }
    const P = game.player?.position;
    for (const m of game.monsters || []) {
      const d = m.perception?.debug?.();
      L.push(`<b>MONSTER</b> ${String(m.name || '').slice(0, 28)}  ai ${m.state}${m.aggro ? ' aggro' : ''}  hp ${Math.round(m.hp)}`);
      if (d) {
        L.push(`  sense ${d.state} alert ${d.alert}  dist ${P ? m.position.distanceTo(P).toFixed(1) : '-'}  ${d.sight ? 'SEE ' : ''}${d.heard ? 'HEAR ' : ''}${d.smelled ? 'SMELL ' : ''}${d.los ? '' : 'noLOS'}`);
        L.push(`  sight ${d.profile.sight} m/${d.profile.fov}°  hearing ${d.profile.hearing}  smell ${d.profile.smell}  chaseEnd ${d.profile.chaseEnd}  leash ${d.profile.leash}`);
        L.push(`  target ${d.target || '-'}  contact ${d.contactT}s  search ${d.searchT}/${d.profile.search}s  remote ${m.remoteControlled ? 'yes' : 'no'}`);
      }
    }
    const b = game.bootTimings || {}; const keys = Object.keys(b);
    if (keys.length) L.push(`<b>BOOT</b> ${keys.map((k) => `${k} ${b[k]}`).join('  ')} ms`);
    if (game.loading?.times) L.push(`phases ${Object.entries(game.loading.times).map(([k, v]) => `${k} ${v}`).join('  ')} ms`);
    if (game.net) L.push(`<b>NET</b> ${game.net.connected ? 'online' : 'offline'}  players ${(game.remotePlayers?.size || 0) + 1}`);
    const errs = log.entries(); if (errs.length) L.push(`<b>LOG</b> ${errs.slice(-5).map((e) => `${e.key}×${e.count}`).join('  ')}`);
    txt.innerHTML = L.join('\n');
  }

  // ---------------------------------------------------------------- gizmos
  const giz = new THREE.Group(); giz.name = 'debug-gizmos'; scene.add(giz);
  const mat = (c) => new THREE.LineBasicMaterial({ color: c, depthTest: false, transparent: true, opacity: 0.85 });
  const M = { sight: mat(0x44ff88), hear: mat(0x44aaff), chase: mat(0xffaa33), leash: mat(0xff4444), tile: mat(0xffffff) };
  const SEG = 64; const ringGeo = () => new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array((SEG + 1) * 3), 3));
  const rings = new Map();
  function ringFor(m) {
    let r = rings.get(m); if (r) return r;
    r = { sight: new THREE.Line(ringGeo(), M.sight), hear: new THREE.LineLoop(ringGeo(), M.hear), chase: new THREE.LineLoop(ringGeo(), M.chase), leash: new THREE.LineLoop(ringGeo(), M.leash) };
    for (const l of Object.values(r)) { l.frustumCulled = false; l.renderOrder = 999; giz.add(l); }
    rings.set(m, r); return r;
  }
  const H = (x, z) => (game.world?.getHeight ? game.world.getHeight(x, z) : 0) + 0.4;
  function circle(line, cx, cz, R) { const p = line.geometry.attributes.position; for (let i = 0; i <= SEG; i++) { const a = (i / SEG) * Math.PI * 2, x = cx + Math.cos(a) * R, z = cz + Math.sin(a) * R; p.setXYZ(i, x, H(x, z), z); } p.needsUpdate = true; }
  function cone(line, cx, cz, yaw, R, fov) {
    const p = line.geometry.attributes.position; const half = (fov * Math.PI) / 360;
    p.setXYZ(0, cx, H(cx, cz), cz);
    for (let i = 1; i < SEG; i++) { const a = yaw - half + ((i - 1) / (SEG - 2)) * 2 * half, x = cx + Math.sin(a) * R, z = cz + Math.cos(a) * R; p.setXYZ(i, x, H(x, z), z); }
    p.setXYZ(SEG, cx, H(cx, cz), cz); p.needsUpdate = true;
  }
  let tiles = null, tileKey = '';
  function updateGizmos() {
    giz.visible = gizOn; if (!gizOn) return;
    for (const m of game.monsters || []) {
      const d = m.perception; if (!d) continue; const r = ringFor(m); const S = d.profile;
      cone(r.sight, m.position.x, m.position.z, m.yaw || 0, S.sight, S.fov);
      circle(r.hear, m.position.x, m.position.z, S.hearing);
      circle(r.chase, m.position.x, m.position.z, S.chaseEnd);
      circle(r.leash, d.home.x, d.home.z, S.leash);
    }
    const w = game.world; const P = game.player?.position;
    if (w?.chunks && P) {
      const [tx, tz] = w.chunks.tileOf(P.x, P.z); const k = `${tx},${tz}`;
      if (k !== tileKey) {
        tileKey = k; if (tiles) { giz.remove(tiles); tiles.geometry.dispose(); }
        const pts = []; const R = 3;
        for (let j = tz - R; j <= tz + R + 1; j++) for (let i = tx - R; i <= tx + R; i++) { const a = w.chunks.tileBounds(i, j), b = w.chunks.tileBounds(i + 1, j); for (let s = 0; s < 8; s++) { const x0 = a.x0 + (s / 8) * (b.x0 - a.x0), x1 = a.x0 + ((s + 1) / 8) * (b.x0 - a.x0); pts.push(x0, H(x0, a.z0), a.z0, x1, H(x1, a.z0), a.z0); } }
        for (let i = tx - R; i <= tx + R + 1; i++) for (let j = tz - R; j <= tz + R; j++) { const a = w.chunks.tileBounds(i, j), b = w.chunks.tileBounds(i, j + 1); for (let s = 0; s < 8; s++) { const z0 = a.z0 + (s / 8) * (b.z0 - a.z0), z1 = a.z0 + ((s + 1) / 8) * (b.z0 - a.z0); pts.push(a.x0, H(a.x0, z0), z0, a.x0, H(a.x0, z1), z1); } }
        tiles = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)), M.tile); tiles.frustumCulled = false; tiles.renderOrder = 999; giz.add(tiles);
      }
    }
  }
  return { el, setGizmos: (v) => { gizOn = !!v; } };
}
