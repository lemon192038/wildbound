// Port Halvane — the harbour-city hub. Builds terrain, terraces, districts, harbour, NPCs and atmosphere,
// and exposes the world interface (CONTRACTS.md "Town (hub) mode").
import { installFog, createSkyDome, buildEnvironment, createMountains } from '../world/sky.js';
import { createTerrainTextures, createWaterNormal } from '../world/textures.js';
import { createParticles } from '../world/particles.js';
import { mulberry32, makeNoise2D } from '../world/noise.js';
import { createTownTextures } from './tex.js';
import { Bucket, createMaterials, mat4, col } from './kit.js';
import { bakeLayout, bakeTerrain, SPOTS, PRIMS, inPrim, BLOCKS } from './layout.js';
import { buildCity } from './build.js';
import { createSea, createShip, addRowboats, createCrane, createWaterfall } from './harbour.js';
import { createFx, createGulls } from './fx.js';
import { createNpcs } from './npcs.js';

export async function createTown(game) {
  const { THREE, scene, renderer, camera, params } = game;
  let soft = false;
  try { const gl = renderer.getContext(); const ext = gl.getExtension('WEBGL_debug_renderer_info'); soft = /swiftshader|llvmpipe|software/i.test(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : ''); } catch (e) { /* ignore */ }
  const low = params.get('low') === '1' || (soft && params.get('hq') !== '1');
  const tod = params.get('tod') === 'dusk' ? 'dusk' : 'day';
  const added = [];
  const add = (o) => { scene.add(o); added.push(o); return o; };

  // ---- light, sky, fog ----
  const sunDir = tod === 'dusk' ? new THREE.Vector3(0.62, 0.14, 0.77).normalize() : new THREE.Vector3(0.42, 0.58, 0.7).normalize();
  installFog(THREE, sunDir, -2.0, 0.035);
  scene.fog = new THREE.FogExp2(0xffffff, tod === 'dusk' ? 0.0006 : 0.00055);
  scene.background = new THREE.Color(0x8aa0b8);
  renderer.shadowMap.enabled = true; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = tod === 'dusk' ? 1.05 : 1.0;
  const sky = add(createSkyDome(THREE, sunDir));
  scene.environment = buildEnvironment(THREE, renderer, sunDir); scene.environmentIntensity = tod === 'dusk' ? 0.4 : 0.5;
  const sun = new THREE.DirectionalLight(tod === 'dusk' ? new THREE.Color(1.0, 0.62, 0.38) : new THREE.Color(1.0, 0.9, 0.78), tod === 'dusk' ? 2.8 : 3.9);
  sun.castShadow = true;
  const SHR = low ? 32 : 40;
  sun.shadow.mapSize.set(low ? 1024 : 2048, low ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -SHR, right: SHR, top: SHR, bottom: -SHR, near: 1, far: 500 });
  sun.shadow.camera.updateProjectionMatrix(); sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.05; sun.shadow.radius = 2;
  add(sun); add(sun.target);
  add(new THREE.HemisphereLight(0xb8d0ee, 0x5a4a38, tod === 'dusk' ? 0.2 : 0.3));

  // ---- materials ----
  const shared = { uTime: { value: 0 }, uGlow: { value: tod === 'dusk' ? 2.6 : 0.025 }, sunDir };
  const T = createTownTextures(THREE, renderer, low ? 256 : 512);
  const TT = createTerrainTextures(THREE, renderer, 7, low ? 256 : 512);
  const M = createMaterials(T, shared, low);
  M.rope = new THREE.LineBasicMaterial({ color: 0x2a2018 });

  // ---- layout ----
  const L0 = bakeLayout();
  const terrainY = bakeTerrain();
  const buckets = { stone: new Bucket('stone', { s: 3 }), cobble: new Bucket('cobble', { s: 4 }), wood: new Bucket('wood', { s: 2 }), roof: new Bucket('roof', { s: 2 }), plaster: new Bucket('plaster', { s: 3 }),
    cloth: new Bucket('cloth', { s: 2, wave: true }), metal: new Bucket('metal'), leaf: new Bucket('leaf', { s: 1.5 }), glass: new Bucket('glass'), glow: new Bucket('glow') };
  const B = buildCity(buckets, { low, getHeight: L0.getHeight, terrainY });
  const rnd = mulberry32(99);
  addRowboats(B, [[18, -50, 1.4, 0x8a3a2a], [-14, -55, 0.4, 0x2a5a7a], [-16, -62, -0.3, 0x3a6a3a], [34, -60, 0.2, 0x8a6a2a], [36, -66, 0.5, 0x2a5a7a], [-26, -88, 1.0, 0x7a2a2a], [16, -92, 2.2, 0x2a4a6a]], rnd);
  // gangplank to the flagship + departure arch on the pier head
  { const g = new THREE.BoxGeometry(1.1, 0.12, 3.6); B.wood.add(g, mat4(5.7, 2.75, -71.2, Math.PI / 2, 0, 0.17), col(0x8a6a48)); g.dispose();
    const tc = col(0x5a3d29); for (const x of [-4.5, 4.5]) { B.wood.add(new THREE.BoxGeometry(0.5, 7, 0.5), mat4(x, 2.3 + 3.5, -81.5), tc); }
    B.wood.add(new THREE.BoxGeometry(10.5, 0.6, 0.7), mat4(0, 2.3 + 7, -81.5), tc); B.wood.add(new THREE.BoxGeometry(11.5, 0.3, 1.2), mat4(0, 2.3 + 7.4, -81.5), tc);
    B.metal.add(new THREE.LatheGeometry([[0, 0.9], [0.3, 0.85], [0.45, 0.4], [0.6, 0]].map(([r, h]) => new THREE.Vector2(r, h)), 12), mat4(0, 2.3 + 5.7, -81.5), col(0xb5853a));
    for (const x of [-2.6, 2.6]) { const pg = new THREE.PlaneGeometry(1.2, 3.4, 2, 6); pg.translate(0, -1.7, 0); B.cloth.add(pg, mat4(x, 2.3 + 6.7, -81.3), col(0x1f3f78), { uv: 'keep', wave: (q) => -q.y / 3.4 }); pg.dispose(); }
    BLOCKS.push({ c: [-4.5, -81.5], r: 0.5 }, { c: [4.5, -81.5], r: 0.5 }); }
  // broadleaf trees on the embankments between terraces
  { let n = 0; for (let i = 0; i < 900 && n < (low ? 22 : 48); i++) {
    const x = -70 + rnd() * 140, z = -30 + rnd() * 110, y = terrainY(x, z);
    if (y < 3 || PRIMS.some((p) => inPrim(p, x, z, 2.5)) || BLOCKS.some((b) => (Array.isArray(b) ? x > b[0] - 2 && x < b[1] + 2 && z > b[2] - 2 && z < b[3] + 2 : Math.hypot(x - b.c[0], z - b.c[1]) < b.r + 2))) continue;
    if (Math.abs(terrainY(x + 1.5, z) - terrainY(x - 1.5, z)) > 2.2 || Math.abs(terrainY(x, z + 1.5) - terrainY(x, z - 1.5)) > 2.2) continue;
    B.tree(x, y - 0.2, z, 0.9 + rnd() * 0.5, false, true); n++; } }

  // embankment greenery: instanced shrubs + boulders
  { const sh = new Bucket('shrub', { s: 1.5 }); const ig = new THREE.IcosahedronGeometry(0.8, 0); const P = ig.attributes.position; for (let k = 0; k < P.count; k++) { const f = 1 + Math.sin(P.getX(k) * 5) * Math.cos(P.getZ(k) * 4) * 0.2; P.setXYZ(k, P.getX(k) * f, P.getY(k) * f * 0.7, P.getZ(k) * f); } ig.computeVertexNormals();
    sh.add(ig, mat4(0, 0.35, 0), null, { colFn: (lx, ly) => col(0x3f7a2c).map((v) => v * (0.65 + 0.5 * (ly + 0.5))) });
    const rk = new Bucket('rock', { s: 2 }); const dg = new THREE.DodecahedronGeometry(0.9, 0); dg.scale(1.2, 0.7, 1); rk.add(dg, mat4(0, 0.2, 0), col(0x9a9284));
    const sm = [], rm = [];
    for (let i = 0; i < 6000 && sm.length < (low ? 160 : 420); i++) {
      const x = -90 + rnd() * 180, z = -40 + rnd() * 140, y = terrainY(x, z);
      if (y < 1.5 || Math.hypot(x, z) > 120 || PRIMS.some((p) => inPrim(p, x, z, 1.2)) || BLOCKS.some((b) => (Array.isArray(b) ? x > b[0] - 1 && x < b[1] + 1 && z > b[2] - 1 && z < b[3] + 1 : Math.hypot(x - b.c[0], z - b.c[1]) < b.r + 1))) continue;
      const s = 0.6 + rnd() * 1.1, m = mat4(x, y - 0.15, z, rnd() * 6, 0, 0, s, s * (0.8 + rnd() * 0.5), s);
      (rnd() < 0.72 ? sm : rm).push(m);
    }
    for (const [b, list, mat] of [[sh, sm, M.leaf], [rk, rm, M.stone]]) { const im = new THREE.InstancedMesh(b.geometry(), mat, list.length); list.forEach((m, i) => im.setMatrixAt(i, m)); im.castShadow = false; im.receiveShadow = true; im.computeBoundingSphere(); add(im); } }

  const mats = { stone: M.stone, cobble: M.cobble, wood: M.wood, roof: M.roof, plaster: M.plaster, cloth: M.cloth, metal: M.metal, leaf: M.leaf, glass: M.glass, glow: M.glow };
  for (const [k, b] of Object.entries(buckets)) if (b.count) add(b.mesh(mats[k], { shadow: k !== 'glow' && k !== 'glass' }));
  for (const [k, b] of Object.entries(B.outerSet)) if (b.count) add(b.mesh(mats[k], { shadow: false }));
  // instanced props
  const protos = {
    crate: (() => { const b = new Bucket('crate', { s: 1 }); b.add(new THREE.BoxGeometry(1, 1, 1), null, col(0xa08060)); for (const [w, h, d] of [[1.04, 0.12, 1.04], [0.12, 1.04, 1.04], [1.04, 1.04, 0.12]]) for (const s of [-1, 1]) b.add(new THREE.BoxGeometry(w, h, d), mat4(w < 0.5 ? s * 0.47 : 0, h < 0.5 ? s * 0.47 : 0, d < 0.5 ? s * 0.47 : 0), col(0x6a4a30)); return b.geometry(); })(),
    barrel: (() => { const b = new Bucket('barrel', { s: 1 }); const lg = new THREE.LatheGeometry([[0.0, 0], [0.34, 0], [0.42, 0.25], [0.42, 0.75], [0.34, 1.0], [0.0, 1.0]].map(([r, h]) => new THREE.Vector2(r, h)), 9); b.add(lg, null, col(0x8a6040), { uv: 'fn', uvFn: (p) => [Math.atan2(p.x, p.z) * 0.6, p.y] }); for (const h of [0.15, 0.85]) b.add(new THREE.TorusGeometry(0.4, 0.025, 3, 9).rotateX(Math.PI / 2), mat4(0, h, 0), col(0x2a2826)); return b.geometry(); })(),
    sack: (() => { const g = new THREE.SphereGeometry(0.42, 8, 6); g.scale(1, 0.7, 0.8); g.translate(0, 0.28, 0); const b = new Bucket('sack', { s: 1 }); b.add(g, null, col(0xc8b48a)); return b.geometry(); })(),
  };
  const pm = { crate: M.wood, barrel: M.wood, sack: M.plaster };
  for (const [k, list] of Object.entries(B.inst)) {
    if (!list.length || !protos[k]) continue;
    const im = new THREE.InstancedMesh(protos[k], pm[k], list.length); list.forEach((m, i) => im.setMatrixAt(i, m)); im.castShadow = im.receiveShadow = true; im.computeBoundingSphere(); im.name = 'props-' + k; add(im);
  }
  // rigging / bunting / laundry ropes
  { const rp = []; for (const [a, b, sag] of B.ropes) { const n = sag ? 8 : 1; for (let i = 0; i < n; i++) { const t0 = i / n, t1 = (i + 1) / n; const p0 = a.clone().lerp(b, t0), p1 = a.clone().lerp(b, t1); p0.y -= Math.sin(t0 * Math.PI) * sag; p1.y -= Math.sin(t1 * Math.PI) * sag; rp.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z); } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3)); add(new THREE.LineSegments(g, M.rope)); }
  // fountain water
  { const wn = createWaterNormal(THREE, 3, 128); wn.repeat.set(2, 2); const wm = new THREE.MeshStandardMaterial({ color: 0x2f6f6a, roughness: 0.04, metalness: 0.1, normalMap: wn, normalScale: new THREE.Vector2(0.6, 0.6) });
    const w = new THREE.Mesh(new THREE.CircleGeometry(B.water.r, 32).rotateX(-Math.PI / 2), wm); w.position.set(B.water.x, B.water.y, B.water.z); w.receiveShadow = true; add(w); B.fountainTex = wn; }

  // ---- terrain ----
  {
    const R = 250, step = low ? 4 : 3.2, n = Math.round(2 * R / step);
    const g = new THREE.PlaneGeometry(2 * R, 2 * R, n, n); g.rotateX(-Math.PI / 2);
    const P = g.attributes.position; for (let i = 0; i < P.count; i++) P.setY(i, terrainY(P.getX(i), P.getZ(i)));
    g.computeVertexNormals();
    const tm = new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0 });
    tm.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, { tG: { value: TT.grass }, tR: { value: TT.rock }, tD: { value: TT.dirt }, tRN: { value: TT.rockN } });
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vTW; varying vec3 vTN;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvTW = (modelMatrix * vec4(transformed, 1.0)).xyz; vTN = normalize(mat3(modelMatrix) * objectNormal);');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vTW; varying vec3 vTN; uniform sampler2D tG, tR, tD, tRN; vec3 terN;')
        .replace('#include <color_fragment>', `
  vec3 wn = normalize(vTN); vec3 bw = pow(abs(wn), vec3(4.0)); bw /= bw.x + bw.y + bw.z;
  float sc = 0.06;
  vec4 rk = texture2D(tR, vTW.zy * sc) * bw.x + texture2D(tR, vTW.xz * sc) * bw.y + texture2D(tR, vTW.xy * sc) * bw.z;
  vec4 rk2 = texture2D(tR, vTW.zy * sc * 0.27) * bw.x + texture2D(tR, vTW.xz * sc * 0.27) * bw.y + texture2D(tR, vTW.xy * sc * 0.27) * bw.z;
  vec3 rn = (texture2D(tRN, vTW.zy * sc).xyz * 2.0 - 1.0) * bw.x + (texture2D(tRN, vTW.xz * sc).xyz * 2.0 - 1.0) * bw.y + (texture2D(tRN, vTW.xy * sc).xyz * 2.0 - 1.0) * bw.z;
  vec3 gr = mix(texture2D(tG, vTW.xz * 0.16).rgb, texture2D(tG, vTW.xz * 0.037).rgb, 0.45) * vec3(0.9, 1.12, 0.62) * mix(0.75, 1.2, rk2.a);
  vec3 dt = texture2D(tD, vTW.xz * 0.2).rgb;
  float slope = 1.0 - wn.y;
  float rockW = smoothstep(0.38, 0.62, slope + (rk2.a - 0.5) * 0.3);
  float dirtW = smoothstep(0.15, 0.3, slope + (rk.a - 0.5) * 0.3) * (1.0 - rockW);
  vec3 c = mix(gr, dt, dirtW);
  float band = sin((vTW.y + (rk2.a - 0.5) * 14.0) * 0.45) * 0.5 + 0.5;
  vec3 rc = rk.rgb * mix(0.7, 1.2, rk2.a) * mix(vec3(0.95, 0.86, 0.74), vec3(1.15, 1.08, 0.98), band);
  rc = mix(rc, vec3(0.18, 0.24, 0.12), smoothstep(0.55, 0.75, wn.y + rk.a * 0.3) * 0.5);
  c = mix(c, rc, rockW);
  float shore = 1.0 - smoothstep(0.3, 2.4, vTW.y + (rk2.a - 0.5) * 1.5);
  c = mix(c, mix(dt, rk.rgb, 0.5) * vec3(0.8, 0.78, 0.72), shore);
  c *= mix(vec3(1.0), vec3(0.45, 0.62, 0.62), smoothstep(0.0, -3.0, vTW.y));
  diffuseColor.rgb = c;
  terN = normalize(mix(wn, normalize(wn + rn * 0.55), rockW * 0.7 + 0.15));`)
        .replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(terN, 0.0)).xyz);');
    };
    tm.customProgramCacheKey = () => 'town-terrain';
    const m = new THREE.Mesh(g, tm); m.receiveShadow = true; m.castShadow = false; m.name = 'town-terrain'; add(m);
  }
  add(createMountains(THREE, 3331, TT));
  // ---- forest: instanced pines on the hills, headland and clifftops ----
  {
    const b = new Bucket('pine', { s: 2 });
    b.add(new THREE.CylinderGeometry(0.15, 0.3, 3, 5), mat4(0, 1.5, 0), col(0x4a3426));
    [[2.4, 4.2, 2.6], [1.8, 3.4, 4.6], [1.1, 2.8, 6.4]].forEach(([r, h, y], i) => b.add(new THREE.ConeGeometry(r, h, 7, 1), mat4(0, y, 0, i), null, { colFn: (lx, ly) => col(0x24442a).map((v) => v * (0.75 + 0.35 * (ly / h + 0.5))) }));
    const geo = b.geometry(), ms = [], N2 = makeNoise2D(5);
    const target = low ? 600 : 950;
    for (let i = 0; i < target * 6 && ms.length < target; i++) {
      const a = rnd() * Math.PI * 2, r = 40 + Math.sqrt(rnd()) * 200, x = Math.cos(a) * r, z = Math.sin(a) * r;
      const y = terrainY(x, z); if (y < 4) continue;
      if (PRIMS.some((p) => inPrim(p, x, z, 6))) continue;
      if (Math.hypot(x, z) < 75 && z < 60) continue;
      if (N2.fbm(x * 0.02, z * 0.02, 3) < -0.15) continue;
      const s = 0.8 + rnd() * 0.9; ms.push(mat4(x, y - 0.4, z, rnd() * 6, (rnd() - 0.5) * 0.08, 0, s, s * (0.9 + rnd() * 0.3), s));
    }
    const im = new THREE.InstancedMesh(geo, M.leaf, ms.length); ms.forEach((m, i) => im.setMatrixAt(i, m)); im.castShadow = false; im.receiveShadow = true; im.computeBoundingSphere(); im.name = 'forest'; add(im);
  }

  // ---- harbour ----
  const sea = createSea(scene, terrainY, shared, low); added.push(sea);
  const falls = createWaterfall(scene, terrainY, shared, low);
  const ships = [
    Object.assign(createShip(M, { L: 34, Bm: 9, seed: 3, paint: 0x1f6f8a, flag: 0x1f3f78 }, low), { pos: [11, -66, Math.PI], ph: 0 }),
    Object.assign(createShip(M, { L: 27, Bm: 7.4, seed: 8, paint: 0x8a2f2a, flag: 0xc89a40 }, low), { pos: [-45, -64, Math.PI + 0.04], ph: 1.7 }),
    Object.assign(createShip(M, { L: 36, Bm: 9.5, seed: 12, paint: 0x2a5a4a, flag: 0xb83a30, sails: 'open' }, low), { pos: [-62, -132, 0.55], ph: 3.1 }),
  ];
  for (const s of ships) { s.position.set(s.pos[0], 0, s.pos[1]); s.rotation.y = s.pos[2]; add(s); }
  const crane = createCrane(M, 46, 2.4, -53); crane.rotation.y = -0.5; add(crane);

  // ---- walk data (after all blockers are registered) ----
  const L = L0.finalize();
  const colliders = L.colliders.concat(B.extraCol);
  for (const p of [[-4.5, -81.5], [4.5, -81.5]]) colliders.push({ x: p[0], z: p[1], r: 0.35 });

  // ---- atmosphere ----
  const fountainEm = [0, 1, 2, 3].map((k) => ({ type: 'fountain', x: Math.sin(k * Math.PI / 2 + 0.6) * 1.5, y: 9.4, z: 1 + Math.cos(k * Math.PI / 2 + 0.6) * 1.5, rate: 2 }));
  const fx = createFx(scene, [...B.emit, ...fountainEm], { low, falls });
  const dust = createParticles(THREE, scene, { getHeight: L.getHeight, lowMode: low });
  const gulls = createGulls(scene, shared, low);
  // fixed pool of point lights (never added/removed at runtime)
  const NL = low ? 2 : 4, lights = [];
  const pri = [...B.lights].sort((a, b) => b.i - a.i).slice(0, NL);
  for (const l of pri) { const pl = new THREE.PointLight(l.c, l.i, l.d, 2); pl.position.copy(l.p); pl.userData = l; add(pl); lights.push(pl); }

  // ---- townsfolk ----
  const npcs = createNpcs(game, { getHeight: L.getHeight, walkable: L.walkable, low, colliders, spots: SPOTS, sparks: fx.sparks, anvilTop: B.anvilTop });

  // ---- interactables ----
  const V = (x, z) => new THREE.Vector3(x, L.getHeight(x, z), z);
  const NAMES = { quest: ["Hunters' Guild", 'Guildmistress Ysolde'], smith: ['Forge', 'Master Smith Borrik'], alchemy: ['Alchemy Atelier', 'Alchemist Nerith'], shop: ['Market', 'Merchant Pell'], storage: ['Item Box', 'Quartermaster Iva'], dock: ['Departure Dock', 'Captain Maro'] };
  const interactables = Object.entries(SPOTS).map(([id, s]) => ({ id, name: NAMES[id][0], npc: NAMES[id][1], position: V(s.talk[0], s.talk[1]), radius: 3, npcObject: npcs.objects[id] }));

  // ---- shadow camera follows the hunter (or the fixed debug camera) ----
  const lf = sunDir.clone().negate(), lr = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), lf).normalize(), lu = new THREE.Vector3().crossVectors(lf, lr).normalize();
  const focus = new THREE.Vector3(), tmp = new THREE.Vector3(), fwd = new THREE.Vector3();
  let shr = SHR;
  function followShadow() {
    const fixed = game.cameraRig?.fixed;
    const want = fixed ? (low ? 70 : 85) : SHR;
    if (want !== shr) { shr = want; Object.assign(sun.shadow.camera, { left: -shr, right: shr, top: shr, bottom: -shr }); sun.shadow.camera.updateProjectionMatrix(); }
    camera.getWorldDirection(fwd);
    if (game.player?.position && !fixed) focus.copy(game.player.position); else { focus.copy(camera.position).addScaledVector(fwd, shr * 0.9); focus.y = L.getHeight(focus.x, focus.z); }
    fwd.y = 0; if (fwd.lengthSq() > 1e-4) focus.addScaledVector(fwd.normalize(), shr * 0.35);
    const texel = (2 * shr) / sun.shadow.mapSize.x;
    let u = focus.dot(lr), v = focus.dot(lu); const w = focus.dot(lf);
    u = Math.round(u / texel) * texel; v = Math.round(v / texel) * texel;
    tmp.set(0, 0, 0).addScaledVector(lr, u).addScaledVector(lu, v).addScaledVector(lf, w);
    sun.target.position.copy(tmp); sun.position.copy(tmp).addScaledVector(sunDir, 250); sun.target.updateMatrixWorld();
  }
  followShadow();

  let time = 0;
  function update(dt, rawDt) {
    time += rawDt; shared.uTime.value = time; sky.material.uniforms.uTime.value = time;
    for (const s of ships) { s.position.y = Math.sin(time * 0.55 + s.ph) * 0.14 - 0.05; s.rotation.z = Math.sin(time * 0.42 + s.ph) * 0.018; s.rotation.x = Math.sin(time * 0.35 + s.ph * 2) * 0.008; if (s.pos[1] < -120) { s.position.x = s.pos[0] + Math.sin(time * 0.02) * 6; } }
    crane.rotation.y = -0.5 + Math.sin(time * 0.1) * 0.45;
    const cg = crane.userData.cargo; cg.rotation.x = Math.sin(time * 0.9) * 0.06; cg.rotation.z = Math.cos(time * 0.7) * 0.05;
    for (const pl of lights) { const l = pl.userData, f = l.flicker ? 0.75 + 0.25 * Math.sin(time * 13 + Math.sin(time * 7.3) * 2) : 0.9 + 0.1 * Math.sin(time * 9 + l.p.x); pl.intensity = l.i * f * (tod === 'dusk' ? 1.4 : 1); }
    if (B.fountainTex) B.fountainTex.offset.set(time * 0.03, time * 0.02);
    npcs.update(dt > 0 ? dt : rawDt);
    fx.update(rawDt, camera, renderer);
    dust.update(rawDt, camera, renderer);
    gulls.update(time);
    followShadow();
  }

  return {
    update,
    getHeight: L.getHeight,
    getNormal(x, z) { const e = 0.35, h = L.getHeight; return new THREE.Vector3(h(x - e, z) - h(x + e, z), 2 * e, h(x, z - e) - h(x, z + e)).normalize(); },
    bounds: { radius: 95 },
    sun, colliders, interactables,
    spawn: { player: V(0, -9), monster: new THREE.Vector3(0, 0, -260) },
    spawnDust: dust.spawnDust, spawnSplash: dust.spawnSplash,
    sunDirection: sunDir.clone(), waterLevel: 0, walkable: L.walkable, tod, low,
    stats: { npcs: npcs.count, fillerHouses: B.fillerCount },
    dispose() {
      for (const o of added) { scene.remove(o); o.traverse?.((c) => { c.geometry?.dispose?.(); }); }
      scene.remove(npcs.mesh); for (const o of Object.values(npcs.objects)) scene.remove(o);
    },
  };
}

