// Nests and juveniles of the BIG monsters (dragons, Varkhul, Gorvath) on the open island. Small fauna nests live in the
// ecosystem (src/shared/ecosystem.js → fauna.js); big monsters are individuals, so their nests are fixed sites next to
// the parents' homes (lifecycle.js BIG_NESTS). Each nest shows its clutch and has juveniles that use the parent's
// REAL model at a small size (src/monster/models.js).
// Juvenile behaviour (ECOLOGY.md): stays within juvRange of the nest, noses about, freezes and then bolts back to the
// nest — toward the guarding parent — when a hunter comes close; a hurt juvenile calls the parent, which engages the
// hunter. A dead juvenile can be carved once for its remains (carving.js → islandCarve stage 0).
import { BIG_NESTS, LIFE } from '../shared/lifecycle.js';
import { createMonsterModel } from '../monster/models.js';
import { isJa } from '../shared/i18n.js';
import { log } from '../core/log.js';

const NEAR = 160, FAR = 230, TAU = Math.PI * 2;
// the parent's look + loot key per nest home; juvenile size relative to the adult model, HP
const JUV = {
  venom: { model: ['venom', 'flame'], src: 'venom', size: 0.32, hp: 2200, n: 2 }, venom2: { model: ['venom', 'flame'], src: 'venom', size: 0.3, hp: 2000, n: 2 },
  cindaryl: { model: ['cindaryl', 'flame'], src: 'cindaryl', size: 0.3, hp: 2600, n: 2 },
  varkhul: { model: ['varkhul'], src: 'varkhul', size: 0.32, hp: 2400, n: 2 }, brute: { model: ['brute'], src: 'brute', size: 0.3, hp: 2800, n: 1 },
};
const NAME = { dragon: ['Dragon hatchling', '龍の幼体'], varkhul: ['Varkhul hatchling', 'ヴァルクルの幼体'], brute: ['Gorvath hatchling', 'ゴルヴァスの幼体'] };

export function createBroods(game, homes) {
  const { THREE } = game; const W = game.world, F = W.island;
  const nests = []; const list = []; let nextId = 1;
  for (const N of BIG_NESTS) {
    const H = homes.find((h) => h.id === N.home); if (!H) continue;
    const site = F.findSite(H.home[0] + N.off[0], H.home[1] + N.off[1], { flatR: 6, maxSlope: 0.35 });
    nests.push({ ...N, x: site[0], z: site[1], y: W.getHeight(site[0], site[1]), eggs: N.eggs, juvs: [], spawned: false, loading: false, parentId: N.home === 'venom2' ? 'venom2' : N.home });
  }
  // nest props: a ring of scorched rocks + the clutch (eggs scale with the lineage)
  const eggMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.5, 12, 9).scale(1, 1.35, 1), new THREE.MeshStandardMaterial({ color: 0xc9b89a, roughness: 0.45, emissive: 0x40180a, emissiveIntensity: 0.5 }), 24);
  const ringMesh = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.6, 0), new THREE.MeshStandardMaterial({ color: 0x2a221e, roughness: 0.95, flatShading: true }), nests.length * 12);
  for (const m of [eggMesh, ringMesh]) { m.frustumCulled = false; m.userData.global = true; m.castShadow = true; game.scene.add(m); }
  eggMesh.name = 'brood-eggs'; ringMesh.name = 'brood-nests';
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Euler();
  const eggSize = (N) => (N.lineage === 'dragon' ? 0.75 : 0.65);
  function drawProps() {
    let e = 0, r = 0;
    for (const N of nests) {
      for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; _q.setFromEuler(_e.set(i, i * 2, 0)); _m.compose(_p.set(N.x + Math.cos(a) * 2.6, N.y + 0.2, N.z + Math.sin(a) * 2.6), _q, _s.set(1.1, 0.7, 1.1)); ringMesh.setMatrixAt(r++, _m); }
      for (let i = 0; i < N.eggs && e < 24; i++) { const a = (i / Math.max(1, N.eggs)) * TAU + 0.4; const k = eggSize(N); _q.setFromEuler(_e.set(0.15, a, 0.1)); _m.compose(_p.set(N.x + Math.cos(a) * 0.7, N.y + 0.55 * k, N.z + Math.sin(a) * 0.7), _q, _s.setScalar(k)); eggMesh.setMatrixAt(e++, _m); }
    }
    eggMesh.count = e; ringMesh.count = r; eggMesh.instanceMatrix.needsUpdate = ringMesh.instanceMatrix.needsUpdate = true;
  }
  drawProps();

  async function spawnJuveniles(N) {
    N.loading = true; const J = JUV[N.home] || JUV.venom;
    for (let i = 0; i < J.n - (N.killed || 0); i++) { // the dead stay dead this session
      try {
        const modelId = J.model[i % J.model.length]; const model = await createMonsterModel(modelId, { size: J.size });
        const a = rnd() * TAU, x = N.x + Math.cos(a) * 4, z = N.z + Math.sin(a) * 4;
        const c = makeJuvenile(N, J, model, x, z); game.scene.add(model.root); N.juvs.push(c); list.push(c);
      } catch (e) { log.error('brood', `juvenile model failed: ${e.message}`, e); }
    }
    N.spawned = true; N.loading = false;
  }
  let seed = 9173; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  function makeJuvenile(N, J, model, x, z) {
    const nm = NAME[N.lineage] || NAME.dragon;
    const c = {
      id: nextId++, isBrood: true, isFauna: true, sp: 'brood_' + N.lineage, kind: J.src, src: J.src, lineage: N.lineage, stage: 0, nest: N, model,
      name: isJa() ? nm[1] : nm[0], pos: new THREE.Vector3(x, W.getHeight(x, z), z), yaw: rnd() * TAU, hp: J.hp, maxHp: J.hp, scale: J.size * (N.lineage === 'dragon' ? 8 : 6),
      ai: 'nose', t: 0, dead: false, corpseT: 0, speed: 0, target: null, parts: [{ name: 'body', hp: 99999, hitzone: 1.1, broken: false }], flash: 0,
    };
    Object.defineProperty(c, 'position', { get() { return c.pos; } });
    Object.defineProperty(c, 'state', { get() { return c.dead ? 'dead' : c.ai; } });
    c.getHitboxes = () => (c.dead ? [] : [{ part: 'body', sphere: new THREE.Sphere(new THREE.Vector3(c.pos.x, c.pos.y + model.height * 0.5, c.pos.z), Math.max(0.8, model.height * 0.55)) }]);
    c.receiveHit = ({ damage = 0, part = 'body' } = {}) => {
      if (c.dead) return { damage: 0, part }; const dealt = Math.max(1, Math.round(damage * 0.9)); c.hp -= dealt; c.flash = 1; c.ai = 'bolt'; c.t = 0;
      callParent(N); if (c.hp <= 0) die(c); return { damage: dealt, part, killed: c.dead };
    };
    return c;
  }
  // the nest's owner and its mate (user request: hypersensitive to egg theft) come for the thief from far away (400 m);
  // other big monsters of the lineage do not care about someone else's clutch
  function callParent(N) {
    const P = game.player; if (!P || P.unseen) return;
    const owner = N.home, mate = homes.find((h) => h.id === owner)?.mate;
    for (const m of game.monsters || []) {
      if (m.state === 'dead') continue; const id = m.islandId || m.kind; if (id !== owner && id !== mate) continue;
      if (Math.hypot(m.position.x - N.x, m.position.z - N.z) > 400) continue;
      m.rival = null; m.perception?.engage?.(P); m.aggro = true; m.target = P; m.guardNest = N; m.wander = null; game.events?.emit?.('brood:alarm', { monster: m, nest: N.id });
    }
  }
  function die(c) {
    c.dead = true; c.hp = 0; c.ai = 'dead'; c.corpseT = 300; c.model.root.rotation.z = 1.4; c.nest.killed = (c.nest.killed || 0) + 1;
    game.events?.emit?.('fauna:died', { creature: c, species: c.sp, cause: 'hunted', by: game.player });
  }

  function think(c, dt) {
    const N = c.nest, P = game.player; c.t += dt; c.flash = Math.max(0, c.flash - dt * 4);
    const dH = P && !P.dead && !P.unseen ? Math.hypot(P.position.x - c.pos.x, P.position.z - c.pos.z) : Infinity;
    const dN = Math.hypot(c.pos.x - N.x, c.pos.z - N.z); const R = LIFE[N.lineage].juvRange;
    let tx = null, tz = null, sp = 0;
    if (c.ai === 'bolt' || dH < 10) { // run back to the nest, then past it, away from the hunter
      if (c.ai !== 'bolt') { c.ai = 'bolt'; c.t = 0; } const ax = c.pos.x - (P?.position.x ?? c.pos.x), az = c.pos.z - (P?.position.z ?? c.pos.z), al = Math.hypot(ax, az) || 1;
      tx = N.x + (ax / al) * R * 0.8; tz = N.z + (az / al) * R * 0.8; sp = 5.5; if (c.t > 6 && dH > 16) { c.ai = 'nose'; c.t = 0; }
    } else if (dH < 22) { c.ai = 'freeze'; sp = 0; if (P) c.yaw += Math.atan2(Math.sin(Math.atan2(P.position.x - c.pos.x, P.position.z - c.pos.z) - c.yaw), Math.cos(Math.atan2(P.position.x - c.pos.x, P.position.z - c.pos.z) - c.yaw)) * Math.min(1, dt * 3); }
    else { // nosing about the nest (never beyond juvRange)
      c.ai = 'nose'; if (!c.target || c.t > 6) { const a = rnd() * TAU, r = rnd() * R * 0.9; c.target = [N.x + Math.cos(a) * r, N.z + Math.sin(a) * r]; c.t = 0; }
      [tx, tz] = c.target; sp = dN > R ? 2.5 : 1.2;
    }
    if (tx != null) {
      const dx = tx - c.pos.x, dz = tz - c.pos.z, d = Math.hypot(dx, dz);
      if (d > 0.4) { const want = Math.atan2(dx, dz); c.yaw += Math.atan2(Math.sin(want - c.yaw), Math.cos(want - c.yaw)) * Math.min(1, dt * 4); const st = Math.min(d, sp * dt); const nx = c.pos.x + Math.sin(c.yaw) * st, nz = c.pos.z + Math.cos(c.yaw) * st; if (!W.lavaAt?.(nx, nz) && (!W.canWalk || W.canWalk(nx, nz))) { c.pos.x = nx; c.pos.z = nz; } c.speed = sp; } else c.speed = 0;
    } else c.speed = 0;
    c.pos.y = W.getHeight(c.pos.x, c.pos.z);
  }

  function update(dt) {
    const P = game.player?.position; if (!P) return;
    for (const N of nests) {
      const d = Math.hypot(P.x - N.x, P.z - N.z);
      if (!N.spawned && !N.loading && d < NEAR) spawnJuveniles(N);
      if (N.spawned && d > FAR) { for (const c of N.juvs) { game.scene.remove(c.model.root); const i = list.indexOf(c); if (i >= 0) list.splice(i, 1); } N.juvs = N.juvs.filter((c) => c.dead && c.corpseT > 0); N.spawned = false; } // live ones go back to the nest (they were never lost); dead ones stay dead this session
    }
    for (const c of list) {
      if (c.dead) { c.corpseT -= dt; if (c.corpseT <= 0) { game.scene.remove(c.model.root); c.model.root.visible = false; } }
      else think(c, dt);
      c.model.root.position.copy(c.pos); c.model.root.rotation.y = c.yaw; if (!c.dead) c.model.update(dt, { speed: c.speed });
    }
  }
  function near(p, r) { return list.filter((c) => !c.dead && Math.hypot(c.pos.x - p.x, c.pos.z - p.z) < r); }
  function eggTaken(N) { N.eggs = Math.max(0, N.eggs - 1); drawProps(); callParent(N); for (const c of N.juvs) if (!c.dead) { c.ai = 'bolt'; c.t = 0; } }
  return { update, near, nests, list, eggTaken, stats: () => ({ nests: nests.length, juveniles: list.filter((c) => !c.dead).length }) };
}
