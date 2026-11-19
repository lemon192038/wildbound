// Gathering on the open island (src/shared/islandGather.js holds the data). Points stream in around the hunter tile by
// tile; each kind has its own instanced look (herb patch, mushroom ring, ore vein, crystal spike, bone pile, firefly
// swarm, deadfall log, relic slab, shell, steaming vent, clay mound). E / touch GATHER picks the nearest one; the server
// re-derives the point, rolls the item and puts it in your item box (islandGather), so nothing is decided here.
import { pointsInTile, GATHER_KINDS } from '../shared/islandGather.js';
import { t, itemName } from '../shared/i18n.js';

const RADIUS = 130, REACH = 2.6, MAX = 90;
export function createIslandGather(game, { expedition }) {
  const { THREE, scene } = game; const F = game.world.island;
  const LOOK = {
    herb: [() => { const g = new THREE.IcosahedronGeometry(0.45, 0); g.scale(1.2, 0.6, 1.2); g.translate(0, 0.3, 0); return g; }, 0x6aa040, 0x203a10],
    mushroom: [() => { const s = new THREE.CylinderGeometry(0.08, 0.1, 0.5, 6); s.translate(0, 0.25, 0); const c = new THREE.SphereGeometry(0.32, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2); c.translate(0, 0.48, 0); return merge([s, c]); }, 0xd06030, 0x601808],
    ore: [() => { const g = new THREE.DodecahedronGeometry(0.6, 0); g.scale(1.2, 0.8, 1); g.translate(0, 0.35, 0); return g; }, 0x7a7a86, 0x302010],
    crystal: [() => { const g = new THREE.OctahedronGeometry(0.4, 0); g.scale(0.6, 1.8, 0.6); g.translate(0, 0.6, 0); return g; }, 0x9ad0ff, 0x204060],
    bones: [() => { const g = new THREE.CylinderGeometry(0.07, 0.09, 1.2, 5); g.rotateZ(Math.PI / 2); g.translate(0, 0.12, 0); return g; }, 0xe0d8c0, 0x201810],
    bugs: [() => { const g = new THREE.IcosahedronGeometry(0.12, 0); g.translate(0, 0.9, 0); return g; }, 0xffd070, 0xff9020],
    wood: [() => { const g = new THREE.CylinderGeometry(0.22, 0.26, 1.8, 7); g.rotateZ(Math.PI / 2); g.translate(0, 0.22, 0); return g; }, 0x5a3a20, 0x100804],
    relic: [() => { const g = new THREE.BoxGeometry(0.8, 1.0, 0.18); g.translate(0, 0.5, 0); return g; }, 0x8a8478, 0x2a2018],
    shell: [() => { const g = new THREE.SphereGeometry(0.35, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2); g.scale(1.3, 0.7, 1); return g; }, 0xe8c8b0, 0x402820],
    vent: [() => { const g = new THREE.ConeGeometry(0.55, 0.6, 7, 1, true); g.translate(0, 0.3, 0); return g; }, 0xd0b040, 0x805010],
    clay: [() => { const g = new THREE.SphereGeometry(0.6, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2); g.scale(1.3, 0.5, 1.3); return g; }, 0xa05030, 0x301008],
  };
  function merge(gs) { const pos = [], idx = []; let off = 0; for (const g of gs) { const ng = g.index ? g : g; const p = ng.attributes.position.array; for (let i = 0; i < p.length; i++) pos.push(p[i]); const ix = ng.index ? ng.index.array : [...Array(p.length / 3).keys()]; for (const i of ix) idx.push(i + off); off += p.length / 3; } const m = new THREE.BufferGeometry(); m.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); m.setIndex(idx); m.computeVertexNormals(); return m; }
  const meshes = {};
  for (const [k, [geo, col, emi]] of Object.entries(LOOK)) {
    const m = new THREE.InstancedMesh(geo(), new THREE.MeshStandardMaterial({ color: col, emissive: emi, emissiveIntensity: 0.6, roughness: 0.8 }), MAX);
    m.count = 0; m.frustumCulled = false; m.name = 'gather-' + k; m.userData.global = true; scene.add(m); meshes[k] = m;
  }
  const tiles = new Map(); const used = {}; let pts = []; let rebuild = true, scanT = 0;
  const stats = { gathered: 0, refused: 0 };
  function scan(P) {
    const tx0 = Math.floor((P.x + F.half) / 64), tz0 = Math.floor((P.z + F.half) / 64); const R = Math.ceil(RADIUS / 64); const want = new Set();
    for (let tz = tz0 - R; tz <= tz0 + R; tz++) for (let tx = tx0 - R; tx <= tx0 + R; tx++) { const k = tz * 1000 + tx; want.add(k); if (!tiles.has(k)) { tiles.set(k, pointsInTile(F, tx, tz).map((p) => ({ ...p, y: game.world.getHeight(p.x, p.z) }))); rebuild = true; } }
    for (const k of [...tiles.keys()]) if (!want.has(k)) { tiles.delete(k); rebuild = true; }
    if (rebuild) { pts = [...tiles.values()].flat().filter((p) => Math.hypot(p.x - P.x, p.z - P.z) < RADIUS); draw(); }
  }
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
  function draw() {
    rebuild = false; const n = {}; for (const k in meshes) n[k] = 0;
    for (const p of pts) { if ((used[p.gid] || 0) >= GATHER_KINDS[p.kind].uses) continue; const m = meshes[p.kind]; if (!m || n[p.kind] >= MAX) continue;
      _q.setFromEuler(_e.set(0, (p.x * 13.1 + p.z * 7.7) % 6.28, 0)); _m.compose(_p.set(p.x, p.y, p.z), _q, _s.setScalar(1)); m.setMatrixAt(n[p.kind]++, _m); }
    for (const k in meshes) { meshes[k].count = n[k]; meshes[k].instanceMatrix.needsUpdate = true; }
  }
  function nearest(P) {
    let best = null, bd = REACH;
    for (const p of pts) { if ((used[p.gid] || 0) >= GATHER_KINDS[p.kind].uses) continue; const d = Math.hypot(p.x - P.x, p.z - P.z); if (d < bd) { bd = d; best = p; } }
    return best;
  }
  // prompt + pick-up feed
  const root = document.getElementById('ui-root') || document.body;
  const prompt = document.createElement('div'); prompt.className = 'cv-prompt'; root.appendChild(prompt);
  const feed = document.createElement('div'); feed.className = 'cv-picks'; root.appendChild(feed);
  const show = (txt, bad) => { const s = document.createElement('span'); s.textContent = txt; if (bad) s.className = 'cv-bad'; feed.appendChild(s); setTimeout(() => s.remove(), 2600); };
  let lock = 0, busy = false;
  async function gather(p) {
    const n = (used[p.gid] || 0); used[p.gid] = n + 1; rebuild = true; lock = performance.now() + 700;
    game.events.emit('sfx', { name: 'click', position: game.player.position.clone(), volume: 0.6 });
    const iid = expedition.iid || game.expeditionIid;
    if (!iid || !game.account?.loggedIn) { stats.refused++; show(t('cv.offline'), true); return; }
    busy = true; const r = await game.account.act('islandGather', { iid, gid: p.gid, use: n }); busy = false;
    if (r.ok) { stats.gathered++; show(`+${r.result.qty} ${itemName(r.result.item)}`); game.events.emit('gather:got', { item: r.result.item, qty: r.result.qty }); }
    else { stats.refused++; if (r.error === 'network') { used[p.gid] = n; rebuild = true; } show(r.message || t('cv.failed'), true); }
  }
  const poll = game.input.poll.bind(game.input);
  game.input.poll = () => {
    const s = poll(); const P = game.player; if (!P || P.dead) return s;
    const tg = nearest(P.position); const locked = performance.now() < lock;
    if (tg && !game.carving?.nearest?.(P.position)) { prompt.style.display = 'block'; prompt.textContent = t('ig.prompt', { k: game.input.touch?.enabled ? '' : 'E · ', w: t('g2.' + tg.kind) }); game.input.touch?.setAction(t('touch.gather')); }
    else if (prompt.style.display !== 'none') { prompt.style.display = 'none'; }
    if (locked) { s.move.x = s.move.y = 0; s.lightAttack = s.heavyAttack = false; }
    if (s.interact && tg && !locked && !busy) { s.interact = false; if (P.weaponDrawn) show(t('qr.sheathe'), true); else gather(tg); }
    return s;
  };
  function update(dt) { if ((scanT -= dt) <= 0 && game.player) { scanT = 0.5; scan(game.player.position); } if (rebuild) draw(); }
  return { update, nearest, stats, get points() { return pts; } };
}
