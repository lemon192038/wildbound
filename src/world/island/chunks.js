// Streaming terrain for the volcanic island.
//
// Two layers share one material family (src/world/volcanicTerrain.js):
//  • FAR  — the whole island at 8 m resolution, built once at boot in 6×6 super-chunks. It is never removed, so
//           there is always ground to draw (no transparent holes while streaming).
//  • NEAR — 64 m tiles at 2 m resolution streamed around the hunter. A tile goes
//           UNLOADED → REQUESTED → LOADING (height sampling, spread over frames) → BUILDING (GPU buffers) → READY → ACTIVE
//           and back via UNLOADING; failures go to FAILED and are retried with back-off.
//           A tile only becomes ACTIVE once everything it needs (geometry, lava surface, props, colliders) exists;
//           in that same frame its bit is set in the tile mask, which makes the far layer discard itself under it.
//           Leaving tiles flip the mask back before their meshes are removed, so the swap never shows a gap.
// Collision never waits on streaming: getHeight() reads a loaded tile's cached grid, else evaluates the analytic
// field (the same function the meshes are built from).
import { ISLAND } from './islandField.js';
import { log } from '../../core/log.js';

export const TILE = 64, FINE = 2, COARSE = 8;
const NT = ISLAND.size / TILE;            // tiles per side (36)
const FN = TILE / FINE;                   // fine cells per tile side (32)
const FV = FN + 1;                        // fine verts per side (33)
const CN = ISLAND.size / COARSE;          // coarse cells per side (288)
const CV = CN + 1;
const SC = 6, SCN = CN / SC;              // super-chunks per side, cells per super-chunk (48)
const HALF = ISLAND.half;
const SKIRT = 6;
export const STATES = ['UNLOADED', 'REQUESTED', 'LOADING', 'BUILDING', 'READY', 'ACTIVE', 'UNLOADING', 'FAILED'];
const isLava = (h, level, sd) => sd < 6 && h < level - 0.02;

// opts: { terrainMat, farTerrainMat, lavaMat, farLavaMat, props, low, onTileActive } — read lazily, so materials that
// need this streamer's mask texture can be assigned after construction.
export function createChunkStreamer(THREE, F, scene, opts = {}) {
  const low = !!opts.low;
  const loadR = (low ? 2.6 : 3.2) * TILE, dropR = loadR + TILE * 1.1;
  const budgetMs = low ? 3 : 5;

  // ------------------------------------------------------------------ tile mask (far layer discards under ACTIVE tiles)
  const maskData = new Uint8Array(NT * NT * 4);
  const maskTex = new THREE.DataTexture(maskData, NT, NT, THREE.RGBAFormat);
  maskTex.magFilter = maskTex.minFilter = THREE.NearestFilter; maskTex.generateMipmaps = false; maskTex.needsUpdate = true;
  const setMask = (tx, tz, on) => { maskData[(tz * NT + tx) * 4] = on ? 255 : 0; maskTex.needsUpdate = true; };

  // ------------------------------------------------------------------ far layer (built at boot)
  const far = { h: new Float32Array(CV * CV), level: new Float32Array(CV * CV), sd: new Float32Array(CV * CV), fx: new Float32Array(CV * CV), fz: new Float32Array(CV * CV), n: new Float32Array(CV * CV * 3) };
  const farGroup = new THREE.Group(); farGroup.name = 'island-far'; scene.add(farGroup);
  const nearGroup = new THREE.Group(); nearGroup.name = 'island-near'; scene.add(nearGroup);

  function* buildFar() {
    const s = { h: 0, level: 0, sd: 0, fx: 0, fz: 0 };
    for (let j = 0; j < CV; j++) {
      for (let i = 0; i < CV; i++) {
        const k = j * CV + i; F.sample(-HALF + i * COARSE, -HALF + j * COARSE, s);
        far.h[k] = s.h; far.level[k] = s.level; far.sd[k] = s.sd; far.fx[k] = s.fx; far.fz[k] = s.fz;
      }
      if (j % 12 === 11) yield j / CV * 0.8;
    }
    const H = (i, j) => far.h[Math.min(CN, Math.max(0, j)) * CV + Math.min(CN, Math.max(0, i))];
    for (let j = 0; j < CV; j++) for (let i = 0; i < CV; i++) {
      const nx = H(i - 1, j) - H(i + 1, j), nz = H(i, j - 1) - H(i, j + 1), ny = 2 * COARSE, l = Math.hypot(nx, ny, nz), k = (j * CV + i) * 3;
      far.n[k] = nx / l; far.n[k + 1] = ny / l; far.n[k + 2] = nz / l;
    }
    for (let sj = 0; sj < SC; sj++) for (let si = 0; si < SC; si++) {
      const g = gridGeometry(si * SCN, sj * SCN, SCN, (i, j) => far.h[j * CV + i], (i, j, o) => { const k = (j * CV + i) * 3; o[0] = far.n[k]; o[1] = far.n[k + 1]; o[2] = far.n[k + 2]; }, COARSE, 0);
      const m = new THREE.Mesh(g, opts.farTerrainMat); m.receiveShadow = true; m.name = `far-${si}-${sj}`; m.matrixAutoUpdate = false; farGroup.add(m);
      const lg = lavaGeometry(si * SCN, sj * SCN, SCN, COARSE, (i, j) => { const k = j * CV + i; return [far.h[k], far.level[k], far.sd[k], far.fx[k], far.fz[k]]; }, -0.12);
      if (lg) { const lm = new THREE.Mesh(lg, opts.farLavaMat); lm.name = `far-lava-${si}-${sj}`; lm.matrixAutoUpdate = false; lm.renderOrder = 1; farGroup.add(lm); }
    }
    yield 1;
  }

  // Regular grid → BufferGeometry (with an optional skirt). i0/j0 are cell offsets in the source grid of `step` m.
  function gridGeometry(i0, j0, n, hAt, nAt, step, skirt) {
    const v = n + 1, ring = skirt ? 4 * n : 0;
    const pos = new Float32Array((v * v + ring) * 3), nrm = new Float32Array((v * v + ring) * 3); const o = [0, 0, 0];
    let hmin = 1e9, hmax = -1e9;
    for (let j = 0; j < v; j++) for (let i = 0; i < v; i++) {
      const k = (j * v + i) * 3, h = hAt(i0 + i, j0 + j); nAt(i0 + i, j0 + j, o);
      pos[k] = -HALF + (i0 + i) * step; pos[k + 1] = h; pos[k + 2] = -HALF + (j0 + j) * step;
      nrm[k] = o[0]; nrm[k + 1] = o[1]; nrm[k + 2] = o[2]; if (h < hmin) hmin = h; if (h > hmax) hmax = h;
    }
    const g = new THREE.BufferGeometry();
    if (skirt) {
      // perimeter verts duplicated SKIRT m below: hides cracks against coarser neighbours
      let r = v * v; const per = [];
      for (let i = 0; i < n; i++) per.push([i, 0]); for (let j = 0; j < n; j++) per.push([n, j]); for (let i = n; i > 0; i--) per.push([i, n]); for (let j = n; j > 0; j--) per.push([0, j]);
      for (const [i, j] of per) { const s = (j * v + i) * 3, d = r * 3; pos[d] = pos[s]; pos[d + 1] = pos[s + 1] - skirt; pos[d + 2] = pos[s + 2]; nrm[d] = nrm[s]; nrm[d + 1] = nrm[s + 1]; nrm[d + 2] = nrm[s + 2]; r++; }
      g.setIndex(sharedIndex(n, true));
      hmin -= skirt;
    } else g.setIndex(sharedIndex(n, false));
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.boundingBox = new THREE.Box3(new THREE.Vector3(-HALF + i0 * step, hmin - 1, -HALF + j0 * step), new THREE.Vector3(-HALF + (i0 + n) * step, hmax + 1, -HALF + (j0 + n) * step));
    g.boundingSphere = g.boundingBox.getBoundingSphere(new THREE.Sphere());
    return g;
  }
  const indexCache = new Map();
  function sharedIndex(n, skirt) {
    // every geometry gets its own copy: three.js deletes an index's GL buffer when ANY geometry using it is disposed
    const key = n + (skirt ? 's' : ''); if (indexCache.has(key)) return indexCache.get(key).clone();
    const v = n + 1, idx = [];
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const a = j * v + i, b = (j + 1) * v + i, c = b + 1, d = a + 1; idx.push(a, b, d, b, c, d); }
    if (skirt) {
      const per = []; for (let i = 0; i < n; i++) per.push(i); for (let j = 0; j < n; j++) per.push(j * v + n); for (let i = n; i > 0; i--) per.push(n * v + i); for (let j = n; j > 0; j--) per.push(j * v);
      const base = v * v, P = per.length;
      // both windings: the skirt must read from either side regardless of the material's face culling
      for (let q = 0; q < P; q++) { const a = per[q], b = per[(q + 1) % P], sa = base + q, sb = base + (q + 1) % P; idx.push(a, sa, b, b, sa, sb, a, b, sa, b, sb, sa); }
    }
    const attr = new THREE.BufferAttribute(v * v + 4 * n > 65535 ? new Uint32Array(idx) : new Uint16Array(idx), 1);
    indexCache.set(key, attr); return attr.clone();
  }
  // Lava surface over cells that dip below their body's level. at(i,j) → [h, level, sd, fx, fz]
  function lavaGeometry(i0, j0, n, step, at, lift) {
    const pos = [], depth = [], flow = [], idx = []; const vmap = new Map();
    const vert = (i, j) => {
      const key = j * 100000 + i; if (vmap.has(key)) return vmap.get(key);
      const [h, level, , fx, fz] = at(i, j); const id = pos.length / 3;
      pos.push(-HALF + i * step, level + lift, -HALF + j * step); depth.push(level - h); flow.push(fx, fz); vmap.set(key, id); return id;
    };
    for (let j = j0; j < j0 + n; j++) for (let i = i0; i < i0 + n; i++) {
      const c = [at(i, j), at(i + 1, j), at(i, j + 1), at(i + 1, j + 1)];
      if (!c.some(([h, l, sd]) => isLava(h, l, sd))) continue;
      const a = vert(i, j), b = vert(i, j + 1), cc = vert(i + 1, j + 1), d = vert(i + 1, j);
      idx.push(a, b, d, b, cc, d);
    }
    if (!idx.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aDepth', new THREE.Float32BufferAttribute(depth, 1)); g.setAttribute('aFlow', new THREE.Float32BufferAttribute(flow, 2));
    g.setIndex(idx); g.computeBoundingSphere(); return g;
  }

  // ------------------------------------------------------------------ near tiles
  const tiles = new Map(); // key → tile
  const key = (tx, tz) => tz * NT + tx;
  const timings = { builds: 0, totalMs: 0, maxMs: 0, last: [] };
  let generation = 0;

  function tileOf(x, z) { return [Math.floor((x + HALF) / TILE), Math.floor((z + HALF) / TILE)]; }

  function* buildTile(T) {
    const t0 = performance.now(); let work = 0;
    const B = FV + 2, h = new Float32Array(B * B), lv = new Float32Array(FV * FV), sd = new Float32Array(FV * FV), fx = new Float32Array(FV * FV), fz = new Float32Array(FV * FV);
    const s = { h: 0, level: 0, sd: 0, fx: 0, fz: 0 }; const x0 = -HALF + T.tx * TILE, z0 = -HALF + T.tz * TILE;
    T.state = 'LOADING';
    for (let j = 0; j < B; j++) {
      const ws = performance.now();
      for (let i = 0; i < B; i++) {
        F.sample(x0 + (i - 1) * FINE, z0 + (j - 1) * FINE, s); h[j * B + i] = s.h;
        if (i >= 1 && j >= 1 && i <= FV && j <= FV) { const k = (j - 1) * FV + (i - 1); lv[k] = s.level; sd[k] = s.sd; fx[k] = s.fx; fz[k] = s.fz; }
      }
      work += performance.now() - ws;
      if (j % 6 === 5) yield;
    }
    const ws = performance.now();
    T.state = 'BUILDING';
    const hv = new Float32Array(FV * FV), nv = new Float32Array(FV * FV * 3);
    for (let j = 0; j < FV; j++) for (let i = 0; i < FV; i++) {
      const c = (j + 1) * B + (i + 1); hv[j * FV + i] = h[c];
      const nx = h[c - 1] - h[c + 1], nz = h[c - B] - h[c + B], ny = 2 * FINE, l = Math.hypot(nx, ny, nz), k = (j * FV + i) * 3;
      nv[k] = nx / l; nv[k + 1] = ny / l; nv[k + 2] = nz / l;
    }
    const gi0 = T.tx * FN, gj0 = T.tz * FN;
    const geo = gridGeometry(gi0, gj0, FN, (i, j) => hv[(j - gj0) * FV + (i - gi0)], (i, j, o) => { const k = ((j - gj0) * FV + (i - gi0)) * 3; o[0] = nv[k]; o[1] = nv[k + 1]; o[2] = nv[k + 2]; }, FINE, SKIRT);
    const lg = lavaGeometry(gi0, gj0, FN, FINE, (i, j) => { const k = (j - gj0) * FV + (i - gi0); return [hv[k], lv[k], sd[k], fx[k], fz[k]]; }, 0);
    T.hv = hv; T.nv = nv; T.lv = lv; T.sdv = sd;
    T.geo = geo; T.lavaGeo = lg;
    T.props = opts.props ? opts.props.scatter(T.tx, T.tz, x0, z0, TILE, (x, z) => heightAtTile(T, x, z), (x, z) => { const i = clampI(Math.round((x - x0) / FINE)), j = clampI(Math.round((z - z0) / FINE)); return sd[j * FV + i]; }) : null;
    work += performance.now() - ws;
    T.buildMs = work; T.wallMs = performance.now() - t0;
    T.state = 'READY';
  }
  const clampI = (i) => Math.max(0, Math.min(FN, i));

  function activate(T) {
    const m = new THREE.Mesh(T.geo, opts.terrainMat); m.receiveShadow = true; m.name = `tile-${T.tx}-${T.tz}`; m.matrixAutoUpdate = false; m.updateMatrix();
    T.mesh = m; nearGroup.add(m);
    if (T.lavaGeo) { const lm = new THREE.Mesh(T.lavaGeo, opts.lavaMat); lm.renderOrder = 1; lm.matrixAutoUpdate = false; lm.name = `tile-lava-${T.tx}-${T.tz}`; T.lavaMesh = lm; nearGroup.add(lm); }
    setMask(T.tx, T.tz, true);
    T.state = 'ACTIVE'; T.activeAt = performance.now();
    if (T.props) opts.props.add(T);
    opts.onTileActive?.(T);
  }
  function unload(T) {
    T.state = 'UNLOADING';
    setMask(T.tx, T.tz, false);           // far layer reappears in the same frame the tile leaves
    if (T.mesh) { nearGroup.remove(T.mesh); T.mesh = null; }
    if (T.lavaMesh) { nearGroup.remove(T.lavaMesh); T.lavaMesh = null; }
    T.geo?.dispose(); T.lavaGeo?.dispose(); T.geo = T.lavaGeo = null;
    if (T.props) opts.props.remove(T);
    T.hv = T.nv = T.lv = T.sdv = null; T.props = null; T.job = null;
    tiles.delete(key(T.tx, T.tz)); T.state = 'UNLOADED';
  }

  // Analytic-backed height lookup: the tile grid if this tile is loaded (identical triangulation to the mesh).
  function heightAtTile(T, x, z) {
    const fx = (x - (-HALF + T.tx * TILE)) / FINE, fz = (z - (-HALF + T.tz * TILE)) / FINE;
    const i = Math.min(FN - 1, Math.max(0, Math.floor(fx))), j = Math.min(FN - 1, Math.max(0, Math.floor(fz))); const tx = fx - i, tz = fz - j;
    const H = T.hv, a = H[j * FV + i], b = H[(j + 1) * FV + i], c = H[(j + 1) * FV + i + 1], d = H[j * FV + i + 1];
    return tx + tz <= 1 ? a + (d - a) * tx + (b - a) * tz : c + (b - c) * (1 - tx) + (d - c) * (1 - tz);
  }
  function loadedTileAt(x, z) {
    const [tx, tz] = tileOf(x, z); if (tx < 0 || tz < 0 || tx >= NT || tz >= NT) return null;
    const T = tiles.get(key(tx, tz)); return T && T.hv && (T.state === 'READY' || T.state === 'ACTIVE') ? T : null;
  }
  function getHeight(x, z) { const T = loadedTileAt(x, z); return T ? heightAtTile(T, x, z) : F.height(x, z); }
  function getNormal(x, z, out) {
    const e = 1.0, hl = getHeight(x - e, z), hr = getHeight(x + e, z), hd = getHeight(x, z - e), hu = getHeight(x, z + e);
    return (out || new THREE.Vector3()).set(hl - hr, 2 * e, hd - hu).normalize();
  }

  // ------------------------------------------------------------------ scheduling
  const queue = []; // tiles in REQUESTED / LOADING / BUILDING
  let focusX = 0, focusZ = 0, viewX = 0, viewZ = 1;
  function want(x, z, fx = 0, fz = 1) {
    focusX = x; focusZ = z; viewX = fx; viewZ = fz;
    const r = Math.ceil(loadR / TILE) + 1; const [cx, cz] = tileOf(x, z);
    for (let tz = cz - r; tz <= cz + r; tz++) for (let tx = cx - r; tx <= cx + r; tx++) {
      if (tx < 0 || tz < 0 || tx >= NT || tz >= NT) continue;
      const d = distToTile(tx, tz, x, z); const k = key(tx, tz); const T = tiles.get(k);
      if (d <= loadR && !T) { const n = { tx, tz, state: 'REQUESTED', gen: generation, tries: 0, retryAt: 0 }; tiles.set(k, n); queue.push(n); }
    }
    for (const T of [...tiles.values()]) if (distToTile(T.tx, T.tz, x, z) > dropR && T.state !== 'LOADING' && T.state !== 'BUILDING') { if (T.state === 'ACTIVE' || T.state === 'READY') unload(T); else { tiles.delete(key(T.tx, T.tz)); T.state = 'UNLOADED'; } }
  }
  function distToTile(tx, tz, x, z) {
    const x0 = -HALF + tx * TILE, z0 = -HALF + tz * TILE;
    const dx = Math.max(x0 - x, 0, x - (x0 + TILE)), dz = Math.max(z0 - z, 0, z - (z0 + TILE)); return Math.hypot(dx, dz);
  }
  function priority(T) {
    const cx = -HALF + (T.tx + 0.5) * TILE - focusX, cz = -HALF + (T.tz + 0.5) * TILE - focusZ; const d = Math.hypot(cx, cz);
    const ahead = d > 1 ? (cx * viewX + cz * viewZ) / d : 1;
    return d - ahead * 40 - (T.job ? 10000 : 0); // finish started jobs first (no pile of half-built tiles), then tiles in view
  }

  // Runs queued jobs until the per-frame budget is spent. force=true runs to completion (boot / teleports).
  function pump(force = false, budget = budgetMs) {
    const t0 = performance.now(); const now = t0;
    for (let i = queue.length - 1; i >= 0; i--) if (!tiles.has(key(queue[i].tx, queue[i].tz)) || queue[i].state === 'UNLOADED') queue.splice(i, 1);
    queue.sort((a, b) => priority(a) - priority(b));
    while (queue.length && (force || performance.now() - t0 < budget)) {
      const T = queue[0];
      if (T.state === 'FAILED' && now < T.retryAt) { queue.push(queue.shift()); if (queue.every((q) => q.state === 'FAILED')) break; continue; }
      try {
        if (!T.job) { T.job = buildTile(T); T.startAt = performance.now(); }
        const r = T.job.next();
        if (r.done) {
          queue.shift(); T.job = null;
          if (tiles.get(key(T.tx, T.tz)) !== T) { T.geo?.dispose(); T.lavaGeo?.dispose(); continue; } // dropped while building
          activate(T);
          timings.builds++; timings.totalMs += T.buildMs; timings.maxMs = Math.max(timings.maxMs, T.buildMs);
          timings.last.push({ t: `${T.tx},${T.tz}`, build: +T.buildMs.toFixed(1), wall: +T.wallMs.toFixed(0) }); if (timings.last.length > 8) timings.last.shift();
        }
      } catch (e) {
        T.job = null; T.tries++; T.state = 'FAILED'; T.retryAt = performance.now() + Math.min(8000, 500 * 2 ** T.tries) * (0.75 + Math.random() * 0.5);
        log.error('chunk-fail', `tile ${T.tx},${T.tz} failed (try ${T.tries}): ${e.message}`, e);
        if (T.tries >= 4) { queue.shift(); tiles.delete(key(T.tx, T.tz)); log.error('chunk-giveup', `tile ${T.tx},${T.tz} gave up after ${T.tries} tries`); }
      }
    }
  }

  function stats() {
    const c = Object.fromEntries(STATES.map((s) => [s, 0])); for (const T of tiles.values()) c[T.state]++;
    const [tx, tz] = tileOf(focusX, focusZ);
    return { tile: `${tx},${tz}`, counts: c, queue: queue.length, builds: timings.builds, avgMs: timings.builds ? +(timings.totalMs / timings.builds).toFixed(2) : 0, maxMs: +timings.maxMs.toFixed(1), recent: timings.last.slice(), loadR, budgetMs };
  }
  // boot helpers: run one tile's job to completion now / every tile within r metres of (x,z)
  function preloadTile(T) {
    if (T.state === 'ACTIVE' || tiles.get(key(T.tx, T.tz)) !== T) return;
    if (!T.job) T.job = buildTile(T);
    for (let r = T.job.next(); !r.done; r = T.job.next());
    T.job = null; const qi = queue.indexOf(T); if (qi >= 0) queue.splice(qi, 1);
    activate(T); timings.builds++; timings.totalMs += T.buildMs; timings.maxMs = Math.max(timings.maxMs, T.buildMs);
  }
  function preload(x, z, r = TILE * 1.6) {
    want(x, z);
    const near = [...tiles.values()].filter((T) => distToTile(T.tx, T.tz, x, z) <= r);
    for (const T of near) preloadTile(T);
    return near.length;
  }

  return {
    buildFar, want, pump, preload, preloadTile, stats, getHeight, getNormal, tiles, maskTex, farGroup, nearGroup, tileOf, NT,
    tileBounds(tx, tz) { return { x0: -HALF + tx * TILE, z0: -HALF + tz * TILE, size: TILE }; },
    farSample(x, z) { const i = Math.round((x + HALF) / COARSE), j = Math.round((z + HALF) / COARSE); if (i < 0 || j < 0 || i > CN || j > CN) return null; const k = j * CV + i; return { h: far.h[k], level: far.level[k], sd: far.sd[k] }; },
    far, CV, COARSE,
  };
}
