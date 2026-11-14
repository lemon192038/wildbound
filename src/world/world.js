// Wildbound volcanic hunting fields. game.fieldId selects one of three distinct maps (see fields.js):
//   'foothills' Emberfall Foothills (Varkhul) · 'wastes' Ashfang Wastes (Cindral) · 'hollow' Cinderdeep Hollow (Gorvath)
// Interface (CONTRACTS.md): update, getHeight, getNormal, bounds, sun, spawn, colliders, spawnDust, spawnSplash,
// + waterLevel / waterHeightAt / waterSources (steaming hot springs), lavaAt(x,z), sunDirection, stats, heatHaze.
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { getField } from './fields.js';
import { mulberry32 } from './noise.js';
import { createVolcanicTextures } from './volcanicTextures.js';
import { createVolcanicTerrain } from './volcanicTerrain.js';
import { installVolcanicFog, createVolcanicSky, buildVolcanicEnvironment, createDistantRing, createVolcano } from './volcanicSky.js';
import { createLava } from './lava.js';
import { createProps } from './rocks.js';
import { createLandmarks } from './volcanicLandmarks.js';
import { createVolcanicFx } from './volcanicFx.js';

const FX_PAL = {
  foothills: { dust: [0.075, 0.064, 0.058], smoke: [0.045, 0.04, 0.038], steam: [0.34, 0.32, 0.3], ash: [0.2, 0.19, 0.185] },
  wastes: { dust: [0.2, 0.19, 0.18], smoke: [0.08, 0.075, 0.07], steam: [0.46, 0.45, 0.43], ash: [0.4, 0.39, 0.37] },
  hollow: { dust: [0.09, 0.07, 0.06], smoke: [0.05, 0.04, 0.036], steam: [0.3, 0.25, 0.22], ash: [0.22, 0.18, 0.16] },
};

export async function createWorld(game) {
  const { THREE, scene, renderer, camera, params } = game;
  let soft = false;
  try { const gl = renderer.getContext(); const ext = gl.getExtension('WEBGL_debug_renderer_info'); soft = /swiftshader|llvmpipe|software/i.test(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : ''); } catch (e) { /* ignore */ }
  const low = params.get('low') === '1' || (soft && params.get('hq') !== '1');
  const seed = parseInt(params.get('seed') || '1337', 10) || 1337;
  const F = getField(game.fieldId || 'foothills', seed);
  const sunDir = new THREE.Vector3(...F.light.sunDir).normalize();
  const LY = F.lavaY;

  installVolcanicFog(THREE, F);
  scene.fog = new THREE.FogExp2(0xffffff, F.fog.density);
  scene.background = new THREE.Color(...(F.fog.cave || F.sky.horizon));
  renderer.shadowMap.enabled = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = F.light.exposure;

  const flashU = { value: 0 }, timeU = { value: 0 };
  const sky = createVolcanicSky(THREE, F, flashU); scene.add(sky);
  scene.environment = buildVolcanicEnvironment(THREE, renderer, F);
  scene.environmentIntensity = F.light.env;

  // ---- lights ----
  const sun = new THREE.DirectionalLight(new THREE.Color(...F.light.sunCol), F.light.sun);
  sun.castShadow = true;
  const SHR = F.cave ? 178 : low ? 30 : 36; // cave: one static box covering every wall under the roof
  const SM = F.cave ? (low ? 1024 : 2048) : (low ? 1024 : 2048);
  sun.shadow.mapSize.set(SM, SM);
  Object.assign(sun.shadow.camera, { left: -SHR, right: SHR, top: SHR, bottom: -SHR, near: 1, far: F.cave ? 640 : 460 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = F.cave ? -0.0006 : -0.0004; sun.shadow.normalBias = F.cave ? 0.12 : 0.045; sun.shadow.radius = 2.5;
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(F.light.hemiSky, F.light.hemiGround, F.light.hemi); scene.add(hemi);
  // cave: one fixed warm "bounce" light standing in for the glow of every lava pool on the chamber
  let bounce = null;
  if (F.light.bounce) { bounce = new THREE.PointLight(F.light.bounce[0], F.light.bounce[1], 160, 1.2); bounce.position.set(0, 38, 0); scene.add(bounce); }

  // ---- terrain ----
  const textures = createVolcanicTextures(THREE, renderer, seed, low ? 256 : 512);
  const terrain = createVolcanicTerrain(THREE, F, textures, { segments: low ? F.segLow : F.seg, macroSize: low ? 256 : 512 });
  scene.add(terrain.mesh);
  const distant = createDistantRing(THREE, seed, F, textures); if (distant) scene.add(distant);
  const volcano = createVolcano(THREE, seed, F, textures, flashU, timeU); if (volcano) scene.add(volcano);

  // ---- props, lava, set pieces ----
  const props = createProps(THREE, scene, F, terrain, textures, { low, seed });
  const lava = createLava(THREE, scene, terrain, F, (x, z) => F.lavaFlow(x, z), {
    lights: low ? 2 : (F.cave ? 3 : 4), lightIntensity: F.cave ? 2600 : 520, lightRange: F.cave ? 120 : 60, lightLift: F.cave ? 8 : 3.5, lightSpacing: F.cave ? 40 : 36,
  });
  const landmarks = createLandmarks(THREE, scene, F, terrain, { rock: props.rockMat }, { seed, low, sunDir, utils: { mergeGeometries } });
  for (const m of landmarks.lavaMats) lava.addMaterial(m);
  const colliders = [...props.colliders, ...landmarks.colliders];

  // ---- particle emitters ----
  const emitters = [...landmarks.emitters];
  for (const [x, z] of F.vents) emitters.push({ kind: 'steam', x, y: terrain.getHeight(x, z) + 0.3, z, rate: F.cave ? 1.6 : 2.0, spread: 1.2, scale: 1.1 });
  const smokePicks = []; const sorted = lava.samples.slice().sort((p, q) => (p[0] ** 2 + p[1] ** 2) - (q[0] ** 2 + q[1] ** 2));
  for (const s of sorted) { if (smokePicks.length >= (low ? 6 : 12)) break; if (smokePicks.every((p) => Math.hypot(p[0] - s[0], p[1] - s[1]) > 16)) smokePicks.push(s); }
  for (const [x, z] of smokePicks) emitters.push({ kind: 'smoke', x, y: LY + 0.4, z, rate: 0.8, spread: 3, scale: 1.3 });
  if (volcano) { const c = volcano.userData.crater; emitters.push({ kind: 'plume', x: c.x, y: c.y, z: c.z, rate: 0.6, spread: 40, scale: F.volcano.h / 560 }); }
  if (F.cave) for (let i = 0; i < 6; i++) { const a = i * 1.047 + 0.4, r = 52 + (i % 2) * 14; emitters.push({ kind: 'mist', x: Math.cos(a) * r, y: terrain.getHeight(Math.cos(a) * r, Math.sin(a) * r) + 0.5, z: Math.sin(a) * r, rate: 0.12, spread: 10, scale: 1.2 }); }
  const fx = createVolcanicFx(THREE, scene, F, { getHeight: terrain.getHeight, low, emitters, lavaSamples: lava.samples, fxPal: FX_PAL[F.id] });

  // ---- spawns ----
  const spawn = { player: new THREE.Vector3(F.spawn.player[0], 0, F.spawn.player[1]), monster: new THREE.Vector3(F.spawn.monster[0], 0, F.spawn.monster[1]) };
  spawn.player.y = terrain.getHeight(spawn.player.x, spawn.player.z);
  spawn.monster.y = terrain.getHeight(spawn.monster.x, spawn.monster.z);

  // ---- shadows: follow the action in open fields, one static box over the whole cavern ----
  const lf = sunDir.clone().negate();
  const lr = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), lf).normalize();
  const lu = new THREE.Vector3().crossVectors(lf, lr).normalize();
  const texel = (2 * SHR) / sun.shadow.mapSize.x;
  const focus = new THREE.Vector3(), tmp = new THREE.Vector3(), fwd = new THREE.Vector3();
  function followShadow() {
    if (F.cave) { sun.target.position.set(0, 0, 0); sun.position.copy(sunDir).multiplyScalar(250); sun.target.updateMatrixWorld(); return; }
    const p = game.player?.position;
    if (p) focus.copy(p); else { camera.getWorldDirection(fwd); focus.copy(camera.position).addScaledVector(fwd, 15); focus.y = terrain.getHeight(focus.x, focus.z); }
    camera.getWorldDirection(fwd); fwd.y = 0; if (fwd.lengthSq() > 1e-4) focus.addScaledVector(fwd.normalize(), SHR * 0.35);
    let u = focus.dot(lr), v = focus.dot(lu); const w = focus.dot(lf);
    u = Math.round(u / texel) * texel; v = Math.round(v / texel) * texel;
    tmp.set(0, 0, 0).addScaledVector(lr, u).addScaledVector(lu, v).addScaledVector(lf, w);
    sun.target.position.copy(tmp); sun.position.copy(tmp).addScaledVector(sunDir, 220); sun.target.updateMatrixWorld();
  }
  followShadow();

  // ---- eruptions / tremors: deterministic schedule so co-op clients agree ----
  const er = mulberry32(seed + 7); const events = []; { let t = 9 + er() * 8; while (t < 7200) { events.push(t); t += 20 + er() * 22; } }
  let evIdx = 0, flash = 0, lastFlash = 0;
  const hemiBase = F.light.hemi, glowCol = new THREE.Color(...F.palette.glow);
  const fogBase = new THREE.Color(1, 1, 1);

  // ---- lava contact hazard (the hurt region is exactly the rendered lava: getHeight < lavaY) ----
  let burnT = 0, cueT = 0;
  const _p = new THREE.Vector3();
  function hazard(dt) {
    const P = game.player; if (!P?.position || P.dead) { burnT = 0; return; }
    const { x, z, y } = P.position;
    if (!(terrain.lavaAt(x, z) && y < LY + 0.8)) { burnT = Math.max(0, burnT - dt); return; }
    cueT -= dt;
    if (cueT <= 0) { cueT = 0.12; fx.emit(x, LY + 0.2, z, (Math.random() - 0.5) * 2, 3 + Math.random() * 3, (Math.random() - 0.5) * 2, 0.8, 0.5, 2, 1, 0.5, 0.15, 0.1, 0.08, 0.45, 1.5, 0.5); }
    if (dt <= 0) return;
    burnT -= dt;
    if (burnT <= 0) {
      burnT = 0.45;
      P.drain?.(8);
      game.status?.apply('burn', 'large');
      game.events?.emit('camera:shake', { intensity: 0.18, duration: 0.2 });
      _p.set(x, LY, z); fx.spawnSplash(_p, 0.6);
    }
  }

  // Monsters never stand in lava: walking bosses that end up within MARGIN of it are pushed back along the
  // lava signed-distance gradient (the foothills levee stops most of them; this catches leaps / collider tunnelling).
  const MARGIN = 4;
  function keepMonstersOffLava() {
    for (const m of game.monsters || []) {
      const p = m?.position; if (!p || m.remoteControlled) continue;
      if (p.y - terrain.getHeight(p.x, p.z) > 3) continue; // airborne (wyvern flight, leaps)
      const sd = F.lavaSD(p.x, p.z); if (sd >= MARGIN) continue;
      const e = 0.5, gx = F.lavaSD(p.x + e, p.z) - F.lavaSD(p.x - e, p.z), gz = F.lavaSD(p.x, p.z + e) - F.lavaSD(p.x, p.z - e);
      const gl = Math.hypot(gx, gz) || 1; const k = Math.min(MARGIN - sd, 2.5);
      p.x += gx / gl * k; p.z += gz / gl * k;
    }
  }

  let time = 0;
  const _cam = new THREE.Vector3();
  function update(dt, rawDt) {
    time += rawDt; timeU.value = time;
    sky.material.uniforms.uTime.value = time;
    terrain.shared.uTime.value = time;
    // eruption envelope
    while (evIdx < events.length && events[evIdx] <= time) { evIdx++; lastFlash = time; fx.eruption(); }
    const since = time - lastFlash;
    flash = lastFlash > 0 ? Math.max(0, Math.min(1, since / 0.25)) * Math.exp(-Math.max(0, since - 0.25) / 2.6) * (0.75 + 0.25 * Math.sin(since * 23)) : 0;
    flashU.value = flash * (F.cave ? 0.5 : 1);
    hemi.intensity = hemiBase * (1 + flash * (F.cave ? 0.5 : 0.7));
    if (bounce) bounce.intensity = F.light.bounce[1] * (1 + flash * 0.8 + 0.05 * Math.sin(time * 1.7));
    scene.fog.color.copy(fogBase).lerp(glowCol, flash * 0.18).multiplyScalar(1 + flash * 0.35);
    terrain.shared.uPulse.value = 1 + flash * 0.6;
    for (const m of lava.lights) m.userData.flash = flash;
    lava.update(time);
    for (const L of lava.lights) L.intensity *= 1 + flash * 0.5;
    for (const m of [lava.material, ...landmarks.lavaMats]) m.uniforms.uBoost.value = 1 + flash * 0.5;
    landmarks.update(time);
    fx.update(rawDt, camera, renderer);
    hazard(dt);
    keepMonstersOffLava();
    followShadow();
    camera.getWorldPosition(_cam);
    world.heatHaze = Math.min(1, terrain.heatAt(_cam.x, _cam.z) * 1.2 + (F.haze ? 0.15 : 0));
  }

  const world = {
    update,
    getHeight: terrain.getHeight,
    getNormal: terrain.getNormal,
    lavaAt: terrain.lavaAt,
    lavaLevel: LY,
    bounds: { radius: F.boundsR, arenaRadius: F.cave ? 55 : 45 },
    sun, spawn, colliders,
    spawnDust: fx.spawnDust, spawnSplash: fx.spawnSplash,
    waterLevel: -Infinity,
    waterHeightAt: landmarks.waterHeightAt,
    waterSources: F.springs.map((s) => ({ x: s.x, y: s.level, z: s.z })),
    sunDirection: sunDir.clone(),
    field: F.id, fieldName: F.name, heatHaze: 0, low,
    stats: { ...props.stats, lavaCells: lava.cells, lavaLights: lava.lights.length, emitters: emitters.length },
  };
  return world;
}
