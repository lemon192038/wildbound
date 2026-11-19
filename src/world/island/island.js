// The open volcanic island (free exploration). Same world interface as src/world/world.js (CONTRACTS.md):
//   update, getHeight, getNormal, bounds, sun, spawn, colliders, spawnDust, spawnSplash, lavaAt, waterLevel …
// plus: canWalk(x,z), regionAt(x,z), region (current id), chunks (streamer, for the debug overlay), stats.
// Boot is staged and reports real progress through game.loading (far terrain sampling → textures → near tiles).
import { createIslandField } from './islandField.js';
import { createChunkStreamer, TILE } from './chunks.js';
import { createIslandProps } from './props.js';
import { createIslandLandmarks } from './landmarks.js';
import { territoryHomes } from '../../field/islandBosses.js';
import { createVolcanicTextures } from '../volcanicTextures.js';
import { createTerrainMaterial } from '../volcanicTerrain.js';
import { installVolcanicFog, createVolcanicSky, buildVolcanicEnvironment } from '../volcanicSky.js';
import { createLavaMaterial } from '../lava.js';
import { createVolcanicFx } from '../volcanicFx.js';
import { mulberry32, clamp } from '../noise.js';

const progress = (game, phase, f) => game.loading?.set?.(phase, f);
const frame = () => new Promise((r) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => r()) : setTimeout(r, 0)));

// Inject the tile-mask discard into a lava ShaderMaterial (far layer).
function maskLava(mat, maskTex, half) {
  mat.uniforms.tTileMask = { value: maskTex }; mat.uniforms.uTileHalf = { value: half };
  mat.fragmentShader = mat.fragmentShader.replace('void main(){', 'uniform sampler2D tTileMask; uniform float uTileHalf;\nvoid main(){\n  if (texture2D(tTileMask, (vW.xz + uTileHalf) / (2.0 * uTileHalf)).r > 0.5) discard;');
  return mat;
}

export async function createIslandWorld(game) {
  const { THREE, scene, renderer, camera, params } = game;
  let soft = false;
  try { const gl = renderer.getContext(); const ext = gl.getExtension('WEBGL_debug_renderer_info'); soft = /swiftshader|llvmpipe|software/i.test(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : ''); } catch { /* ignore */ }
  const low = params.get('low') === '1' || (soft && params.get('hq') !== '1');
  const seed = parseInt(params.get('seed') || '1337', 10) || 1337;
  const F = createIslandField(seed);
  F.embers = 0; // the shared ember system assumes one flat lava level; island lava glow comes from the surfaces + lights
  const HALF = F.half;
  const sunDir = new THREE.Vector3(...F.light.sunDir).normalize();
  const T0 = performance.now(); const timings = {};

  // ---- sky, fog, lights ----
  installVolcanicFog(THREE, F);
  scene.fog = new THREE.FogExp2(0xffffff, F.fog.density);
  scene.background = new THREE.Color(...F.sky.horizon);
  renderer.shadowMap.enabled = true; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = F.light.exposure;
  const flashU = { value: 0 }, timeU = { value: 0 };
  const sky = createVolcanicSky(THREE, F, flashU); scene.add(sky);
  scene.environment = buildVolcanicEnvironment(THREE, renderer, F); scene.environmentIntensity = F.light.env;
  const sun = new THREE.DirectionalLight(new THREE.Color(...F.light.sunCol), F.light.sun);
  sun.castShadow = true; const SHR = low ? 30 : 38, SM = low ? 1024 : 2048;
  sun.shadow.mapSize.set(SM, SM); Object.assign(sun.shadow.camera, { left: -SHR, right: SHR, top: SHR, bottom: -SHR, near: 1, far: 700 });
  sun.shadow.camera.updateProjectionMatrix(); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.05; sun.shadow.radius = 2.5;
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(F.light.hemiSky, F.light.hemiGround, F.light.hemi); scene.add(hemi);
  progress(game, 'world', 0.05);

  // ---- spawn: south beach camp (walk inland until on dry ground) ----
  const sp = new THREE.Vector3(F.spawn.player[0], 0, F.spawn.player[1]);
  for (let i = 0; i < 80 && F.height(sp.x, sp.z) < 1.5; i++) sp.z -= 4;
  sp.y = F.height(sp.x, sp.z);
  const spawn = { player: sp, monster: new THREE.Vector3(sp.x, sp.y, sp.z - 60) };

  // ---- streamer + far layer ----
  const opts = { low };
  const chunks = createChunkStreamer(THREE, F, scene, opts);
  const textures = createVolcanicTextures(THREE, renderer, seed, low ? 256 : 512);
  const shared = { uTime: { value: 0 }, uPulse: { value: 1 }, tM1: { value: null }, tM2: { value: null }, uSize: { value: F.size } };
  opts.terrainMat = createTerrainMaterial(THREE, F, textures, shared);
  opts.farTerrainMat = createTerrainMaterial(THREE, F, textures, shared, { tileMask: { texture: chunks.maskTex, half: HALF } });
  opts.lavaMat = createLavaMaterial(THREE);
  opts.farLavaMat = maskLava(createLavaMaterial(THREE), chunks.maskTex, HALF);
  const homes = territoryHomes(F);
  const sites = { camp: [sp.x, sp.z], ruins: F.findSite(430, -470), crystal: F.findSite(-640, 40), nests: Object.fromEntries(homes.map((h) => [h.id, h.home])) };
  const clear = [{ x: sp.x, z: sp.z, r: 16 }, { x: sites.ruins[0], z: sites.ruins[1], r: 48 }, ...homes.map((h) => ({ x: h.home[0], z: h.home[1], r: 24 }))];
  const landmarks = createIslandLandmarks(THREE, scene, F, { seed, sites, low });
  opts.props = createIslandProps(THREE, scene, F, { low, seed, clear, staticColliders: landmarks.colliders });
  timings.setup = performance.now() - T0;
  { // far terrain: sampled in slices so the loading screen stays alive
    const g = chunks.buildFar(); let r; let t = performance.now();
    while (!(r = g.next()).done) { if (typeof r.value === 'number') progress(game, 'world', 0.08 + r.value * 0.5); if (performance.now() - t > 40) { await frame(); t = performance.now(); } }
  }
  timings.far = performance.now() - T0 - timings.setup;

  // ---- macro splat maps from the far grid (8 m texels): (ash, scoria, heat, crack) / (sulfur, flow, wet, burn) ----
  {
    const { far, CV, COARSE } = chunks; const MS = CV - 1; const m1 = new Uint8Array(MS * MS * 4), m2 = new Uint8Array(MS * MS * 4);
    for (let j = 0; j < MS; j++) {
      for (let i = 0; i < MS; i++) {
        const k = j * CV + i, x = -HALF + (i + 0.5) * COARSE, z = -HALF + (j + 0.5) * COARSE;
        const h = (far.h[k] + far.h[k + 1] + far.h[k + CV] + far.h[k + CV + 1]) / 4, ny = far.n[k * 3 + 1], sd = Math.min(far.sd[k], far.sd[k + 1], far.sd[k + CV], far.sd[k + CV + 1]);
        const s = F.surface(x, z, h, 1 - ny, sd, F.regionAt(x, z));
        const heat = sd < 0 ? 1 : Math.exp(-sd / 9); const o = (j * MS + i) * 4;
        m1[o] = s.ash * 255; m1[o + 1] = s.scoria * 255; m1[o + 2] = clamp(heat, 0, 1) * 255; m1[o + 3] = clamp(s.crack, 0, 1) * 255;
        m2[o] = clamp(s.sulfur, 0, 1) * 255; m2[o + 1] = clamp(s.flow, 0, 1) * 255; m2[o + 2] = s.wet * 255; m2[o + 3] = clamp(s.burn, 0, 1) * 255;
      }
      if (j % 48 === 47) { progress(game, 'world', 0.58 + (j / MS) * 0.12); await frame(); }
    }
    const mk = (d) => { const t = new THREE.DataTexture(d, MS, MS, THREE.RGBAFormat); t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.needsUpdate = true; return t; };
    shared.tM1.value = mk(m1); shared.tM2.value = mk(m2);
  }
  timings.macro = performance.now() - T0 - timings.setup - timings.far;

  // ---- sea ----
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x0b1519, roughness: 0.14, metalness: 0.0, envMapIntensity: 1.2 }));
  sea.name = 'sea'; sea.position.y = 0; sea.receiveShadow = false; scene.add(sea);

  // ---- near tiles around the spawn: everything the hunter can reach in the first seconds is built before play ----
  progress(game, 'chunks', 0);
  {
    chunks.want(sp.x, sp.z);
    const near = [...chunks.tiles.values()].filter((T) => Math.hypot(-HALF + (T.tx + 0.5) * TILE - sp.x, -HALF + (T.tz + 0.5) * TILE - sp.z) < TILE * 1.6);
    let done = 0;
    for (const T of near) {
      chunks.preloadTile(T);
      done++; progress(game, 'chunks', done / near.length); await frame();
    }
    chunks.preload(sp.x, sp.z, TILE * 1.6);
  }
  timings.nearTiles = performance.now() - T0 - timings.setup - timings.far - timings.macro;
  opts.props.update();

  // ---- fixed pool of lava lights, moved to the lava closest to the hunter ----
  const lavaCells = []; { const { far, CV, COARSE } = chunks; for (let j = 0; j < CV; j += 2) for (let i = 0; i < CV; i += 2) { const k = j * CV + i; if (far.sd[k] < 0 && far.h[k] < far.level[k]) lavaCells.push([-HALF + i * COARSE, far.level[k], -HALF + j * COARSE]); } }
  const lights = []; for (let i = 0; i < (low ? 2 : 4); i++) { const L = new THREE.PointLight(0xff5a14, 0, 60, 1.6); L.userData.ph = i * 1.7; scene.add(L); lights.push(L); }
  let lightT = 0;
  function placeLights(px, pz) {
    const picks = []; const sorted = lavaCells.map((c) => [c, (c[0] - px) ** 2 + (c[2] - pz) ** 2]).filter((a) => a[1] < 160 * 160).sort((a, b) => a[1] - b[1]);
    for (const [c] of sorted) { if (picks.length >= lights.length) break; if (picks.every((p) => Math.hypot(p[0] - c[0], p[2] - c[2]) > 30)) picks.push(c); }
    lights.forEach((L, i) => { const c = picks[i]; if (c) { L.position.set(c[0], c[1] + 3.5, c[2]); L.userData.base = 260; } else L.userData.base = 0; });
  }
  placeLights(sp.x, sp.z);

  // ---- particle fx: summit plume + steam vents ----
  const emitters = [{ kind: 'plume', x: 0, y: F.crater.lake + 10, z: 0, rate: 0.7, spread: 60, scale: 0.8 }];
  for (const [x, z] of F.vents) emitters.push({ kind: 'steam', x, y: F.height(x, z) + 0.3, z, rate: 1.4, spread: 1.4, scale: 1.2 });
  const fx = createVolcanicFx(THREE, scene, F, { getHeight: chunks.getHeight, low, emitters, lavaSamples: [], fxPal: { dust: [0.1, 0.09, 0.085], smoke: [0.05, 0.045, 0.042], steam: [0.4, 0.39, 0.37], ash: [0.24, 0.23, 0.22] } });

  // ---- shadows follow the hunter (texel-snapped) ----
  const lf = sunDir.clone().negate(), lr = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), lf).normalize(), lu = new THREE.Vector3().crossVectors(lf, lr).normalize();
  const texel = (2 * SHR) / sun.shadow.mapSize.x; const focus = new THREE.Vector3(), tmp = new THREE.Vector3(), fwd = new THREE.Vector3();
  function followShadow() {
    const p = game.player?.position; if (p) focus.copy(p); else focus.copy(sp);
    camera.getWorldDirection(fwd); fwd.y = 0; if (fwd.lengthSq() > 1e-4) focus.addScaledVector(fwd.normalize(), SHR * 0.35);
    let u = focus.dot(lr), v = focus.dot(lu); const w = focus.dot(lf); u = Math.round(u / texel) * texel; v = Math.round(v / texel) * texel;
    tmp.set(0, 0, 0).addScaledVector(lr, u).addScaledVector(lu, v).addScaledVector(lf, w);
    sun.target.position.copy(tmp); sun.position.copy(tmp).addScaledVector(sunDir, 300); sun.target.updateMatrixWorld();
  }
  followShadow();

  // ---- eruptions (deterministic schedule so future co-op clients agree) ----
  const er = mulberry32(seed + 7); const events = []; { let t = 14 + er() * 10; while (t < 7200) { events.push(t); t += 30 + er() * 30; } }
  let evIdx = 0, lastFlash = 0; const hemiBase = F.light.hemi, glowCol = new THREE.Color(...F.palette.glow), fogBase = new THREE.Color(1, 1, 1);

  // ---- lava contact hazard (hurt region == rendered lava) ----
  const Ls = { sd: 0, level: 0, fx: 0, fz: 0, depth: 1 };
  const lavaAt = (x, z) => { F.lava(x, z, Ls); return Ls.sd < 6 && chunks.getHeight(x, z) < Ls.level - 0.02; };
  let burnT = 0; const _p = new THREE.Vector3();
  function hazard(dt) {
    const P = game.player; if (!P?.position || P.dead || dt <= 0) { burnT = Math.max(0, burnT - dt); return; }
    const { x, z, y } = P.position;
    if (!(lavaAt(x, z) && y < Ls.level + 0.8)) { burnT = Math.max(0, burnT - dt); return; }
    burnT -= dt;
    if (burnT <= 0) { burnT = 0.45; P.drain?.(8); game.status?.apply('burn', 'large'); game.events?.emit('camera:shake', { intensity: 0.18, duration: 0.2 }); _p.set(x, Ls.level, z); fx.spawnSplash(_p, 0.6); }
  }

  let time = 0, region = null; const _cam = new THREE.Vector3(), camDir = new THREE.Vector3();
  function update(dt, rawDt) {
    time += rawDt; timeU.value = time; sky.material.uniforms.uTime.value = time; shared.uTime.value = time;
    const P = game.player?.position || sp;
    camera.getWorldDirection(camDir); camDir.y = 0; if (camDir.lengthSq() < 1e-6) camDir.set(0, 0, 1); camDir.normalize();
    chunks.want(P.x, P.z, camDir.x, camDir.z);
    chunks.pump();
    opts.props.update();
    while (evIdx < events.length && events[evIdx] <= time) { evIdx++; lastFlash = time; fx.eruption(); game.events?.emit('world:eruption', { time }); }
    const since = time - lastFlash;
    const flash = lastFlash > 0 ? Math.min(1, since / 0.25) * Math.exp(-Math.max(0, since - 0.25) / 2.6) * (0.75 + 0.25 * Math.sin(since * 23)) : 0;
    flashU.value = flash * 0.6; hemi.intensity = hemiBase * (1 + flash * 0.4);
    scene.fog.color.copy(fogBase).lerp(glowCol, flash * 0.1).multiplyScalar(1 + flash * 0.2);
    shared.uPulse.value = 1 + flash * 0.6;
    for (const m of [opts.lavaMat, opts.farLavaMat]) { m.uniforms.uTime.value = time; m.uniforms.uBoost.value = 1 + flash * 0.5; }
    lightT -= rawDt; if (lightT <= 0) { lightT = 0.6; placeLights(P.x, P.z); }
    for (const L of lights) L.intensity = (L.userData.base || 0) * (0.82 + 0.12 * Math.sin(time * 2.1 + L.userData.ph) + 0.06 * Math.sin(time * 7.3 + L.userData.ph * 3)) * (1 + flash * 0.5);
    fx.update(rawDt, camera, renderer);
    hazard(dt);
    followShadow();
    const r = F.regionAt(P.x, P.z);
    if (r !== region) { const prev = region; region = r; world.region = r; if (prev) game.events?.emit('world:region', { id: r, prev }); }
    camera.getWorldPosition(_cam);
    world.heatHaze = Math.min(1, lavaAt(_cam.x, _cam.z) ? 0.6 : 0);
  }

  // Walkable = dry land or shallow water inside the map. The hunter cannot wade out to sea.
  const canWalk = (x, z) => Math.abs(x) < HALF - 20 && Math.abs(z) < HALF - 20 && chunks.getHeight(x, z) > -1.1;

  const world = {
    update, getHeight: chunks.getHeight, getNormal: chunks.getNormal, lavaAt, lavaLevel: 0, canWalk,
    regionAt: F.regionAt, region: F.regionAt(sp.x, sp.z), field: 'island', fieldName: F.name, island: F,
    bounds: { radius: HALF * 1.5, arenaRadius: 45 }, sun, spawn, colliders: opts.props.colliders,
    spawnDust: fx.spawnDust, spawnSplash: fx.spawnSplash, waterLevel: 0, waterHeightAt: () => 0, waterSources: [], // the sea: y = 0 everywhere
    sunDirection: sunDir.clone(), heatHaze: 0, low, chunks, props: opts.props, territories: homes, sites: landmarks.sites,
    stats: { boot: timings, lavaCells: lavaCells.length },
  };
  region = world.region;
  timings.total = performance.now() - T0;
  progress(game, 'chunks', 1);
  return world;
}
