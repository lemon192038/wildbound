// Wildbound world: terrain, sky, lighting, vegetation, water, particles. See CONTRACTS.md for the interface.
import { createTerrainTextures } from './textures.js';
import { createTerrain, WATER_LEVEL } from './terrain.js';
import { installFog, createSkyDome, buildEnvironment, createMountains } from './sky.js';
import { createFoliage } from './foliage.js';
import { createWater } from './water.js';
import { createParticles } from './particles.js';
import { createLandmarks, LANDMARK_RESERVE } from './landmarks.js';
import { createFauna } from './fauna.js';

export async function createWorld(game) {
  const { THREE, scene, renderer, camera, params } = game;
  // Software rasterisers (headless SwiftShader/llvmpipe) get the low geometry budget unless ?hq=1.
  let soft = false;
  try { const gl = renderer.getContext(); const ext = gl.getExtension('WEBGL_debug_renderer_info'); soft = /swiftshader|llvmpipe|software/i.test(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : ''); } catch (e) { /* ignore */ }
  const low = params.get('low') === '1' || (soft && params.get('hq') !== '1');
  const seed = parseInt(params.get('seed') || '1337', 10) || 1337;
  const BOUNDS_R = 128;

  // Golden-hour sun low in the west-north-west (backlights the arena from the default southern view).
  const sunDir = new THREE.Vector3(-0.72, 0.31, -0.52).normalize();
  installFog(THREE, sunDir, -2.0, 0.028);
  scene.fog = new THREE.FogExp2(0xffffff, 0.0012);
  scene.background = new THREE.Color(0x8aa0b8);

  renderer.shadowMap.enabled = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  // ---- sky + environment lighting ----
  const sky = createSkyDome(THREE, sunDir); scene.add(sky);
  scene.environment = buildEnvironment(THREE, renderer, sunDir);
  scene.environmentIntensity = 0.62;

  const sun = new THREE.DirectionalLight(new THREE.Color(1.0, 0.8, 0.6), 3.4);
  sun.castShadow = true;
  const SHR = low ? 30 : 36;
  sun.shadow.mapSize.set(low ? 1024 : 2048, low ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -SHR, right: SHR, top: SHR, bottom: -SHR, near: 1, far: 420 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.045; sun.shadow.radius = 2.5;
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0x9fb8dd, 0x4a3f2a, 0.32); scene.add(hemi);

  // ---- terrain ----
  const textures = createTerrainTextures(THREE, renderer, seed, low ? 256 : 512);
  const terrain = createTerrain(THREE, seed, textures, { segments: low ? 200 : 320 });
  scene.add(terrain.mesh);
  scene.add(createMountains(THREE, seed, textures));

  // ---- vegetation + rocks ----
  const foliage = createFoliage(THREE, scene, terrain, textures, sunDir, { low, seed, boundsR: BOUNDS_R, renderer, reserve: LANDMARK_RESERVE });
  const colliders = foliage.colliders;

  // ---- water ----
  const water = createWater(THREE, scene, terrain, sunDir);

  // ---- particles ----
  const fx = createParticles(THREE, scene, { getHeight: terrain.getHeight, lowMode: low });

  // ---- landmarks (ribcage arches, spire, fallen giant, cliff waterfall) ----
  const landmarks = createLandmarks(THREE, scene, terrain, { rockMat: foliage.rockMat, treeMat: foliage.treeMat }, { spawnSplash: (p, a) => fx.spawnSplash(p, a) });
  colliders.push(...landmarks.colliders);

  // ---- wildlife ----
  const homes = [];
  for (let i = 0; i < 400 && homes.length < 8; i++) {
    const a = i * 2.399, r = 14 + (i % 7) * 4; const x = Math.sin(a) * r, z = Math.cos(a) * r;
    if (terrain.macroAt(x, z).meadow > 0.7 && terrain.getHeight(x, z) > WATER_LEVEL + 0.3) homes.push([x, z]);
  }
  const fauna = createFauna(THREE, scene, terrain.getHeight, { low, homes });

  // ---- spawns ----
  const spawn = {
    player: new THREE.Vector3(0, 0, 36), monster: new THREE.Vector3(0, 0, -26),
  };
  spawn.player.y = terrain.getHeight(spawn.player.x, spawn.player.z);
  spawn.monster.y = terrain.getHeight(spawn.monster.x, spawn.monster.z);

  // ---- shadow camera follows the action, snapped to shadow texels to avoid shimmering ----
  const lf = sunDir.clone().negate();
  const lr = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), lf).normalize();
  const lu = new THREE.Vector3().crossVectors(lf, lr).normalize();
  const texel = (2 * SHR) / sun.shadow.mapSize.x;
  const focus = new THREE.Vector3(), tmp = new THREE.Vector3(), fwd = new THREE.Vector3();
  function followShadow() {
    const p = game.player?.position;
    if (p) focus.copy(p);
    else { camera.getWorldDirection(fwd); focus.copy(camera.position).addScaledVector(fwd, 15); focus.y = terrain.getHeight(focus.x, focus.z); }
    // bias the shadow box towards where the camera looks
    camera.getWorldDirection(fwd); fwd.y = 0; if (fwd.lengthSq() > 1e-4) focus.addScaledVector(fwd.normalize(), SHR * 0.35);
    let u = focus.dot(lr), v = focus.dot(lu); const w = focus.dot(lf);
    u = Math.round(u / texel) * texel; v = Math.round(v / texel) * texel;
    tmp.set(0, 0, 0).addScaledVector(lr, u).addScaledVector(lu, v).addScaledVector(lf, w);
    sun.target.position.copy(tmp);
    sun.position.copy(tmp).addScaledVector(sunDir, 200);
    sun.target.updateMatrixWorld();
  }

  let time = 0;
  const pushers = [];
  function update(dt, rawDt) {
    time += rawDt;
    sky.material.uniforms.uTime.value = time;
    pushers.length = 0;
    if (game.player?.position) pushers.push({ x: game.player.position.x, y: game.player.position.y, z: game.player.position.z, r: 1.1 });
    for (const m of game.monsters || []) if (m.position) pushers.push({ x: m.position.x, y: m.position.y, z: m.position.z, r: 4.0 });
    if (game.remotePlayers) for (const rp of game.remotePlayers.values()) { const o = rp.object3d?.position; if (o && pushers.length < 4) pushers.push({ x: o.x, y: o.y, z: o.z, r: 1.1 }); }
    foliage.update(time, camera, pushers);
    water.update(time);
    fx.update(rawDt, camera, renderer);
    landmarks.update(time, rawDt, camera);
    fauna.update(time);
    followShadow();
  }
  followShadow();

  const world = {
    update,
    getHeight: terrain.getHeight,
    getNormal: terrain.getNormal,
    bounds: { radius: BOUNDS_R, arenaRadius: 45 },
    sun,
    spawn,
    colliders,
    spawnDust: fx.spawnDust,
    spawnSplash: fx.spawnSplash,
    // extras (optional for other modules)
    waterLevel: WATER_LEVEL,
    waterSources: [{ x: terrain.pond.x, y: WATER_LEVEL, z: terrain.pond.z }, landmarks.waterfallBase, ...(terrain.stream || []).filter((_, i) => i % 2 === 0).map((s) => ({ x: s[0] ?? s.x, y: WATER_LEVEL, z: s[1] ?? s.z }))],
    waterHeightAt: water.waterHeightAt,
    sunDirection: sunDir.clone(),
    stats: foliage.stats,
  };
  return world;
}
